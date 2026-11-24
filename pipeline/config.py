"""Central configuration for the Adani Intel Hub pipeline.

Everything you might want to tune lives here: which companies to track,
which search queries to run, which sources to trust, and the voice.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"                 # published to GitHub Pages
DATA = DOCS / "data"
AUDIO = DOCS / "audio"
CONTENT = ROOT / "content"

SITE_URL = os.environ.get("SITE_URL", "")          # e.g. https://<you>.github.io/adani-intel-hub/
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODELS = [m for m in [os.environ.get("GEMINI_MODEL", ""),
                             "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite",
                             "gemini-flash-latest"] if m]
TG_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "")

VOICE = os.environ.get("TTS_VOICE") or "en-IN-NeerjaNeural"   # or en-IN-PrabhatNeural (male)
TTS_RATE = os.environ.get("TTS_RATE") or "+0%"
KEEP_DAILY_AUDIO_DAYS = 30
LISTENER_NAME = os.environ.get("LISTENER_NAME") or ""          # optional, used in the spoken greeting

# ---------------------------------------------------------------------------
# Companies / platforms. `kw` = lowercase keywords used to tag a headline.
# `ticker` = NSE symbol for the market tracker (None = unlisted platform).
# ---------------------------------------------------------------------------
COMPANIES = [
    {"key": "group", "name": "Adani Group", "short": "Group", "ticker": None,
     "kw": ["adani group", "gautam adani", "adani portfolio", "adani family"]},
    {"key": "ael", "name": "Adani Enterprises", "short": "AEL", "ticker": "ADANIENT",
     "kw": ["adani enterprises", " ael ", "kutch copper", "adani new industries", " anil ", "adani road", "mining services"]},
    {"key": "apsez", "name": "Adani Ports & SEZ", "short": "APSEZ", "ticker": "ADANIPORTS",
     "kw": ["adani ports", "apsez", "mundra", "vizhinjam", "evos", "haifa", "colombo west", "adani logistics", " port ", " ports "]},
    {"key": "power", "name": "Adani Power", "short": "Power", "ticker": "ADANIPOWER",
     "kw": ["adani power", "thermal", "godda", "korba", "mahan", "raipur", "bhel"]},
    {"key": "agel", "name": "Adani Green Energy", "short": "AGEL", "ticker": "ADANIGREEN",
     "kw": ["adani green", "agel", "khavda", "renewable", "pumped storage", "tarali", "bess", "battery storage"]},
    {"key": "aesl", "name": "Adani Energy Solutions", "short": "AESL", "ticker": "ADANIENSOL",
     "kw": ["adani energy solutions", "aesl", "transmission", "smart meter", "intellismart", "adani electricity"]},
    {"key": "atgl", "name": "Adani Total Gas", "short": "ATGL", "ticker": "ATGL",
     "kw": ["adani total gas", "atgl", "city gas", "cng", "totalenergies"]},
    {"key": "cement", "name": "Ambuja / ACC / Orient", "short": "Cement", "ticker": "AMBUJACEM",
     "kw": ["ambuja", " acc ", "acc limited", "orient cement", "adani cement", "one cement", "penna"]},
    {"key": "airports", "name": "Adani Airports", "short": "Airports", "ticker": None,
     "kw": ["adani airport", "navi mumbai airport", "nmia", "aahl", "airport"]},
    {"key": "dc", "name": "AdaniConneX (data centres)", "short": "Data centres", "ticker": None,
     "kw": ["adaniconnex", "data centre", "data center", "hyperscale", "ai infrastructure"]},
    {"key": "defence", "name": "Adani Defence & Aerospace", "short": "Defence", "ticker": None,
     "kw": ["adani defence", "defence", "drone", "missile", "mro", "aerospace"]},
    {"key": "media", "name": "NDTV", "short": "NDTV", "ticker": "NDTV", "kw": ["ndtv"]},
    {"key": "legal", "name": "Legal & regulatory", "short": "Legal", "ticker": None,
     "kw": ["sebi", "hindenburg", " sec ", "doj", "ofac", "court", "probe", "notice", "settle", "lawsuit", "investigation"]},
]

EXTRA_TICKERS = [("ACC", "ACC", "cement"), ("ORIENTCEM", "Orient Cement", "cement")]

# Peers for context on the Markets tab (dropped automatically if a symbol fails).
PEERS = [
    ("JSWINFRA", "JSW Infrastructure", "apsez"), ("NTPC", "NTPC", "power"),
    ("TATAPOWER", "Tata Power", "power"), ("JSWENERGY", "JSW Energy", "power"),
    ("NTPCGREEN", "NTPC Green", "agel"), ("POWERGRID", "Power Grid", "aesl"),
    ("IGL", "Indraprastha Gas", "atgl"), ("ULTRACEMCO", "UltraTech", "cement"),
    ("GMRAIRPORT", "GMR Airports", "airports"), ("HAL", "HAL", "defence"),
]

# Google News RSS searches (India edition). `when:2d` keeps it fresh.
QUERIES = [
    "Adani Group", "Adani Enterprises", "Adani Ports", "Adani Power", "Adani Green Energy",
    "Adani Energy Solutions", "Adani Total Gas", "Ambuja Cements", "Adani Airports",
    "AdaniConneX", "Adani Defence", "Adani SEBI", "Gautam Adani", "Adani Reuters",
]

# Evidence tiers -> how much we trust a source. Matched against the source name/domain.
TIERS = {
    "official": ["adani", "adaniports", "adanigreenenergy", "adanienterprises", "adanipower",
                 "adanienergysolutions", "ambujacement", "acclimited"],
    "regulator": ["sebi", "pib", "sec.gov", "ofac", "treasury", "nseindia", "bseindia", "sansad", "court"],
    "independent": ["reuters", "bloomberg", "financial times", "business standard", "economic times",
                    "et infra", "et energyworld", "etenergyworld", "livemint", "mint", "the hindu",
                    "businessline", "indian express", "moneycontrol", "cnbc", "forbes",
                    "theprint", "fortune india", "business today", "india today", "scroll",
                    "the wire", "thewire", "new indian express", "hindustan times", "times of india",
                    "telegraph india", "financial express", "powerline", "mercom", "saur energy", "deccan herald",
                    "economictimes", "bw businessworld", "vccircle", "the ken", "the morning context", "nikkei"],
}
# Sources/titles that are mostly noise (stock tips, auto-generated price notes).
NOISE_SOURCES = ["equitypandit", "global banking & finance review", "multibagg", "scanx", "kalkine",
                 "linkedin", "youtube", "newz daddy", "trade brains", "marketsmojo", "investing.com"]
NOISE_PATTERNS = [r"\bSL\b.*\bTgt\b", r"outlook for the week", r"rises? \d+(\.\d+)?% in \w+day'?s session",
                  r"share price (today|live)", r"stock of the day", r"stocks? to (buy|watch)",
                  r"list of stocks in adani", r"trader analysis", r"\bstockiq\b", r"chart patterns?", r"stockiq", r"technical analysis", r"share price target",
                  r"stocks? in news", r"top \d+ .*shares", r"best .* stocks"]

# Pages we diff weekly to catch structural change (leaders, listed companies).
WATCH_PAGES = {
    "leadership": "https://www.adani.com/about-us/leadership",
    "investors": "https://www.adani.com/investors",
}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
