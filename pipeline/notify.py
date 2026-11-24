"""Telegram push: morning text digest + the MP3 as a voice-style audio message."""
import html
from pathlib import Path

import requests

from config import SITE_URL, TG_CHAT, TG_TOKEN

EMO = {"official": "🏢", "regulator": "⚖️", "independent": "📰", "other": "❔"}


def send(digest: dict, items_by_id: dict, mp3: Path | None):
    if not (TG_TOKEN and TG_CHAT):
        print("[telegram] not configured, skipping")
        return
    api = f"https://api.telegram.org/bot{TG_TOKEN}"
    e = html.escape
    lines = [f"<b>Adani briefing · {e(digest['date'])}</b>", f"<i>{e(digest.get('headline', ''))}</i>", ""]
    for s in digest.get("stories", [])[:8]:
        it = items_by_id.get(s["id"], {})
        link = it.get("url", "")
        lines.append(f"{EMO.get(s.get('evidence'), '•')} <b>{e(s.get('what', ''))}</b>")
        if s.get("why"):
            lines.append(f"   ↳ {e(s['why'])}")
        if link:
            lines.append(f'   <a href="{e(link)}">{e(it.get("source", "source"))}</a>')
    if digest.get("question"):
        lines += ["", f"❓ <b>Think about:</b> {e(digest['question']['q'])}"]
    if SITE_URL:
        lines += ["", f'<a href="{e(SITE_URL)}">Open the hub</a>']
    text, out = "", []
    for ln in lines:                       # never cut an HTML tag in half (Telegram rejects it)
        if len(text) + len(ln) + 1 > 3900:
            break
        out.append(ln); text = "\n".join(out)
    try:
        requests.post(f"{api}/sendMessage", data={"chat_id": TG_CHAT, "text": text, "parse_mode": "HTML",
                                                  "disable_web_page_preview": "true"}, timeout=30).raise_for_status()
        if mp3 and mp3.exists():
            with open(mp3, "rb") as f:
                requests.post(f"{api}/sendAudio", data={"chat_id": TG_CHAT, "title": f"Adani briefing {digest['date']}",
                                                        "performer": "Adani Intel Hub"},
                              files={"audio": f}, timeout=120).raise_for_status()
        print("[telegram] sent")
    except Exception as ex:
        print("[telegram] failed:", str(ex).replace(TG_TOKEN, "***") if TG_TOKEN else ex)
