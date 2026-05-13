"""Tiny standalone webhook receiver for mpesa-mock.

No Flask, no deps — just the Python stdlib. Use it as a CallBackURL when you
want to see what Daraja-shaped body mpesa-mock will deliver to your app,
without standing up your real app first.

    python3 callback_sink.py                 # listens on :5000
    PORT=8080 python3 callback_sink.py       # custom port

Then point any mpesa-mock STK Push / B2C / C2B at:

    "CallBackURL": "http://localhost:5000/cb"

Every POST is printed prettily and acknowledged with `{"ResultCode": 0}` so
mpesa-mock marks the delivery as successful.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

PORT = int(os.environ.get("PORT", "5000"))


def humanise_stk_callback(cb: dict[str, Any]) -> str:
    code = cb.get("ResultCode")
    desc = cb.get("ResultDesc", "")
    items = (cb.get("CallbackMetadata") or {}).get("Item") or []
    lookup = {i["Name"]: i.get("Value") for i in items}
    icon = "✅" if code == 0 else "❌"
    head = f"{icon} STK CALLBACK  code={code}  {desc!r}"
    if code == 0:
        return (
            f"{head}\n"
            f"   receipt:  {lookup.get('MpesaReceiptNumber')}\n"
            f"   amount:   {lookup.get('Amount')}\n"
            f"   phone:    {lookup.get('PhoneNumber')}\n"
            f"   txn time: {lookup.get('TransactionDate')}"
        )
    return head


def humanise_result_callback(result: dict[str, Any]) -> str:
    code = result.get("ResultCode")
    desc = result.get("ResultDesc", "")
    icon = "✅" if code == 0 else "❌"
    params = ((result.get("ResultParameters") or {}).get("ResultParameter") or [])
    lookup = {p["Key"]: p.get("Value") for p in params}
    head = f"{icon} RESULT CALLBACK  code={code}  {desc!r}"
    detail_lines = [f"   {k}: {v}" for k, v in lookup.items()]
    return head + ("\n" + "\n".join(detail_lines[:8]) if detail_lines else "")


def humanise_c2b_confirmation(body: dict[str, Any]) -> str:
    return (
        f"💰 C2B CONFIRMATION  receipt={body.get('TransID')}  "
        f"amount={body.get('TransAmount')}  msisdn={body.get('MSISDN')}  "
        f"shortcode={body.get('BusinessShortCode')}  ref={body.get('BillRefNumber')}"
    )


def pretty_print(body_bytes: bytes) -> None:
    try:
        body = json.loads(body_bytes.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        print("(non-JSON body)")
        print(body_bytes.decode("utf-8", errors="replace"))
        return

    stk = (body.get("Body") or {}).get("stkCallback")
    if stk:
        print(humanise_stk_callback(stk))
    elif "Result" in body:
        print(humanise_result_callback(body["Result"]))
    elif "TransID" in body and "MSISDN" in body:
        print(humanise_c2b_confirmation(body))
    else:
        print("📨 generic callback")
        print(json.dumps(body, indent=2))


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 (stdlib name)
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b""
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        print(f"\n[{ts}]  POST {self.path}", flush=True)
        pretty_print(body)
        sys.stdout.flush()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ResultCode":0,"ResultDesc":"ok"}')

    def do_GET(self) -> None:  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"name":"mpesa-mock callback sink","ok":true}')

    def log_message(self, *_args: Any) -> None:
        return


def main() -> None:
    print(f"📞 mpesa-mock callback sink listening on http://localhost:{PORT}")
    print(f"   point CallBackURL / ConfirmationURL / ResultURL at this host")
    print(f"   Ctrl-C to stop\n")
    try:
        HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nbye 👋")
        sys.exit(0)


if __name__ == "__main__":
    main()
