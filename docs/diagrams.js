/* Data-driven SVG diagrams. Each function returns an SVG string. Colours follow CSS variables so dark mode works. */
"use strict";

const Dg = (() => {
  const e = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wrap = (txt, n) => { const w = String(txt).split(" "), out = []; let cur = ""; for (const x of w) { if ((cur + " " + x).trim().length > n) { out.push(cur.trim()); cur = x; } else cur += " " + x; } if (cur.trim()) out.push(cur.trim()); return out; };
  const tspans = (lines, x, dy) => lines.map((l, i) => `<tspan x="${x}" dy="${i ? dy : 0}">${e(l)}</tspan>`).join("");

  /* 1. Group structure: four clusters; listed companies are solid tiles, AEL-incubated ones dashed. Tiles are links. */
  function structure(C) {
    const byKey = Object.fromEntries(C.companies.map(c => [c.key, c]));
    const W = 360, colW = 172, gap = 16, tileH = 40, top = 74;
    let y0 = top, svg = "", maxY = 0;
    const cols = [[C.clusters[0], C.clusters[2]], [C.clusters[1], C.clusters[3]]];
    cols.forEach((col, ci) => {
      let y = top; const x = ci * (colW + gap);
      col.forEach(cl => {
        svg += `<text x="${x}" y="${y}" class="dg-h" fill="${cl.color}">${e(cl.name)}</text>`; y += 10;
        cl.members.forEach(k => {
          const c = byKey[k]; if (!c) return;
          const listed = c.listed;
          svg += `<a href="#co/${k}" class="dg-link"><rect x="${x}" y="${y}" width="${colW}" height="${tileH - 6}" rx="8"
            fill="${listed ? cl.color : "var(--paper)"}" stroke="${cl.color}" stroke-width="1.5" ${listed ? "" : 'stroke-dasharray="4 3"'}/>
            <text x="${x + 10}" y="${y + 15}" class="dg-t" fill="${listed ? "#fff" : "var(--ink)"}">${e(c.short === c.name ? c.name : c.short)}</text>
            <text x="${x + 10}" y="${y + 28}" class="dg-s" fill="${listed ? "rgba(255,255,255,.85)" : "var(--muted)"}">${e(listed ? (c.ticker || "listed") : "inside AEL")}</text>
            <text x="${x + colW - 12}" y="${y + 22}" class="dg-s" text-anchor="end" fill="${listed ? "#fff" : "var(--muted)"}">›</text></a>`;
          y += tileH;
        });
        y += 14;
      });
      maxY = Math.max(maxY, y);
    });
    const head = `<a href="#co/ael" class="dg-link"><rect x="0" y="0" width="${W}" height="48" rx="10" fill="var(--ink)"/>
      <text x="14" y="20" class="dg-t" fill="var(--paper)">Adani Enterprises: flagship and incubator</text>
      <text x="14" y="37" class="dg-s" fill="var(--paper)" opacity=".8">New platforms start inside AEL (dashed tiles), then list separately (solid)</text></a>`;
    return `<svg viewBox="0 0 ${W} ${maxY}" class="dg" role="img" aria-label="Adani Group structure diagram">${head}${svg}</svg>`;
  }

  /* 2. Value-chain flows as three columns: upstream -> core -> downstream. Each arrow is one supply link. */
  function flows(C) {
    const byKey = Object.fromEntries(C.companies.map(c => [c.key, c]));
    const col = k => (C.clusters.find(cl => cl.members.includes(k)) || {}).color || "#777";
    const layer = { mining: 0, copper: 0, anil: 0, apsez: 0, power: 1, agel: 1, cement: 2, aesl: 2, dc: 3, airports: 3 };
    const cols = [[], [], [], []];
    [...new Set(C.flows.flatMap(f => [f[0], f[1]]))].forEach(k => cols[layer[k] ?? 1].push(k));
    const W = 360, colX = [6, 96, 186, 276], bw = 80, bh = 34, gap = 14, top = 30;
    const pos = {};
    cols.forEach((ks, ci) => ks.forEach((k, i) => pos[k] = [colX[ci], top + i * (bh + gap)]));
    const H = top + Math.max(...cols.map(c => c.length)) * (bh + gap) + 6;
    const heads = ["Inputs", "Produce", "Grid", "Users"].map((t, i) => `<text x="${colX[i]}" y="14" class="dg-s" fill="var(--muted)" font-weight="700">${e(t)}</text>`).join("");
    let paths = "";
    C.flows.forEach(([a, b, label]) => {
      const [x1, y1] = pos[a], [x2, y2] = pos[b];
      const sx = x1 + bw, sy = y1 + bh / 2, tx = x2, ty = y2 + bh / 2;
      const back = tx <= sx;   // same/left column: route around
      const d = back ? `M${x1 + bw / 2},${y1 + bh} C${x1 + bw / 2},${y1 + bh + 20} ${x2 + bw / 2},${y2 - 20} ${x2 + bw / 2},${y2}`
                     : `M${sx},${sy} C${(sx + tx) / 2},${sy} ${(sx + tx) / 2},${ty} ${tx - 3},${ty}`;
      paths += `<path d="${d}" class="dg-flow" stroke="${col(a)}" marker-end="url(#arw)"><title>${e(byKey[a].short)} supplies ${e(byKey[b].short)}: ${e(label)}</title></path>`;
    });
    const nodes = Object.entries(pos).map(([k, [x, y]]) => `<a href="#co/${k}" class="dg-link"><rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="8" fill="var(--paper)" stroke="${col(k)}" stroke-width="2"/>
      <text x="${x + bw / 2}" y="${y + bh / 2 + 4}" text-anchor="middle" class="dg-t" fill="var(--ink)">${e(byKey[k].short.length > 11 ? byKey[k].short.slice(0, 10) + "…" : byKey[k].short)}</text></a>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="dg" role="img" aria-label="How the businesses feed each other">
      <defs><marker id="arw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--muted)"/></marker></defs>
      ${heads}${paths}${nodes}</svg>`;
  }

  /* 3. Horizontal timeline, scrolls sideways on phones. */
  function timeline(C) {
    const items = C.timeline, step = 128, W = items.length * step + 40, H = 210;
    const colr = { legal: "var(--reported)", group: "var(--ink)" };
    const byKey = Object.fromEntries(C.companies.map(c => [c.key, c]));
    const cl = k => colr[k] || (C.clusters.find(x => x.members.includes(k)) || {}).color || "var(--teal)";
    let s = `<line x1="10" y1="56" x2="${W - 10}" y2="56" stroke="var(--line)" stroke-width="3"/>`;
    items.forEach((it, i) => {
      const x = 30 + i * step;
      s += `<circle cx="${x}" cy="56" r="8" fill="${cl(it.c)}"/><text x="${x}" y="36" text-anchor="middle" class="dg-y">${it.y}</text>
        <text x="${x - 6}" y="86" class="dg-t" fill="var(--ink)">${tspans(wrap(it.t, 16), x - 6, 15)}</text>
        <text x="${x - 6}" y="${86 + 15 * wrap(it.t, 16).length + 6}" class="dg-s" fill="var(--muted)">${tspans(wrap(it.d, 21).slice(0, 5), x - 6, 13)}</text>`;
    });
    return `<div class="hscroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="dg" role="img" aria-label="Adani timeline">${s}</svg></div>`;
  }

  /* 4. The business loop (mental model). */
  function loop() {
    const steps = [["Capital", "Debt and equity, global long-term investors"], ["Build", "Ports, power, grid, airports"], ["Operate", "Contracted, regulated cash flows"],
      ["Adjacency", "Each asset opens the next"], ["Incubate", "New bets inside AEL"], ["Scale or unlock", "List, raise capital, recycle"]];
    const cx = 180, cy = 170, R = 118, W = 360, H = 340;
    let s = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="3 6"/>`;
    steps.forEach(([t, d], i) => {
      const a = -Math.PI / 2 + i * Math.PI / 3, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      const a2 = a + Math.PI / 6, ax = cx + R * Math.cos(a2), ay = cy + R * Math.sin(a2);
      s += `<path d="M${ax - 5},${ay - 5} l5,5 l-5,5" transform="rotate(${(a2 * 180 / Math.PI) + 90} ${ax} ${ay})" fill="none" stroke="var(--teal)" stroke-width="2.5"/>`;
      s += `<rect x="${x - 54}" y="${y - 24}" width="108" height="48" rx="10" fill="var(--paper)" stroke="var(--teal)" stroke-width="1.5"/>
        <text x="${x}" y="${y - 6}" text-anchor="middle" class="dg-t" fill="var(--ink)">${i + 1}. ${e(t)}</text>
        <text x="${x}" y="${y + 9}" text-anchor="middle" class="dg-s" fill="var(--muted)">${tspans(wrap(d, 20).slice(0, 2), x, 11)}</text>`;
    });
    s += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="dg-h" fill="var(--ink)">The Adani</text><text x="${cx}" y="${cy + 14}" text-anchor="middle" class="dg-h" fill="var(--ink)">flywheel</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="dg" role="img" aria-label="Capital, build, operate, adjacency, incubate, scale loop">${s}</svg>`;
  }

  /* 5. Strategy thesis chain. */
  function thesis() {
    const n = [["Renewables", "AGEL 20.8 GW"], ["Grid + storage", "AESL · BESS 6.6 GWh"], ["Firm power", "Thermal, hydro, nuclear (target)"], ["AI compute", "AdaniConneX 1.2 GW tied up"]];
    const W = 360, H = 300; let s = "";
    n.forEach(([t, d], i) => {
      const y = 10 + i * 72;
      s += `<rect x="40" y="${y}" width="280" height="52" rx="12" fill="${i === 3 ? "var(--ink)" : "var(--paper)"}" stroke="var(--teal)" stroke-width="1.5"/>
        <text x="58" y="${y + 22}" class="dg-t" fill="${i === 3 ? "var(--paper)" : "var(--ink)"}">${e(t)}</text>
        <text x="58" y="${y + 39}" class="dg-s" fill="${i === 3 ? "var(--paper)" : "var(--muted)"}">${e(d)}</text>`;
      if (i < 3) s += `<path d="M180 ${y + 54} v14" stroke="var(--teal)" stroke-width="2.5" marker-end="url(#a2)"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="dg" role="img" aria-label="Physical to digital infrastructure thesis"><defs><marker id="a2" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--teal)"/></marker></defs>${s}</svg>`;
  }

  /* 6. Leverage comparison bar (numbers module). */
  function leverage() {
    const rows = [["APSEZ (mature ports)", 1.8], ["Adani Power", 2.1], ["APSEZ + Evos (pro forma)", 2.76], ["AGEL (building)", 5.6]];
    return bars("Net debt / EBITDA (x)", rows, "x", 6, [[2.5, "APSEZ ceiling 2.5x"]]);
  }

  /* 7. Legal tracks swim-lane: one lane per proceeding, latest status highlighted. */
  function legal() {
    const lanes = [
      ["SEBI / Hindenburg (India)", [["Jan '23", "Hindenburg report"], ["Sep '25", "Orders on some allegations"], ["Sep '26", "LODR + MPS cases settled"]]],
      ["US DOJ (criminal)", [["Nov '24", "Indictment"], ["Aug '26", "Dismissed with prejudice"]]],
      ["US SEC (civil)", [["Nov '24", "Complaint filed"], ["May '26", "Consent judgments filed"]]],
      ["OFAC (sanctions)", [["May '26", "$275m settlement by AEL"]]],
    ];
    const W = 360, lh = 92, colW = (W - 20) / 3; let s = "";
    lanes.forEach(([n, pts], i) => {
      const y = 16 + i * lh;
      s += `<text x="0" y="${y}" class="dg-t" fill="var(--ink)">${e(n)}</text><line x1="8" y1="${y + 20}" x2="${W - 8}" y2="${y + 20}" stroke="var(--line)" stroke-width="2"/>`;
      pts.forEach(([d, t], j) => {
        const x = 10 + j * colW, last = j === pts.length - 1;
        s += `<circle cx="${x + 4}" cy="${y + 20}" r="${last ? 7 : 5}" fill="${last ? "var(--regulator)" : "var(--muted)"}"/>
          <text x="${x}" y="${y + 42}" class="dg-y" font-size="12">${e(d)}</text>
          <text x="${x}" y="${y + 56}" class="dg-s" fill="${last ? "var(--ink)" : "var(--muted)"}">${tspans(wrap(t, 17).slice(0, 2), x, 12)}</text>`;
      });
    });
    return `<svg viewBox="0 0 ${W} ${lanes.length * lh}" class="dg" role="img" aria-label="Four separate legal tracks and their latest status">${s}
      </svg>`;
  }

  /* Generic horizontal bars. */
  function bars(title, rows, unit, max, refs = []) {
    const W = 360, rowH = 34, top = 26, labelW = 0;
    max = max || Math.max(...rows.map(r => r[1])) * 1.12;
    const x = v => 8 + (v / max) * (W - 70);
    let s = `<text x="0" y="14" class="dg-s" fill="var(--muted)">${e(title)}</text>`;
    rows.forEach(([l, v], i) => {
      const y = top + i * rowH;
      s += `<text x="8" y="${y + 11}" class="dg-s" fill="var(--ink)">${e(l)}</text>
        <rect x="8" y="${y + 15}" width="${Math.max(2, x(v) - 8)}" height="12" rx="3" fill="var(--teal)"/>
        <text x="${x(v) + 6}" y="${y + 25}" class="dg-s" font-weight="700" fill="var(--ink)">${e(fmt(v))}${unit === "%" || unit === "x" ? unit : ""}</text>`;
    });
    refs.forEach(([v, l]) => { s += `<line x1="${x(v)}" y1="${top}" x2="${x(v)}" y2="${top + rows.length * rowH}" stroke="var(--beacon)" stroke-width="2" stroke-dasharray="4 3"/><text x="${x(v) + 4}" y="${top + rows.length * rowH + 12}" class="dg-s" fill="var(--muted)">${e(l)}</text>`; });
    return `<svg viewBox="0 0 ${W} ${top + rows.length * rowH + (refs.length ? 18 : 4)}" class="dg" role="img" aria-label="${e(title)}">${s}</svg>`;
  }
  function line(title, pts, unit) {
    const W = 360, H = 150, pad = 30, max = Math.max(...pts.map(p => p[1])) * 1.1;
    const X = i => pad + i * ((W - pad * 2) / (pts.length - 1)), Y = v => H - 34 - (v / max) * (H - 60);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${X(i)},${Y(p[1])}`).join("");
    let s = `<text x="0" y="14" class="dg-s" fill="var(--muted)">${e(title)}</text><path d="${d}" fill="none" stroke="var(--teal)" stroke-width="2.5"/>`;
    pts.forEach((p, i) => {
      const target = /target/i.test(p[0]);
      s += `<circle cx="${X(i)}" cy="${Y(p[1])}" r="5" fill="${target ? "var(--paper)" : "var(--teal)"}" stroke="var(--teal)" stroke-width="2"/>
        <text x="${X(i)}" y="${Y(p[1]) - 10}" text-anchor="middle" class="dg-s" font-weight="700" fill="var(--ink)">${e(fmt(p[1]))}</text>
        <text x="${X(i)}" y="${H - 16}" text-anchor="middle" class="dg-s" fill="var(--muted)">${tspans(wrap(p[0], 11).slice(0, 2), X(i), 11)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="dg" role="img" aria-label="${e(title)}">${s}</svg>`;
  }
  const fmt = v => v >= 1000 ? Math.round(v).toLocaleString("en-IN") : (Math.round(v * 100) / 100).toString();

  /* Ownership donut. */
  function donut(pct, label) {
    const r = 34, c = 2 * Math.PI * r, f = c * pct / 100;
    return `<svg viewBox="0 0 90 90" width="84" height="84" class="dg donut" role="img" aria-label="${e(label)} ${pct}%">
      <circle cx="45" cy="45" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/>
      <circle cx="45" cy="45" r="${r}" fill="none" stroke="var(--teal)" stroke-width="10" stroke-dasharray="${f} ${c}" transform="rotate(-90 45 45)" stroke-linecap="round"/>
      <text x="45" y="49" text-anchor="middle" class="dg-t" fill="var(--ink)">${pct}%</text></svg>`;
  }

  /* ESG comparison: Sustainalytics risk (lower = better). */
  function esgCompare(C) {
    const rows = C.companies.filter(c => c.esg?.sust).map(c => [c.short, c.esg.sust[0], c.esg.sust[1]]).sort((a, b) => a[1] - b[1]);
    const W = 360, rowH = 30, top = 30, max = 40, x = v => 92 + v / max * (W - 140);
    let s = `<text x="0" y="14" class="dg-s" fill="var(--muted)">Sustainalytics ESG risk score (lower is better)</text>`;
    [[10, "Low"], [20, "Medium"], [30, "High"]].forEach(([v, l]) => s += `<line x1="${x(v)}" y1="${top - 6}" x2="${x(v)}" y2="${top + rows.length * rowH}" stroke="var(--line)"/><text x="${x(v)}" y="${top + rows.length * rowH + 12}" text-anchor="middle" class="dg-s" fill="var(--muted)">${v}</text>`);
    rows.forEach(([n, v, band], i) => {
      const y = top + i * rowH, c = v < 20 ? "var(--up)" : v < 30 ? "var(--target)" : "var(--down)";
      s += `<text x="0" y="${y + 14}" class="dg-s" fill="var(--ink)" font-weight="700">${e(n)}</text><rect x="92" y="${y + 4}" width="${x(v) - 92}" height="14" rx="3" fill="${c}"/><text x="${x(v) + 5}" y="${y + 15}" class="dg-s" fill="var(--ink)">${v} · ${e(band)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${top + rows.length * rowH + 16}" class="dg" role="img" aria-label="ESG risk comparison">${s}</svg>`;
  }

  return { structure, flows, timeline, loop, thesis, leverage, legal, bars, line, donut, esgCompare };
})();
