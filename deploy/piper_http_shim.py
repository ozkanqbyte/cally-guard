#!/usr/bin/env python3
"""Minimal HTTP shim in front of the piper CLI binary.

The upstream rhasspy/wyoming-piper:latest image dropped its old --http-port
REST mode; it now only speaks the Wyoming protocol. This shim restores a
plain POST /api/tts endpoint (matching src/agent/providers/piper-tts.mjs)
by shelling out to the piper binary directly for each request.
"""
import json
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PIPER_BIN = "/usr/src/.venv/bin/piper"
MODEL = "/data/tr_TR-dfki-medium.onnx"
CONFIG = "/data/tr_TR-dfki-medium.onnx.json"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def do_POST(self):
        if self.path != "/api/tts":
            self.send_response(404)
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            body = {}
        text = body.get("text", "")

        proc = subprocess.run(
            [PIPER_BIN, "-m", MODEL, "-c", CONFIG, "-f", "-"],
            input=text.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=60,
        )
        if proc.returncode != 0 or not proc.stdout:
            self.send_response(500)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(proc.stderr or b"piper failed")
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(proc.stdout)))
        self.end_headers()
        self.wfile.write(proc.stdout)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 5000), Handler)
    print("piper http shim listening on :5000")
    server.serve_forever()
