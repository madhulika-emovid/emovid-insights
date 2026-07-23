const { loadDataset } = require("./_lib/dataset");
const { runQuery } = require("./_lib/queryEngine");

// A fixed catalog of predefined questions. The frontend just sends a
// question `id` (optionally with light params like a month range); the
// actual query spec lives here, server-side, so it can't be tampered with
// and stays in sync with the query engine's capabilities.
const CATALOG = {
  monthlyActiveUsers: {
    label: "Active (distinct) users per month",
    spec: { groupBy: "month", metric: "distinctEmails", sort: "chrono", filter: { excludeGuests: true } },
  },
  monthlyEmovidsSent: {
    label: "Total Emovids sent per month",
    spec: { groupBy: "month", metric: "sum", metricField: "emovidsSent", sort: "chrono" },
  },
  monthlyEngagement: {
    label: "Page views & plays per month",
    spec: { groupBy: "month", metric: "sum", metricField: "pageViews", sort: "chrono" },
  },
  planBreakdown: {
    label: "Activity by specific plan",
    spec: { groupBy: "activePlan", metric: "count", sort: "desc" },
  },
  typeBreakdown: {
    label: "Emovids by type (Create vs Reply vs Video Merge)",
    spec: { groupBy: "type", metric: "count", sort: "desc" },
  },
  topUsersByVolume: {
    label: "Top 10 most active users",
    spec: {
      groupBy: "email",
      metric: "sum",
      metricField: "emovidsSent",
      sort: "desc",
      limit: 10,
      filter: { excludeGuests: true },
    },
  },
  avgDurationByType: {
    label: "Average duration by Emovid type",
    spec: { groupBy: "type", metric: "avg", metricField: "durationSeconds", sort: "desc" },
  },
  replyRateOverTime: {
    label: "Total replies per month",
    spec: { groupBy: "month", metric: "sum", metricField: "replies", sort: "chrono" },
  },
  sendViaBreakdown: {
    label: "How Emovids are sent (link vs in-app)",
    spec: { groupBy: "sendVia", metric: "count", sort: "desc" },
  },
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "GET" && event.queryStringParameters?.list === "1") {
    return json(200, {
      questions: Object.entries(CATALOG).map(([id, q]) => ({ id, label: q.label })),
    });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body must be JSON" });
  }

  const { questionId, monthFrom, monthTo } = payload;
  const entry = CATALOG[questionId];
  if (!entry) {
    return json(400, {
      error: `Unknown questionId. Valid options: ${Object.keys(CATALOG).join(", ")}`,
    });
  }

  const { rows, months } = await loadDataset();
  if (rows.length === 0) {
    return json(200, { label: entry.label, empty: true, months: [] });
  }

  const spec = JSON.parse(JSON.stringify(entry.spec));
  spec.filter = spec.filter || {};
  if (monthFrom) spec.filter.monthFrom = monthFrom;
  if (monthTo) spec.filter.monthTo = monthTo;

  const result = runQuery(rows, spec);
  return json(200, { label: entry.label, months, ...result });
};

module.exports.CATALOG = CATALOG;
