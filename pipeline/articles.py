"""Make stories readable inside the app.

For the most important stories each day we:
  1. decode the Google News redirect to the publisher's real URL,
  2. fetch the page and pull the description, image and the first few substantial paragraphs.

We keep only a short excerpt (lead paragraphs) and always link to the original.
Anything that fails is simply left without an excerpt; the run never stops.
"""
import html
import json
import re
import time
import urllib.parse

import requests

from config import UA

H = {"User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9"}
MAX_PARAS = 5
MAX_CHARS = 1800
JUNK = re.compile(r"(cookie|subscribe|newsletter|sign up|log ?in|advertis|all rights reserved|follow us|"
                  r"download (the )?app|read more|also read|click here|whatsapp|telegram channel|©|reference #|edgesuite|"
                  r"access denied|catch all the|breaking news and latest|enable javascript)", re.I)
PLAYER = re.compile(r"^(listen|play)\s+\d{1,2}:\d{2}(\s+[\d.]+x)*\s*", re.I)


def _clean(s: str) -> str:
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    return re.sub(r"\s+", " ", s).strip()


_THROTTLED = {"google": False}


def decode_google(url: str) -> str:
    """news.google.com/rss/articles/<id> -> publisher URL (via Google's own batchexecute endpoint).
    If Google rate-limits us (HTTP 429) we stop trying for the rest of this run."""
    if "news.google.com" not in url or _THROTTLED["google"]:
        return url
    try:
        aid = urllib.parse.urlparse(url).path.rstrip("/").split("/")[-1]
        resp = requests.get(f"https://news.google.com/articles/{aid}", headers=H, timeout=(5, 10))
        if resp.status_code == 429:
            _THROTTLED["google"] = True
            print("[articles] Google rate-limited; using fallbacks for the rest of this run")
            return url
        page = resp.text
        sg = re.search(r'data-n-a-sg="([^"]+)"', page)
        ts = re.search(r'data-n-a-ts="([^"]+)"', page)
        if not (sg and ts):
            return url
        inner = ["garturlreq", [["X", "X", ["X", "X"], None, None, 1, 1, "US:en", None, 1, None, None, None, None, None, 0, 1],
                                "X", "X", 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0], aid, int(ts.group(1)), sg.group(1)]
        req = [[["Fbv4je", json.dumps(inner), None, "generic"]]]
        r = requests.post("https://news.google.com/_/DotsSplashUi/data/batchexecute",
                          data={"f.req": json.dumps(req)},
                          headers={**H, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"}, timeout=(5, 10))
        m = re.search(r'\[\\"garturlres\\",\\"(.*?)\\"', r.text)
        return m.group(1).encode().decode("unicode_escape") if m else url
    except Exception:
        return url


def _meta(s: str, *names) -> str:
    for n in names:
        m = (re.search(rf'<meta[^>]+(?:property|name)=["\']{n}["\'][^>]*content=["\']([^"\']*)', s, re.I)
             or re.search(rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']{n}["\']', s, re.I))
        if m and m.group(1).strip():
            return html.unescape(m.group(1)).strip()
    return ""


def _paragraphs(s: str, title: str) -> list:
    body = re.sub(r"<(script|style|nav|header|footer|aside|form|figure)[^>]*>.*?</\1>", " ", s, flags=re.S | re.I)
    # prefer <article> if present
    art = re.search(r"<article[^>]*>(.*?)</article>", body, re.S | re.I)
    scope = art.group(1) if art and len(art.group(1)) > 1500 else body
    out, total = [], 0
    tnorm = title.lower()[:60]
    for raw in re.findall(r"<p[^>]*>(.*?)</p>", scope, re.S | re.I):
        p = PLAYER.sub("", _clean(raw))
        if len(p) < 70 or JUNK.search(p) or p.lower()[:60] == tnorm:
            continue
        if any(p[:80] == q[:80] for q in out):
            continue
        out.append(p)
        total += len(p)
        if len(out) >= MAX_PARAS or total >= MAX_CHARS:
            break
    return out


def extract(url: str, title: str, snippet: str = "") -> dict:
    real = decode_google(url)
    info = {"link": real, "desc": snippet[:400], "paras": [], "image": ""}
    if "news.google.com" in real:
        return info
    try:
        r = requests.get(real, headers=H, timeout=(5, 10), stream=True)
        if r.status_code != 200 or "text/html" not in r.headers.get("content-type", "text/html"):
            return info
        raw = b""
        for chunk in r.iter_content(65536):        # cap at ~1.5 MB
            raw += chunk
            if len(raw) > 1_500_000:
                break
        s = raw.decode(r.encoding or "utf-8", errors="replace")
        if "access denied" in s[:3000].lower():
            return info
        desc = _meta(s, "og:description", "description", "twitter:description")[:400]
        # discard site taglines ("Power Line - News", "Latest business news...") that aren't about the story
        tw = {w for w in re.findall(r"[a-z]{4,}", title.lower())}
        dw = {w for w in re.findall(r"[a-z]{4,}", desc.lower())}
        info["desc"] = desc if len(desc) >= 60 and len(tw & dw) >= 2 else info["desc"]
        img = _meta(s, "og:image", "twitter:image")
        info["image"] = img if img.startswith("https://") else ""
        info["paras"] = _paragraphs(s, title)
    except Exception:
        pass
    return info


def enrich(items: list, archive: list, limit: int = 25) -> None:
    """Add 'read' to the top `limit` items (mutates). Re-uses previously fetched excerpts from the archive."""
    # reuse only successful extractions; failed ones (e.g. a rate-limited day) are retried
    cache = {a["id"]: a["read"] for a in archive if (a.get("read") or {}).get("paras")}
    done = 0
    deadline = time.monotonic() + 420          # hard budget: 7 minutes for all article fetching
    for it in items:
        if it["id"] in cache:
            it["read"] = cache[it["id"]]
            continue
        if done >= limit or time.monotonic() > deadline:
            if it.get("snippet") and not it.get("read"):
                it["read"] = {"link": it["url"], "desc": it["snippet"][:400], "paras": [], "image": ""}
            continue
        # try the main link, then up to two alternative outlets that ran the same story
        # direct links first (Bing / publisher), Google redirects last
        cands = sorted([it["url"]] + [a["url"] for a in it.get("also", [])[:4]], key=lambda u: "news.google.com" in u)[:3]
        best = None
        for u in cands:
            r = extract(u, it["title"], it.get("snippet", ""))
            if r["paras"]:
                best = r
                break
            if not best or (r["desc"] and not best["desc"]):
                best = r
            if time.monotonic() > deadline:
                break
        it["read"] = best
        done += 1
        time.sleep(1.0)          # be polite
    ok = sum(1 for i in items if i.get("read", {}).get("paras") or i.get("read", {}).get("desc"))
    print(f"[articles] fetched {done}, readable {ok}/{len(items)}")
