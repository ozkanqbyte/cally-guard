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
5. Executes admin curation queued in `guard_voice_ops` (merge / split / delete)
   and re-reads its thresholds from `guard_config/voiceprint` on every poll, so
   the admin panel can tune the matcher and fix bad clusters without a redeploy.

Speaker embeddings model voice *timbre*, not words — the matcher is fully
language-independent and works for callers in any language.

Privacy: only the embedding is stored long-term. The raw WAV keeps its existing
30-day lifecycle and is never copied here.
"""

import io
import os
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from math import gcd
from typing import Optional

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

import firebase_admin
from firebase_admin import credentials, firestore, storage

# ── config (env defaults; guard_config/voiceprint overrides at runtime) ──────
SA_PATH = os.environ.get("FIREBASE_SA", "/app/firebase-service-account.json")
BUCKET = os.environ.get(
    "FIREBASE_STORAGE_BUCKET", "callypro-fcc43.firebasestorage.app"
)
VP_JOIN = float(os.environ.get("VP_JOIN", "0.55"))   # cosine to treat as same voice
VP_MATCH = float(os.environ.get("VP_MATCH", "0.45"))  # cosine worth showing at all
VP_MIN_CLUSTER_PUSH = int(os.environ.get("VP_MIN_CLUSTER_PUSH", "2"))  # size to warn the user
VP_FLAG_MIN_SIZE = int(os.environ.get("VP_FLAG_MIN_SIZE", "3"))  # cluster size to flag its numbers at ring time
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
    m = re.search(r"_(\d{7,})_", call_id)
    return m.group(1) if m else ""


# ── runtime config ──────────────────────────────────────────────────────────
def _load_config() -> None:
    """Pull admin-tuned thresholds from guard_config/voiceprint. Values are
    range-checked; anything missing / silly keeps the current value."""
    global VP_JOIN, VP_MATCH, VP_MIN_CLUSTER_PUSH
    try:
        snap = db.collection("guard_config").document("voiceprint").get()
    except Exception as e:  # noqa: BLE001
        print("[vp] config read failed:", e)
        return
    if not snap.exists:
        return
    c = snap.to_dict() or {}
    j, m, mc = c.get("join"), c.get("match"), c.get("minClusterForPush")
    if isinstance(j, (int, float)) and 0.30 <= float(j) <= 0.90:
        VP_JOIN = float(j)
    if isinstance(m, (int, float)) and 0.25 <= float(m) <= 0.90:
        VP_MATCH = float(m)
    VP_MATCH = min(VP_MATCH, VP_JOIN)
    if isinstance(mc, (int, float)) and 1 <= int(mc) <= 50:
        VP_MIN_CLUSTER_PUSH = int(mc)


# ── cluster docs ────────────────────────────────────────────────────────────
def _cluster_ref(cluster_id: str):
    return db.collection("guard_voice_clusters").document(cluster_id)


def _update_cluster(cluster_id: str, call_id: str, rec: dict) -> None:
    """Incremental roll-up used by the live backfill (one new call at a time)."""
    ref = _cluster_ref(cluster_id)
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
                "verified": False,
                "firstSeen": firestore.SERVER_TIMESTAMP,
                "lastSeen": firestore.SERVER_TIMESTAMP,
            }
        )


def _write_cluster(
    cluster_id: str,
    call_ids,
    preserve: dict,
    extra_first=None,
    extra_last=None,
) -> None:
    """Full rebuild of a cluster doc from its member voiceprints. Used by the
    curation ops (merge / split / delete-orphan) where the membership changed
    wholesale."""
    call_ids = sorted(set(call_ids))
    nums, types, ats = set(), set(), []
    for cid in call_ids:
        s = db.collection("guard_voiceprints").document(cid).get()
        if not s.exists:
            continue
        d = s.to_dict() or {}
        if d.get("number"):
            nums.add(d["number"])
        for r in (d.get("reasons") or []):
            types.add(r)
        a = d.get("at")
        if isinstance(a, (int, float)):
            ats.append(float(a))

    body = {
        "clusterId": cluster_id,
        "size": len(call_ids),
        "callIds": call_ids,
        "numbers": sorted(nums),
        "scamTypes": sorted(types),
        "label": preserve.get("label", "") or "",
        "verified": bool(preserve.get("verified", False)),
        "rebuiltAt": firestore.SERVER_TIMESTAMP,
    }
    if preserve.get("mergedFrom"):
        body["mergedFrom"] = preserve["mergedFrom"]
    if preserve.get("notes"):
        body["notes"] = preserve["notes"]

    firsts = [datetime.fromtimestamp(min(ats) / 1000, tz=timezone.utc)] if ats else []
    lasts = [datetime.fromtimestamp(max(ats) / 1000, tz=timezone.utc)] if ats else []
    firsts += [x for x in (extra_first or []) if x is not None]
    lasts += [x for x in (extra_last or []) if x is not None]
    if firsts:
        body["firstSeen"] = min(firsts)
    if lasts:
        body["lastSeen"] = max(lasts)

    _cluster_ref(cluster_id).set(body, merge=True)


def _chunked_reassign(call_ids, cluster_id: str) -> None:
    ids = list(dict.fromkeys(call_ids))
    for i in range(0, len(ids), 150):
        batch = db.batch()
        for cid in ids[i:i + 150]:
            batch.set(
                db.collection("guard_voiceprints").document(cid),
                {"clusterId": cluster_id},
                merge=True,
            )
            batch.set(
                db.collection("guard_recordings").document(cid),
                {"voiceClusterId": cluster_id},
                merge=True,
            )
        batch.commit()


# ── curation ops (queued by the admin panel in guard_voice_ops) ─────────────
def _op_merge(cluster_ids) -> dict:
    cluster_ids = [c for c in dict.fromkeys(cluster_ids) if c]
    if len(cluster_ids) < 2:
        raise ValueError("merge needs >= 2 clusters")
    snaps: dict[str, dict] = {}
    for c in cluster_ids:
        s = _cluster_ref(c).get()
        if s.exists:
            snaps[c] = s.to_dict() or {}
    if len(snaps) < 2:
        raise ValueError("merge: fewer than 2 of those clusters still exist")

    target = sorted(snaps.keys(), key=lambda c: (-int(snaps[c].get("size", 0)), c))[0]
    all_calls: set[str] = set()
    verified = False
    labels: list[str] = []
    firsts, lasts = [], []
    for c, d in snaps.items():
        all_calls |= set(d.get("callIds", []))
        verified = verified or bool(d.get("verified"))
        if d.get("label"):
            labels.append(d["label"])
        if d.get("firstSeen"):
            firsts.append(d["firstSeen"])
        if d.get("lastSeen"):
            lasts.append(d["lastSeen"])

    _chunked_reassign(all_calls, target)
    preserve = {
        "label": snaps[target].get("label") or (labels[0] if labels else ""),
        "verified": verified,
        "notes": snaps[target].get("notes"),
        "mergedFrom": sorted(set(snaps.keys()) - {target}),
    }
    _write_cluster(target, all_calls, preserve, firsts, lasts)
    for c in snaps:
        if c != target:
            _cluster_ref(c).delete()
    return {"target": target, "calls": len(all_calls), "absorbed": len(snaps) - 1}


def _op_split(cluster_id: str, move_calls) -> dict:
    src = _cluster_ref(cluster_id).get()
    if not src.exists:
        raise ValueError("split: cluster no longer exists")
    sd = src.to_dict() or {}
    members = set(sd.get("callIds", []))
    move = set(move_calls) & members
    if not move:
        raise ValueError("split: none of those calls are in this cluster")
    if len(move) >= len(members):
        raise ValueError("split: that is every call — nothing left behind")

    new_id = _new_cluster_id()
    _chunked_reassign(move, new_id)
    remain = members - move
    _write_cluster(
        cluster_id, remain,
        {"label": sd.get("label", ""), "verified": sd.get("verified", False),
         "notes": sd.get("notes")},
        [sd.get("firstSeen")], [sd.get("lastSeen")],
    )
    _write_cluster(new_id, move, {"label": "", "verified": False})
    return {"newCluster": new_id, "moved": len(move), "kept": len(remain)}


def _op_delete(cluster_id: str, mode: str) -> dict:
    src = _cluster_ref(cluster_id).get()
    if not src.exists:
        raise ValueError("delete: cluster no longer exists")
    members = list((src.to_dict() or {}).get("callIds", []))

    if mode == "purge":
        for cid in members:
            db.collection("guard_voiceprints").document(cid).delete()
            db.collection("guard_recordings").document(cid).set(
                {
                    "voiceClusterId": firestore.DELETE_FIELD,
                    "voiceMatchCount": firestore.DELETE_FIELD,
                    "voiceMatches": firestore.DELETE_FIELD,
                    "voiceprintPurged": True,
                },
                merge=True,
            )
        _cluster_ref(cluster_id).delete()
        return {"purged": len(members)}

    # orphan: every call becomes its own fresh singleton cluster
    for cid in members:
        nid = _new_cluster_id()
        db.collection("guard_voiceprints").document(cid).set(
            {"clusterId": nid}, merge=True
        )
        db.collection("guard_recordings").document(cid).set(
            {"voiceClusterId": nid}, merge=True
        )
        _write_cluster(nid, [cid], {"label": "", "verified": False})
    _cluster_ref(cluster_id).delete()
    return {"orphaned": len(members)}


def process_ops() -> bool:
    """Run any pending admin curation. Returns True if anything changed (the
    caller then reloads the in-memory index)."""
    try:
        docs = list(db.collection("guard_voice_ops").limit(300).stream())
    except Exception as e:  # noqa: BLE001
        print("[vp] ops list failed:", e)
        return False

    changed = False
    for doc in docs:
        d = doc.to_dict() or {}
        if d.get("status") != "pending":
            continue
        op = d.get("op")
        ref = db.collection("guard_voice_ops").document(doc.id)
        try:
            if op == "merge":
                res = _op_merge(list(d.get("clusterIds", [])))
            elif op == "split":
                res = _op_split(str(d.get("clusterId", "")), list(d.get("callIds", [])))
            elif op == "delete":
                res = _op_delete(str(d.get("clusterId", "")), str(d.get("mode", "orphan")))
            else:
                raise ValueError(f"unknown op {op!r}")
            ref.set(
                {"status": "done", "doneAt": firestore.SERVER_TIMESTAMP, "result": res},
                merge=True,
            )
            changed = True
            print(f"[vp] op {op} {doc.id} -> {res}")
        except Exception as e:  # noqa: BLE001
            ref.set(
                {"status": "error", "doneAt": firestore.SERVER_TIMESTAMP,
                 "error": str(e)[:300]},
                merge=True,
            )
            print(f"[vp] op {op} {doc.id} FAILED: {e}")
    return changed


# ── personal voice blocks (per-user, private) ───────────────────────────────
def _block_vecs(uid: str):
    """(ids, matrix, meta) for one user's private block list — small, no cache."""
    ids, rows, meta = [], [], []
    col = db.collection("guard_voice_blocks").document(uid).collection("voices")
    for d in col.stream():
        v = (d.to_dict() or {}).get("vec")
        if not v:
            continue
        ids.append(d.id)
        rows.append(np.asarray(v, dtype=np.float32))
        meta.append(d.to_dict() or {})
    mat = np.vstack(rows) if rows else np.zeros((0, EMB_DIM), np.float32)
    return ids, mat, meta


