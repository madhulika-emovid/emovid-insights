const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const statusEl = document.getElementById("status");
const monthOverride = document.getElementById("monthOverride");

let selectedFile = null;

function setFile(file) {
  if (!file) return;
  selectedFile = file;
  dropzone.textContent = `Selected: ${file.name}`;
  uploadBtn.disabled = false;
}

dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => setFile(e.target.files[0]));

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  setFile(e.dataTransfer.files[0]);
});

async function loadMonths() {
  const res = await fetch("/api/months");
  const { months } = await res.json();
  const list = document.getElementById("monthsList");
  list.innerHTML = months.length
    ? months
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((m) => `<span>${m.month} · ${m.rowCount || "?"} rows</span>`)
        .join("")
    : '<span class="hint">None yet</span>';
}

uploadBtn.addEventListener("click", async () => {
  if (!selectedFile) return;
  uploadBtn.disabled = true;
  statusEl.textContent = "Reading file…";
  try {
    const csvText = await selectedFile.text();
    statusEl.textContent = "Uploading…";
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csvText,
        filename: selectedFile.name,
        month: monthOverride.value || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    statusEl.textContent = `Stored ${data.rowsStored} rows for ${data.month}.`;
    selectedFile = null;
    dropzone.textContent = "Drag & drop the CSV here, or click to choose a file";
    await loadMonths();
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    uploadBtn.disabled = false;
  }
});

async function loadSummaries() {
  const res = await fetch("/api/upload-summary");
  const { emails } = await res.json();
  const list = document.getElementById("summariesList");
  list.innerHTML = emails.length
    ? emails.map((e) => `<span>${e}</span>`).join("")
    : '<span class="hint">None yet</span>';
}

document.getElementById("saveSummaryBtn").addEventListener("click", async () => {
  const email = document.getElementById("summaryEmail").value.trim();
  const text = document.getElementById("summaryText").value.trim();
  const summaryStatus = document.getElementById("summaryStatus");
  if (!email || !text) {
    summaryStatus.textContent = "Need both an email and some text.";
    return;
  }
  const btn = document.getElementById("saveSummaryBtn");
  btn.disabled = true;
  summaryStatus.textContent = "Saving…";
  try {
    const res = await fetch("/api/upload-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    summaryStatus.textContent = `Saved for ${data.email}.`;
    document.getElementById("summaryEmail").value = "";
    document.getElementById("summaryText").value = "";
    await loadSummaries();
  } catch (err) {
    summaryStatus.textContent = `Error: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});

loadMonths();
loadSummaries();
