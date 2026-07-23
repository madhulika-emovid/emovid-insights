const { getStore } = require("@netlify/blobs");

const STORE_NAME = "monthly-csv";

function store() {
  return getStore(STORE_NAME);
}

// key format: "2026-05" (YYYY-MM)
async function saveMonthCsv(monthKey, csvText, meta) {
  await store().set(monthKey, csvText, {
    metadata: { uploadedAt: new Date().toISOString(), ...meta },
  });
}

async function getMonthCsv(monthKey) {
  return store().get(monthKey, { type: "text" });
}

async function listMonths() {
  const { blobs } = await store().list();
  return blobs
    .map((b) => b.key)
    .sort(); // "YYYY-MM" sorts correctly as a string
}

async function getMonthMetadata(monthKey) {
  const res = await store().getWithMetadata(monthKey, { type: "text" });
  return res ? res.metadata : null;
}

async function deleteMonth(monthKey) {
  await store().delete(monthKey);
}

module.exports = {
  saveMonthCsv,
  getMonthCsv,
  listMonths,
  getMonthMetadata,
  deleteMonth,
};
