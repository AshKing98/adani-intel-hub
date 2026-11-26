"""Match fresh stories to the hand-written storylines (hybrid mode).

The storylines themselves are verified and written by hand (content/storylines.json). Each day this module only
FINDS stories that look related and are newer than a storyline's last timeline entry; the app shows them as
'possibly related, not yet added to the timeline'. Nothing is added to a timeline automatically.
"""
import re
from datetime import datetime, timedelta, timezone

import similar

IST = timezone(timedelta(hours=5, minutes=30))


def link(archive: list, doc: dict, days: int = 30, per_line: int = 8) -> dict:
    cutoff = (datetime.now(IST) - timedelta(days=days)).isoformat()
    out = {}
    for sl in doc.get("lines", []):
        pats = [re.compile(r"(?<![a-z0-9])" + re.escape(k.lower())) for k in sl.get("match", [])]
        last = sl.get("last", "0000-00-00")
        hits = []
        for a in archive:
            if a["date"] < cutoff or a["date"][:10] <= last or a.get("tier") == "other":
                continue                       # newer than the timeline, and not from an unverified outlet
            rd = a.get("read") or {}
            text = " ".join([a["title"], rd.get("desc", ""), a.get("snippet", "")]).lower()
            if pats and any(p.search(text) for p in pats):
                hits.append({"id": a["id"], "title": a["title"], "source": a["source"], "tier": a["tier"],
                             "date": a["date"], "url": rd.get("link") or a["url"]})
        hits.sort(key=lambda h: h["date"], reverse=True)
        uniq = []                              # one line per event, even if ten outlets ran it
        for h in hits:
            if not any(similar.same_event(h["title"], ["group"], u["title"], ["group"]) for u in uniq):
                uniq.append(h)
        out[sl["id"]] = uniq[:per_line]
    return out
