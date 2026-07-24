const { callClaude } = require("./claude");

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
Keep usageThemes to at most 5, ordered by sendCount descending. Keep additionalObservations to at most 3.

Important: usageThemes must NEVER be empty if at least one message cluster was
given above. If there's only one cluster, or the clusters don't obviously
group into multiple themes, just describe the single cluster (or each small
cluster individually) as its own theme rather than returning an empty list.`;
}

// Converts the structured AI response into one plain-text block, so both
// AI-generated and manually-uploaded summaries end up stored and rendered
// the exact same way (see blobs.js saveUserSummary/getUserSummary).
function structuredToText(structured) {
  const lines = [];
  if (structured.companyContext) {
    lines.push(`Company/context: ${structured.companyContext}`, "");
  }
  for (const theme of structured.usageThemes || []) {
    lines.push(`${theme.name} (${theme.sendCount} sends) — ${theme.description}`, "");
  }
  if ((structured.additionalObservations || []).length > 0) {
    lines.push("Additional notes:");
    for (const obs of structured.additionalObservations) {
      lines.push(`- ${obs}`);
    }
  }
  return lines.join("\n").trim();
}

// Runs the grounded Claude call and returns ready-to-store plain text.
// Throws on failure -- callers decide how to surface that.
async function generateNarrativeText(profile, clusterSample) {
  const raw = await callClaude({
    system: buildSystemPrompt(profile, clusterSample),
    user: "Write the report sections now.",
    jsonMode: true,
  });
  const structured = JSON.parse(raw);
  return structuredToText(structured);
}

module.exports = { generateNarrativeText };
