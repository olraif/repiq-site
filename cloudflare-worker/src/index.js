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
    slidesCount: Math.max(10, Math.min(16, Number(input.slidesCount) || 12)),
    duration: Math.max(10, Math.min(180, Number(input.duration) || 60)),
    includeTheory: input.includeTheory !== false,
    includeExamples: input.includeExamples !== false,
    includePractice: input.includePractice !== false,
    includeHomework: true,
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
  blocks.push('домашнее задание последним слайдом');
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
      "kind": "cover|warmup|theory|example|collaboration|differentiation|game|practice|summary|homework|answers",
      "layout": "cover|split|formula|steps|cards|comparison|levels|game|practice|summary",
      "title": "Заголовок",
      "subtitle": "Необязательная строка",
      "bullets": ["Конкретный короткий пункт"],
      "formula": "Формула обычными Unicode-символами без LaTeX",
      "steps": ["Шаг 1", "Шаг 2"],
      "question": "Вопрос или задание ученику",
      "answer": "Короткий проверенный ответ",
      "callout": "Ключевая мысль или типичная ошибка",
      "teacherNote": "Короткая заметка учителю",
      "activityMode": "учитель|пары|группы|самостоятельно|игра",
      "timeMinutes": 5,
      "points": 3,
      "levels": [
        {
          "label": "База",
          "audience": "Тем, кому нужна опора",
          "tasks": ["Задание 1", "Задание 2", "Задание 3", "Задание 4", "Задание 5"]
        }
      ],
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
- Ровно ${payload.slidesCount} слайдов.
- Используй единую методическую последовательность:
  1. Обложка и тема.
  2. Цель урока, проблемный вопрос или короткая разминка.
  3. Объяснение нового материала простым языком с опорой на схему, правило или формулу.
  4. Разобранный пример базового уровня с подробными шагами.
  5. Разобранный пример стандартного уровня.
  6. Более сложный пример или типичная ошибка с объяснением.
  7. Парная или групповая работа с конкретной инструкцией и временем.
  8. Самостоятельная дифференцированная работа: три уровня «База», «Стандарт», «Вызов». Для уровня «База» дай 5 коротких заданий с опорой; для «Стандарта» 3–4 задания; для «Вызова» 1–2 усложнённых задания.
  9. Игровая механика: баллы, мини-квест, выбор карточки, найди ошибку, собери цепочку или командный раунд. Она должна проверять тему, а не быть просто развлечением.
  10. Предпоследний слайд — kind summary, layout summary, заголовок «Конспект урока: главное». На нём правило, алгоритм, типичные ошибки и короткая самопроверка.
  11. Последний слайд — kind homework, заголовок «Домашнее задание». Дай обязательную часть и необязательный уровень «Вызов». Не ставь ответы на последний слайд.
- Если слайдов больше 11, добавляй дополнительные объяснения и разобранные примеры между пунктами 3 и 7. Если слайдов 10, объедини два соседних примера, но сохрани все формы работы и последние два слайда.
- Чередуй макеты. Не делай все слайды одинаковыми.
- На слайде одна учебная мысль: до 4 пунктов или до 4 шагов.
- Объяснение должно быть живым: сначала интуитивная идея, затем точное правило, затем применение.
- Примеры должны отличаться по сложности и содержать полный разбор, а не только ответ.
- Для collaboration укажи activityMode «пары» или «группы», конкретную инструкцию и 4–8 минут.
- Для differentiation обязательно верни три объекта levels: «База», «Стандарт», «Вызов».
- Каждое задание запиши полностью. Для математики обязательно указывай конкретное уравнение, выражение, числа или условие задачи. Нельзя писать «выполните задание по теме», «решите по образцу», «примените правило» или другие заготовки без самого задания.
- В основной части урока должно быть не менее 15 конкретных заданий: 2 для разминки или парной работы, 5 уровня «База», 4 уровня «Стандарт», 2 уровня «Вызов» и не менее 2 заданий игрового раунда. Домашнее задание считается отдельно.
- Разобранные примеры и самостоятельные задания не должны повторяться. Все математические ответы предварительно проверь.
- Для game укажи activityMode «игра», points и понятное условие получения баллов.
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
  if (kind === 'differentiation' || kind === 'homework') return 'levels';
  if (kind === 'game') return 'game';
  if (kind === 'practice') return 'practice';
  if (kind === 'summary' || kind === 'answers') return 'summary';
  if (slide?.formula) return 'formula';
  if (Array.isArray(slide?.steps) && slide.steps.length > 1) return 'steps';
  return 'split';
}

