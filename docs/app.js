/* Adani Intel Hub: front-end. No framework, no build step.
   Reads docs/data/*.json written by the daily pipeline. Reading comes first; audio is a companion. */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get: (k, d) => { try { const v = localStorage.getItem("aih_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("aih_" + k, JSON.stringify(v)); } catch {} },
  del: k => { try { localStorage.removeItem("aih_" + k); } catch {} },
};
const ICON = {
  play: '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  ear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>',
  bm: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  bmOn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  ext: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
};
const EV = { official: "Company", regulator: "Regulator", independent: "Independent media", affiliated: "Group-owned media", other: "Unverified", target: "Target", reported: "Reported" };
const EVHELP = { official: "Published by an Adani company (press release, filing). Accurate on facts, but the company's own framing.",
  regulator: "From a regulator, court or government document. The strongest evidence.",
  independent: "Reported by an established news outlet.",
  affiliated: "NDTV is owned by the Adani Group, so treat its coverage like a company source rather than independent reporting.", other: "A smaller or unknown outlet. Treat as a lead and check it before repeating.",
  target: "A forward-looking goal, not achieved yet.", reported: "Single-source or unconfirmed report." };
const FIT2CO = { anil: "ael", foundation: "group" };
const D = {};
let NAMES = {}, CO = {}, TERMS = [], TERM_RE = null;
const VIEWS = ["today", "news", "companies", "ops", "learn", "me"];

/* ------------------------------------------------------------------ data */
async function getJSON(name, fallback) {
  try {
    const r = await fetch(`data/${name}.json?t=${Math.floor(Date.now() / 600000)}`, { cache: "no-cache" });
    if (!r.ok) throw 0;
    return await r.json();
  } catch { return fallback; }
}
async function load() {
  const names = ["today", "digests", "news_archive", "episodes", "markets", "modules", "glossary", "module_audio", "watch", "settings", "companies", "events", "operations", "storylines", "storyline_links"];
  const vals = await Promise.all(names.map(n => getJSON(n, null)));
  names.forEach((n, i) => D[n] = vals[i]);
  NAMES = { group: "Adani Group", legal: "Legal & regulatory" };
  CO = {};
  (D.companies?.companies || []).forEach(c => { CO[c.key] = c; NAMES[c.key] = c.name; });
  // glossary term detection (longest alias first so "net debt to EBITDA" wins over "EBITDA")
  TERMS = [];
  (D.glossary?.terms || []).forEach(t => (t.alias || [t.t]).forEach(a => a && TERMS.push([a, t])));
  TERMS.sort((a, b) => b[0].length - a[0].length);
  TERMS = TERMS.map(([a, t]) => [esc(a), t]);       // match against escaped text (AT&C -> AT&amp;C)
  TERM_RE = TERMS.length ? new RegExp(`(?<![\\w-])(${TERMS.map(([a]) => a.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})(?![\\w-])`, "g") : null;
}

/* ------------------------------------------------------------------ helpers */
const fmtDate = iso => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const fmtLong = iso => new Date(iso).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
const fmtMonth = iso => new Date(iso).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
function ago(iso) {
  const h = (Date.now() - new Date(iso)) / 36e5;
  if (h < 1) return "just now"; if (h < 24) return `${Math.round(h)}h ago`; return `${Math.round(h / 24)}d ago`;
}
const safeUrl = u => /^https?:\/\//i.test(String(u || "")) ? u : "#";
const ev = t => `<button class="ev ${esc(t)}" data-evhelp="${esc(t)}" aria-label="Evidence: ${esc(EV[t] || t)}. Tap for meaning">${esc(EV[t] || t)}</button>`;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 2200); }
const inr = n => n == null ? "–" : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const pct = n => n == null ? '<span class="muted">–</span>' : `<span class="${n >= 0 ? "up" : "down"}">${n >= 0 ? "+" : ""}${n.toFixed(1)}%</span>`;
const JUNKP = /(outdated browser|upgrade your browser|enable javascript|\| ?image:|access denied)/i;
const cleanParas = ps => (ps || []).filter(p => typeof p === "string" && p.length > 60 && !JUNKP.test(p));
const readMins = txt => Math.max(1, Math.round(String(txt).split(/\s+/).length / 200));

/* Escape text, then underline known glossary terms (first occurrence of each only). */
function rich(text) {
  const s = esc(text);
  if (!TERM_RE) return s;
  const used = new Set();
  return s.replace(TERM_RE, m => {
    const hit = TERMS.find(([a]) => a === m); if (!hit) return m;
    const id = hit[1].t; if (used.has(id)) return m; used.add(id);
    return `<button class="term" data-term="${esc(id)}">${m}</button>`;
  });
}

/* ------------------------------------------------------------------ bottom sheet (terms, evidence, notes) */
function sheet(html) {
  const s = $("#sheet");
  s.innerHTML = `<div class="sheet-in" role="dialog" aria-modal="true"><button class="sheet-x" aria-label="Close">✕</button>${html}</div>`;
  s.classList.add("on");
  s.querySelector(".sheet-x").onclick = closeSheet;
  s.onclick = e => { if (e.target === s) closeSheet(); };
  s.querySelector(".sheet-in").focus?.();
}
function closeSheet() { $("#sheet").classList.remove("on"); }
function termSheet(id) {
  const t = (D.glossary?.terms || []).find(x => x.t === id); if (!t) return;
  sheet(`<p class="eyebrow">${esc(t.cat)} term</p><h3>${esc(t.t)}</h3><p class="read">${esc(t.d)}</p>
    <div class="row-btns"><button class="btn" data-say-text="${esc(t.t + ". " + t.d)}">${ICON.ear} Listen</button>
    <button class="btn" data-go="#learn/glossary">Open glossary</button></div>`);
}

/* ------------------------------------------------------------------ saved + notes */
const Saved = {
  all: () => store.get("saved", {}),
  has: id => !!Saved.all()[id],
  toggle(id, item) { const s = Saved.all(); if (s[id]) delete s[id]; else s[id] = { ...item, at: Date.now() }; store.set("saved", s); toast(s[id] ? "Saved" : "Removed from saved"); },
  note: id => store.get("notes", {})[id] || "",
  setNote(id, txt) { const n = store.get("notes", {}); if (txt.trim()) n[id] = txt; else delete n[id]; store.set("notes", n); },
};
function noteBox(id, label) {
  return `<details class="notes" ${Saved.note(id) ? "open" : ""}><summary>${Saved.note(id) ? "Your note" : "Add a note"}</summary>
    <textarea data-note="${esc(id)}" placeholder="${esc(label || "Your takeaway, a question to ask, a talking point…")}" rows="3">${esc(Saved.note(id))}</textarea>
    <p class="small muted">Saved on this phone only.</p></details>`;
}

/* ------------------------------------------------------------------ speech (phone voice) */
const Speech = {
  queue: [], on: false, owner: null, gen: 0,
  voice() { const vs = speechSynthesis.getVoices(), want = store.get("voice", "");
    return vs.find(v => v.name === want) || vs.find(v => /en[-_]IN/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null; },
  chunks(text) {
    const clean = String(text).replace(/https?:\/\/\S+/g, "").replace(/₹\s?/g, "rupees ").replace(/\bcr\b/g, "crore").replace(/\s+/g, " ").trim();
    const parts = clean.match(/(?:[^.!?;]|\.(?=\d))+[.!?;]*/g) || [clean], out = [];
    for (let p of parts) { p = p.trim();
      while (p.length > 220) { const c = p.lastIndexOf(",", 200), sp = p.lastIndexOf(" ", 200); const i = c > 80 ? c : sp > 80 ? sp : 200; out.push(p.slice(0, i + 1)); p = p.slice(i + 1).trim(); }
      if (p) out.push(p); }
    return out;
  },
  speak(text, owner) {
    if (!("speechSynthesis" in window)) { toast("This browser can't read aloud"); return; }
    Player.pause(); this.stop(); this.queue = this.chunks(text); this.on = true; this.owner = owner || null; this.next(); this.ui();
  },
  next() {
    if (!this.on || !this.queue.length) { this.on = false; this.ui(); return; }
    const u = this.u = new SpeechSynthesisUtterance(this.queue.shift());
    const v = this.voice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-IN";
    const g = this.gen;     // ignore late onerror/onend from a cancelled utterance
    u.rate = store.get("rate", 1); u.onend = u.onerror = () => { if (g === this.gen) this.next(); };
    speechSynthesis.speak(u);
  },
  stop() { this.gen++; this.on = false; this.queue = []; if ("speechSynthesis" in window) speechSynthesis.cancel(); this.ui(); },
  toggle(text, owner) { if (this.on && this.owner === owner) this.stop(); else this.speak(text, owner); },
  ui() { $$("[data-say]").forEach(b => { const on = this.on && b.dataset.say === this.owner; b.classList.toggle("on", on); b.querySelector(".lbl") && (b.querySelector(".lbl").textContent = on ? "Stop" : (b.dataset.lbl || "Listen")); }); },
};
const sayBtn = (owner, label = "Listen") => `<button class="say" data-say="${esc(owner)}" data-lbl="${esc(label)}">${ICON.ear}<span class="lbl">${esc(label)}</span></button>`;

/* ------------------------------------------------------------------ mp3 player */
const Player = {
  a: null, cur: null,
  init() {
    const a = this.a = $("#audio");
    a.addEventListener("timeupdate", () => { if (!a.duration) return; $("#pseek").value = (a.currentTime / a.duration) * 100;
      $("#ptm").textContent = `${mmss(a.currentTime)} / ${mmss(a.duration)}`; if (this.cur) store.set("pos_" + this.cur.src, a.currentTime); });
    a.addEventListener("play", () => this.ui()); a.addEventListener("pause", () => this.ui());
    a.addEventListener("ended", () => { if (this.cur) store.del("pos_" + this.cur.src); this.ui(); });
    $("#pp").onclick = () => a.paused ? a.play() : a.pause();
    $("#pseek").oninput = e => { if (a.duration) a.currentTime = (e.target.value / 100) * a.duration; };
    const speeds = [1, 1.25, 1.5, 1.75, 0.9];
    $("#psp").onclick = () => { const i = (speeds.indexOf(a.playbackRate) + 1) % speeds.length; a.playbackRate = speeds[i]; store.set("speed", speeds[i]); $("#psp").textContent = speeds[i] + "×"; };
    $("#px").onclick = () => { a.pause(); $("#player").classList.remove("on"); document.documentElement.style.setProperty("--player-h", "0px"); };
  },
  play(src, title) {
    Speech.stop(); const a = this.a;
    if (this.cur?.src !== src) { a.src = src; this.cur = { src, title }; a.playbackRate = store.get("speed", 1); $("#psp").textContent = a.playbackRate + "×";
      const pos = store.get("pos_" + src, 0); a.onloadedmetadata = () => { if (pos && pos < a.duration - 5) a.currentTime = pos; a.onloadedmetadata = null; }; }
    $("#pti").textContent = title; $("#player").classList.add("on"); document.documentElement.style.setProperty("--player-h", "72px");
    a.play().catch(() => toast("Tap play again to start audio"));
    if ("mediaSession" in navigator) { navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "Adani Intel Hub", artwork: [{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }] });
      navigator.mediaSession.setActionHandler("seekbackward", () => a.currentTime -= 15); navigator.mediaSession.setActionHandler("seekforward", () => a.currentTime += 30); }
  },
  pause() { this.a && !this.a.paused && this.a.pause(); },
  playing(src) { return this.cur?.src === src && !this.a.paused; },
  ui() { $("#pp").innerHTML = this.a.paused ? ICON.play : ICON.pause; $("#pp").setAttribute("aria-label", this.a.paused ? "Play" : "Pause");
    $$("[data-src]").forEach(b => { const on = this.playing(b.dataset.src); b.classList.toggle("playing", on); const i = b.querySelector(".ico"); if (i) i.innerHTML = on ? ICON.pause : ICON.play; }); },
};
const mins = e => Math.max(1, Math.round(e?.secs ? e.secs / 60 : (e?.words || 0) / 150));
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const audioBtn = (src, title, label) => `<button class="say" data-src="${esc(src)}" data-title="${esc(title)}"><span class="ico">${ICON.play}</span><span>${esc(label)}</span></button>`;

