// A small, constrained query DSL executed directly against the normalized
// dataset in JS. Kept deliberately narrow (fixed fields, fixed metrics) so
// that both the predefined dashboard AND the AI custom-question feature can
// only ever produce numbers computed from real data -- the LLM is only ever
// used to pick a query, never to make up a number.

const GROUPABLE_FIELDS = [
  "month",
  "planTier",
  "activePlan",
  "type",
  "deviceType",
  "livenessStatus",
  "sendVia",
  "email",
];

const NUMERIC_FIELDS = ["emovidsSent", "replies", "pageViews", "plays", "durationSeconds"];

const METRICS = ["count", "sum", "avg", "distinctEmails"];

function matchesFilter(row, filter) {
  if (!filter) return true;

  if (filter.monthFrom && row.month && row.month < filter.monthFrom) return false;
  if (filter.monthTo && row.month && row.month > filter.monthTo) return false;
  if (filter.excludeGuests && row.isGuest) return false;

  const listFilters = {
    planTier: "planTier",
    activePlan: "activePlan",
    type: "type",
    deviceType: "deviceType",
    livenessStatus: "livenessStatus",
    sendVia: "sendVia",
    email: "email",
  };

  for (const [filterKey, field] of Object.entries(listFilters)) {
    const values = filter[filterKey];
    if (values && Array.isArray(values) && values.length > 0) {
      if (!values.includes(row[field])) return false;
    }
  }

  return true;
}

function computeMetric(rows, metric, metricField) {
  if (metric === "count") return rows.length;
  if (metric === "distinctEmails") return new Set(rows.map((r) => r.email)).size;
  if (!NUMERIC_FIELDS.includes(metricField)) {
    throw new Error(`metricField must be one of ${NUMERIC_FIELDS.join(", ")}`);
  }
  const values = rows.map((r) => r[metricField] || 0);
  const total = values.reduce((a, b) => a + b, 0);
  if (metric === "sum") return total;
  if (metric === "avg") return values.length ? total / values.length : 0;
  throw new Error(`Unsupported metric: ${metric}`);
}

function runQuery(dataset, spec) {
  const {
    filter = {},
    groupBy = null,
    metric = "count",
    metricField = null,
    sort = "desc",
    limit = null,
  } = spec || {};

  if (!METRICS.includes(metric)) {
    throw new Error(`metric must be one of ${METRICS.join(", ")}`);
  }
  if (groupBy && !GROUPABLE_FIELDS.includes(groupBy)) {
    throw new Error(`groupBy must be one of ${GROUPABLE_FIELDS.join(", ")}`);
  }

  const filtered = dataset.filter((row) => matchesFilter(row, filter));

  if (!groupBy) {
    return {
      total: computeMetric(filtered, metric, metricField),
      rowCount: filtered.length,
    };
  }

  const groups = new Map();
  for (const row of filtered) {
    const key = row[groupBy] || "(unknown)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let results = Array.from(groups.entries()).map(([key, rows]) => ({
    key,
    value: computeMetric(rows, metric, metricField),
    rowCount: rows.length,
  }));

  results.sort((a, b) => (sort === "asc" ? a.value - b.value : b.value - a.value));

  // Group keys that look like YYYY-MM should read chronologically instead
  // of by value when the caller didn't ask for a specific sort direction
  // over months -- callers wanting chronological month order should pass
  // groupBy: "month" and sort: "chrono".
  if (sort === "chrono") {
    results = results.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }

  if (limit) results = results.slice(0, limit);

  return { groups: results, rowCount: filtered.length };
}

module.exports = { runQuery, GROUPABLE_FIELDS, NUMERIC_FIELDS, METRICS };
