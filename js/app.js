const STORE_KEY = "kivi.takes.v2";
const PREF_KEY = "kivi.prefs.v1";
const TASK_KEY = "kivi.tasks.v1";

const seed = [
  { text: "Vendor call wrapped up — pricing's fine but we need the updated SLA doc before anyone signs. Flagging for the manager.", tags: ["vendor", "call"], daysAgo: 1, hour: 17, minute: 5 },
  { text: "Ananya wants the onboarding flow demo moved up to Thursday, need to confirm with the design team.", tags: ["note"], daysAgo: 1, hour: 9, minute: 40 },
  { text: "Alt chaalu aiti adu.", tags: ["kannada"], daysAgo: 1, hour: 20, minute: 10 },
  { text: "ಭಾಷೆ ಏನೇಇತ.", tags: ["kannada"], daysAgo: 0, hour: 9, minute: 5 },
  { text: "Reminder, follow up with Rohan about the Q3 rollout budget signoff.", tags: ["note", "reminder"], daysAgo: 0, hour: 11, minute: 30 },
  { text: "Hey Kivi, I want you to tell me the meaning of what the second chat in history was about.", tags: ["question"], daysAgo: 0, hour: -1, minute: 0 },
];

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function seedTimestamp(s) {
  const d = new Date();
  d.setDate(d.getDate() - s.daysAgo);
  if (s.hour === -1) return Date.now() - 90 * 60 * 1000; // "an hour and a half ago", regardless of clock time
  d.setHours(s.hour, s.minute, 0, 0);
  return d.getTime();
}

function loadTakes() {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) return JSON.parse(raw);
  const takes = seed.map((s, i) => ({
    id: uid(),
    text: s.text,
    tags: s.tags,
    pinned: false,
    favorite: i === 0,
    createdAt: seedTimestamp(s),
    entities: KiviEngine.extractCandidateSignals(s.text),
  }));
  localStorage.setItem(STORE_KEY, JSON.stringify(takes));
  return takes;
}

function saveTakes(takes) {
  localStorage.setItem(STORE_KEY, JSON.stringify(takes));
}

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(TASK_KEY)) || [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(TASK_KEY, JSON.stringify(tasks));
}

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY)) || {};
  } catch {
    return {};
  }
}

const CAND_KEY = "kivi.candidates.v1";
function loadCandidates() {
  try {
    return JSON.parse(localStorage.getItem(CAND_KEY)) || {};
  } catch {
    return {};
  }
}
function bumpCandidates(signals, takeId) {
  const cand = loadCandidates();
  [...signals.properNouns, ...signals.keywords].forEach((term) => {
    const k = term.toLowerCase();
    if (!cand[k]) cand[k] = { term, count: 0, lastTakeId: takeId };
    cand[k].count += 1;
    cand[k].lastTakeId = takeId;
  });
  localStorage.setItem(CAND_KEY, JSON.stringify(cand));
}

