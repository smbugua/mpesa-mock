"use client";
import { useState } from "react";

export default function Home(): JSX.Element {
  const [phone, setPhone] = useState("254712345600");
  const [amount, setAmount] = useState(10);
  const [result, setResult] = useState<unknown>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const res = await fetch("/api/mpesa/initiate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, amount: Number(amount) }),
    });
    setResult(await res.json());
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 32, maxWidth: 640 }}>
      <h1>mpesa-mock + Next.js</h1>
      <p>Suffix 00 = success · 01 = cancel · 02 = insufficient · 04 = timeout</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button type="submit">Initiate STK Push</button>
      </form>
      {result ? <pre>{JSON.stringify(result, null, 2)}</pre> : null}
      <p style={{ color: "#888", marginTop: 32 }}>
        Watch your terminal — the callback from mpesa-mock will print to the Next dev server log.
      </p>
    </main>
  );
}
