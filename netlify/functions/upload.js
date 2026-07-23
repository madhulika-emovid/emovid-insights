const { saveMonthCsv, listMonths } = require("./_lib/blobs");
const { parseCSV, rowsToRecords } = require("./_lib/csv");
const { validateHeaders, monthFromDate } = require("./_lib/normalize");

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body must be JSON: { filename, csvText, month? }" });
  }

  const { csvText, filename, month: monthOverride } = payload;
  if (!csvText || typeof csvText !== "string") {
    return json(400, { error: "Missing csvText" });
  }

  const parsed = parseCSV(csvText);
  if (parsed.length < 2) {
    return json(400, { error: "CSV has no data rows" });
  }

  const header = parsed[0].map((h) => h.trim());
  const { ok, missing } = validateHeaders(header);
  if (!ok) {
    return json(400, {
      error: "CSV is missing expected Emovid export columns",
      missing,
    });
  }

  const records = rowsToRecords(parsed);
  const monthKey =
    monthOverride ||
    monthFromDate(records[0]["Date (UTC)"]) ||
    (filename && filename.match(/(\d{4}-\d{2})/) && filename.match(/(\d{4}-\d{2})/)[1]);

  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return json(400, {
      error:
        "Could not determine which month this file belongs to. Pass 'month' as YYYY-MM explicitly.",
    });
  }

  await saveMonthCsv(monthKey, csvText, {
    filename: filename || "upload.csv",
    rowCount: records.length,
  });

  const months = await listMonths();

  return json(200, {
    ok: true,
    month: monthKey,
    rowsStored: records.length,
    monthsOnFile: months,
  });
};
