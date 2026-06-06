from __future__ import annotations

import base64
import json
import mimetypes
import os
import platform
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

try:
    import fitz  # PyMuPDF
except Exception:  # noqa: BLE001
    fitz = None

try:
    from PIL import Image
except Exception:  # noqa: BLE001
    Image = None

APP_NAME = "RepIQ Board"
APP_VERSION = "v2"
ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
STATIC = ROOT / "static"
WORK = Path(tempfile.gettempdir()) / "repiq_board_work"
WORK.mkdir(parents=True, exist_ok=True)

SUPPORTED_PRESENTATIONS = {".pptx", ".ppt"}
SUPPORTED_PDF = {".pdf"}
SUPPORTED_IMAGES = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def soffice_candidates() -> list[Path]:
    if platform.system() == "Windows":
        return [
            Path(r"C:\Program Files\LibreOffice\program\soffice.exe"),
            Path(r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"),
        ]
    if platform.system() == "Darwin":
        return [Path("/Applications/LibreOffice.app/Contents/MacOS/soffice")]
    return [Path("/usr/bin/soffice"), Path("/usr/local/bin/soffice"), Path("/snap/bin/libreoffice"), Path("/usr/bin/libreoffice")]


def find_soffice() -> str | None:
    for name in ("soffice", "libreoffice"):
        found = shutil.which(name)
        if found:
            return found
    for candidate in soffice_candidates():
        if candidate.exists():
            return str(candidate)
    return None


def convert_ppt_to_pdf(path: Path, session_dir: Path) -> Path:
    soffice = find_soffice()
    if not soffice:
        raise RuntimeError(
            "PPTX/PPT открывается через LibreOffice, но soffice не найден. "
            "Сохраните презентацию как PDF или проверьте установку LibreOffice."
        )
    out_dir = session_dir / "converted"
    out_dir.mkdir(parents=True, exist_ok=True)
    profile_dir = session_dir / "lo_profile"
    profile_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        soffice,
        "--headless",
        "--norestore",
        "--nofirststartwizard",
        f"-env:UserInstallation={profile_dir.as_uri()}",
        "--convert-to",
        "pdf:impress_pdf_Export",
        "--outdir",
        str(out_dir),
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        fallback = cmd.copy()
        fallback[fallback.index("pdf:impress_pdf_Export")] = "pdf"
        result = subprocess.run(fallback, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        raise RuntimeError("LibreOffice найден, но не смог преобразовать PPTX. Техническое сообщение: " + (result.stderr or result.stdout))
    expected = out_dir / f"{path.stem}.pdf"
    if expected.exists():
        return expected
    pdfs = list(out_dir.glob("*.pdf"))
    if pdfs:
        return pdfs[0]
    raise RuntimeError("LibreOffice завершил работу, но PDF после конвертации не найден.")


def pdf_to_pngs(path: Path, session_dir: Path) -> list[dict]:
    if fitz is None:
        raise RuntimeError("Для открытия PDF нужен пакет PyMuPDF. Запустите: pip install -r requirements.txt")
    slides_dir = session_dir / "slides"
    slides_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(path)
    result: list[dict] = []
    matrix = fitz.Matrix(2.0, 2.0)
    for idx, page in enumerate(doc, start=1):
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        out = slides_dir / f"slide_{idx:03d}.png"
        pix.save(str(out))
        result.append({"url": f"/work/{session_dir.name}/slides/{out.name}", "w": pix.width, "h": pix.height})
    doc.close()
    if not result:
        raise RuntimeError("В PDF нет страниц.")
    return result


def image_to_slide(path: Path, session_dir: Path) -> list[dict]:
    if Image is None:
        raise RuntimeError("Для открытия изображений нужен пакет Pillow. Запустите: pip install -r requirements.txt")
    slides_dir = session_dir / "slides"
    slides_dir.mkdir(parents=True, exist_ok=True)
    img = Image.open(path).convert("RGB")
    out = slides_dir / "slide_001.png"
    img.save(out)
    return [{"url": f"/work/{session_dir.name}/slides/{out.name}", "w": img.width, "h": img.height}]


def parse_multipart(body: bytes, content_type: str) -> tuple[str, bytes]:
    # Небольшой парсер multipart/form-data для одного файла. Без внешних зависимостей.
    marker = "boundary="
    if marker not in content_type:
        raise RuntimeError("Не найден boundary в multipart-запросе.")
    boundary = ("--" + content_type.split(marker, 1)[1].split(";", 1)[0].strip().strip('"')).encode()
    parts = body.split(boundary)
    for part in parts:
        if b"Content-Disposition" not in part or b"filename=" not in part:
            continue
        header, _, data = part.partition(b"\r\n\r\n")
        if not data:
            continue
        # убрать завершающие CRLF и '--'
        data = data.rstrip(b"\r\n")
        header_text = header.decode("utf-8", errors="ignore")
        filename = "upload.bin"
        if "filename=" in header_text:
            filename = header_text.split("filename=", 1)[1].split("\r\n", 1)[0].strip().strip('"')
            filename = Path(filename).name or "upload.bin"
        return filename, data
    raise RuntimeError("Файл в запросе не найден.")


def data_url_to_image(data_url: str):
    if Image is None:
        raise RuntimeError("Для экспорта PDF нужен Pillow. Запустите: pip install -r requirements.txt")
    if "," not in data_url:
        raise RuntimeError("Некорректные данные изображения.")
    raw = base64.b64decode(data_url.split(",", 1)[1])
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    try:
        tmp.write(raw)
        tmp.close()
        return Image.open(tmp.name).convert("RGB")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


class Handler(BaseHTTPRequestHandler):
    server_version = "RepIQBoard/2"

    def log_message(self, fmt: str, *args):
        # Чище окно консоли.
        return

    def send_json(self, obj: dict, status: int = 200):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_file(self, path: Path, content_type: str | None = None):
        if not path.exists() or not path.is_file():
            self.send_error(404)
            return
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type or mimetypes.guess_type(str(path))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == "/":
            return self.send_file(ROOT / "index.html", "text/html; charset=utf-8")
        if path.startswith("/static/"):
            rel = path.removeprefix("/static/")
            return self.send_file(STATIC / rel)
        if path.startswith("/work/"):
            rel = path.removeprefix("/work/")
            safe = (WORK / rel).resolve()
            if not str(safe).startswith(str(WORK.resolve())):
                self.send_error(403)
                return
            return self.send_file(safe)
        self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        if path == "/upload":
            try:
                filename, data = parse_multipart(body, self.headers.get("Content-Type", ""))
                session_id = uuid.uuid4().hex[:10]
                session_dir = WORK / session_id
                session_dir.mkdir(parents=True, exist_ok=True)
                upload_path = session_dir / filename
                upload_path.write_bytes(data)
                ext = upload_path.suffix.lower()
                if ext in SUPPORTED_PRESENTATIONS:
                    pdf_path = convert_ppt_to_pdf(upload_path, session_dir)
                    slides = pdf_to_pngs(pdf_path, session_dir)
                elif ext in SUPPORTED_PDF:
                    slides = pdf_to_pngs(upload_path, session_dir)
                elif ext in SUPPORTED_IMAGES:
                    slides = image_to_slide(upload_path, session_dir)
                else:
                    raise RuntimeError("Поддерживаются PPTX/PPT, PDF и изображения PNG/JPG/WEBP/BMP.")
                self.send_json({"ok": True, "session": session_id, "slides": slides, "name": filename})
            except Exception as exc:  # noqa: BLE001
                self.send_json({"ok": False, "error": str(exc)}, status=500)
            return
        if path in ("/export_pdf", "/export_pdf_v2"):
            try:
                payload = json.loads(body.decode("utf-8"))
                pages = payload.get("pages") or []
                if not pages:
                    raise RuntimeError("Нет страниц для экспорта.")
                images = []
                for p in pages:
                    slide_img = data_url_to_image(p["slide"])
                    images.append(slide_img)
                    # В v1.6 после слайда добавляем только заполненные листы комментариев.
                    for board_data in p.get("boards", []):
                        if board_data:
                            images.append(data_url_to_image(board_data))
                    # Совместимость со старым форматом экспорта.
                    if p.get("hasBoard") and p.get("board"):
                        images.append(data_url_to_image(p["board"]))
                out = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
                out.close()
                images[0].save(out.name, "PDF", resolution=150, save_all=True, append_images=images[1:])
                data = Path(out.name).read_bytes()
                os.unlink(out.name)
                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Disposition", 'attachment; filename="RepIQ_Board_export.pdf"')
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as exc:  # noqa: BLE001
                self.send_json({"ok": False, "error": str(exc)}, status=500)
            return
        self.send_error(404)


def find_browser_app() -> str | None:
    """На Windows стараемся открыть приложение в режиме окна без вкладок."""
    candidates: list[Path] = []
    if platform.system() == "Windows":
        env = os.environ
        for key in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
            base = env.get(key)
            if not base:
                continue
            candidates.extend([
                Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
                Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe",
            ])
    for c in candidates:
        if c.exists():
            return str(c)
    for name in ("msedge", "chrome", "chromium", "google-chrome"):
        found = shutil.which(name)
        if found:
            return found
    return None



def get_screen_size() -> tuple[int, int]:
    if platform.system() == "Windows":
        try:
            import ctypes
            user32 = ctypes.windll.user32
            return int(user32.GetSystemMetrics(0)), int(user32.GetSystemMetrics(1))
        except Exception:
            pass
    return 1800, 1000

def open_app_window(url: str) -> None:
    browser = find_browser_app()
    if browser:
        try:
            sw, sh = get_screen_size()
            profile_dir = WORK / "browser_profile"
            profile_dir.mkdir(parents=True, exist_ok=True)
            subprocess.Popen([
                browser,
                f"--app={url}",
                "--new-window",
                "--start-maximized",
                "--window-position=0,0",
                f"--window-size={sw},{max(720, sh - 40)}",
                f"--user-data-dir={profile_dir}",
                "--disable-features=TranslateUI",
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except Exception:
            pass
    webbrowser.open(url)


def main():
    port = find_free_port()
    url = f"http://127.0.0.1:{port}/"
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"{APP_NAME} {APP_VERSION}")
    print(f"Открываю: {url}")
    print("Если окно запущено видимо, оставьте его открытым, пока работает доска.")
    threading.Timer(0.8, lambda: open_app_window(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
