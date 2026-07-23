// Turns raw Emovid export rows (as produced by the app's monthly CSV export)
// into a consistent, typed shape used everywhere else in the app.
//
// Expected source columns (case/spacing must match the export exactly):
// "Date (UTC)","Username","E-mail","Active Plan","Plan Tier","Type of Emovid",
// "Emovids Sent","Liveness Status","Send Via","Send To/By","Device Type",
// "Duration","Emovid Link","Replies","Page Views","Plays","Observations"

function toInt(value) {
  const n = parseInt(String(value).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

// "mm:ss" or "hh:mm:ss" -> total seconds
function durationToSeconds(value) {
  if (!value || value === "-") return 0;
  const parts = String(value).split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function monthFromDate(dateStr) {
  // "2026-05-31" -> "2026-05"
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

const REQUIRED_HEADERS = [
  "Date (UTC)",
  "Username",
  "E-mail",
  "Active Plan",
  "Plan Tier",
  "Type of Emovid",
  "Emovids Sent",
  "Liveness Status",
  "Send Via",
  "Send To/By",
  "Device Type",
  "Duration",
  "Replies",
  "Page Views",
  "Plays",
];

function validateHeaders(header) {
  const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  return { ok: missing.length === 0, missing };
}

function normalizeRecord(record, fallbackMonth) {
  const date = record["Date (UTC)"] || "";
  const email = (record["E-mail"] || "").trim().toLowerCase();
  return {
    date,
    month: monthFromDate(date) || fallbackMonth || null,
    username: record["Username"] || "",
    email,
    isGuest:
      email.startsWith("guest-user@") ||
      (record["Username"] || "").trim() === "(Guest)" ||
      (record["Username"] || "").trim() === "Guest User",
    activePlan: record["Active Plan"] || "-",
    planTier: record["Plan Tier"] || "-",
    type: record["Type of Emovid"] || "-",
    emovidsSent: toInt(record["Emovids Sent"]),
    livenessStatus: record["Liveness Status"] || "-",
    sendVia: record["Send Via"] || "-",
    sendTo: record["Send To/By"] || "",
    deviceType: record["Device Type"] || "-",
    durationSeconds: durationToSeconds(record["Duration"]),
    replies: toInt(record["Replies"]),
    pageViews: toInt(record["Page Views"]),
    plays: toInt(record["Plays"]),
    observation: record["Observations"] || "",
  };
}

module.exports = { normalizeRecord, validateHeaders, monthFromDate, REQUIRED_HEADERS };
