"""Daily entry point. Run by GitHub Actions every morning (see .github/workflows/daily.yml).

python pipeline/run.py               # full run
python pipeline/run.py --no-audio    # skip TTS (fast test)
python pipeline/run.py --no-notify   # skip Telegram
python pipeline/run.py --weekly      # also build the Sunday week-in-review episode
"""
import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
import audio  # noqa: E402
import digest  # noqa: E402
import markets  # noqa: E402
import news  # noqa: E402
import notify  # noqa: E402
import articles  # noqa: E402
import events  # noqa: E402
from config import AUDIO, CONTENT, DATA, KEEP_DAILY_AUDIO_DAYS, UA, WATCH_PAGES  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
ARCHIVE_DAYS = 120


def jload(p: Path, default):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return default


def jsave(p: Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


# --------------------------------------------------------------------------- archive
def merge_archive(new_items: list) -> list:
    arc = jload(DATA / "news_archive.json", [])
    by_id = {a["id"]: a for a in arc}
    for it in new_items:
        if it["id"] in by_id:
            old = by_id[it["id"]]
            old["coverage"] = max(old.get("coverage", 1), it.get("coverage", 1))
            if it.get("read") and (not old.get("read") or (it["read"].get("paras") and not old["read"].get("paras"))):
                old["read"] = it["read"]
        else:
            it["first_seen"] = datetime.now(IST).isoformat()
            by_id[it["id"]] = it
    cutoff = (datetime.now(IST) - timedelta(days=ARCHIVE_DAYS)).isoformat()
    arc = [a for a in by_id.values() if a["date"] >= cutoff]
    arc.sort(key=lambda a: a["date"], reverse=True)
    jsave(DATA / "news_archive.json", arc)
    return arc


# --------------------------------------------------------------------------- drift watch
def watch_pages():
    """Hash the visible text of key pages; if it changes, log it so the app can flag 'verify this module'."""
    state = jload(DATA / "watch.json", {"pages": {}, "events": []})
    for name, url in WATCH_PAGES.items():
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=25)
            r.raise_for_status()
            t = r.text
        except Exception as e:
            print(f"[watch] {name}: {e}")
            continue
        main = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
        main = re.sub(r"<[^>]+>", "\n", main)
        lines = [l.strip() for l in main.split("\n") if l.strip()]
        if name == "leadership":
            try:
                a = lines.index("Our Leadership"); b = next(i for i in range(a, len(lines)) if lines[i] == "About Us")
                lines = lines[a:b]
            except (ValueError, StopIteration):
                print(f"[watch] {name}: layout changed, skipping"); continue
        elif name == "investors":
            lines = sorted(set(l for l in lines if l.endswith(" Ltd")))
        if len(lines) < 5:
            print(f"[watch] {name}: too little content, skipping"); continue
        h = hashlib.sha1("\n".join(lines).encode(), usedforsecurity=False).hexdigest()
        prev = state["pages"].get(name)
        added = sorted(set(lines) - set(prev.get("lines", [])))[:20] if prev else []
        removed = sorted(set(prev.get("lines", [])) - set(lines))[:20] if prev else []
        if prev and (added or removed):
            state["events"].insert(0, {"page": name, "url": url, "date": datetime.now(IST).date().isoformat(),
                                       "added": added, "removed": removed})
            print(f"[watch] {name} CHANGED (+{len(added)} / -{len(removed)})")
        state["pages"][name] = {"hash": h, "lines": lines[:300], "checked": datetime.now(IST).isoformat()}
    state["events"] = state["events"][:30]
    jsave(DATA / "watch.json", state)


# --------------------------------------------------------------------------- module audio
def module_text(m: dict) -> str:
    parts = [m["title"] + ".", m.get("lede", "")]
    for b in m.get("blocks", []):
        if b.get("h"):
            parts.append(b["h"] + ".")
        if b.get("p"):
            parts.append(b["p"])
        for li in b.get("items", []):
            parts.append((li.get("t", "") + ". " + li.get("d", "")) if isinstance(li, dict) else li)
    return re.sub(r"<[^>]+>", "", " ".join(parts))


def build_module_audio():
    mods = jload(CONTENT / "modules.json", {}).get("modules", [])
    manifest = jload(DATA / "module_audio.json", {})
    for m in mods:
        txt = module_text(m)
        h = hashlib.sha1(txt.encode(), usedforsecurity=False).hexdigest()[:10]
        if manifest.get(m["id"], {}).get("hash") == h and (AUDIO / "modules" / f"{m['id']}.mp3").exists():
            manifest[m["id"]].setdefault("secs", audio.duration_s(AUDIO / "modules" / f"{m['id']}.mp3"))
            manifest[m["id"]]["file"] = f"audio/modules/{m['id']}.mp3?v={h}"
            continue
        if audio.synth(txt, AUDIO / "modules" / f"{m['id']}.mp3"):
            manifest[m["id"]] = {"hash": h, "file": f"audio/modules/{m['id']}.mp3?v={h}", "words": len(txt.split()),
                                 "secs": audio.duration_s(AUDIO / "modules" / f"{m['id']}.mp3")}
            print(f"[module-audio] {m['id']} rendered")
    jsave(DATA / "module_audio.json", manifest)


