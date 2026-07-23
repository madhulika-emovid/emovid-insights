const grid = document.getElementById("grid");
const monthsHint = document.getElementById("monthsHint");

const TABLE_QUESTIONS = new Set(["topUsersByVolume"]);

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function currentFilters() {
  const monthFrom = document.getElementById("monthFrom").value;
  const monthTo = document.getElementById("monthTo").value;
  return { monthFrom: monthFrom || undefined, monthTo: monthTo || undefined };
}

function card(id, label) {
  const el = document.createElement("div");
  el.className = "panel card";
  el.id = `card-${id}`;
  el.innerHTML = `<h3>${label}</h3><div class="card-body">Loading…</div>`;
  return el;
}

function renderTable(container, groups) {
  const rows = groups
    .map((g) => `<tr><td>${g.key}</td><td>${g.value.toLocaleString()}</td></tr>`)
    .join("");
  container.innerHTML = `<table><thead><tr><th>User</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Simple dependency-free bar chart -- no external JS libraries to load
// (this replaced a Chart.js/CDN version that some browsers/extensions
// blocked, causing "Chart is not defined").
function renderChart(container, id, groups) {
  const max = Math.max(...groups.map((g) => g.value), 1);
  const rows = groups
    .map((g) => {
      const pct = Math.max((g.value / max) * 100, 2);
      return `
        <div class="bar-row">
          <div class="bar-label" title="${g.key}">${g.key}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <div class="bar-value">${g.value.toLocaleString()}</div>
        </div>`;
    })
    .join("");
  container.innerHTML = `<div class="bars">${rows}</div>`;
}

async function loadQuestion(id, label, filters) {
  const body = { questionId: id, ...filters };
  const data = await fetchJSON("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const container = document.querySelector(`#card-${id} .card-body`);
  if (data.empty || !data.groups || data.groups.length === 0) {
    container.innerHTML = `<p class="hint">No data yet for this range.</p>`;
    return;
  }
  if (TABLE_QUESTIONS.has(id)) {
    renderTable(container, data.groups);
  } else {
    renderChart(container, id, data.groups);
  }
}

async function loadAll() {
  const filters = currentFilters();
  const { questions } = await fetchJSON("/api/query?list=1");
  grid.innerHTML = "";
  for (const q of questions) {
    grid.appendChild(card(q.id, q.label));
  }
  await Promise.all(
    questions.map((q) =>
      loadQuestion(q.id, q.label, filters).catch((err) => {
        const container = document.querySelector(`#card-${q.id} .card-body`);
        if (container) container.innerHTML = `<p class="error">${err.message}</p>`;
      })
    )
  );
}

async function loadMonths() {
  const { months } = await fetchJSON("/api/months");
  if (months.length === 0) {
    monthsHint.textContent = "No data uploaded yet — go to Upload Data.";
  } else {
    const keys = months.map((m) => m.month).sort();
    monthsHint.textContent = `Data on file: ${keys[0]} to ${keys[keys.length - 1]} (${months.length} month${months.length > 1 ? "s" : ""})`;
  }
}

document.getElementById("applyFilters").addEventListener("click", () => loadAll());

document.getElementById("askBtn").addEventListener("click", async () => {
  const question = document.getElementById("question").value.trim();
  const status = document.getElementById("askStatus");
  const answerBox = document.getElementById("answer");
  if (!question) return;
  status.textContent = "Thinking…";
  answerBox.style.display = "none";
  document.getElementById("askBtn").disabled = true;
  try {
    const data = await fetchJSON("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (data.redirectTo === "profile") {
      answerBox.innerHTML = `${data.answer} <a href="profile.html?email=${encodeURIComponent(data.email)}" style="color: var(--accent);">Open profile →</a>`;
    } else {
      answerBox.textContent = data.answer;
    }
    answerBox.style.display = "block";
    status.textContent = "";
  } catch (err) {
    status.textContent = "";
    answerBox.textContent = `Error: ${err.message}`;
    answerBox.style.display = "block";
  } finally {
    document.getElementById("askBtn").disabled = false;
  }
});

loadMonths();
loadAll();
