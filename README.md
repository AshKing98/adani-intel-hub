# Adani Intel Hub

A self-updating briefing app for an incoming Adani AALP intern. Every morning at about **6:45 AM IST**, without your laptop or Claude, it:

1. Collects Adani news from the official adani.com newsroom, Bing News and Google News (India). It removes duplicates, filters stock-tip noise, rates each story's evidence (company / regulator / independent media / unverified), and fetches the lead paragraphs of the top 25 stories so you can read them in the app.
2. Uses your free Gemini key to write a briefing: what happened, why it matters, a concept of the day, and a question a senior might ask.
3. Records a natural Indian-English voice MP3 (Microsoft neural voice, free).
4. Pulls NSE prices for the 10 listed companies and 10 peers.
5. Checks the official leadership and investor pages and flags changes. It also pulls upcoming results dates and board meetings from NSE.
6. Publishes everything to a mobile web app (installable on Android, works offline) and sends the digest and audio to your Telegram.

On Sundays it also makes a "Week in review" episode.

---

## One-time setup (about 20 minutes)

You'll create three free things: a **GitHub** repo (the engine and host), a **Gemini key** (the editor), and a **Telegram bot** (the alarm clock). Do it on a laptop.

### 1. Put the code on GitHub (5 min)

1. Sign up or log in at **github.com**.
2. Click **+ → New repository**. Name it `adani-intel-hub` and choose **Public** (needed for free Pages; nothing personal is in it). Click **Create repository**.
3. On the new repo page, click **uploading an existing file**.
4. **Recommended: use GitHub Desktop** (desktop.github.com). It respects `.gitignore`, so audio caches and any stray private file are never uploaded. Choose *File → Add local repository*, pick the `adani-intel-hub` folder, click **create a repository** if prompted, then **Publish repository**, and **untick "Keep this code private"**.
   - Alternative: on the repo page, click *uploading an existing file* and drag in everything inside `adani-intel-hub`, including the hidden `.github` folder (on Mac, press `Cmd+Shift+.` in Finder to show it). Web upload ignores `.gitignore`, so first delete `docs/audio/daily/` and check that no file with "profile" in its name is in the folder.
   - ⚠️ Never upload the `PRIVATE - my-profile` folder. It sits *outside* the repo folder on purpose.
5. **Privacy note:** every GitHub Pages site under your account shares the address `https://<you>.github.io`, so they can read each other's browser storage. Don't host other people's Pages projects on this account.

### 2. Turn on Pages (1 min)

Repo → **Settings → Pages** → under *Build and deployment*, set **Source = GitHub Actions**.

### 3. Get a free Gemini key (3 min)

1. Go to **aistudio.google.com** → sign in → **Get API key → Create API key**.
2. Copy it.
3. In GitHub: repo → **Settings → Secrets and variables → Actions → New repository secret**.
   Name: `GEMINI_API_KEY`  Value: *(paste)*.

The app uses one AI call a day (two on Sundays), well within the free tier.

### 4. Create your Telegram bot (5 min)

1. In Telegram, message **@BotFather**, send `/newbot`, and pick any name. It replies with a **token** like `123456:ABC...`.
2. Open your new bot and press **Start** (send it "hi").
3. In a browser, open `https://api.telegram.org/bot<TOKEN>/getUpdates` (replace `<TOKEN>`). Find `"chat":{"id":` followed by a number. That number is your chat ID.
4. Add two more GitHub secrets: `TELEGRAM_BOT_TOKEN` (the token) and `TELEGRAM_CHAT_ID` (the number).

### 5. Optional personalisation (1 min)

Repo → Settings → Secrets and variables → Actions → **Variables** tab:

- `LISTENER_NAME` = your first name, so the audio greets you by name. Note that the site is public, so this name will appear in the public audio and data. Leave it empty if you prefer.
- `TTS_VOICE` = `en-IN-PrabhatNeural` for a male voice (the default is `en-IN-NeerjaNeural`, female).

### 6. First run (2 min)

Repo → **Actions** → (approve workflows if asked) → **Daily briefing** → **Run workflow**. Wait about 5 minutes for a green tick. The first run takes longer because it also records the 10 course modules.

Your app is now at **`https://<your-github-username>.github.io/adani-intel-hub/`**

### 7. Install on your Android phone (1 min)

1. Open that link in **Chrome** → ⋮ menu → **Add to Home screen / Install app**.
2. Open the app → **Me** tab → **Choose file** → pick `my-profile.json`. Email or Drive it to yourself from the `PRIVATE - my-profile` folder first. My Fit unlocks. The profile stays only in that phone's browser.

Done. From tomorrow, your Telegram buzzes around 6:50 AM with the digest and audio.

---

## Using it

The app is built for **reading first**. Every screen also has a small **Listen** button if you'd rather hear it.

