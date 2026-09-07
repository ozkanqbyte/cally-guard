"""
Cally AI Guard — voice-fingerprint service.

What it does
------------
1. Watches the `guard_recordings` Firestore collection. For every recorded scam
   call it hasn't seen, it downloads the caller audio, makes a 192-d speaker
   embedding (ECAPA-TDNN / SpeechBrain), and compares it against every voiceprint
   it already has.
2. Greedily clusters "same voice" calls: a new print that matches an existing one
   above VP_JOIN joins that print's cluster, otherwise it starts a new cluster.
   A cluster = one suspected scammer / call-center agent, across any number of
   phone numbers.
3. Writes back:
     guard_voiceprints/{callId}      the vector + its cluster + top matches
     guard_voice_clusters/{clusterId} rolled-up: size, callIds, numbers, types
     guard_recordings/{callId}        voiceClusterId / voiceMatchCount / voiceMatches
4. Answers POST /match for the worker: "is this live caller a known voice?"

Privacy: only the embedding is stored long-term. The raw WAV keeps its existing
30-day lifecycle and is never copied here.
"""

import io
import os
import threading
import time
import uuid
from math import gcd
from typing import Optional

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

import firebase_admin
from firebase_admin import credentials, firestore, storage

# ── config ──────────────────────────────────────────────────────────────────
SA_PATH = os.environ.get("FIREBASE_SA", "/app/firebase-service-account.json")
BUCKET = os.environ.get(
    "FIREBASE_STORAGE_BUCKET", "callypro-fcc43.firebasestorage.app"
)
VP_JOIN = float(os.environ.get("VP_JOIN", "0.55"))   # cosine to treat as same voice
VP_MATCH = float(os.environ.get("VP_MATCH", "0.45"))  # cosine worth showing at all
VP_MAX_SEC = int(os.environ.get("VP_MAX_SEC", "25"))
VP_POLL_SEC = int(os.environ.get("VP_POLL_SEC", "60"))
TARGET_SR = 16000
EMB_DIM = 192

# ── firebase ────────────────────────────────────────────────────────────────
if not firebase_admin._apps:
    firebase_admin.initialize_app(
        credentials.Certificate(SA_PATH), {"storageBucket": BUCKET}
    )
db = firestore.client()
bucket = storage.bucket()

# ── model ───────────────────────────────────────────────────────────────────
import torch  # noqa: E402
from speechbrain.inference.speaker import EncoderClassifier  # noqa: E402

torch.set_num_threads(2)
_model = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb",
    savedir="/app/model",
    run_opts={"device": "cpu"},
)
_model.eval()

# ── in-memory index ─────────────────────────────────────────────────────────
_lock = threading.Lock()
_ids: list[str] = []
_mat = np.zeros((0, EMB_DIM), dtype=np.float32)
_cluster_of: dict[str, str] = {}


