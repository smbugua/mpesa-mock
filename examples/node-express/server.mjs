import express from "express";

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());

app.post("/mpesa/callback", (req, res) => {
  const cb = req.body?.Body?.stkCallback;
  if (!cb) {
    console.log("[callback] non-stk body:", JSON.stringify(req.body));
    return res.status(200).json({ ResultCode: 0, ResultDesc: "ok" });
  }
  if (cb.ResultCode === 0) {
    const items = cb.CallbackMetadata?.Item ?? [];
    const lookup = Object.fromEntries(items.map((i) => [i.Name, i.Value]));
    console.log(`[callback] ✅ success`, {
      receipt: lookup.MpesaReceiptNumber,
      amount: lookup.Amount,
      phone: lookup.PhoneNumber,
    });
  } else {
    console.log(`[callback] ❌ failed code=${cb.ResultCode} desc="${cb.ResultDesc}"`);
  }
  res.json({ ResultCode: 0, ResultDesc: "ok" });
});

app.get("/", (_req, res) => res.json({ name: "express-example", callbackUrl: `http://host.docker.internal:${PORT}/mpesa/callback` }));

app.listen(PORT, () => console.log(`Express example listening on :${PORT}`));