def match_personal_block(uid: str, vec: np.ndarray):
    """Does this live caller match a voice the user personally blocked?"""
    if not uid:
        return None
    try:
        ids, mat, meta = _block_vecs(uid)
    except Exception as e:  # noqa: BLE001
        print("[vp] block list read failed:", e)
        return None
    if mat.shape[0] == 0:
        return None
    sims = mat @ vec
    i = int(np.argmax(sims))
    score = float(sims[i])
    if score < VP_JOIN:
        return None
    return {
        "matched": True,
        "blockId": ids[i],
        "label": meta[i].get("label") or "",
        "score": round(score, 3),
    }


def process_block_requests() -> None:
    try:
        docs = list(db.collection("guard_block_requests").limit(200).stream())
    except Exception as e:  # noqa: BLE001
        print("[vp] block requests list failed:", e)
        return
    for doc in docs:
        d = doc.to_dict() or {}
        if d.get("status") != "pending":
            continue
        ref = db.collection("guard_block_requests").document(doc.id)
        uid = str(d.get("uid") or "")
        call_id = str(d.get("callId") or "")
        try:
            if not uid or not call_id:
                raise ValueError("missing uid / callId")
            path = f"guard_recordings/{call_id}/audio.wav"
            blob = bucket.blob(path)
            if not blob.exists():
                ref.set({"status": "no_recording", "doneAt": firestore.SERVER_TIMESTAMP},
                        merge=True)
                continue
            vec = embed_wav_bytes(blob.download_as_bytes())
            number = _number_from_call_id(call_id)
            db.collection("guard_voice_blocks").document(uid).collection("voices").add({
                "vec": vec.tolist(),
                "dim": int(vec.shape[0]),
                "label": d.get("label") or "",
                "note": d.get("note") or "",
                "sourceCallId": call_id,
                "number": number,
                "seenNumbers": [number] if number else [],
                "addedAt": firestore.SERVER_TIMESTAMP,
                "lastMatchedAt": None,
            })
            db.collection("guard_voice_blocks").document(uid).set(
                {"count": firestore.Increment(1), "updatedAt": firestore.SERVER_TIMESTAMP},
                merge=True,
            )
            ref.set({"status": "done", "doneAt": firestore.SERVER_TIMESTAMP}, merge=True)
            print(f"[vp] blocked voice for {uid[:8]}… from call {call_id}")
        except Exception as e:  # noqa: BLE001
            ref.set({"status": "error", "doneAt": firestore.SERVER_TIMESTAMP,
                     "error": str(e)[:300]}, merge=True)
            print(f"[vp] block request {doc.id} FAILED: {e}")


