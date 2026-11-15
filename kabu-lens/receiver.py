#!/usr/bin/env python3
"""
株レンズ（Kabu Lens）のパケットを受け取る最小のWebhookサーバー。

AI Agent Lens (MIT License, Copyright (c) 2026 roan-maverick) の examples/webhook_receiver.py を
株レンズ用（schema: kabu-lens/v1、保存先 kabu-lens/packets）に変えたもの。

TradingView sends one JSON packet per closed candle to this server. The server
validates it and saves it to disk, where any AI agent (Claude Code, a script,
an n8n flow) can read it:

    kabu-lens/packets/latest.json                       newest packet from any chart
    kabu-lens/packets/latest/<SYMBOL>_<TF>.json         newest packet per chart
    kabu-lens/packets/history.jsonl                     every packet, one per line

Standard library only. No installs.

Usage:
    python3 kabu-lens/receiver.py --port 8080 --token CHANGE_ME

Then expose it with HTTPS (TradingView only sends webhooks to ports 80/443), e.g.:
    cloudflared tunnel --url http://localhost:8080
and use  https://<your-tunnel>/webhook?token=CHANGE_ME  as the alert's webhook URL.
"""

import argparse
import json
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SCHEMA = "kabu-lens/v1"
MAX_BODY = 64 * 1024


def safe_name(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", text)[:80] or "unknown"


class Handler(BaseHTTPRequestHandler):
    out_dir: Path = Path("kabu-lens/packets")
    token: str = ""

    def _reply(self, code: int, message: str) -> None:
        body = json.dumps({"ok": code == 200, "message": message}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            self._reply(200, "Kabu Lens receiver is running")
        else:
            self._reply(404, "not found")

    def do_POST(self) -> None:
        url = urlparse(self.path)
        if url.path != "/webhook":
            return self._reply(404, "not found")
        if self.token and parse_qs(url.query).get("token", [""])[0] != self.token:
            return self._reply(401, "bad token")

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._reply(400, "empty or oversized body")
        raw = self.rfile.read(length)

        try:
            packet = json.loads(raw)
        except json.JSONDecodeError:
            return self._reply(400, "body is not valid JSON")
        if not isinstance(packet, dict) or packet.get("schema") != SCHEMA:
            return self._reply(400, f"expected schema {SCHEMA}")

        packet["_received_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self.out_dir.mkdir(parents=True, exist_ok=True)
        (self.out_dir / "latest").mkdir(exist_ok=True)

        chart = safe_name(f"{packet.get('symbol', 'unknown')}_{packet.get('timeframe', 'na')}")
        text = json.dumps(packet, indent=2, ensure_ascii=False)
        (self.out_dir / "latest.json").write_text(text, encoding="utf-8")
        (self.out_dir / "latest" / f"{chart}.json").write_text(text, encoding="utf-8")
        with (self.out_dir / "history.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(packet, ensure_ascii=False) + "\n")

        print(f"[{packet['_received_at']}] {packet.get('event')} {packet.get('state_code')}")
        self._reply(200, "saved")

    def log_message(self, *args) -> None:  # keep the console clean
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Receive Kabu Lens packets from TradingView.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--token", default="", help="shared secret expected as ?token=... in the webhook URL")
    parser.add_argument("--out", default="kabu-lens/packets", help="folder where packets are saved")
    args = parser.parse_args()

    Handler.out_dir = Path(args.out)
    Handler.token = args.token
    if not args.token:
        print("WARNING: no --token set. Anyone who finds your URL can post packets.")
    print(f"Listening on http://{args.host}:{args.port}/webhook  (saving to {Handler.out_dir.resolve()})")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