def _l2(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    return v / n if n > 1e-9 else v


def _trim_voiced(x: np.ndarray, sr: int) -> np.ndarray:
    """Energy-gate: drop near-silent frames, cap length. Falls back to the whole
    clip if the gate leaves too little."""
    fl = int(0.03 * sr)
    if len(x) < fl:
        return x
    n = len(x) // fl
    frames = x[: n * fl].reshape(n, fl)
    e = (frames ** 2).mean(axis=1)
    thr = max(float(e.mean()) * 0.35, 1e-7)
    kept = frames[e > thr].reshape(-1)
    if len(kept) < sr:  # < 1 s of speech kept — use everything instead
        kept = x
    return kept[: VP_MAX_SEC * sr]


def embed_wav_bytes(raw: bytes) -> np.ndarray:
    data, sr = sf.read(io.BytesIO(raw), dtype="float32", always_2d=True)
    x = data.mean(axis=1)
    if int(sr) != TARGET_SR:
        g = gcd(int(sr), TARGET_SR)
        x = resample_poly(x, TARGET_SR // g, int(sr) // g).astype(np.float32)
    x = _trim_voiced(x, TARGET_SR)
    if len(x) < TARGET_SR:  # < 1 s
        raise ValueError("too little speech in clip")
    with torch.no_grad():
        emb = (
            _model.encode_batch(torch.from_numpy(x).unsqueeze(0))
            .squeeze()
            .cpu()
            .numpy()
            .astype(np.float32)
        )
    return _l2(emb)


def match(vec: np.ndarray, exclude: Optional[str] = None):
    with _lock:
        if _mat.shape[0] == 0:
            return []
        sims = _mat @ vec
        order = np.argsort(-sims)[:12]
        out = []
        for i in order:
            cid = _ids[i]
            if cid == exclude:
                continue
            out.append((cid, float(sims[i])))
    return out


def _add_to_index(call_id: str, vec: np.ndarray, cluster_id: str) -> None:
    global _mat
    with _lock:
        _ids.append(call_id)
        _mat = (
            np.vstack([_mat, vec[None, :]]) if _mat.shape[0] else vec[None, :].copy()
        )
        _cluster_of[call_id] = cluster_id


def _new_cluster_id() -> str:
    return "vc_" + uuid.uuid4().hex[:10]


def _number_from_call_id(call_id: str) -> str:
    # guard-_905072406390_WB6qfjAT5FqL-3258560  ->  905072406390
    import re

    m = re.search(r"_(\d{7,})_", call_id)
    return m.group(1) if m else ""


def _update_cluster(cluster_id: str, call_id: str, rec: dict) -> None:
    ref = db.collection("guard_voice_clusters").document(cluster_id)
    snap = ref.get()
    num = _number_from_call_id(call_id)
    reasons = rec.get("reasons") or []
    if snap.exists:
        c = snap.to_dict() or {}
        ids = set(c.get("callIds", [])) | {call_id}
        nums = set(c.get("numbers", []))
        if num:
            nums.add(num)
        types = set(c.get("scamTypes", [])) | set(reasons)
        ref.set(
            {
                "size": len(ids),
                "callIds": sorted(ids),
                "numbers": sorted(nums),
                "scamTypes": sorted(types),
                "lastSeen": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    else:
        ref.set(
            {
                "clusterId": cluster_id,
                "size": 1,
                "callIds": [call_id],
                "numbers": [num] if num else [],
                "scamTypes": reasons,
                "label": "",
                "firstSeen": firestore.SERVER_TIMESTAMP,
                "lastSeen": firestore.SERVER_TIMESTAMP,
            }
        )


def process_recording(doc) -> None:
    call_id = doc.id
    d = doc.to_dict() or {}
    audio_path = d.get("audioPath")
    if not audio_path:
        raise ValueError("no audioPath on recording")

    raw = bucket.blob(audio_path).download_as_bytes()
    vec = embed_wav_bytes(raw)

    matches = match(vec, exclude=call_id)
    best = matches[0] if matches else None
    if best and best[1] >= VP_JOIN:
        cluster_id = _cluster_of.get(best[0]) or _new_cluster_id()
    else:
        cluster_id = _new_cluster_id()

    top = [
        {"callId": c, "score": round(s, 3)} for c, s in matches if s >= VP_MATCH
    ][:5]

    db.collection("guard_voiceprints").document(call_id).set(
        {
            "callId": call_id,
            "at": d.get("at"),
            "risk": d.get("risk"),
            "band": d.get("band"),
            "reasons": d.get("reasons", []),
            "number": _number_from_call_id(call_id),
            "dim": int(vec.shape[0]),
            "vec": vec.tolist(),
            "clusterId": cluster_id,
            "matchCount": len(top),
            "topMatches": top,
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
    )
    _add_to_index(call_id, vec, cluster_id)
    _update_cluster(cluster_id, call_id, d)

    db.collection("guard_recordings").document(call_id).set(
        {
            "voiceClusterId": cluster_id,
            "voiceMatchCount": len(top),
            "voiceMatches": top,
            "voiceprintDone": True,
        },
        merge=True,
    )
    print(f"[vp] {call_id} -> cluster {cluster_id} ({len(top)} matches)")


def load_index() -> None:
    global _mat, _ids
    ids, vecs = [], []
    for doc in db.collection("guard_voiceprints").stream():
        d = doc.to_dict() or {}
        v = d.get("vec")
        if not v:
            continue
        ids.append(doc.id)
        vecs.append(np.asarray(v, dtype=np.float32))
        _cluster_of[doc.id] = d.get("clusterId", "")
    with _lock:
        _ids = ids
        _mat = np.vstack(vecs) if vecs else np.zeros((0, EMB_DIM), np.float32)
    print(f"[vp] index loaded: {len(ids)} voiceprints")


def backfill_loop() -> None:
    try:
        load_index()
    except Exception as e:  # noqa: BLE001
        print("[vp] index load failed:", e)
    while True:
        try:
            for doc in db.collection("guard_recordings").limit(300).stream():
                d = doc.to_dict() or {}
                if d.get("voiceprintDone"):
                    continue
                if not d.get("audioPath"):
                    continue
                try:
                    process_recording(doc)
                except Exception as e:  # noqa: BLE001
                    print(f"[vp] fail {doc.id}: {e}")
                    db.collection("guard_recordings").document(doc.id).set(
                        {"voiceprintDone": True, "voiceprintError": str(e)[:200]},
                        merge=True,
                    )
        except Exception as e:  # noqa: BLE001
            print("[vp] backfill loop error:", e)
        time.sleep(VP_POLL_SEC)


# ── api ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="Cally Guard — voiceprint")


@app.on_event("startup")
def _startup() -> None:
    threading.Thread(target=backfill_loop, daemon=True).start()


@app.get("/health")
def health():
    return {
        "ok": True,
        "prints": len(_ids),
        "clusters": len(set(_cluster_of.values())),
        "join": VP_JOIN,
        "match": VP_MATCH,
    }


@app.post("/match")
async def match_ep(
    file: Optional[UploadFile] = File(default=None),
    gcs_path: Optional[str] = Form(default=None),
):
    try:
        if gcs_path:
            raw = bucket.blob(gcs_path).download_as_bytes()
        elif file is not None:
            raw = await file.read()
        else:
            return JSONResponse({"error": "no audio"}, status_code=400)

        vec = embed_wav_bytes(raw)
        m = match(vec)
        strong = [x for x in m if x[1] >= VP_MATCH]
        known = bool(strong and strong[0][1] >= VP_JOIN)

        cluster_id = _cluster_of.get(strong[0][0]) if strong else None
        cluster_size = 0
        if cluster_id:
            cs = db.collection("guard_voice_clusters").document(cluster_id).get()
            cluster_size = (cs.to_dict() or {}).get("size", 0) if cs.exists else 0

        return {
            "known": known,
            "bestScore": round(strong[0][1], 3) if strong else 0.0,
            "clusterId": cluster_id,
            "clusterSize": cluster_size,
            "matches": [
                {"callId": c, "score": round(s, 3)} for c, s in strong[:5]
            ],
        }
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/reindex")
def reindex():
    load_index()
    return {"ok": True, "prints": len(_ids)}
