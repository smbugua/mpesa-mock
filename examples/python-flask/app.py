"""Minimal Flask integration for mpesa-mock.

Run:
    pip install -r requirements.txt
    python app.py

Then in another terminal:
    python send_stk.py
"""
from __future__ import annotations

import base64
import os
from datetime import datetime
from typing import Any

import requests
from flask import Flask, jsonify, request

MOCK = os.environ.get("MPESA_MOCK_URL", "http://localhost:4000")
PORT = int(os.environ.get("PORT", "5000"))
CONSUMER_KEY = os.environ.get("MPESA_KEY", "test_key")
CONSUMER_SECRET = os.environ.get("MPESA_SECRET", "test_secret")

app = Flask(__name__)


def get_token() -> str:
    basic = base64.b64encode(f"{CONSUMER_KEY}:{CONSUMER_SECRET}".encode()).decode()
    r = requests.get(
        f"{MOCK}/oauth/v1/generate?grant_type=client_credentials",
        headers={"Authorization": f"Basic {basic}"},
        timeout=5,
    )
    r.raise_for_status()
    return r.json()["access_token"]


@app.post("/initiate")
def initiate() -> Any:
    body = request.get_json(silent=True) or {}
    phone = body.get("phone", "254712345600")
    amount = int(body.get("amount", 10))
    token = get_token()
    r = requests.post(
        f"{MOCK}/mpesa/stkpush/v1/processrequest",
        json={
            "BusinessShortCode": "174379",
            "Password": "test",
            "Timestamp": datetime.utcnow().strftime("%Y%m%d%H%M%S"),
            "TransactionType": "CustomerPayBillOnline",
            "Amount": amount,
            "PartyA": phone,
            "PartyB": "174379",
            "PhoneNumber": phone,
            "CallBackURL": f"http://host.docker.internal:{PORT}/callback",
            "AccountReference": "FLASK",
            "TransactionDesc": "test",
        },
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    return jsonify(r.json()), r.status_code


@app.post("/callback")
def callback() -> Any:
    body = request.get_json(silent=True) or {}
    cb = body.get("Body", {}).get("stkCallback") or {}
    if cb.get("ResultCode") == 0:
        items = {item["Name"]: item["Value"] for item in cb.get("CallbackMetadata", {}).get("Item", [])}
        app.logger.info("[callback] success: %s", items)
    else:
        app.logger.info("[callback] failed: code=%s desc=%s", cb.get("ResultCode"), cb.get("ResultDesc"))
    return jsonify({"ResultCode": 0, "ResultDesc": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)