/* ------------------------------------------------------------------ story lookup */
function storyById(id) {
  const a = (D.news_archive || []).find(n => n.id === id);
  const s = (D.today?.stories || []).find(x => x.id === id) || (D.digests || []).flatMap(d => d.stories || []).find(x => x.id === id);
  if (!a && !s) return null;
  return { ...(a || {}), ...(s ? { what: s.what, why: s.why, watch: s.watch, evidence: s.evidence, company: s.company, brief: s.brief } : {}), id };
}
const storyCard = (n, opts = {}) => {
  const read = n.read || {}, lead = n.what || read.desc || (read.paras || [])[0] || "";
  const co = n.company || n.companies?.[0];
  return `<a class="sc ${opts.big ? "big" : ""}" href="#story/${esc(n.id)}">
    <div class="sc-meta"><span class="co-dot" style="--c:${clusterColor(co)}"></span><span>${esc(NAMES[co] || co || "")}</span><span>·</span><span>${esc(fmtDate(n.date))}</span>
      <span class="tier ${esc(n.tier || n.evidence)}">${esc(EV[n.tier || n.evidence] || "")}</span></div>
    <h3>${esc(n.title)}</h3>
    ${lead && lead !== n.title ? `<p>${esc(lead.length > 190 ? lead.slice(0, 187) + "…" : lead)}</p>` : ""}
    <div class="sc-foot">${n.coverage > 1 ? `<span>${n.coverage} outlets</span>` : `<span>${esc(n.source || "")}</span>`}
      ${(read.paras || []).length ? `<span>Read in app</span>` : ""}${Saved.has(n.id) ? `<span>★ Saved</span>` : ""}</div></a>`;
};
function clusterColor(key) {
  const cl = (D.companies?.clusters || []).find(c => c.members.includes(key)) || (CO[key]?.parent && (D.companies?.clusters || []).find(c => c.members.includes(CO[key].parent)));
  return key === "legal" ? "var(--reported)" : cl?.color || "var(--muted)";
}

/* ------------------------------------------------------------------ TODAY */
function renderToday() {
  const t = D.today, el = $("#v-today");
  if (!t) { el.innerHTML = `<div class="empty">No briefing yet. The first one appears after the daily update runs.<br><br>New setup? Open GitHub → Actions → "Daily briefing" → Run workflow.</div>`; return; }
  const ep = (D.episodes || []).find(e => e.kind === "daily" && e.date === t.date);
  const focus = store.get("focus", []);
  const stories = [...(t.stories || [])].map(s => ({ ...storyById(s.id), ...s })).sort((a, b) => focus.includes(b.company) - focus.includes(a.company));
  const upcoming = allEvents().filter(e => !isPast(e)).slice(0, 3);
  const watch = (D.watch?.events || []).filter(e => (Date.now() - new Date(e.date)) / 864e5 < 10);
  const briefText = (t.script || "") || stories.map(s => `${s.title}. ${s.why || ""}`).join(" ");

  el.innerHTML = `
  <header class="today-head">
    <p class="dateline">${esc(fmtLong(t.date))}</p>
    <h2>${esc(t.headline)}</h2>
    <p class="dek">${rich(t.summary)}</p>
    <div class="row-btns">
      ${ep ? audioBtn(ep.file, "Briefing · " + fmtDate(ep.date), `Listen · ${mins(ep)} min`) : sayBtn("brief", "Listen")}
      <a class="say" href="#news">All news</a>
    </div>
    ${t._model === "fallback" ? `<p class="small muted">The AI summary wasn't available on this run (the AI service was busy), so stories show the publisher's own summary. It retries on the next run.</p>` : ""}
  </header>

  ${watch.map(w => `<div class="alert"><b>Heads-up:</b> the official ${esc(w.page)} page changed on ${esc(fmtDate(w.date))}. ${w.added?.length ? `New: ${esc(w.added.slice(0, 4).join("; "))}.` : ""} <a href="${esc(safeUrl(w.url))}" target="_blank" rel="noopener">Check it</a></div>`).join("")}

  <section class="list">${stories.map((s, i) => storyCard(s, { big: i === 0 })).join("")}</section>

  ${t.concept ? `<section class="panel concept"><p class="eyebrow">Concept of the day</p><h3>${esc(t.concept.term)}</h3><p class="read">${rich(t.concept.explain)}</p></section>` : ""}
  ${t.question ? `<section class="panel ask"><p class="eyebrow">A senior might ask</p><h3>${esc(t.question.q)}</h3>
     <details class="reveal"><summary>Think first, then show a strong answer</summary><p class="read">${rich(t.question.a)}</p></details></section>` : ""}

  ${upcoming.length ? `<section><div class="sec">Coming up <a class="more" href="#me/calendar">Calendar</a></div>
    ${upcoming.map(eventRow).join("")}</section>` : ""}

  <section><div class="sec">Explore <small>the basics, visually</small></div>
    <div class="tiles">
      <a class="tile" href="#companies"><b>Group map</b><span>15 businesses on one diagram</span></a>
      <a class="tile" href="#learn/mental-model"><b>How Adani works</b><span>The flywheel in 3 minutes</span></a>
      <a class="tile" href="#learn/history"><b>Timeline</b><span>1988 to today</span></a>
      <a class="tile" href="#tracker"><b>Issue trackers</b><span>Context and timelines, one issue at a time</span></a>
    </div></section>`;
  const sa = $('[data-say="brief"]'); if (sa) sa.onclick = () => Speech.toggle(briefText, "brief");
}

