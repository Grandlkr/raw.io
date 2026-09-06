# raw.io

**Come as you are, leave with structure.**

**Live app:** https://raw-io.vercel.app

raw.io is an AI-powered notes app for stream-of-consciousness thinkers. Instead of forcing structured input, it accepts raw voice notes, unfiltered rants, and half-formed ideas — then uses AI to punctuate, extract key insights, surface action items, and process your thoughts into something clearer than what you started with.

Not a structured notes tool like Notion. A thinking partner.

---

## How it works

1. **Speak or type** — tap the mic and ramble, or type your raw thoughts directly into the Draft view
2. **AI processes it** — your raw input is sent to Google's Gemini, which:
   - Cleans up punctuation and filler without rewriting your voice
   - Extracts key insights as neutral, standalone points
   - Identifies action items in your own tone
   - Generates a title
   - Produces a **refined** version — not a summary, but your thoughts finished and connected
3. **Review across views** — Draft (your cleaned raw text), Refined (the processed thinking), and Map (coming soon)
4. **Sign in to sync** — notes are saved to Supabase under your account, so they carry over across devices and the mobile app

---

## Tech stack

- **Frontend** — HTML, CSS (Tailwind), vanilla JavaScript
- **Voice capture** — Web Speech API (browser-native)
- **Backend** — FastAPI (Python)
- **AI** — Google Gemini API
- **Auth & storage** — Supabase (email/password auth, Postgres with row-level security)

---

## Running locally

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

Create a `.env` file in the backend folder:
```
GEMINI_API_KEY=your_key_here
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

The backend verifies sign-in tokens from the web and mobile apps against Supabase's public JWKS endpoint (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`) — no shared secret needed, since this project signs tokens with Supabase's asymmetric (ES256) JWT keys.

Run the server (the frontend expects it on port 8000 when testing locally):
```bash
cd fast_end_points
uvicorn req:app --reload --port 8000
```

### Frontend

The Web Speech API requires a server context (not `file://`). Serve the frontend folder:

```bash
cd frontend
python -m http.server 5501
```

Then open `http://127.0.0.1:5501/index.html` in Chrome. When served from `localhost`/`127.0.0.1`, the page automatically points at the local backend (`http://127.0.0.1:8000`) instead of production.

---

## Project status

raw.io is an active work-in-progress portfolio project. Current focus areas:

- [x] Deployment (frontend on Vercel, backend on Render)
- [x] History screen for saved notes
- [x] Reset / new note flow
- [x] Bullet point styling refinement
- [x] Account sign-in and cross-device sync via Supabase (web + mobile)
- [ ] Mind map visualisation of connected ideas

> **Note:** The backend runs on Render's free tier and may have a cold-start delay of ~30–60 seconds on the first request after a period of inactivity.

---

## Why raw.io

Most note-taking tools assume you already know what you want to say. raw.io assumes the opposite — that thinking out loud, messily, is the starting point, and structure is something AI should help you arrive at, not something you bring with you.
