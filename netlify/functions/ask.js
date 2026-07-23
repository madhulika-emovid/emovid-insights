const { loadDataset } = require("./_lib/dataset");
const { runQuery, GROUPABLE_FIELDS, NUMERIC_FIELDS, METRICS } = require("./_lib/queryEngine");
const { callGroq } = require("./_lib/groq");

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function distinctValues(rows, field, cap = 12) {
  const set = new Set();
  for (const r of rows) {
    set.add(r[field]);
    if (set.size >= cap) break;
  }
  return Array.from(set);
}

function buildSystemPrompt(rows, months) {
  return `You translate a plain-English question about Emovid usage data into a strict JSON query spec. You never invent numbers -- you only ever produce a query spec; a separate system executes it against the real data.

Data available: months on file = [${months.join(", ")}]. Each row is one Emovid activity event (a "Create" or "Reply") with these fields:
- month (format YYYY-MM)
- planTier, one of: ${distinctValues(rows, "planTier").join(", ")}
- activePlan, one of: ${distinctValues(rows, "activePlan").join(", ")}
- type (Type of Emovid), one of: ${distinctValues(rows, "type").join(", ")}
- deviceType, one of: ${distinctValues(rows, "deviceType").join(", ")}
- livenessStatus, one of: ${distinctValues(rows, "livenessStatus").join(", ")}
- sendVia, one of: ${distinctValues(rows, "sendVia").join(", ")}
- email (the user)
- numeric fields: emovidsSent, replies, pageViews, plays, durationSeconds (seconds)

Respond ONLY with a JSON object of this exact shape:
{
  "filter": {
    "monthFrom": "YYYY-MM" | null,
    "monthTo": "YYYY-MM" | null,
    "excludeGuests": true | false,
    "planTier": [ ...values... ] | null,
    "activePlan": [ ...values... ] | null,
    "type": [ ...values... ] | null,
    "deviceType": [ ...values... ] | null,
    "livenessStatus": [ ...values... ] | null,
    "sendVia": [ ...values... ] | null,
    "email": [ ...values... ] | null
  },
  "groupBy": one of [${GROUPABLE_FIELDS.join(", ")}] or null,
  "metric": one of [${METRICS.join(", ")}],
  "metricField": one of [${NUMERIC_FIELDS.join(", ")}] or null (required when metric is sum/avg),
  "sort": "asc" | "desc" | "chrono",
  "limit": integer or null
}

Rules:
- Use groupBy: "month" with sort: "chrono" for anything about trends/over time.
- Use metric: "count" for "how many activities/events". Use "distinctEmails" for "how many users". Use "sum"/"avg" with metricField for totals/averages of a numeric field.
- Omit filters that aren't implied by the question (set them to null).
- Do not add explanation, only the JSON object.`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body must be JSON: { question }" });
  }

  const question = (payload.question || "").trim();
  if (!question) return json(400, { error: "Missing question" });

  const { rows, months } = await loadDataset();
  if (rows.length === 0) {
    return json(200, {
      answer: "There's no data uploaded yet -- upload a monthly CSV first.",
    });
  }

  let spec;
  try {
    const raw = await callGroq({
      system: buildSystemPrompt(rows, months),
      user: question,
      jsonMode: true,
    });
    spec = JSON.parse(raw);
  } catch (err) {
    return json(500, { error: `Couldn't interpret the question: ${err.message}` });
  }

  let result;
  try {
    result = runQuery(rows, spec);
  } catch (err) {
    return json(400, {
      error: `Interpreted the question as an invalid query: ${err.message}`,
      spec,
    });
  }

  let answer;
  try {
    answer = await callGroq({
      system:
        "You write a short, direct answer (2-4 sentences max) to the user's question using ONLY the numbers given in the JSON result below. Do not invent any numbers not present in the result. If the result has a 'groups' array, mention the top few entries. Do not restate the raw JSON.",
      user: `Question: ${question}\n\nResult: ${JSON.stringify(result)}`,
    });
  } catch (err) {
    answer = null;
  }

  return json(200, {
    answer: answer || `Result: ${JSON.stringify(result)}`,
    spec,
    result,
  });
};
