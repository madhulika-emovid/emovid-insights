const emailInput = document.getElementById("emailInput");
const lookupBtn = document.getElementById("lookupBtn");
const statusEl = document.getElementById("status");
const report = document.getElementById("report");

// Cache the last-viewed profile in sessionStorage so switching to another
// tab (Dashboard/Upload) and back to User Profile restores the same view
// instantly instead of clearing it and re-fetching. Clears when the browser
// tab/window is closed, so it doesn't show stale data across sessions.
const CACHE_KEY = "emovidProfileCache";

function saveCache(email, data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ email, data }));
  } catch {
    // ignore -- storage can fail in private browsing etc, caching is best-effort
  }
}

function loadCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function fmt(n) {
  return typeof n === "number" ? n.toLocaleString() : n;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function planLine(profile) {
  if (profile.isPlanConsistent) {
    const p = profile.planCombos[0];
    return `Consistent plan throughout — ${escapeHtml(p.activePlan)}, ${escapeHtml(p.planTier)} tier`;
  }
  return profile.planCombos
    .map((p) => `${escapeHtml(p.activePlan)} (${escapeHtml(p.planTier)})`)
    .join(" → ");
}

function summarySectionHtml(summary) {
  if (summary) {
    const sourceLabel = summary.source === "uploaded" ? "manually uploaded" : "AI-generated";
    const when = summary.updatedAt ? new Date(summary.updatedAt).toLocaleString() : "";
    return `
      <p class="hint">${sourceLabel}${when ? " · updated " + when : ""}</p>
      <p style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${escapeHtml(summary.text)}</p>
      <button id="regenBtn" style="margin-top: 8px;">Regenerate with Claude</button>
      <span id="genStatus" class="hint"></span>
    `;
  }
  return `
    <p class="hint">No summary on file yet for this user. Either upload one written elsewhere (Upload Data page), or generate one now with Claude.</p>
    <button id="genBtn">Generate Summary with Claude</button>
    <span id="genStatus" class="hint"></span>
  `;
}

function render(data) {
  const { profile, summary } = data;

  const statsRows = [
    ["Total Emovids Sent", fmt(profile.totals.sent)],
    ["Active Days", fmt(profile.totals.activeDays)],
    ["Total Views", fmt(profile.totals.views)],
    ["Total Plays", fmt(profile.totals.plays)],
    ["Total Replies", fmt(profile.totals.replies)],
    ["Avg Views/Emovid", fmt(profile.totals.avgViewsPerEmovid)],
    ["Play-through Rate", `${profile.totals.playThroughRate}%`],
  ]
    .map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`)
    .join("");

  const engagementRows = profile.topEngagement
    .map(
      (r) =>
        `<tr><td>${r.date}</td><td>${escapeHtml(r.type)}</td><td>${fmt(r.views)}</td><td>${fmt(r.plays)}</td><td>${fmt(r.replies)}</td></tr>`
    )
    .join("");

  // Deterministic key-observation facts, computed in the browser from the
  // exact backend numbers -- not AI-written.
  const deterministicObs = [];
  if (profile.peakMonth) {
    deterministicObs.push(
      `${profile.peakMonth.month} alone accounts for ${fmt(profile.peakMonth.sent)} of ${fmt(profile.totals.sent)} total sends (${profile.peakMonthShare}%).`
    );
  }
  if (profile.biggestBlast) {
    deterministicObs.push(
      `Largest single mass-send: "${escapeHtml(profile.biggestBlast.text.slice(0, 140))}${profile.biggestBlast.text.length > 140 ? "…" : ""}" went out ${fmt(profile.biggestBlast.count)} times (${profile.biggestBlast.firstDate}${profile.biggestBlast.firstDate !== profile.biggestBlast.lastDate ? " to " + profile.biggestBlast.lastDate : ""}).`
    );
  }
  if (profile.byType.length > 1) {
    const byTypeStr = profile.byType
      .map((t) => `${t.type}: ${fmt(t.count)} sends, ${fmt(t.views)} views, ${fmt(t.replies)} replies (avg ${t.avgViews} views/send)`)
      .join(" · ");
    deterministicObs.push(`By type — ${byTypeStr}.`);
  }

  report.innerHTML = `
    <section class="panel">
      <h2 style="margin-top:0;">${escapeHtml(profile.usernames[0] || profile.email)} — Activity Summary</h2>
      <ul style="font-size:14px; color: var(--text); margin: 0; padding-left: 20px;">
        <li><strong>Email:</strong> ${escapeHtml(profile.email)}</li>
        <li><strong>Plan:</strong> ${planLine(profile)}</li>
        <li><strong>First activity on file:</strong> ${profile.firstDate}</li>
        <li><strong>Last activity on file:</strong> ${profile.lastDate}</li>
      </ul>
    </section>

    <section class="panel">
      <h3>Overall Stats <span class="hint">(exact, computed from your data)</span></h3>
      <table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${statsRows}</tbody></table>
    </section>

    <section class="panel" id="summarySection">
      <h3>How They Use Emovid</h3>
      ${summarySectionHtml(summary)}
    </section>

    <section class="panel">
      <h3>Engagement Highlights <span class="hint">(top 6 by views, exact)</span></h3>
      <table><thead><tr><th>Date</th><th>Type</th><th>Views</th><th>Plays</th><th>Replies</th></tr></thead><tbody>${engagementRows}</tbody></table>
    </section>

    <section class="panel">
      <h3>Key Observations <span class="hint">(exact, computed from your data)</span></h3>
      <ul>${deterministicObs.map((o) => `<li style="margin-bottom:8px;">${o}</li>`).join("")}</ul>
    </section>
  `;
  report.style.display = "block";

  const genBtn = document.getElementById("genBtn");
  const regenBtn = document.getElementById("regenBtn");
  if (genBtn) genBtn.addEventListener("click", () => generateSummary(profile.email));
  if (regenBtn) regenBtn.addEventListener("click", () => generateSummary(profile.email));
}

let lastProfileData = null;

async function generateSummary(email) {
  const genStatus = document.getElementById("genStatus");
  const btn = document.getElementById("genBtn") || document.getElementById("regenBtn");
  if (btn) btn.disabled = true;
  if (genStatus) genStatus.textContent = "Generating with Claude…";
  try {
    const res = await fetch("/api/generate-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generation failed");
    lastProfileData.summary = data.summary;
    render(lastProfileData);
    saveCache(email, lastProfileData);
  } catch (err) {
    if (genStatus) genStatus.textContent = `Error: ${err.message}`;
    if (btn) btn.disabled = false;
  }
}

lookupBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) return;
  statusEl.textContent = "Loading…";
  lookupBtn.disabled = true;
  report.style.display = "none";
  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    lastProfileData = data;
    render(data);
    saveCache(email, data);
    statusEl.textContent = "";
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    lookupBtn.disabled = false;
  }
});

emailInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") lookupBtn.click();
});

// On load: prefer restoring the last-viewed profile from cache (so
// switching tabs and back doesn't reset the page) unless the URL explicitly
// points at a different email (e.g. the "Open profile ->" link from the
// dashboard's Ask box), in which case that wins and we fetch fresh.
const urlEmail = new URLSearchParams(window.location.search).get("email");
const cached = loadCache();

if (urlEmail && (!cached || cached.email.toLowerCase() !== urlEmail.trim().toLowerCase())) {
  emailInput.value = urlEmail;
  lookupBtn.click();
} else if (cached) {
  emailInput.value = cached.email;
  lastProfileData = cached.data;
  render(cached.data);
}
