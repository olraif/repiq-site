from __future__ import annotations

import json
import os
import textwrap
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import Paragraph
from reportlab.pdfgen.canvas import Canvas


ROOT = Path(__file__).resolve().parent
GENERATED_DIR = ROOT / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_MODEL = "gpt-4.1-mini"
OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
REPIQ_URL = "https://repiq.ru"

app = FastAPI(title="RepIQ Board AI API")


def cors_origins() -> list[str]:
    raw = os.getenv(
        "CORS_ORIGINS",
        os.getenv(
            "CORS_ORIGIN",
            "https://repiq.ru,https://www.repiq.ru,http://127.0.0.1:8782,http://localhost:8782",
        ),
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.mount("/api/generated", StaticFiles(directory=str(GENERATED_DIR)), name="generated")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


def register_font(name: str, candidates: list[str]) -> str:
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            pdfmetrics.registerFont(TTFont(name, str(path)))
            return name
    return "Helvetica"


FONT_REGULAR = register_font("RepIQRegular", [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "C:/Windows/Fonts/arial.ttf",
])
FONT_BOLD = register_font("RepIQBold", [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
])


class PresentationRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=180)
    subject: str = Field(default="", max_length=80)
    grade: str = Field(default="", max_length=80)
    duration: int | str = Field(default=60)
    slidesCount: int = Field(default=8, ge=3, le=14)
    includeTheory: bool = True
    includeExamples: bool = True
    includePractice: bool = True
    includeHomework: bool = False
    includeAnswers: bool = True
    notes: str = Field(default="", max_length=1200)

    @field_validator("duration")
    @classmethod
    def normalize_duration(cls, value: int | str) -> int:
        if isinstance(value, int):
            return max(10, min(value, 180))
        digits = "".join(ch for ch in value if ch.isdigit())
        if not digits:
            return 60
        return max(10, min(int(digits), 180))


SLIDES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["title", "subtitle", "slides"],
    "properties": {
        "title": {"type": "string"},
        "subtitle": {"type": "string"},
        "slides": {
            "type": "array",
            "minItems": 3,
            "maxItems": 14,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["title", "kind", "bullets", "teacherNotes"],
                "properties": {
                    "title": {"type": "string"},
                    "kind": {
                        "type": "string",
                        "enum": ["intro", "theory", "example", "practice", "homework", "answers", "summary"],
                    },
                    "bullets": {
                        "type": "array",
                        "minItems": 2,
                        "maxItems": 6,
                        "items": {"type": "string"},
                    },
                    "teacherNotes": {"type": "string"},
                },
            },
        },
    },
}


def ai_model() -> str:
    return os.getenv("AI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def openai_key() -> str:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY не настроен на сервере. Добавьте переменную окружения в TimeWeb.",
        )
    return key


def build_prompt(payload: PresentationRequest) -> list[dict[str, str]]:
    blocks = []
    if payload.includeTheory:
        blocks.append("теория")
    if payload.includeExamples:
        blocks.append("примеры")
    if payload.includePractice:
        blocks.append("практика")
    if payload.includeHomework:
        blocks.append("домашнее задание")
    if payload.includeAnswers:
        blocks.append("ответы")

    user = f"""
    Подготовь структуру учебной презентации для RepIQ Board.
    Тема: {payload.topic}
    Предмет: {payload.subject or "не указан"}
    Класс/уровень: {payload.grade or "не указан"}
    Длительность урока: {payload.duration} минут
    Количество слайдов: {payload.slidesCount}
    Нужные блоки: {", ".join(blocks) or "базовая структура"}
    Дополнительное описание учителя: {payload.notes or "нет"}

    Требования:
    - только учебная текстовая структура, без картинок;
    - язык: русский;
    - каждый слайд должен быть коротким и удобным для показа ученику;
    - не добавляй сведения, которые требуют проверки в интернете;
    - если указан учебник/страницы, учитывай это как ориентир, но не цитируй длинные фрагменты.
    """
    return [
        {
            "role": "system",
            "content": "Ты методист для репетитора. Возвращай только строгий JSON по схеме.",
        },
        {"role": "user", "content": textwrap.dedent(user).strip()},
    ]


