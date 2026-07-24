const { loadDataset } = require("./_lib/dataset");
const { buildProfile } = require("./_lib/profileEngine");
const { getUserSummary } = require("./_lib/blobs");

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// This function never calls Claude -- it only computes exact stats and
// checks for a pre-existing summary (uploaded or previously generated).
// Generating a fresh AI summary is a separate, explicit action the user
// triggers from the frontend (see generate-summary.js), so viewing a
// profile is always instant and free.
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body must be JSON: { email }" });
  }

  const email = (payload.email || "").trim().toLowerCase();
  if (!email) return json(400, { error: "Missing email" });

  const { rows } = await loadDataset();
  const userRows = rows.filter((r) => r.email === email);

  if (userRows.length === 0) {
    return json(404, { error: `No activity found for ${email}` });
  }

  const fullProfile = buildProfile(userRows);
  // Drop the full cluster list from the response -- it's only needed
  // server-side (generate-summary.js) to build the AI prompt, and can be
  // large for very active users. The frontend just needs the rest.
  const { clusters, ...profile } = fullProfile;

  const stored = await getUserSummary(email);
  const summary = stored ? { text: stored.text, ...stored.metadata } : null;

  return json(200, { profile, summary });
};