function words(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function isToday(ts) {
  return new Date(ts).toDateString() === new Date().toDateString();
}

function greeting(hour) {
  if (hour >= 22 || hour < 5) return "<em>night</em> owl hours — keep it low.";
  if (hour < 12) return "<em>morning</em> light — ease in.";
  if (hour < 17) return "<em>afternoon</em> drift — stay curious.";
  return "<em>dusk</em> hush — one more thought.";
}

function clockTheme(hour) {
  return hour >= 19 || hour < 6 ? "night" : "day";
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const app = document.querySelector(".app");
const prefs = Object.assign({ theme: "auto", scene: "bridge", type: "serif" }, loadPrefs());
let takes = loadTakes();

// Reload takes from localStorage — called after corpus import so Hey Kivi
// immediately searches the full 310-record corpus without a page reload.
function reloadTakes() {
  takes = loadTakes();
  renderAll();
}
let tasks = loadTasks();
let selectedId = null;
let recognizing = false;
let recognition = null;
let kiviOn = false;
let kiviRec = null;
const kiviLog = [];

function persistPrefs() {
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}

function resolvedTheme() {
  if (prefs.theme === "auto") return clockTheme(new Date().getHours());
  return prefs.theme;
}

function applyChrome() {
  app.dataset.theme = resolvedTheme();
  app.dataset.scene = prefs.scene;
  app.style.setProperty("--take-font", prefs.type === "sans" ? "var(--sans)" : "var(--serif)");
  const line = document.getElementById("greeting-line");
  if (line) line.innerHTML = greeting(new Date().getHours());
  document.querySelectorAll("#theme-pills button").forEach((b) => b.classList.toggle("on", b.dataset.theme === prefs.theme));
  document.querySelectorAll("#scene-pills button").forEach((b) => b.classList.toggle("on", b.dataset.scene === prefs.scene));
  document.querySelectorAll("#type-pills button").forEach((b) => b.classList.toggle("on", b.dataset.type === prefs.type));
  const captions = {
    bridge: "hover the lanterns · click the kiwi",
    grove: "moon grove — drag the kiwi with your cursor",
    rain: "rain on the glass",
    meadow: "morning meadow",
  };
  document.getElementById("scene-caption").textContent = captions[prefs.scene] || captions.bridge;
}

function orderedTakes() {
  return takes.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
}

function renderRecord() {
  const latest = selectedId ? takes.find((x) => x.id === selectedId) : orderedTakes()[0];
  document.getElementById("latest-body").textContent = latest ? latest.text : "Press talk, or type a thought below.";
  document.getElementById("latest-time").textContent = latest
    ? new Date(latest.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()
    : "";
  const today = takes.filter((t) => isToday(t.createdAt));
  document.getElementById("today-count").textContent = `${today.length} take${today.length === 1 ? "" : "s"} today · from kivi.local`;
  document.getElementById("word-flight").textContent = today.reduce((n, t) => n + words(t.text).length, 0);
  document.getElementById("recent-list").innerHTML = orderedTakes()
    .slice(0, 6)
    .map(
      (t) =>
        `<li><span>${escapeHtml(t.text)}</span><span class="take-meta">${t.favorite ? "★ " : ""}Kivi.App</span></li>`
    )
    .join("");
}

function filteredTakes() {
  const q = (document.getElementById("search").value || "").trim().toLowerCase();
  const pin = document.getElementById("only-pinned").checked;
  const fav = document.getElementById("only-fav").checked;
  return orderedTakes().filter((t) => {
    if (pin && !t.pinned) return false;
    if (fav && !t.favorite) return false;
    if (!q) return true;
    return t.text.toLowerCase().includes(q) || t.tags.join(" ").toLowerCase().includes(q);
  });
}

function renderHistory() {
  const list = document.getElementById("history-list");
  const rows = filteredTakes();
  if (!rows.length) {
    list.innerHTML = `<li class="take-row"><span class="body">Nothing here yet.</span></li>`;
    return;
  }
  list.innerHTML = rows
    .map(
      (t) => `<li class="take-row" data-id="${t.id}">
        <div class="body">${t.tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}${escapeHtml(t.text)}</div>
        <div class="take-meta">${new Date(t.createdAt).toLocaleString()}</div>
        <div class="actions">
          <button data-act="pin">${t.pinned ? "unpin" : "pin"}</button>
          <button data-act="fav">${t.favorite ? "unstar" : "star"}</button>
          <button data-act="del">forget</button>
        </div>
      </li>`
    )
    .join("");
}

function renderTasks() {
  const doing = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  document.getElementById("doing-list").innerHTML = doing
    .map(
      (t) =>
        `<li data-id="${t.id}"><span>${escapeHtml(t.text)}</span><div class="actions"><button data-act="complete">done</button><button data-act="del">forget</button></div></li>`
    )
    .join("") || `<li class="subtle">Nothing open. Add one above.</li>`;
  document.getElementById("done-list").innerHTML = done
    .map(
      (t) =>
        `<li data-id="${t.id}"><span>${escapeHtml(t.text)}</span><div class="actions"><button data-act="reopen">reopen</button><button data-act="del">forget</button></div></li>`
    )
    .join("") || `<li class="subtle">No completed tasks yet.</li>`;
}

function renderWhyPanel(trace) {
  if (!trace) return "";
  const rows = (trace.reasoning || []).map((r) => `<div class="why-row">• ${escapeHtml(r)}</div>`).join("");
  const retrieved = (trace.retrieved || [])
    .map((r) => `<div class="why-row">retrieved <b>${r.takeId}</b>${r.score !== undefined ? ` · score ${r.score}` : ""}${r.reasons ? ` · ${r.reasons.join(", ")}` : ""}</div>`)
    .join("");
  const memUsed = (trace.memoryUsed || [])
    .map((m) => `<div class="why-row">memory used → <b>${escapeHtml(m.key)}</b>: ${escapeHtml(String(m.value))}</div>`)
    .join("");
  const totalMs = (trace.latency || []).reduce((s, x) => s + x.ms, 0);
  const models = [...new Set((trace.latency || []).map((x) => x.model).filter((m) => m && m !== "-"))];
  return `<div class="why-panel">
    ${rows}
    ${retrieved}
    ${memUsed}
    <div class="why-cost">
      <span>latency: ${totalMs}ms</span>
      <span>cost: $${(trace.costUsd || 0).toFixed(5)}</span>
      <span>models: ${models.length ? models.join(", ") : "none (rule-based)"}</span>
    </div>
  </div>`;
}

function renderKivi() {
  document.getElementById("kivi-log").innerHTML = kiviLog
    .map((m, i) => {
      if (m.who === "you") return `<li class="you">${escapeHtml(m.text)}</li>`;
      const opts = m.clarifyOptions
        ? `<div class="clarify-opts">${m.clarifyOptions
            .map((o) => `<button type="button" data-clarify="${i}" data-take="${o.id}">${escapeHtml(o.label)}</button>`)
            .join("")}</div>`
        : "";
      const why = m.trace
        ? `<button type="button" class="why-toggle" data-why="${i}">why?</button><div class="why-panel-holder" id="why-${i}" style="display:none">${renderWhyPanel(m.trace)}</div>`
        : "";
      return `<li class="bot">${escapeHtml(m.text)}${opts}${why}</li>`;
    })
    .join("");
}

document.getElementById("kivi-log").addEventListener("click", (e) => {
  const whyBtn = e.target.closest("button[data-why]");
  if (whyBtn) {
    const panel = document.getElementById(`why-${whyBtn.dataset.why}`);
    if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    return;
  }
  const clarifyBtn = e.target.closest("button[data-clarify]");
  if (clarifyBtn) {
    const msgIndex = Number(clarifyBtn.dataset.clarify);
    const takeId = clarifyBtn.dataset.take;
    const pendingQuery = kiviLog[msgIndex].pendingQuery;
    const result = KiviEngine.resumeWithChoice(takeId, pendingQuery, takes);
    kiviLog[msgIndex].clarifyOptions = null; // collapse the choices once picked
    kiviLog.push({ who: "bot", text: result.reply, trace: result.trace });
    renderKivi();
  }
});

function processHeyKiviInput(text) {
  if (!text || !text.trim()) return;
  kiviLog.push({ who: "you", text });
  const result = KiviEngine.handleHeyKivi(text, { takes });
  const entry = { who: "bot", text: result.reply, trace: result.trace };
  if (result.clarifyOptions) {
    entry.clarifyOptions = result.clarifyOptions;
    entry.pendingQuery = text;
  }
  kiviLog.push(entry);
  addTake(text, ["hey-kivi"]);
  renderKivi();
  renderMemory();
}

function renderAll() {
  applyChrome();
  renderRecord();
  renderHistory();
  renderTasks();
  renderKivi();
  renderMemory();
}

function addTake(text, extraTags = []) {
  text = text.trim();
  if (!text) return;
  const tags = extraTags.map((s) => String(s).trim()).filter(Boolean);
  const id = uid();
  // Dictation only ever DEPOSITS candidate signals — it never reads memory
  // back to change what's captured. That boundary is what keeps ordinary
  // dictation fast and unsurprising while Hey Kivi does the smart part.
  const entities = KiviEngine.extractCandidateSignals(text);
  bumpCandidates(entities, id);
  takes.unshift({
    id,
    text,
    tags: [...new Set(tags)],
    pinned: false,
    favorite: false,
    createdAt: Date.now(),
    entities,
  });
  selectedId = id;
  saveTakes(takes);
  document.getElementById("take-input").value = "";
  renderAll();
}

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("hidden", v.id !== `view-${name}`));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  app.dataset.page = name;
}

document.querySelectorAll("[data-view]").forEach((el) => {
  el.addEventListener("click", () => showView(el.dataset.view));
});

document.getElementById("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const tags = document.getElementById("tag-input").value.split(/[, ]+/);
  addTake(document.getElementById("take-input").value, tags);
});

