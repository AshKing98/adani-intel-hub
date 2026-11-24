"""Text-to-speech with Microsoft Edge neural voices (free, no key) via the `edge-tts` package."""
import asyncio
import time
import re
from pathlib import Path

import edge_tts

from config import TTS_RATE, VOICE

# Words the voice tends to mangle -> how to say them.
SAY = {
    r"\bAPSEZ\b": "A P SEZ", r"\bAGEL\b": "A-gel", r"\bAESL\b": "A E S L", r"\bATGL\b": "A T G L",
    r"\bAEL\b": "A E L", r"\bANIL\b": "A-N-I-L", r"\bAALP\b": "A A L P", r"\bMMT\b": "million tonnes",
    r"\bMTPA\b": "million tonnes per annum", r"\bGW\b": "gigawatts", r"\bMW\b": "megawatts",
    r"\bGWh\b": "gigawatt hours", r"₹\s?([\d,\.]+)\s?cr\b": r"rupees \1 crore", r"₹": "rupees ",
    r"\bcr\b": "crore", r"\bFY(\d\d)\b": r"F Y \1", r"\bQ([1-4])\b": r"quarter \1", r"\bBESS\b": "battery storage",
    r"\bEBITDA\b": "ebitda", r"\bSEBI\b": "SEBI", r"\bNMIA\b": "Navi Mumbai airport", r"\bPLF\b": "P L F",
    r"\bxx\b": "",
}


def speakable(text: str) -> str:
    t = re.sub(r"https?://\S+", "", text)
    t = re.sub(r"[*_#>`|]", " ", t)
    for pat, rep in SAY.items():
        t = re.sub(pat, rep, t)
    return re.sub(r"\s+", " ", t).strip()


async def _speak(text: str, path: Path, voice: str):
    comm = edge_tts.Communicate(speakable(text), voice=voice, rate=TTS_RATE)
    await comm.save(str(path))


def synth(text: str, path: Path, voice: str = VOICE) -> bool:
    """Best-effort: a failed voice must never stop the written briefing from publishing."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    for attempt in range(2):
        try:
            asyncio.run(_speak(text, tmp, voice))
            if tmp.exists() and tmp.stat().st_size > 2000:
                tmp.replace(path)          # atomic: never leave a half-written MP3 in place
                return True
        except Exception as e:
            print(f"[tts] attempt {attempt + 1} failed: {type(e).__name__}")
        time.sleep(5)
    tmp.unlink(missing_ok=True)
    print("[tts] no audio this run; the written briefing still publishes")
    return False


def duration_s(path: Path) -> int:
    """Edge TTS emits constant 48 kbps MP3, so size -> duration is exact enough for a label."""
    try:
        return round(path.stat().st_size * 8 / 48000)
    except OSError:
        return 0