def call_openai(payload: PresentationRequest) -> dict[str, Any]:
    body = {
        "model": ai_model(),
        "messages": build_prompt(payload),
        "temperature": 0.35,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "repiq_board_presentation",
                "strict": True,
                "schema": SLIDES_SCHEMA,
            },
        },
    }
    request = Request(
        OPENAI_CHAT_COMPLETIONS_URL,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {openai_key()}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=90) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        message = exc.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {message[:800]}") from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI API недоступен: {exc.reason}") from exc

    data = json.loads(raw)
    content = data["choices"][0]["message"]["content"]
    return json.loads(content)


def fit_paragraph(canvas: Canvas, text: str, style: ParagraphStyle, x: float, y: float, w: float, h: float) -> float:
    paragraph = Paragraph(text, style)
    _, used_h = paragraph.wrap(w, h)
    paragraph.drawOn(canvas, x, y - used_h)
    return used_h


def draw_footer(canvas: Canvas, width: float) -> None:
    canvas.setFont(FONT_REGULAR, 9)
    canvas.setFillColor(colors.HexColor("#1976b8"))
    canvas.drawString(18 * mm, 10 * mm, "repiq.ru")
    canvas.linkURL(REPIQ_URL, (18 * mm, 8 * mm, 48 * mm, 15 * mm), relative=0)

    text = "repiqboard · AI-автоматизация"
    canvas.setFillColor(colors.HexColor("#6f8395"))
    text_width = stringWidth(text, FONT_REGULAR, 9)
    canvas.drawString(width - 18 * mm - text_width, 10 * mm, text)


def draw_slide(canvas: Canvas, slide: dict[str, Any], index: int, total: int) -> None:
    page_w, page_h = landscape((210 * mm, 118 * mm))
    canvas.setPageSize((page_w, page_h))

    canvas.setFillColor(colors.HexColor("#eef8fd"))
    canvas.rect(0, 0, page_w, page_h, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.roundRect(10 * mm, 9 * mm, page_w - 20 * mm, page_h - 18 * mm, 8 * mm, fill=1, stroke=0)

    canvas.setFillColor(colors.HexColor("#2f91d5"))
    canvas.roundRect(18 * mm, page_h - 23 * mm, 36 * mm, 8 * mm, 3 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont(FONT_BOLD, 8)
    canvas.drawCentredString(36 * mm, page_h - 20.5 * mm, f"{index} / {total}")

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "slide-title",
        parent=styles["Title"],
        fontName=FONT_BOLD,
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#1f3142"),
        spaceAfter=8,
    )
    bullet_style = ParagraphStyle(
        "slide-bullet",
        parent=styles["BodyText"],
        fontName=FONT_REGULAR,
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#304759"),
        leftIndent=10,
        bulletIndent=0,
    )
    notes_style = ParagraphStyle(
        "notes",
        parent=styles["BodyText"],
        fontName=FONT_REGULAR,
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#71899f"),
    )

    x = 20 * mm
    y = page_h - 31 * mm
    content_w = page_w - 40 * mm
    y -= fit_paragraph(canvas, slide["title"], title_style, x, y, content_w, 28 * mm) + 4 * mm

    for bullet in slide.get("bullets", [])[:6]:
        y -= fit_paragraph(canvas, f"• {bullet}", bullet_style, x + 2 * mm, y, content_w - 4 * mm, 18 * mm) + 1.5 * mm

    note = slide.get("teacherNotes", "")
    if note:
        canvas.setFillColor(colors.HexColor("#e9f6fd"))
        canvas.roundRect(20 * mm, 20 * mm, page_w - 40 * mm, 13 * mm, 3 * mm, fill=1, stroke=0)
        fit_paragraph(canvas, f"Заметка учителю: {note}", notes_style, 23 * mm, 29 * mm, page_w - 46 * mm, 9 * mm)

    draw_footer(canvas, page_w)
    canvas.showPage()


def build_pdf(structure: dict[str, Any]) -> Path:
    filename = f"repiq-board-ai-{uuid.uuid4().hex[:10]}.pdf"
    path = GENERATED_DIR / filename
    canvas = Canvas(str(path))
    slides = structure.get("slides") or []
    total = len(slides)
    for index, slide in enumerate(slides, start=1):
        draw_slide(canvas, slide, index, total)
    canvas.save()
    return path


@app.post("/api/ai/presentation/create")
def create_presentation(payload: PresentationRequest) -> dict[str, Any]:
    structure = call_openai(payload)
    path = build_pdf(structure)
    return {
        "ok": True,
        "status": "ready",
        "title": structure.get("title", payload.topic),
        "pdfUrl": f"/api/generated/{path.name}",
        "model": ai_model(),
        "slidesCount": len(structure.get("slides") or []),
    }
