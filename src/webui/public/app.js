const jobListEl = document.getElementById("jobList");
const sourceHealthEl = document.getElementById("sourceHealth");
const progressEl = document.getElementById("progress");
const progressTextEl = document.getElementById("progressText");
const refreshBtn = document.getElementById("refreshBtn");
const includeSponsorsEl = document.getElementById("includeSponsors");
const paginationEl = document.getElementById("pagination");
const pageInfoEl = document.getElementById("pageInfo");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const generateModal = document.getElementById("generateModal");
const generateModalTitle = document.getElementById("generateModalTitle");
const generateModalBody = document.getElementById("generateModalBody");
const closeGenerateModalBtn = document.getElementById("closeGenerateModal");

const filterEls = {
  search: document.getElementById("search"),
  category: document.getElementById("filterCategory"),
  sponsorStatus: document.getElementById("filterSponsorStatus"),
  salaryClass: document.getElementById("filterSalaryClass"),
  remoteType: document.getElementById("filterRemoteType"),
  source: document.getElementById("filterSource"),
  postedSince: document.getElementById("filterPostedSince"),
  status: document.getElementById("filterStatus"),
  hideExcluded: document.getElementById("hideExcluded"),
};

const PAGE_SIZE = 25;
let currentPage = 0;
let dbSourcesCache = [];

const POSTED_SINCE_MS = {
  "24h": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "2w": 14 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "3m": 90 * 24 * 60 * 60 * 1000,
  "6m": 182 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
};

function postedSinceIso(presetKey) {
  const ms = POSTED_SINCE_MS[presetKey];
  if (!ms) return undefined;
  return new Date(Date.now() - ms).toISOString();
}

let pollTimer = null;
let searchDebounce = null;

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function currentFilters() {
  const params = new URLSearchParams();
  if (filterEls.search.value) params.set("search", filterEls.search.value);
  if (filterEls.category.value) params.set("category", filterEls.category.value);
  if (filterEls.sponsorStatus.value) params.set("sponsorStatus", filterEls.sponsorStatus.value);
  if (filterEls.salaryClass.value) params.set("salaryClass", filterEls.salaryClass.value);
  if (filterEls.remoteType.value) params.set("remoteType", filterEls.remoteType.value);
  if (filterEls.source.value) params.set("source", filterEls.source.value);
  const postedSince = postedSinceIso(filterEls.postedSince.value);
  if (postedSince) params.set("postedSince", postedSince);
  if (filterEls.status.value) params.set("status", filterEls.status.value);
  if (filterEls.hideExcluded.checked) params.set("excludeExcluded", "true");
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(currentPage * PAGE_SIZE));
  return params;
}

function jobCardHtml(job) {
  const sponsorBadge = job.sponsorMatchName
    ? `<span class="badge likely">matched "${esc(job.sponsorMatchName)}" (${job.sponsorConfidence})</span>`
    : job.sponsorStatus === "no"
      ? `<span class="badge no">sponsorship text: no</span>`
      : `<span class="badge">not found on register</span>`;

  const posted = job.postedAt ? ` · posted ${esc(job.postedAt.slice(0, 10))}` : "";

  const statusButtons = ["new", "applied", "ignored"]
    .map(
      (s) =>
        `<button class="secondary ${job.status === s ? "active" : ""}" data-job-id="${job.id}" data-status="${s}">${
          s === "new" ? "Reset" : s === "applied" ? "Mark applied" : "Ignore"
        }</button>`,
    )
    .join("");

  return `
    <div class="card status-${job.status}" data-card-id="${job.id}">
      <h4><a href="${esc(job.url)}" target="_blank" rel="noopener">${esc(job.title)}</a></h4>
      <div class="meta"><strong>${esc(job.employerRaw)}</strong> · ${esc(job.location)} (${job.remoteType})</div>
      <div class="meta">Salary: ${esc(job.salaryText ?? "not shown")} ${job.salaryClass ? `(${job.salaryClass})` : ""}</div>
      <div class="meta">${sponsorBadge}</div>
      <div class="meta">Source: ${esc(job.source)}${posted}</div>
      <div class="card-actions">${statusButtons}<button class="secondary" data-generate-id="${job.id}" data-generate-title="${esc(job.title)}">Generate CV + cover letter</button></div>
    </div>`;
}

function renderPagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total === 0) {
    paginationEl.classList.add("hidden");
    return;
  }
  paginationEl.classList.remove("hidden");
  const from = currentPage * PAGE_SIZE + 1;
  const to = Math.min(total, (currentPage + 1) * PAGE_SIZE);
  pageInfoEl.textContent = `${from}-${to} of ${total} · page ${currentPage + 1} of ${totalPages}`;
  prevPageBtn.disabled = currentPage === 0;
  nextPageBtn.disabled = currentPage >= totalPages - 1;
}

async function loadJobs() {
  const params = currentFilters();
  const res = await fetch(`/api/jobs?${params.toString()}`);
  const data = await res.json();

  if (data.jobs.length === 0) {
    jobListEl.innerHTML = `<p class="empty">No jobs match these filters.</p>`;
    paginationEl.classList.add("hidden");
    return;
  }
  jobListEl.innerHTML = `<p class="summary-line">${data.total} job(s)</p>` + data.jobs.map(jobCardHtml).join("\n");
  renderPagination(data.total);
}

function populateSourceDropdown() {
  const select = filterEls.source;
  const current = select.value;
  const category = filterEls.category.value;
  const visible = category ? dbSourcesCache.filter((s) => s.category === category) : dbSourcesCache;

  select.innerHTML = `<option value="">Company: any</option>`;
  for (const { source } of visible) {
    const opt = document.createElement("option");
    opt.value = source;
    opt.textContent = source;
    select.appendChild(opt);
  }
  if (visible.some((s) => s.source === current)) {
    select.value = current;
  }
}

async function loadSourcesIntoFilter() {
  const res = await fetch("/api/sources");
  const data = await res.json();
  dbSourcesCache = data.dbSources;

  const categorySelect = filterEls.category;
  const currentCategory = categorySelect.value;
  categorySelect.innerHTML = `<option value="">Source: any</option>`;
  for (const { category, label } of data.categories) {
    const opt = document.createElement("option");
    opt.value = category;
    opt.textContent = label;
    categorySelect.appendChild(opt);
  }
  categorySelect.value = currentCategory;

  populateSourceDropdown();
}

async function loadSourceHealth() {
  const res = await fetch("/api/sources/health");
  const data = await res.json();
  if (data.results.length === 0) {
    sourceHealthEl.innerHTML = "";
    return;
  }
  sourceHealthEl.innerHTML = data.results
    .map(
      (r) =>
        `<span class="pill ${r.status}">${esc(r.sourceId)}: ${r.status === "ok" ? `${r.count} jobs` : esc(r.error || "failed")}</span>`,
    )
    .join("");
}

function setStatusOptimistically(jobId, status) {
  const card = jobListEl.querySelector(`[data-card-id="${jobId}"]`);
  if (!card) return;
  card.className = `card status-${status}`;
  card.querySelectorAll(".card-actions button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.status === status);
  });
}

jobListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-job-id]");
  if (!btn) return;
  const { jobId, status } = btn.dataset;
  setStatusOptimistically(jobId, status);
  await fetch(`/api/jobs/${jobId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (filterEls.status.value && filterEls.status.value !== status) {
    loadJobs();
  }
});

function openGenerateModal(title) {
  generateModalTitle.textContent = `Generate CV + cover letter — ${title}`;
  generateModalBody.innerHTML = `<div class="modal-loading"><div class="spinner"></div> Generating with Claude Code (reading your CV, writing both documents)... this can take up to a couple of minutes.</div>`;
  generateModal.classList.remove("hidden");
}

function closeGenerateModal() {
  generateModal.classList.add("hidden");
}

function docSectionHtml(label, text, copyId, pdfUrl) {
  const pdfLink = pdfUrl ? ` <a class="pdf-link" href="${esc(pdfUrl)}" target="_blank">Open PDF</a>` : "";
  return `
    <div class="doc-section">
      <h4><span>${label}${pdfLink}</span><button class="secondary" data-copy-target="${copyId}">Copy</button></h4>
      <pre id="${copyId}">${esc(text)}</pre>
    </div>`;
}

function renderGenerateResult(data) {
  const noteHtml = data.note ? `<p class="generate-note">${esc(data.note)}</p>` : "";
  generateModalBody.innerHTML =
    noteHtml +
    docSectionHtml("Tailored CV", data.tailoredCv, "generatedCv", data.cvPdfUrl) +
    docSectionHtml("Cover letter", data.coverLetter, "generatedCoverLetter", data.coverLetterPdfUrl) +
    `<p class="saved-note">Also saved to ${esc(data.savedDir)}</p>`;
}

function renderGenerateError(message) {
  generateModalBody.innerHTML = `<p class="modal-error">${esc(message)}</p>`;
}

closeGenerateModalBtn.addEventListener("click", closeGenerateModal);
generateModal.addEventListener("click", (e) => {
  if (e.target === generateModal) closeGenerateModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !generateModal.classList.contains("hidden")) closeGenerateModal();
});
generateModalBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-copy-target]");
  if (!btn) return;
  const pre = document.getElementById(btn.dataset.copyTarget);
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => {
    const original = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => {
      btn.textContent = original;
    }, 1500);
  });
});

jobListEl.addEventListener("click", async (e) => {
  const genBtn = e.target.closest("button[data-generate-id]");
  if (!genBtn) return;
  const jobId = genBtn.dataset.generateId;
  const title = genBtn.dataset.generateTitle;
  openGenerateModal(title);
  try {
    const res = await fetch(`/api/jobs/${jobId}/generate`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      renderGenerateError(data.error || "Something went wrong.");
      return;
    }
    renderGenerateResult(data);
  } catch (err) {
    renderGenerateError(String(err));
  }
});

for (const [key, el] of Object.entries(filterEls)) {
  const eventName = key === "search" ? "input" : "change";
  el.addEventListener(eventName, () => {
    currentPage = 0;
    if (key === "category") populateSourceDropdown();
    if (key === "search") {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(loadJobs, 300);
    } else {
      loadJobs();
    }
  });
}

prevPageBtn.addEventListener("click", () => {
  if (currentPage === 0) return;
  currentPage -= 1;
  loadJobs();
});

nextPageBtn.addEventListener("click", () => {
  currentPage += 1;
  loadJobs();
});

function renderProgress(state) {
  if (!state.running && state.phase === "idle") {
    progressEl.classList.add("hidden");
    return;
  }
  progressEl.classList.remove("hidden");

  if (state.phase === "sponsors") {
    progressTextEl.textContent = "Updating sponsor register...";
  } else if (state.phase === "sources") {
    const last = state.sources[state.sources.length - 1];
    const doneCount = state.sources.filter((s) => s.status !== "running").length;
    const total = last ? last.total : 0;
    progressTextEl.textContent = last
      ? `Fetching ${last.sourceId} (${doneCount}/${total})...`
      : "Fetching sources...";
  } else if (state.phase === "done") {
    const ok = state.sources.filter((s) => s.status === "ok").length;
    const failed = state.sources.filter((s) => s.status === "failed").length;
    progressTextEl.textContent = `Done: ${ok} ok, ${failed} failed.`;
  } else if (state.phase === "error") {
    progressTextEl.textContent = `Update failed: ${state.error}`;
  }

  if (!state.running) {
    setTimeout(() => progressEl.classList.add("hidden"), 4000);
  }
}

async function pollUpdateStatus() {
  const res = await fetch("/api/update/status");
  const state = await res.json();
  renderProgress(state);
  if (state.running) {
    pollTimer = setTimeout(pollUpdateStatus, 1000);
  } else {
    clearTimeout(pollTimer);
    refreshBtn.disabled = false;
    loadJobs();
    loadSourceHealth();
    loadSourcesIntoFilter();
  }
}

refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  const res = await fetch("/api/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ includeSponsors: includeSponsorsEl.checked }),
  });
  if (res.status === 409) {
    refreshBtn.disabled = false;
    return;
  }
  pollUpdateStatus();
});

loadJobs();
loadSourcesIntoFilter();
loadSourceHealth();