/* ------------------------------------------------------------------ STORY READER */
function renderStory(id) {
  const n = storyById(id), el = $("#v-news");
  if (!n) { el.innerHTML = `<button class="back" data-back>‹ Back</button><div class="empty">This story is no longer in the archive.</div>`; return; }
  const read = n.read || {}, paras = cleanParas(read.paras), co = n.company || n.companies?.[0];
  const link = read.link || n.url;
  const related = (D.news_archive || []).filter(x => x.id !== id && x.companies?.some(c => (n.companies || [co]).includes(c))).slice(0, 4);
  const bf = n.brief || null, more = (read.more || []).map(m => ({ ...m, paras: cleanParas(m.paras) })).filter(m => m.paras.length), tks = trackersFor(n);
  const listenText = [n.title, bf?.happened || n.what, bf?.background, ...(bf?.numbers || []), ...(bf?.views || []), bf?.next || n.watch, n.why, ...(bf ? [] : paras)].filter(Boolean).join(". ");
  el.innerHTML = `<article class="reader">
    <button class="back" data-back>‹ Back</button>
    <p class="kicker"><a href="#co/${esc(co)}" style="--c:${clusterColor(co)}" class="co-link">${esc(NAMES[co] || co)}</a> · ${esc(fmtLong(n.date))}</p>
    <h2 class="story-h">${esc(n.title)}</h2>
    <div class="byline">${ev(n.evidence || n.tier)}<span>${esc(n.source)}</span>${n.coverage > 1 ? `<span>· ${n.coverage} outlets ran this</span>` : ""}<span>· ${readMins(listenText)} min read</span></div>
    <div class="row-btns">${sayBtn("story-" + id)}
      <button class="say" data-save="${esc(id)}">${Saved.has(id) ? ICON.bmOn : ICON.bm}<span>${Saved.has(id) ? "Saved" : "Save"}</span></button>
      <a class="say" href="${esc(safeUrl(link))}" target="_blank" rel="noopener">${ICON.ext}<span>Original</span></a></div>

    ${tks.length ? `<div class="tk-strip">Part of a bigger story: ${tks.map(l => `<a href="#tracker/${esc(l.id)}"><b>${esc(l.title)}</b><span>${esc(l.status)} · ${l.timeline.length} dated entries</span></a>`).join("")}</div>` : ""}

    ${bf && !bf.extractive ? `<div class="brief">
      <p class="eyebrow">The brief</p>
      ${bf.happened ? `<h4>What happened</h4><p class="read">${rich(bf.happened)}</p>` : ""}
      ${n.why ? `<h4>Why it matters</h4><p class="read">${rich(n.why)}</p>` : ""}
      ${bf.background ? `<h4>Background</h4><p class="read">${rich(bf.background)}</p>` : ""}
      ${bf.numbers?.length ? `<h4>Key numbers</h4><ul class="ticks">${bf.numbers.map(x => `<li>${rich(x)}</li>`).join("")}</ul>` : ""}
      ${bf.views?.length ? `<h4>Who says what</h4><ul class="ticks">${bf.views.map(x => `<li>${rich(x)}</li>`).join("")}</ul>` : ""}
      ${bf.next || n.watch ? `<h4>What to watch</h4><p class="read">${rich(bf.next || n.watch)}</p>` : ""}
      <p class="small muted">Written by AI from the coverage of ${1 + more.length} outlet${more.length ? "s" : ""}, below. Check figures against the sources.</p></div>`
     : (n.what || n.why ? `<div class="keybox">
      ${n.what ? `<p class="eyebrow">What happened</p><p class="read">${rich(n.what)}</p>` : ""}
      ${n.why ? `<p class="eyebrow">Why it matters</p><p class="read">${rich(n.why)}</p>` : ""}
      ${n.watch ? `<p class="eyebrow">Watch next</p><p class="read">${rich(n.watch)}</p>` : ""}</div>` : "")}

    ${paras.length ? `<div class="excerpt"><p class="eyebrow">From the article</p>${paras.map(p => `<p class="read">${rich(p)}</p>`).join("")}
       <p class="small muted">Excerpt. <a href="${esc(safeUrl(link))}" target="_blank" rel="noopener">Read the full story at ${esc(n.source)}</a>.</p></div>`
      : read.desc ? `<div class="excerpt"><p class="read">${rich(read.desc)}</p><p class="small muted"><a href="${esc(safeUrl(link))}" target="_blank" rel="noopener">Read the full story at ${esc(n.source)}</a></p></div>`
      : `<div class="excerpt"><p class="read muted">The publisher doesn't allow previews. <a href="${esc(safeUrl(link))}" target="_blank" rel="noopener">Open the story at ${esc(n.source)}</a>.</p></div>`}

    ${more.length ? `<div class="sec">What other outlets report</div>${more.map(m => `<div class="excerpt alt"><p class="eyebrow">${esc(m.source)}</p>${m.paras.map(p => `<p class="read">${rich(p)}</p>`).join("")}
       <p class="small muted"><a href="${esc(safeUrl(m.link))}" target="_blank" rel="noopener">Read at ${esc(m.source)}</a></p></div>`).join("")}` : ""}
    ${(n.also || []).length ? `<div class="sec">Also covered by</div><ul class="plain">${n.also.map(a => `<li><a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener">${esc(a.source)}</a></li>`).join("")}</ul>` : ""}
    ${noteBox("story:" + id)}
    ${CO[co] ? `<a class="tile wide" href="#co/${esc(co)}"><b>About ${esc(CO[co].name)}</b><span>${esc(CO[co].role)}</span></a>` : ""}
    ${related.length ? `<div class="sec">More on ${esc(NAMES[co] || "this")}</div><div class="list">${related.map(r => storyCard(r)).join("")}</div>` : ""}
  </article>`;
  $(`[data-say="${CSS.escape("story-" + id)}"]`).onclick = () => Speech.toggle(listenText, "story-" + id);
}

/* ------------------------------------------------------------------ NEWS */
let newsFilter = "all", newsQ = "";
function renderNews() {
  const el = $("#v-news");
  const since = Date.now() - 14 * 864e5;
  const all = (D.news_archive || []).filter(n => new Date(n.date) >= since);
  const counts = {}; all.forEach(n => n.companies.forEach(c => counts[c] = (counts[c] || 0) + 1));
  const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  let list = all;
  if (newsFilter === "verified") list = list.filter(n => n.tier !== "other");
  else if (newsFilter === "saved") list = Object.keys(Saved.all()).map(storyById).filter(Boolean);
  else if (newsFilter !== "all") list = list.filter(n => n.companies.includes(newsFilter));
  if (newsQ) list = list.filter(n => (n.title + " " + (n.read?.desc || "") + " " + n.source).toLowerCase().includes(newsQ));
  // group by day
  const days = {}; list.slice(0, 120).forEach(n => (days[n.date.slice(0, 10)] ??= []).push(n));
  el.innerHTML = `<h2>News</h2>${tkSwitch("news")}
    <input class="search" id="nq" type="search" placeholder="Search stories, e.g. Evos, Khavda, SEBI" value="${esc(newsQ)}" aria-label="Search news">
    <div class="chips">${[["all", `All ${all.length}`], ["verified", "Verified sources"], ["saved", `Saved ${Object.keys(Saved.all()).length}`], ...keys.map(k => [k, `${NAMES[k] || k} ${counts[k]}`])]
      .map(([k, l]) => `<button class="chip" data-f="${esc(k)}" aria-pressed="${newsFilter === k}">${esc(l)}</button>`).join("")}</div>
    ${Object.entries(days).map(([d, ns]) => `<div class="day">${esc(fmtLong(d))}</div><div class="list">${ns.map(n => storyCard(n)).join("")}</div>`).join("")
      || `<div class="empty">${newsFilter === "saved" ? "Nothing saved yet. Tap Save on any story." : "No stories match."}</div>`}
    <p class="note">Evidence tags: <b>Company</b> = Adani's own release · <b>Regulator</b> = official order · <b>Independent</b> = established outlet · <b>Unverified</b> = check before repeating.</p>`;
  $$(".chip", el).forEach(c => c.onclick = () => { newsFilter = c.dataset.f; renderNews(); });
  const q = $("#nq"); q.oninput = () => { clearTimeout(q._t); q._t = setTimeout(() => { newsQ = q.value.trim().toLowerCase(); renderNews(); const nq = $("#nq"); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }, 250); };
}


/* ------------------------------------------------------------------ TRACKERS (storylines) */
const TK_KIND = { event: "Reported", concern: "Allegation or criticism", company: "Company's account", official: "Official record" };
const STATUS_CLS = s => /open|ongoing|unresolved|active|under way|operating/i.test(s) ? "live" : /settled|closed|improving/i.test(s) ? "done" : "mid";
let tkCat = "all";
const tkLines = () => D.storylines?.lines || [];
const tkLinked = id => (D.storyline_links?.[id] || []);
function tkSwitch(active) {
  return `<div class="seg" role="tablist"><button role="tab" data-go="#news" aria-selected="${active === "news"}">Latest news</button>
    <button role="tab" data-go="#tracker" aria-selected="${active === "tracker"}">Trackers</button></div>`;
}
function renderTrackers() {
  const el = $("#v-news"), doc = D.storylines;
  if (!doc) { el.innerHTML = `<h2>News</h2>${tkSwitch("tracker")}<div class="empty">Trackers load after the next update.</div>`; return; }
  const cats = [["all", "All"], ...doc.cats.map(c => [c.id, c.name])];
  const lines = tkLines().filter(l => tkCat === "all" || l.cat === tkCat);
  el.innerHTML = `<h2>News</h2>${tkSwitch("tracker")}
    <p class="dek">Instead of reading stories one by one, read each long-running issue once: what it is, why it matters, a dated timeline, where it stands now and what to watch. Each entry shows who is saying what.</p>
    <div class="chips">${cats.map(([k, l]) => `<button class="chip" data-tc="${esc(k)}" aria-pressed="${tkCat === k}">${esc(l)}</button>`).join("")}</div>
    <div class="list">${lines.map(l => {
      const nw = tkLinked(l.id).length;
      return `<a class="tk-card" href="#tracker/${esc(l.id)}"><div class="tk-top"><span class="status ${STATUS_CLS(l.status)}">${esc(l.status)}</span>
        <span class="muted small">${esc(doc.cats.find(c => c.id === l.cat)?.name || "")}</span></div>
        <h3>${esc(l.title)}</h3><p>${esc(l.status_note)}</p>
        <div class="sc-foot"><span>${l.timeline.length} dated entries</span><span>${esc(l.first.slice(0, 4))}–${esc(l.last.slice(0, 4))}</span>${nw ? `<span class="newtag">${nw} newer ${nw > 1 ? "stories" : "story"}</span>` : ""}</div></a>`;
    }).join("") || `<div class="empty">No trackers here yet.</div>`}</div>
    <p class="note">Trackers are written and checked by hand from regulator documents, court orders, company releases and news reports, and every entry links to its source. They are refreshed when something major happens. Newer matching stories are flagged automatically but are not added to the timeline until checked. Verified ${esc(doc.verified)}.</p>`;
  $$("[data-tc]", el).forEach(b => b.onclick = () => { tkCat = b.dataset.tc; renderTrackers(); });
}

function renderTracker(id) {
  const el = $("#v-news"), l = tkLines().find(x => x.id === id);
  if (!l) return renderTrackers();
  const doc = D.storylines, linked = tkLinked(id);
  const years = [...new Set(l.timeline.map(e => e.d.slice(0, 4)))];
  const listen = [l.title, l.short, l.why, ...l.timeline.map(e => `${fmtTk(e)}. ${e.h}. ${e.x}`), "Still open.", ...(l.open || [])].join(" ");
  el.innerHTML = `<article class="reader">
    <button class="back" data-back>‹ Trackers</button>
    <p class="kicker">${esc(doc.cats.find(c => c.id === l.cat)?.name || "")} · updated ${esc(fmtDate(l.updated))}</p>
    <h2 class="story-h">${esc(l.title)}</h2>
    <div class="row-btns"><span class="status big ${STATUS_CLS(l.status)}">${esc(l.status)}</span>${sayBtn("tk-" + id)}
      <button class="say" data-save-tk="${esc(id)}">${Saved.has("tk:" + id) ? ICON.bmOn : ICON.bm}<span>${Saved.has("tk:" + id) ? "Saved" : "Save"}</span></button></div>

    <div class="keybox"><p class="eyebrow">Where it stands</p><p class="read">${rich(l.status_note)}</p></div>
    <div class="sec">The short version</div><p class="read">${rich(l.short)}</p>
    <div class="sec">Why it matters to you</div><p class="read">${rich(l.why)}</p>
    ${(l.companies || []).filter(c => CO[c]).length ? `<p class="small">Businesses involved: ${l.companies.filter(c => CO[c]).map(c => `<a href="#co/${esc(c)}">${esc(CO[c].short)}</a>`).join(" · ")}</p>` : ""}

    <div class="sec">Timeline <small>${l.timeline.length} entries · ${esc(years[0])}${years.length > 1 ? "–" + esc(years[years.length - 1]) : ""}</small></div>
    <div class="tl-legend">${Object.entries(TK_KIND).map(([k, v]) => `<span class="tlk ${k}"><i></i>${esc(v)}</span>`).join("")}</div>
    <div class="tl2">${l.timeline.map(e => `<div class="tl-i ${esc(e.k)}"><span class="tl-d">${esc(fmtTk(e))}</span>
      <div class="tl-b"><div class="tl-h"><b>${esc(e.h)}</b></div>
        <div class="tl-m">${ev(e.tier)}<span class="tlk-name">${esc(TK_KIND[e.k] || e.k)}</span></div>
        <p class="read">${rich(e.x)}</p>
        <p class="tl-s">${e.s.map(s => `<a href="${esc(safeUrl(s.u))}" target="_blank" rel="noopener">${esc(s.t)}</a>`).join(" · ")}</p></div></div>`).join("")}</div>

    ${l.open?.length ? `<div class="sec">Still open: what to watch</div><ul class="ticks">${l.open.map(x => `<li>${rich(x)}</li>`).join("")}</ul>` : ""}
    ${l.gaps?.length ? `<details class="reveal"><summary>What I could not verify</summary><ul class="ticks">${l.gaps.map(x => `<li>${rich(x)}</li>`).join("")}</ul></details>` : ""}
    ${linked.length ? `<div class="sec">Possibly related, newer than the timeline <small>not yet checked or added</small></div>
      <ul class="hl">${linked.map(h => `<li><a href="#story/${esc(h.id)}">${esc(h.title)}</a><div class="m">${ev(h.tier)}<span>${esc(h.source)}</span><span>${esc(fmtDate(h.date))}</span></div></li>`).join("")}</ul>` : ""}
    ${noteBox("tk:" + id, "Your takeaway, and the question you would ask…")}
    <p class="note">Labels show what kind of statement each entry is. Allegations are shown as allegations. A dismissal or settlement is described exactly as the document says, and is not the same as a ruling on whether the claims were true. Verified ${esc(doc.verified)}.</p>
  </article>`;
  $(`[data-say="${CSS.escape("tk-" + id)}"]`).onclick = () => Speech.toggle(listen, "tk-" + id);
  $("[data-save-tk]").onclick = () => { Saved.toggle("tk:" + id, { kind: "tracker", id, title: l.title }); renderTracker(id); };
}
const fmtTk = e => {
  const d = new Date(e.d + "T00:00:00");
  return e.approx ? d.toLocaleDateString("en-IN", { month: "short", year: "numeric" }).replace(/^/, "c. ") : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
/* trackers a story may belong to (shown on the story page) */
function trackersFor(n) {
  const txt = ((n.title || "") + " " + (n.read?.desc || "") + " " + (n.snippet || "")).toLowerCase();
  return tkLines().filter(l => (l.match || []).some(k => new RegExp("(?<![a-z0-9])" + k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(txt))).slice(0, 2);
}

/* ------------------------------------------------------------------ COMPANIES */
let coView = "map";
function renderCompanies() {
  const el = $("#v-companies"), C = D.companies;
  if (!C) { el.innerHTML = `<div class="empty">Company data is loading.</div>`; return; }
  const mk = Object.fromEntries((D.markets?.adani || []).map(r => [r.key, r]));
  el.innerHTML = `<h2>Companies</h2>
    <p class="dek">Tap any business to open its page. Solid tiles are listed companies; dashed tiles are platforms still incubating inside Adani Enterprises.</p>
    <div class="seg" role="tablist">${[["map", "Group map"], ["flows", "How they connect"], ["esg", "ESG compare"], ["list", "List"]].map(([k, l]) => `<button role="tab" data-cv="${k}" aria-selected="${coView === k}">${l}</button>`).join("")}</div>
    <div class="figure">${coView === "map" ? Dg.structure(C)
      : coView === "flows" ? Dg.flows(C) + `<ul class="legend-list">${C.flows.map(([a, b, l]) => `<li><b>${esc(CO[a].short)} → ${esc(CO[b].short)}</b> ${esc(l)}</li>`).join("")}</ul>`
      : coView === "esg" ? Dg.esgCompare(C) + `<p class="note">Source: Adani Portfolio ESG snapshot H1 FY27 and company reports. Sustainalytics rates risk, so a lower score is better. Also see each company's net-zero year on its page.</p>`
      : `<div class="list">${C.companies.map(c => `<a class="co-row" href="#co/${c.key}"><span class="co-dot" style="--c:${clusterColor(c.key)}"></span>
          <span><b>${esc(c.name)}</b><small>${esc(c.role)}</small></span>${mk[c.key] ? `<span class="px">₹${inr(mk[c.key].price)}<br>${pct(mk[c.key].d1)}</span>` : `<span class="px muted small">${c.listed ? "" : "inside AEL"}</span>`}</a>`).join("")}</div>`}</div>
    <div class="sec">Markets <small>listed companies · ${D.markets ? esc(ago(D.markets.generated)) : ""}</small></div>
    ${marketsTable()}`;
  $$("[data-cv]", el).forEach(b => b.onclick = () => { coView = b.dataset.cv; renderCompanies(); });
  $$("[data-mp]", el).forEach(b => b.onclick = () => { mkPeriod = b.dataset.mp; renderCompanies(); });
}

function renderCompany(key) {
  const c = CO[key], el = $("#v-companies");
  if (!c) return renderCompanies();
  const mk = (D.markets?.adani || []).find(r => r.key === key);
  const news = (D.news_archive || []).filter(n => n.companies.includes(key)).slice(0, 6);
  const evs = allEvents().filter(e => e.company === key && !isPast(e)).slice(0, 4);
  const chart = c.chart ? (c.chart.type === "line" ? Dg.line(c.chart.title, c.chart.points, c.chart.unit) : Dg.bars(c.chart.title, c.chart.bars, c.chart.unit)) : "";
  const flowsIn = (D.companies.flows || []).filter(f => f[1] === key), flowsOut = (D.companies.flows || []).filter(f => f[0] === key);
  const fit = (store.get("profile", null)?.fits || []).find(f => (FIT2CO[f.key] || f.key) === key || f.key === key);
  const sayText = [c.name, c.role, c.model, ...(c.kpis || []).map(k => `${k.l}: ${k.v}. ${k.note || ""}`), ...(c.watch || [])].join(". ");
  el.innerHTML = `<article class="reader">
    <button class="back" data-back>‹ Companies</button>
    <div class="co-hero" style="--c:${clusterColor(key)}">
      <p class="kicker">${esc((D.companies.clusters.find(x => x.members.includes(key)) || {}).name || "")}${c.parent ? ` · inside ${esc(CO[c.parent]?.short || "AEL")}` : c.ticker ? ` · NSE: ${esc(c.ticker)}` : ""}</p>
      <h2>${esc(c.name)}</h2><p class="dek">${rich(c.role)}</p>
      ${mk ? `<div class="quote"><b>₹${inr(mk.price)}</b> ${pct(mk.d1)} today · ${pct(mk.y1)} 1y${mk.mcap_cr ? ` · mcap ${cap(mk.mcap_cr)}` : ""}</div>` : ""}
    </div>
    <div class="row-btns">${sayBtn("co-" + key)}</div>

    <div class="sec">Key numbers</div>
    <div class="kpis">${(c.kpis || []).map(k => `<div class="kpi"><span class="kv">${esc(k.v)}</span><span class="kl">${rich(k.l)}</span>${k.note ? `<span class="kn">${rich(k.note)}</span>` : ""}</div>`).join("")}</div>
    ${chart ? `<div class="figure">${chart}${c.chart.note ? `<p class="note">${esc(c.chart.note)}</p>` : ""}</div>` : ""}

    <div class="sec">How it makes money</div><p class="read">${rich(c.model)}</p>

    ${flowsIn.length || flowsOut.length ? `<div class="sec">Where it sits in the group</div><div class="chain">
      ${flowsIn.length ? `<p class="chain-lbl">Gets from</p>${flowsIn.map(([a, , l]) => `<a href="#co/${a}">${esc(CO[a].short)} <small>${esc(l)}</small></a>`).join("")}<p class="chain-arrow">↓</p>` : ""}
      <div class="chain-me">${esc(c.short)}</div>
      ${flowsOut.length ? `<p class="chain-arrow">↓</p><p class="chain-lbl">Supplies to</p>${flowsOut.map(([, b, l]) => `<a href="#co/${b}">${esc(CO[b].short)} <small>${esc(l)}</small></a>`).join("")}` : ""}</div>` : ""}

    ${c.promoter ? `<div class="sec">Ownership</div><div class="own">${Dg.donut(c.promoter, "Promoter holding")}<p class="read small">${esc(c.promoterNote || "Promoter (Adani family) holding, Sep 2026.")}</p></div>` : ""}

    ${c.esg ? `<div class="sec">ESG snapshot</div><div class="esg">
      ${c.esg.netZero ? `<div><span class="kv">${c.esg.netZero}</span><span class="kl">Net-zero target year</span></div>` : ""}
      ${c.esg.sust ? `<div><span class="kv">${c.esg.sust[0]}</span><span class="kl">Sustainalytics risk · ${esc(c.esg.sust[1])}</span></div>` : ""}
      ${c.esg.cdp ? `<div><span class="kv">${esc(c.esg.cdp)}</span><span class="kl">CDP climate</span></div>` : ""}
      ${c.esg.nse ? `<div><span class="kv">${esc(c.esg.nse)}</span><span class="kl">NSE ESG score</span></div>` : ""}</div>
      ${c.esg.note ? `<p class="read small">${rich(c.esg.note)}</p>` : ""}` : ""}

    ${c.people?.length ? `<div class="sec">People</div><ul class="plain">${c.people.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
    ${c.watch?.length ? `<div class="sec">Watch list</div><ul class="ticks">${c.watch.map(w => `<li>${rich(w)}</li>`).join("")}</ul>` : ""}
    ${evs.length ? `<div class="sec">Coming up</div>${evs.map(eventRow).join("")}` : ""}
    ${fit ? `<div class="panel ask"><p class="eyebrow">Your fit (${fit.score}/5)</p><p class="read">${esc(fit.why)}</p><p class="read"><i>${esc(fit.talk)}</i></p></div>` : ""}
    ${noteBox("co:" + key, "What you'd ask this business's leaders…")}
    <div class="sec">Latest news</div>${news.length ? `<div class="list">${news.map(n => storyCard(n)).join("")}</div>` : `<p class="muted">No stories in the archive yet.</p>`}
    ${c.src ? `<p class="note">Figures verified ${esc(D.companies.verified)}. <a href="${esc(safeUrl(c.src))}" target="_blank" rel="noopener">Primary source</a></p>` : ""}
  </article>`;
  $(`[data-say="${CSS.escape("co-" + key)}"]`).onclick = () => Speech.toggle(sayText, "co-" + key);
}

/* markets table (inside Companies) */
function spark(vals) {
  if (!vals?.length) return "";
  const mn = Math.min(...vals), mx = Math.max(...vals), w = 64, h = 24;
  const d = vals.map((v, i) => `${i ? "L" : "M"}${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / ((mx - mn) || 1) * (h - 4)).toFixed(1)}`).join("");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" stroke="var(--${vals[vals.length - 1] >= vals[0] ? "up" : "down"})"/></svg>`;
}
const cap = cr => cr >= 1e5 ? `₹${(cr / 1e5).toFixed(2)}L cr` : `₹${Math.round(cr).toLocaleString("en-IN")} cr`;
let mkPeriod = "d1";
function marketsTable() {
  const m = D.markets; if (!m) return `<p class="muted">Prices appear after the first update.</p>`;
  const rows = rs => rs.map(r => `<tr${CO[r.key] && m.adani.includes(r) ? ` data-href="#co/${r.key}"` : ""}><td><div class="nm">${esc(r.name)}</div><div class="sy">${esc(r.symbol)}${r.mcap_cr ? ` · ${cap(r.mcap_cr)}` : ""}</div></td>
      <td>${spark(r.spark)}</td><td class="px">₹${inr(r.price)}</td><td class="ch">${pct(r[mkPeriod])}</td></tr>`).join("");
  return `${m.portfolio_mcap_cr ? `<p class="small muted" style="margin:0">Listed portfolio market cap</p><p class="bignum">₹${(m.portfolio_mcap_cr / 1e5).toFixed(2)} lakh cr</p>` : ""}
    <div class="seg small-seg">${[["d1", "1D"], ["m1", "1M"], ["y1", "1Y"]].map(([k, l]) => `<button data-mp="${k}" aria-selected="${mkPeriod === k}">${l}</button>`).join("")}</div>
    <table class="mk"><tbody>${rows(m.adani)}</tbody></table>
    ${(m.peers || []).length ? `<details class="reveal"><summary>Compare with peers</summary><table class="mk"><tbody>${rows(m.peers)}</tbody></table></details>` : ""}
    <p class="note">NSE prices via Yahoo Finance. A learning aid, not investment advice.</p>`;
}

/* ------------------------------------------------------------------ LEARN */
let learnTab = "modules";
function modText(m) {
  const p = [m.title + ".", ...(m.tldr || []), m.lede];
  (m.blocks || []).forEach(b => { if (b.h) p.push(b.h + "."); if (b.p) p.push(b.p); (b.items || []).forEach(i => p.push(`${i.t}. ${i.d}`)); });
  return p.join(" ");
}
function moduleDiagram(id) {
  const C = D.companies; if (!C) return "";
  return { loop: Dg.loop, timeline: () => Dg.timeline(C), structure: () => Dg.structure(C), leverage: Dg.leverage, legal: Dg.legal, thesis: Dg.thesis }[id]?.() || "";
}
function renderModule(id) {
  const el = $("#v-learn"), mods = D.modules?.modules || [], m = mods.find(x => x.id === id);
  if (!m) return renderLearn();
  const seen = store.get("seen", {}); seen[id] = 1; store.set("seen", seen);
  const au = D.module_audio?.[m.id], i = mods.indexOf(m), next = mods[i + 1];
  el.innerHTML = `<article class="reader">
    <button class="back" data-back>‹ Learn</button>
    <p class="kicker">Module ${i + 1} of ${mods.length} · ${m.minutes} min read</p>
    <h2>${esc(m.title)}</h2>
    <div class="row-btns">${au ? audioBtn(au.file, m.title, `Listen · ${mins(au)} min`) : sayBtn("mod-" + id)}
      <button class="say" data-save-mod="${esc(id)}">${Saved.has("mod:" + id) ? ICON.bmOn : ICON.bm}<span>${Saved.has("mod:" + id) ? "Saved" : "Save"}</span></button></div>
    ${m.tldr ? `<div class="keybox"><p class="eyebrow">In 30 seconds</p><ul class="ticks">${m.tldr.map(t => `<li>${rich(t)}</li>`).join("")}</ul></div>` : ""}
    ${m.diagram ? `<div class="figure">${moduleDiagram(m.diagram)}</div>` : ""}
    <p class="lede">${rich(m.lede)}</p>
    ${(m.blocks || []).map(b => `${b.h ? `<h4>${esc(b.h)}</h4>` : ""}${b.p ? `<p class="read">${rich(b.p)}</p>` : ""}
      ${b.items ? `<div class="items ${m.id === "history" ? "tl" : ""}">${b.items.map(it => `<div class="item"><h5>${esc(it.t)}${it.tag ? " " + ev(it.tag) : ""}</h5><p class="read">${rich(it.d)}</p></div>`).join("")}</div>` : ""}`).join("")}
    ${m.sources?.length ? `<div class="sec">Sources</div><ul class="plain">${m.sources.map(s => `<li><a href="${esc(safeUrl(s.u))}" target="_blank" rel="noopener">${esc(s.t)}</a></li>`).join("")}</ul>` : ""}
    ${noteBox("mod:" + id)}
    ${next ? `<a class="tile wide" href="#learn/${esc(next.id)}"><b>Next: ${esc(next.title)}</b><span>${next.minutes} min</span></a>` : ""}
    <p class="note">Verified ${esc(D.modules.verified)}. Tap an underlined term for its meaning, or tap a tag for evidence type.</p></article>`;
  const sb = $(`[data-say="${CSS.escape("mod-" + id)}"]`); if (sb) sb.onclick = () => Speech.toggle(modText(m), "mod-" + id);
  $("[data-save-mod]").onclick = () => { Saved.toggle("mod:" + id, { kind: "module", id, title: m.title }); renderModule(id); };
}
function renderLearn(sub) {
  const el = $("#v-learn"), mods = D.modules?.modules || [];
  if (sub && !["modules", "glossary", "cards", "audio"].includes(sub)) return renderModule(sub);
  if (sub) learnTab = sub;
  const seen = store.get("seen", {});
  el.innerHTML = `<h2>Learn</h2>
    <div class="seg" role="tablist">${[["modules", "Modules"], ["glossary", "Glossary"], ["cards", "Flashcards"], ["audio", "Audio"]].map(([k, l]) => `<button role="tab" data-t="${k}" aria-selected="${learnTab === k}">${l}</button>`).join("")}</div>
    <div id="lt"></div>`;
  $$(".seg button", el).forEach(b => b.onclick = () => { learnTab = b.dataset.t; location.hash = "#learn/" + learnTab; });
  const lt = $("#lt");
  if (learnTab === "modules") {
    const done = mods.filter(m => seen[m.id]).length;
    lt.innerHTML = `<p class="small muted">${done} of ${mods.length} read · suggested order</p><div class="mods">${mods.map((m, i) => `<a class="mod" href="#learn/${esc(m.id)}">
      <span class="mod-ic">${esc(m.icon || "•")}</span><span><b>${esc(m.title)}</b><small>${esc((m.tldr || [m.lede])[0])}</small></span>
      <span class="mod-m">${seen[m.id] ? "✓" : m.minutes + "′"}</span></a>`).join("")}</div>`;
  } else if (learnTab === "glossary") {
    const terms = D.glossary?.terms || [];
    lt.innerHTML = `<input class="search" id="gq" type="search" placeholder="Search ${terms.length} terms, e.g. PLF, take-or-pay" aria-label="Search glossary"><div id="gl"></div>`;
    const draw = q => $("#gl").innerHTML = terms.filter(t => !q || (t.t + t.d).toLowerCase().includes(q)).map(t =>
      `<div class="gterm"><h5>${esc(t.t)} <span class="cat">${esc(t.cat)}</span></h5><p class="read">${esc(t.d)}</p></div>`).join("") || `<p class="muted">No match.</p>`;
    draw(""); $("#gq").oninput = e => draw(e.target.value.trim().toLowerCase());
  } else if (learnTab === "audio") {
    const eps = D.episodes || [], ma = D.module_audio || {};
    const row = (src, title, sub) => `<div class="ep">${audioBtn(src, title, "Play")}<div><b>${esc(title)}</b><small>${esc(sub)}</small></div></div>`;
    lt.innerHTML = `<p class="read small">Everything is also available as audio. It plays with the screen locked and remembers where you stopped.</p>
      ${eps.filter(e => e.kind === "weekly").slice(0, 3).map(e => row(e.file, "Week in review", fmtLong(e.date) + ` · ${mins(e)} min`)).join("")}
      <div class="sec">Daily briefings</div>${eps.filter(e => e.kind === "daily").map(e => row(e.file, e.title || "Briefing", fmtLong(e.date) + ` · ${mins(e)} min`)).join("") || `<p class="muted">None yet.</p>`}
      <div class="sec">The course</div>${mods.filter(m => ma[m.id]).map(m => row(ma[m.id].file, m.title, `${mins(ma[m.id])} min`)).join("")}`;
    Player.ui();
  } else renderCards(lt);
}
function deck() {
  const g = D.glossary || {};
  return [...(g.terms || []).map(t => ({ id: "t:" + t.t, q: `What is ${t.t}?`, a: t.d })), ...(g.facts || []).map(f => ({ id: "f:" + f.q, q: f.q, a: f.a })),
          ...(D.operations?.metrics_cheatsheet || []).map(t => ({ id: "o:" + t.t, q: `What is ${t.t}?`, a: t.d }))];
}
function renderCards(lt) {
  const box = store.get("leitner", {}), gap = [1 / 144, 3, 7, 14], now = Date.now(), all = deck();
  const NEW_PER_DAY = 10, today = new Date().toDateString(), intro = store.get("introduced", { day: today, n: 0 });
  if (intro.day !== today) { intro.day = today; intro.n = 0; }
  const due = [...all.filter(c => box[c.id] && now >= box[c.id].next), ...all.filter(c => !box[c.id]).slice(0, Math.max(0, NEW_PER_DAY - intro.n))];
  const mastered = all.filter(c => (box[c.id]?.b ?? -1) >= 3).length;
  if (!due.length) { lt.innerHTML = `<div class="empty">Done for today. ${mastered}/${all.length} mastered.<br>New cards unlock tomorrow.</div>`; return; }
  const c = due[0];
  lt.innerHTML = `<div class="meter">${Array.from({ length: 20 }, (_, i) => `<span class="${i < Math.round(mastered / all.length * 20) ? "f" : ""}"></span>`).join("")}</div>
    <p class="small muted">${due.length} left today · ${mastered}/${all.length} mastered</p>
    <button class="card" id="card"><span class="q">${esc(c.q)}</span><span class="hint">Tap to reveal</span></button>
    <div class="grade" id="grade" hidden><button class="g0" data-g="0">Didn't know</button><button data-g="1">Partly</button><button class="g2" data-g="2">Knew it</button></div>`;
  $("#card").onclick = () => { $("#card").innerHTML = `<span class="q">${esc(c.q)}</span><span class="a">${esc(c.a)}</span>`; $("#grade").hidden = false; if (store.get("cardVoice", false)) Speech.speak(c.a, "card"); };
  $$("#grade button").forEach(b => b.onclick = () => {
    if (!box[c.id]) { intro.n++; store.set("introduced", intro); }
    const g = +b.dataset.g, cur = box[c.id]?.b ?? 0, nb = g === 0 ? 0 : g === 1 ? cur : Math.min(3, cur + 1);
    box[c.id] = { b: nb, next: now + gap[nb] * 864e5 }; store.set("leitner", box); renderCards(lt);
  });
}

/* ------------------------------------------------------------------ events */
const isPast = e => e.date < new Date().toISOString().slice(0, 10);
// public events + private ones from the on-phone profile (never uploaded)
const allEvents = () => [...(D.events?.items || []), ...((store.get("profile", null) || {}).events || [])].sort((x, y) => x.date.localeCompare(y.date));
const KIND = { results: "Results", milestone: "Milestone", target: "Target", board: "Board meeting", personal: "You" };
function eventRow(e) {
  const d = new Date(e.date);
  return `<div class="evt ${isPast(e) ? "past" : ""}"><div class="evd"><b>${e.approx ? "~" : ""}${d.getDate()}</b><span>${d.toLocaleDateString("en-IN", { month: "short" })}</span></div>
    <div><p class="evk">${esc(KIND[e.kind] || e.kind)}${e.approx ? " · approx." : ""} · <a href="#co/${esc(e.company)}">${esc(NAMES[e.company] || "Group")}</a></p>
      <b>${esc(e.title)}</b>${e.detail ? `<p class="small">${rich(e.detail)}</p>` : ""}
      ${e.url ? `<a class="small" href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener">${esc(e.source || "Source")}</a>` : e.source ? `<span class="small muted">${esc(e.source)}</span>` : ""}</div></div>`;
}

/* ------------------------------------------------------------------ ME */
let meTab = "fit";
function renderMe(sub) {
  if (sub) meTab = sub;
  const el = $("#v-me");
  el.innerHTML = `<h2>Me</h2>
    <div class="seg" role="tablist">${[["fit", "My fit"], ["saved", "Saved"], ["calendar", "Calendar"], ["settings", "Settings"]].map(([k, l]) => `<button role="tab" data-m="${k}" aria-selected="${meTab === k}">${l}</button>`).join("")}</div>
    <div id="mt"></div>`;
  $$("[data-m]", el).forEach(b => b.onclick = () => { location.hash = "#me/" + b.dataset.m; });
  ({ fit: meFit, saved: meSaved, calendar: meCal, settings: meSettings })[meTab]($("#mt"));
}
function meFit(mt) {
  const p = store.get("profile", null), arc = D.news_archive || [], since = Date.now() - 14 * 864e5, focus = store.get("focus", []);
  const live = key => arc.filter(n => new Date(n.date) >= since && n.companies.includes(FIT2CO[key] || key)).length;
  if (!p) { mt.innerHTML = `<p class="read">Import your private profile to see how your background maps to each Adani business, with talking points and live news.</p>
    <div class="drop"><p>Choose <b>my-profile.json</b>. Email or Drive it to your phone from the PRIVATE folder on your laptop.</p>
    <label class="btn pri">Choose file<input type="file" id="pf" accept=".json,application/json" hidden></label><p class="small muted">Stays in this browser. Nothing is uploaded.</p></div>`;
    $("#pf").onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); if (j.type !== "adani-hub-profile" || !Array.isArray(j.fits)) throw 0; store.set("profile", j); toast("Profile imported"); renderMe(); } catch { toast("That file isn't a valid my-profile.json"); } };
    return; }
  const fits = [...(p.fits || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
  const label = k => NAMES[k] || { anil: "Adani New Industries", foundation: "Adani Foundation / ESG" }[k] || k;
  mt.innerHTML = `<p class="read">${esc(p.headline)}</p>
    <div class="figure">${Dg.bars("Fit with your background (out of 5)", fits.map(f => [label(f.key), f.score]), "", 5)}</div>
    ${fits.map(f => `<details class="fit" ${f.score >= 5 ? "open" : ""}><summary><b>${esc(label(f.key))}</b><span class="dots">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= f.score ? "f" : ""}"></i>`).join("")}</span></summary>
      <p class="read">${esc(f.why)}</p><ul class="ticks">${(f.angles || []).map(a => `<li>${esc(a)}</li>`).join("")}</ul>
      <p class="read"><i>${esc(f.talk)}</i></p>
      <p class="small muted">${live(f.key)} stories in 14 days · ${CO[FIT2CO[f.key] || f.key] ? `<a href="#co/${esc(FIT2CO[f.key] || f.key)}">Company page</a> · ` : ""}
        <button class="linkbtn" data-focus="${esc(FIT2CO[f.key] || f.key)}">${focus.includes(FIT2CO[f.key] || f.key) ? "★ In focus" : "☆ Add to focus"}</button></p></details>`).join("")}
    <div class="sec">Your evidence bank</div>${(p.strengths || []).map(s => `<div class="str"><b>${esc(s.label)}</b><span class="small muted">${esc(s.evidence)}</span></div>`).join("")}
    <div class="sec">Prep checklist</div>${(p.prep || []).map((x, i) => `<label class="chk"><input type="checkbox" data-prep="${i}" ${store.get("prep", {})[i] ? "checked" : ""}><span>${esc(x)}</span></label>`).join("")}
    <p class="note">Your profile lives only in this browser. <button class="linkbtn" id="rmp">Remove it</button></p>`;
  $$("[data-focus]", mt).forEach(b => b.onclick = () => { const k = b.dataset.focus, f = store.get("focus", []); store.set("focus", f.includes(k) ? f.filter(x => x !== k) : [...f, k]); renderMe(); });
  $$("[data-prep]", mt).forEach(c => c.onchange = () => { const s = store.get("prep", {}); s[c.dataset.prep] = c.checked; store.set("prep", s); });
  $("#rmp").onclick = () => { if (confirm("Remove your profile from this phone?")) { store.del("profile"); renderMe(); } };
}
function meSaved(mt) {
  const s = Saved.all(), notes = store.get("notes", {});
  const ids = Object.keys(s).sort((a, b) => s[b].at - s[a].at);
  const stories = ids.filter(i => !i.startsWith("mod:") && !i.startsWith("tk:")).map(storyById).filter(Boolean);
  const tks = ids.filter(i => i.startsWith("tk:")).map(i => tkLines().find(l => l.id === i.slice(3))).filter(Boolean);
  const mods = ids.filter(i => i.startsWith("mod:")).map(i => s[i]);
  const noteKeys = Object.keys(notes);
  const label = k => k.startsWith("tk:") ? (tkLines().find(l => l.id === k.slice(3))?.title || "Tracker") : k.startsWith("story:") ? (storyById(k.slice(6))?.title || "Story") : k.startsWith("co:") ? NAMES[k.slice(3)] : k.startsWith("mod:") ? (D.modules?.modules.find(m => m.id === k.slice(4))?.title || "Module") : k;
  const href = k => k.startsWith("tk:") ? "#tracker/" + k.slice(3) : k.startsWith("story:") ? "#story/" + k.slice(6) : k.startsWith("co:") ? "#co/" + k.slice(3) : "#learn/" + k.slice(4);
  mt.innerHTML = `${noteKeys.length ? `<div class="sec">Your notes <small>${noteKeys.length}</small> <button class="linkbtn more" id="exp">Copy all</button></div>
      ${noteKeys.map(k => `<a class="note-card" href="${esc(href(k))}"><b>${esc(label(k))}</b><p>${esc(notes[k])}</p></a>`).join("")}` : ""}
    <div class="sec">Saved stories <small>${stories.length}</small></div>${stories.length ? `<div class="list">${stories.map(n => storyCard(n)).join("")}</div>` : `<p class="muted">Tap <b>Save</b> on any story to keep it here for prep.</p>`}
    ${tks.length ? `<div class="sec">Saved trackers</div>${tks.map(l => `<a class="mod" href="#tracker/${esc(l.id)}"><span class="mod-ic">⌛</span><span><b>${esc(l.title)}</b><small>${esc(l.status)}</small></span></a>`).join("")}` : ""}
    ${mods.length ? `<div class="sec">Saved modules</div>${mods.map(m => `<a class="mod" href="#learn/${esc(m.id)}"><span class="mod-ic">★</span><span><b>${esc(m.title)}</b></span></a>`).join("")}` : ""}`;
  const ex = $("#exp"); if (ex) ex.onclick = async () => {
    const txt = noteKeys.map(k => `## ${label(k)}\n${notes[k]}`).join("\n\n");
    try { await navigator.clipboard.writeText(txt); toast("Notes copied. Paste into any app."); } catch { sheet(`<h3>Your notes</h3><textarea rows="12" style="width:100%">${esc(txt)}</textarea>`); }
  };
}
function meCal(mt) {
  const items = allEvents();
  const fut = items.filter(e => !isPast(e)), past = items.filter(isPast).reverse().slice(0, 6);
  const months = {}; fut.forEach(e => (months[fmtMonth(e.date)] ??= []).push(e));
  mt.innerHTML = `<p class="read small">Results dates update automatically from NSE board-meeting notices. Milestones marked ~ are month-level estimates.</p>
    ${Object.entries(months).map(([m, es]) => `<div class="day">${esc(m)}</div>${es.map(eventRow).join("")}`).join("") || `<p class="muted">No upcoming events.</p>`}
    ${past.length ? `<details class="reveal"><summary>Recent past</summary>${past.map(eventRow).join("")}</details>` : ""}`;
}
function meSettings(mt) {
  const vs = "speechSynthesis" in window ? speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)) : [], focus = store.get("focus", []);
  mt.innerHTML = `
    <label class="set"><span>Dark mode</span><input type="checkbox" id="sdark" ${document.documentElement.classList.contains("dark") ? "checked" : ""}></label>
    <label class="set"><span>Larger text</span><input type="checkbox" id="sbig" ${store.get("big", false) ? "checked" : ""}></label>
    <label class="set"><span>Underline jargon terms</span><input type="checkbox" id="sterm" ${store.get("terms", true) ? "checked" : ""}></label>
    <label class="set"><span>Phone voice</span><select id="svoice"><option value="">Auto (English India)</option>${vs.map(v => `<option ${store.get("voice", "") === v.name ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label>
    <label class="set"><span>Phone voice speed</span><select id="srate">${[0.9, 1, 1.15, 1.3, 1.5].map(r => `<option value="${r}" ${store.get("rate", 1) == r ? "selected" : ""}>${r}×</option>`).join("")}</select></label>
    <label class="set"><span>Speak flashcard answers</span><input type="checkbox" id="scard" ${store.get("cardVoice", false) ? "checked" : ""}></label>
    <div class="set"><span>Focus businesses</span><span class="small muted">${focus.length ? esc(focus.map(f => NAMES[f] || f).join(", ")) : "None (balanced)"}</span></div>
    <p class="note">Focus reorders today's stories on this phone. To make the morning AI briefing prioritise them too, set <code>focus</code> in content/settings.json on GitHub.</p>
    <div class="sec">Backup</div>
    <p class="read small">Your saved stories, notes and flashcard progress live only in this browser. Back them up before you change phones or clear browser data.</p>
    <div class="row-btns"><button class="btn" id="bk">Download backup</button><label class="btn">Restore backup<input type="file" id="bkin" accept=".json,application/json" hidden></label></div>
    <div class="sec">About this app</div>
    <p class="read small">Personal study notes built from public sources: company releases and filings, regulator documents and news reports. It is not affiliated with or endorsed by the Adani Group. Article excerpts are short and always link to the original publisher. Nothing here is investment, legal or regulatory advice, and summaries can contain errors, so check the linked source before relying on a figure.</p>
    <p class="note">Data: ${D.today ? "briefing " + esc(ago(D.today.generated)) : "no briefing yet"} · ${(D.news_archive || []).length} stories archived · content verified ${esc(D.modules?.verified || "–")}</p>`;
  $("#sdark").onchange = e => { store.set("dark", e.target.checked); applyPrefs(); };
  $("#sbig").onchange = e => { store.set("big", e.target.checked); applyPrefs(); };
  $("#sterm").onchange = e => { store.set("terms", e.target.checked); applyPrefs(); };
  $("#svoice").onchange = e => { store.set("voice", e.target.value); Speech.speak("This is how I sound.", "test"); };
  $("#srate").onchange = e => store.set("rate", +e.target.value);
  $("#scard").onchange = e => store.set("cardVoice", e.target.checked);
  $("#bk").onclick = exportBackup;
  $("#bkin").onchange = e => e.target.files[0] && importBackup(e.target.files[0]);
}


/* ------------------------------------------------------------------ OPERATIONS & GM */
let opsTab = "businesses";
const OPS_TABS = [["businesses", "How each runs"], ["gm", "GM toolkit"], ["cases", "Cases"], ["metrics", "Metrics"]];
function renderOps(sub) {
  const el = $("#v-ops"), O = D.operations;
  if (sub && OPS_TABS.some(([k]) => k === sub)) opsTab = sub;
  if (!O) { el.innerHTML = `<h2>Operations</h2><div class="empty">Operations content is loading.</div>`; return; }
  el.innerHTML = `<h2>Operations &amp; GM</h2>
    <p class="dek">How the businesses actually run day to day, and how a general manager thinks about them. Figures carry their period and source.</p>
    <div class="seg" role="tablist">${OPS_TABS.map(([k, l]) => `<button role="tab" data-ot="${k}" aria-selected="${opsTab === k}">${l}</button>`).join("")}</div>
    <div id="ot"></div>`;
  $$("[data-ot]", el).forEach(b => b.onclick = () => { location.hash = "#ops/" + b.dataset.ot; });
  const ot = $("#ot");
  if (opsTab === "businesses") {
    ot.innerHTML = `<div class="mods">${O.operations.map(o => `<a class="mod" href="#ops/${esc(o.key)}">
      <span class="mod-ic">${esc(o.name.charAt(0))}</span><span><b>${esc(o.name)}</b><small>${esc(o.question)}</small></span><span class="mod-m">›</span></a>`).join("")}</div>
      <p class="note">Tap a business for its process, KPIs, levers, bottlenecks and the question to ask.</p>`;
  } else if (opsTab === "gm") {
    const g = O.gm;
    ot.innerHTML = `<div class="sec">How a GM thinks</div><ul class="ticks">${g.mindset.map(m => `<li>${rich(m)}</li>`).join("")}</ul>
      <div class="sec">${esc(g.pnl_tree.title)}</div>
      <div class="figure">${pnlTree(g.pnl_tree)}</div><p class="read">${rich(g.pnl_tree.use)}</p>
      <div class="sec">${esc(g.memo.title)}</div><ol class="plain">${g.memo.sections.map(s => `<li>${rich(s)}</li>`).join("")}</ol>
      <div class="sec">Your first 30 days</div><ol class="plain">${g.first30.map(s => `<li>${rich(s)}</li>`).join("")}</ol>
      <div class="sec">Questions for your mentor</div><ul class="ticks">${g.mentor_questions.map(q => `<li>${rich(q)}</li>`).join("")}</ul>
      <div class="sec">Frameworks</div><div class="items">${g.frameworks.map(f => `<div class="item"><h5>${esc(f.n)}</h5><p class="read">${rich(f.d)}</p></div>`).join("")}</div>
      ${noteBox("ops:gm", "Your own GM notes…")}`;
  } else if (opsTab === "cases") {
    ot.innerHTML = `<p class="read small">Each case is a real situation from the group's own filings or news. Work out your answer before you open the outline.</p>
      <div class="list">${O.cases.map(c => `<details class="case"><summary><b>${esc(c.title)}</b></summary>
        <p class="read">${rich(c.setup)}</p><p class="read"><b>Question:</b> ${rich(c.question)}</p>
        <details class="reveal"><summary>Outline of a strong answer</summary><ul class="ticks">${c.strong_answer_covers.map(x => `<li>${rich(x)}</li>`).join("")}</ul></details>
        <p class="small muted">Source: ${esc(c.src)}</p>${noteBox("ops:case:" + c.id, "Your answer…")}</details>`).join("")}</div>`;
  } else {
    ot.innerHTML = `<div class="items">${O.metrics_cheatsheet.map(m => `<div class="item"><h5>${esc(m.t)}</h5><p class="read">${rich(m.d)}</p></div>`).join("")}</div>
      <div class="sec">Reading list</div><ul class="plain">${O.reading.map(r => `<li><a href="${esc(safeUrl(r.u))}" target="_blank" rel="noopener">${esc(r.t)}</a></li>`).join("")}</ul>`;
  }
}

function renderOpsBusiness(key) {
  const el = $("#v-ops"), O = D.operations, o = (O?.operations || []).find(x => x.key === key);
  if (!o) return renderOps();
  const c = CO[key] || {};
  el.innerHTML = `<article class="reader">
    <button class="back" data-back>‹ Operations</button>
    <p class="kicker" style="--c:${clusterColor(key)}">${esc(o.name)}</p>
    <h2>${esc(o.question)}</h2>
    <div class="row-btns">${sayBtn("ops-" + key)}</div>
    <div class="keybox"><p class="eyebrow">How the work flows</p><ol class="flow">${o.flow.map(f => `<li>${rich(f)}</li>`).join("")}</ol></div>
    <div class="sec">Operating numbers</div>
    <div class="kpis">${o.kpis.map(k => `<div class="kpi"><span class="kv">${esc(k.v)}</span><span class="kl">${rich(k.l)}</span>
      <span class="kn">${esc(k.p)}${k.src ? ` · ${esc(k.src)}` : ""}</span></div>`).join("")}</div>
    <div class="sec">What managers pull</div><ul class="ticks">${o.levers.map(x => `<li>${rich(x)}</li>`).join("")}</ul>
    <div class="sec">Where it gets stuck</div><ul class="ticks">${o.bottlenecks.map(x => `<li>${rich(x)}</li>`).join("")}</ul>
    <div class="sec">Systems</div><p class="read">${rich(o.systems)}</p>
    <div class="panel ask"><p class="eyebrow">Ask this in your first week</p><p class="read">${rich(o.ask)}</p></div>
    ${c.name ? `<a class="tile wide" href="#co/${esc(key)}"><b>Business page: ${esc(c.name)}</b><span>Strategy, financials, ESG and news</span></a>` : ""}
    ${noteBox("ops:" + key, "What you'd check on the ground…")}
  </article>`;
  const sb = $(`[data-say="${CSS.escape("ops-" + key)}"]`);
  if (sb) sb.onclick = () => Speech.toggle([o.name, o.question, "How the work flows.", ...o.flow, "What managers pull.", ...o.levers, "Where it gets stuck.", ...o.bottlenecks, "Question to ask.", o.ask].join(". "), "ops-" + key);
}

function pnlTree(t) {
  const W = 360, H = 250;
  const kids = t.branches.flatMap((b, i) => b.kids.map((k, j) => ({ b: b.n, k, i, j })));
  let s = `<rect x="110" y="6" width="140" height="34" rx="10" fill="var(--ink)"/><text x="180" y="28" text-anchor="middle" class="dg-t" fill="var(--paper)">${esc(t.root)}</text>`;
  t.branches.forEach((b, i) => {
    const x = 6 + i * 122, y = 70;
    s += `<path d="M180,40 Q180,56 ${x + 56},${y}" fill="none" stroke="var(--line)" stroke-width="2"/>
      <rect x="${x}" y="${y}" width="112" height="28" rx="8" fill="var(--teal)"/><text x="${x + 56}" y="${y + 18}" text-anchor="middle" class="dg-t" fill="#fff">${esc(b.n)}</text>`;
    b.kids.forEach((k, j) => {
      const ky = 116 + j * 46;
      s += `<path d="M${x + 56},98 L${x + 56},${ky}" stroke="var(--line)" stroke-width="1.5"/>
        <foreignObject x="${x}" y="${ky}" width="112" height="40"><div xmlns="http://www.w3.org/1999/xhtml" class="pnl-k">${esc(k)}</div></foreignObject>`;
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="dg" role="img" aria-label="${esc(t.title)}">${s}</svg>`;
}


