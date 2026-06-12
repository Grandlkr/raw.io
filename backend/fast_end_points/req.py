from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
from google import genai
from google.genai import types
import json

# get gemini key from .env file
load_dotenv()
gemini_key = os.getenv('GEMINI_API_KEY')

#intialize gemini client
client = genai.Client(api_key=gemini_key)

#initialize fast api
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://raw.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class Raw(BaseModel):
    notes: str
with open('prompt.txt', 'r') as f:
    system_instruction = f.read()
@app.post('/')
async def process(note : Raw):
    #gemini call
    response = client.models.generate_content(
    model="gemini-3.5-flash",
    config=types.GenerateContentConfig(system_instruction=system_instruction),
    contents=note.notes
    )
    #json clean up
    clean = response.text or ""
    clean_json = clean.replace("```json", "").replace("```", "").strip()
    return {"status": "received", "text": json.loads(clean_json)}