document.getElementById("history-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const tags = document.getElementById("history-tags").value.split(/[, ]+/);
  addTake(document.getElementById("history-input").value, tags);
  document.getElementById("history-input").value = "";
  document.getElementById("history-tags").value = "";
  showView("history");
});

document.getElementById("history-list").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.closest("[data-id]").dataset.id;
  const t = takes.find((x) => x.id === id);
  if (!t) return;
  if (btn.dataset.act === "pin") t.pinned = !t.pinned;
  if (btn.dataset.act === "fav") t.favorite = !t.favorite;
  if (btn.dataset.act === "del") {
    takes = takes.filter((x) => x.id !== id);
    if (selectedId === id) selectedId = null;
  }
  saveTakes(takes);
  renderAll();
});

document.getElementById("search").addEventListener("input", renderHistory);
document.getElementById("only-pinned").addEventListener("change", renderHistory);
document.getElementById("only-fav").addEventListener("change", renderHistory);

document.getElementById("task-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = document.getElementById("task-input").value.trim();
  if (!text) return;
  tasks.unshift({ id: uid(), text, done: false, createdAt: Date.now() });
  document.getElementById("task-input").value = "";
  saveTasks();
  renderTasks();
});

function onTaskClick(e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.closest("[data-id]").dataset.id;
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  if (btn.dataset.act === "complete") t.done = true;
  if (btn.dataset.act === "reopen") t.done = false;
  if (btn.dataset.act === "del") tasks = tasks.filter((x) => x.id !== id);
  saveTasks();
  renderTasks();
}