# --------------------------------------------------------------------------- episodes
def prune_audio(episodes: list) -> list:
    now = datetime.now(IST)
    limit = {"daily": KEEP_DAILY_AUDIO_DAYS, "weekly": 120}
    keep = []
    for ep in episodes:
        f = AUDIO.parent / ep["file"]
        cutoff = (now - timedelta(days=limit.get(ep.get("kind"), 30))).date().isoformat()
        if ep["date"] < cutoff:
            f.unlink(missing_ok=True)
        elif f.exists():            # drop entries whose MP3 vanished (e.g. cache eviction)
            keep.append(ep)
    listed = {ep["file"] for ep in keep}
    for sub in ("daily", "weekly"):   # remove stray files nobody points to
        for f in (AUDIO / sub).glob("*.mp3") if (AUDIO / sub).exists() else []:
            if f"audio/{sub}/{f.name}" not in listed:
                f.unlink(missing_ok=True)
    return keep


def weekly_script(arc: list) -> str:
    since = (datetime.now(IST) - timedelta(days=7)).isoformat()
    week = [a for a in arc if a["date"] >= since and a["tier"] in ("official", "regulator", "independent")]
    week.sort(key=lambda a: digest.priority(a, []), reverse=True)
    if digest.GEMINI_KEY and week:
        prompt = ("Write a 700-900 word spoken 'week in review' radio script for an incoming Adani AALP intern. "
                  "Group by theme (energy, transport, materials, digital, legal). Use only these headlines, label "
                  "evidence ('company says', 'reported by'), no markdown, no URLs. End with 3 things to watch next week. "
                  "Return JSON {\"script\": \"...\"}.\n" + json.dumps(
                      [{"title": a["title"], "source": a["source"], "date": a["date"][:10]} for a in week[:40]]))
        try:
            return digest._gemini(prompt)["script"]
        except Exception as e:
            print(f"[weekly] {e}")
    return "Your Adani week in review. " + " ".join(f"{a['title']}, from {a['source']}." for a in week[:15])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("--no-notify", action="store_true")
    ap.add_argument("--weekly", action="store_true")
    a = ap.parse_args()

    # publish evergreen content (you edit content/, the app reads docs/data/)
    for name in ("modules.json", "glossary.json", "settings.json", "companies.json", "operations.json", "milestones.json"):
        if (CONTENT / name).exists():
            (DATA / name).write_text((CONTENT / name).read_text(encoding="utf-8"), encoding="utf-8")

    settings = jload(CONTENT / "settings.json", {})
    focus = settings.get("focus", [])
    now = datetime.now(IST)
    today = now.date().isoformat()

    items = news.collect()
    fresh = [i for i in items if i["date"] >= (now - timedelta(hours=48)).isoformat()]
    # make the most important stories readable in-app (decoded link + lead paragraphs)
    fresh.sort(key=lambda x: digest.priority(x, focus), reverse=True)
    try:
        articles.enrich(fresh, jload(DATA / "news_archive.json", []), limit=25)
    except Exception as e:
        print(f"[articles] {e}")
    arc = merge_archive(items)
    d = digest.build(fresh, focus)
    by_id = {i["id"]: i for i in arc}
    for s in d.get("stories", []):
        it = by_id.get(s["id"], {})
        s.update({"title": it.get("title"), "url": (it.get("read") or {}).get("link") or it.get("url"), "source": it.get("source"),
                  "coverage": it.get("coverage", 1), "also": it.get("also", [])})

    try:
        mk = markets.collect()
        if mk["adani"]:                    # don't overwrite yesterday's prices with an empty Yahoo response
            jsave(DATA / "markets.json", mk)
    except Exception as e:
        print(f"[markets] {e}")
    watch_pages()
    try:
        jsave(DATA / "events.json", events.collect(DATA))
    except Exception as e:
        print(f"[events] {e}")

    episodes = jload(DATA / "episodes.json", [])
    mp3 = None
    if not a.no_audio:
        mp3 = AUDIO / "daily" / f"{today}.mp3"
        if audio.synth(d["script"], mp3):
            episodes = [e for e in episodes if not (e["date"] == today and e["kind"] == "daily")]
            episodes.insert(0, {"date": today, "kind": "daily", "title": d.get("headline", "Daily briefing"),
                                "file": f"audio/daily/{today}.mp3", "words": len(d["script"].split()),
                                "secs": audio.duration_s(mp3)})
        else:
            mp3 = None
        if a.weekly or now.weekday() == 6:
            wk = AUDIO / "weekly" / f"{today}.mp3"
            if audio.synth(weekly_script(arc), wk):
                episodes = [e for e in episodes if not (e["date"] == today and e["kind"] == "weekly")]
                episodes.insert(0, {"date": today, "kind": "weekly", "title": "Week in review",
                                    "file": f"audio/weekly/{today}.mp3", "secs": audio.duration_s(wk)})
        build_module_audio()
    episodes = prune_audio(episodes)
    jsave(DATA / "episodes.json", episodes)

    d["generated"] = now.isoformat()
    d["counts"] = {"fresh": len(fresh), "archive": len(arc)}
    jsave(DATA / "today.json", d)
    hist = jload(DATA / "digests.json", [])
    hist = [h for h in hist if h["date"] != today]
    hist.insert(0, {k: d[k] for k in ("date", "headline", "summary", "stories", "concept", "question") if k in d})
    jsave(DATA / "digests.json", hist[:90])

    if not a.no_notify:
        try:
            notify.send(d, by_id, mp3)
        except Exception as e:
            print("[telegram]", type(e).__name__)
    print("[done]", today)


if __name__ == "__main__":
    main()
