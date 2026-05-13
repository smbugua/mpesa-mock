# mpesa-mock

> **Local M-Pesa Daraja API emulator. Stop fighting the sandbox.**

[![CI](https://github.com/smbugua/mpesa-mock/actions/workflows/ci.yml/badge.svg)](https://github.com/smbugua/mpesa-mock/actions)
[![npm](https://img.shields.io/npm/v/mpesa-mock.svg)](https://www.npmjs.com/package/mpesa-mock)
[![docker](https://img.shields.io/badge/ghcr.io-mpesa--mock-blue)](https://github.com/smbugua/mpesa-mock/pkgs/container/mpesa-mock)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

```bash
npx mpesa-mock
```

That's it. STK Push, C2B, B2C, transaction status, account balance, reversal —
all running on `http://localhost:4000` in milliseconds, with deterministic
failure modes you can trigger from a phone number suffix.

## Why this exists

If you've built on Daraja, you know:

- **Safaricom's sandbox is slow** — multi-second OAuth, occasional 30s STK Push timeouts.
- **It's flaky** — random 500s, weeks-long outages, no status page.
- **It can't fail on demand** — try simulating "user cancelled on phone" or "callback delivery failed twice then succeeded." You can't.
- **It requires registration** — you can't `git clone && pnpm test` in a fresh CI container.

`mpesa-mock` runs locally, responds in milliseconds, requires zero registration,
and lets you trigger any failure mode by changing the test phone number.

## 60-second start

Three terminals. Copy, paste, see a callback land in your code in under a minute.

### Terminal 1 — start `mpesa-mock`

```bash
npx mpesa-mock --delay 2000
```

You'll see a banner with the base URL (`http://localhost:4000`) and a link to
the live dashboard. Leave this running.

### Terminal 2 — start a callback receiver

mpesa-mock POSTs the transaction result to whatever URL you pass as
`CallBackURL`. If you don't have an app stood up yet, use the bundled
stdlib-only Python receiver:

```bash
# clone or download examples/callback-sink/callback_sink.py, then:
python3 callback_sink.py            # listens on :5000
```

> 💡 In your real app, this is just your `/api/mpesa/callback` route handler —
> see [examples/](./examples/) for Express, Next.js, and Flask versions.

### Terminal 3 — generate a token + push to a phone

```bash
# 1. get an OAuth token (any consumer_key:consumer_secret works in mock)
TOKEN=$(curl -s "http://localhost:4000/oauth/v1/generate?grant_type=client_credentials" \
  -u "test_key:test_secret" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "token: $TOKEN"

# 2. push to a phone — note CallBackURL points at the sink in Terminal 2
curl -X POST http://localhost:4000/mpesa/stkpush/v1/processrequest \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "BusinessShortCode":"174379","Password":"x","Timestamp":"20260513120000",
    "TransactionType":"CustomerPayBillOnline","Amount":10,
    "PartyA":"254712345600","PartyB":"174379","PhoneNumber":"254712345600",
    "CallBackURL":"http://localhost:5000/cb",
    "AccountReference":"INV1","TransactionDesc":"order"
  }'
# → {"MerchantRequestID":"...","CheckoutRequestID":"ws_CO_...","ResponseCode":"0",...}
```

Within ~2 seconds, **Terminal 2** prints:

```
[14:23:01]  POST /cb
✅ STK CALLBACK  code=0  'The service request is processed successfully.'
   receipt:  NMDGS5L9YJ
   amount:   10
   phone:    254712345600
   txn time: 20260513142301
```

That's the full Daraja round-trip — exactly what your production app will
receive when it talks to the real Safaricom sandbox or live API.

### Step 4 — watch it in the dashboard

Open **<http://localhost:4000/__mock__/dashboard>** in your browser.

You'll see a live table of every transaction with kind, phone, amount, state,
callback delivery attempts, and age. It auto-refreshes via Server-Sent Events —
no reload needed. Re-run the curl from Terminal 3 and watch a new row appear
instantly.

Try changing the last two digits of `PhoneNumber` and watch the state column
change colour — `…01` cancels, `…02` fails with insufficient funds, `…04`
never fires a callback at all (the [failure mode table](#failure-modes--phone-suffix-convention)
has the full list).

## Failure modes — phone-suffix convention

The killer feature. **The last two digits of the `PhoneNumber` decide what happens:**

| Suffix | Behavior | `ResultCode` |
|--------|----------|--------------|
| `00` | ✅ Success (default) | `0` |
| `01` | User cancels on phone | `1032` |
| `02` | Insufficient funds | `1` |
| `03` | Wrong PIN | `2001` |
| `04` | Timeout — no callback ever sent | — |
| `05` | Callback delivery fails 3× then succeeds | `0` |
| `06` | Transaction expires | `1037` |
| `07` | Generic system error | `1025` |
| `99` | Slow — 30-second callback delay | `0` |

Override per-number or globally with `mpesa-mock.config.json` (see
[`mpesa-mock.config.example.json`](./mpesa-mock.config.example.json)).

## CLI

```bash
npx mpesa-mock                              # :4000, defaults
npx mpesa-mock --port 4001
npx mpesa-mock --delay 0                    # instant callbacks for tests
npx mpesa-mock --persist ./data.db          # SQLite — transactions survive restart
npx mpesa-mock --record ./session.jsonl     # capture every request/response
npx mpesa-mock --quiet                      # CI mode, no logs
npx mpesa-mock --config ./mpesa-mock.config.json
```

## Docker

```bash
docker run -p 4000:4000 ghcr.io/smbugua/mpesa-mock:latest
```

Or drop into your `docker-compose.yml`:

```yaml
services:
  mpesa-mock:
    image: ghcr.io/smbugua/mpesa-mock:latest
    ports: ["4000:4000"]
    environment:
      MPESA_MOCK_DELAY: "1000"
```

## Endpoints

All match Daraja's response shapes byte-for-byte — including
`expires_in` as a string, the nested `Body.stkCallback` envelope, and the
`Item[]` array on `CallbackMetadata`.

| Endpoint | Method | Status |
|----------|--------|--------|
| `/oauth/v1/generate` | GET | ✅ |
| `/mpesa/stkpush/v1/processrequest` | POST | ✅ |
| `/mpesa/stkpushquery/v1/query` | POST | ✅ |
| `/mpesa/c2b/v1/registerurl` | POST | ✅ |
| `/mpesa/c2b/v1/simulate` | POST | ✅ |
| `/mpesa/b2c/v1/paymentrequest` | POST | ✅ |
| `/mpesa/b2b/v1/paymentrequest` | POST | ✅ |
| `/mpesa/transactionstatus/v1/query` | POST | ✅ |
| `/mpesa/accountbalance/v1/query` | POST | ✅ |
| `/mpesa/reversal/v1/request` | POST | ✅ |

Mock-only helpers (clearly namespaced under `/__mock__/`):

- `GET /__mock__/dashboard` — live transaction view with SSE
- `GET /__mock__/state` — JSON snapshot for tests
- `GET /__mock__/events` — server-sent events stream
- `POST /__mock__/clear` — reset state
- `POST /__mock__/c2b/trigger` — programmatic C2B simulation

## Framework examples

Each is a complete, runnable project — `npx mpesa-mock` in one terminal, the
example in another, three commands to a callback in your code.

- [Express](./examples/node-express/) — minimal Node app
- [Next.js](./examples/nextjs/) — App Router with API route handlers
- [Python Flask](./examples/python-flask/) — proves it's HTTP, not framework-coupled
- [Callback sink](./examples/callback-sink/) — 90-line stdlib-only Python receiver. Point any callback at it to see what mpesa-mock delivers — no app required.

### "What URL do I put in `CallBackURL`?"

The endpoint of **your app** that you want mpesa-mock to POST the result to.
Same shape as production Daraja — only the base URL changes between mock,
sandbox, and prod. If you don't have an app yet, run the
[callback sink](./examples/callback-sink/) to see the payload that will arrive.

## What it doesn't do

- **Production.** It's a mock. Don't point production at it.
- **Real M-Pesa.** No real money moves. If you paste real consumer secrets in,
  they're logged with a warning and ignored.
- **Cheat Safaricom.** Same point — this is a developer tool, not a payment processor.
- **Tanzania / Vodacom M-Pesa.** Different API surface. PRs welcome.

## FAQ

**Is this affiliated with Safaricom?** No. It's a community tool. "M-PESA",
"Daraja", and related marks are trademarks of Safaricom PLC.

**Will Safaricom sue you?** We hope not — this never touches their production
infrastructure and never moves money. It's a local emulator for Daraja's
documented HTTP surface, the same way developers write mocks for Stripe or
Twilio.

**How is this different from [Pesa Playground](https://github.com/OmentaElvis/pesa-playground)?**
Different audience. Pesa Playground is a Rust+Tauri desktop GUI for interactive
manual testing — drive a fake SIM Toolkit with your mouse. `mpesa-mock` is a
headless HTTP server for **automated** testing — `npx`, Docker, CI green by
default. Use both: Pesa Playground for exploring, mpesa-mock for `pnpm test`.

**Does it match Daraja exactly?** That's the goal — including the awkward
parts. If you find a divergence, open an issue.

**Can I use it in CI?** Yes. `--quiet` mode + `--delay 0` gives you sub-second
test runs.

**Does it persist?** In-memory by default; pass `--persist ./data.db` for
SQLite-backed durability across restarts.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE). Not affiliated with Safaricom PLC.
