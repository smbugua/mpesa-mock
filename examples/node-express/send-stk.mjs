const MOCK = process.env.MPESA_MOCK_URL ?? "http://localhost:4000";
const CALLBACK = process.env.CALLBACK_URL ?? "http://localhost:3000/mpesa/callback";
const PHONE = process.argv[2] ?? "254712345600";

async function main() {
  const tokenRes = await fetch(`${MOCK}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: "Basic " + Buffer.from("test_key:test_secret").toString("base64") },
  });
  const { access_token } = await tokenRes.json();
  console.log(`[token] ${access_token.slice(0, 12)}…`);

  const stk = await fetch(`${MOCK}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "content-type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: "174379",
      Password: "test",
      Timestamp: new Date().toISOString().replace(/\D/g, "").slice(0, 14),
      TransactionType: "CustomerPayBillOnline",
      Amount: 10,
      PartyA: PHONE,
      PartyB: "174379",
      PhoneNumber: PHONE,
      CallBackURL: CALLBACK,
      AccountReference: "INV001",
      TransactionDesc: "test order",
    }),
  });
  const stkJson = await stk.json();
  console.log("[stk-push response]", stkJson);
  console.log(`\nWaiting for callback at ${CALLBACK} …`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
