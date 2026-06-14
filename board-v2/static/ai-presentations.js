(function () {
  const WIDTH = 1600;
  const HEIGHT = 900;

  const themes = {
    universal: {
      key: 'universal', accent: '#168ED1', accentDark: '#145F96', secondary: '#7C4DFF',
      soft: '#DDF3FF', softAlt: '#EEE7FF', ink: '#17334F', visual: 'subject',
    },
    math: {
      key: 'math', accent: '#356CF6', accentDark: '#244AA8', secondary: '#A24BE8',
      soft: '#E3EAFF', softAlt: '#F1E2FF', ink: '#182E58', visual: 'quadratic-graph',
    },
    languages: {
      key: 'languages', accent: '#F0526D', accentDark: '#B52F4A', secondary: '#9B5DE5',
      soft: '#FFE4EA', softAlt: '#F0E5FF', ink: '#4D2637', visual: 'vocabulary',
    },
    geography: {
      key: 'geography', accent: '#00A884', accentDark: '#08705E', secondary: '#2F86EB',
      soft: '#DDF8EF', softAlt: '#E2F1FF', ink: '#123E39', visual: 'map',
    },
    science: {
      key: 'science', accent: '#00A6A6', accentDark: '#08706F', secondary: '#FF9F43',
      soft: '#DDF8F7', softAlt: '#FFEBD4', ink: '#133D47', visual: 'atom',
    },
    history: {
      key: 'history', accent: '#D98524', accentDark: '#8D551B', secondary: '#A55D43',
      soft: '#FFF0D9', softAlt: '#F6E2D8', ink: '#493225', visual: 'timeline',
    },
    informatics: {
      key: 'informatics', accent: '#168FD8', accentDark: '#155E91', secondary: '#18B891',
      soft: '#DDF2FF', softAlt: '#DDF8EF', ink: '#12364D', visual: 'code',
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

  function prettyText(value) {
    return String(value || '')
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1⁄$2')
      .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
      .replace(/\\(?:cdot|times)/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\leq?/g, '≤')
      .replace(/\\geq?/g, '≥')
      .replace(/\^\{?2\}?/g, '²')
      .replace(/\^\{?3\}?/g, '³')
      .replace(/_\{?1\}?/g, '₁')
      .replace(/_\{?2\}?/g, '₂')
      .replace(/[{}$]/g, '')
      .replace(/\\/g, '')
      .trim();
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

  function wrapLines(context, value, maxWidth, maxLines = 5) {
    const text = prettyText(value);
    const words = text.split(/\s+/).filter(Boolean);
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

  function drawBackground(context, theme, variant = 0) {
    const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, variant % 2 ? theme.soft : '#F7FBFE');
    gradient.addColorStop(0.48, '#FFFFFF');
    gradient.addColorStop(1, variant % 2 ? theme.softAlt : theme.soft);
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    context.globalAlpha = 0.72;
    context.fillStyle = theme.softAlt;
    context.beginPath(); context.arc(1530, 30, 290, 0, Math.PI * 2); context.fill();
    context.fillStyle = theme.soft;
    context.beginPath(); context.arc(20, 900, 260, 0, Math.PI * 2); context.fill();
    context.globalAlpha = 1;

    const ribbon = context.createLinearGradient(0, 0, WIDTH, 0);
    ribbon.addColorStop(0, theme.accent);
    ribbon.addColorStop(0.58, theme.secondary);
    ribbon.addColorStop(1, theme.accent);
    context.fillStyle = ribbon;
    context.fillRect(0, 0, WIDTH, 14);

    context.globalAlpha = 0.28;
    [0, 1, 2].forEach(index => {
      context.fillStyle = index % 2 ? theme.secondary : theme.accent;
      context.beginPath();
      context.arc(1370 + index * 58, 132 + index * 34, 12 - index * 2, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
  }

  function drawFooter(context, index, total, theme) {
    context.font = '800 19px Segoe UI, Arial, sans-serif';
    context.textAlign = 'left';
    fillRound(context, 74, 816, 300, 44, 22, '#FFFFFFD9', `${theme.accent}30`, 1);
    context.fillStyle = theme.accent;
    context.beginPath(); context.arc(100, 838, 8, 0, Math.PI * 2); context.fill();
    context.fillStyle = theme.ink;
    context.fillText('RepIQ Board · repiq.ru', 120, 845);
    context.textAlign = 'center';
    fillRound(context, 748, 818, 104, 42, 21, '#FFFFFFCC', `${theme.accent}25`, 1);
    context.fillStyle = theme.accentDark;
    context.fillText(`${index + 1} / ${total}`, WIDTH / 2, 846);
    context.textAlign = 'left';
  }

  function drawBrandPill(context, theme, label) {
    const text = prettyText(label || 'Учебная презентация');
    context.font = '800 19px Segoe UI, Arial, sans-serif';
    const width = Math.min(460, Math.max(260, context.measureText(text).width + 80));
    fillRound(context, 88, 58, width, 48, 24, '#FFFFFFE8', `${theme.accent}35`, 2);
    context.fillStyle = theme.accent;
    context.beginPath(); context.arc(118, 82, 9, 0, Math.PI * 2); context.fill();
    context.fillStyle = theme.ink;
    context.fillText(text, 140, 89);
  }

  function drawSlideTitle(context, slide, theme, maxWidth = 1370) {
    context.font = '900 49px Segoe UI, Arial, sans-serif';
    const lines = wrapLines(context, slide.title, maxWidth, 2);
    let y = drawLines(context, lines, 90, 172, 58, theme.ink);
    if (slide.subtitle) {
      context.font = '650 24px Segoe UI, Arial, sans-serif';
      y = drawLines(context, wrapLines(context, slide.subtitle, maxWidth, 2), 92, y + 6, 33, '#71879B');
    }
    return y;
  }

  function drawCallout(context, text, x, y, width, theme, maxLines = 2) {
    if (!text) return;
    fillRound(context, x, y, width, 82, 24, theme.softAlt, null);
    context.font = '800 23px Segoe UI, Arial, sans-serif';
    drawLines(context, wrapLines(context, text, width - 58, maxLines), x + 29, y + 34, 30, theme.accentDark);
  }

  function drawActivityBadge(context, slide, theme) {
    const details = [];
    if (slide.activityMode) details.push(prettyText(slide.activityMode));
    if (slide.timeMinutes) details.push(`${slide.timeMinutes} мин`);
    if (slide.points) details.push(`${slide.points} балла`);
    if (!details.length) return;
    const text = details.join(' · ');
    context.font = '800 18px Segoe UI, Arial, sans-serif';
    const width = Math.min(420, Math.max(210, context.measureText(text).width + 58));
    const x = WIDTH - 88 - width;
    fillRound(context, x, 58, width, 48, 24, theme.softAlt, `${theme.secondary}45`, 2);
    context.fillStyle = theme.secondary;
    context.beginPath(); context.arc(x + 27, 82, 8, 0, Math.PI * 2); context.fill();
    context.fillStyle = theme.ink;
    context.fillText(text, x + 47, 89);
  }

  function drawBulletList(context, bullets, x, y, width, theme, options = {}) {
    const size = options.size || 28;
    const lineHeight = options.lineHeight || 38;
    const maxLines = options.maxLines || 2;
    context.font = `700 ${size}px Segoe UI, Arial, sans-serif`;
    let cursor = y;
    (bullets || []).slice(0, options.maxItems || 4).forEach((bullet, index) => {
      context.fillStyle = index % 2 ? theme.secondary : theme.accent;
      context.beginPath(); context.arc(x + 10, cursor - 8, 8, 0, Math.PI * 2); context.fill();
      const lines = wrapLines(context, bullet, width - 50, maxLines);
      drawLines(context, lines, x + 38, cursor, lineHeight, theme.ink);
      cursor += lines.length * lineHeight + 18;
    });
    return cursor;
  }

  function drawImageCrop(context, image, x, y, width, height, radius) {
    if (!image) return false;
    const scale = Math.max(width / image.width, height / image.height);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const sourceX = (image.width - sourceWidth) / 2;
    const sourceY = (image.height - sourceHeight) / 2;
    context.save();
    roundedPath(context, x, y, width, height, radius);
    context.clip();
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
    const overlay = context.createLinearGradient(x, y, x, y + height);
    overlay.addColorStop(0, 'rgba(10, 28, 48, 0.02)');
    overlay.addColorStop(1, 'rgba(10, 28, 48, 0.16)');
    context.fillStyle = overlay;
    context.fillRect(x, y, width, height);
    context.restore();
    return true;
  }

  function drawAxes(context, x, y, width, height, theme) {
    context.strokeStyle = `${theme.accent}24`;
    context.lineWidth = 2;
    for (let index = 0; index <= 8; index += 1) {
      const px = x + width * index / 8;
      context.beginPath(); context.moveTo(px, y); context.lineTo(px, y + height); context.stroke();
    }
    for (let index = 0; index <= 6; index += 1) {
      const py = y + height * index / 6;
      context.beginPath(); context.moveTo(x, py); context.lineTo(x + width, py); context.stroke();
    }
    context.strokeStyle = theme.accentDark;
    context.lineWidth = 4;
    context.beginPath(); context.moveTo(x, y + height / 2); context.lineTo(x + width, y + height / 2); context.stroke();
    context.beginPath(); context.moveTo(x + width / 2, y); context.lineTo(x + width / 2, y + height); context.stroke();
  }

  function drawQuadraticGraph(context, visual, x, y, width, height, theme) {
    fillRound(context, x, y, width, height, 34, '#FFFFFFDE', `${theme.accent}30`, 2);
    const pad = 38;
    const plotX = x + pad;
    const plotY = y + pad;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;
    drawAxes(context, plotX, plotY, plotW, plotH, theme);
    const a = Number.isFinite(Number(visual?.a)) && Number(visual.a) !== 0 ? Number(visual.a) : 1;
    const b = Number(visual?.b) || 0;
    const c = Number(visual?.c) || 0;
    const samples = [];
    for (let index = 0; index <= 120; index += 1) {
      const valueX = -5 + index / 12;
      samples.push([valueX, a * valueX * valueX + b * valueX + c]);
    }
    const values = samples.map(point => point[1]).filter(Number.isFinite);
    let minY = Math.min(-2, ...values);
    let maxY = Math.max(2, ...values);
    if (maxY - minY > 30) {
      minY = Math.max(minY, -15);
      maxY = Math.min(maxY, 15);
    }
    const mapX = value => plotX + (value + 5) / 10 * plotW;
    const mapY = value => plotY + plotH - (value - minY) / (maxY - minY || 1) * plotH;
    context.save();
    roundedPath(context, plotX, plotY, plotW, plotH, 8);
    context.clip();
    context.strokeStyle = theme.secondary;
    context.lineWidth = 7;
    context.lineJoin = 'round';
    context.beginPath();
    samples.forEach(([valueX, valueY], index) => {
      const px = mapX(valueX);
      const py = mapY(valueY);
      if (index === 0) context.moveTo(px, py); else context.lineTo(px, py);
    });
    context.stroke();
    context.restore();
    context.font = '800 22px Georgia, serif';
    context.fillStyle = theme.accentDark;
    context.fillText(`y = ${a === 1 ? '' : a}x² ${b ? `${b > 0 ? '+' : '−'} ${Math.abs(b)}x` : ''} ${c ? `${c > 0 ? '+' : '−'} ${Math.abs(c)}` : ''}`.trim(), x + 38, y + 32);
  }

  function drawGeometry(context, visual, x, y, width, height, theme) {
    fillRound(context, x, y, width, height, 34, '#FFFFFFDE', `${theme.accent}30`, 2);
    const cx = x + width / 2;
    const cy = y + height / 2 + 10;
    context.strokeStyle = theme.accentDark;
    context.fillStyle = `${theme.accent}20`;
    context.lineWidth = 7;
    context.beginPath();
    if (visual?.shape === 'circle') {
      context.arc(cx, cy, Math.min(width, height) * 0.3, 0, Math.PI * 2);
    } else if (visual?.shape === 'rectangle') {
      context.rect(cx - width * 0.3, cy - height * 0.22, width * 0.6, height * 0.44);
    } else {
      context.moveTo(cx, cy - height * 0.32);
      context.lineTo(cx - width * 0.32, cy + height * 0.25);
      context.lineTo(cx + width * 0.32, cy + height * 0.25);
      context.closePath();
    }
    context.fill();
    context.stroke();
    context.font = '800 23px Segoe UI, Arial, sans-serif';
    context.fillStyle = theme.secondary;
    context.fillText(visual?.label || 'Чертёж по условию', x + 36, y + 42);
  }

  function drawTimeline(context, slide, x, y, width, height, theme) {
    fillRound(context, x, y, width, height, 34, '#FFFFFFDE', `${theme.accent}30`, 2);
    const items = (slide.steps?.length ? slide.steps : slide.bullets || []).slice(0, 4);
    const start = x + 70;
    const end = x + width - 70;
    const cy = y + height * 0.46;
    context.strokeStyle = theme.accentDark;
    context.lineWidth = 7;
    context.beginPath(); context.moveTo(start, cy); context.lineTo(end, cy); context.stroke();
    const count = Math.max(2, items.length);
    items.forEach((item, index) => {
      const px = start + (end - start) * index / (count - 1);
      context.fillStyle = index % 2 ? theme.secondary : theme.accent;
      context.beginPath(); context.arc(px, cy, 14, 0, Math.PI * 2); context.fill();
      context.font = '700 19px Segoe UI, Arial, sans-serif';
      const lines = wrapLines(context, item, 180, 3);
      const textY = index % 2 ? cy + 54 : cy - 88;
      drawLines(context, lines, px - 90, textY, 25, theme.ink);
    });
  }

  function drawMap(context, visual, x, y, width, height, theme) {
    fillRound(context, x, y, width, height, 34, '#FFFFFFDE', `${theme.accent}30`, 2);
    const cx = x + width / 2;
    const cy = y + height / 2;
    const radius = Math.min(width, height) * 0.31;
    context.strokeStyle = theme.accentDark;
    context.lineWidth = 5;
    context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.stroke();
    context.lineWidth = 3;
    context.beginPath(); context.ellipse(cx, cy, radius * 0.45, radius, 0, 0, Math.PI * 2); context.stroke();
    context.beginPath(); context.ellipse(cx, cy, radius, radius * 0.45, 0, 0, Math.PI * 2); context.stroke();
    [[0.58, -0.48], [-0.52, -0.1], [0.22, 0.55]].forEach(([dx, dy], index) => {
      const px = cx + radius * dx;
      const py = cy + radius * dy;
      context.fillStyle = index === 1 ? theme.secondary : theme.accent;
      context.beginPath(); context.arc(px, py, 13, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.moveTo(px - 10, py + 8); context.lineTo(px, py + 28); context.lineTo(px + 10, py + 8); context.fill();
    });
    context.font = '800 21px Segoe UI, Arial, sans-serif';
    context.fillStyle = theme.accentDark;
    context.fillText(visual?.label || 'На карте мира', x + 36, y + 42);
  }

  function drawProcess(context, slide, x, y, width, height, theme) {
    fillRound(context, x, y, width, height, 34, '#FFFFFFDE', `${theme.accent}30`, 2);
    const items = (slide.steps?.length ? slide.steps : slide.bullets || []).slice(0, 4);
    const count = Math.max(1, items.length);
    const cardHeight = Math.min(92, (height - 72) / count - 10);
    items.forEach((item, index) => {
      const py = y + 34 + index * (cardHeight + 12);
      fillRound(context, x + 34, py, width - 68, cardHeight, 22, index % 2 ? theme.softAlt : theme.soft, null);
      context.fillStyle = index % 2 ? theme.secondary : theme.accent;
      context.beginPath(); context.arc(x + 70, py + cardHeight / 2, 20, 0, Math.PI * 2); context.fill();
      context.font = '900 20px Segoe UI, Arial, sans-serif';
      context.fillStyle = '#FFFFFF';
      context.textAlign = 'center'; context.fillText(String(index + 1), x + 70, py + cardHeight / 2 + 7); context.textAlign = 'left';
      context.font = '700 20px Segoe UI, Arial, sans-serif';
      drawLines(context, wrapLines(context, item, width - 150, 2), x + 108, py + 34, 27, theme.ink);
    });
  }

  function drawVocabulary(context, slide, x, y, width, height, theme) {
    fillRound(context, x, y, width, height, 34, '#FFFFFFDE', `${theme.accent}30`, 2);
    const items = (slide.bullets || []).slice(0, 4);
    const cardWidth = (width - 90) / 2;
    const cardHeight = (height - 90) / 2;
    items.forEach((item, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const px = x + 30 + column * (cardWidth + 30);
      const py = y + 30 + row * (cardHeight + 30);
      fillRound(context, px, py, cardWidth, cardHeight, 26, index % 2 ? theme.softAlt : theme.soft, null);
      context.font = '900 25px Segoe UI, Arial, sans-serif';
      drawLines(context, wrapLines(context, item, cardWidth - 44, 4), px + 22, py + 44, 33, theme.ink);
    });
  }

  function drawAtom(context, visual, x, y, width, height, theme) {
    fillRound(context, x, y, width, height, 34, '#FFFFFFDE', `${theme.accent}30`, 2);
    const cx = x + width / 2;
    const cy = y + height / 2;
    context.strokeStyle = theme.accentDark;
    context.lineWidth = 4;
    [0, Math.PI / 3, -Math.PI / 3].forEach(angle => {
      context.save(); context.translate(cx, cy); context.rotate(angle);
      context.beginPath(); context.ellipse(0, 0, width * 0.29, height * 0.1, 0, 0, Math.PI * 2); context.stroke();
      context.restore();
    });
    context.fillStyle = theme.secondary;
    context.beginPath(); context.arc(cx, cy, 24, 0, Math.PI * 2); context.fill();
    [[0.28, 0], [-0.15, 0.25], [-0.12, -0.27]].forEach(([dx, dy]) => {
      context.fillStyle = theme.accent;
      context.beginPath(); context.arc(cx + width * dx, cy + height * dy, 12, 0, Math.PI * 2); context.fill();
    });
    context.font = '800 21px Segoe UI, Arial, sans-serif';
    context.fillStyle = theme.accentDark;
    context.fillText(visual?.label || 'Модель строения', x + 36, y + 42);
  }

  function drawCode(context, slide, x, y, width, height, theme) {
    fillRound(context, x, y, width, height, 34, '#142637', null);
    const items = (slide.steps?.length ? slide.steps : slide.bullets || []).slice(0, 6);
    context.font = '700 21px Consolas, monospace';
    items.forEach((item, index) => {
      context.fillStyle = index % 2 ? '#8BE0C8' : '#8BCBFF';
      context.fillText(`${String(index + 1).padStart(2, '0')}  ${prettyText(item)}`, x + 34, y + 54 + index * 50);
    });
    context.fillStyle = theme.secondary;
    context.beginPath(); context.arc(x + width - 76, y + 36, 8, 0, Math.PI * 2); context.fill();
    context.fillStyle = theme.accent;
    context.beginPath(); context.arc(x + width - 48, y + 36, 8, 0, Math.PI * 2); context.fill();
  }

  function drawSubjectVisual(context, theme, x, y, width, height) {
    fillRound(context, x, y, width, height, 34, '#FFFFFFDE', `${theme.accent}30`, 2);
    const cardWidth = width * 0.54;
    for (let index = 0; index < 3; index += 1) {
      const offset = index * 42;
      fillRound(context, x + 55 + offset, y + 72 + offset, cardWidth, height * 0.45, 28,
        index === 1 ? theme.softAlt : theme.soft, `${theme.accent}40`, 2);
      context.fillStyle = index === 1 ? theme.secondary : theme.accent;
      context.beginPath(); context.arc(x + 92 + offset, y + 110 + offset, 11, 0, Math.PI * 2); context.fill();
      context.fillRect(x + 122 + offset, y + 100 + offset, cardWidth * 0.5, 18);
      context.fillRect(x + 88 + offset, y + 150 + offset, cardWidth * 0.68, 13);
    }
  }

  function drawVisual(context, slide, x, y, width, height, theme) {
    const visual = slide.visual || {};
    const type = visual.type === 'none' ? theme.visual : visual.type || theme.visual;
    if (type === 'quadratic-graph' || type === 'coordinate-plane') {
      drawQuadraticGraph(context, visual, x, y, width, height, theme);
    } else if (type === 'geometry') {
      drawGeometry(context, visual, x, y, width, height, theme);
    } else if (type === 'timeline') {
      drawTimeline(context, slide, x, y, width, height, theme);
    } else if (type === 'map') {
      drawMap(context, visual, x, y, width, height, theme);
    } else if (type === 'process') {
      drawProcess(context, slide, x, y, width, height, theme);
    } else if (type === 'vocabulary') {
      drawVocabulary(context, slide, x, y, width, height, theme);
    } else if (type === 'atom') {
      drawAtom(context, visual, x, y, width, height, theme);
    } else if (type === 'code') {
      drawCode(context, slide, x, y, width, height, theme);
    } else {
      drawSubjectVisual(context, theme, x, y, width, height);
    }
  }

  function drawCover(context, slide, presentation, payload, theme, coverImage) {
    drawBrandPill(context, theme, payload.subject || 'Учебная презентация');
    const hasImage = drawImageCrop(context, coverImage, 1000, 120, 510, 620, 50);
    context.font = '900 68px Segoe UI, Arial, sans-serif';
    const maxWidth = hasImage ? 800 : 870;
    const title = wrapLines(context, slide.title || presentation.title || payload.topic, maxWidth, 4);
    let y = drawLines(context, title, 94, 232, 78, theme.ink);
    const subtitle = slide.subtitle || presentation.subtitle
      || [payload.grade, `${payload.duration} минут`].filter(Boolean).join(' · ');
    context.font = '650 29px Segoe UI, Arial, sans-serif';
    y = drawLines(context, wrapLines(context, subtitle, maxWidth, 3), 98, y + 24, 41, '#61778C');

    if (presentation.learningGoal) {
      fillRound(context, 96, Math.min(592, y + 34), 780, 126, 28, '#FFFFFFD9', `${theme.accent}28`, 2);
      context.font = '800 19px Segoe UI, Arial, sans-serif';
      context.fillStyle = theme.accent;
      context.fillText('ЦЕЛЬ УРОКА', 126, Math.min(628, y + 70));
      context.font = '700 21px Segoe UI, Arial, sans-serif';
      drawLines(context, wrapLines(context, presentation.learningGoal, 700, 3), 126, Math.min(662, y + 104), 28, theme.ink);
    }

    if (!hasImage) drawVisual(context, slide, 1045, 170, 455, 520, theme);
    const meta = [payload.grade, `${payload.duration} мин`, `${payload.slidesCount} слайдов`]
      .filter(Boolean).join('  ·  ');
    fillRound(context, 98, 730, 630, 54, 27, theme.soft, null);
    context.font = '800 21px Segoe UI, Arial, sans-serif';
    context.fillStyle = theme.accentDark;
    context.fillText(meta, 128, 765);
  }

  function drawSplit(context, slide, payload, theme) {
    drawBrandPill(context, theme, payload.subject || 'RepIQ Board');
    const y = drawSlideTitle(context, slide, theme, 1370);
    fillRound(context, 72, y + 20, 900, 490, 36, '#FFFFFFE2', `${theme.accent}25`, 2);
    drawBulletList(context, slide.bullets, 112, y + 82, 820, theme);
    drawCallout(context, slide.callout, 110, y + 398, 825, theme);
    drawVisual(context, slide, 1020, y + 20, 500, 490, theme);
  }

  function drawFormula(context, slide, payload, theme) {
    drawBrandPill(context, theme, payload.subject || 'RepIQ Board');
    const y = drawSlideTitle(context, slide, theme);
    fillRound(context, 94, y + 22, 1412, 170, 38, '#FFFFFFE8', `${theme.accent}35`, 3);
    context.font = '800 53px Georgia, Cambria Math, serif';
    context.fillStyle = theme.accentDark;
    context.textAlign = 'center';
    const formula = prettyText(slide.formula || slide.callout || 'Ключевая формула');
    drawLines(context, wrapLines(context, formula, 1280, 2), WIDTH / 2, y + 105, 63, theme.accentDark);
    context.textAlign = 'left';

    const steps = (slide.steps?.length ? slide.steps : slide.bullets || []).slice(0, 4);
    const cardWidth = (1412 - 54) / Math.max(1, Math.min(4, steps.length));
    steps.forEach((step, index) => {
      const px = 94 + index * (cardWidth + 18);
      fillRound(context, px, y + 220, cardWidth, 245, 28, index % 2 ? theme.softAlt : theme.soft, null);
      context.fillStyle = index % 2 ? theme.secondary : theme.accent;
      context.beginPath(); context.arc(px + 42, y + 262, 22, 0, Math.PI * 2); context.fill();
      context.font = '900 21px Segoe UI, Arial, sans-serif';
      context.fillStyle = '#FFFFFF';
      context.textAlign = 'center'; context.fillText(String(index + 1), px + 42, y + 269); context.textAlign = 'left';
      context.font = '700 23px Segoe UI, Arial, sans-serif';
      drawLines(context, wrapLines(context, step, cardWidth - 48, 5), px + 24, y + 318, 31, theme.ink);
    });
  }

  function drawSteps(context, slide, payload, theme) {
    drawBrandPill(context, theme, payload.subject || 'RepIQ Board');
    const y = drawSlideTitle(context, slide, theme);
    const steps = (slide.steps?.length ? slide.steps : slide.bullets || []).slice(0, 4);
    const cardWidth = 680;
    const cardHeight = 220;
    steps.forEach((step, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const px = 88 + column * 720;
      const py = y + 24 + row * 244;
      fillRound(context, px, py, cardWidth, cardHeight, 34, '#FFFFFFE2', `${theme.accent}25`, 2);
      fillRound(context, px + 24, py + 24, 66, 66, 22, index % 2 ? theme.secondary : theme.accent, null);
      context.font = '900 28px Segoe UI, Arial, sans-serif';
      context.fillStyle = '#FFFFFF';
      context.textAlign = 'center'; context.fillText(String(index + 1), px + 57, py + 67); context.textAlign = 'left';
      context.font = '800 26px Segoe UI, Arial, sans-serif';
      drawLines(context, wrapLines(context, step, cardWidth - 138, 4), px + 112, py + 58, 35, theme.ink);
    });
  }

  function drawCards(context, slide, payload, theme, comparison = false) {
    drawBrandPill(context, theme, payload.subject || 'RepIQ Board');
    drawActivityBadge(context, slide, theme);
    const y = drawSlideTitle(context, slide, theme);
    const bullets = (slide.bullets || []).slice(0, 4);
    const columns = comparison ? 2 : Math.min(3, Math.max(1, bullets.length));
    const cardWidth = (1424 - (columns - 1) * 24) / columns;
    bullets.forEach((bullet, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const rows = Math.ceil(bullets.length / columns);
      const cardHeight = rows > 1 ? 220 : 410;
      const px = 88 + column * (cardWidth + 24);
      const py = y + 30 + row * (cardHeight + 24);
      fillRound(context, px, py, cardWidth, cardHeight, 34, index % 2 ? theme.softAlt : theme.soft, `${theme.accent}20`, 2);
      context.fillStyle = index % 2 ? theme.secondary : theme.accent;
      context.beginPath(); context.arc(px + 44, py + 46, 15, 0, Math.PI * 2); context.fill();
      context.font = '800 27px Segoe UI, Arial, sans-serif';
      drawLines(context, wrapLines(context, bullet, cardWidth - 56, rows > 1 ? 5 : 8), px + 28, py + 98, 37, theme.ink);
    });
    if (slide.callout) drawCallout(context, slide.callout, 188, 708, 1224, theme);
  }

  function drawPractice(context, slide, payload, theme) {
    drawBrandPill(context, theme, payload.subject || 'RepIQ Board');
    drawActivityBadge(context, slide, theme);
    const y = drawSlideTitle(context, slide, theme);
    fillRound(context, 76, y + 22, 940, 480, 40, '#FFFFFFE5', `${theme.accent}30`, 2);
    context.font = '800 34px Segoe UI, Arial, sans-serif';
    const question = slide.question || slide.bullets?.[0] || 'Выполните задание самостоятельно.';
    drawLines(context, wrapLines(context, question, 840, 6), 122, y + 100, 47, theme.ink);
    if (slide.formula) {
      fillRound(context, 118, y + 326, 850, 104, 26, theme.soft, null);
      context.font = '800 37px Georgia, Cambria Math, serif';
      context.fillStyle = theme.accentDark;
      context.textAlign = 'center'; context.fillText(prettyText(slide.formula), 543, y + 391); context.textAlign = 'left';
    } else {
      drawCallout(context, slide.callout || 'Запишите ход решения и проверьте ответ.', 118, y + 362, 850, theme);
    }

    if (slide.kind === 'answers' && slide.answer) {
      fillRound(context, 1054, y + 22, 466, 480, 40, theme.softAlt, null);
      context.font = '900 22px Segoe UI, Arial, sans-serif';
      context.fillStyle = theme.secondary;
      context.fillText('ОТВЕТ', 1094, y + 76);
      context.font = '800 30px Segoe UI, Arial, sans-serif';
      drawLines(context, wrapLines(context, slide.answer, 390, 8), 1094, y + 132, 42, theme.ink);
    } else {
      drawVisual(context, slide, 1054, y + 22, 466, 480, theme);
    }
  }

  function drawSummary(context, slide, presentation, payload, theme) {
    drawBrandPill(context, theme, payload.subject || 'RepIQ Board');
    const y = drawSlideTitle(context, slide, theme);
    const items = (slide.bullets?.length ? slide.bullets : slide.steps || []).slice(0, 4);
    const count = Math.max(1, items.length);
    const cardWidth = (1416 - (count - 1) * 20) / count;
    items.forEach((item, index) => {
      const px = 92 + index * (cardWidth + 20);
      fillRound(context, px, y + 34, cardWidth, 330, 36, index % 2 ? theme.softAlt : theme.soft, null);
      context.font = '900 52px Segoe UI, Arial, sans-serif';
      context.fillStyle = index % 2 ? theme.secondary : theme.accent;
      context.fillText(String(index + 1).padStart(2, '0'), px + 28, y + 104);
      context.font = '800 25px Segoe UI, Arial, sans-serif';
      drawLines(context, wrapLines(context, item, cardWidth - 56, 6), px + 28, y + 158, 35, theme.ink);
    });
    drawCallout(context, slide.callout || presentation.learningGoal, 232, y + 404, 1136, theme);
  }

  function drawLevels(context, slide, payload, theme) {
    drawBrandPill(context, theme, payload.subject || 'RepIQ Board');
    drawActivityBadge(context, slide, theme);
    const y = drawSlideTitle(context, slide, theme);
    const fallback = [
      { label: 'База', audience: 'С опорой на алгоритм', tasks: slide.bullets?.slice(0, 2) || [] },
      { label: 'Стандарт', audience: 'Основной уровень', tasks: slide.bullets?.slice(1, 3) || [] },
      { label: 'Вызов', audience: 'Для готовых идти дальше', tasks: slide.bullets?.slice(2, 4) || [] },
    ];
    const levels = slide.levels?.length ? slide.levels.slice(0, 3) : fallback;
    const cardWidth = 444;
    const colors = [theme.accent, theme.secondary, '#F29E4C'];
    levels.forEach((level, index) => {
      const x = 88 + index * 476;
      const color = colors[index];
      fillRound(context, x, y + 26, cardWidth, 478, 38, '#FFFFFFE8', `${color}45`, 3);
      fillRound(context, x + 24, y + 50, cardWidth - 48, 68, 24, `${color}20`, null);
      context.fillStyle = color;
      context.font = '900 29px Segoe UI, Arial, sans-serif';
      context.fillText(prettyText(level.label || ['База', 'Стандарт', 'Вызов'][index]), x + 48, y + 93);
      context.font = '700 18px Segoe UI, Arial, sans-serif';
      drawLines(context, wrapLines(context, level.audience, cardWidth - 82, 2), x + 42, y + 150, 25, '#71879B');

      const tasks = (level.tasks || []).slice(0, index === 0 ? 5 : 4);
      context.font = '750 18px Segoe UI, Arial, sans-serif';
      let taskY = y + 205;
      tasks.forEach(task => {
        context.fillStyle = color;
        context.beginPath(); context.arc(x + 48, taskY - 6, 7, 0, Math.PI * 2); context.fill();
        const lines = wrapLines(context, task, cardWidth - 92, 2);
        drawLines(context, lines, x + 70, taskY, 23, theme.ink);
        taskY += lines.length * 23 + 8;
      });
    });
  }

  function drawGame(context, slide, payload, theme) {
    drawBrandPill(context, theme, payload.subject || 'RepIQ Board');
    drawActivityBadge(context, slide, theme);
    const y = drawSlideTitle(context, slide, theme);

    fillRound(context, 76, y + 24, 930, 480, 42, '#FFFFFFE8', `${theme.secondary}38`, 3);
    context.font = '900 31px Segoe UI, Arial, sans-serif';
    context.fillStyle = theme.secondary;
    context.fillText('МИССИЯ', 120, y + 88);
    context.font = '850 35px Segoe UI, Arial, sans-serif';
    const question = slide.question || 'Найдите ошибку и объясните правильный ход решения.';
    drawLines(context, wrapLines(context, question, 820, 5), 120, y + 148, 46, theme.ink);
    drawCallout(context, slide.callout || 'Команда получает балл только после объяснения ответа.', 118, y + 392, 844, theme);

    fillRound(context, 1048, y + 24, 472, 480, 42, theme.softAlt, null);
    context.font = '900 25px Segoe UI, Arial, sans-serif';
    context.fillStyle = theme.accentDark;
    context.fillText('КАК НАБРАТЬ БАЛЛЫ', 1090, y + 86);
    const rules = (slide.bullets?.length ? slide.bullets : [
      '1 балл — верный ответ',
      '1 балл — понятное объяснение',
      '1 балл — проверка другой команды',
    ]).slice(0, 4);
    context.font = '800 23px Segoe UI, Arial, sans-serif';
    let ruleY = y + 150;
    rules.forEach((rule, index) => {
      fillRound(context, 1086, ruleY - 30, 52, 52, 18, index % 2 ? theme.secondary : theme.accent, null);
      context.fillStyle = '#FFFFFF';
      context.textAlign = 'center'; context.fillText(String(index + 1), 1112, ruleY + 5); context.textAlign = 'left';
      drawLines(context, wrapLines(context, rule, 320, 2), 1162, ruleY, 31, theme.ink);
      ruleY += 88;
    });
  }

  function selectLayout(slide, index) {
    if (index === 0 || slide.kind === 'cover') return 'cover';
    if (slide.layout) return slide.layout;
    if (slide.formula) return 'formula';
    if (slide.steps?.length) return 'steps';
    if (slide.kind === 'differentiation' || slide.kind === 'homework') return 'levels';
    if (slide.kind === 'game') return 'game';
    if (slide.kind === 'practice') return 'practice';
    if (slide.kind === 'summary' || slide.kind === 'answers') return 'summary';
    return 'split';
  }

  function loadImage(source) {
    if (!source) return Promise.resolve(null);
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = source;
    });
  }

  async function buildSlides(presentation, payload) {
    const theme = detectTheme(payload.subject, payload.template);
    const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
    const coverImage = await loadImage(presentation?.coverImage);
    return slides.map((slide, index) => {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const context = canvas.getContext('2d');
      drawBackground(context, theme, index);
      const layout = selectLayout(slide, index);
      if (layout === 'cover') {
        drawCover(context, slide, presentation, payload, theme, coverImage);
      } else if (layout === 'formula') {
        drawFormula(context, slide, payload, theme);
      } else if (layout === 'steps') {
        drawSteps(context, slide, payload, theme);
      } else if (layout === 'cards') {
        drawCards(context, slide, payload, theme);
      } else if (layout === 'comparison') {
        drawCards(context, slide, payload, theme, true);
      } else if (layout === 'levels') {
        drawLevels(context, slide, payload, theme);
      } else if (layout === 'game') {
        drawGame(context, slide, payload, theme);
      } else if (layout === 'practice') {
        drawPractice(context, slide, payload, theme);
      } else if (layout === 'summary') {
        drawSummary(context, slide, presentation, payload, theme);
      } else {
        drawSplit(context, slide, payload, theme);
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
