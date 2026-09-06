import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import errors, types
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

load_dotenv()

logger = logging.getLogger("raw_io")
logging.basicConfig(level=logging.INFO)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

logger.info(
    "env check: GEMINI_API_KEY=%s SUPABASE_URL=%s SUPABASE_ANON_KEY=%s all_keys=%s",
    "set(%d chars)" % len(GEMINI_API_KEY) if GEMINI_API_KEY else "MISSING",
    "set(%d chars)" % len(SUPABASE_URL) if SUPABASE_URL else "MISSING",
    "set(%d chars)" % len(SUPABASE_ANON_KEY) if SUPABASE_ANON_KEY else "MISSING",
    sorted(k for k in os.environ if "SUPABASE" in k.upper() or "GEMINI" in k.upper()),
)

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set")
if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    raise RuntimeError("SUPABASE_URL / SUPABASE_ANON_KEY are not set")

client = genai.Client(api_key=GEMINI_API_KEY)

with open("prompt.txt", "r") as f:
    SYSTEM_INSTRUCTION = f.read()

MAX_NOTE_CHARS = 5000

# This project signs auth tokens with Supabase's asymmetric JWT keys (ES256),
# not a static shared secret — verify against their public JWKS instead.
# Keys are cached for an hour since they rotate rarely.
jwk_client = jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600)
JWT_ALGORITHMS = ["ES256", "RS256"]


def rate_limit_key(request: Request) -> str:
    """Bucket authenticated users by their Supabase user id so the daily quota
    is per-account rather than per-IP (which breaks for shared/mobile NATs).
    Falls back to remote address for unauthenticated/invalid requests — those
    get rejected by verify_token anyway before doing any real work."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        try:
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=JWT_ALGORITHMS,
                audience="authenticated",
                options={"verify_exp": False},
            )
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except jwt.PyJWTError:
            pass
    return get_remote_address(request)


limiter = Limiter(key_func=rate_limit_key, strategy="moving-window")
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Bearer-token auth (not cookies) doesn't need CORS credentials, so any origin
# can be allowed safely — this covers the web app's Vercel domains, local dev,
# and Expo web builds for the mobile app without needing to keep an allowlist.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

NOTES_URL = f"{SUPABASE_URL}/rest/v1/notes"


class RawNote(BaseModel):
    notes: str
    note_id: Optional[str] = None


class CreateNote(BaseModel):
    user_id: str
    title: str = "Untitled"
    raw: str = ""
    punctuated_raw: str = ""
    refined: str = ""
    insights: Any = []
    actions: Any = []


class UpdateNote(BaseModel):
    title: str
    raw: str
    punctuated_raw: str = ""
    refined: str = ""
    insights: Any = []
    actions: Any = []


def require_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in required.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Sign in required.")
    return token


def verify_token(authorization: Optional[str]) -> tuple[str, str]:
    """Validate the Supabase-issued JWT and return (token, user_id)."""
    token = require_token(authorization)
    try:
        signing_key = jwk_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=JWT_ALGORITHMS,
            audience="authenticated",
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.")
    return token, user_id


async def supabase_request(method: str, token: str, **kwargs) -> httpx.Response:
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        **kwargs.pop("headers", {}),
    }
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.request(method, NOTES_URL, headers=headers, **kwargs)
    except httpx.RequestError:
        logger.error("Supabase request failed: %s %s", method, kwargs)
        raise HTTPException(status_code=503, detail="Could not reach the database. Try again shortly.")

    if resp.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.")
    if resp.status_code >= 400:
        logger.warning("Supabase %s failed [%s]: %s", method, resp.status_code, resp.text[:500])
        raise HTTPException(status_code=502, detail="Something went wrong saving your note.")
    return resp


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/")
@limiter.limit("20/day")
async def process(request: Request, note: RawNote, authorization: Optional[str] = Header(default=None)):
    token, user_id = verify_token(authorization)

    notes_text = note.notes.strip()
    if not notes_text:
        raise HTTPException(status_code=400, detail="Nothing to process.")

    warning = None
    if len(notes_text) > MAX_NOTE_CHARS:
        notes_text = notes_text[:MAX_NOTE_CHARS]
        warning = f"Your note was longer than {MAX_NOTE_CHARS} characters, so it was trimmed before processing."

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            config=types.GenerateContentConfig(system_instruction=SYSTEM_INSTRUCTION),
            contents=notes_text,
        )
    except errors.ServerError:
        raise HTTPException(status_code=503, detail="Gemini API unavailable, try again shortly.")
    except errors.APIError as e:
        raise HTTPException(status_code=502, detail=str(e))

    raw_text = (response.text or "").strip()
    cleaned = raw_text.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.error("Gemini returned non-JSON output: %s", raw_text[:500])
        raise HTTPException(status_code=502, detail="AI response could not be parsed. Try again.")

    payload = {
        "user_id": user_id,
        "title": parsed.get("title") or "Untitled",
        "raw": notes_text,
        "punctuated_raw": parsed.get("punctuated_raw", ""),
        "refined": parsed.get("refined", ""),
        "insights": parsed.get("insights", []),
        "actions": parsed.get("actions", []),
    }

    if note.note_id:
        resp = await supabase_request(
            "PATCH",
            token,
            headers={"Prefer": "return=representation"},
            params={"id": f"eq.{note.note_id}"},
            json={**payload, "updated_at": datetime.now(timezone.utc).isoformat()},
        )
    else:
        resp = await supabase_request(
            "POST",
            token,
            headers={"Prefer": "return=representation"},
            json=payload,
        )

    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=502, detail="Note was processed but could not be saved. Try again.")

    result = {"status": "received", "text": parsed, "note": rows[0]}
    if warning:
        result["warning"] = warning
    return result


@app.get("/notes")
@limiter.limit("30/minute")
async def list_notes(request: Request, authorization: Optional[str] = Header(default=None)):
    token = require_token(authorization)
    resp = await supabase_request(
        "GET",
        token,
        params={"select": "*", "order": "created_at.desc"},
    )
    return resp.json()


@app.post("/notes")
@limiter.limit("20/minute")
async def create_note(
    request: Request, note: CreateNote, authorization: Optional[str] = Header(default=None)
):
    token = require_token(authorization)
    resp = await supabase_request(
        "POST",
        token,
        headers={"Prefer": "return=representation"},
        json=note.model_dump(),
    )
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=502, detail="Note was not saved. Try again.")
    return rows[0]


@app.patch("/notes/{note_id}")
@limiter.limit("30/minute")
async def update_note(
    request: Request,
    note_id: str,
    note: UpdateNote,
    authorization: Optional[str] = Header(default=None),
):
    token = require_token(authorization)
    resp = await supabase_request(
        "PATCH",
        token,
        headers={"Prefer": "return=representation"},
        params={"id": f"eq.{note_id}"},
        json=note.model_dump(),
    )
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Note not found.")
    return rows[0]


@app.delete("/notes/{note_id}")
@limiter.limit("30/minute")
async def delete_note(
    request: Request, note_id: str, authorization: Optional[str] = Header(default=None)
):
    token = require_token(authorization)
    await supabase_request("DELETE", token, params={"id": f"eq.{note_id}"})
    return {"status": "deleted"}


@app.delete("/notes")
@limiter.limit("5/minute")
async def clear_notes(request: Request, authorization: Optional[str] = Header(default=None)):
    token = require_token(authorization)
    # No filter needed — RLS scopes every request to the caller's own rows.
    await supabase_request("DELETE", token)
    return {"status": "cleared"}
