#!/usr/bin/env python3
"""
A tiny OpenAI-compatible transcription server backed by faster-whisper, so Amanuensis can
transcribe on this Mac with nothing uploaded.

    uv run --with faster-whisper python tools/local_whisper_server.py            # large-v3, port 8777
    WHISPER_MODEL=base python tools/local_whisper_server.py                       # faster, rougher

Then in Amanuensis → Settings → Transcription: "Custom (OpenAI-compatible URL)",
base URL http://127.0.0.1:8777/v1, no key needed.

Serves:
    GET  /v1/models
    POST /v1/audio/transcriptions   (multipart: file, model, language, prompt)
"""
import io
import json
import os
import sys
import time
from email.parser import BytesParser
from email.policy import default as default_policy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from faster_whisper import WhisperModel

MODEL_NAME = os.environ.get("WHISPER_MODEL", "large-v3")
PORT = int(os.environ.get("PORT", "8777"))

print(f"loading {MODEL_NAME}…", flush=True)
MODEL = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8", cpu_threads=max(2, (os.cpu_count() or 4) - 2))
print(f"ready on http://127.0.0.1:{PORT}/v1", flush=True)


def read_wav(data: bytes) -> np.ndarray:
    """Amanuensis always sends 16 kHz mono 16-bit WAV."""
    i = data.find(b"data")
    pcm = np.frombuffer(data[i + 8:] if i >= 0 else data[44:], dtype=np.int16)
    return pcm.astype(np.float32) / 32768.0


def parse_multipart(headers, body: bytes) -> dict:
    msg = BytesParser(policy=default_policy).parsebytes(
        b"Content-Type: " + headers["Content-Type"].encode() + b"\r\n\r\n" + body
    )
    fields = {}
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        fields[name] = part.get_payload(decode=True)
    return fields


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, obj):
        out = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def do_GET(self):
        if self.path.rstrip("/").endswith("/models"):
            return self.reply(200, {"data": [{"id": MODEL_NAME}]})
        self.reply(404, {"error": {"message": "not found"}})

    def do_POST(self):
        if not self.path.rstrip("/").endswith("/audio/transcriptions"):
            return self.reply(404, {"error": {"message": "not found"}})
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        f = parse_multipart(self.headers, body)
        audio = read_wav(f.get("file") or b"")
        lang = (f.get("language") or b"en").decode() or None
        prompt = (f.get("prompt") or b"").decode() or None
        t0 = time.time()
        segs, _ = MODEL.transcribe(
            audio, language=lang, initial_prompt=prompt, beam_size=5, vad_filter=False,
            condition_on_previous_text=False, temperature=[0.0, 0.2, 0.4],
        )
        text = " ".join(s.text.strip() for s in segs).strip()
        print(f"{len(audio) / 16000:5.1f}s audio → {time.time() - t0:4.2f}s  {text[:70]}", flush=True)
        self.reply(200, {"text": text})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
