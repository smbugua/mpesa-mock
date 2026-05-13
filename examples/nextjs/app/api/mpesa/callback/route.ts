import { NextResponse } from "next/server";

interface StkCallbackBody {
  Body?: {
    stkCallback?: {
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: { Item: Array<{ Name: string; Value: unknown }> };
    };
  };
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as StkCallbackBody;
  const cb = body.Body?.stkCallback;
  if (cb && cb.ResultCode === 0) {
    const items = cb.CallbackMetadata?.Item ?? [];
    const lookup: Record<string, unknown> = Object.fromEntries(items.map((i) => [i.Name, i.Value]));
    console.log(`[callback] ✅ success`, lookup);
  } else if (cb) {
    console.log(`[callback] ❌ code=${cb.ResultCode} desc="${cb.ResultDesc}"`);
  }
  return NextResponse.json({ ResultCode: 0, ResultDesc: "ok" });
}
