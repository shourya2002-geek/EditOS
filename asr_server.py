#!/usr/bin/env python3
"""
Whisper Small ASR HTTP API Server
Runs on the GCP VM (NVIDIA L4) and exposes a /transcribe endpoint.
Accepts POST with audio file, returns JSON transcription.
"""

import io
import os
import torch
import soundfile as sf
from http.server import HTTPServer, BaseHTTPRequestHandler
from transformers import pipeline
import json
import cgi
import tempfile

# --------------------------------------------------------------------------
# Load model at startup
# --------------------------------------------------------------------------
MODEL_NAME = os.environ.get("WHISPER_MODEL", "openai/whisper-small")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
PORT = int(os.environ.get("ASR_PORT", "8090"))

print(f"Loading {MODEL_NAME} on {DEVICE}...", flush=True)
pipe = pipeline(
    "automatic-speech-recognition",
    model=MODEL_NAME,
    device=DEVICE,
    torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
)
print(f"Model loaded. Starting server on port {PORT}...", flush=True)


class ASRHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/transcribe":
            self._handle_transcribe()
        else:
            self.send_error(404, "Not found")

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "model": MODEL_NAME,
                "device": DEVICE,
            }).encode())
        else:
            self.send_error(404, "Not found")

    def _handle_transcribe(self):
        content_type = self.headers.get("Content-Type", "")

        try:
            if "multipart/form-data" in content_type:
                # Parse multipart form data
                form = cgi.FieldStorage(
                    fp=self.rfile,
                    headers=self.headers,
                    environ={
                        "REQUEST_METHOD": "POST",
                        "CONTENT_TYPE": content_type,
                    },
                )
                audio_item = form["audio"]
                audio_bytes = audio_item.file.read()
            else:
                # Raw audio body
                content_length = int(self.headers.get("Content-Length", 0))
                audio_bytes = self.rfile.read(content_length)

            if not audio_bytes:
                self.send_error(400, "No audio data")
                return

            # Write to temp file for the pipeline
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name

            try:
                result = pipe(
                    tmp_path,
                    generate_kwargs={"language": "en", "task": "transcribe"},
                )
                text = result["text"].strip()
            finally:
                os.unlink(tmp_path)

            response = json.dumps({
                "text": text,
                "model": MODEL_NAME,
            })
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        print(f"[ASR] {args[0]}", flush=True)


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), ASRHandler)
    print(f"=== Whisper ASR API running on http://0.0.0.0:{PORT} ===", flush=True)
    print(f"  POST /transcribe  — send audio, get text", flush=True)
    print(f"  GET  /health      — health check", flush=True)
    server.serve_forever()
