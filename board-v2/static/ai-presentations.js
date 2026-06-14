(function () {
  const WIDTH = 1600;
  const HEIGHT = 900;

  const themes = {
    universal: {
      key: 'universal',
      accent: '#3A97D8',
      accentDark: '#216B9F',
      secondary: '#8B6FD6',
      soft: '#EAF5FC',
      softAlt: '#F2EEFC',
      ink: '#203247',
      visual: 'cards',
    },
    math: {
      key: 'math',
      accent: '#4776E6',
      accentDark: '#2B4FA8',
      secondary: '#8E54E9',
      soft: '#EAF0FF',
      softAlt: '#F2EBFF',
      ink: '#1F3157',
      visual: 'math',
    },
    languages: {
      key: 'languages',
      accent: '#EB6A75',
      accentDark: '#B84457',
      secondary: '#8B6FD6',
      soft: '#FFF0F2',
      softAlt: '#F4EEFF',
      ink: '#492C3B',
      visual: 'language',
    },
    geography: {
      key: 'geography',
      accent: '#22A88A',
      accentDark: '#11735F',
      secondary: '#3A97D8',
      soft: '#E7F8F3',
      softAlt: '#EAF5FC',
      ink: '#183D3A',
      visual: 'globe',
    },
    science: {
      key: 'science',
      accent: '#00A7A5',
      accentDark: '#087170',
      secondary: '#F29E4C',
      soft: '#E4F8F7',
      softAlt: '#FFF3E5',
      ink: '#173C46',
      visual: 'science',
    },
    history: {
      key: 'history',
      accent: '#C4873A',
      accentDark: '#895A20',
      secondary: '#9D6B53',
      soft: '#FAF1E4',
      softAlt: '#F4EAE4',
      ink: '#463528',
      visual: 'timeline',
    },
    informatics: {
      key: 'informatics',
      accent: '#2F91D5',
      accentDark: '#185E91',
      secondary: '#27B69A',
      soft: '#E8F5FC',
      softAlt: '#E8F8F4',
      ink: '#173549',
      visual: 'code',
    },
  };

  function detectTheme(subject, requested) {
    if (requested && requested !== 'auto' && themes[requested]) return themes[requested];
    const value = String(subject || '').toLowerCase();
    if (/матем|алгеб|геометр|физик|статист/.test(value)) return themes.math;
    if (/англ|русск|язык|литерат|немец|франц|испан/.test(value)) return themes.languages;
    if (/географ|окружающ|эколог/.test(value)) return themes.geography;
    if (/биолог|хими|естеств|медиц/.test(value)) return themes.science;
    if (/истор|обществ|право|эконом/.test(value)) return themes.history;
    if (/информ|программ|робот|компьют/.test(value)) return themes.informatics;
    return themes.universal;
  }

  function roundedPath(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function fillRound(context, x, y, width, height, radius, fill, stroke = null, lineWidth = 1) {
    roundedPath(context, x, y, width, height, radius);
    context.fillStyle = fill;
    context.fill();
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = lineWidth;
      context.stroke();
    }
  }

  function wrapLines(context, text, maxWidth, maxLines = 5) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
        if (lines.length === maxLines) break;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (words.length && lines.length === maxLines) {
      let last = lines[maxLines - 1];
      while (last.length > 2 && context.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last.replace(/[\s,.;:!?-]+$/, '')}…`;
    }
    return lines;
  }

  function drawLines(context, lines, x, y, lineHeight, color) {
    context.fillStyle = color;
    lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
    return y + lines.length * lineHeight;
  }

  function drawBackground(context, theme) {
    const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, '#F7FBFE');
    gradient.addColorStop(0.58, '#FFFFFF');
    gradient.addColorStop(1, theme.soft);
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    context.globalAlpha = 0.55;
    context.fillStyle = theme.softAlt;
    context.beginPath();
    context.arc(1510, 40, 290, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = theme.soft;
    context.beginPath();
    context.arc(40, 880, 250, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }

  function drawFooter(context, index, total, theme) {
    context.font = '700 21px Segoe UI, Arial, sans-serif';
    context.fillStyle = '#71879B';
    context.textAlign = 'left';
    context.fillText('repiq.ru', 92, 838);
    context.textAlign = 'center';
    context.fillStyle = theme.accent;
    context.fillText(`${index + 1} / ${total}`, WIDTH / 2, 838);
    context.textAlign = 'right';
    context.fillStyle = '#71879B';
    context.fillText('repiqboard · AI-автоматизация', 1508, 838);
    context.textAlign = 'left';
  }

  function drawBrandPill(context, theme, label) {
    fillRound(context, 92, 76, 310, 48, 24, '#FFFFFF', `${theme.accent}33`, 2);
    context.fillStyle = theme.accent;
    context.beginPath();
    context.arc(122, 100, 10, 0, Math.PI * 2);
    context.fill();
    context.font = '800 20px Segoe UI, Arial, sans-serif';
    context.fillStyle = theme.ink;
    context.fillText(label || 'RepIQ Board', 145, 107);
  }

  function drawMath(context, theme, x, y, size) {
    fillRound(context, x, y, size, size, 42, '#FFFFFFCC', `${theme.accent}30`, 3);
    context.save();
    context.translate(x + size * 0.12, y + size * 0.12);
    const area = size * 0.76;
    context.strokeStyle = `${theme.accent}25`;
    context.lineWidth = 2;
    for (let i = 0; i <= 6; i += 1) {
      const p = area * i / 6;
      context.beginPath(); context.moveTo(p, 0); context.lineTo(p, area); context.stroke();
      context.beginPath(); context.moveTo(0, p); context.lineTo(area, p); context.stroke();
    }
    context.strokeStyle = theme.accentDark;
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(0, area * 0.72);
    context.bezierCurveTo(area * 0.24, area * 0.86, area * 0.45, area * 0.34, area * 0.72, area * 0.46);
    context.bezierCurveTo(area * 0.84, area * 0.5, area * 0.9, area * 0.22, area, area * 0.18);
    context.stroke();
    context.fillStyle = theme.secondary;
    context.font = `900 ${Math.round(size * 0.12)}px Georgia, serif`;
    context.fillText('x² + y²', area * 0.08, area * 0.22);
    context.restore();
  }

  function drawLanguage(context, theme, x, y, size) {
    fillRound(context, x, y, size, size, 42, '#FFFFFFCC', `${theme.accent}30`, 3);
    fillRound(context, x + size * 0.12, y + size * 0.18, size * 0.58, size * 0.27, 28, theme.soft, null);
    fillRound(context, x + size * 0.3, y + size * 0.53, size * 0.57, size * 0.25, 28, theme.softAlt, null);
    context.fillStyle = theme.accentDark;
    context.font = `900 ${Math.round(size * 0.105)}px Segoe UI, Arial`;
    context.fillText('Hello!', x + size * 0.19, y + size * 0.36);
    context.fillStyle = theme.secondary;
    context.fillText('Let’s speak', x + size * 0.36, y + size * 0.69);
    context.fillStyle = theme.accent;
    context.beginPath();
    context.moveTo(x + size * 0.2, y + size * 0.45);
    context.lineTo(x + size * 0.3, y + size * 0.45);
    context.lineTo(x + size * 0.22, y + size * 0.52);
    context.fill();
  }

  function drawGlobe(context, theme, x, y, size) {
    fillRound(context, x, y, size, size, 42, '#FFFFFFCC', `${theme.accent}30`, 3);
    const cx = x + size / 2;
    const cy = y + size * 0.48;
    const r = size * 0.29;
    context.strokeStyle = theme.accentDark;
    context.lineWidth = 5;
    context.beginPath(); context.arc(cx, cy, r, 0, Math.PI * 2); context.stroke();
    context.lineWidth = 3;
    context.beginPath(); context.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2); context.stroke();
    context.beginPath(); context.ellipse(cx, cy, r, r * 0.43, 0, 0, Math.PI * 2); context.stroke();
    context.fillStyle = theme.secondary;
    context.beginPath(); context.arc(cx + r * 0.62, cy - r * 0.55, r * 0.16, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.moveTo(cx + r * 0.52, cy - r * 0.48); context.lineTo(cx + r * 0.62, cy - r * 0.15); context.lineTo(cx + r * 0.73, cy - r * 0.48); context.fill();
  }

  function drawScience(context, theme, x, y, size) {
    fillRound(context, x, y, size, size, 42, '#FFFFFFCC', `${theme.accent}30`, 3);
    const cx = x + size * 0.5;
    const cy = y + size * 0.38;
    context.strokeStyle = theme.accentDark;
    context.lineWidth = 4;
    [0, Math.PI / 3, -Math.PI / 3].forEach(angle => {
      context.save(); context.translate(cx, cy); context.rotate(angle);
      context.beginPath(); context.ellipse(0, 0, size * 0.25, size * 0.09, 0, 0, Math.PI * 2); context.stroke();
      context.restore();
    });
    context.fillStyle = theme.secondary;
    context.beginPath(); context.arc(cx, cy, size * 0.045, 0, Math.PI * 2); context.fill();
    context.strokeStyle = theme.accentDark;
    context.lineWidth = 6;
    context.beginPath(); context.moveTo(cx - size * 0.07, y + size * 0.58); context.lineTo(cx - size * 0.07, y + size * 0.7); context.lineTo(cx - size * 0.2, y + size * 0.86); context.lineTo(cx + size * 0.2, y + size * 0.86); context.lineTo(cx + size * 0.07, y + size * 0.7); context.lineTo(cx + size * 0.07, y + size * 0.58); context.stroke();
    context.fillStyle = `${theme.secondary}88`;
    context.beginPath(); context.moveTo(cx - size * 0.14, y + size * 0.79); context.lineTo(cx + size * 0.14, y + size * 0.79); context.lineTo(cx + size * 0.2, y + size * 0.86); context.lineTo(cx - size * 0.2, y + size * 0.86); context.fill();
  }

  function drawTimeline(context, theme, x, y, size) {
    fillRound(context, x, y, size, size, 42, '#FFFFFFCC', `${theme.accent}30`, 3);
    const left = x + size * 0.16;
    const right = x + size * 0.84;
    const cy = y + size * 0.52;
    context.strokeStyle = theme.accentDark;
    context.lineWidth = 7;
    context.beginPath(); context.moveTo(left, cy); context.lineTo(right, cy); context.stroke();
    ['I', 'II', 'III', 'IV'].forEach((label, index) => {
      const px = left + (right - left) * index / 3;
      context.fillStyle = index % 2 ? theme.secondary : theme.accent;
      context.beginPath(); context.arc(px, cy, size * 0.045, 0, Math.PI * 2); context.fill();
      context.font = `800 ${Math.round(size * 0.07)}px Segoe UI, Arial`;
      context.fillText(label, px - size * 0.035, cy + (index % 2 ? size * 0.17 : -size * 0.12));
    });
  }

  function drawCode(context, theme, x, y, size) {
    fillRound(context, x, y, size, size, 42, '#FFFFFFCC', `${theme.accent}30`, 3);
    context.strokeStyle = theme.accentDark;
    context.lineWidth = 12;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(x + size * 0.34, y + size * 0.28);
    context.lineTo(x + size * 0.18, y + size * 0.5);
    context.lineTo(x + size * 0.34, y + size * 0.72);
    context.moveTo(x + size * 0.66, y + size * 0.28);
    context.lineTo(x + size * 0.82, y + size * 0.5);
    context.lineTo(x + size * 0.66, y + size * 0.72);
    context.moveTo(x + size * 0.57, y + size * 0.2);
    context.lineTo(x + size * 0.43, y + size * 0.8);
    context.stroke();
    context.fillStyle = theme.secondary;
    [[0.22, 0.18], [0.78, 0.82], [0.8, 0.18]].forEach(([px, py]) => {
      context.beginPath(); context.arc(x + size * px, y + size * py, size * 0.035, 0, Math.PI * 2); context.fill();
    });
  }

  function drawCards(context, theme, x, y, size) {
    fillRound(context, x, y, size, size, 42, '#FFFFFFCC', `${theme.accent}30`, 3);
    for (let index = 0; index < 3; index += 1) {
      const offset = index * size * 0.12;
      fillRound(context, x + size * 0.15 + offset, y + size * 0.2 + offset, size * 0.52, size * 0.42, 28, index === 1 ? theme.softAlt : theme.soft, `${theme.accent}55`, 3);
      context.fillStyle = index === 1 ? theme.secondary : theme.accent;
      context.beginPath(); context.arc(x + size * 0.23 + offset, y + size * 0.29 + offset, size * 0.035, 0, Math.PI * 2); context.fill();
      context.fillRect(x + size * 0.3 + offset, y + size * 0.27 + offset, size * 0.25, size * 0.035);
      context.fillRect(x + size * 0.23 + offset, y + size * 0.38 + offset, size * 0.32, size * 0.025);
    }
  }

  function drawVisual(context, theme, x, y, size) {
    const drawers = {
      math: drawMath,
      language: drawLanguage,
      globe: drawGlobe,
      science: drawScience,
      timeline: drawTimeline,
      code: drawCode,
      cards: drawCards,
    };
    (drawers[theme.visual] || drawCards)(context, theme, x, y, size);
  }

  function drawCover(context, slide, presentation, payload, theme) {
    drawBrandPill(context, theme, payload.subject || 'Учебная презентация');
    context.font = '900 70px Segoe UI, Arial, sans-serif';
    const title = wrapLines(context, slide.title || presentation.title || payload.topic, 870, 4);
    let y = drawLines(context, title, 100, 230, 80, theme.ink);
    const subtitle = slide.subtitle || presentation.subtitle || [payload.grade, `${payload.duration} минут`].filter(Boolean).join(' · ');
    context.font = '650 31px Segoe UI, Arial, sans-serif';
    y = drawLines(context, wrapLines(context, subtitle, 820, 3), 104, y + 24, 43, '#61778C');
    const meta = [payload.grade, `${payload.duration} минут`, `${payload.slidesCount} слайдов`].filter(Boolean).join('  ·  ');
    fillRound(context, 102, Math.min(680, y + 42), 650, 58, 29, theme.soft, null);
    context.font = '800 22px Segoe UI, Arial, sans-serif';
    context.fillStyle = theme.accentDark;
    context.fillText(meta, 132, Math.min(716, y + 78));
    drawVisual(context, theme, 1070, 190, 430);
  }

  function drawContent(context, slide, payload, theme) {
    drawBrandPill(context, theme, payload.subject || 'RepIQ Board');
    fillRound(context, 72, 142, 960, 620, 42, '#FFFFFFE8', `${theme.accent}25`, 2);
    context.font = '900 51px Segoe UI, Arial, sans-serif';
    let y = drawLines(context, wrapLines(context, slide.title, 820, 2), 116, 218, 60, theme.ink);
    if (slide.subtitle) {
      context.font = '650 25px Segoe UI, Arial, sans-serif';
      y = drawLines(context, wrapLines(context, slide.subtitle, 800, 2), 118, y + 10, 35, '#71879B');
    }

    context.font = '700 29px Segoe UI, Arial, sans-serif';
    const bullets = Array.isArray(slide.bullets) ? slide.bullets.slice(0, 5) : [];
    y += 32;
    for (const bullet of bullets) {
      context.fillStyle = theme.accent;
      context.beginPath(); context.arc(132, y - 9, 8, 0, Math.PI * 2); context.fill();
      context.fillStyle = theme.ink;
      const lines = wrapLines(context, bullet, 790, 2);
      drawLines(context, lines, 162, y, 39, theme.ink);
      y += lines.length * 39 + 17;
      if (y > 625) break;
    }

    if (slide.callout) {
      const calloutY = 650;
      fillRound(context, 112, calloutY, 830, 82, 24, theme.softAlt, null);
      context.font = '800 24px Segoe UI, Arial, sans-serif';
      drawLines(context, wrapLines(context, slide.callout, 760, 2), 142, calloutY + 34, 31, theme.accentDark);
    }
    drawVisual(context, theme, 1090, 190, 410);
  }

  function buildSlides(presentation, payload) {
    const theme = detectTheme(payload.subject, payload.template);
    const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
    return slides.map((slide, index) => {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const context = canvas.getContext('2d');
      drawBackground(context, theme);
      if (index === 0 || slide.kind === 'cover') {
        drawCover(context, slide, presentation, payload, theme);
      } else {
        drawContent(context, slide, payload, theme);
      }
      drawFooter(context, index, slides.length, theme);
      return canvas;
    });
  }

  window.RepIQPresentations = {
    buildSlides,
    detectTheme: (subject, requested) => detectTheme(subject, requested).key,
  };
}());