| Tab | What's there |
|---|---|
| **Today** | The day's headline and summary, then the picked stories as readable cards. Tap a card to open the story. Below them: concept of the day, a question a senior might ask (with a hidden answer), the next 3 events, and shortcuts to the key diagrams. |
| **News** | Every story from the last 14 days, grouped by day. Search, filter by company or "verified sources", and see your saved stories. |
| **Story page** | What happened, why it matters, the article's lead paragraphs (fetched by the daily job), other outlets that covered it, **Save**, your **note**, a link to the original, and related stories. |
| **Companies** | Four diagrams: the **group map** (tap any tile), **how they connect** (who supplies whom), an **ESG comparison**, and a list. Each of the 15 company pages shows key numbers, a chart, how it makes money, where it sits in the value chain, ownership, ESG, people, a watch list, upcoming events, your fit and its latest news. NSE prices sit below. |
| **Ops** | **How each runs:** for 10 businesses, the step-by-step flow of the work, the operating numbers (with period and source), what managers pull, where work gets stuck, and one question to ask in your first week. **GM toolkit:** how a GM thinks, a driver tree for EBITDA, a one-page memo template, a 30-day plan, questions for your mentor, and core frameworks. **Cases:** five real situations from the group (Tarali permit, smart-meter rollout, Evos integration, Navi Mumbai ramp-up, Kutch Copper), each with an outline of a strong answer. **Metrics:** plain definitions of the ops terms (heat rate, clinker factor, TAT, YPP/IPP, MTBF/MTTR, OEE). |
| **Learn** | 10 modules in a suggested order. Each starts with "In 30 seconds" bullets and a diagram (flywheel, timeline, group map, leverage chart, legal tracks, strategy chain). Also: glossary, flashcards (10 new a day) and all audio. |
| **Me** | My fit (ranked chart + talking points), Saved (stories, modules, and all your notes with a "Copy all" button), Calendar (results dates auto-updated from NSE, plus milestones), Settings. |

**Dotted-underlined words** (PLF, BESS, take-or-pay, NCLT…) show their meaning when you tap them. **Evidence tags** (Company / Regulator / Independent media / Unverified) explain themselves the same way.

Saved stories and notes stay on your phone only; nothing is uploaded. Use **Me → Settings → Download backup** now and then, because clearing browser data or changing phones would otherwise lose them.

The **search icon** at the top searches everything at once: stories, companies, operations, cases, modules, terms, events and your notes.

## When your vertical is allotted

Edit `content/settings.json` on GitHub (pencil icon) to, for example:

```json
{ "focus": ["agel", "aesl"] }
```

Keys: `ael apsez power agel aesl atgl cement airports dc defence media legal`. Ops and cases are keyed the same way (`#ops/apsez`). The morning briefing will prioritise those businesses. In the app, Me → "Add to focus" does the same for the screen order.

## Keeping the evergreen content fresh

The news updates itself. The **Learn modules** (`content/modules.json`), **company pages** (`content/companies.json`) and **milestones** (`content/milestones.json`) are curated facts, verified 24 Nov 2026. When the app shows a **Heads-up: the official leadership page changed** banner, or after each quarterly result, edit that file on GitHub. The module audio re-records automatically on the next run, and only for modules whose text changed.

## Costs and limits

Everything here is free: GitHub Actions (about 5 min a day, well inside the free minutes), Pages, Gemini free tier, Edge neural TTS, Telegram, and Yahoo price endpoints. If any one source fails on a given day, the rest still publish. For example, without a Gemini response you get a headlines-only briefing, clearly labelled.

## Troubleshooting

- **The app's "Updated" label turns red.** The last run is over 36 hours old. Go to Actions, open the failed run, and click **Re-run**. GitHub pauses scheduled workflows after 60 days with no repo activity; the daily commit prevents that, but if it ever happens, click *Enable workflow*.
- **No AI summary.** Check that the `GEMINI_API_KEY` secret is set. A model can be overridden with a `GEMINI_MODEL` variable.
- **No Telegram message.** Make sure you pressed **Start** in your bot, and re-check the chat ID.

## Folder map

```
adani-intel-hub/
├─ .github/workflows/daily.yml   ← the schedule (~06:45 IST)
├─ pipeline/                     ← Python that runs on GitHub every morning
│   ├─ config.py   companies, keywords, sources, evidence tiers, voice
│   ├─ news.py     official newsroom + Bing + Google News → clean, deduped stories
│   ├─ articles.py fetch lead paragraphs so stories are readable in-app
│   ├─ events.py   NSE board meetings + curated milestones → calendar
│   ├─ digest.py   ranking + Gemini briefing (with no-AI fallback)
│   ├─ audio.py    neural text-to-speech
│   ├─ markets.py  NSE prices
│   ├─ notify.py   Telegram
│   └─ run.py      orchestrates everything
├─ content/                      ← things you edit by hand
│   ├─ modules.json   the 10 Learn modules (with 30-second summaries + diagram links)
│   ├─ companies.json the 15 company profiles, clusters, value-chain links, timeline
│   ├─ milestones.json upcoming milestones for the calendar
│   ├─ operations.json operations flows, KPIs, GM toolkit, cases, metrics (each figure carries its period and source)
│   ├─ glossary.json  terms + flashcard facts
│   └─ settings.json  your focus businesses
└─ docs/                         ← the published app (GitHub Pages)
```

## Security and privacy (what's in place)

- **No personal data on the public site.** Your CV-based profile, your internship date and your notes live only on your phone. The repo contains public information only.
- **Secrets** (Gemini key, Telegram token) are stored as GitHub encrypted secrets, never in files, and are redacted from logs.
- **Locked-down workflow:** no permissions by default; the build job can only write to the repo and the deploy job can only publish Pages. Every GitHub Action is pinned to an exact commit, and Python packages are pinned to exact versions.
- **Web app hardening:** a Content Security Policy blocks any script that isn't the app's own; every scraped headline and paragraph is escaped before display, and links are restricted to http(s). The page asks search engines not to index it and sends no referrer to the sites you open.
- **AI safety:** scraped news is passed to Gemini as untrusted data with explicit instructions not to follow anything inside it. The output is stripped of links and markup, length-capped, and rejected if it looks manipulated.
- **Keep it safe:** turn on two-factor authentication on your GitHub and Google accounts; never paste your keys into chat, email or a file; don't add collaborators to the repo.

This is an educational reference, not legal, investment or regulatory advice. It is not affiliated with or endorsed by the Adani Group.
