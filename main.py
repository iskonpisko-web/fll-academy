import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).parent
LESSONS_PATH = ROOT / "data" / "lessons.json"

app = FastAPI(title="FLL Academy", description="Skill-tree learning for FIRST LEGO League students worldwide")

with LESSONS_PATH.open("r", encoding="utf-8") as f:
    LESSONS_DATA = json.load(f)


@app.get("/api/lessons")
def get_lessons():
    return LESSONS_DATA


@app.get("/api/lesson/{lesson_id}")
def get_lesson(lesson_id: str):
    lesson = LESSONS_DATA["lessons"].get(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return {"id": lesson_id, **lesson}


class AskRequest(BaseModel):
    question: str
    lesson_context: str | None = None


SYSTEM_PROMPT = """You are an enthusiastic FIRST LEGO League (FLL) coach helping students aged 9-14 prepare for tournaments. You teach about:
- The Robot Game (SPIKE Prime / EV3 programming, missions, gyro turns, sensors)
- The Innovation Project (problem statements, research, prototyping)
- Core Values (Discovery, Innovation, Impact, Inclusion, Teamwork, Fun)
- Engineering Design Process and judging-day presentations

Rules:
- Keep answers short (under 120 words) and warm
- Use simple words a 10-year-old can follow
- When relevant, encourage trying it on the robot rather than just reading
- Never invent rules — if unsure, say "check the official Robot Game Rulebook"
- Use emojis sparingly to keep it fun"""


@app.post("/api/ask")
def ask_ai(req: AskRequest):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return JSONResponse(
            status_code=200,
            content={
                "answer": None,
                "error": "no_api_key",
                "message": "🤖 The AI coach is not turned on yet! Ask your team coach to add an Anthropic API key to enable this feature.",
            },
        )

    try:
        import anthropic
    except ImportError:
        return JSONResponse(
            status_code=500,
            content={"answer": None, "error": "missing_lib", "message": "anthropic package not installed"},
        )

    user_content = req.question
    if req.lesson_context:
        user_content = f"(Student is on the lesson: '{req.lesson_context}')\n\nQuestion: {req.question}"

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=600,
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_content}],
    )

    answer = next((b.text for b in response.content if b.type == "text"), "")
    return {"answer": answer, "error": None}


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "ai_enabled": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "lessons_loaded": len(LESSONS_DATA.get("lessons", {})),
    }


app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/{path:path}")
def spa_fallback(path: str):
    static_file = ROOT / "static" / path
    if static_file.is_file():
        return FileResponse(static_file)
    return FileResponse(ROOT / "static" / "index.html")
