import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.database import init_db
from app.routers import workflows, documents, context, suggestions, generate, students, submissions, gradebook, chat

BASE_DIR = Path(__file__).parent.parent

app = FastAPI(title="Jenn's School Tools — MARTY")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

app.include_router(workflows.router, prefix="/api/workflows", tags=["workflows"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(context.router, prefix="/api/context", tags=["context"])
app.include_router(suggestions.router, prefix="/api/suggestions", tags=["suggestions"])
app.include_router(generate.router, prefix="/api/generate", tags=["generate"])
app.include_router(students.router, prefix="/api/students", tags=["students"])
app.include_router(submissions.router, prefix="/api/submissions", tags=["submissions"])
app.include_router(gradebook.router, prefix="/api/gradebook", tags=["gradebook"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    return FileResponse(BASE_DIR / "templates" / "index.html")
