# Сайт repiq.ru

Это статический сайт для домена `repiq.ru`.

## Что внутри

- `index.html` — главная страница приложения «Репетитор AI».
- `privacy.html` — политика конфиденциальности для RuStore и сайта.
- `ai-pro.html` — черновая страница будущей AI Pro подписки.
- `repiq-board.html` и `board-v2/` — раздел RepIQ Board.
- `.nojekyll` — служебный файл на случай публикации через GitHub Pages.

## RepIQ Board

Статическая часть доски лежит в `board-v2/index.html` и работает прямо на сайте: открывает PDF, позволяет писать на слайде и листах комментариев, сохраняет итоговый PDF.

Конвертация PPT/PPTX в PDF подготовлена в `board-v2/app.py`. Для нее нужен отдельный Python-сервис с зависимостями из `board-v2/requirements.txt` и установленным LibreOffice на сервере.

## AI-генерация презентаций

Backend для AI-презентаций лежит в `server/`.

Переменные окружения на TimeWeb:

- `OPENAI_API_KEY` — ключ OpenAI Platform.
- `AI_MODEL` — модель для текстовой структуры презентации. Если не указать, используется `gpt-4.1-mini`.

Запуск backend:

```bash
pip install -r server/requirements.txt
uvicorn server.main:app --host 0.0.0.0 --port 8000
```

Endpoint:

- `POST /api/ai/presentation/create`

Backend не использует генерацию картинок, видео, realtime или web search. Он получает строгий JSON со структурой слайдов и собирает PDF в стиле RepIQ.

## Как загрузить на хостинг

1. Открыть панель хостинга.
2. Найти файловый менеджер сайта `repiq.ru`.
3. Загрузить содержимое этой папки в корень сайта.
4. Проверить, что открывается `https://repiq.ru`.

Основной сайт статический и не требует сервера или базы данных. RepIQ Board для конвертации PPT/PPTX и будущего AI-модуля требует отдельный backend.
