# 🤖 FLL Academy

A free, Duolingo-style learning platform for students preparing for **FIRST LEGO League** tournaments. Built around the 2025-26 **UNEARTHED** season.

> *"Reading the Engineering Notebook is boring. Let's make it a game."*

## What's inside

- **5 skill tracks**: Core Values, Engineering Design, Robot Game, Innovation Project, Tournament Day
- **19+ bite-sized lessons** with multiple-choice questions and instant feedback
- **XP, streaks, hearts** — like Duolingo
- **AI Coach** powered by Claude (optional — works without it)
- **Progress saved in your browser** — no signup required

## Run locally

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

Open http://localhost:8000

## Enable the AI Coach (optional)

Get an Anthropic API key from https://console.anthropic.com, then:

```bash
# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."

# macOS/Linux
export ANTHROPIC_API_KEY=sk-ant-...
```

Without a key, the app still works — the "Ask AI Coach" button just shows a friendly message.

## Deploy to Railway

1. Push this repo to GitHub
2. On https://railway.app: **New Project → Deploy from GitHub** → pick this repo
3. (Optional) In **Variables**, add `ANTHROPIC_API_KEY` to enable the AI coach
4. Railway gives you a public URL — share it with FLL teams!

## Tech stack

- **Backend**: FastAPI (Python)
- **Frontend**: Plain HTML / CSS / JS (no build step)
- **Storage**: Browser `localStorage` (no database needed for MVP)
- **AI**: Claude Opus 4.7 via the Anthropic API (optional)
- **Deploy**: Railway via Nixpacks

## Adding more lessons

All lessons live in `data/lessons.json`. Add a new entry under `lessons` and reference its ID in a track's `skills[].lessons` array. No code changes needed.

## License

MIT — built for FLL teams worldwide.
