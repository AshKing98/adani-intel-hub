"""Collect Adani news from (1) the official adani.com newsroom and (2) Google News RSS.

Output: list of dicts {id,title,url,source,tier,date,companies,snippet,official}
"""
import hashlib
import html
import re
import urllib.parse
from datetime import datetime, timedelta, timezone

import feedparser
import requests

import similar

from config import COMPANIES, NOISE_PATTERNS, NOISE_SOURCES, QUERIES, TIERS, UA

# A headline must name an Adani entity/asset to count (Google News returns lots of unrelated
# "related stories" from the same outlet otherwise).
RELEVANT = re.compile(r"\b(adani|ambuja|acc ltd|acc limited|orient cement|adaniconnex|navi mumbai (international )?airport|"
                      r"khavda|mundra|vizhinjam|apsez|agel|aesl|atgl)\b", re.I)
IST = timezone(timedelta(hours=5, minutes=30))


def _clean(s: str) -> str:
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    return re.sub(r"\s+", " ", s).strip()


def _id(title: str) -> str:
    return hashlib.sha1(_norm(title).encode(), usedforsecurity=False).hexdigest()[:12]


def _norm(title: str) -> str:
    t = title.lower()
    t = re.sub(r"[^a-z0-9 ]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


OFFICIAL_DOMAINS = ("adani.com", "adaniports.com", "adanigreenenergy.com", "adanienterprises.com", "adanipower.com",
                    "adanienergysolutions.com", "adanigas.com", "ambujacement.com", "acclimited.com", "adaniairports.com",
                    "adaniconnex.com", "adanidefence.com", "adanirealty.com")


def _host(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.lower().removeprefix("www.")
    except Exception:
        return ""


def tier_of(source: str, url: str = "") -> str:
    """Evidence tier. 'official' only when the link is ON an Adani domain (never because 'adani' appears in a URL path)."""
    host = _host(url)
    if host and any(host == d or host.endswith("." + d) for d in OFFICIAL_DOMAINS):
        return "official"
    hay = f"{source} {host}".lower()
    if "ndtv" in hay:              # NDTV is owned by the Adani Group: not independent coverage
        return "affiliated"
    if any(k in hay for k in TIERS["regulator"]):
        return "regulator"
    if any(k in hay for k in TIERS["independent"]):
        return "independent"
    return "other"


def tag_companies(text: str) -> list:
    t = " " + re.sub(r"[^a-z0-9& ]", " ", text.lower()) + " "
    hits = [c["key"] for c in COMPANIES if any(k in t for k in c["kw"])]
    # 'group' is a fallback only
    specific = [h for h in hits if h != "group"]
    return specific or ["group"]


def is_noise(title: str, source: str) -> bool:
    s = source.lower()
    if any(n in s for n in NOISE_SOURCES):
        return True
    return any(re.search(p, title, re.I) for p in NOISE_PATTERNS)


# --------------------------------------------------------------------------- official
def fetch_official() -> list:
    """Parse the 'Latest News' cards on adani.com (company label, date, title, link)."""
    out = []
    for page in ("https://www.adani.com/investors", "https://www.adani.com/"):
        try:
            r = requests.get(page, headers={"User-Agent": UA}, timeout=25)
            r.raise_for_status()
        except Exception as e:  # never let one source kill the run
            print(f"[official] {page} failed: {e}")
            continue
        cards = re.split(r'class="three-imgcardBox', r.text)
        for c in cards[1:]:
            m = re.search(r'href="(/newsroom/media-releases/[^"]+)"', c)
            d = re.search(r'card-date-text">\s*([^<]+)<', c)
            if not (m and d):
                continue
            label = re.search(r'overlay-text">\s*([^<]+)<', c)
            # title = first meaningful anchor text after the date
            tail = c[d.end():]
            tt = re.search(r'<a[^>]*>\s*([^<]{12,})</a>', tail) or re.search(r'>\s*([A-Z][^<]{15,})<', tail)
            title = _clean(tt.group(1)) if tt else m.group(1).rsplit("/", 1)[-1].replace("-", " ").capitalize()
            try:
                dt = datetime.strptime(_clean(d.group(1)), "%d %B %Y").replace(tzinfo=IST)
            except ValueError:
                continue
            url = "https://www.adani.com" + m.group(1)
            lab = _clean(label.group(1)) if label else ""
            out.append({
                "id": _id(title), "title": title, "url": url, "source": f"Adani newsroom{' · ' + lab if lab else ''}",
                "tier": "official", "date": dt.isoformat(), "companies": tag_companies(f"{lab} {title}"),
                "snippet": "", "official": True,
            })
        if out:
            break
    print(f"[official] {len(out)} items")
    return out


# --------------------------------------------------------------------------- google news
def fetch_google(window: str = "2d") -> list:
    out = []
    for q in QUERIES:
        url = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(f"{q} when:{window}")
               + "&hl=en-IN&gl=IN&ceid=IN:en")
        try:
            feed = feedparser.parse(requests.get(url, headers={"User-Agent": UA}, timeout=25).content)
        except Exception as e:
            print(f"[gnews] {q} failed: {e}")
            continue
        for e in feed.entries:
            raw = _clean(e.get("title", ""))
            src = _clean(getattr(e, "source", {}).get("title", "")) if hasattr(e, "source") else ""
            src_url = getattr(e, "source", {}).get("href", "") if hasattr(e, "source") else ""
            title = re.sub(rf"\s+-\s+{re.escape(src)}$", "", raw) if src else raw.rsplit(" - ", 1)[0]
            if not RELEVANT.search(title):
                continue
            if is_noise(title, src):
                continue
            try:
                dt = datetime(*e.published_parsed[:6], tzinfo=timezone.utc).astimezone(IST)
            except Exception:
                dt = datetime.now(IST)
            out.append({
                "id": _id(title), "title": title, "url": e.get("link", ""), "source": src or "News",
                "tier": tier_of(src, src_url), "date": dt.isoformat(),
                "companies": tag_companies(title), "snippet": "", "official": False,
            })
    print(f"[gnews] {len(out)} raw items")
    return out


# --------------------------------------------------------------------------- bing news
def fetch_bing(max_age_h: int = 48) -> list:
    """Bing News RSS: gives direct publisher URLs + a summary (no redirect decoding, no rate-limit issues)."""
    out = []
    cutoff = datetime.now(IST) - timedelta(hours=max_age_h)
    for q in QUERIES:
        try:
            r = requests.get("https://www.bing.com/news/search", params={"q": q, "format": "rss", "setlang": "en-IN", "cc": "IN"},
                             headers={"User-Agent": UA}, timeout=25)
            feed = feedparser.parse(r.content)
        except Exception as e:
            print(f"[bing] {q} failed: {e}")
            continue
        for e in feed.entries:
            title = _clean(e.get("title", ""))
            src = _clean(e.get("news_source", "")).replace(" on MSN", "")
            link = urllib.parse.parse_qs(urllib.parse.urlparse(e.get("link", "")).query).get("url", [e.get("link", "")])[0]
            if not RELEVANT.search(title) or is_noise(title, src) or "msn.com" in link:
                continue
            try:
                dt = datetime(*e.published_parsed[:6], tzinfo=timezone.utc).astimezone(IST)
            except Exception:
                continue
            if dt < cutoff:
                continue
            summ = _clean(e.get("summary", ""))
            out.append({
                "id": _id(title), "title": title, "url": link, "source": src or "News",
                "tier": tier_of(src, link), "date": dt.isoformat(), "companies": tag_companies(f"{title} {summ[:120]}"),
                "snippet": summ, "official": False,
            })
    print(f"[bing] {len(out)} raw items")
    return out


# --------------------------------------------------------------------------- dedupe
STOP = {"the", "a", "of", "to", "in", "for", "and", "on", "with", "as", "at", "by", "from", "its", "s", "rs",
        "cr", "crore", "adani", "group", "india", "indian", "says", "after", "over", "into", "new", "mn", "million",
        "billion", "bn", "usd", "inr", "ltd", "limited", "raises", "raise", "secures", "gets", "total", "up", "via",
        "energy", "solutions", "ports", "sez", "green", "power", "enterprises", "wins", "project", "unit", "stake"}


def _tokens(t):
    t = re.sub(r"(\d),(\d)", r"\1\2", t)          # 2,790 -> 2790 so figures match across outlets
    return {w for w in _norm(t).split() if w not in STOP and len(w) > 2}


def _same_story(a: dict, ta: set, b: dict, tb: set) -> bool:
    """Same event within 48 h (rule lives in similar.py so news and the briefing agree)."""
    if abs(_age(a["date"]) - _age(b["date"])) >= 48:
        return False
    return similar.same_event(a["title"], a["companies"], b["title"], b["companies"], a.get("_sig"), b.get("_sig"))


def _age(iso: str) -> float:
    try:
        return (datetime.now(IST) - datetime.fromisoformat(iso)).total_seconds() / 3600
    except Exception:
        return 0.0


def dedupe(items: list) -> list:
    """Cluster near-duplicate headlines; keep the best-tier item and record how many outlets ran it."""
    rank = {"official": 0, "regulator": 1, "independent": 2, "affiliated": 3, "other": 3}
    items = [i for i in items if len(i["title"]) > 15]
    seen, uniq = set(), []
    for i in items:                      # the same article is returned by several queries
        key = (i["id"], i["source"])
        if key not in seen:
            seen.add(key); uniq.append(i)
    # prefer items with direct (non-Google) links and snippets inside a tier
    items = sorted(uniq, key=lambda x: (rank[x["tier"]], "news.google.com" in x["url"], not x.get("snippet"), x["date"]))
    kept = []
    for it in items:
        it["_sig"] = similar.sig(it["title"])
        tk = _tokens(it["title"])
        for k in kept:
            if _same_story(it, tk, k, k["_tk"]):
                if not k.get("snippet") and it.get("snippet"):
                    k["snippet"] = it["snippet"]
                if "news.google.com" in k["url"] and "news.google.com" not in it["url"] and it["source"] == k["source"]:
                    k["url"] = it["url"]
                k["_sig"] = similar.merge(k["_sig"], it["_sig"])
                if it["source"] not in k["_src"]:
                    k["_src"].add(it["source"])
                    k["coverage"] = len(k["_src"])
                    k.setdefault("also", []).append({"source": it["source"], "url": it["url"]})
                break
        else:
            it["_tk"] = tk
            it["_src"] = {it["source"]}
            it["coverage"] = 1
            kept.append(it)
    for k in kept:
        k.pop("_tk", None); k.pop("_src", None); k.pop("_sig", None)
        k["also"] = k.get("also", [])[:4]
    return sorted(kept, key=lambda x: x["date"], reverse=True)


def collect() -> list:
    return dedupe(fetch_official() + fetch_bing() + fetch_google())
