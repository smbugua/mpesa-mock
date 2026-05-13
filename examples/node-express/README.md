# Express example

Three-step flow:

1. **Start the mock and the example side-by-side:**

   ```bash
   # terminal 1
   npx mpesa-mock --delay 1000
   # terminal 2
   pnpm install && pnpm start
   ```

2. **Send an STK Push.** The script asks mpesa-mock to push to phone `254712345600`
   (suffix `00` = success), with a callback URL pointing at this Express app:

   ```bash
   node send-stk.mjs                # success path
   node send-stk.mjs 254712345602   # insufficient funds (suffix 02)
   node send-stk.mjs 254712345604   # never fires a callback (suffix 04)
   ```

3. **Watch the Express logs.** About 1 second later you should see:

   ```
   [callback] ✅ success { receipt: 'NMDGS5L9YJ', amount: 10, phone: 254712345600 }
   ```

The full failure-mode table is in the [top-level README](../../README.md#failure-modes).