# ── ring-time number flags (passive, no audio, no handoff) ──────────────────
def sync_number_flags() -> None:
    """Mirror every scam-voice cluster's phone numbers into
    guard_number_flags/{digits} so the app can warn at ring time with one cheap
    Firestore read — no audio, no AI-Guard handoff needed. A number is flagged
    when its voice cluster is operator-verified OR spans >= VP_FLAG_MIN_SIZE
    recorded scam calls. Stale flags (cluster shrank / unverified / deleted) are
    removed so a number never stays flagged forever."""
    try:
        clusters = list(db.collection("guard_voice_clusters").stream())
    except Exception as e:  # noqa: BLE001
        print("[vp] number-flag sync: cluster read failed:", e)
        return

    want: dict[str, dict] = {}
    for d in clusters:
        c = d.to_dict() or {}
        size = int(c.get("size", 0))
        verified = bool(c.get("verified"))
        if not (verified or size >= VP_FLAG_MIN_SIZE):
            continue
        for num in c.get("numbers", []):
            num = re.sub(r"\D", "", str(num))
            if len(num) < 7:
                continue
            cur = want.get(num)
            # if a number is in several clusters, keep the strongest (verified,
            # then biggest).
            if cur and (cur["verified"], cur["clusterSize"]) >= (verified, size):
                continue
            want[num] = {
                "number": num,
                "voiceClusterId": d.id,
                "verified": verified,
                "clusterSize": size,
                "scamTypes": sorted(c.get("scamTypes", []))[:6],
                "kind": "scam_voice",
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }

    col = db.collection("guard_number_flags")
    try:
        have = {d.id for d in col.stream()}
    except Exception:  # noqa: BLE001
        have = set()

    for num, body in want.items():
        col.document(num).set(body)
    stale = have - set(want.keys())
    for num in stale:
        col.document(num).delete()
    if want or stale:
        print(f"[vp] number flags: {len(want)} active, {len(stale)} cleared")


