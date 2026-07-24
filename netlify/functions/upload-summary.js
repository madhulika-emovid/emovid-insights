const { saveUserSummary, listUserSummaries } = require("./_lib/blobs");

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    const emails = await listUserSummaries();
    return json(200, { emails });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Use POST or GET" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body must be JSON: { email, text }" });
  }

  const email = (payload.email || "").trim().toLowerCase();
  const text = (payload.text || "").trim();
  if (!email) return json(400, { error: "Missing email" });
  if (!text) return json(400, { error: "Missing text" });

  const updatedAt = new Date().toISOString();
  await saveUserSummary(email, text, { source: "uploaded", updatedAt });

  return json(200, { ok: true, email, updatedAt });
};