document.getElementById("doing-list").addEventListener("click", onTaskClick);
document.getElementById("done-list").addEventListener("click", onTaskClick);

function speechEngine(onResult, onEnd) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-IN";
  rec.onresult = onResult;
  rec.onend = onEnd;
  rec.onerror = onEnd;
  return rec;
}

function setTalk(on) {
  recognizing = on;
  document.getElementById("talk-btn").classList.toggle("live", on);
  document.getElementById("talk-btn").textContent = on ? "stop" : "talk";
  document.getElementById("rec-status").hidden = !on;
}

function toggleTalk() {
  if (app.dataset.page !== "dictate") showView("dictate");
  if (!recognition) {
    recognition = speechEngine(
      (ev) => {
        let finalText = "";
        let interim = "";
        for (let i = 0; i < ev.results.length; i++) {
          const chunk = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) finalText += chunk;
          else interim += chunk;
        }
        document.getElementById("take-input").value = (finalText + " " + interim).trim();
      },
      () => {
        if (recognizing) {
          const text = document.getElementById("take-input").value;
          setTalk(false);
          addTake(text, ["voice"]);
        }
      }
    );
  }
  if (!recognition) {
    document.getElementById("rec-status").hidden = false;
    document.getElementById("rec-status").textContent = "Voice needs Chrome or Edge. Type instead — your take still keeps.";
    document.getElementById("take-input").focus();
    return;
  }
  if (recognizing) {
    recognizing = false;
    recognition.stop();
    setTalk(false);
    addTake(document.getElementById("take-input").value, ["voice"]);
    return;
  }
  setTalk(true);
  document.getElementById("take-input").value = "";
  recognition.start();
}

document.getElementById("talk-btn").addEventListener("click", toggleTalk);

const waveBars = document.getElementById("wave-bars");
for (let i = 0; i < 22; i++) {
  const s = document.createElement("span");
  s.style.animationDelay = `${(i % 8) * 0.08}s`;
  s.style.height = `${14 + ((i * 13) % 70)}px`;
  waveBars.appendChild(s);
}

function setKivi(on) {
  kiviOn = on;
  document.getElementById("wave-stage").classList.toggle("live", on);
  document.getElementById("kivi-btn").textContent = on ? "stop" : "listen";
}

function toggleKivi() {
  showView("kivi");
  if (!kiviRec) {
    kiviRec = speechEngine(
      (ev) => {
        let finalText = "";
        let interim = "";
        for (let i = 0; i < ev.results.length; i++) {
          const chunk = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) finalText += chunk;
          else interim += chunk;
        }
        document.getElementById("kivi-live").textContent = (finalText + " " + interim).trim();
      },
      () => {
        if (!kiviOn) return;
        const text = document.getElementById("kivi-live").textContent.trim();
        setKivi(false);
        if (!text) return;
        processHeyKiviInput(text);
        document.getElementById("kivi-live").textContent = "";
      }
    );
  }
  if (!kiviRec) {
    document.getElementById("kivi-live").textContent = "Voice needs Chrome or Edge — use the text box below instead.";
    return;
  }
  if (kiviOn) {
    kiviOn = false;
    kiviRec.stop();
    setKivi(false);
    const text = document.getElementById("kivi-live").textContent.trim();
    if (text) {
      processHeyKiviInput(text);
      document.getElementById("kivi-live").textContent = "";
    }
    return;
  }
  setKivi(true);
  document.getElementById("kivi-live").textContent = "";
  kiviRec.start();
}

