/* Offline support.
   - App shell (html/js/css): stale-while-revalidate, so it opens instantly and picks up new versions on the next open.
   - data/*.json: network-first, falling back to the last good copy (read on a flight).
   - audio: cached on first full play; Range requests are answered with proper 206 slices so seeking/resume work. */
// Bump SHELL on every front-end change so all shell files update together.
const SHELL = "aih-shell-v6", DATA = "aih-data-v1", AUDIO = "aih-audio-v1";
const OURS = [SHELL, DATA, AUDIO];
const FILES = ["./", "index.html", "styles.css", "app.js", "diagrams.js", "manifest.webmanifest", "fonts/archivo.woff2", "fonts/sourceserif.woff2", "icons/icon-192.png"];

self.addEventListener("install", e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  // only touch our own caches: other apps may share this github.io origin
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("aih-") && !OURS.includes(k)).map(k => caches.delete(k)))));
  self.clients.claim();
});

async function rangeFrom(resp, rangeHeader) {
  const buf = await resp.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader) || [];
  let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : size - 1;
  if (!m[1] && m[2]) { start = size - +m[2]; end = size - 1; }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206, statusText: "Partial Content",
    headers: { "Content-Type": "audio/mpeg", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" },
  });
}

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (url.origin !== location.origin || req.method !== "GET") return;
  const p = url.pathname;

  if (p.includes("/data/")) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(DATA).then(x => x.put(p, c)); }
      return r;
    }).catch(() => caches.open(DATA).then(x => x.match(p))));
    return;
  }

  if (p.endsWith(".mp3")) {
    const key = url.pathname + url.search;          // ?v=hash makes re-recorded modules a new entry
    e.respondWith((async () => {
      const c = await caches.open(AUDIO);
      const hit = await c.match(key);
      const range = req.headers.get("range");
      if (hit) return range ? rangeFrom(hit, range) : hit;
      // not cached: stream from network now, and fetch the full file in the background for offline replays
      e.waitUntil(fetch(key).then(r => { if (r.ok && r.status === 200) return c.put(key, r); }).catch(() => {}));
      return fetch(req);
    })());
    return;
  }

  e.respondWith(caches.open(SHELL).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
