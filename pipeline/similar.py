"""One shared rule for "are these two headlines the same event?" (used by news.dedupe and digest._distinct).

Signals, all computed from TITLES only (descriptions add noise):
  - content words: lowercase words minus common English, company names/keywords and places
  - names: capitalised words that survive the same filter (counterparties like Attero, Evos, Tarali, WBSEDCL)
  - figures: (number, unit) pairs such as ("2790","cr"), ("300","mn"), ("1750","mw"); single digits and years ignored

Same event if, within 48 hours:
  a) title word overlap (Jaccard) >= 0.45, or
  b) related businesses and Jaccard >= 0.30, or
  c) related businesses and they share a figure, or
  d) related businesses and they share a distinctive name (+ another word, unless one title is very short).
"Related" = at least one company tag in common (a story tagged only 'group' is related to everything).
"""
import re

from config import COMPANIES

COMMON = set("""
a about above across after again against all also among an and any are around as at back be because been before being
below between both but by can could did do does down during each few for from further had has have having he her here
his how i if in into is it its just more most new no nor not now of off on once only or other our out over own same
she should so some such than that the their them then there these they this those through to too under until up very
was we were what when where which while who why will with would you your amid via vs per says said report reports
exclusive update latest live today week year years month quarter q1 q2 q3 q4 fy fy26 fy27 fy28 h1 h2 news top big
plan plans planning set sets get gets got make makes made take takes eyes eye seeks seek bets bet push pushes boost boosts
move moves deal deals project projects plant unit units firm company companies group business businesses sector market
markets stock stocks share shares investors investor price prices growth rise rises rising fall falls gain gains drop
crore lakh billion million bn mn cr rs inr usd dollar dollars rupee rupees percent pct worth value valued valuation
india indian global world national state government govt centre central first second third one two three four five
major key record high low higher lower strong new old next last full half total over under more less amid against
infrastructure infra energy power green renewable clean capacity investment investments capex funding fund funds raise
raises raised raising secures secured secure wins won win bags bagged signs signed sign inks inked announces announced
launches launched completes completed acquire acquires acquired acquisition stake sale sell sells buy buys order orders
contract contracts supply agreement pact partnership partners partner joint venture jv board meeting results profit
loss revenue ebitda margin margins net debt shareholders approval approves approved nod clearance cleared notice probe
""".split())

PLACES = set("""
mumbai delhi gujarat ahmedabad kutch khavda mundra bihar bengal west east north south maharashtra satara rajasthan
odisha kerala keralam tamil nadu chennai andhra pradesh telangana karnataka uttar uttarakhand jharkhand chhattisgarh assam
punjab haryana madhya goa lucknow navi pune kolkata hyderabad bengaluru noida europe european us usa america australia
africa kenya israel haifa sri lanka colombo tanzania bhutan netherlands dutch
""".split())

PEOPLE = {"gautam", "karan", "jeet", "sagar", "rajesh", "pranav", "priti", "vneet", "jaain", "ashwani", "gupta", "robbie",
          "jugeshinder", "singh", "sardana", "bansal", "modi", "rahul", "gandhi", "mamata"}


def _company_words(include_kw: bool):
    words = set()
    for c in COMPANIES:
        for s in [c["name"], c["short"], c.get("ticker") or ""] + (list(c["kw"]) if include_kw else []):
            words |= set(re.findall(r"[a-z0-9]+", s.lower()))
    return words | {"adani", "adanis", "ambuja", "acc", "orient", "aahl", "apsez", "agel", "aesl", "atgl", "ael", "anil", "ndtv"}


STOP = COMMON | PLACES | PEOPLE | _company_words(True)
# for names, keep asset/counterparty names that are also tagging keywords (Tarali, Evos, Khavda, Vizhinjam…)
NAME_STOP = COMMON | PEOPLE | PLACES | _company_words(False)   # big sites (Khavda, Mundra) host many different events

UNIT = {"billion": "bn", "bn": "bn", "b": "bn", "crore": "cr", "cr": "cr", "million": "mn", "mn": "mn",
        "mw": "mw", "gw": "gw", "gwh": "gwh", "mtpa": "mtpa", "mmt": "mmt", "%": "pct", "per": "pct", "percent": "pct"}
FIG = re.compile(r"(\d+(?:\.\d+)?)\s?(billion|bn|b\b|crore|cr\b|million|mn\b|mw\b|gw\b|gwh\b|mtpa|mmt|%|per\s?cent|percent)", re.I)


def figures(title: str) -> set:
    t = title.replace(",", "")
    out = set()
    for m in FIG.finditer(t):
        num, raw = m.group(1), m.group(2).lower().replace(" ", "")
        unit = "pct" if raw in ("%", "percent", "percent") or raw.startswith("per") else UNIT.get(raw, raw)
        n = num.rstrip("0").rstrip(".") if "." in num else num
        # single digits only count with a big unit ("$1 billion" is distinctive, "5%" is not)
        if (len(n.replace(".", "")) < 2 and unit not in ("bn", "gw")) or (n.isdigit() and 1990 <= int(n) <= 2035):
            continue
        out.add((n, unit))
    return out


def _stem(w: str) -> str:
    for suf in ("ing", "ers", "ed", "er", "es", "s"):
        if len(w) > len(suf) + 3 and w.endswith(suf):
            return w[: -len(suf)]
    return w


def words(title: str) -> set:
    t = re.sub(r"(\d),(\d)", r"\1\2", title.lower())
    return {_stem(w.removesuffix("'s")) for w in re.findall(r"[a-z][a-z0-9'-]{2,}", t)
            if w.removesuffix("'s") not in STOP and w not in STOP}


def names(title: str) -> set:
    toks = re.findall(r"\b([A-Z][A-Za-z]{2,}|\d{3}\s?[Oo][Nn][Ee])\b", title)
    out = set()
    for tk in toks:
        k = tk.lower().replace(" ", "").removesuffix("'s")
        if k not in NAME_STOP and k not in COMMON and not k.isdigit():
            out.add(_stem(k))
    return out


def sig(title: str) -> dict:
    return {"w": words(title), "n": names(title), "f": figures(title)}


def merge(a: dict, b: dict) -> dict:
    """Union of two signatures: a cluster 'remembers' every headline merged into it."""
    return {"w": a["w"] | b["w"], "n": a["n"] | b["n"], "f": a["f"] | b["f"]}


def related(ca: list, cb: list) -> bool:
    return bool(set(ca) & set(cb)) or "group" in ca or "group" in cb


def same_event(a_title, a_cos, b_title, b_cos, sa=None, sb=None) -> bool:
    sa = sa or sig(a_title)
    sb = sb or sig(b_title)
    wa, wb = sa["w"], sb["w"]
    if wa and wb:
        j = len(wa & wb) / len(wa | wb)
        if j >= 0.45:
            return True
    else:
        j = 0.0
    if not related(a_cos, b_cos):
        return False
    if j >= 0.30:
        return True
    if sa["f"] & sb["f"]:
        return True
    # a shared distinctive counterparty name (company, place and people words are already excluded)
    shared_names = sa["n"] & sb["n"]
    specific = set(a_cos) & set(b_cos) - {"group", "legal"}
    if shared_names and specific:          # e.g. both AGEL stories name "Tarali"
        return True
    if len(shared_names) >= 2 or (shared_names and (len((wa & wb) - shared_names) >= 1 or len(wa) <= 3 or len(wb) <= 3)):
        return True
    return False
