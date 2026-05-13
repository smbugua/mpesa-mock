import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppContext } from "../server.js";

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>mpesa-mock dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 font-mono min-h-screen">
  <div class="max-w-6xl mx-auto p-6">
    <header class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">mpesa-mock <span class="text-emerald-400">●</span></h1>
        <p class="text-slate-400 text-sm">Local M-Pesa Daraja emulator — live transactions</p>
      </div>
      <div class="text-right text-xs text-slate-500">
        <div id="health">checking…</div>
        <div>SSE: <span id="sse-status">connecting</span></div>
      </div>
    </header>

    <section class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="bg-slate-900 rounded-lg p-4 border border-slate-800">
        <div class="text-xs text-slate-500 uppercase">Transactions</div>
        <div id="count-total" class="text-3xl font-bold">0</div>
      </div>
      <div class="bg-slate-900 rounded-lg p-4 border border-slate-800">
        <div class="text-xs text-slate-500 uppercase">Pending callbacks</div>
        <div id="count-pending" class="text-3xl font-bold text-amber-300">0</div>
      </div>
      <div class="bg-slate-900 rounded-lg p-4 border border-slate-800">
        <div class="text-xs text-slate-500 uppercase">Delivered</div>
        <div id="count-delivered" class="text-3xl font-bold text-emerald-300">0</div>
      </div>
    </section>

    <section class="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-800 text-slate-400 text-xs uppercase">
          <tr>
            <th class="text-left p-3">Kind</th>
            <th class="text-left p-3">CheckoutRequestID</th>
            <th class="text-left p-3">Phone</th>
            <th class="text-right p-3">Amount</th>
            <th class="text-left p-3">State</th>
            <th class="text-right p-3">Cb attempts</th>
            <th class="text-right p-3">Age</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </section>

    <footer class="text-center text-slate-600 text-xs mt-8">
      mpesa-mock — not affiliated with Safaricom PLC
    </footer>
  </div>

  <script>
    const stateColors = {
      success: 'text-emerald-300',
      pending: 'text-amber-300',
      user_cancelled: 'text-rose-300',
      insufficient_funds: 'text-rose-400',
      wrong_pin: 'text-rose-400',
      expired: 'text-rose-400',
      system_error: 'text-rose-500',
      timeout: 'text-slate-400',
    };

    function renderRow(t) {
      const age = Math.round((Date.now() - t.createdAt) / 1000);
      const colorCls = stateColors[t.state] ?? 'text-slate-200';
      return \`<tr class="border-t border-slate-800 hover:bg-slate-800/50">
        <td class="p-3 uppercase text-xs text-slate-400">\${t.kind}</td>
        <td class="p-3 text-xs">\${t.checkoutRequestID}</td>
        <td class="p-3">\${t.phoneNumber}</td>
        <td class="p-3 text-right">\${t.amount.toLocaleString()}</td>
        <td class="p-3 \${colorCls}">\${t.state}</td>
        <td class="p-3 text-right">\${t.callbackAttempts}</td>
        <td class="p-3 text-right text-slate-500">\${age}s</td>
      </tr>\`;
    }

    function refresh(data) {
      const txns = data.transactions ?? [];
      document.getElementById('count-total').textContent = txns.length;
      document.getElementById('count-pending').textContent = data.pendingCallbacks ?? 0;
      document.getElementById('count-delivered').textContent = txns.filter(t => t.callbackDeliveredAt).length;
      document.getElementById('rows').innerHTML = txns.slice(0, 50).map(renderRow).join('');
    }

    fetch('/__mock__/health').then(r => r.json()).then(d => {
      document.getElementById('health').textContent = 'up · ' + Math.round(d.uptime) + 's';
    });

    fetch('/__mock__/state').then(r => r.json()).then(refresh);

    const es = new EventSource('/__mock__/events');
    es.onopen = () => { document.getElementById('sse-status').textContent = 'live'; };
    es.onerror = () => { document.getElementById('sse-status').textContent = 'disconnected'; };
    es.onmessage = (e) => { try { refresh(JSON.parse(e.data)); } catch {} };
  </script>
</body>
</html>`;

export function dashboardRoute(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  app.get("/__mock__/dashboard", (c) => c.html(DASHBOARD_HTML));

  app.get("/__mock__/state", (c) => {
    const transactions = c.var.store.list(100);
    return c.json({
      transactions,
      pendingCallbacks: c.var.dispatcher.pendingIds().length,
    });
  });

  app.get("/__mock__/events", (c) => {
    return streamSSE(c, async (stream) => {
      const send = async () => {
        await stream.writeSSE({
          data: JSON.stringify({
            transactions: c.var.store.list(100),
            pendingCallbacks: c.var.dispatcher.pendingIds().length,
          }),
        });
      };
      await send();
      const onChange = () => { void send(); };
      c.var.store.on("change", onChange);
      c.var.store.on("clear", onChange);
      const heartbeat = setInterval(() => { void send(); }, 5000);
      try {
        while (true) {
          await stream.sleep(1000);
        }
      } finally {
        clearInterval(heartbeat);
        c.var.store.off("change", onChange);
        c.var.store.off("clear", onChange);
      }
    });
  });

  app.post("/__mock__/clear", (c) => {
    c.var.store.clear();
    return c.json({ cleared: true });
  });

  return app;
}