document.getElementById("kivi-btn").addEventListener("click", toggleKivi);

document.getElementById("kivi-text-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("kivi-text-input");
  const text = input.value.trim();
  if (!text) return;
  showView("kivi");
  processHeyKiviInput(text);
  input.value = "";
});

/* ---------------- memory view ---------------- */
function timeAgo(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function renderMemory() {
  const statsEl = document.getElementById("mem-stats");
  if (!statsEl) return; // view not yet in DOM on first paint order, safe guard
  const stats = KiviEngine.memoryStats();
  statsEl.innerHTML = `
    <span class="stat-pill"><b>${stats.count}</b> memory items</span>
    <span class="stat-pill"><b>${stats.confirmed}</b> confirmed</span>
    <span class="stat-pill"><b>${stats.candidates}</b> candidate (not yet trusted)</span>
    <span class="stat-pill"><b>${stats.bytes}</b> bytes on device</span>
  `;

  const mem = KiviEngine.getMemory();
  const toneItems = mem.filter((m) => m.type === "tone");
  const glossItems = mem.filter((m) => m.type === "glossary");

  const renderItem = (m) => `
    <li class="mem-item">
      <div class="mem-main">
        <span class="mem-key">${escapeHtml(m.key)}</span>
        <span class="mem-val">${escapeHtml(String(m.value))}</span>
        <span class="mem-badge ${m.status}">${m.status}</span>
        <div class="mem-evidence">${m.evidence.length} signal${m.evidence.length === 1 ? "" : "s"} · ${m.evidence.map((e) => e.signal).join(", ")} · updated ${timeAgo(m.updatedAt)}</div>
      </div>
      <button class="mem-del" data-mem-del="${m.id}">forget</button>
    </li>`;

  document.getElementById("mem-tone-list").innerHTML =
    toneItems.map(renderItem).join("") || `<li class="subtle">No tone preferences learned yet — give Hey Kivi feedback like “too formal” after a polish and it'll start remembering.</li>`;
  document.getElementById("mem-glossary-list").innerHTML =
    glossItems.map(renderItem).join("") || `<li class="subtle">No terms taught yet.</li>`;

  const cand = loadCandidates();
  const learnedKeys = new Set(mem.map((m) => m.key.toLowerCase()));
  const topCandidates = Object.values(cand)
    .filter((c) => !learnedKeys.has(c.term.toLowerCase()))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);
  document.getElementById("mem-candidates").innerHTML =
    topCandidates.map((c) => `<span class="candidate-chip">${escapeHtml(c.term)} · seen ${c.count}×</span>`).join("") ||
    `<span class="subtle">Nothing noticed yet — dictate a few takes.</span>`;

  const decs = KiviEngine.getDecisions().slice(0, 20);
  document.getElementById("dec-list").innerHTML =
    decs
      .map(
        (d, i) => `<li class="take-row">
        <div class="body">${escapeHtml(d.query)}</div>
        <div class="take-meta">${d.action} · ${new Date(d.ts).toLocaleString()}</div>
        <button type="button" class="why-toggle" data-dec-why="${i}">why?</button>
        <div id="dec-why-${i}" style="display:none">${renderWhyPanel(d)}</div>
      </li>`
      )
      .join("") || `<li class="subtle">No Hey Kivi interactions yet.</li>`;
}

document.getElementById("dec-list").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-dec-why]");
  if (!btn) return;
  const panel = document.getElementById(`dec-why-${btn.dataset.decWhy}`);
  if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
});

document.getElementById("mem-tone-list").addEventListener("click", onMemDelete);
document.getElementById("mem-glossary-list").addEventListener("click", onMemDelete);
function onMemDelete(e) {
  const btn = e.target.closest("button[data-mem-del]");
  if (!btn) return;
  KiviEngine.deleteMemory(btn.dataset.memDel);
  renderMemory();
}

