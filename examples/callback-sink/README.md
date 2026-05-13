# callback-sink — drop-in webhook receiver

A 90-line Python script (stdlib only — no Flask, no pip install) that you
point any mpesa-mock callback at. Useful when you just want to **see what
mpesa-mock delivers** before you wire it into your real app.

## Run

```bash
python3 callback_sink.py            # listens on :5000
PORT=8080 python3 callback_sink.py  # custom port
```

## Use

In one terminal start mpesa-mock:

```bash
npx mpesa-mock --delay 2000
```

In another start the sink:

```bash
python3 callback_sink.py
```

In a third, send an STK Push pointing the callback at the sink:

```bash
TOKEN=$(curl -s "http://localhost:4000/oauth/v1/generate?grant_type=client_credentials" -u "k:s" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -X POST http://localhost:4000/mpesa/stkpush/v1/processrequest \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "BusinessShortCode":"174379","Password":"x","Timestamp":"20260513120000",
    "TransactionType":"CustomerPayBillOnline","Amount":10,
    "PartyA":"254712345600","PartyB":"174379","PhoneNumber":"254712345600",
    "CallBackURL":"http://localhost:5000/cb",
    "AccountReference":"INV1","TransactionDesc":"order"
  }'
```

~2 seconds later the sink prints:

```
[14:23:01]  POST /cb
✅ STK CALLBACK  code=0  'The service request is processed successfully.'
   receipt:  NMDGS5L9YJ
   amount:   10
   phone:    254712345600
   txn time: 20260513142301
```

## What it understands

The sink pretty-prints all three Daraja callback envelopes:

- **STK Push** — `Body.stkCallback` with `CallbackMetadata.Item[]`
- **B2C / B2B / Transaction Status / Account Balance / Reversal** — `Result.ResultParameter[]`
- **C2B confirmation** — flat body with `TransID`, `MSISDN`, etc.

Anything else falls back to a pretty-printed JSON dump.

## Try every failure mode

Re-run the curl above changing only the last two digits of `PhoneNumber`:

| Phone | What the sink will print |
|---|---|
| `…00` | ✅ success |
| `…01` | ❌ user cancelled (code 1032) |
| `…02` | ❌ insufficient funds (code 1) |
| `…04` | (nothing — timeout, callback never fires) |
| `…05` | ✅ success, but only after 3 retries (watch mpesa-mock logs) |
