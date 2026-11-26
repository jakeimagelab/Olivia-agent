"""Serve stateless quote reading with the Mac Studio Hermes Codex login."""

from hmac import compare_digest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from threading import BoundedSemaphore

from dotenv import dotenv_values
from agent.auxiliary_client import call_llm
from hermes_cli.config import load_config


PATH = "/olivia/quote-reader"
MAX_BODY_BYTES = 128 * 1024
INFERENCE_SLOTS = BoundedSemaphore(2)


def api_key():
    hermes_home = Path.home() / ".hermes"
    key = os.environ.get("API_SERVER_KEY") or dotenv_values(hermes_home / ".env").get("API_SERVER_KEY")
    if not key:
        raise RuntimeError("Hermes API authentication is not configured")
    return f"Bearer {key}".encode()


def read_quote(instructions, text):
    model = load_config().get("model", {})
    if not isinstance(model, dict) or model.get("provider") != "openai-codex" or not model.get("default"):
        raise RuntimeError("Hermes Codex model is not configured")
    response = call_llm(
        provider="openai-codex",
        model=model["default"],
        messages=[{"role": "system", "content": instructions}, {"role": "user", "content": text}],
        max_tokens=4000,
        timeout=16,
        reasoning_config={"effort": "low"},
    )
    message = response.choices[0].message
    if message.tool_calls or not isinstance(message.content, str) or not message.content.strip():
        raise ValueError("Invalid quote reader response")
    return {"content": message.content, "model": model["default"]}


class QuoteReaderHandler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, _format, *_args):
        pass

    def reply(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        return compare_digest(self.headers.get("Authorization", "").encode(), self.server.reader_key)

    def do_GET(self):
        if self.path != PATH + "/health":
            self.reply(404, {"error": "not_found"})
        elif not self.authorized():
            self.reply(401, {"error": "unauthorized"})
        else:
            self.reply(200, {"ok": True, "reader": "hermes-codex"})

    def do_POST(self):
        if self.path != PATH:
            self.reply(404, {"error": "not_found"})
            return
        if not self.authorized():
            self.reply(401, {"error": "unauthorized"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= MAX_BODY_BYTES:
                self.reply(413, {"error": "invalid_body_size"})
                return
            body = json.loads(self.rfile.read(size))
            instructions, text = body["instructions"], body["text"]
            if not all(isinstance(value, str) and value.strip() for value in (instructions, text)):
                raise ValueError("missing input")
        except (ValueError, KeyError, TypeError, OSError):
            self.reply(400, {"error": "invalid_input"})
            return
        if not INFERENCE_SLOTS.acquire(blocking=False):
            self.reply(429, {"error": "busy"})
            return
        try:
            result = read_quote(instructions, text)
        except Exception as error:
            print(f"[olivia-quote-reader] {type(error).__name__}", flush=True)
            self.reply(502, {"error": "inference_failed"})
            return
        finally:
            INFERENCE_SLOTS.release()
        self.reply(200, result)


if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", 8643), QuoteReaderHandler) as server:
        server.reader_key = api_key()
        server.serve_forever()