document.getElementById("teach-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const term = document.getElementById("teach-term").value.trim();
  const canonical = document.getElementById("teach-canonical").value.trim();
  if (!term || !canonical) return;
  KiviEngine.teachGlossaryTerm(term, canonical, term);
  document.getElementById("teach-term").value = "";
  document.getElementById("teach-canonical").value = "";
  renderMemory();
});

/* ---------------- dev corpus view + import --------------------------------- */
let corpusData = [];

// ── banner state: reflect current import status ──────────────────────────────
function refreshImportBanner() {
  const meta = CorpusImport.importMeta();
  const banner = document.getElementById("import-banner");
  const importBtn = document.getElementById("import-btn");
  const resetBtn  = document.getElementById("reset-btn");
  const statsRow  = document.getElementById("import-stats-row");
  if (meta) {
    banner.classList.add("done");
    document.querySelector(".import-title").textContent = "corpus ingested ✓";
    document.querySelector(".import-desc").textContent =
      `Imported ${new Date(meta.importedAt).toLocaleString()} — ` +
      `${meta.report.takes} takes, ${meta.report.memoryItems} memory items, ` +
      `${meta.report.decisions} decisions loaded into the live pipeline.`;
    document.getElementById("imp-takes").textContent = `${meta.report.takes} takes`;
    document.getElementById("imp-mem").textContent   = `${meta.report.memoryItems} memory items`;
    document.getElementById("imp-dec").textContent   = `${meta.report.decisions} decisions`;
    document.getElementById("imp-cand").textContent  = `${meta.report.candidates} candidates`;
    statsRow.style.display = "flex";
    importBtn.style.display = "none";
    resetBtn.style.display  = "";
  } else {
    banner.classList.remove("done");
    importBtn.style.display = "";
    resetBtn.style.display  = "none";
    statsRow.style.display  = "none";
  }
}

function initCorpusData(rows) {
  corpusData = rows;
  const langs = [...new Set(rows.map((r) => r.language))].sort();
  const sel = document.getElementById("corpus-lang");
  sel.innerHTML = `<option value="">all languages</option>` + langs.map((l) => `<option value="${l}">${l}</option>`).join("");
  renderCorpus();
  refreshImportBanner();
}

fetch("data/corpus.json")
  .then((r) => r.json())
  .then((rows) => initCorpusData(rows))
  .catch(() => {
    // file:// or no server — fall back to the corpus embedded in corpus-import.js
    if (typeof CorpusImport !== "undefined" && CorpusImport.getEmbedded) {
      initCorpusData(CorpusImport.getEmbedded());
    } else {
      document.getElementById("corpus-count").textContent = "Could not load corpus.json.";
      refreshImportBanner();
    }
  });

// ── import button ────────────────────────────────────────────────────────────
document.getElementById("import-btn").addEventListener("click", async () => {
  if (!corpusData.length) { alert("Corpus still loading — try again in a moment."); return; }
  const btn      = document.getElementById("import-btn");
  const progress = document.getElementById("import-progress");
  const bar      = document.getElementById("import-bar-fill");
  const label    = document.getElementById("import-progress-label");
  btn.disabled   = true;
  btn.textContent = "ingesting…";
  progress.style.display = "";

  const report = await CorpusImport.runEmbedded({
    onProgress(done, total) {
      const pct = Math.round((done / total) * 100);
      bar.style.width   = pct + "%";
      label.textContent = `${done} of ${total} records processed…`;
    },
  });

  progress.style.display = "none";
  // Reload takes/memory/decisions into the live engine without a page reload
  reloadTakes();
  // KiviEngine reads memory fresh from localStorage on each call already
  // Decisions need re-sync too
  refreshImportBanner();
  renderMemory();
  renderAll();
  label.textContent = "";
});

// ── reset button ─────────────────────────────────────────────────────────────
document.getElementById("reset-btn").addEventListener("click", () => {
  if (!confirm("This wipes all takes, memory, and decisions and returns to the blank seed state. Continue?")) return;
  CorpusImport.reset();
  reloadTakes();
  refreshImportBanner();
  renderMemory();
  renderAll();
});