# ── backfill ────────────────────────────────────────────────────────────────
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
            "audioPath": audio_path,
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
    ids, vecs, cof = [], [], {}
    for doc in db.collection("guard_voiceprints").stream():
        d = doc.to_dict() or {}
        v = d.get("vec")
        if not v:
            continue
        ids.append(doc.id)
        vecs.append(np.asarray(v, dtype=np.float32))
        cof[doc.id] = d.get("clusterId", "")
    with _lock:
        _ids = ids
        _mat = np.vstack(vecs) if vecs else np.zeros((0, EMB_DIM), np.float32)
        _cluster_of.clear()
        _cluster_of.update(cof)
    print(f"[vp] index loaded: {len(ids)} voiceprints")


def backfill_loop() -> None:
    try:
        _load_config()
        load_index()
    except Exception as e:  # noqa: BLE001
        print("[vp] startup load failed:", e)
    while True:
        try:
            _load_config()
            if process_ops():
                load_index()
            process_block_requests()
            sync_number_flags()
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
        "minClusterPush": VP_MIN_CLUSTER_PUSH,
    }


@app.get("/config")
def get_config():
    return {"join": VP_JOIN, "match": VP_MATCH, "minClusterForPush": VP_MIN_CLUSTER_PUSH}


@app.post("/config/reload")
def config_reload():
    _load_config()
    return get_config()


