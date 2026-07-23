const { listMonths, getMonthCsv } = require("./blobs");
const { parseCSV, rowsToRecords } = require("./csv");
const { normalizeRecord } = require("./normalize");

// Simple in-memory cache scoped to a warm function instance. Serverless
// instances are short-lived and each deploy/cold-start clears this, so
// there's no staleness risk worth worrying about at this data size.
let cache = { months: null, rows: null, loadedAt: 0 };
const CACHE_TTL_MS = 60 * 1000;

async function loadDataset({ forceRefresh = false } = {}) {
  const fresh = Date.now() - cache.loadedAt < CACHE_TTL_MS;
  if (!forceRefresh && fresh && cache.rows) {
    return cache;
  }

  const months = await listMonths();
  const rows = [];

  for (const monthKey of months) {
    const csvText = await getMonthCsv(monthKey);
    if (!csvText) continue;
    const parsed = parseCSV(csvText);
    const records = rowsToRecords(parsed);
    for (const record of records) {
      rows.push(normalizeRecord(record, monthKey));
    }
  }

  cache = { months, rows, loadedAt: Date.now() };
  return cache;
}

module.exports = { loadDataset };