function renderCorpus() {
  const q = (document.getElementById("corpus-search").value || "").toLowerCase();
  const lang = document.getElementById("corpus-lang").value;
  const rows = corpusData.filter((r) => {
    if (lang && r.language !== lang) return false;
    if (!q) return true;
    return (r.raw_asr + " " + r.llm_formatted + " " + (r.entities || []).join(" ")).toLowerCase().includes(q);
  });
  document.getElementById("corpus-count").textContent = `${rows.length} of ${corpusData.length} records`;
  const actionColour = {
    retrieved_and_polished:  "var(--accent)",
    tone_learned:            "var(--amber)",
    glossary_taught:         "var(--amber)",
    asked_clarification:     "#8ac",
    rejected_low_confidence: "var(--danger)",
    candidate_noticed:       "var(--muted)",
    tone_candidate:          "var(--muted)",
    none:                    "var(--muted)",
  };
  document.getElementById("corpus-list").innerHTML = rows
    .slice(0, 60)
    .map(
      (r) => {
        const col = actionColour[r.memory_action] || "var(--muted)";
        const prov = r.memory_provenance
          ? (Array.isArray(r.memory_provenance) ? r.memory_provenance : [r.memory_provenance])
              .filter(p => p && p.key)
              .map(p => `${escapeHtml(p.key)} → ${escapeHtml(String(p.value))}`)
              .join(", ")
          : "";
        return `<li class="corpus-item">
          <div class="raw">raw asr: ${escapeHtml(r.raw_asr)}</div>
          <div class="clean">${escapeHtml(r.llm_formatted || r.raw_asr)}</div>
          ${r.reason ? `<div class="raw" style="margin-top:4px;color:var(--muted)">${escapeHtml(r.reason)}</div>` : ""}
          ${prov ? `<div class="raw" style="color:var(--amber);margin-top:2px">provenance: ${prov}</div>` : ""}
          <div class="meta">
            <span>${r.language}</span><span>${r.mode}</span><span>${new Date(r.timestamp).toLocaleString()}</span>
            <span>entities: ${(r.entities || []).join(", ") || "—"}</span>
            <span style="color:${col}">${r.memory_action}</span>
            <span>${r.latency_ms}ms</span><span>$${r.cost_usd}</span><span>${r.model_used}</span>
          </div>
        </li>`;
      }
    )
    .join("");
  if (rows.length > 60) {
    document.getElementById("corpus-list").innerHTML += `<li class="subtle">…and ${rows.length - 60} more. Narrow your search to see them.</li>`;
  }
}
document.getElementById("corpus-search").addEventListener("input", renderCorpus);
document.getElementById("corpus-lang").addEventListener("change", renderCorpus);

document.getElementById("theme-pills").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-theme]");
  if (!b) return;
  prefs.theme = b.dataset.theme;
  persistPrefs();
  applyChrome();
});
document.getElementById("scene-pills").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-scene]");
  if (!b) return;
  prefs.scene = b.dataset.scene;
  persistPrefs();
  applyChrome();
});
document.getElementById("type-pills").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-type]");
  if (!b) return;
  prefs.type = b.dataset.type;
  persistPrefs();
  applyChrome();
});

document.addEventListener("keydown", (e) => {
  const typing = ["INPUT", "TEXTAREA"].includes(e.target.tagName);
  if ((e.ctrlKey && e.metaKey) || (e.ctrlKey && e.key.toLowerCase() === "k")) {
    e.preventDefault();
    toggleTalk();
    return;
  }
  if (e.key === "Escape") {
    if (recognizing && recognition) {
      recognizing = false;
      recognition.stop();
      setTalk(false);
    }
    if (kiviOn && kiviRec) {
      kiviOn = false;
      kiviRec.stop();
      setKivi(false);
    }
    document.getElementById("search").value = "";
    renderHistory();
  }
  if (!typing && e.key === "/") {
    e.preventDefault();
    showView("history");
    document.getElementById("search").focus();
  }
  if (!typing && e.key >= "1" && e.key <= "8") {
    showView(["home", "dictate", "kivi", "history", "done", "doing", "shortcuts", "styles"][Number(e.key) - 1]);
  }
  if (!typing && e.key === "9") showView("memory");
  if (!typing && e.key === "0") showView("corpus");
});

Bird.start(document.getElementById("yard"), document.getElementById("kiwi-bird"));
Scenes.startHome(document.getElementById("home-scene"));

Scenes.start(document.getElementById("scene"), () => ({
  theme: resolvedTheme(),
  scene: prefs.scene,
}));

// Initialise import banner immediately — works even if corpus.json fetch fails
// (e.g. when opened as file://)
if (typeof CorpusImport !== "undefined") refreshImportBanner();

renderAll();
showView("home");
