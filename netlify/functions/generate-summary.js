const { loadDataset } = require("./_lib/dataset");
const { buildProfile, clustersForPrompt } = require("./_lib/profileEngine");
const { generateNarrativeText } = require("./_lib/narrative");
const { saveUserSummary } = require("./_lib/blobs");

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// The only endpoint in this app that calls Claude. It's triggered
// explicitly by a button click on the profile page (never automatically),
// and the result is cached in Blobs so it's only ever generated once per
// user unless someone deletes/regenerates it.
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

  const profile = buildProfile(userRows);
  const clusterSample = clustersForPrompt(profile.clusters);

  let text;
  try {
    text = await generateNarrativeText(profile, clusterSample);
  } catch (err) {
    return json(502, { error: `AI generation failed: ${err.message}` });
  }

  const updatedAt = new Date().toISOString();
  await saveUserSummary(email, text, { source: "generated", updatedAt });

  return json(200, { summary: { text, source: "generated", updatedAt } });
};
