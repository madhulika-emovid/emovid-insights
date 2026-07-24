const { getStore } = require("@netlify/blobs");

const MONTHLY_CSV_STORE = "monthly-csv";
const SUMMARY_STORE = "user-summaries";

// Netlify normally injects Blobs credentials into functions automatically.
// If that auto-detection isn't working in this environment (some accounts/
// deploys hit MissingBlobsEnvironmentError), fall back to explicit
// credentials via NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN env vars.
function store(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name, siteID, token });
  }
  return getStore(name);
}

// key format: "2026-05" (YYYY-MM)
async function saveMonthCsv(monthKey, csvText, meta) {
  await store(MONTHLY_CSV_STORE).set(monthKey, csvText, {
    metadata: { uploadedAt: new Date().toISOString(), ...meta },
  });
}

async function getMonthCsv(monthKey) {
  return store(MONTHLY_CSV_STORE).get(monthKey, { type: "text" });
}

async function listMonths() {
  const { blobs } = await store(MONTHLY_CSV_STORE).list();
  return blobs
    .map((b) => b.key)
    .sort(); // "YYYY-MM" sorts correctly as a string
}

async function getMonthMetadata(monthKey) {
  const res = await store(MONTHLY_CSV_STORE).getWithMetadata(monthKey, { type: "text" });
  return res ? res.metadata : null;
}

async function deleteMonth(monthKey) {
  await store(MONTHLY_CSV_STORE).delete(monthKey);
}

// Per-user plain-text summaries -- keyed by lowercased email. Used both for
// manually-uploaded summaries and for caching an on-demand AI-generated one
// so it only ever gets generated once per user.
async function saveUserSummary(email, text, meta) {
  await store(SUMMARY_STORE).set(email, text, {
    metadata: { updatedAt: new Date().toISOString(), ...meta },
  });
}

async function getUserSummary(email) {
  const res = await store(SUMMARY_STORE).getWithMetadata(email, { type: "text" });
  if (!res) return null;
  return { text: res.data, metadata: res.metadata };
}

async function listUserSummaries() {
  const { blobs } = await store(SUMMARY_STORE).list();
  return blobs.map((b) => b.key).sort();
}

async function deleteUserSummary(email) {
  await store(SUMMARY_STORE).delete(email);
}

module.exports = {
  saveMonthCsv,
  getMonthCsv,
  listMonths,
  getMonthMetadata,
  deleteMonth,
  saveUserSummary,
  getUserSummary,
  listUserSummaries,
  deleteUserSummary,
};