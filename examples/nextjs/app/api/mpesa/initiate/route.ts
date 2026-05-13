import { NextResponse } from "next/server";

const MOCK = process.env.MPESA_MOCK_URL ?? "http://localhost:4000";
const PUBLIC_CALLBACK = process.env.PUBLIC_CALLBACK_URL ?? "http://localhost:3000/api/mpesa/callback";

export async function POST(req: Request): Promise<Response> {
  const { phone, amount } = (await req.json().catch(() => ({}))) as { phone?: string; amount?: number };
  if (!phone || !amount) {
    return NextResponse.json({ error: "phone and amount required" }, { status: 400 });
  }

  const tokenRes = await fetch(`${MOCK}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: "Basic " + Buffer.from("test_key:test_secret").toString("base64") },
  });
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const stk = await fetch(`${MOCK}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "content-type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: "174379",
      Password: "test",
      Timestamp: new Date().toISOString().replace(/\D/g, "").slice(0, 14),
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: "174379",
      PhoneNumber: phone,
      CallBackURL: PUBLIC_CALLBACK,
      AccountReference: "NXT001",
      TransactionDesc: "next.js test",
    }),
  });

  const body = await stk.json();
  return NextResponse.json(body, { status: stk.status });
}
