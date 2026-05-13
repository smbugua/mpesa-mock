# Next.js example

```bash
# terminal 1
npx mpesa-mock --delay 2000

# terminal 2
pnpm install
pnpm dev
```

Open <http://localhost:3000>. Submit the form — the request goes to
`app/api/mpesa/initiate/route.ts` which calls mpesa-mock's STK Push endpoint
and registers a callback at `app/api/mpesa/callback/route.ts`.

Watch the dev server logs — about 2 seconds later you'll see:

```
[callback] ✅ success { Amount: 10, MpesaReceiptNumber: 'NMDGS5L9YJ', ... }
```

Try `254712345602` to test the insufficient-funds path, or `254712345604` for a
timeout (no callback ever fires — the perfect failure to test handling for).
