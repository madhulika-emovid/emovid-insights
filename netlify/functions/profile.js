const { loadDataset } = require("./_lib/dataset");
const { buildProfile, clustersForPrompt } = require("./_lib/profileEngine");
const { callGemini } = require("./_lib/gemini");

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function buildSystemPrompt(profile, clusterSample) {
  return `You write the qualitative sections of a per-user Emovid activity report. You are given EXACT, pre-computed facts and a sample of that user's message clusters (each cluster is one distinct message text they sent, with its real send count, date range, and engagement). You must never invent a number that isn't traceable to the facts or clusters given to you. If you group several clusters into one "use case" theme, the volume you cite for that theme must be the sum of the counts of the clusters you assigned to it.

Exact facts:
${JSON.stringify(
  {
    totals: profile.totals,
    byType: profile.byType,
    monthly: profile.monthly,
    peakMonth: profile.peakMonth,
    peakMonthShare: profile.peakMonthShare,
    biggestBlast: profile.biggestBlast,
  },
  null,
  2
)}

Message clusters (count = how many times this exact text was sent):
${JSON.stringify(clusterSample, null, 2)}

Respond ONLY with a JSON object of this shape:
{
  "companyContext": "1 sentence inferring company/role/community from the text, or 'Not explicit in data' if nothing points to one",
  "usageThemes": [
    { "name": "short theme name", "sendCount": integer, "description": "1-3 sentences, may quote/paraphrase example message text" }
  ],
  "additionalObservations": [
    "1-2 sentence bullet insight not already covered by the numeric facts you were given verbatim -- qualitative color only"
  ]
}
Keep usageThemes to at most 5, ordered by sendCount descending. Keep additionalObservations to at most 3.`;
}

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

  let narrative = { companyContext: null, usageThemes: [], additionalObservations: [] };
  try {
    const raw = await callGemini({
      system: buildSystemPrompt(profile, clusterSample),
      user: "Write the report sections now.",
      jsonMode: true,
    });
    narrative = JSON.parse(raw);
  } catch (err) {
    narrative.error = `AI narrative unavailable: ${err.message}`;
  }

  return json(200, { profile, narrative });
};