@app.post("/match")
async def match_ep(
    file: Optional[UploadFile] = File(default=None),
    gcs_path: Optional[str] = Form(default=None),
    user_key: Optional[str] = Form(default=None),
):
    try:
        if gcs_path:
            raw = bucket.blob(gcs_path).download_as_bytes()
        elif file is not None:
            raw = await file.read()
        else:
            return JSONResponse({"error": "no audio"}, status_code=400)

        vec = embed_wav_bytes(raw)
        personal_block = match_personal_block((user_key or "").strip(), vec)
        m = match(vec)
        strong = [x for x in m if x[1] >= VP_MATCH]
        known = bool(strong and strong[0][1] >= VP_JOIN)

        cluster_id = _cluster_of.get(strong[0][0]) if strong else None
        cluster_size = 0
        verified = False
        label = ""
        if cluster_id:
            cs = _cluster_ref(cluster_id).get()
            if cs.exists:
                cd = cs.to_dict() or {}
                cluster_size = int(cd.get("size", 0))
                verified = bool(cd.get("verified"))
                label = cd.get("label") or ""

        # what the user actually gets warned about: a confident match AND either
        # an admin-verified voice or a voice seen in >= N recorded scam calls.
        # A personal-block hit always warns — it's the user's own decision.
        push = bool(
            (known and (verified or cluster_size >= VP_MIN_CLUSTER_PUSH))
            or (personal_block and personal_block.get("matched"))
        )

        return {
            "known": known,
            "push": push,
            "verified": verified,
            "label": label,
            "bestScore": round(strong[0][1], 3) if strong else 0.0,
            "clusterId": cluster_id,
            "clusterSize": cluster_size,
            "personalBlock": personal_block,
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


@app.post("/ops/run")
def ops_run():
    """Force a curation + block-request + number-flag pass now."""
    changed = process_ops()
    if changed:
        load_index()
    process_block_requests()
    sync_number_flags()
    return {"ok": True, "changed": changed, "prints": len(_ids)}
