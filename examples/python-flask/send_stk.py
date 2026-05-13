import os
import sys

import requests

APP = os.environ.get("APP_URL", "http://localhost:5000")
phone = sys.argv[1] if len(sys.argv) > 1 else "254712345600"

r = requests.post(f"{APP}/initiate", json={"phone": phone, "amount": 10}, timeout=10)
print(r.status_code, r.json())
print(f"Waiting for callback on the Flask app logs (phone {phone} → suffix {phone[-2:]})")