function normalizeSlide(slide, index) {
  const kinds = new Set([
    'cover', 'warmup', 'theory', 'example', 'collaboration', 'differentiation',
    'game', 'practice', 'summary', 'homework', 'answers',
  ]);
  const layouts = new Set([
    'cover', 'split', 'formula', 'steps', 'cards', 'comparison', 'levels',
    'game', 'practice', 'summary',
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
    activityMode: cleanText(slide?.activityMode, 40),
    timeMinutes: Math.max(0, Math.min(30, Number(slide?.timeMinutes) || 0)),
    points: Math.max(0, Math.min(20, Number(slide?.points) || 0)),
    levels: normalizeLevels(slide?.levels),
    visual: normalizeVisual(slide?.visual, index === 0 ? 'subject' : 'none'),
  };
}

function normalizeLevels(value) {
  return Array.isArray(value)
    ? value.slice(0, 3).map((level, index) => ({
      label: cleanText(level?.label, 40) || ['База', 'Стандарт', 'Вызов'][index],
      audience: cleanText(level?.audience, 100),
      tasks: cleanList(level?.tasks, index === 0 ? 5 : 4, 150),
    }))
    : [];
}

function isGenericTask(value) {
  const text = cleanText(value, 220).toLowerCase();
  return !text || /по теме|по образцу|с подсказк|без подсказк|примените правило|выберите способ|похожее задание|усложн[её]нное задание|проверьте решение|задание\s*\d+\s*:?$/.test(text);
}

function mathLevelTasks(payload, homework = false) {
  const topic = `${payload.topic} ${payload.subject}`.toLowerCase();
  if (/квадратн|дискриминант/.test(topic)) {
    return [
      [
        'Решите: x² - 5x + 6 = 0.',
        'Решите: x² + 7x + 12 = 0.',
        'Решите: x² - 9 = 0.',
        'Решите: 2x² - 8x = 0.',
        homework ? 'Решите и выполните проверку: x² - 8x + 15 = 0.' : 'Найдите сумму и произведение корней: x² - 6x + 8 = 0.',
      ],
      [
        'Решите через дискриминант: 2x² - 7x + 3 = 0.',
        'Решите: 3x² + x - 2 = 0.',
        'Приведите к стандартному виду и решите: x(x - 5) = 14.',
        homework ? 'Составьте квадратное уравнение с корнями 3 и -4.' : 'Найдите ошибку: для x² + 2x - 3 = 0 ученик получил D = 8.',
      ],
      [
        'При каких значениях k уравнение x² - 6x + k = 0 имеет один корень?',
        'Стороны прямоугольника отличаются на 3 см, площадь равна 40 см². Найдите стороны.',
      ],
    ];
  }
  if (/прямоугольн.*треуг|теорем.*пифагор/.test(topic)) {
    return [
      ['Найдите гипотенузу при катетах 3 см и 4 см.', 'Найдите гипотенузу при катетах 6 см и 8 см.', 'Найдите катет, если гипотенуза 13 см, другой катет 5 см.', 'Определите, прямоугольный ли треугольник со сторонами 5, 12 и 13.', 'Найдите площадь прямоугольного треугольника с катетами 7 см и 10 см.'],
      ['Найдите катет, если гипотенуза 17 см, другой катет 8 см.', 'Диагональ прямоугольника 15 см, одна сторона 9 см. Найдите вторую сторону.', 'Лестница длиной 10 м стоит в 6 м от стены. На какой высоте её верхний конец?', 'Сравните диагонали прямоугольников 6 × 8 и 5 × 12.'],
      ['Найдите высоту равнобедренного треугольника со сторонами 13, 13 и 10 см.', 'Составьте задачу, которая решается уравнением x² + 12² = 20², и решите её.'],
    ];
  }
  return [
    ['Выполните вычисление: 18 - 3 × 4.', 'Упростите: 3x + 5x - 7.', 'Найдите x: 4x - 9 = 19.', 'Подставьте x = -2 в выражение x² + 3x - 1.', 'Сравните значения выражений 2(a + 3) и 2a + 6 при a = 5.'],
    ['Упростите: 4(2x - 3) - 5x.', 'Решите: 3(2x + 1) = 21.', 'Найдите ошибку в преобразовании: 2(x + 4) = 2x + 4.', 'Составьте выражение для числа, которое на 7 больше удвоенного x.'],
    ['Решите: (x - 2)(x + 3) = 0.', 'Составьте и решите уравнение: после увеличения числа в 3 раза и вычитания 5 получили 16.'],
  ];
}

function defaultLevels(payload, homework = false) {
  const isMath = /матем|алгеб|геометр|физик|уравнен|функц|треуг/.test(`${payload.subject} ${payload.topic}`.toLowerCase());
  const concrete = isMath ? mathLevelTasks(payload, homework) : null;
  return [
    {
      label: 'База',
      audience: 'Тем, кому нужна опора',
      tasks: concrete?.[0] || [
        `Назовите три ключевых понятия темы «${payload.topic}».`,
        `Приведите конкретный пример по теме «${payload.topic}».`,
        `Объясните один изученный факт по теме «${payload.topic}» своими словами.`,
        `Сравните два объекта или случая из темы «${payload.topic}».`,
        `Сформулируйте вывод по теме «${payload.topic}» в двух предложениях.`,
      ],
    },
    {
      label: 'Стандарт',
      audience: 'Основной уровень',
      tasks: concrete?.[1] || [
        `Объясните причину и следствие одного явления из темы «${payload.topic}».`,
        `Составьте таблицу из трёх признаков по теме «${payload.topic}».`,
        `Найдите неточность в утверждении по теме «${payload.topic}» и исправьте её.`,
        `Ответьте на проблемный вопрос урока, используя два аргумента.`,
      ],
    },
    {
      label: 'Вызов',
      audience: 'Для готовых идти дальше',
      tasks: concrete?.[2] || [
        `Предложите практическую ситуацию, где применяется тема «${payload.topic}», и объясните решение.`,
        `Сформулируйте сложный вопрос по теме «${payload.topic}» и дайте развёрнутый ответ.`,
      ],
    },
  ];
}

function ensureConcreteLevels(levels, payload, homework = false) {
  const fallback = defaultLevels(payload, homework);
  return fallback.map((fallbackLevel, index) => {
    const source = levels[index] || {};
    const expected = index === 0 ? 5 : index === 1 ? 4 : 2;
    const tasks = cleanList(source.tasks, expected, 180);
    const concreteTasks = tasks.length >= expected && tasks.every(task => !isGenericTask(task))
      ? tasks
      : fallbackLevel.tasks;
    return {
      label: cleanText(source.label, 40) || fallbackLevel.label,
      audience: cleanText(source.audience, 100) || fallbackLevel.audience,
      tasks: concreteTasks,
    };
  });
}

function ensureMethodicalStructure(slides, payload) {
  const lastIndex = slides.length - 1;
  const summaryIndex = lastIndex - 1;
  const gameIndex = lastIndex - 2;
  const differentiationIndex = lastIndex - 3;
  const collaborationIndex = lastIndex - 4;

  slides[0].kind = 'cover';
  slides[0].layout = 'cover';

  if (slides[1]) {
    slides[1].kind = 'warmup';
    slides[1].layout = slides[1].layout === 'cover' ? 'cards' : slides[1].layout;
    slides[1].title = slides[1].title || 'Разминка и цель урока';
  }
  if (slides[2]) {
    slides[2].kind = 'theory';
    slides[2].title = slides[2].title || 'Объясняем новую идею';
  }
  for (let index = 3; index < collaborationIndex; index += 1) {
    slides[index].kind = 'example';
    if (!['formula', 'steps', 'comparison'].includes(slides[index].layout)) {
      slides[index].layout = index % 2 ? 'steps' : 'split';
    }
  }

  if (collaborationIndex > 1) {
    const slide = slides[collaborationIndex];
    slide.kind = 'collaboration';
    slide.layout = 'cards';
    slide.title = slide.title || 'Работаем вместе';
    slide.activityMode = /пар|груп/i.test(slide.activityMode) ? slide.activityMode : 'пары или группы';
    slide.timeMinutes = slide.timeMinutes || 6;
    slide.question = isGenericTask(slide.question)
      ? `В парах решите два задания с этого урока разными способами, сравните решения и подготовьте объяснение одного выбранного способа классу.`
      : slide.question;
  }

  if (differentiationIndex > collaborationIndex) {
    const slide = slides[differentiationIndex];
    slide.kind = 'differentiation';
    slide.layout = 'levels';
    slide.title = 'Самостоятельная работа: выбери уровень';
    slide.activityMode = 'самостоятельно';
    slide.timeMinutes = slide.timeMinutes || 10;
    slide.levels = ensureConcreteLevels(slide.levels, payload, false);
  }

  if (gameIndex > differentiationIndex) {
    const slide = slides[gameIndex];
    slide.kind = 'game';
    slide.layout = 'game';
    slide.title = slide.title || 'Игровой раунд';
    slide.activityMode = 'игра';
    slide.timeMinutes = slide.timeMinutes || 6;
    slide.points = slide.points || 3;
    slide.question = isGenericTask(slide.question)
      ? `Команды получают по два задания урока: найдите ошибку в предложенном решении, исправьте её и объясните проверку ответа.`
      : slide.question;
    if (!slide.bullets.length) {
      slide.bullets = ['1 балл — верный ответ', '1 балл — объяснение', '1 балл — проверка другой команды'];
    }
  }

  const summary = slides[summaryIndex];
  summary.kind = 'summary';
  summary.layout = 'summary';
  summary.title = 'Конспект урока: главное';
  if (!summary.bullets.length) {
    summary.bullets = [
      `Главная идея темы «${payload.topic}»`,
      'Алгоритм применения по шагам',
      'Типичная ошибка и способ проверки',
      'Что я теперь умею объяснить',
    ];
  }
  summary.callout = summary.callout || 'Самопроверка: могу ли я объяснить правило и применить его без подсказки?';

  const homework = slides[lastIndex];
  homework.kind = 'homework';
  homework.layout = 'levels';
  homework.title = 'Домашнее задание';
  homework.activityMode = 'самостоятельно';
  homework.timeMinutes = 0;
  homework.levels = ensureConcreteLevels(homework.levels, payload, true);
  homework.callout = homework.callout || 'Обязательная часть — «База» или «Стандарт». «Вызов» выполняется по желанию.';
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
  ensureMethodicalStructure(slides, payload);
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
    max_tokens: 6500,
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
        error: 'AI-модель временно не ответила. Попробуйте ещё раз через минуту.',
      }, 503);
    }
  },
};
