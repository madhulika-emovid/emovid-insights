const { getStore } = require("@netlify/blobs");

const STORE_NAME = "monthly-csv";

// Netlify normally injects Blobs credentials into functions automatically.
// If that auto-detection isn't working in this environment (some accounts/
// deploys hit MissingBlobsEnvironmentError), fall back to explicit
// credentials via NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN env vars.
function store() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: STORE_NAME, siteID, token });
  }
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