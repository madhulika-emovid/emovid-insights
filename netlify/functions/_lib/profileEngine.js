// Builds a deterministic, exact fact-sheet about one user from their raw
// rows. Every number in here is computed directly from the data -- none of
// it comes from an LLM. The AI (in profile.js) is only ever handed these
// facts and asked to narrate/cluster the free-text "Observations", so the
// numbers a user sees can't be hallucinated -- only the prose framing can
// be AI-written, and that's clearly grounded in these figures.

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10; // one decimal
}

function buildProfile(rows) {
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const email = rows[0].email;
  const usernames = Array.from(new Set(rows.map((r) => r.username))).filter(Boolean);

  const planCombos = Array.from(
    new Set(rows.map((r) => `${r.activePlan} | ${r.planTier}`))
  ).map((combo) => {
    const [activePlan, planTier] = combo.split(" | ");
    return { activePlan, planTier };
  });

  const totals = {
    sent: rows.reduce((s, r) => s + r.emovidsSent, 0),
    activeDays: new Set(rows.map((r) => r.date)).size,
    views: rows.reduce((s, r) => s + r.pageViews, 0),
    plays: rows.reduce((s, r) => s + r.plays, 0),
    replies: rows.reduce((s, r) => s + r.replies, 0),
  };
  totals.avgViewsPerEmovid = totals.sent ? Math.round((totals.views / totals.sent) * 100) / 100 : 0;
  totals.playThroughRate = pct(totals.plays, totals.views);

  // Breakdown by "Type of Emovid" -- exact sums per type.
  const byTypeMap = new Map();
  for (const r of rows) {
    if (!byTypeMap.has(r.type)) {
      byTypeMap.set(r.type, { type: r.type, count: 0, views: 0, plays: 0, replies: 0 });
    }
    const t = byTypeMap.get(r.type);
    t.count += 1;
    t.views += r.pageViews;
    t.plays += r.plays;
    t.replies += r.replies;
  }
  const byType = Array.from(byTypeMap.values()).map((t) => ({
    ...t,
    avgViews: t.count ? Math.round((t.views / t.count) * 100) / 100 : 0,
  }));

  // Monthly volume -- for spike/dormancy facts.
  const monthlyMap = new Map();
  for (const r of rows) {
    monthlyMap.set(r.month, (monthlyMap.get(r.month) || 0) + r.emovidsSent);
  }
  const monthly = Array.from(monthlyMap.entries())
    .map(([month, sent]) => ({ month, sent }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const peakMonth = monthly.reduce((a, b) => (b.sent > a.sent ? b : a), monthly[0]);

  // Top 6 rows by page views -- the "Engagement Highlights" table.
  const topEngagement = [...rows]
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, 6)
    .map((r) => ({
      date: r.date,
      type: r.type,
      views: r.pageViews,
      plays: r.plays,
      replies: r.replies,
      observation: r.observation,
    }));

  // Cluster rows by exact Observation text -- this is what lets us detect
  // "the same mail-merge blast sent to N people" deterministically, since
  // a single mass-send tends to log an identical (or near-identical)
  // generated summary per recipient row.
  const clusterMap = new Map();
  for (const r of rows) {
    const key = (r.observation || "").trim();
    if (!key) continue;
    if (!clusterMap.has(key)) {
      clusterMap.set(key, {
        text: key,
        count: 0,
        firstDate: r.date,
        lastDate: r.date,
        type: r.type,
        views: 0,
        plays: 0,
        replies: 0,
      });
    }
    const c = clusterMap.get(key);
    c.count += 1;
    c.views += r.pageViews;
    c.plays += r.plays;
    c.replies += r.replies;
    if (r.date < c.firstDate) c.firstDate = r.date;
    if (r.date > c.lastDate) c.lastDate = r.date;
  }
  const clusters = Array.from(clusterMap.values()).sort((a, b) => b.count - a.count);
  const biggestBlast = clusters[0] && clusters[0].count >= 5 ? clusters[0] : null;

  return {
    email,
    usernames,
    planCombos,
    isPlanConsistent: planCombos.length === 1,
    firstDate: sorted[0].date,
    lastDate: sorted[sorted.length - 1].date,
    totals,
    byType,
    monthly,
    peakMonth,
    peakMonthShare: pct(peakMonth ? peakMonth.sent : 0, totals.sent),
    topEngagement,
    clusters, // sorted by frequency, descending
    biggestBlast,
  };
}

// Trims + caps the clusters sent to the LLM so the prompt stays a
// reasonable size: every recurring cluster (count > 1) plus a capped
// sample of one-off personalized messages, each with its real count.
function clustersForPrompt(clusters, { maxRecurring = 60, maxSingles = 60 } = {}) {
  const recurring = clusters.filter((c) => c.count > 1).slice(0, maxRecurring);
  const singles = clusters.filter((c) => c.count === 1).slice(0, maxSingles);
  return [...recurring, ...singles].map((c) => ({
    count: c.count,
    type: c.type,
    dateRange: c.firstDate === c.lastDate ? c.firstDate : `${c.firstDate} to ${c.lastDate}`,
    views: c.views,
    replies: c.replies,
    text: c.text.slice(0, 220),
  }));
}

module.exports = { buildProfile, clustersForPrompt };
