"""Upcoming events: NSE board-meeting intimations (results dates etc.) + curated milestones.

NSE needs a cookie from its homepage first; if it refuses (it sometimes blocks cloud IPs),
we keep last run's NSE events and still publish the curated milestones.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from config import COMPANIES, CONTENT, EXTRA_TICKERS, UA  # noqa

IST = timezone(timedelta(hours=5, minutes=30))


def _nse_board_meetings() -> list:
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept": "application/json,text/plain,*/*",
                      "Accept-Language": "en-US,en;q=0.9", "Referer": "https://www.nseindia.com/"})
    s.get("https://www.nseindia.com/", timeout=20)
    out = []
    syms = [(c["ticker"], c["key"], c["name"]) for c in COMPANIES if c["ticker"]] + \
           [(t, k, n) for t, n, k in EXTRA_TICKERS]
    for sym, key, name in syms:
        try:
            r = s.get("https://www.nseindia.com/api/corporate-board-meetings",
                      params={"index": "equities", "symbol": sym}, timeout=20)
            rows = r.json() if r.ok else []
            rows = rows if isinstance(rows, list) else []
        except Exception as e:
            print(f"[events] {sym}: {e}")
            continue
        for row in rows[:6]:
            try:
                d = datetime.strptime(row["bm_date"], "%d-%b-%Y").date()
            except Exception:
                continue
            desc = re.sub(r"\s+", " ", row.get("bm_desc", "")).strip()
            low = desc.lower()
            kind = "results" if ("financial result" in low or "results" in low) else "board"
            title = f"{name}: {'results' if kind == 'results' else 'board meeting'}"
            if kind == "results":
                q = re.search(r"(quarter|half year|year)\w*\s+ended\s+(\w+\s+\d{4})", low)
                if q:
                    title += f" (period ended {q.group(2).title()})"
            out.append({"date": d.isoformat(), "title": title, "company": key, "kind": kind,
                        "detail": desc[:300], "source": "NSE", "url": row.get("attachment", "")})
    print(f"[events] NSE {len(out)} rows")
    return out


def collect(data_dir: Path) -> dict:
    prev = {}
    try:
        prev = json.loads((data_dir / "events.json").read_text(encoding="utf-8"))
    except Exception:
        pass
    try:
        nse = _nse_board_meetings()
    except Exception as e:
        print(f"[events] NSE unavailable: {e}")
        nse = []
    if not nse:
        nse = [e for e in prev.get("items", []) if e.get("source") == "NSE"]
    curated = json.loads((CONTENT / "milestones.json").read_text(encoding="utf-8")).get("items", [])
    today = datetime.now(IST).date().isoformat()
    seen, items = set(), []
    # NSE lists both the intimation and the outcome of one meeting: keep one per company per day (prefer 'results')
    nse.sort(key=lambda x: (x["date"], x["company"], x["kind"] != "results", -len(x["title"])))
    for e in sorted(nse + curated, key=lambda x: x["date"]):
        k = (e["date"], e["company"]) if e.get("source") == "NSE" else (e["date"], e["title"])
        if k in seen:
            continue
        seen.add(k)
        e["past"] = e["date"] < today
        items.append(e)
    # keep ~60 days of history for context, everything ahead
    cutoff = (datetime.now(IST) - timedelta(days=60)).date().isoformat()
    items = [e for e in items if e["date"] >= cutoff]
    return {"generated": datetime.now(IST).isoformat(), "items": items}