/* ------------------------------------------------------------------ GLOBAL SEARCH */
function searchIndex() {
  const idx = [];
  (D.news_archive || []).forEach(n => idx.push({ k: "Story", t: n.title, s: (n.read?.desc || n.source || ""), h: "#story/" + n.id }));
  (D.companies?.companies || []).forEach(c => idx.push({ k: "Company", t: c.name, s: c.role + " " + c.model, h: "#co/" + c.key }));
  (D.operations?.operations || []).forEach(o => idx.push({ k: "Operations", t: o.name, s: o.question + " " + o.flow.join(" ") + " " + o.levers.join(" ") + " " + o.bottlenecks.join(" "), h: "#ops/" + o.key }));
  (D.operations?.cases || []).forEach(c => idx.push({ k: "Case", t: c.title, s: c.setup, h: "#ops/cases" }));
  tkLines().forEach(l => idx.push({ k: "Tracker", t: l.title, s: l.short + " " + l.timeline.map(e => e.h + " " + e.x).join(" "), h: "#tracker/" + l.id }));
  (D.modules?.modules || []).forEach(m => idx.push({ k: "Module", t: m.title, s: modText(m), h: "#learn/" + m.id }));
  (D.glossary?.terms || []).forEach(t => idx.push({ k: "Term", t: t.t, s: t.d, h: "#learn/glossary", term: t.t }));
  (D.operations?.metrics_cheatsheet || []).forEach(t => idx.push({ k: "Ops metric", t: t.t, s: t.d, h: "#ops/metrics" }));
  allEvents().forEach(e => idx.push({ k: "Event", t: e.title, s: e.detail || "", h: "#me/calendar" }));
  const notes = store.get("notes", {});
  Object.entries(notes).forEach(([k, v]) => idx.push({ k: "Your note", t: v.slice(0, 80), s: v, h: k.startsWith("story:") ? "#story/" + k.slice(6) : k.startsWith("co:") ? "#co/" + k.slice(3) : k.startsWith("ops:") ? "#ops" : "#learn/" + k.slice(4) }));
  return idx;
}
function openSearch() {
  sheet(`<p class="eyebrow">Search everything</p><input class="search" id="gs" type="search" placeholder="Try Khavda, PLF, Evos, smart meters…" aria-label="Search everything" autofocus>
    <div id="gsr" class="gsr"></div>`);
  const idx = searchIndex(), inp = $("#gs");
  const run = () => {
    const q = inp.value.trim().toLowerCase();
    if (q.length < 2) { $("#gsr").innerHTML = `<p class="small muted">Searches stories, companies, operations, cases, modules, terms, events and your notes.</p>`; return; }
    const words = q.split(/\s+/);
    const hits = idx.map(x => { const hay = (x.t + " " + x.s).toLowerCase(); if (!words.every(w => hay.includes(w))) return null;
      return { ...x, score: (x.t.toLowerCase().includes(q) ? 10 : 0) + (x.k === "Company" || x.k === "Term" ? 2 : 0) }; })
      .filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 40);
    $("#gsr").innerHTML = hits.length ? hits.map(x => {
      const i = x.s.toLowerCase().indexOf(words[0]); const snip = x.s.slice(Math.max(0, i - 40), i + 110);
      return `<a class="gs-hit" href="${esc(x.h)}"><span class="gs-k">${esc(x.k)}</span><b>${esc(x.t)}</b>${snip && x.s !== x.t ? `<small>${esc((i > 40 ? "…" : "") + snip)}…</small>` : ""}</a>`; }).join("")
      : `<p class="muted">No match for "${esc(inp.value)}".</p>`;
  };
  inp.oninput = () => { clearTimeout(inp._t); inp._t = setTimeout(run, 150); }; run(); setTimeout(() => inp.focus(), 50);
  $("#gsr").onclick = e => { if (e.target.closest(".gs-hit")) closeSheet(); };
}

