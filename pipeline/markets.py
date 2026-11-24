"""Daily prices for the listed Adani companies (+ peers) from Yahoo Finance's public endpoints.

Prices only; this is a learning aid, not investment advice. Every field is optional so a single
failed symbol never breaks the run.
"""
from datetime import datetime, timezone

import requests

from config import COMPANIES, EXTRA_TICKERS, PEERS, UA

H = {"User-Agent": UA}


def _chart(sym: str):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}.NS"
    r = requests.get(url, params={"range": "1y", "interval": "1d"}, headers=H, timeout=20)
    r.raise_for_status()
    res = r.json()["chart"]["result"][0]
    closes = [c for c in res["indicators"]["quote"][0]["close"] if c is not None]
    ts = res["timestamp"]
    return res["meta"], closes, ts


def _caps(symbols):
    """Market cap + 52w range via the quote API (needs a crumb). Returns {} if Yahoo refuses."""
    try:
        s = requests.Session(); s.headers.update(H)
        s.get("https://fc.yahoo.com", timeout=15)
        crumb = s.get("https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=15).text
        r = s.get("https://query1.finance.yahoo.com/v7/finance/quote",
                  params={"symbols": ",".join(f"{x}.NS" for x in symbols), "crumb": crumb}, timeout=20)
        return {q["symbol"][:-3]: q for q in r.json()["quoteResponse"]["result"]}
    except Exception as e:
        print(f"[markets] quote/caps unavailable: {e}")
        return {}


def _pct(a, b):
    return round((a / b - 1) * 100, 2) if a and b else None


def collect() -> dict:
    adani = [(c["ticker"], c["name"], c["key"]) for c in COMPANIES if c["ticker"]] + EXTRA_TICKERS
    caps = _caps([t for t, _, _ in adani + PEERS])
    rows = {"adani": [], "peers": []}
    for group, lst in (("adani", adani), ("peers", PEERS)):
        for sym, name, key in lst:
            try:
                meta, closes, ts = _chart(sym)
            except Exception as e:
                print(f"[markets] {sym} failed: {e}")
                continue
            px = meta.get("regularMarketPrice") or (closes[-1] if closes else None)
            prev = closes[-2] if len(closes) > 1 else None
            q = caps.get(sym, {})
            rows[group].append({
                "symbol": sym, "name": name, "key": key, "price": round(px, 2) if px else None,
                "d1": _pct(px, prev),
                "m1": _pct(px, closes[-22]) if len(closes) > 22 else None,
                "y1": _pct(px, closes[0]) if closes else None,
                "hi52": q.get("fiftyTwoWeekHigh") or (max(closes) if closes else None),
                "lo52": q.get("fiftyTwoWeekLow") or (min(closes) if closes else None),
                "mcap_cr": round(q["marketCap"] / 1e7) if q.get("marketCap") else None,
                "spark": [round(c, 1) for c in closes[-66:]],   # ~3 months for the sparkline
                "asof": datetime.fromtimestamp(meta.get("regularMarketTime", ts[-1]), timezone.utc).isoformat(),
            })
    total = sum(r["mcap_cr"] or 0 for r in rows["adani"])
    rows["portfolio_mcap_cr"] = total or None
    rows["generated"] = datetime.now(timezone.utc).isoformat()
    print(f"[markets] {len(rows['adani'])} adani, {len(rows['peers'])} peers, mcap ₹{total:,} cr")
    return rows
