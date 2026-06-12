# raw.io

**Come as you are, leave with structure.**

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
4. **Notes persist locally** — saved to your browser via localStorage

---

## Tech stack

- **Frontend** — HTML, CSS (Tailwind), vanilla JavaScript
- **Voice capture** — Web Speech API (browser-native)
- **Backend** — FastAPI (Python)
- **AI** — Google Gemini API
- **Storage** — localStorage (browser-based, per-device)

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
```

Run the server:
```bash
uvicorn main:app --reload
```

### Frontend

The Web Speech API requires a server context (not `file://`). Serve the frontend folder:

```bash
cd frontend
python -m http.server 5501
```

Then open `http://127.0.0.1:5501/hopeful.html` in Chrome.

---

## Project status

raw.io is an active work-in-progress portfolio project. Current focus areas:

- [ ] History screen for saved notes
- [ ] Bullet point styling refinement
- [ ] Reset / new note flow
- [ ] Mind map visualisation of connected ideas
- [ ] Deployment (frontend on Vercel, backend on Render)

---

## Why raw.io

Most note-taking tools assume you already know what you want to say. raw.io assumes the opposite — that thinking out loud, messily, is the starting point, and structure is something AI should help you arrive at, not something you bring with you.