/* ------------------------------------------------------------------ BACKUP: notes, saved, flashcard progress */
function exportBackup() {
  const keys = ["saved", "notes", "leitner", "introduced", "seen", "focus", "prep"];
  const data = { type: "adani-hub-backup", made: new Date().toISOString(), v: 1, data: Object.fromEntries(keys.map(k => [k, store.get(k, null)])) };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `adani-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast("Backup downloaded");
}
async function importBackup(file) {
  try {
    const j = JSON.parse(await file.text());
    if (j.type !== "adani-hub-backup" || typeof j.data !== "object") throw 0;
    const allowed = ["saved", "notes", "leitner", "introduced", "seen", "focus", "prep"];
    Object.entries(j.data).forEach(([k, v]) => { if (allowed.includes(k) && v !== null) store.set(k, v); });
    toast("Backup restored"); route();
  } catch { toast("That file isn't a valid hub backup"); }
}

/* ------------------------------------------------------------------ router */
function applyPrefs() {
  const saved = store.get("dark", null), dark = saved === null ? matchMedia("(prefers-color-scheme: dark)").matches : saved;
  document.documentElement.classList.toggle("dark", !!dark);
  document.documentElement.classList.toggle("big-text", store.get("big", false));
  document.documentElement.classList.toggle("no-terms", !store.get("terms", true));
  $('meta[name="theme-color"]').content = dark ? "#0C1B26" : "#0E2433";
}
const scrollMem = {};
let navCount = 0;
const parentOf = h => ({ story: "news", tracker: "tracker", co: "companies", ops: "ops", learn: "learn", me: "me" }[h.split("/")[0]] || "today");
function route() {
  navCount++;
  const h = (location.hash || "#today").slice(1), [a, b0] = h.split("/");
  let b = b0; try { b = b0 && decodeURIComponent(b0); } catch { b = ""; }
  const tab = { story: "news", tracker: "news", co: "companies", ops: "ops" }[a] || (VIEWS.includes(a) ? a : "today");
  Speech.stop(); closeSheet();
  $$(".view").forEach(s => s.classList.toggle("on", s.id === "v-" + tab));
  $$(".tabs button").forEach(x => x.dataset.v === tab ? x.setAttribute("aria-current", "page") : x.removeAttribute("aria-current"));
  if (a === "story") renderStory(b);
  else if (a === "co") renderCompany(b);
  else if (a === "learn") renderLearn(b);
  else if (a === "me") renderMe(b);
  else if (a === "tracker") (b ? renderTracker(b) : renderTrackers());
  else if (a === "news") renderNews();
  else if (a === "companies") renderCompanies();
  else if (a === "ops") (b && (D.operations?.operations || []).some(x => x.key === b) ? renderOpsBusiness(b) : renderOps(b));
  else renderToday();
  Player.ui();
  const deep = a === "story" || (a === "tracker" && b) || a === "co" || (a === "ops" && b) || (a === "learn" && b && !["modules", "glossary", "cards", "audio"].includes(b));
  scrollTo(0, deep ? 0 : (scrollMem[h] || 0));
}
addEventListener("scroll", () => { scrollMem[(location.hash || "#today").slice(1)] = scrollY; }, { passive: true });
addEventListener("hashchange", route);

function freshness() {
  const f = $("#fresh"), g = D.today?.generated; if (!g) { f.textContent = ""; return; }
  const h = (Date.now() - new Date(g)) / 36e5; f.innerHTML = `Updated<br>${esc(ago(g))}`; f.classList.toggle("stale", h > 36);
  if (h > 36) f.title = "The daily update hasn't run for over 36 hours. Check GitHub → Actions.";
}

/* global delegated clicks */
document.addEventListener("click", e => {
  const t = e.target;
  const src = t.closest("[data-src]"); if (src) { e.preventDefault(); Player.playing(src.dataset.src) ? Player.pause() : Player.play(src.dataset.src, src.dataset.title); return; }
  const term = t.closest("[data-term]"); if (term) { e.preventDefault(); e.stopPropagation(); termSheet(term.dataset.term); return; }
  const evh = t.closest("[data-evhelp]"); if (evh) { e.preventDefault(); e.stopPropagation(); const k = evh.dataset.evhelp; sheet(`<p class="eyebrow">Evidence type</p><h3>${esc(EV[k] || k)}</h3><p class="read">${esc(EVHELP[k] || "")}</p>`); return; }
  const back = t.closest("[data-back]"); if (back) { e.preventDefault(); if (navCount > 1) history.back(); else location.hash = "#" + parentOf((location.hash || "").slice(1)); return; }
  const go = t.closest("[data-go]"); if (go) { location.hash = go.dataset.go; return; }
  const sv = t.closest("[data-save]"); if (sv) { const n = storyById(sv.dataset.save); Saved.toggle(sv.dataset.save, { kind: "story", title: n?.title }); renderStory(sv.dataset.save); return; }
  const st = t.closest("[data-say-text]"); if (st) { Speech.toggle(st.dataset.sayText, "sheet"); return; }
  const tr = t.closest("tr[data-href]"); if (tr) { location.hash = tr.dataset.href; return; }
});
document.addEventListener("input", e => { const n = e.target.closest("[data-note]"); if (n) { clearTimeout(n._t); n._t = setTimeout(() => Saved.setNote(n.dataset.note, n.value), 400); } });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

async function boot() {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  applyPrefs(); Player.init(); Player.ui();
  $$(".tabs button").forEach(b => b.onclick = () => { location.hash = "#" + b.dataset.v; });
  $("#searchbtn").onclick = openSearch;
  $("#refresh").onclick = async () => { await load(); freshness(); route(); toast("Up to date"); };
  await load(); freshness(); route();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();
