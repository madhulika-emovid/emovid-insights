const emailInput = document.getElementById("emailInput");
const lookupBtn = document.getElementById("lookupBtn");
const statusEl = document.getElementById("status");
const report = document.getElementById("report");

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

function render(data) {
  const { profile, narrative } = data;

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

  let themesHtml = (narrative.usageThemes || [])
    .map(
      (t) =>
        `<p><strong>${escapeHtml(t.name)}</strong> (${fmt(t.sendCount)} sends) — ${escapeHtml(t.description)}</p>`
    )
    .join("");

  // Fallback if the AI came back with no themes (e.g. too little data to
  // group meaningfully) but there's no hard error either -- fall back to
  // just listing the real messages we have rather than showing nothing.
  if (!themesHtml && !narrative.error && profile.topEngagement.length > 0) {
    themesHtml =
      '<p class="hint">Not enough activity to identify usage patterns -- showing the raw message(s) on file instead.</p>' +
      profile.topEngagement
        .slice(0, 5)
        .map((r) => `<p><strong>${r.date}</strong> (${escapeHtml(r.type)}) — ${escapeHtml(r.observation || "No description available.")}</p>`)
        .join("");
  }

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

  const aiObs = (narrative.additionalObservations || []).map((o) => escapeHtml(o));
  const allObs = [...deterministicObs, ...aiObs];

  report.innerHTML = `
    <section class="panel">
      <h2 style="margin-top:0;">${escapeHtml(profile.usernames[0] || profile.email)} — Activity Summary</h2>
      <ul style="font-size:14px; color: var(--text); margin: 0; padding-left: 20px;">
        <li><strong>Email:</strong> ${escapeHtml(profile.email)}</li>
        <li><strong>Company:</strong> ${escapeHtml(narrative.companyContext || "Not explicit in data")}</li>
        <li><strong>Plan:</strong> ${planLine(profile)}</li>
        <li><strong>First activity on file:</strong> ${profile.firstDate}</li>
        <li><strong>Last activity on file:</strong> ${profile.lastDate}</li>
      </ul>
    </section>

    <section class="panel">
      <h3>Overall Stats</h3>
      <table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${statsRows}</tbody></table>
    </section>

    <section class="panel">
      <h3>How They Use Emovid <span class="hint">(AI-generated from real message clusters)</span></h3>
      ${
        themesHtml ||
        (narrative.error
          ? `<p class="error">${escapeHtml(narrative.error)}</p>`
          : '<p class="hint">No narrative available.</p>')
      }
    </section>

    <section class="panel">
      <h3>Engagement Highlights <span class="hint">(top 6 by views, exact)</span></h3>
      <table><thead><tr><th>Date</th><th>Type</th><th>Views</th><th>Plays</th><th>Replies</th></tr></thead><tbody>${engagementRows}</tbody></table>
    </section>

    <section class="panel">
      <h3>Key Observations</h3>
      <ul>${allObs.map((o) => `<li style="margin-bottom:8px;">${o}</li>`).join("")}</ul>
    </section>
  `;
  report.style.display = "block";
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
    render(data);
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

// Support being linked to directly with ?email=someone@example.com
const prefill = new URLSearchParams(window.location.search).get("email");
if (prefill) {
  emailInput.value = prefill;
  lookupBtn.click();
}
