import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingRetry = false;

      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      }

      function scheduleRetry() {
        if (closed || pendingRetry) return;
        pendingRetry = true;
        retryTimer = setTimeout(() => {
          pendingRetry = false;
          connect();
        }, 3_000);
      }

      function connect() {
        if (closed) return;
        const ws = new WebSocket("ws://localhost:3003");

        ws.on("open", () => send("status", { connected: true, ts: Date.now() }));

        ws.on("message", (raw: Buffer) => {
          try {
            const { event, data } = JSON.parse(raw.toString());
            send(event, data);
          } catch {}
        });

        ws.on("close", () => {
          if (closed) return;
          send("status", { connected: false, ts: Date.now() });
          scheduleRetry();
        });

        // Swallow error — close event always follows
        ws.on("error", () => {});
      }

      connect();

      const heartbeat = setInterval(() => send("heartbeat", { ts: Date.now() }), 20_000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        if (retryTimer) clearTimeout(retryTimer);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
