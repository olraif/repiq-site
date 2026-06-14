const DEFAULT_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const FALLBACK_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const DEFAULT_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';

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

function cleanList(value, maxItems = 5, maxLength = 220) {
  return Array.isArray(value)
    ? value.map(item => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];
}

function finiteNumber(value, fallback = 0, min = -100, max = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeRequest(input = {}) {
  return {
    topic: cleanText(input.topic, 180),
    subject: cleanText(input.subject, 80),
    grade: cleanText(input.grade, 80),
    template: cleanText(input.template, 30) || 'auto',
    notes: cleanText(input.notes),
    slidesCount: Math.max(3, Math.min(12, Number(input.slidesCount) || 8)),
    duration: Math.max(10, Math.min(180, Number(input.duration) || 60)),
    includeTheory: input.includeTheory !== false,
    includeExamples: input.includeExamples !== false,
    includePractice: input.includePractice !== false,
    includeHomework: input.includeHomework === true,
    includeAnswers: input.includeAnswers !== false,
    includeIllustration: input.includeIllustration !== false,
  };
}

function subjectRules(payload) {
  const subject = `${payload.subject} ${payload.topic}`.toLowerCase();
  if (/матем|алгеб|геометр|физик|статист|уравнен|дроб|функц/.test(subject)) {
    return `Это точный математический материал.
- Проверяй вычисления и ответы.
- Формулы записывай в поле formula обычными Unicode-символами: x², x₁, √, ≤, ≥, ×, ÷. Не используй LaTeX и символы $.
- Для разобранного примера используй steps: каждый шаг короткий и логически следующий.
- Для графика функции visual.type = "quadratic-graph" и укажи числовые a, b, c.
- Для геометрии visual.type = "geometry" и укажи shape: triangle, circle или rectangle.
- Не заменяй математическую схему случайной декоративной картинкой.`;
  }
  if (/англ|русск|язык|литерат|немец|франц|испан/.test(subject)) {
    return `Это урок языка или литературы.
- Давай живые примеры фраз и короткие задания.
- Для слов и выражений используй visual.type = "vocabulary".
- Для сравнения правил используй layout = "comparison".
- Иностранные слова сопровождай понятным переводом, если это соответствует уровню.`;
  }
  if (/географ|окружающ|эколог/.test(subject)) {
    return `Это урок географии или окружающего мира.
- Используй конкретные объекты, признаки, причины и следствия.
- Для последовательности или маршрута используй visual.type = "process".
- Для географической темы visual.type = "map".
- Не придумывай точные статистические данные, если они не общеизвестны.`;
  }
  if (/биолог|хими|естеств|медиц/.test(subject)) {
    return `Это естественно-научный урок.
- Термины объясняй простыми словами, затем используй научное название.
- Для строения или цикла используй visual.type = "process".
- Для атомов и молекул используй visual.type = "atom".
- Не добавляй опасных домашних опытов.`;
  }
  if (/истор|обществ|право|эконом/.test(subject)) {
    return `Это гуманитарный урок.
- Различай факт, причину, событие и последствие.
- Для хронологии используй visual.type = "timeline" и короткие steps.
- Не выдумывай даты и цитаты.`;
  }
  if (/информ|программ|робот|компьют/.test(subject)) {
    return `Это урок информатики.
- Код и алгоритмы должны быть короткими и корректными.
- Для алгоритма используй visual.type = "process", для кода visual.type = "code".
- Объясняй назначение каждого шага.`;
  }
  return `Материал должен быть предметным, конкретным и понятным ученику.
- Используй примеры, вопросы и короткие выводы.
- Не заполняй слайды общими фразами без учебной пользы.`;
}

function buildPrompt(payload) {
  const blocks = [];
  if (payload.includeTheory) blocks.push('теория');
  if (payload.includeExamples) blocks.push('примеры с разбором');
  if (payload.includePractice) blocks.push('практика');
  if (payload.includeHomework) blocks.push('домашнее задание');
  if (payload.includeAnswers) blocks.push('ответы');

  return `Создай содержательную учебную презентацию на русском языке.

Тема: ${payload.topic}
Предмет: ${payload.subject || 'не указан'}
Класс или уровень: ${payload.grade || 'не указан'}
Продолжительность урока: ${payload.duration} минут
Количество слайдов: строго ${payload.slidesCount}
Нужные блоки: ${blocks.join(', ') || 'базовая структура'}
Комментарий учителя и источник: ${payload.notes || 'нет'}

${subjectRules(payload)}

Верни только JSON без markdown и пояснений:
{
  "title": "Название урока",
  "subtitle": "Короткое и конкретное пояснение",
  "learningGoal": "Что ученик сможет сделать после урока",
  "imagePrompt": "English prompt for one clean educational cover illustration, no text, no letters, no watermark",
  "slides": [
    {
      "kind": "cover|theory|example|practice|summary|homework|answers",
      "layout": "cover|split|formula|steps|cards|comparison|practice|summary",
      "title": "Заголовок",
      "subtitle": "Необязательная строка",
      "bullets": ["Конкретный короткий пункт"],
      "formula": "Формула обычными Unicode-символами без LaTeX",
      "steps": ["Шаг 1", "Шаг 2"],
      "question": "Вопрос или задание ученику",
      "answer": "Короткий проверенный ответ",
      "callout": "Ключевая мысль или типичная ошибка",
      "teacherNote": "Короткая заметка учителю",
      "visual": {
        "type": "subject|quadratic-graph|coordinate-plane|geometry|timeline|map|process|vocabulary|atom|code|none",
        "label": "Короткая подпись",
        "a": 1,
        "b": 0,
        "c": 0,
        "shape": "triangle|circle|rectangle"
      }
    }
  ]
}

Общие правила:
- Ровно ${payload.slidesCount} слайдов. Первый cover, последний summary или answers.
- Чередуй макеты. Не делай все слайды одинаковыми.
- На слайде одна учебная мысль: до 4 пунктов или до 4 шагов.
- Начни с цели и опорного вопроса, затем объяснение, пример, самостоятельная практика и итог.
- Текст должен быть понятен ученику ${payload.grade || 'указанного уровня'}, без канцелярита и фраз вроде «рассмотрим тему подробнее».
- Примеры и задания должны содержать реальные данные по теме, а ответы должны быть проверены.
- Не выдумывай содержание конкретной страницы учебника, если оно не приведено в комментарии.
- Не добавляй ссылки, названия платных сервисов и инструкции по поиску картинок.
- imagePrompt должен точно соответствовать теме, быть визуальным, без текста и интерфейсов.`;
}

function modelText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.result?.response === 'string') return result.result.response;
  if (typeof result?.choices?.[0]?.message?.content === 'string') {
    return result.choices[0].message.content;
  }
  if (typeof result?.result?.choices?.[0]?.message?.content === 'string') {
    return result.result.choices[0].message.content;
  }
  return result;
}

