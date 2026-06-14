const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://repiq.ru',
  'https://www.repiq.ru',
  'http://localhost',
  'http://127.0.0.1',
];

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const allowed = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
  return allowed.has(origin) || /^https:\/\/([a-z0-9-]+\.)*repiq\.ru$/i.test(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': isAllowedOrigin(origin, env)
      ? origin
      : 'https://www.repiq.ru',
    'access-control-allow-methods': 'POST,GET,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function reply(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(request, env),
    },
  });
}

function cleanText(value, maxLength = 1200) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeRequest(input = {}) {
  return {
    topic: cleanText(input.topic, 180),
    subject: cleanText(input.subject, 80),
    grade: cleanText(input.grade, 80),
    notes: cleanText(input.notes),
    slidesCount: Math.max(3, Math.min(12, Number(input.slidesCount) || 8)),
    duration: Math.max(10, Math.min(180, Number(input.duration) || 60)),
    includeTheory: input.includeTheory !== false,
    includeExamples: input.includeExamples !== false,
    includePractice: input.includePractice !== false,
    includeHomework: input.includeHomework === true,
    includeAnswers: input.includeAnswers !== false,
  };
}

function buildPrompt(payload) {
  const blocks = [];
  if (payload.includeTheory) blocks.push('теория');
  if (payload.includeExamples) blocks.push('примеры с разбором');
  if (payload.includePractice) blocks.push('практика');
  if (payload.includeHomework) blocks.push('домашнее задание');
  if (payload.includeAnswers) blocks.push('ответы');

  return `Создай структуру учебной презентации на русском языке.

Тема: ${payload.topic}
Предмет: ${payload.subject || 'не указан'}
Класс или уровень: ${payload.grade || 'не указан'}
Продолжительность урока: ${payload.duration} минут
Количество слайдов: строго ${payload.slidesCount}
Нужные блоки: ${blocks.join(', ') || 'базовая структура'}
Комментарий учителя: ${payload.notes || 'нет'}

Верни только JSON без markdown и пояснений:
{
  "title": "Название урока",
  "subtitle": "Короткое пояснение",
  "slides": [
    {
      "kind": "cover|theory|example|practice|summary|homework|answers",
      "title": "Заголовок",
      "subtitle": "Необязательная строка",
      "bullets": ["Короткий пункт", "Короткий пункт"],
      "callout": "Формула, вопрос, пример или ключевая мысль",
      "teacherNote": "Короткая заметка учителю"
    }
  ]
}

Правила:
- ровно ${payload.slidesCount} слайдов;
- первый слайд cover, последний summary или answers;
- не более 5 коротких пунктов на слайде;
- текст должен быть понятен ученику ${payload.grade || 'указанного уровня'};
- не выдумывай содержание конкретной страницы учебника, если оно не дано в комментарии;
- учебник и страницы из комментария используй только как ориентир;
- не запрашивай картинки и не добавляй ссылки;
- для примеров и заданий давай содержательные данные по теме, а не общие фразы.`;
}

function parseModelJson(result) {
  const raw = result?.response ?? result?.result?.response ?? result;
  if (raw && typeof raw === 'object') return raw;
  const text = String(raw || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Модель не вернула JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

function normalizeSlide(slide, index) {
  const kinds = new Set([
    'cover', 'theory', 'example', 'practice', 'summary', 'homework', 'answers',
  ]);
  return {
    kind: kinds.has(slide?.kind) ? slide.kind : index === 0 ? 'cover' : 'theory',
    title: cleanText(slide?.title, 120) || `Слайд ${index + 1}`,
    subtitle: cleanText(slide?.subtitle, 180),
    bullets: Array.isArray(slide?.bullets)
      ? slide.bullets.map(value => cleanText(value, 180)).filter(Boolean).slice(0, 5)
      : [],
    callout: cleanText(slide?.callout, 260),
    teacherNote: cleanText(slide?.teacherNote, 240),
  };
}

function normalizePresentation(value, payload) {
  const sourceSlides = Array.isArray(value?.slides) ? value.slides : [];
  if (!sourceSlides.length) throw new Error('В ответе нет слайдов.');

  const slides = sourceSlides.slice(0, payload.slidesCount).map(normalizeSlide);
  while (slides.length < payload.slidesCount) {
    slides.push(normalizeSlide({
      kind: 'practice',
      title: 'Закрепляем материал',
      bullets: [
        'Объясните правило своими словами',
        'Выполните задание по образцу',
        'Проверьте ответ',
      ],
      callout: 'Что получилось? Что осталось непонятно?',
    }, slides.length));
  }
  slides[0].kind = 'cover';

  return {
    title: cleanText(value?.title, 160) || payload.topic,
    subtitle: cleanText(value?.subtitle, 220)
      || [payload.subject, payload.grade].filter(Boolean).join(' · '),
    slides,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return reply(request, env, {
        ok: true,
        service: 'RepIQ Board AI',
        model: env.AI_MODEL || DEFAULT_MODEL,
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/api/ai/presentation/create') {
      return reply(request, env, { ok: false, error: 'Not found' }, 404);
    }

    try {
      const payload = normalizeRequest(await request.json());
      if (payload.topic.length < 2) {
        return reply(request, env, {
          ok: false,
          error: 'Укажите тему презентации.',
        }, 400);
      }

      const result = await env.AI.run(env.AI_MODEL || DEFAULT_MODEL, {
        messages: [
          {
            role: 'system',
            content: 'Ты методист и автор учебных презентаций. Отвечай только валидным JSON на русском языке.',
          },
          { role: 'user', content: buildPrompt(payload) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.35,
        max_tokens: 4200,
      });

      const presentation = normalizePresentation(parseModelJson(result), payload);
      return reply(request, env, {
        ok: true,
        title: presentation.title,
        presentation,
        model: env.AI_MODEL || DEFAULT_MODEL,
      });
    } catch (error) {
      console.error('RepIQ AI error', error);
      return reply(request, env, {
        ok: false,
        error: 'Бесплатная AI-модель временно не ответила. Попробуйте ещё раз через минуту.',
      }, 503);
    }
  },
};
