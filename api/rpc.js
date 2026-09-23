const UPSTREAM = "https://studio.genlayer.com/api";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}),
    });

    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader(
      "content-type",
      upstream.headers.get("content-type") || "application/json"
    );
    res.setHeader("cache-control", "no-store");
    return res.send(body);
  } catch (error) {
    return res.status(502).json({
      error: "StudioNet RPC proxy failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