function parseModelJson(result) {
  const raw = modelText(result);
  if (raw && typeof raw === 'object') return raw;
  const text = String(raw || '')
    .trim()
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Модель не вернула JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

function normalizeVisual(value, fallback = 'subject') {
  const allowed = new Set([
    'subject', 'quadratic-graph', 'coordinate-plane', 'geometry', 'timeline',
    'map', 'process', 'vocabulary', 'atom', 'code', 'none',
  ]);
  const type = allowed.has(value?.type) ? value.type : fallback;
  const shapes = new Set(['triangle', 'circle', 'rectangle']);
  return {
    type,
    label: cleanText(value?.label, 100),
    a: finiteNumber(value?.a, 1, -20, 20),
    b: finiteNumber(value?.b, 0, -50, 50),
    c: finiteNumber(value?.c, 0, -100, 100),
    shape: shapes.has(value?.shape) ? value.shape : 'triangle',
  };
}

function defaultLayout(slide, kind) {
  if (kind === 'cover') return 'cover';
  if (kind === 'practice') return 'practice';
  if (kind === 'summary' || kind === 'answers') return 'summary';
  if (slide?.formula) return 'formula';
  if (Array.isArray(slide?.steps) && slide.steps.length > 1) return 'steps';
  return 'split';
}

function normalizeSlide(slide, index) {
  const kinds = new Set([
    'cover', 'theory', 'example', 'practice', 'summary', 'homework', 'answers',
  ]);
  const layouts = new Set([
    'cover', 'split', 'formula', 'steps', 'cards', 'comparison', 'practice', 'summary',
  ]);
  const kind = kinds.has(slide?.kind) ? slide.kind : index === 0 ? 'cover' : 'theory';
  const layout = layouts.has(slide?.layout) ? slide.layout : defaultLayout(slide, kind);
  return {
    kind,
    layout,
    title: cleanText(slide?.title, 120) || `Слайд ${index + 1}`,
    subtitle: cleanText(slide?.subtitle, 180),
    bullets: cleanList(slide?.bullets, 4, 190),
    formula: cleanText(slide?.formula, 240),
    steps: cleanList(slide?.steps, 4, 210),
    question: cleanText(slide?.question, 280),
    answer: cleanText(slide?.answer, 220),
    callout: cleanText(slide?.callout, 240),
    teacherNote: cleanText(slide?.teacherNote, 220),
    visual: normalizeVisual(slide?.visual, index === 0 ? 'subject' : 'none'),
  };
}

function normalizePresentation(value, payload) {
  const sourceSlides = Array.isArray(value?.slides) ? value.slides : [];
  if (!sourceSlides.length) throw new Error('В ответе нет слайдов.');

  const slides = sourceSlides.slice(0, payload.slidesCount).map(normalizeSlide);
  while (slides.length < payload.slidesCount) {
    slides.push(normalizeSlide({
      kind: 'practice',
      layout: 'practice',
      title: 'Закрепляем материал',
      question: 'Объясните ключевую идею своими словами и выполните задание по образцу.',
      bullets: ['Запишите решение', 'Проверьте каждый шаг', 'Сформулируйте вывод'],
      callout: 'Что получилось? Что осталось непонятно?',
    }, slides.length));
  }

  slides[0].kind = 'cover';
  slides[0].layout = 'cover';
  return {
    title: cleanText(value?.title, 160) || payload.topic,
    subtitle: cleanText(value?.subtitle, 220)
      || [payload.subject, payload.grade].filter(Boolean).join(' · '),
    learningGoal: cleanText(value?.learningGoal, 240),
    imagePrompt: cleanText(value?.imagePrompt, 600),
    coverImage: '',
    slides,
  };
}

function isPreciseVisualSubject(payload) {
  const value = `${payload.subject} ${payload.topic}`.toLowerCase();
  return /матем|алгеб|геометр|физик|статист|информ|программ/.test(value);
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function imageDataUri(result) {
  if (!result) return '';
  const image = result.image ?? result.data ?? result;
  if (typeof image === 'string') {
    return image.startsWith('data:') ? image : `data:image/png;base64,${image}`;
  }
  if (image instanceof ArrayBuffer) {
    return `data:image/png;base64,${bytesToBase64(new Uint8Array(image))}`;
  }
  if (ArrayBuffer.isView(image)) {
    return `data:image/png;base64,${bytesToBase64(new Uint8Array(image.buffer, image.byteOffset, image.byteLength))}`;
  }
  if (Array.isArray(image)) {
    return `data:image/png;base64,${bytesToBase64(Uint8Array.from(image))}`;
  }
  return '';
}

async function generatePresentation(env, payload) {
  const request = {
    messages: [
      {
        role: 'system',
        content: 'Ты опытный методист, предметный учитель и редактор презентаций. Создавай точный учебный материал. Отвечай только валидным JSON на русском языке.',
      },
      { role: 'user', content: buildPrompt(payload) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.25,
    max_tokens: 5200,
  };

  const primaryModel = env.AI_MODEL || DEFAULT_MODEL;
  try {
    return {
      model: primaryModel,
      value: parseModelJson(await env.AI.run(primaryModel, request)),
    };
  } catch (primaryError) {
    console.warn('Primary text model failed, using fallback', primaryError);
    return {
      model: FALLBACK_MODEL,
      value: parseModelJson(await env.AI.run(FALLBACK_MODEL, request)),
    };
  }
}

async function addCoverIllustration(env, presentation, payload) {
  if (!payload.includeIllustration || isPreciseVisualSubject(payload)) return false;
  const prompt = presentation.imagePrompt
    || `Elegant educational editorial illustration about ${payload.topic}, ${payload.subject}, age appropriate for ${payload.grade}, clean composition, modern soft colors, no text, no letters, no watermark, 16:9`;
  try {
    const result = await env.AI.run(env.IMAGE_MODEL || DEFAULT_IMAGE_MODEL, {
      prompt: `${prompt}. Professional educational illustration, accurate subject matter, clean background, no text, no letters, no watermark.`,
      steps: 4,
    });
    presentation.coverImage = imageDataUri(result);
    return Boolean(presentation.coverImage);
  } catch (error) {
    console.warn('Cover illustration skipped', error);
    return false;
  }
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
        fallbackModel: FALLBACK_MODEL,
        imageModel: env.IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
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

      const generated = await generatePresentation(env, payload);
      const presentation = normalizePresentation(generated.value, payload);
      const illustrationGenerated = await addCoverIllustration(env, presentation, payload);

      return reply(request, env, {
        ok: true,
        title: presentation.title,
        presentation,
        model: generated.model,
        illustrationGenerated,
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
