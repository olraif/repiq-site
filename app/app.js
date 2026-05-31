const storeKey = "tutor-app-state-v2";
const oldStoreKey = "tutor-app-state-v1";
const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long" });

const seed = {
  selectedDate: isoDate(new Date()),
  mode: "day",
  timezone: "Europe/Moscow",
  reminderEnabled: false,
  reminderLeadMinutes: 15,
  reminderMode: "sound",
  reminderMelody: "soft",
  reminderLog: {},
  installId: "",
  deviceToken: "",
  aiEntitlement: { active: false, plan: null, expiresAt: null, requestsLeft: null, email: null },
  students: [],
  groups: [],
  lessons: [],
  payments: []
};

let state = load();
let calcCache = null;
let reminderTimer = null;
let undoSnapshot = null;
const maxRegularSlots = 7;
const appVersion = "1555.1bl";
const RUSTORE_APP_URL = "https://www.rustore.ru/catalog/app/com.olesya.tutor?utm_source=app&utm_medium=rate&utm_campaign=organic_launch";
const REPIQ_SITE_URL = "https://www.repiq.ru/?utm_source=app&utm_medium=share&utm_campaign=organic_launch";
const SUPPORT_PROJECT_URL = "https://pay.cloudtips.ru/p/36494679";
const reviewStateKey = "repiq-review-request-v1";
const appConfig = {
  apiBaseUrl: window.TUTOR_AI_CONFIG?.API_BASE_URL || "",
  paymentSiteUrl: window.TUTOR_AI_CONFIG?.PAYMENT_SITE_URL || "",
  enableExternalPaymentLink: Boolean(window.TUTOR_AI_CONFIG?.ENABLE_EXTERNAL_PAYMENT_LINK),
  distributionChannel: window.TUTOR_AI_CONFIG?.APP_DISTRIBUTION_CHANNEL || "rustore"
};

const el = (id) => document.getElementById(id);
const views = ["home", "students", "groups", "payments"];

function safeOnlineUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function setOnlineLink(id, value) {
  const link = el(id);
  if (!link) return;
  const url = safeOnlineUrl(value);
  const actions = link.closest(".online-link-actions");
  actions?.classList.toggle("hidden", !url);
  if (url) link.href = url;
  else link.removeAttribute("href");
}

async function copyOnlineLink(linkId) {
  const href = el(linkId)?.getAttribute("href");
  const url = safeOnlineUrl(href);
  if (!url) {
    showToast("Ссылка не заполнена");
    return;
  }
  try {
    await copyText(url);
    showToast("Ссылка скопирована");
  } catch (error) {
    showToast("Не удалось скопировать");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindDialogs();
  bindSwipeNavigation();
  render();
  startReminderWatcher();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register(`./sw.js?v=${encodeURIComponent(appVersion)}`)
      .then((registration) => registration.update?.())
      .catch(() => {});
  }
});

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function allowedTimezone(timezone) {
  const allowed = new Set([
    "Europe/Kaliningrad",
    "Europe/Moscow",
    "Europe/Samara",
    "Asia/Yekaterinburg",
    "Asia/Omsk",
    "Asia/Krasnoyarsk",
    "Asia/Irkutsk",
    "Asia/Yakutsk",
    "Asia/Vladivostok",
    "Asia/Magadan",
    "Asia/Kamchatka"
  ]);
  return allowed.has(timezone) ? timezone : "Europe/Moscow";
}

function load() {
  const raw = localStorage.getItem(storeKey) || localStorage.getItem(oldStoreKey);
  const data = raw ? JSON.parse(raw) : structuredClone(seed);
  data.mode ||= "day";
  data.timezone = allowedTimezone(data.timezone || "Europe/Moscow");
  data.workStart ||= "09:00";
  data.workEnd ||= "22:00";
  data.reminderEnabled = Boolean(data.reminderEnabled);
  data.reminderLeadMinutes = Number(data.reminderLeadMinutes || 15);
  data.reminderMode ||= "sound";
  data.reminderMelody ||= "soft";
  data.reminderLog ||= {};
  data.installId ||= uuid();
  data.deviceToken ||= "";
  data.aiEntitlement = normalizeAiEntitlement(data.aiEntitlement);
  data.groups = (data.groups || []).map((item) => ({ status: "Активна", name: "", subject: "", grade: "", archived: false, lessonsPerWeek: Math.max(1, normalizeRegularSlots(item).length || Number(item.lessonsPerWeek || 1)), scheduleStartDate: "", scheduleEndDate: "", onlineLink: "", regularSchedule: "", regularSlots: normalizeRegularSlots(item), ...item, lessonsPerWeek: Math.max(1, normalizeRegularSlots(item).length || Number(item.lessonsPerWeek || 1)), onlineLink: item.onlineLink || "", regularSlots: normalizeRegularSlots(item) }));
  data.students = (data.students || []).map((item) => ({ status: "Активен", format: "Индивидуально", groupId: "", lessonsPerWeek: 1, lessonDuration: 60, grade: "", studentNote: "", scheduleStartDate: "", scheduleEndDate: "", onlineLink: "", regularSchedule: "", regularSlots: normalizeRegularSlots(item), parentName: "", parentPhone: "", ...item, studentNote: item.studentNote || timezoneFullLabel(item.studentTimezone) || "", onlineLink: item.onlineLink || "", regularSlots: normalizeRegularSlots(item) }));
  data.payments = (data.payments || []).map((payment) => ({ scope: "lesson", invoice: payment.invoice || payment.account || "", archived: false, ...payment }));
  data.lessons = (data.lessons || []).map((lesson) => ({ type: lesson.type || "lesson", title: lesson.title || "", movedFrom: "", conducted: false, ...lesson, id: lesson.id || uuid() }));
  data.exclusions ||= [];
  data.groupAttendance ||= {};
  detachArchivedGroupStudents(data);
  autoArchiveOldPayments(data);
  return data;
}

function save() {
  calcCache = null;
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function rememberUndo() {
  undoSnapshot = JSON.stringify(state);
}

function undoLastAction() {
  if (!undoSnapshot) {
    showToast("Нечего отменять");
    return;
  }
  state = JSON.parse(undoSnapshot);
  undoSnapshot = null;
  save();
  render();
  showToast("Действие отменено");
}

function normalizeAiEntitlement(entitlement = {}) {
  return {
    active: Boolean(entitlement.active),
    plan: entitlement.plan || null,
    expiresAt: entitlement.expiresAt || null,
    requestsLeft: entitlement.requestsLeft ?? entitlement.requestsLimit ?? null,
    email: entitlement.email || null
  };
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function shortDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function asDate(value) {
  return new Date(`${value}T12:00:00`);
}

function timezoneOffsetMinutes(timezone = state.timezone || "Europe/Moscow", date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(date).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
    const zonedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
    return Math.round((zonedAsUtc - date.getTime()) / 60000);
  } catch (error) {
    return {
      "Europe/Kaliningrad": 120,
      "Europe/Moscow": 180,
      "Europe/Samara": 240,
      "Asia/Yekaterinburg": 300,
      "Asia/Omsk": 360,
      "Asia/Krasnoyarsk": 420,
      "Asia/Irkutsk": 480,
      "Asia/Yakutsk": 540,
      "Asia/Vladivostok": 600,
      "Asia/Magadan": 660,
      "Asia/Kamchatka": 720
    }[timezone] || 180;
  }
}

function isoDateInTimezone(date = new Date(), timezone = state.timezone || "Europe/Moscow") {
  return new Date(date.getTime() + timezoneOffsetMinutes(timezone) * 60000).toISOString().slice(0, 10);
}

function zonedLessonDateTime(dateText, timeText, timezone = state.timezone || "Europe/Moscow") {
  const [year, month, day] = dateText.split("-").map(Number);
  const [hours, minutes] = String(timeText || "00:00").split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes || 0));
  return new Date(Date.UTC(year, month - 1, day, hours, minutes || 0) - timezoneOffsetMinutes(timezone, utcGuess) * 60000);
}

function student(id) {
  return state.students.find((item) => item.id === id) || { name: "Без имени", subject: "", price: 0 };
}

function group(id) {
  return state.groups.find((item) => item.id === id) || { name: "Группа", subject: "", grade: "" };
}

function todayIso() {
  return isoDateInTimezone(new Date());
}

function effectiveStudentStatus(item) {
  const status = item.status || "Активен";
  if (status === "Активен" && item.scheduleEndDate && item.scheduleEndDate < todayIso()) return "Пауза";
  return status;
}

function isStudentArchived(item) {
  return (item.status || "Активен") === "Завершен";
}

function lessonPrice(lesson) {
  if (isPersonalEvent(lesson)) return 0;
  if (lesson.groupId && !lesson.studentId) {
    return groupStudents(lesson.groupId).reduce((total, item) => total + studentPriceForDuration(item, lessonDurationMinutes(lesson)), 0);
  }
  const owner = student(lesson.studentId);
  return Number(lesson.price !== undefined && lesson.price !== "" ? lesson.price : studentPriceForDuration(owner, lessonDurationMinutes(lesson)));
}

function priceForDuration(basePrice, duration = 60, baseDuration = 60) {
  return Math.round(Number(basePrice || 0) * Number(duration || 60) / Number(baseDuration || 60));
}

function studentPriceForDuration(owner, duration = 60) {
  return priceForDuration(owner?.price || 0, duration, owner?.lessonDuration || 60);
}

function lessonStudentDetails(lesson) {
  if (isPersonalEvent(lesson)) return lesson.note || "личное дело";
  if (lesson.groupId) {
    const item = group(lesson.groupId);
    return [item.subject, item.grade].filter(Boolean).join(" · ");
  }
  const owner = student(lesson.studentId);
  return [lesson.subject || owner.subject, owner.grade].filter(Boolean).join(" · ");
}

function lessonDateTime(lesson) {
  return zonedLessonDateTime(lesson.date, lesson.time);
}

function isPastLesson(lesson) {
  return lessonDateTime(lesson) < new Date();
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const dayMinutes = 24 * 60;
  const normalized = ((Number(totalMinutes) % dayMinutes) + dayMinutes) % dayMinutes;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function durationFromTimes(startTime, endTime, fallback = 60) {
  if (!startTime || !endTime) return Number(fallback || 60);
  let duration = timeToMinutes(endTime) - timeToMinutes(startTime);
  if (duration <= 0) duration += 24 * 60;
  return duration || Number(fallback || 60);
}

function lessonDurationMinutes(lesson) {
  if (isPersonalEvent(lesson)) return Number(lesson.duration || 60);
  if (lesson.duration) return Number(lesson.duration);
  if (lesson.lessonDuration) return Number(lesson.lessonDuration);
  if (lesson.groupId && !lesson.studentId) return 60;
  return Number(student(lesson.studentId).lessonDuration || 60);
}

function lessonCoversSlot(lesson, time) {
  const lessonStart = timeToMinutes(lesson.time);
  const lessonEnd = lessonStart + lessonDurationMinutes(lesson);
  const slotStart = timeToMinutes(time);
  const slotEnd = slotStart + 30;
  return lessonStart < slotEnd && slotStart < lessonEnd;
}

function lessonStartsInSlot(lesson, time) {
  const lessonStart = timeToMinutes(lesson.time);
  const slotStart = timeToMinutes(time);
  return lessonStart >= slotStart && lessonStart < slotStart + 30;
}

function lessonEndsInSlot(lesson, time) {
  const lessonEnd = timeToMinutes(lesson.time) + lessonDurationMinutes(lesson);
  const slotStart = timeToMinutes(time);
  return lessonEnd > slotStart && lessonEnd <= slotStart + 30;
}

function lessonEndsAt(lesson) {
  return minutesToTime(timeToMinutes(lesson.time) + lessonDurationMinutes(lesson));
}

function isPersonalEvent(lesson) {
  return (lesson.type || "lesson") === "personal";
}

function lessonAtSlot(lessons, date, time) {
  return lessons
    .filter((lesson) => lesson.date === date && lessonCoversSlot(lesson, time))
    .sort(sortByDateTime)[0] || null;
}

function lessonVisualClass(lesson) {
  if (isPersonalEvent(lesson)) return lesson.conducted ? "personal-done" : "personal";
  if (lesson.groupId && groupLessonConducted(lesson)) return "conducted";
  if (lesson.conducted) return "conducted";
  const paidClass = lessonStatus(lesson).done ? "paid" : "debt";
  return `${paidClass}${isPastLesson(lesson) ? " needs-action" : ""}`;
}

function balancePayments() {
  // Archived payments still count toward balance. Only permanent deletion removes money from calculations.
  return state.payments;
}

function paymentsForLesson(lesson) {
  if (lesson.groupId) return groupLessonStatus(lesson).paid;
  return paymentAllocationForStudent(lesson.studentId).get(lesson.id) || 0;
}

function cache() {
  calcCache ||= { planned: null, allocations: new Map() };
  return calcCache;
}

function paymentAllocationForStudent(studentId) {
  const currentCache = cache();
  if (currentCache.allocations.has(studentId)) return currentCache.allocations.get(studentId);
  const lessons = payableLessonsForStudent(studentId)
    .sort(sortByDateTime);
  const allocation = new Map(lessons.map((lesson) => [lesson.id, 0]));
  const totalPaid = balancePayments()
    .filter((payment) => payment.studentId === studentId)
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
  let conductedAmount = Math.max(0, totalPaid);
  lessons
    .filter((lesson) => lessonConductedForStudent(lesson, studentId))
    .sort(sortForPaymentAllocation)
    .forEach((lesson) => {
      if (conductedAmount <= 0) return;
      const share = Math.min(lessonPrice(lesson), conductedAmount);
      allocation.set(lesson.id, share);
      conductedAmount -= share;
    });

  let futureAmount = Math.max(0, totalPaid - conductedAmountForStudent(studentId));
  lessons
    .filter((lesson) => !lessonConductedForStudent(lesson, studentId))
    .sort(sortForPaymentAllocation)
    .forEach((lesson) => {
      if (futureAmount <= 0) return;
      const share = Math.min(lessonPrice(lesson), futureAmount);
      allocation.set(lesson.id, share);
      futureAmount -= share;
    });

  currentCache.allocations.set(studentId, allocation);
  return allocation;
}

function payableLessonsForStudent(studentId) {
  const owner = student(studentId);
  const active = (owner.status || "Активен") === "Активен";
  const realIndividual = state.lessons
    .filter((item) => !isPersonalEvent(item))
    .filter((item) => !isExcludedLesson(item))
    .filter((item) => !item.groupId && item.studentId === studentId);
  const expectedIndividual = active && studentHasIndividualSchedule(owner.format || "Индивидуально")
    ? expectedLessonsForRange(rangeStart(), rangeEnd())
      .filter((item) => item.studentId === studentId)
      .filter((item) => !realIndividual.some((real) => lessonsOverlap(real, item)))
    : [];
  const individual = dedupeLessons([...realIndividual, ...expectedIndividual]);
  if (!studentHasGroup(owner.format) || !owner.groupId) return individual.sort(sortByDateTime);
  const groupLessons = expectedGroupLessonsForRange(rangeStart(), rangeEnd())
    .filter((lesson) => lesson.groupId === owner.groupId)
    .filter((lesson) => active || state.groupAttendance?.[groupLessonKey(lesson)]?.present?.[studentId])
    .map((lesson) => ({
      ...lesson,
      id: `group-pay-${studentId}-${lesson.groupId}-${lesson.date}-${lesson.time}`,
      studentId,
      subject: group(lesson.groupId).subject,
      price: studentPriceForDuration(owner, lessonDurationMinutes(lesson))
    }));
  return dedupeLessons([...individual, ...groupLessons]).sort(sortByDateTime);
}

function groupStudents(groupId) {
  return state.students.filter((item) => studentHasGroup(item.format) && item.groupId === groupId && (item.status || "Активен") === "Активен");
}

function groupLessonStatus(lesson) {
  const members = groupStudents(lesson.groupId);
  const virtualLessons = members.map((member) => ({
    ...lesson,
    id: `group-pay-${member.id}-${lesson.groupId}-${lesson.date}-${lesson.time}`,
    studentId: member.id,
    price: studentPriceForDuration(member, lessonDurationMinutes(lesson))
  }));
  const plan = sumLessonPrices(virtualLessons);
  const paid = virtualLessons.reduce((total, item) => total + (paymentAllocationForStudent(item.studentId).get(item.id) || 0), 0);
  const unpaid = Math.max(0, plan - paid);
  return { paid, debt: unpaid, unpaid, done: plan > 0 && unpaid === 0 };
}

function groupLessonKey(lesson) {
  return `${lesson.groupId}|${lesson.date}|${lesson.time}`;
}

function groupLessonConducted(lesson) {
  return Boolean(state.groupAttendance?.[groupLessonKey(lesson)]?.conducted);
}

function lessonConductedForStudent(lesson, studentId) {
  if (lesson.groupId) {
    const attendance = state.groupAttendance?.[groupLessonKey(lesson)];
    return Boolean(attendance?.conducted && attendance.present?.[studentId]);
  }
  return Boolean(lesson.conducted);
}

function conductedAmountForStudent(studentId) {
  return payableLessonsForStudent(studentId)
    .filter((lesson) => lessonConductedForStudent(lesson, studentId))
    .reduce((total, lesson) => total + lessonPrice(lesson), 0);
}

function paidAmountForStudent(studentId) {
  return balancePayments()
    .filter((payment) => payment.studentId === studentId)
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
}

function balanceAmountForStudent(studentId) {
  return paidAmountForStudent(studentId) - conductedAmountForStudent(studentId);
}

function lessonStatus(lesson) {
  if (isPersonalEvent(lesson)) return { paid: 0, debt: 0, unpaid: 0, done: false };
  if (lesson.groupId && !lesson.studentId) return groupLessonStatus(lesson);
  const price = lessonPrice(lesson);
  const paid = Math.min(price, paymentsForLesson(lesson));
  const unpaid = Math.max(0, price - paid);
  return { paid, debt: unpaid, unpaid, done: unpaid === 0 };
}

function prepaidLessonsLeft(studentId) {
  const today = todayIso();
  const allocation = paymentAllocationForStudent(studentId);
  return payableLessonsForStudent(studentId)
    .filter((lesson) => lesson.date >= today)
    .filter((lesson) => (allocation.get(lesson.id) || 0) >= lessonPrice(lesson))
    .length;
}

function studentBalance(studentId) {
  const lessons = payableLessonsForStudent(studentId);
  const plan = sumLessonPrices(lessons);
  const paid = paidAmountForStudent(studentId);
  const consumed = conductedAmountForStudent(studentId);
  const balance = balanceAmountForStudent(studentId);
  const price = lessonPriceForBalance(studentId, lessons);
  const lessonsLeft = price > 0 ? Math.max(0, Math.floor(balance / price)) : 0;
  return { plan, paid, consumed, balance, lessonsLeft, advance: Math.max(0, balance), debt: Math.max(0, -balance), unpaid: Math.max(0, -balance) };
}

function lessonPriceForBalance(studentId, lessons = payableLessonsForStudent(studentId)) {
  const today = todayIso();
  const nextLesson = lessons
    .filter((lesson) => lesson.date >= today)
    .filter((lesson) => !lessonConductedForStudent(lesson, studentId))
    .sort(sortByDateTime)[0] || lessons.sort(sortByDateTime)[0];
  if (nextLesson) return lessonPrice(nextLesson);
  const owner = student(studentId);
  return studentPriceForDuration(owner, owner.lessonDuration || 60);
}

function studentCreditAmount(studentId) {
  return balanceAmountForStudent(studentId);
}

function paidLessonsLeftForStudent(studentId) {
  return prepaidLessonsLeft(studentId);
}

function directPaymentsForLesson(lesson) {
  return balancePayments().filter((payment) => payment.scope !== "month" && payment.studentId === lesson.studentId && (payment.lessonId === lesson.id || payment.lessonDate === lesson.date));
}

function nextLessonForStudent(lesson) {
  const current = `${lesson.date} ${lesson.time}`;
  return plannedLessons()
    .filter((item) => item.id !== lesson.id && item.studentId === lesson.studentId && `${item.date} ${item.time}` > current)
    .sort(sortByDateTime)[0] || null;
}

function transferLessonPayments(lesson, nextLesson) {
  const directPayments = directPaymentsForLesson(lesson);
  if (!directPayments.length) return;
  directPayments.forEach((payment) => {
    if (nextLesson) {
      payment.lessonId = nextLesson.id;
      payment.lessonDate = nextLesson.date;
      payment.note = "Перенесено на следующее занятие";
    } else {
      payment.lessonId = "";
      payment.lessonDate = "";
      payment.note = "Аванс после освобождения слота";
    }
  });
}

function freeLessonById(lessonId) {
  const lesson = state.lessons.find((item) => item.id === lessonId);
  if (!lesson) return;
  rememberUndo();
  excludeRegularSlotForLesson(lesson, lesson.date, lesson.time);
  state.lessons = state.lessons.filter((item) => item.id !== lesson.id);
  state.selectedDate = lesson.date;
  save();
  render();
  showToast("Слот освобожден");
}

function addExclusion(studentId, date, time) {
  if (!studentId || !date || !time) return;
  state.exclusions ||= [];
  const exists = state.exclusions.some((item) => item.studentId === studentId && item.date === date && item.time === time);
  if (!exists) state.exclusions.push({ studentId, date, time });
}

function addGroupExclusion(groupId, date, time) {
  if (!groupId || !date || !time) return;
  state.exclusions ||= [];
  const exists = state.exclusions.some((item) => item.groupId === groupId && item.date === date && item.time === time);
  if (!exists) state.exclusions.push({ groupId, date, time });
}

function removeExclusion(studentId, date, time) {
  if (!studentId || !date || !time) return;
  state.exclusions = (state.exclusions || []).filter((item) => !(item.studentId === studentId && item.date === date && item.time === time));
}

function removeGroupExclusion(groupId, date, time) {
  if (!groupId || !date || !time) return;
  state.exclusions = (state.exclusions || []).filter((item) => !(item.groupId === groupId && item.date === date && item.time === time));
}

function lessonBelongsToRegularSchedule(lesson) {
  if (!lesson.studentId || isPersonalEvent(lesson)) return false;
  return Boolean(regularEntryForDateTime(student(lesson.studentId), lesson.date, lesson.time));
}

function excludeRegularSlotForLesson(lesson, date, time) {
  if (lesson?.groupId) {
    addGroupExclusion(lesson.groupId, date, time);
    return;
  }
  if (!lesson?.studentId || isPersonalEvent(lesson)) return;
  const regularCandidate = { ...lesson, date, time };
  if (lesson.expected || lesson.source === "regular" || lessonBelongsToRegularSchedule(regularCandidate)) {
    addExclusion(lesson.studentId, date, time);
  }
}

function toggleConducted(lessonId) {
  const lesson = state.lessons.find((item) => item.id === lessonId);
  if (!lesson) return;
  lesson.conducted = !lesson.conducted;
  save();
  render();
}

function bindNavigation() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      views.forEach((view) => {
        el(`view-${view}`).classList.toggle("active", view === button.dataset.view);
        document.querySelector(`.tab[data-view="${view}"]`).classList.toggle("active", view === button.dataset.view);
      });
      render();
    });
  });
  document.querySelectorAll(".mode").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      save();
      render();
    });
  });
  el("settingsBtn").addEventListener("click", () => {
    prepareSettingsForm();
    el("settingsDialog").showModal();
  });
}

function bindSwipeNavigation() {
  const main = document.querySelector("main");
  let startX = 0;
  let startY = 0;
  let skipSwipe = false;
  main.addEventListener("touchstart", (event) => {
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    skipSwipe = Boolean(event.target.closest(".week-strip, .slot-grid, .calendar-grid, .mode-switch, dialog"));
  }, { passive: true });
  main.addEventListener("touchend", (event) => {
    if (skipSwipe) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    const current = views.indexOf(activeView());
    const next = dx < 0 ? Math.min(views.length - 1, current + 1) : Math.max(0, current - 1);
    if (next === current) return;
    document.querySelector(`.tab[data-view="${views[next]}"]`).click();
  }, { passive: true });
}

function bindDialogs() {
  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.open === "studentDialog") prepareStudentForm();
      if (button.dataset.open === "groupDialog") prepareGroupForm();
      if (button.dataset.open === "paymentDialog") preparePaymentForm();
      el(button.dataset.open).showModal();
    });
  });
  document.querySelectorAll('dialog button[value="cancel"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      button.closest("dialog").close();
    });
  });
  el("paymentForm").studentId.addEventListener("change", updatePaymentPayerInfo);
  el("studentForm").format.addEventListener("change", updateStudentFormatFields);
  el("studentForm").onlineLink.addEventListener("input", (event) => setOnlineLink("studentOnlineLinkOpen", event.target.value));
  el("studentForm").lessonsPerWeek.addEventListener("change", () => updateVisibleRegularRows(el("studentForm")));
  el("groupForm").onlineLink.addEventListener("input", (event) => setOnlineLink("groupOnlineLinkOpen", event.target.value));
  el("groupForm").lessonsPerWeek.addEventListener("change", () => updateVisibleRegularRows(el("groupForm")));
  el("lessonForm").studentId.addEventListener("change", () => updateLessonStudentDefaults(el("lessonForm")));
  el("lessonForm").groupId.addEventListener("change", () => updateLessonGroupDefaults(el("lessonForm")));
  el("lessonForm").date.addEventListener("change", () => {
    updateLessonGroupDefaults(el("lessonForm"));
    updateLessonStudentDefaults(el("lessonForm"), { syncSubject: false, syncPrice: false });
  });
  el("lessonForm").time.addEventListener("change", () => {
    updateLessonGroupDefaults(el("lessonForm"));
    updateLessonStudentDefaults(el("lessonForm"), { syncSubject: false, syncPrice: false });
  });
  el("lessonForm").endTime.addEventListener("change", () => updateLessonStudentDefaults(el("lessonForm"), { syncSubject: false, syncEnd: false }));
  el("editLessonForm").studentId.addEventListener("change", () => updateLessonStudentDefaults(el("editLessonForm"), { linkId: "editLessonOnlineLink" }));
  el("editLessonForm").endTime.addEventListener("change", () => updateLessonStudentDefaults(el("editLessonForm"), { linkId: "editLessonOnlineLink", syncSubject: false, syncEnd: false }));
  document.querySelectorAll("[data-copy-online]").forEach((button) => {
    button.addEventListener("click", () => copyOnlineLink(button.dataset.copyOnline));
  });
  el("freeLessonFormBtn").addEventListener("click", freeLessonFromForm);
  el("conductedExpectedBtn").addEventListener("click", markExpectedConductedFromForm);
  el("conductedLessonBtn").addEventListener("click", toggleConductedFromEditForm);
  el("deletePaymentBtn").addEventListener("click", archivePayment);
  el("lessonForm").addEventListener("submit", saveLesson);
  document.querySelectorAll('#lessonForm input[name="itemType"]').forEach((input) => {
    input.addEventListener("change", () => updateLessonFormType(el("lessonForm")));
  });
  el("paymentForm").addEventListener("submit", savePayment);
  el("studentForm").addEventListener("submit", saveStudent);
  el("groupForm").addEventListener("submit", saveGroup);
  el("archiveGroupBtn").addEventListener("click", archiveGroup);
  el("groupLessonForm").addEventListener("submit", saveGroupLessonAttendance);
  el("freeGroupLessonBtn").addEventListener("click", freeGroupLessonFromDialog);
  el("conductedGroupLessonBtn").addEventListener("click", markGroupLessonConductedFromDialog);
  el("moveForm").addEventListener("submit", moveLesson);
  el("settingsForm").addEventListener("submit", saveSettings);
  el("clearLocalDataBtn").addEventListener("click", clearLocalData);
  el("dayAiBtn").addEventListener("click", openDayAiDialog);
  el("generateDayAiBtn").addEventListener("click", generateDayAi);
  el("checkAiAccessBtn").addEventListener("click", checkAiAccessFromPaywall);
  el("openPaymentSiteBtn").addEventListener("click", openPaymentSite);
  el("shareAppBtn").addEventListener("click", shareApp);
  el("rateAppBtn").addEventListener("click", openRustoreReview);
  el("supportProjectBtn").addEventListener("click", openSupportProject);
  el("reviewRateBtn").addEventListener("click", () => {
    saveReviewState({ never: true, ratedAt: new Date().toISOString() });
    el("reviewDialog").close();
    openRustoreReview();
  });
  el("reviewLaterBtn").addEventListener("click", () => {
    saveReviewState({ laterUntil: addDays(new Date(), 7).toISOString() });
    el("reviewDialog").close();
  });
  el("reviewNeverBtn").addEventListener("click", () => {
    saveReviewState({ never: true });
    el("reviewDialog").close();
  });
  el("helpBtn").addEventListener("click", () => el("helpDialog").showModal());
  el("exportDataBtn").addEventListener("click", exportDataBackup);
  el("importDataBtn").addEventListener("click", () => el("importDataInput").click());
  el("importDataInput").addEventListener("change", importDataBackup);
  ["studentsSearch", "groupsSearch", "paymentsSearch"].forEach((id) => {
    el(id).addEventListener("input", renderCurrentView);
  });
  el("editLessonForm").addEventListener("submit", saveEditedLesson);
  el("deleteLessonBtn").addEventListener("click", deleteEditedLesson);
}

function prepareSettingsForm() {
  const form = el("settingsForm");
  state.timezone = allowedTimezone(state.timezone || "Europe/Moscow");
  form.timezone.value = state.timezone;
  form.workStart.value = state.workStart || "09:00";
  form.workEnd.value = state.workEnd || "22:00";
  form.reminderEnabled.checked = Boolean(state.reminderEnabled);
  form.reminderLeadMinutes.value = String(state.reminderLeadMinutes || 15);
  form.reminderMode.value = state.reminderMode || "sound";
  form.reminderMelody.value = state.reminderMelody || "soft";
}

function saveSettings(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  state.timezone = allowedTimezone(data.timezone);
  state.workStart = data.workStart || "09:00";
  state.workEnd = data.workEnd || "22:00";
  state.reminderEnabled = data.reminderEnabled === "on";
  state.reminderLeadMinutes = Number(data.reminderLeadMinutes || 15);
  state.reminderMode = data.reminderMode || "sound";
  state.reminderMelody = data.reminderMelody || "soft";
  save();
  requestReminderPermission();
  startReminderWatcher();
  el("settingsDialog").close();
  render();
}

function openDayAiDialog() {
  const date = dayAiDate();
  el("dayAiDate").textContent = dayAiDateLabel(date);
  el("dayAiOutput").textContent = state.lastDayAiDate === date && state.lastDayAiVersion === appVersion && state.lastDayAiText
    ? state.lastDayAiText
    : "Нажмите «Собрать день», чтобы получить сводку по занятиям, оплатам, свободным окнам и задачам.";
  el("dayAiDialog").showModal();
}

async function generateDayAi() {
  const box = el("dayAiOutput");
  box.textContent = "Собираю день...";
  const date = dayAiDate();
  const text = buildDayAiSummary(date);
  state.lastDayAiDate = date;
  state.lastDayAiVersion = appVersion;
  state.lastDayAiText = text;
  save();
  box.textContent = text;
}

async function getOrCreateDeviceToken() {
  state.installId ||= uuid();
  if (state.deviceToken) return state.deviceToken;
  const response = await apiFetch("/auth/device", {
    method: "POST",
    body: {
      installId: state.installId,
      appVersion,
      platform: "android",
      distributionChannel: appConfig.distributionChannel
    }
  }, false);
  state.deviceToken = response.deviceToken || "";
  save();
  return state.deviceToken;
}

async function fetchEntitlement() {
  await getOrCreateDeviceToken();
  const entitlement = await apiFetch("/me/entitlements", { method: "GET" }, true);
  state.aiEntitlement = normalizeAiEntitlement(entitlement);
  save();
  renderAiStatus();
  return state.aiEntitlement;
}

async function activateAiByEmail(email) {
  await getOrCreateDeviceToken();
  const entitlement = await apiFetch("/me/activate-by-email", {
    method: "POST",
    body: { email }
  }, true);
  state.aiEntitlement = normalizeAiEntitlement({ ...entitlement, email });
  save();
  renderAiStatus();
  return state.aiEntitlement;
}

async function callAiEndpoint(endpoint, payload) {
  await getOrCreateDeviceToken();
  return apiFetch(endpoint, { method: "POST", body: payload }, true);
}

async function apiFetch(endpoint, options = {}, withAuth = true) {
  const headers = { "Content-Type": "application/json" };
  if (withAuth) headers.Authorization = `Bearer ${state.deviceToken}`;
  const response = await fetch(`${appConfig.apiBaseUrl}${endpoint}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `API ${response.status}`);
    error.code = data.error;
    throw error;
  }
  return data;
}

function openAiPaywall(feature = "ai-pro") {
  el("aiPaywallFeature").textContent = aiFeatureLabel(feature);
  el("aiPaywallStatus").textContent = renderAiStatusText();
  el("aiPaywallMessage").textContent = "";
  el("aiEmailInput").value = state.aiEntitlement?.email || "";
  el("openPaymentSiteBtn").classList.toggle("hidden", !appConfig.enableExternalPaymentLink || !appConfig.paymentSiteUrl);
  el("aiPaywallDialog").showModal();
}

function aiFeatureLabel(feature) {
  return {
    "day-ai": "День AI",
    templates: "Шаблоны AI",
    materials: "Материалы AI",
    solver: "Решебник AI",
    marketing: "Маркетинг AI"
  }[feature] || "AI Pro";
}

async function checkAiAccessFromPaywall() {
  const message = el("aiPaywallMessage");
  const email = el("aiEmailInput").value.trim();
  message.textContent = "Проверяю доступ...";
  try {
    const entitlement = email ? await activateAiByEmail(email) : await fetchEntitlement();
    message.textContent = entitlement.active ? "AI Pro активен." : "Активного AI Pro пока нет.";
    if (entitlement.active) setTimeout(() => el("aiPaywallDialog").close(), 700);
  } catch (error) {
    message.textContent = `Не получилось проверить доступ. ${error.message || ""}`.trim();
  }
}

function openPaymentSite() {
  if (!appConfig.paymentSiteUrl) return;
  window.open(appConfig.paymentSiteUrl, "_blank", "noopener");
}

function openSupportProject() {
  window.open(SUPPORT_PROJECT_URL, "_blank", "noopener");
}

async function shareApp() {
  trackMarketingEvent("app_share_click");
  const text = "Я пользуюсь Repiq — бесплатным приложением для репетитора: ученики, расписание и оплаты без таблиц. Можно скачать здесь:";
  const message = `${text} ${REPIQ_SITE_URL}`;
  if (window.AndroidBackup?.shareText) {
    window.AndroidBackup.shareText("Поделиться Repiq", message);
    return;
  }
  try {
    if (navigator.share) {
      await navigator.share({ title: "Repiq", text, url: REPIQ_SITE_URL });
      return;
    }
    await copyText(message);
    showToast("Ссылка скопирована");
  } catch (error) {
    showToast("Ссылка: repiq.ru");
  }
}

async function openRustoreReview() {
  trackMarketingEvent("app_review_click");
  if (window.AndroidBackup?.openExternalUrl) {
    window.AndroidBackup.openExternalUrl(RUSTORE_APP_URL);
    showToast("Открываю RuStore");
    return;
  }
  window.open(RUSTORE_APP_URL, "_blank", "noopener");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  area.style.pointerEvents = "none";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function showToast(message) {
  const settingsDialog = el("settingsDialog");
  const settingsToast = el("settingsToast");
  if (settingsDialog?.open && settingsToast) {
    settingsToast.textContent = message;
    settingsToast.classList.add("visible");
    clearTimeout(showToast.settingsTimer);
    showToast.settingsTimer = setTimeout(() => {
      settingsToast.classList.remove("visible");
    }, 2200);
    return;
  }
  const toast = el("appToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("with-action");
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 2200);
}

function showUndoToast(message) {
  const toast = el("appToast");
  if (!toast) return;
  toast.innerHTML = `<span>${message}</span><button type="button">Отменить</button>`;
  toast.classList.add("visible", "with-action");
  toast.querySelector("button")?.addEventListener("click", undoLastAction, { once: true });
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("visible", "with-action");
  }, 5200);
}

function trackMarketingEvent(event) {
  if (!appConfig.apiBaseUrl || !event) return;
  fetch(`${appConfig.apiBaseUrl}/api/marketing-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, source: "app", campaign: "organic_launch", createdAt: new Date().toISOString() })
  }).catch(() => {});
}

function reviewState() {
  try {
    return JSON.parse(localStorage.getItem(reviewStateKey) || "{}");
  } catch {
    return {};
  }
}

function saveReviewState(patch) {
  localStorage.setItem(reviewStateKey, JSON.stringify({ ...reviewState(), ...patch }));
}

function maybeShowReviewRequest() {
  const stored = reviewState();
  if (stored.never) return;
  if (stored.laterUntil && new Date(stored.laterUntil) > new Date()) return;
  if (stored.restoredAt) return;
  if (el("reviewDialog").open || document.querySelector("dialog[open]")) return;
  const conductedCount = plannedLessons().filter((lesson) => lesson.conducted || groupLessonConducted(lesson)).length;
  const hasEnoughStudents = state.students.filter((item) => !isStudentArchived(item)).length >= 3;
  const firstOpenAt = Number(localStorage.getItem("repiq-first-open-day") || 0);
  if (!firstOpenAt) {
    localStorage.setItem("repiq-first-open-day", String(Date.now()));
    return;
  }
  const usedThreeDays = Date.now() - firstOpenAt >= 3 * 24 * 60 * 60 * 1000;
  if (conductedCount >= 5 || (hasEnoughStudents && usedThreeDays) || usedThreeDays) {
    saveReviewState({ laterUntil: addDays(new Date(), 7).toISOString(), shownAt: new Date().toISOString() });
    el("reviewDialog").showModal();
  }
}

function renderAiStatus() {
  document.querySelectorAll("[data-ai-feature]").forEach((card) => {
    const active = Boolean(state.aiEntitlement?.active);
    card.classList.toggle("ai-active", active);
  });
  if (el("aiPaywallStatus")) el("aiPaywallStatus").textContent = renderAiStatusText();
}

function renderAiStatusText() {
  if (!state.aiEntitlement?.active) return "AI Pro не активен";
  const expires = state.aiEntitlement.expiresAt ? `до ${state.aiEntitlement.expiresAt.slice(0, 10)}` : "активен";
  const left = state.aiEntitlement.requestsLeft == null ? "" : ` · осталось запросов: ${state.aiEntitlement.requestsLeft}`;
  return `AI Pro ${expires}${left}`;
}

function dayAiPrompt() {
  const date = selectedDateLabel();
  const lessons = plannedLessons().filter((lesson) => lesson.date === state.selectedDate);
  const lessonList = lessons.length
    ? lessons.map((lesson) => {
        const owner = lesson.groupId ? group(lesson.groupId) : student(lesson.studentId);
        return `${lesson.time} ${owner.name} ${lesson.subject || owner.subject || ""}`.trim();
      }).join("; ")
    : "занятий в расписании нет";
  return [
    "Ты создаёшь бесплатный модуль День AI для приложения репетитора.",
    `Дата: ${date}.`,
    `Расписание дня: ${lessonList}.`,
    "Сделай один короткий позитивный лист дня на русском языке.",
    "Структура: Настрой дня, Фокус для уроков, Совет по общению, Маленькая радость, Фраза дня.",
    "Тон тёплый, спокойный, уверенный. Только позитив. Не пиши негативные прогнозы, запреты и медицинские советы.",
    "Объём до 130 слов."
  ].join("\n");
}

function selectedDateLabel() {
  return asDate(state.selectedDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function responseText(data) {
  if (data.output_text) return data.output_text.trim();
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("")
    .trim();
}

function dayAiDate() {
  return todayIso();
}

function dayAiDateLabel(date = dayAiDate()) {
  return asDate(date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function buildDayAiSummary(date = dayAiDate()) {
  const lessons = plannedLessons()
    .filter((lesson) => lesson.date === date)
    .sort(sortByDateTime);
  const studyLessons = lessons.filter((lesson) => !isPersonalEvent(lesson));
  const personalEvents = lessons.filter(isPersonalEvent);
  const totals = totalsFor(studyLessons);
  const unpaidRows = dayUnpaidRows(studyLessons);
  const missingLinks = dayMissingOnlineLinks(studyLessons);
  const needsConducted = studyLessons.filter((lesson) => !lessonConductedForSummary(lesson) && isPastLesson(lesson));
  const debtStudents = dayBalanceRisks(studyLessons);
  const freeWindows = dayFreeWindows(lessons, date).slice(0, 4);
  const firstLesson = studyLessons[0];
  const lastLesson = studyLessons[studyLessons.length - 1];
  const paidCount = studyLessons.filter((lesson) => lessonStatus(lesson).unpaid <= 0).length;
  const issueCount = unpaidRows.length + missingLinks.length + needsConducted.length + debtStudents.length;
  const lines = [`День AI · ${dayAiDateLabel(date)}`];

  lines.push("", "Главное:");
  lines.push(`• ${dayMoodLine(studyLessons.length, issueCount)}`);
  lines.push(`• Занятий: ${studyLessons.length} · оплачено: ${paidCount}/${studyLessons.length || 0} · сумма дня: ${money.format(totals.paid)} / ${money.format(totals.paid + totals.unpaid)}`);
  if (firstLesson && lastLesson) lines.push(`• Первый урок: ${firstLesson.time} · последний: до ${lessonEndsAt(lastLesson)}`);
  if (personalEvents.length) lines.push(`• Личных дел в сетке: ${personalEvents.length}`);

  lines.push("", "Фокус дня:");
  const focus = [];
  if (needsConducted.length) focus.push(`отметить проведённые уроки: ${needsConducted.map(lessonOwnerName).slice(0, 3).join(", ")}`);
  if (unpaidRows.length) focus.push(`проверить оплату: ${unpaidRows.length} зан.`);
  if (missingLinks.length) focus.push(`добавить ссылки: ${missingLinks.slice(0, 3).join(", ")}`);
  if (debtStudents.length) focus.push(`баланс в минусе: ${debtStudents.slice(0, 3).join(", ")}`);
  if (!focus.length) focus.push("критичных задач нет, можно вести день спокойно");
  focus.forEach((item) => lines.push(`• ${item}`));

  lines.push("", "Расписание:");
  if (!studyLessons.length) {
    lines.push("• Занятий нет. Можно поставить разовые уроки, личные дела или оставить окно для отдыха.");
  } else {
    studyLessons.slice(0, 10).forEach((lesson) => lines.push(`• ${lessonAiLine(lesson)}`));
    if (studyLessons.length > 10) lines.push(`• ещё ${studyLessons.length - 10} зан.`);
  }

  lines.push("", "Оплаты и баланс:");
  if (unpaidRows.length) {
    unpaidRows.slice(0, 6).forEach((row) => lines.push(`• ${row}`));
    if (unpaidRows.length > 6) lines.push(`• ещё ${unpaidRows.length - 6} неоплач.`);
  } else {
    lines.push("• По занятиям дня всё выглядит оплачено.");
  }
  if (debtStudents.length) lines.push(`• Баланс в минусе: ${debtStudents.slice(0, 4).join(", ")}`);

  lines.push("", "Свободные окна:");
  if (freeWindows.length) freeWindows.forEach((windowText) => lines.push(`• ${windowText}`));
  else lines.push("• Свободных окон в рабочем времени не видно.");

  lines.push("", "Что сделать:");
  const actions = [];
  if (needsConducted.length) actions.push(`отметить проведение: ${needsConducted.map(lessonOwnerName).slice(0, 3).join(", ")}`);
  if (missingLinks.length) actions.push(`проверить ссылку на урок в карточке: ${missingLinks.slice(0, 3).join(", ")}`);
  if (unpaidRows.length) actions.push("посмотреть неоплаченные занятия");
  if (freeWindows.length) actions.push(`использовать окно ${freeWindows[0]} для подготовки или переноса`);
  if (!actions.length) actions.push("ничего срочного, день собран");
  actions.slice(0, 5).forEach((action, index) => lines.push(`${index + 1}. ${action}`));

  return lines.join("\n");
}

function dayMoodLine(lessonCount, issueCount) {
  if (!lessonCount) return "День свободный: можно спокойно заняться планированием и материалами.";
  if (!issueCount) return "День выглядит собранным: расписание и оплаты без явных проблем.";
  if (issueCount <= 2) return "День рабочий: есть пара мелочей, которые лучше закрыть заранее.";
  return "День плотный: сначала закрыть риски, потом вести уроки по расписанию.";
}

function lessonAiLine(lesson) {
  const linkMark = lesson.onlineLink ? "" : " · нет ссылки";
  return `${lesson.time}-${lessonEndsAt(lesson)} · ${lessonOwnerName(lesson)} · ${lessonStatusLabel(lesson)}${linkMark}`;
}

function lessonOwnerName(lesson) {
  if (isPersonalEvent(lesson)) return lesson.title || "Личное дело";
  return lesson.groupId ? group(lesson.groupId).name : student(lesson.studentId).name;
}

function lessonConductedForSummary(lesson) {
  if (lesson.groupId) return groupLessonConducted(lesson);
  return Boolean(lesson.conducted);
}

function lessonStatusLabel(lesson) {
  if (lessonConductedForSummary(lesson)) return "проведено";
  const status = lessonStatus(lesson);
  if (status.unpaid > 0) return `не оплачено ${money.format(status.unpaid)}`;
  return "оплачено";
}

function dayUnpaidRows(lessons) {
  return lessons
    .map((lesson) => ({ lesson, status: lessonStatus(lesson), visual: lessonVisualClass(lesson) }))
    .filter((item) => item.visual.includes("debt") && item.status.unpaid > 0)
    .map((item) => `${item.lesson.time} · ${lessonOwnerName(item.lesson)} · ${money.format(item.status.unpaid)}`);
}

function dayMissingOnlineLinks(lessons) {
  return [...new Set(lessons
    .filter((lesson) => !lesson.onlineLink)
    .map(lessonOwnerName)
    .filter(Boolean))];
}

function dayBalanceRisks(lessons) {
  const studentIds = [...new Set(lessons
    .flatMap((lesson) => lesson.groupId ? groupStudents(lesson.groupId).map((item) => item.id) : [lesson.studentId])
    .filter(Boolean))];
  return studentIds
    .filter((studentId) => balanceAmountForStudent(studentId) < 0)
    .map((studentId) => `${student(studentId).name} ${money.format(Math.abs(balanceAmountForStudent(studentId)))}`);
}

function dayFreeWindows(dayLessons, date = dayAiDate()) {
  const slots = timeSlots(state.workStart || "09:00", state.workEnd || "22:00", 30);
  const windows = [];
  let start = "";
  let last = "";
  slots.forEach((time) => {
    const free = !lessonAtSlot(dayLessons, date, time);
    if (free && !start) start = time;
    if (free) last = time;
    if (!free && start) {
      addFreeWindow(windows, start, minutesToTime(timeToMinutes(last) + 30));
      start = "";
      last = "";
    }
  });
  if (start) addFreeWindow(windows, start, minutesToTime(timeToMinutes(last) + 30));
  return windows;
}

function addFreeWindow(windows, start, end) {
  if (timeToMinutes(end) - timeToMinutes(start) < 60) return;
  windows.push(`${start}-${end}`);
}

function exportDataBackup() {
  const fileName = `Репетитор-AI-резервная-копия-${todayIso()}.json`;
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), version: appVersion, data: state }, null, 2);
  if (window.AndroidBackup?.saveBackup) {
    window.AndroidBackup.saveBackup(fileName, payload);
    return;
  }
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  alert("Резервная копия сохранена в папку Загрузки.");
}

function importDataBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      const restored = parsed.data || parsed;
      if (!Array.isArray(restored.students) || !Array.isArray(restored.groups) || !Array.isArray(restored.lessons) || !Array.isArray(restored.payments)) {
        throw new Error("В файле нет данных приложения");
      }
      localStorage.setItem(storeKey, JSON.stringify(restored));
      saveReviewState({ restoredAt: new Date().toISOString() });
      state = load();
      save();
      render();
      alert("Резервная копия восстановлена.");
    } catch (error) {
      alert(`Не получилось восстановить копию: ${error.message || "проверьте файл"}`);
    } finally {
      event.target.value = "";
    }
  };
  reader.onerror = () => {
    alert("Не получилось прочитать файл резервной копии.");
    event.target.value = "";
  };
  reader.readAsText(file);
}

function clearLocalData() {
  const hasData = [state.students, state.groups, state.lessons, state.payments].some((items) => items?.length);
  if (hasData) {
    const backupFirst = window.confirm("Перед очисткой лучше сделать резервную копию. Нажмите ОК, чтобы сохранить копию и продолжить очистку. Отмена — вернуться в настройки.");
    if (!backupFirst) return;
    exportDataBackup();
  }
  const message = hasData
    ? "Резервная копия сохранена или уже готовится. Очистить всех учеников, группы, оплаты и расписание только на этом устройстве?"
    : "База уже пустая. Сбросить настройки на этом устройстве?";
  if (!window.confirm(message)) return;
  localStorage.removeItem(storeKey);
  localStorage.removeItem(oldStoreKey);
  state = load();
  save();
  prepareSettingsForm();
  render();
  showToast("База очищена");
}

function demoDayAiText() {
  const date = selectedDateLabel();
  const lessons = plannedLessons().filter((lesson) => lesson.date === state.selectedDate).length;
  return [
    `${date}`,
    "",
    "Настрой дня: сегодня хороший день для спокойных объяснений и маленьких побед.",
    `Фокус для уроков: ${lessons ? "дать каждому ученику одно понятное ощущение прогресса" : "бережно подготовить пространство для будущих занятий"}.`,
    "Совет по общению: начинайте с того, что уже получается, а потом мягко переходите к трудному.",
    "Маленькая радость: отметьте одну удачную мысль после каждого урока.",
    "Фраза дня: сегодня мы не спешим, а собираем уверенность."
  ].join("\n");
}

function requestReminderPermission() {
  try {
    if (!state.reminderEnabled || !("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission();
  } catch (error) {
    console.warn("Notification permission is unavailable", error);
  }
}

function startReminderWatcher() {
  if (reminderTimer) clearInterval(reminderTimer);
  checkLessonReminders();
  reminderTimer = setInterval(checkLessonReminders, 60000);
}

function checkLessonReminders() {
  try {
    if (!state.reminderEnabled) return;
    const now = new Date();
    const lead = Number(state.reminderLeadMinutes || 15);
    plannedLessons()
      .filter((lesson) => !lessonAlreadyDone(lesson))
      .forEach((lesson) => {
        const diffMinutes = (lessonDateTime(lesson) - now) / 60000;
        if (diffMinutes < 0 || diffMinutes > lead) return;
        const key = reminderKey(lesson, lead);
        if (state.reminderLog[key]) return;
        state.reminderLog[key] = new Date().toISOString();
        save();
        fireLessonReminder(lesson, Math.max(0, Math.round(diffMinutes)));
      });
  } catch (error) {
    console.warn("Lesson reminder check failed", error);
  }
}

function lessonAlreadyDone(lesson) {
  if (lesson.groupId) return groupLessonConducted(lesson);
  return Boolean(lesson.conducted);
}

function reminderKey(lesson, lead) {
  return `${lesson.groupId || lesson.studentId}|${lesson.date}|${lesson.time}|${lead}`;
}

function fireLessonReminder(lesson, minutesLeft) {
  const owner = lesson.groupId ? group(lesson.groupId) : student(lesson.studentId);
  const title = minutesLeft > 0 ? `Урок через ${minutesLeft} мин.` : "Урок начинается";
  const body = `${owner.name} · ${lesson.subject || owner.subject || ""} · ${lesson.time}`;
  if (state.reminderMode === "sound" || state.reminderMode === "both") playReminderSound();
  if ((state.reminderMode === "vibration" || state.reminderMode === "both") && navigator.vibrate) navigator.vibrate([250, 120, 250]);
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
  } catch (error) {
    console.warn("Notification is unavailable", error);
  }
}

function playReminderSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  let context;
  try {
    context = new AudioContext();
  } catch (error) {
    console.warn("Audio reminder is unavailable", error);
    return;
  }
  const notes = {
    soft: [660, 880],
    bell: [880, 1175, 880],
    short: [740]
  }[state.reminderMelody || "soft"] || [660, 880];
  notes.forEach((frequency, index) => {
    const start = context.currentTime + index * 0.22;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.2);
  });
}

function saveLesson(event) {
  event.preventDefault();
  createLessonFromForm(event.currentTarget, false);
  el("lessonDialog").close();
  event.currentTarget.reset();
}

function savePayment(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const payment = { id: data.paymentId || uuid(), ...data, amount: Number(data.amount) };
  delete payment.paymentId;
  payment.scope = "lesson";
  payment.lessonDate = payment.paidAt;
  const lesson = plannedLessons().find((item) => item.studentId === payment.studentId && item.date >= payment.paidAt);
  if (lesson) payment.lessonId = lesson.id;
  delete payment.month;
  const existingIndex = state.payments.findIndex((item) => item.id === payment.id);
  if (existingIndex >= 0) {
    payment.archived = Boolean(state.payments[existingIndex].archived);
    state.payments[existingIndex] = payment;
  }
  else state.payments.push(payment);
  save();
  el("paymentDialog").close();
  event.currentTarget.reset();
  render();
}

function archivePayment(event) {
  event.preventDefault();
  event.stopPropagation();
  const form = el("paymentForm");
  const paymentId = new FormData(form).get("paymentId");
  if (!paymentId) {
    el("paymentDialog").close();
    return;
  }
  const payment = state.payments.find((item) => item.id === paymentId);
  if (payment) payment.archived = true;
  save();
  el("paymentDialog").close();
  form.reset();
  render();
}

function restorePayment(id) {
  const payment = state.payments.find((item) => item.id === id);
  if (!payment) return;
  payment.archived = false;
  save();
  render();
}

function deletePaymentForever(id) {
  const payment = state.payments.find((item) => item.id === id);
  if (!payment) return;
  if (!payment.archived) {
    alert("Сначала отправьте оплату в архив.");
    return;
  }
  state.payments = state.payments.filter((item) => item.id !== id);
  save();
  render();
}

function restoreStudent(studentId) {
  const item = student(studentId);
  if (!item.id) return;
  item.status = "Пауза";
  save();
  render();
}

function deleteStudentForever(studentId) {
  const item = student(studentId);
  if (!item.id) return;
  if (!isStudentArchived(item)) {
    alert("Сначала отправьте ученика в архив.");
    return;
  }
  const balance = Math.round(studentBalance(studentId).balance);
  if (balance !== 0) {
    alert(`Нельзя удалить ученика совсем: баланс ${money.format(balance)}. Сначала нужно закрыть баланс в ноль.`);
    return;
  }
  state.students = state.students.filter((studentItem) => studentItem.id !== studentId);
  state.lessons = state.lessons.filter((lesson) => lesson.studentId !== studentId);
  state.payments = state.payments.filter((payment) => payment.studentId !== studentId);
  state.exclusions = (state.exclusions || []).filter((excluded) => excluded.studentId !== studentId);
  Object.values(state.groupAttendance || {}).forEach((attendance) => {
    if (attendance.present) delete attendance.present[studentId];
  });
  save();
  render();
}

function saveStudent(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const hasIndividual = studentHasIndividualSchedule(data.format);
  const regularSlots = hasIndividual ? regularSlotsFromForm(data, Number(data.lessonsPerWeek || 1)) : [];
  const groupId = studentHasGroup(data.format) ? data.groupId : "";
  const existing = state.students.find((item) => item.id === data.studentId);
  if (existing) {
    const oldRegularSlots = normalizeRegularSlots(existing);
    const oldScheduleStartDate = existing.scheduleStartDate || "";
    const oldScheduleEndDate = existing.scheduleEndDate || "";
    Object.assign(existing, {
      name: data.name,
      subject: data.subject,
      grade: data.grade,
      format: data.format,
      groupId,
      status: data.status,
      studentNote: data.studentNote || "",
      lessonsPerWeek: Number(data.lessonsPerWeek || 1),
      regularSchedule: regularSlotsText(regularSlots),
      regularSlots,
      scheduleStartDate: regularSlots.length ? data.scheduleStartDate : "",
      scheduleEndDate: regularSlots.length ? data.scheduleEndDate : "",
      phone: data.phone,
      parentName: data.parentName,
      parentPhone: data.parentPhone,
      price: Number(data.price),
      lessonDuration: Number(data.lessonDuration || 60),
      onlineLink: data.onlineLink || ""
    });
    syncStudentRegularScheduleAfterChange(existing.id, oldRegularSlots, oldScheduleStartDate, oldScheduleEndDate);
  } else {
    state.students.push({ id: `S${String(state.students.length + 1).padStart(3, "0")}`, ...data, format: data.format, groupId, grade: data.grade, studentNote: data.studentNote || "", onlineLink: data.onlineLink || "", regularSchedule: regularSlotsText(regularSlots), regularSlots, scheduleStartDate: regularSlots.length ? data.scheduleStartDate : "", scheduleEndDate: regularSlots.length ? data.scheduleEndDate : "", lessonsPerWeek: Number(data.lessonsPerWeek || 1), price: Number(data.price), lessonDuration: Number(data.lessonDuration || 60) });
  }
  save();
  el("studentDialog").close();
  event.currentTarget.reset();
  render();
}

function saveGroup(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const regularSlots = regularSlotsFromForm(data, Number(data.lessonsPerWeek || 1));
  const existing = state.groups.find((item) => item.id === data.groupId);
  const payload = {
    name: data.name,
    subject: data.subject,
    grade: data.grade,
    status: data.status,
    archived: data.status === "Завершена",
    lessonsPerWeek: Number(data.lessonsPerWeek || 1),
    onlineLink: data.onlineLink || "",
    regularSchedule: regularSlotsText(regularSlots),
    regularSlots,
    scheduleStartDate: regularSlots.length ? data.scheduleStartDate : "",
    scheduleEndDate: regularSlots.length ? data.scheduleEndDate : ""
  };
  if (existing) {
    const oldRegularSlots = normalizeRegularSlots(existing);
    const oldScheduleStartDate = existing.scheduleStartDate || "";
    const oldScheduleEndDate = existing.scheduleEndDate || "";
    Object.assign(existing, payload);
    syncGroupRegularScheduleAfterChange(existing.id, oldRegularSlots, oldScheduleStartDate, oldScheduleEndDate);
  } else state.groups.push({ id: `G${String(state.groups.length + 1).padStart(3, "0")}`, ...payload });
  if (payload.archived) detachGroupStudents(data.groupId);
  save();
  el("groupDialog").close();
  event.currentTarget.reset();
  render();
}

function archiveGroup(event) {
  event.preventDefault();
  const form = el("groupForm");
  const groupId = form.groupId.value;
  const item = state.groups.find((groupItem) => groupItem.id === groupId);
  if (!item) return;
  item.archived = true;
  item.status = "Завершена";
  detachGroupStudents(groupId);
  Object.keys(state.groupAttendance || {}).forEach((key) => {
    if (key.startsWith(`${groupId}|`)) delete state.groupAttendance[key];
  });
  save();
  el("groupDialog").close();
  form.reset();
  render();
}

function restoreGroup(groupId) {
  const item = state.groups.find((groupItem) => groupItem.id === groupId);
  if (!item) return;
  item.archived = false;
  item.status = item.status === "Завершена" ? "Пауза" : item.status || "Пауза";
  save();
  render();
}

function deleteGroupForever(groupId) {
  const item = state.groups.find((groupItem) => groupItem.id === groupId);
  if (!item) return;
  if (!item.archived) {
    alert("Сначала отправьте группу в архив.");
    return;
  }
  detachGroupStudents(groupId);
  state.groups = state.groups.filter((groupItem) => groupItem.id !== groupId);
  state.lessons = state.lessons.filter((lesson) => lesson.groupId !== groupId);
  Object.keys(state.groupAttendance || {}).forEach((key) => {
    if (key.startsWith(`${groupId}|`)) delete state.groupAttendance[key];
  });
  save();
  render();
}

function detachGroupStudents(groupId, data = state) {
  data.students
    .filter((studentItem) => studentItem.groupId === groupId)
    .forEach((studentItem) => {
      studentItem.groupId = "";
      studentItem.format = "Индивидуально";
    });
}

function detachArchivedGroupStudents(data = state) {
  (data.groups || [])
    .filter((groupItem) => groupItem.archived)
    .forEach((groupItem) => detachGroupStudents(groupItem.id, data));
}

function autoArchiveOldPayments(data = state) {
  const today = isoDateInTimezone(new Date(), data.timezone || "Europe/Moscow");
  (data.payments || []).forEach((payment) => {
    const paidAt = payment.paidAt || payment.lessonDate || payment.month;
    if (!paidAt || payment.archived) return;
    const archiveDate = addMonthsIso(paidAt.slice(0, 10), 1);
    if (archiveDate <= today) payment.archived = true;
  });
}

function addMonthsIso(dateText, months) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setMonth(date.getMonth() + months);
  return isoDate(date);
}

function loadRegularSchedule() {
  const start = asDate(state.selectedDate);
  const end = addDays(start, 56);
  const expected = expectedLessonsForRange(start, end);
  let created = 0;
  for (const lesson of expected) {
    const exists = state.lessons.some((item) => item.studentId === lesson.studentId && item.date === lesson.date && item.time === lesson.time);
    if (exists) continue;
    state.lessons.push({ ...lesson, id: uuid(), expected: false, conducted: false, source: "regular" });
    created++;
  }
  save();
  render();
  alert(`Подгружено слотов: ${created}`);
}

function moveLesson(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const lesson = state.lessons.find((item) => item.id === data.lessonId) || plannedLessons().find((item) => item.id === data.lessonId);
  if (lesson) {
    rememberUndo();
    const oldDate = lesson.date;
    const oldTime = lesson.time;
    excludeRegularSlotForLesson(lesson, oldDate, oldTime);
    const movedLesson = lesson.expected
      ? { ...lesson, id: uuid(), expected: false, conducted: false, source: "manual" }
      : lesson;
    movedLesson.movedFrom = `${oldDate} ${oldTime}`;
    movedLesson.date = data.date;
    movedLesson.time = data.time;
    movedLesson.note = data.reason ? `${movedLesson.note || ""} Перенос: ${data.reason}`.trim() : movedLesson.note;
    removeExclusion(movedLesson.studentId, movedLesson.date, movedLesson.time);
    removeGroupExclusion(movedLesson.groupId, movedLesson.date, movedLesson.time);
    if (lesson.expected) state.lessons.push(movedLesson);
    state.selectedDate = data.date;
  }
  save();
  el("moveDialog").close();
  render();
  showUndoToast("Урок перенесен");
}

function moveGroupLessonFromDialog(event) {
  event.preventDefault();
  const lessonId = el("groupLessonForm").lessonId.value;
  el("groupLessonDialog").close();
  openMoveDialog(lessonId);
}

function markGroupLessonConductedFromDialog(event) {
  event.preventDefault();
  el("groupLessonMembers").querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.checked = true;
  });
  el("conductedGroupLessonBtn").classList.add("active");
}

function freeGroupLessonFromDialog(event) {
  event.preventDefault();
  const form = el("groupLessonForm");
  const groupId = form.groupId.value;
  const date = form.originalDate.value || form.date.value;
  const time = form.originalTime.value || form.time.value;
  if (!groupId || !date || !time) return;
  rememberUndo();
  addGroupExclusion(groupId, date, time);
  delete state.groupAttendance[groupLessonKey({ groupId, date, time })];
  state.lessons = state.lessons.filter((lesson) => !(lesson.groupId === groupId && lesson.date === date && lesson.time === time));
  state.selectedDate = date;
  save();
  el("groupLessonDialog").close();
  render();
  showToast("Групповой слот освобожден");
}

function render() {
  if (cleanupHiddenStoredLessons()) save();
  fillStudentSelects();
  renderHeader();
  renderCurrentView();
  setTimeout(maybeShowReviewRequest, 600);
}

function activeView() {
  return document.querySelector(".tab.active")?.dataset.view || "home";
}

function renderCurrentView() {
  const view = activeView();
  if (view === "home") {
    renderMetrics();
    renderPlan();
  } else if (view === "students") {
    renderStudents();
  } else if (view === "groups") {
    renderGroups();
  } else if (view === "payments") {
    renderPayments();
  }
}

function fillStudentSelects() {
  document.querySelectorAll("select[name='studentId']").forEach((select) => {
    const current = select.value;
    select.innerHTML = state.students.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
    select.value = current || state.students[0]?.id || "";
  });
  document.querySelectorAll("select[name='groupId']").forEach((select) => {
    const current = select.value;
    const activeGroups = state.groups.filter((item) => !item.archived);
    select.innerHTML = `<option value="">-</option>${activeGroups.map((item) => `<option value="${item.id}">${item.name}</option>`).join("")}`;
    select.value = current || "";
  });
}

function renderHeader() {
  const today = new Date();
  el("todayTitle").textContent = today.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: state.timezone || "Europe/Moscow" });
  el("helpBtn").textContent = `v${appVersion.split("-").pop()}`;
  document.querySelectorAll(".mode").forEach((button) => button.classList.toggle("active", button.dataset.mode === state.mode));
}

function renderMetrics() {
  el("metrics").innerHTML = [
    metric("Материалы AI", "готовый урок за 60 сек", "презентация, конспект, домашка", "materials"),
    metric("Решебник AI", "по фото и в диалоге", "решение и комментарии", "solver"),
    metric("Шаблоны AI", "сообщения и правила", "оплаты, отмены, договоренности", "templates"),
    metric("Маркетинг AI", "поиск учеников", "анкеты, площадки, заявки", "marketing")
  ].join("");
  document.querySelectorAll("[data-ai-feature]").forEach((card) => {
    card.addEventListener("click", () => openAiPaywall(card.dataset.aiFeature));
  });
  renderAiStatus();
}

function paymentsForMonth(month) {
  return balancePayments()
    .filter((item) => (item.paidAt || item.lessonDate || item.month || "").startsWith(month))
    .reduce((total, item) => total + Number(item.amount || 0), 0);
}

function paidForLessonsInMonth(month) {
  return plannedLessons()
    .filter((lesson) => lesson.date.startsWith(month))
    .reduce((total, lesson) => total + lessonStatus(lesson).paid, 0);
}

function timezoneLabel() {
  return timezoneShortLabel(state.timezone);
}

function timezoneShortLabel(timezone) {
  const labels = {
    "Europe/Kaliningrad": "МСК-1",
    "Europe/Moscow": "МСК",
    "Europe/Samara": "МСК+1",
    "Asia/Yekaterinburg": "МСК+2",
    "Asia/Omsk": "МСК+3",
    "Asia/Krasnoyarsk": "МСК+4",
    "Asia/Irkutsk": "МСК+5",
    "Asia/Yakutsk": "МСК+6",
    "Asia/Vladivostok": "МСК+7",
    "Asia/Magadan": "МСК+8",
    "Asia/Kamchatka": "МСК+9"
  };
  return labels[timezone] || "МСК";
}

function timezoneFullLabel(timezone) {
  const labels = {
    "Europe/Kaliningrad": "МСК-1",
    "Europe/Moscow": "МСК",
    "Europe/Samara": "МСК+1",
    "Asia/Yekaterinburg": "МСК+2",
    "Asia/Omsk": "МСК+3",
    "Asia/Krasnoyarsk": "МСК+4",
    "Asia/Irkutsk": "МСК+5",
    "Asia/Yakutsk": "МСК+6",
    "Asia/Vladivostok": "МСК+7",
    "Asia/Magadan": "МСК+8",
    "Asia/Kamchatka": "МСК+9"
  };
  return labels[timezone] || "МСК";
}

function visibleTimeSlots() {
  const start = state.workStart || "09:00";
  const end = state.workEnd || "22:00";
  return start <= end ? timeSlots(start, end, 30) : timeSlots("09:00", "22:00", 30);
}

function appStartDate() {
  const dates = [
    ...state.lessons.map((lesson) => lesson.date),
    ...state.payments.map((payment) => payment.paidAt || payment.lessonDate || payment.month),
    ...state.students.map((item) => item.scheduleStartDate),
    ...state.groups.map((item) => item.scheduleStartDate)
  ].filter(Boolean).map((value) => value.length === 7 ? `${value}-01` : value);
  return dates.length ? dates.sort()[0] : todayIso();
}

function monthKeysForYear(year) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}

function periodBeforeUse(key) {
  const start = appStartDate().slice(0, key.length);
  return key < start;
}

function visibleYears() {
  const startYear = asDate(appStartDate()).getFullYear() - 1;
  const selectedYear = asDate(state.selectedDate).getFullYear();
  const endYear = Math.max(new Date().getFullYear(), selectedYear) + 1;
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function metric(label, value, hint = "", feature = "ai-pro") {
  return `<button type="button" class="metric ai-metric" data-ai-feature="${feature}"><span>${label}</span><strong>${value}</strong>${hint ? `<small>${hint}</small>` : ""}</button>`;
}

function renderPlan() {
  el("calendarGrid").innerHTML = "";
  el("calendarGrid").classList.remove("month-calendar", "year-calendar");
  el("timeline").innerHTML = "";
  el("weekStrip").innerHTML = "";
  el("weekStrip").classList.remove("week-totals-strip");
  el("slotGrid").innerHTML = "";
  if (state.mode === "day") {
    el("planTitle").textContent = "День";
    renderWeekStrip();
    renderTimeline();
  } else if (state.mode === "week") {
    el("planTitle").textContent = "Неделя";
    renderWeekPicker();
  } else if (state.mode === "month") {
    el("planTitle").textContent = "Месяц";
    renderMonthPicker();
  } else {
    el("planTitle").textContent = "Год";
    renderYearPicker();
  }
}

function renderWeekStrip() {
  const selected = asDate(state.selectedDate);
  const monday = weekMonday(selected);
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  el("weekStrip").innerHTML = days.map(dayChip).join("");
  bindDateChips();
}

function weekMonday(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

function weekNumberInMonth(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const firstMonday = weekMonday(first);
  return Math.floor((weekMonday(date) - firstMonday) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function dayChip(day) {
  const date = isoDate(day);
  const active = date === state.selectedDate ? " active" : "";
  return `<button class="day-chip${active}" data-date="${date}"><span>${weekday.format(day)}</span><strong>${day.getDate()}</strong></button>`;
}

function bindDateChips() {
  document.querySelectorAll(".day-chip").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.date;
      save();
      render();
    });
  });
}

function renderTimeline() {
  const selectedDay = asDate(state.selectedDate);
  const dayLessons = visibleLessonsForDays([selectedDay]);
  const totals = totalsFor(dayLessons);
  el("daySummary").innerHTML = renderSummary(totals, dayLessons);
  const slots = visibleTimeSlots();
  el("timeline").innerHTML = slots.map((time) => renderSlot(time, lessonAtSlot(dayLessons, state.selectedDate, time), time)).join("");
  bindLessonButtons();
}

function renderWeekGrid() {
  const selected = asDate(state.selectedDate);
  const monday = addDays(selected, -((selected.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const lessons = visibleLessonsForDays(days);
  const totals = totalsFor(lessons);
  el("daySummary").innerHTML = renderSummary(totals, lessons);
  renderSlotGrid(days);
}

function renderWeekPicker() {
  const selected = asDate(state.selectedDate);
  el("planTitle").textContent = `${weekNumberInMonth(selected)} неделя`;
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
  const last = new Date(selected.getFullYear(), selected.getMonth() + 1, 0, 12);
  const firstMonday = addDays(first, -((first.getDay() + 6) % 7));
  const weeks = [];
  for (let start = firstMonday; start <= last; start = addDays(start, 7)) {
    const end = addDays(start, 6);
    weeks.push({ start, end });
  }
  el("weekStrip").innerHTML = weeks.map((week, index) => weekChip(week, index)).join("");
  document.querySelectorAll("[data-week-start]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.weekStart;
      save();
      render();
    });
  });
  renderWeekGrid();
}

function weekChip(week, index) {
  const active = isoDate(week.start) === isoDate(weekMonday(asDate(state.selectedDate))) ? " active" : "";
  return `<button class="day-chip compact-chip${active}" data-week-start="${isoDate(week.start)}"><span>${shortDate(week.start)} - ${shortDate(week.end)}</span><strong>${index + 1} нед.</strong></button>`;
}

function renderSlotGrid(days) {
  const slots = visibleTimeSlots();
  const lessons = plannedLessons().filter(lessonIntersectsVisibleHours);
  const head = `<div class="slot-grid-head">Время ${timezoneLabel()}</div>${days.map((day) => `<div class="slot-grid-head">${weekday.format(day)}<br>${day.getDate()}</div>`).join("")}`;
  const body = slots
    .map((time) => {
      const cells = days
        .map((day) => {
          const date = isoDate(day);
          const lesson = lessonAtSlot(lessons, date, time);
          if (!lesson) return `<button class="slot-cell free" data-date="${date}" data-time="${time}">свободно</button>`;
          const owner = isPersonalEvent(lesson) ? { name: lesson.title || "Личное дело" } : lesson.groupId ? group(lesson.groupId) : student(lesson.studentId);
          const startsHere = lessonStartsInSlot(lesson, time);
          const endsHere = lessonEndsInSlot(lesson, time);
          const continuation = !startsHere;
          const cls = `${lessonVisualClass(lesson)}${continuation ? " continuation" : ""}`;
          const details = startsHere ? lessonStudentDetails(lesson) : endsHere ? `до ${lessonEndsAt(lesson)}` : "";
          const title = startsHere ? `<strong>${owner.name}</strong>` : "";
          if (isPersonalEvent(lesson)) return `<button class="slot-cell ${cls}" data-lesson="${lesson.id}">${title}<span>${details}</span></button>`;
          if (lesson.groupId) return `<button class="slot-cell ${cls}" data-group-lesson="${lesson.id}">${title}<span>${details}</span></button>`;
          return lesson.expected
            ? `<button class="slot-cell ${cls}" data-date="${date}" data-time="${lesson.time}" data-student="${lesson.studentId}">${title}<span>${details}</span></button>`
            : `<button class="slot-cell ${cls}" data-lesson="${lesson.id}">${title}<span>${details}</span></button>`;
        })
        .join("");
      return `<div class="slot-grid-time">${time}</div>${cells}`;
    })
    .join("");
  el("slotGrid").innerHTML = head + body;
  document.querySelectorAll(".slot-cell.free").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.date;
      save();
      openLessonDialog(button.dataset.time);
    });
  });
  document.querySelectorAll(".slot-cell[data-student]").forEach((button) => {
    button.addEventListener("click", () => {
      openExpectedSlotDialog(button.dataset.student, button.dataset.date, button.dataset.time);
    });
  });
  document.querySelectorAll(".slot-cell[data-lesson]").forEach((button) => {
    button.addEventListener("click", () => {
      openEditLessonDialog(button.dataset.lesson);
    });
  });
  document.querySelectorAll("[data-group-lesson]").forEach((button) => {
    button.addEventListener("click", () => openGroupSlotDialog(button.dataset.groupLesson));
  });
}

function visibleLessonsForDays(days) {
  const slots = visibleTimeSlots();
  const source = plannedLessons().filter(lessonIntersectsVisibleHours);
  const visible = [];
  const seen = new Set();
  days.forEach((day) => {
    const date = isoDate(day);
    slots.forEach((time) => {
      const lesson = lessonAtSlot(source, date, time);
      if (!lesson || seen.has(lesson.id) || !lessonStartsInSlot(lesson, time)) return;
      seen.add(lesson.id);
      visible.push(lesson);
    });
  });
  return visible.sort(sortByDateTime);
}

function cleanupHiddenStoredLessons() {
  const originalLength = state.lessons.length;
  const source = state.lessons.filter((lesson) => !isExcludedLesson(lesson));
  const dates = [...new Set(source.map((lesson) => lesson.date))];
  const slots = timeSlots("00:00", "23:30", 30);
  const visibleIds = new Set();
  dates.forEach((date) => {
    slots.forEach((time) => {
      const lesson = lessonAtSlot(source, date, time);
      if (lesson) visibleIds.add(lesson.id);
    });
  });
  state.lessons = state.lessons.filter((lesson) => {
    if (isExcludedLesson(lesson)) return false;
    if (lesson.conducted || groupLessonConducted(lesson)) return true;
    if (lesson.movedFrom || lesson.source === "manual") return true;
    return visibleIds.has(lesson.id);
  });
  const changed = state.lessons.length !== originalLength;
  if (changed) calcCache = null;
  return changed;
}

function renderMonthGrid() {
  const selected = asDate(state.selectedDate);
  el("planTitle").textContent = `Месяц ${monthName.format(selected)}`;
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
  const last = new Date(selected.getFullYear(), selected.getMonth() + 1, 0, 12);
  const gridStart = addDays(first, -((first.getDay() + 6) % 7));
  const gridEnd = addDays(last, 6 - ((last.getDay() + 6) % 7));
  const days = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) days.push(day);
  const lessons = plannedLessons().filter((lesson) => lesson.date.startsWith(state.selectedDate.slice(0, 7)));
  const totals = totalsFor(lessons);
  el("daySummary").innerHTML = renderSummary(totals, lessons);
  el("calendarGrid").classList.add("month-calendar");
  el("calendarGrid").classList.remove("year-calendar");
  el("calendarGrid").innerHTML = monthWeekHeader() + days.map((day) => periodCard(isoDate(day), String(day.getDate()), day.getMonth() !== selected.getMonth() || periodBeforeUse(isoDate(day)))).join("");
  bindPeriodCards();
}

function weekSummaryCards(lessons) {
  const groups = groupBy(lessons, (lesson) => weekKey(lesson.date));
  return Object.keys(groups)
    .sort()
    .map((key, index) => {
      const totals = totalsFor(groups[key]);
      return `<div class="week-total"><strong>${index + 1} нед.</strong><span>${money.format(totals.paid)} / ${money.format(totals.plan)}</span><small>осталось ${money.format(totals.unpaid)}</small></div>`;
    })
    .join("");
}

function renderMonthPicker() {
  const year = asDate(state.selectedDate).getFullYear();
  el("planTitle").textContent = `Месяц ${monthName.format(asDate(state.selectedDate))}`;
  const months = monthKeysForYear(year);
  el("weekStrip").innerHTML = months.map((month) => monthChip(month)).join("");
  document.querySelectorAll("[data-month]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = `${button.dataset.month}-01`;
      save();
      render();
    });
  });
  renderMonthGrid();
}

function monthChip(month) {
  const active = month === state.selectedDate.slice(0, 7) ? " active" : "";
  return `<button class="day-chip month-chip${active}" data-month="${month}"><span>${month.slice(0, 4)}</span><strong>${monthName.format(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1))}</strong></button>`;
}

function renderYearGrid() {
  const year = asDate(state.selectedDate).getFullYear();
  el("planTitle").textContent = `Год ${year}`;
  const months = monthKeysForYear(year);
  const lessons = plannedLessons().filter((lesson) => lesson.date.startsWith(String(year)));
  const totals = totalsFor(lessons);
  el("daySummary").innerHTML = renderSummary(totals, lessons);
  el("calendarGrid").classList.remove("month-calendar");
  el("calendarGrid").classList.add("year-calendar");
  el("calendarGrid").innerHTML = months.map((month) => periodCard(month, monthName.format(new Date(year, Number(month.slice(5, 7)) - 1, 1)), periodBeforeUse(month))).join("");
  bindPeriodCards();
}

function renderYearPicker() {
  const selectedYear = asDate(state.selectedDate).getFullYear();
  el("planTitle").textContent = `Год ${selectedYear}`;
  const years = visibleYears();
  el("weekStrip").innerHTML = years.map((year) => yearChip(year)).join("");
  document.querySelectorAll("[data-year]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = `${button.dataset.year}-01-01`;
      save();
      render();
    });
  });
  renderYearGrid();
}

function yearChip(year) {
  const active = year === asDate(state.selectedDate).getFullYear() ? " active" : "";
  return `<button class="day-chip${active}" data-year="${year}"><span>год</span><strong>${year}</strong></button>`;
}

function monthWeekHeader() {
  return ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => `<div class="month-weekday">${day}</div>`).join("");
}

function periodCard(key, label, muted = false) {
  const source = plannedLessons();
  const lessons = key.length === 7 ? source.filter((lesson) => lesson.date.startsWith(key)) : source.filter((lesson) => lesson.date === key);
  const paidLessons = lessons.filter((lesson) => !isPersonalEvent(lesson));
  const totals = totalsFor(lessons);
  const cls = totals.plan && totals.unpaid === 0 ? "paid" : totals.paid > 0 ? "partial" : totals.unpaid ? "debt" : "";
  return `<button class="period-card ${cls} ${muted ? "muted-period" : ""}" data-key="${key}"><strong>${label}</strong><span>${paidLessons.length} зан.</span><span>${money.format(totals.paid)} / ${money.format(totals.plan)}</span></button>`;
}

function bindPeriodCards() {
  document.querySelectorAll(".period-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.key.length === 7 ? `${button.dataset.key}-01` : button.dataset.key;
      state.mode = button.dataset.key.length === 7 ? "month" : "day";
      save();
      render();
    });
  });
}

function renderSlot(time, lesson) {
  if (!lesson) return `<div class="slot"><div class="slot-time">${time}</div><button class="slot-body" data-time="${time}">Открытый слот</button></div>`;
  const owner = isPersonalEvent(lesson) ? { name: lesson.title || "Личное дело" } : lesson.groupId ? group(lesson.groupId) : student(lesson.studentId);
  const startsHere = lessonStartsInSlot(lesson, time);
  const endsHere = lessonEndsInSlot(lesson, time);
  const continuation = !startsHere;
  const cls = `${lessonVisualClass(lesson)}${continuation ? " continuation" : ""}`;
  const details = startsHere ? lessonStudentDetails(lesson) : endsHere ? `до ${lessonEndsAt(lesson)}` : "";
  const title = startsHere ? `<div class="slot-title"><span>${owner.name}</span></div>` : "";
  const reminder = !isPersonalEvent(lesson) && !lesson.expected && !lesson.conducted && isPastLesson(lesson) ? `<span class="minor lesson-reminder">нужно отметить проведение</span>` : "";
  if (isPersonalEvent(lesson)) {
    return `<div class="slot"><div class="slot-time">${time}</div><button class="slot-body ${cls}" data-edit="${lesson.id}">${title}<div class="slot-meta">${details}</div></button></div>`;
  }
  if (lesson.groupId) {
    return `<div class="slot"><div class="slot-time">${time}</div><button class="slot-body ${cls}" data-group-lesson="${lesson.id}">${title}<div class="slot-meta">${details}</div></button></div>`;
  }
  if (lesson.expected) {
    return `<div class="slot"><div class="slot-time">${time}</div><button class="slot-body ${cls}" data-expected="1" data-date="${lesson.date}" data-time="${lesson.time}" data-student="${lesson.studentId}">${title}<div class="slot-meta">${details}</div></button></div>`;
  }
  const moved = lesson.movedFrom ? `<span class="minor">перенос с ${lesson.movedFrom}</span>` : "";
  return `<div class="slot"><div class="slot-time">${time}</div><button class="slot-body ${cls}" data-edit="${lesson.id}">${title}<div class="slot-meta">${details}</div>${reminder}${moved}</button></div>`;
}

function bindLessonButtons() {
  document.querySelectorAll(".slot-body[data-time]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.expected) {
      openExpectedSlotDialog(button.dataset.student, button.dataset.date, button.dataset.time);
      return;
    }
    openLessonDialog(button.dataset.time);
    if (button.dataset.student) {
      el("lessonForm").studentId.value = button.dataset.student;
      updateLessonStudentDefaults(el("lessonForm"));
    }
  }));
  document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openEditLessonDialog(button.dataset.edit)));
  document.querySelectorAll("[data-group-lesson]").forEach((button) => button.addEventListener("click", () => openGroupSlotDialog(button.dataset.groupLesson)));
}

function summaryCell(label, value) {
  return `<div><span class="minor">${label}</span><strong>${money.format(value)}</strong></div>`;
}

function renderSummary(totals, lessons) {
  return summaryCell("План", totals.plan)
    + summaryCell("Оплачено", totals.paid)
    + summaryCell("Не оплачено", totals.unpaid)
    + unpaidBreakdown(lessons);
}

function unpaidBreakdown(lessons) {
  const rows = lessons
    .filter((lesson) => !isPersonalEvent(lesson))
    .map((lesson) => ({ lesson, status: lessonStatus(lesson), visual: lessonVisualClass(lesson) }))
    .filter((item) => item.visual.includes("debt") && item.status.unpaid > 0)
    .map((item) => {
      const owner = item.lesson.groupId ? group(item.lesson.groupId) : student(item.lesson.studentId);
      const kind = item.lesson.groupId ? "группа" : "ученик";
      return `${item.lesson.date} ${item.lesson.time} · ${kind}: ${owner.name} · ${money.format(item.status.unpaid)}`;
    });
  if (!rows.length) return "";
  return `<details class="unpaid-breakdown"><summary>Показать</summary>${rows.map((row) => `<small>${row}</small>`).join("")}</details>`;
}

function countSummaryCell(label, value, className = "") {
  return `<div class="${className}"><span class="minor">${label}</span><strong>${value}</strong></div>`;
}

function totalsFor(lessons) {
  const payableLessons = lessons.filter((lesson) => !isPersonalEvent(lesson));
  const statuses = payableLessons.map((lesson) => lessonStatus(lesson));
  const paid = statuses.reduce((total, status) => total + status.paid, 0);
  const unpaid = payableLessons.reduce((total, lesson, index) => {
    const visual = lessonVisualClass(lesson);
    return visual.includes("debt") ? total + statuses[index].unpaid : total;
  }, 0);
  return { plan: paid + unpaid, paid, debt: unpaid, unpaid };
}

function lessonIntersectsVisibleHours(lesson) {
  const visibleStart = timeToMinutes(state.workStart || "09:00");
  const visibleEnd = timeToMinutes(state.workEnd || "22:00") + 30;
  const lessonStart = timeToMinutes(lesson.time);
  const lessonEnd = lessonStart + lessonDurationMinutes(lesson);
  return lessonStart < visibleEnd && lessonEnd > visibleStart;
}

function timeSlots(start, end, step) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const date = new Date(2026, 0, 1, startHour, startMinute);
  const limit = new Date(2026, 0, 1, endHour, endMinute);
  const result = [];
  while (date <= limit) {
    result.push(date.toTimeString().slice(0, 5));
    date.setMinutes(date.getMinutes() + step);
  }
  return result;
}

function openLessonDialog(time = "16:00", options = {}) {
  const form = el("lessonForm");
  form.reset();
  form.itemType.value = "lesson";
  setLessonPersonalOptionEnabled(form, options.allowPersonal !== false);
  const hasGroups = state.groups.some((item) => !item.archived);
  setLessonGroupOptionEnabled(form, options.allowGroup !== false && hasGroups);
  form.expectedStudentId.value = "";
  form.expectedDate.value = "";
  form.expectedTime.value = "";
  el("freeLessonFormBtn").style.display = "none";
  el("conductedExpectedBtn").style.display = "none";
  form.date.value = state.selectedDate;
  form.time.value = time;
  const first = state.students[0];
  if (first) {
    form.studentId.value = first.id;
  }
  const firstGroup = state.groups.find((item) => !item.archived);
  if (firstGroup) form.groupId.value = firstGroup.id;
  updateLessonStudentDefaults(form);
  updateLessonGroupDefaults(form);
  updateLessonFormType(form);
  el("lessonDialog").showModal();
}

function setLessonPersonalOptionEnabled(form, enabled) {
  const personalInput = form.querySelector('input[name="itemType"][value="personal"]');
  const personalLabel = personalInput?.closest("label");
  if (!personalInput || !personalLabel) return;
  personalInput.disabled = !enabled;
  personalLabel.classList.toggle("hidden", !enabled);
  if (!enabled) form.itemType.value = "lesson";
}

function setLessonGroupOptionEnabled(form, enabled) {
  const groupInput = form.querySelector('input[name="itemType"][value="group"]');
  const groupLabel = groupInput?.closest("label");
  if (!groupInput || !groupLabel) return;
  groupInput.disabled = !enabled;
  groupLabel.classList.toggle("hidden", !enabled);
  if (!enabled && form.itemType.value === "group") form.itemType.value = "lesson";
}

function openExpectedSlotDialog(studentId, date, time) {
  const foundStudent = student(studentId);
  state.selectedDate = date;
  save();
  openLessonDialog(time, { allowPersonal: false, allowGroup: false });
  const form = el("lessonForm");
  form.expectedStudentId.value = studentId;
  form.expectedDate.value = date;
  form.expectedTime.value = time;
  form.date.value = date;
  form.time.value = time;
  form.studentId.value = studentId;
  form.itemType.value = "lesson";
  updateLessonStudentDefaults(form);
  updateLessonFormType(form);
  el("freeLessonFormBtn").style.display = "";
  const expectedLesson = {
    id: `expected-${studentId}-${date}-${time}`,
    expected: true,
    studentId,
    date,
    time,
    price: Number(foundStudent.price || 0)
  };
  el("conductedExpectedBtn").style.display = "";
}

function markExpectedConductedFromForm(event) {
  event.preventDefault();
  const form = el("lessonForm");
  if (!form.expectedStudentId.value) return;
  createLessonFromForm(form, true);
  el("lessonDialog").close();
}

function createLessonFromForm(form, conducted = false) {
  const data = Object.fromEntries(new FormData(form));
  rememberUndo();
  if (data.itemType === "personal") {
    state.lessons.push({
      id: uuid(),
      type: "personal",
      date: data.date,
      time: data.time,
      title: (data.title || "Личное дело").trim(),
      duration: Number(data.duration || 60),
      note: data.note,
      conducted,
      movedFrom: ""
    });
    state.selectedDate = data.date;
    save();
    render();
    return;
  }
  if (data.itemType === "group") {
    const foundGroup = group(data.groupId);
    if (!foundGroup?.id) return;
    const regularEntry = regularEntryForDateTime(foundGroup, data.date, data.time);
    removeGroupExclusion(data.groupId, data.date, data.time);
    state.lessons.push({
      id: uuid(),
      date: data.date,
      time: data.time,
      groupId: data.groupId,
      subject: foundGroup.subject || "",
      grade: foundGroup.grade || "",
      price: 0,
      duration: Number(data.groupDuration || regularEntry?.duration || normalizeRegularSlots(foundGroup)[0]?.duration || 60),
      onlineLink: foundGroup.onlineLink || "",
      note: data.note || "Разовое групповое занятие",
      source: "manual",
      expected: false,
      conducted: false,
      movedFrom: ""
    });
    state.selectedDate = data.date;
    save();
    render();
    return;
  }
  const foundStudent = student(data.studentId);
  const regularEntry = regularEntryForDateTime(foundStudent, data.date, data.time);
  const expectedMoved = form.expectedStudentId.value
    && (form.expectedDate.value !== data.date || form.expectedTime.value !== data.time);
  const movedFrom = expectedMoved ? `${form.expectedDate.value} ${form.expectedTime.value}` : "";
  if (expectedMoved) addExclusion(form.expectedStudentId.value, form.expectedDate.value, form.expectedTime.value);
  removeExclusion(data.studentId, data.date, data.time);
  const defaultDuration = Number((expectedMoved ? foundStudent.lessonDuration : regularEntry?.duration) || foundStudent.lessonDuration || 60);
  const lessonDuration = durationFromTimes(data.time, data.endTime, defaultDuration);
    state.lessons.push({
      id: uuid(),
      date: data.date,
      time: data.time,
      studentId: data.studentId,
      subject: data.subject || foundStudent.subject,
      price: Number(data.price),
      duration: lessonDuration,
      onlineLink: foundStudent.onlineLink || "",
    note: data.note || (form.expectedStudentId.value ? "Постоянное расписание" : ""),
    source: expectedMoved ? "manual" : form.expectedStudentId.value ? "regular" : "manual",
      conducted,
      movedFrom
    });
  state.selectedDate = data.date;
  save();
  render();
}

function updateLessonFormType(form) {
  const isPersonal = form.itemType.value === "personal";
  const isGroup = form.itemType.value === "group";
  const isLesson = form.itemType.value === "lesson";
  form.querySelectorAll(".lesson-fields").forEach((block) => {
    block.classList.toggle("hidden", !isLesson);
    block.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = !isLesson;
      if (field.name === "studentId" || field.name === "subject" || field.name === "price" || field.name === "endTime") field.required = isLesson;
    });
  });
  form.querySelectorAll(".group-fields").forEach((block) => {
    block.classList.toggle("hidden", !isGroup);
    block.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = !isGroup;
      if (field.name === "groupId") field.required = isGroup;
    });
  });
  form.querySelectorAll(".personal-fields").forEach((block) => {
    block.classList.toggle("hidden", !isPersonal);
    block.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = !isPersonal;
      if (field.name === "title") field.required = isPersonal;
    });
  });
  const title = form.closest("dialog")?.querySelector("h2");
  if (title) title.textContent = isPersonal ? "Дело" : isGroup ? "Групповое занятие" : "Занятие";
}

function updateLessonGroupDefaults(form) {
  if (!form.groupDuration) return;
  const foundGroup = group(form.groupId.value);
  const regularEntry = foundGroup?.id ? regularEntryForDateTime(foundGroup, form.date.value, form.time.value) : null;
  form.groupDuration.value = Number(regularEntry?.duration || normalizeRegularSlots(foundGroup || {})[0]?.duration || 60);
}

function updateLessonStudentDefaults(form, options = {}) {
  const { linkId = "lessonOnlineLink", syncSubject = true, syncPrice = true, syncEnd = true } = options;
  const foundStudent = student(form.studentId.value);
  if (syncSubject && form.subject) form.subject.value = foundStudent.subject || "";
  const regularEntry = foundStudent?.id ? regularEntryForDateTime(foundStudent, form.date.value, form.time.value) : null;
  const duration = syncEnd
    ? Number(regularEntry?.duration || foundStudent.lessonDuration || 60)
    : durationFromTimes(form.time?.value, form.endTime?.value, foundStudent.lessonDuration || 60);
  if (syncPrice && form.price) form.price.value = studentPriceForDuration(foundStudent, duration);
  if (syncEnd && form.endTime) {
    form.endTime.value = minutesToTime(timeToMinutes(form.time.value) + duration);
  }
  setOnlineLink(linkId, foundStudent.onlineLink || "");
}

function freeLessonFromForm(event) {
  event.preventDefault();
  const form = el("lessonForm");
  if (form.expectedStudentId.value) {
    freeExpectedSlot(form.expectedStudentId.value, form.expectedDate.value, form.expectedTime.value);
    el("lessonDialog").close();
    return;
  }
  if (form.id.value) {
    freeLessonById(form.id.value);
    el("lessonDialog").close();
  }
}

function freeExpectedSlot(studentId, date, time) {
  const foundStudent = student(studentId);
  addExclusion(studentId, date, time);
  state.selectedDate = date;
  save();
  render();
}

function openPaymentForLesson(id) {
  const lesson = plannedLessons().find((item) => item.id === id);
  if (!lesson) return;
  const form = el("paymentForm");
  preparePaymentForm();
  form.scope.value = "lesson";
  form.paidAt.value = isoDate(new Date());
  form.lessonDate.value = lesson.date;
  form.studentId.value = lesson.studentId;
  form.amount.value = lessonStatus(lesson).unpaid || lessonPrice(lesson);
  el("paymentDialog").showModal();
}

function openGroupSlotDialog(id) {
  const lesson = plannedLessons().find((item) => item.id === id);
  if (!lesson) return;
  const item = group(lesson.groupId);
  const form = el("groupLessonForm");
  const saved = state.groupAttendance[groupLessonKey(lesson)] || { present: {}, conducted: false };
  form.lessonId.value = lesson.id;
  form.groupId.value = lesson.groupId;
  form.originalDate.value = lesson.date;
  form.originalTime.value = lesson.time;
  form.date.value = lesson.date;
  form.time.value = lesson.time;
  el("groupLessonTitle").textContent = `${item.name} · ${lesson.date} ${lesson.time}`;
  el("conductedGroupLessonBtn").classList.toggle("active", Boolean(saved.conducted));
  const members = groupStudents(lesson.groupId);
  el("groupLessonMembers").innerHTML = members.length
    ? members.map((member) => {
        const checked = saved.present[member.id] === true ? "checked" : "";
        const virtualLesson = {
          ...lesson,
          id: `group-pay-${member.id}-${lesson.groupId}-${lesson.date}-${lesson.time}`,
          studentId: member.id,
          price: Number(member.price || lesson.price || 0)
        };
        const paid = (paymentAllocationForStudent(member.id).get(virtualLesson.id) || 0) >= lessonPrice(virtualLesson);
        return `<label class="list-item attendance-row ${paid ? "paid-row" : "debt-row"}"><span><strong>${member.name}</strong><small>${paid ? "оплачено" : "не оплачено"}</small></span><input type="checkbox" name="present:${member.id}" ${checked} /></label>`;
      }).join("")
    : `<p class="minor">В группе пока нет учеников</p>`;
  el("groupLessonDialog").showModal();
}

function saveGroupLessonAttendance(event) {
  event.preventDefault();
  const form = el("groupLessonForm");
  const data = Object.fromEntries(new FormData(form));
  const members = groupStudents(data.groupId);
  const moved = data.originalDate && data.originalTime && (data.originalDate !== data.date || data.originalTime !== data.time);
  if (moved) {
    rememberUndo();
    const oldLesson = { groupId: data.groupId, date: data.originalDate, time: data.originalTime };
    const oldKey = groupLessonKey(oldLesson);
    const existingLesson = state.lessons.find((item) => item.id === data.lessonId);
    const plannedLesson = plannedLessons().find((item) => item.id === data.lessonId) || existingLesson;
    const item = group(data.groupId);
    const storedLesson = existingLesson || {
      id: uuid(),
      groupId: data.groupId,
      studentId: "",
      source: "manual",
      expected: false,
      conducted: false,
      price: 0
    };
    Object.assign(storedLesson, {
      groupId: data.groupId,
      date: data.date,
      time: data.time,
      duration: Number(plannedLesson?.duration || regularEntryForDateTime(item, data.date, data.time)?.duration || 60),
      subject: item?.subject || plannedLesson?.subject || "",
      grade: item?.grade || plannedLesson?.grade || "",
      onlineLink: item?.onlineLink || plannedLesson?.onlineLink || "",
      note: plannedLesson?.note || "Перенос группы",
      movedFrom: `${data.originalDate} ${data.originalTime}`
    });
    if (!existingLesson) state.lessons.push(storedLesson);
    addGroupExclusion(data.groupId, data.originalDate, data.originalTime);
    removeGroupExclusion(data.groupId, data.date, data.time);
    delete state.groupAttendance[oldKey];
    state.selectedDate = data.date;
  }
  const lesson = { groupId: data.groupId, date: data.date, time: data.time };
  const present = {};
  members.forEach((member) => {
    present[member.id] = Boolean(data[`present:${member.id}`]);
  });
  const conducted = Object.values(present).some(Boolean);
  if (conducted) {
    state.groupAttendance[groupLessonKey(lesson)] = { conducted: true, present };
  } else {
    delete state.groupAttendance[groupLessonKey(lesson)];
  }
  save();
  el("groupLessonDialog").close();
  render();
}

function openMoveDialog(id) {
  const lesson = state.lessons.find((item) => item.id === id) || plannedLessons().find((item) => item.id === id);
  if (!lesson) return;
  const form = el("moveForm");
  form.lessonId.value = lesson.id;
  form.date.value = lesson.date;
  form.time.value = lesson.time;
  form.reason.value = "";
  el("moveDialog").showModal();
}

function openEditLessonDialog(id) {
  const lesson = state.lessons.find((item) => item.id === id);
  if (!lesson) return;
  const form = el("editLessonForm");
  form.lessonId.value = lesson.id;
  form.itemType.value = isPersonalEvent(lesson) ? "personal" : "lesson";
  form.date.value = lesson.date;
  form.time.value = lesson.time;
  form.studentId.value = lesson.studentId || "";
  form.subject.value = lesson.subject || "";
  form.price.value = isPersonalEvent(lesson) ? 0 : lessonPrice(lesson);
  form.endTime.value = lessonEndsAt(lesson);
  setOnlineLink("editLessonOnlineLink", lesson.onlineLink || student(lesson.studentId)?.onlineLink || "");
  form.title.value = lesson.title || "";
  form.duration.value = String(lessonDurationMinutes(lesson));
  form.note.value = lesson.note || "";
  updateLessonFormType(form);
  updateConductedButton(lesson);
  el("editLessonDialog").showModal();
}

function updateConductedButton(lesson) {
  const button = el("conductedLessonBtn");
  if (isPersonalEvent(lesson)) {
    button.textContent = lesson.conducted ? "Не завершено" : "Завершено";
  } else {
    button.textContent = lesson.conducted ? "Не проведен" : "Проведен";
  }
  button.classList.toggle("active", Boolean(lesson.conducted));
}

function toggleConductedFromEditForm(event) {
  event.preventDefault();
  const lessonId = new FormData(el("editLessonForm")).get("lessonId");
  const lesson = state.lessons.find((item) => item.id === lessonId);
  if (!lesson) return;
  lesson.conducted = !lesson.conducted;
  save();
  updateConductedButton(lesson);
  render();
}

function saveEditedLesson(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const lesson = state.lessons.find((item) => item.id === data.lessonId);
  if (lesson) {
    rememberUndo();
    const oldDate = lesson.date;
    const oldTime = lesson.time;
    lesson.date = data.date;
    lesson.time = data.time;
    lesson.note = data.note;
    if (isPersonalEvent(lesson)) {
      lesson.type = "personal";
      lesson.title = (data.title || "Личное дело").trim();
      lesson.duration = Number(data.duration || 60);
      delete lesson.studentId;
      delete lesson.subject;
      lesson.price = 0;
    } else {
      const foundStudent = student(data.studentId);
      lesson.studentId = data.studentId;
      lesson.subject = data.subject || foundStudent.subject;
      lesson.price = Number(data.price);
      lesson.duration = durationFromTimes(data.time, data.endTime, foundStudent.lessonDuration || lesson.duration || 60);
      lesson.onlineLink = foundStudent.onlineLink || "";
    }
    if (!isPersonalEvent(lesson) && (oldDate !== lesson.date || oldTime !== lesson.time)) {
      excludeRegularSlotForLesson({ ...lesson, date: oldDate, time: oldTime }, oldDate, oldTime);
      lesson.movedFrom ||= `${oldDate} ${oldTime}`;
    }
    if (!isPersonalEvent(lesson)) removeExclusion(lesson.studentId, lesson.date, lesson.time);
    state.selectedDate = data.date;
  }
  save();
  el("editLessonDialog").close();
  render();
  showUndoToast("Изменения сохранены");
}

function deleteEditedLesson(event) {
  event.preventDefault();
  event.stopPropagation();
  const form = el("editLessonForm");
  const lessonId = new FormData(form).get("lessonId");
  freeLessonById(lessonId);
  el("editLessonDialog").close();
}

function prepareStudentForm(studentId = "") {
  const form = el("studentForm");
  form.reset();
  const item = state.students.find((student) => student.id === studentId);
  el("studentDialogTitle").textContent = item ? "Ученик" : "Новый ученик";
  form.studentId.value = item?.id || "";
  form.name.value = item?.name || "";
  form.subject.value = item?.subject || "";
  form.grade.value = item?.grade || "";
  form.format.value = item?.format || "Индивидуально";
  form.groupId.value = item?.groupId || "";
  form.status.value = item ? effectiveStudentStatus(item) : "Активен";
  form.studentNote.value = item?.studentNote || "";
  form.lessonsPerWeek.value = String(Math.max(1, Math.min(maxRegularSlots, Number(item?.lessonsPerWeek || normalizeRegularSlots(item || {}).length || 1))));
  form.scheduleStartDate.value = item?.scheduleStartDate || state.selectedDate;
  form.scheduleEndDate.value = item?.scheduleEndDate || "";
  setRegularSlotsForm(form, item?.regularSlots || normalizeRegularSlots(item || {}));
  form.onlineLink.value = item?.onlineLink || "";
  setOnlineLink("studentOnlineLinkOpen", item?.onlineLink || "");
  form.phone.value = item?.phone || "";
  form.parentName.value = item?.parentName || "";
  form.parentPhone.value = item?.parentPhone || "";
  form.price.value = item?.price || "";
  form.lessonDuration.value = item?.lessonDuration || 60;
  updateStudentFormatFields();
  renderStudentSchedule(item?.id || "");
  const historyBox = el("studentHistoryBox");
  historyBox.classList.toggle("hidden", !item);
  historyBox.open = false;
}

function prepareGroupForm(groupId = "") {
  const form = el("groupForm");
  form.reset();
  const item = state.groups.find((groupItem) => groupItem.id === groupId);
  el("groupDialogTitle").textContent = item ? "Группа" : "Новая группа";
  form.groupId.value = item?.id || "";
  form.name.value = item?.name || "";
  form.subject.value = item?.subject || "";
  form.grade.value = item?.grade || "";
  form.status.value = item?.status || "Активна";
  form.lessonsPerWeek.value = String(Math.max(1, Math.min(maxRegularSlots, Number(item?.lessonsPerWeek || normalizeRegularSlots(item || {}).length || 1))));
  form.scheduleStartDate.value = item?.scheduleStartDate || state.selectedDate;
  form.scheduleEndDate.value = item?.scheduleEndDate || "";
  setRegularSlotsForm(form, item?.regularSlots || normalizeRegularSlots(item || {}));
  form.onlineLink.value = item?.onlineLink || "";
  setOnlineLink("groupOnlineLinkOpen", item?.onlineLink || "");
  updateVisibleRegularRows(form);
  el("archiveGroupBtn").style.visibility = item && !item.archived ? "visible" : "hidden";
}

function renderStudentSchedule(studentId) {
  const box = el("studentSchedule");
  if (!box) return;
  if (!studentId) {
    box.innerHTML = "";
    return;
  }
  const start = asDate(state.selectedDate);
  const from = addDays(start, -45);
  const to = addDays(start, 45);
  const merged = payableLessonsForStudent(studentId)
    .filter((lesson) => asDate(lesson.date) >= from && asDate(lesson.date) <= to)
    .sort(sortByDateTime)
    .slice(-80);
  if (!merged.length) {
    box.innerHTML = `<div class="student-schedule-empty">История занятий пока пустая</div>`;
    return;
  }
  box.innerHTML = `<h3>История занятий</h3>${studentHistoryStats(studentId)}<p class="minor">последние и ближайшие занятия</p>${merged
    .map((lesson) => {
      const status = lessonStatus(lesson);
      const cls = lessonVisualClass(lesson);
      const paymentLabel = status.done ? `оплачено ${money.format(status.paid)}` : `не оплачено ${money.format(status.unpaid)}`;
      const typeLabel = lesson.groupId ? "группа" : lesson.expected || lesson.source === "regular" ? "постоянное" : "разовое";
      const conductedLabel = lessonConductedForStudent(lesson, studentId) ? "проведено" : "запланировано";
      const movedLabel = lesson.movedFrom ? ` · перенос с ${lesson.movedFrom}` : "";
      const subject = lesson.groupId ? group(lesson.groupId).subject : lesson.subject || student(studentId).subject;
      return `<button type="button" class="student-lesson ${cls}" data-student-lesson="${lesson.id}" ${lesson.expected ? "data-expected='1'" : ""}><span><strong>${lesson.date} ${lesson.time}</strong><small>${subject || "занятие"} · ${typeLabel} · ${conductedLabel}${movedLabel}</small></span><strong>${paymentLabel}</strong></button>`;
    })
    .join("")}`;
  box.querySelectorAll("[data-student-lesson]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.expected) return;
      el("studentDialog").close();
      openEditLessonDialog(button.dataset.studentLesson);
    });
  });
}

function studentHistoryStats(studentId) {
  const selected = asDate(state.selectedDate);
  const monthKey = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}`;
  const yearKey = String(selected.getFullYear());
  const month = studentPeriodStats(studentId, (lesson) => lesson.date.startsWith(monthKey), (payment) => (payment.paidAt || payment.lessonDate || "").startsWith(monthKey));
  const year = studentPeriodStats(studentId, (lesson) => lesson.date.startsWith(yearKey), (payment) => (payment.paidAt || payment.lessonDate || "").startsWith(yearKey));
  return `<div class="student-history-stats"><div><span>${monthName.format(selected)}</span><strong>${month.conducted} пров. · ${money.format(month.paid)}</strong></div><div><span>${yearKey}</span><strong>${year.conducted} пров. · ${money.format(year.paid)}</strong></div></div>`;
}

function studentPeriodStats(studentId, lessonFilter, paymentFilter) {
  const lessons = payableLessonsForStudent(studentId).filter(lessonFilter);
  const conducted = lessons.filter((lesson) => lessonConductedForStudent(lesson, studentId)).length;
  const paid = balancePayments()
    .filter((payment) => payment.studentId === studentId)
    .filter(paymentFilter)
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
  return { conducted, paid };
}

function weeklyExpectedCount(studentId, weekStart) {
  const weekEnd = addDays(weekStart, 6);
  return plannedLessons().filter((lesson) => lesson.studentId === studentId && asDate(lesson.date) >= weekStart && asDate(lesson.date) <= weekEnd).length;
}

function preparePaymentForm(paymentId = "") {
  const form = el("paymentForm");
  form.reset();
  const payment = state.payments.find((item) => item.id === paymentId);
  el("paymentDialogTitle").textContent = payment ? "Оплата" : "Новая оплата";
  form.paymentId.value = payment?.id || "";
  form.scope.value = payment?.scope || "lesson";
  form.paidAt.value = payment?.paidAt || isoDate(new Date());
  form.studentId.value = payment?.studentId || state.students[0]?.id || "";
  form.amount.value = payment?.amount || "";
  form.method.value = payment?.method || "Перевод";
  form.invoice.value = payment?.invoice || "";
  form.lessonDate.value = payment?.lessonDate || payment?.paidAt || state.selectedDate;
  form.month.value = "";
  updatePaymentPayerInfo();
  el("deletePaymentBtn").style.visibility = payment ? "visible" : "hidden";
}

function updatePaymentPayerInfo() {
  const form = el("paymentForm");
  const box = el("paymentPayerInfo");
  if (!box) return;
  const owner = student(form.studentId.value);
  box.textContent = paymentContactText(owner);
}

function renderStudents() {
  const visibleStudents = state.students.filter((item) => !isStudentArchived(item));
  const archivedStudents = state.students.filter((item) => isStudentArchived(item));
  const activeCount = state.students.filter((item) => !isStudentArchived(item) && effectiveStudentStatus(item) === "Активен").length;
  el("studentsSummary").innerHTML = countSummaryCell("Всего учеников", state.students.length) + countSummaryCell("Активных", activeCount, "active-count");
  const query = searchValue("studentsSearch");
  const activeHtml = visibleStudents
    .filter((item) => studentSearchText(item).includes(query))
    .map((item) => {
      const statusText = effectiveStudentStatus(item);
      const lessons = payableLessonsForStudent(item.id);
      const balance = studentBalance(item.id);
      const allocation = paymentAllocationForStudent(item.id);
      const paidLessons = lessons.filter((lesson) => (allocation.get(lesson.id) || 0) >= lessonPrice(lesson)).length;
      const contacts = [
        item.phone ? `ученик: ${item.phone}` : "телефон ученика не указан",
        item.parentName ? `родитель: ${item.parentName}` : "",
        item.parentPhone ? item.parentPhone : ""
      ].filter(Boolean).join(" · ");
      const moneyLine = `баланс ${money.format(balance.balance)} · списано ${money.format(balance.consumed)}`;
      const startLine = item.scheduleStartDate ? `с ${item.scheduleStartDate}` : "дата начала не задана";
      const endLine = item.scheduleEndDate ? `до ${item.scheduleEndDate}` : "без окончания";
      const statusNote = statusText === "Пауза" ? `пауза · баланс ${money.format(balance.balance)}` : `резерв занятий ${paidLessons}/${lessons.length} · ${moneyLine}`;
      const scheduleLine = item.regularSchedule ? `индивидуально: ${item.regularSchedule}, ${startLine}, ${endLine}` : "индивидуальное расписание не задано";
      const groupText = studentHasGroup(item.format) && item.groupId ? `группа: ${group(item.groupId).name}` : "";
      const groupLine = [groupText, studentHasIndividualSchedule(item.format || "Индивидуально") ? scheduleLine : ""].filter(Boolean).join(" · ") || "расписание задаётся в группе";
      const noteLine = item.studentNote ? `<p class="minor">об ученике: ${item.studentNote}</p>` : "";
      return `<button class="list-item student-card" data-student="${item.id}"><div class="list-row"><strong>${item.name}</strong><span class="badge ${balance.balance > 0 ? "paid" : "debt"}">${money.format(balance.balance)} · ${balance.lessonsLeft} зан.</span></div><p class="minor">${item.subject} · ${item.format || "Индивидуально"} · ${statusText} · ${item.lessonDuration || 60} мин · ${statusNote}</p><p class="minor">${groupLine}</p>${noteLine}<p class="minor">${contacts}</p></button>`;
    })
    .join("");
  const archiveHtml = archivedStudents.length
    ? `<details class="archive-block"><summary>Архив учеников: ${archivedStudents.length}</summary>${archivedStudents
        .filter((item) => studentSearchText(item).includes(query))
        .map((item) => {
          const balance = Math.round(studentBalance(item.id).balance);
          return `<div class="list-item archived"><div class="list-row"><strong>${item.name}</strong><span class="badge ${balance === 0 ? "" : "debt"}">${money.format(balance)}</span></div><p class="minor">${item.subject} · завершен · ${item.lessonDuration || 60} мин</p><p class="minor">${item.parentName ? `родитель: ${item.parentName}` : "родитель не указан"}${item.parentPhone ? ` · ${item.parentPhone}` : ""}</p><div class="archive-actions"><button type="button" class="ghost restore-student" data-restore-student="${item.id}">Вернуть</button><button type="button" class="danger subtle-danger delete-student-forever" data-delete-student="${item.id}">Удалить совсем</button></div></div>`;
        })
        .join("")}</details>`
    : "";
  el("studentsList").innerHTML = activeHtml + archiveHtml;
  document.querySelectorAll(".student-card").forEach((button) => {
    button.addEventListener("click", () => {
      prepareStudentForm(button.dataset.student);
      el("studentDialog").showModal();
    });
  });
  document.querySelectorAll("[data-restore-student]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      restoreStudent(button.dataset.restoreStudent);
    });
  });
  document.querySelectorAll("[data-delete-student]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteStudentForever(button.dataset.deleteStudent);
    });
  });
}

function renderGroups() {
  const visibleGroups = state.groups.filter((item) => !item.archived);
  const archivedGroups = state.groups.filter((item) => item.archived);
  const activeCount = state.groups.filter((item) => !item.archived && (item.status || "Активна") === "Активна").length;
  el("groupsSummary").innerHTML = countSummaryCell("Всего групп", state.groups.length) + countSummaryCell("Активных", activeCount, "active-count");
  const query = searchValue("groupsSearch");
  const html = visibleGroups.filter((item) => groupSearchText(item).includes(query)).map((item) => {
    const members = groupStudents(item.id);
    const startLine = item.scheduleStartDate ? `с ${item.scheduleStartDate}` : "дата начала не задана";
    const endLine = item.scheduleEndDate ? `до ${item.scheduleEndDate}` : "без окончания";
    return `<button class="list-item group-card" data-group="${item.id}"><div class="list-row"><strong>${item.name}</strong><span class="badge ${members.length ? "paid" : "debt"}">${members.length}</span></div><p class="minor">${item.subject}${item.grade ? ` · ${item.grade}` : ""} · ${item.status || "Активна"}</p><p class="minor">${item.regularSchedule ? `расписание: ${item.regularSchedule}, ${startLine}, ${endLine}` : "расписание не задано"}</p><p class="minor">${members.length ? members.map((member) => member.name).join(", ") : "ученики не привязаны"}</p></button>`;
  }).join("");
  const archiveHtml = archivedGroups.length
    ? `<details class="archive-block"><summary>Архив групп: ${archivedGroups.length}</summary>${archivedGroups
        .filter((item) => groupSearchText(item).includes(query))
        .map((item) => `<div class="list-item archived"><div class="list-row"><strong>${item.name}</strong><span class="badge">архив</span></div><p class="minor">${item.subject}${item.grade ? ` · ${item.grade}` : ""}</p><div class="archive-actions"><button type="button" class="ghost restore-group" data-restore-group="${item.id}">Вернуть</button><button type="button" class="danger subtle-danger delete-group-forever" data-delete-group="${item.id}">Удалить совсем</button></div></div>`)
        .join("")}</details>`
    : "";
  el("groupsList").innerHTML = (html || `<p class="minor">Пока нет групп</p>`) + archiveHtml;
  document.querySelectorAll(".group-card").forEach((button) => {
    button.addEventListener("click", () => {
      prepareGroupForm(button.dataset.group);
      el("groupDialog").showModal();
    });
  });
  document.querySelectorAll("[data-restore-group]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      restoreGroup(button.dataset.restoreGroup);
    });
  });
  document.querySelectorAll("[data-delete-group]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteGroupForever(button.dataset.deleteGroup);
    });
  });
}

function renderPayments() {
  autoArchiveOldPayments();
  const month = state.selectedDate.slice(0, 7);
  const query = searchValue("paymentsSearch");
  const activePayments = state.payments.filter((item) => !item.archived);
  const archivedPayments = state.payments.filter((item) => item.archived);
  el("monthSummary").innerHTML = `<strong>${money.format(paymentsForMonth(month))}</strong><span class="minor">приход за выбранный месяц</span>`;
  const activeHtml = activePayments
    .filter((item) => paymentSearchText(item).includes(query))
    .slice()
    .reverse()
    .map((item) => {
      const scope = `приход от ${item.paidAt}`;
      const owner = student(item.studentId);
      const payer = paymentContactLine(owner);
      return `<button class="list-item payment-card" data-payment="${item.id}"><div class="list-row"><strong>${owner.name}</strong><span>${money.format(item.amount)}</span></div><p class="minor">${item.paidAt} · ${scope} · ${item.method}</p>${payer}</button>`;
    })
    .join("");
      const archiveHtml = archivedPayments.length
    ? `<details class="archive-block"><summary>Архив оплат: ${archivedPayments.length}</summary>${archivedPayments
        .filter((item) => paymentSearchText(item).includes(query))
        .slice()
        .reverse()
        .map((item) => {
          const owner = student(item.studentId);
          return `<div class="list-item archived"><div class="list-row"><strong>${owner.name}</strong><span>${money.format(item.amount)}</span></div><p class="minor">${item.paidAt} · архив · баланс учитывает</p>${paymentContactLine(owner)}<div class="archive-actions"><button type="button" class="ghost restore-payment" data-restore-payment="${item.id}">Вернуть</button><button type="button" class="danger subtle-danger delete-payment-forever" data-delete-payment="${item.id}">Удалить совсем</button></div></div>`;
        })
        .join("")}</details>`
    : "";
  el("paymentsList").innerHTML = activeHtml + archiveHtml;
  document.querySelectorAll(".payment-card").forEach((button) => {
    button.addEventListener("click", () => {
      preparePaymentForm(button.dataset.payment);
      el("paymentDialog").showModal();
    });
  });
  document.querySelectorAll("[data-restore-payment]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      restorePayment(button.dataset.restorePayment);
    });
  });
  document.querySelectorAll("[data-delete-payment]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deletePaymentForever(button.dataset.deletePayment);
    });
  });
}

function paymentContactLine(owner) {
  return `<div class="payer-line">${paymentContactText(owner)}</div>`;
}

function paymentContactText(owner) {
  const parent = owner.parentName || "не указан";
  const phone = owner.parentPhone || "телефон не указан";
  return `Родитель: ${parent} · ${phone}`;
}

function searchValue(id) {
  return (el(id)?.value || "").trim().toLowerCase();
}

function studentSearchText(item) {
  return [item.name, item.subject, item.grade, item.status, item.format, item.parentName, item.parentPhone, item.phone, item.studentNote]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function groupSearchText(item) {
  return [item.name, item.subject, item.grade, item.status, item.regularSchedule]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function paymentSearchText(item) {
  const owner = student(item.studentId);
  return [owner.name, owner.parentName, owner.parentPhone, item.paidAt, item.method, item.amount]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function renderAnalytics() {
  const lessons = plannedLessons().sort(sortByDateTime);
  el("analytics").innerHTML = [
    analyticsBlock("По месяцам", monthlyAnalyticsRows(lessons)),
    analyticsBlock("По годам", yearlyAnalyticsRows(lessons))
  ].join("");
}

function analyticsBlock(title, rowsData) {
  const rows = rowsData.map((row) => {
    return `<div class="list-row"><span>${row.label}</span><strong>${money.format(row.plan)}</strong></div><p class="minor">оплачено ${money.format(row.paid)} · не оплачено ${money.format(row.unpaid)}</p>`;
  }).join("");
  return `<section class="analytics-card"><h2>${title}</h2>${rows || "<p class='minor'>Пока нет занятий</p>"}</section>`;
}

function monthlyAnalyticsRows(lessons) {
  const year = asDate(state.selectedDate).getFullYear();
  return Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    const monthLessons = lessons.filter((lesson) => lesson.date.startsWith(key));
    if (!monthLessons.length) return null;
    return { label: monthName.format(new Date(year, index, 1)), ...analyticsTotalsFor(monthLessons) };
  }).filter(Boolean);
}

function yearlyAnalyticsRows(lessons) {
  const years = [...new Set(lessons.map((lesson) => lesson.date.slice(0, 4)))].sort();
  return years.map((year) => {
    const yearLessons = lessons.filter((lesson) => lesson.date.startsWith(year));
    return { label: year, ...analyticsTotalsFor(yearLessons) };
  });
}

function analyticsTotalsFor(lessons) {
  const statuses = lessons.map((lesson) => lessonStatus(lesson));
  const paid = statuses.reduce((total, status) => total + status.paid, 0);
  const plan = statuses.reduce((total, status) => total + status.paid + status.unpaid, 0);
  const unpaid = lessons.reduce((total, lesson, index) => {
    const conducted = lesson.groupId ? groupLessonConducted(lesson) : Boolean(lesson.conducted);
    return conducted ? total + statuses[index].unpaid : total;
  }, 0);
  return { plan, paid, debt: unpaid, unpaid };
}

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item);
    groups[key] ||= [];
    groups[key].push(item);
    return groups;
  }, {});
}

function weekKey(dateText) {
  const date = asDate(dateText);
  const monday = addDays(date, -((date.getDay() + 6) % 7));
  const sunday = addDays(monday, 6);
  return `${isoDate(monday)} - ${isoDate(sunday)}`;
}

function sortByDateTime(a, b) {
  return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
}

function sortForPaymentAllocation(a, b) {
  const priority = (lesson) => lesson.expected ? 1 : 0;
  return sortByDateTime(a, b) || priority(a) - priority(b);
}

function activeStudentIds() {
  return new Set(state.students.filter((item) => (item.status || "Активен") === "Активен").map((item) => item.id));
}

function activeIndividualStudentIds() {
  return new Set(state.students.filter((item) => (item.status || "Активен") === "Активен" && studentHasIndividualSchedule(item.format || "Индивидуально")).map((item) => item.id));
}

function plannedLessons() {
  const currentCache = cache();
  if (currentCache.planned) return currentCache.planned;
  const individualIds = activeIndividualStudentIds();
  const realLessons = state.lessons.filter((lesson) => !isExcludedLesson(lesson));
  const expected = expectedLessonsForRange(rangeStart(), rangeEnd())
    .filter((lesson) => individualIds.has(lesson.studentId))
    .filter((lesson) => !realLessons.some((real) => lessonsOverlap(real, lesson)));
  const groupLessons = expectedGroupLessonsForRange(rangeStart(), rangeEnd())
    .filter((lesson) => groupStudents(lesson.groupId).length > 0)
    .filter((lesson) => !realLessons.some((real) => lessonsOverlap(real, lesson)));
  currentCache.planned = dedupeLessons([...realLessons, ...expected, ...groupLessons]);
  return currentCache.planned;
}

function dedupeLessons(lessons) {
  const result = [];
  lessons
    .slice()
    .sort((a, b) => lessonPriority(b) - lessonPriority(a) || sortByDateTime(a, b))
    .forEach((lesson) => {
      if (result.some((existing) => sameLessonOwner(existing, lesson) && lessonsOverlap(existing, lesson))) return;
      result.push(lesson);
    });
  return result.sort(sortByDateTime);
}

function sameLessonOwner(a, b) {
  if (isPersonalEvent(a) || isPersonalEvent(b)) return isPersonalEvent(a) && isPersonalEvent(b) && a.title === b.title;
  if (a.studentId || b.studentId) return a.studentId && b.studentId && a.studentId === b.studentId;
  if (a.groupId || b.groupId) return a.groupId && b.groupId && a.groupId === b.groupId;
  return false;
}

function lessonPriority(lesson) {
  if (isPersonalEvent(lesson)) return 4;
  if (lesson.conducted || groupLessonConducted(lesson)) return 3;
  if (!lesson.expected) return 2;
  return 1;
}

function lessonsOverlap(a, b) {
  if (a.date !== b.date) return false;
  if (a.studentId && b.studentId && a.studentId !== b.studentId) return false;
  if (a.groupId && b.groupId && a.groupId !== b.groupId) return false;
  const aStart = timeToMinutes(a.time);
  const bStart = timeToMinutes(b.time);
  const aEnd = aStart + lessonDurationMinutes(a);
  const bEnd = bStart + lessonDurationMinutes(b);
  return aStart < bEnd && bStart < aEnd;
}

function isExcludedLesson(lesson) {
  return (state.exclusions || []).some((excluded) =>
    ((lesson.studentId && excluded.studentId === lesson.studentId) || (lesson.groupId && excluded.groupId === lesson.groupId))
    && excluded.date === lesson.date
    && excluded.time === lesson.time
  );
}

function isAfterScheduleStart(lesson) {
  const owner = student(lesson.studentId);
  const afterStart = !owner.scheduleStartDate || lesson.date >= owner.scheduleStartDate;
  const beforeEnd = !owner.scheduleEndDate || lesson.date <= owner.scheduleEndDate;
  return afterStart && beforeEnd;
}

function rangeStart() {
  const selected = asDate(state.selectedDate);
  return new Date(selected.getFullYear(), 0, 1, 12);
}

function rangeEnd() {
  const selected = asDate(state.selectedDate);
  return new Date(selected.getFullYear(), 11, 31, 12);
}

function expectedLessonsForRange(start, end) {
  const lessons = [];
  for (const item of state.students) {
    if ((item.status || "Активен") !== "Активен") continue;
    if (!studentHasIndividualSchedule(item.format || "Индивидуально")) continue;
    const entries = item.regularSlots || normalizeRegularSlots(item);
    for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
      const date = isoDate(day);
      if (item.scheduleStartDate && date < item.scheduleStartDate) continue;
      if (item.scheduleEndDate && date > item.scheduleEndDate) continue;
      entries
        .filter((entry) => entry.weekday === day.getDay())
        .filter((entry) => !(state.exclusions || []).some((excluded) => excluded.studentId === item.id && excluded.date === date && excluded.time === entry.time))
        .forEach((entry) => {
          const duration = Number(entry.duration || item.lessonDuration || 60);
          lessons.push({
            id: `expected-${item.id}-${date}-${entry.time}`,
            expected: true,
            date,
            time: entry.time,
            studentId: item.id,
            subject: item.subject,
            price: studentPriceForDuration(item, duration),
            duration,
            onlineLink: item.onlineLink || "",
            note: "Постоянное расписание",
            movedFrom: ""
          });
        });
    }
  }
  return lessons;
}

function expectedGroupLessonsForRange(start, end) {
  const lessons = [];
  for (const item of state.groups) {
    if (item.archived) continue;
    if ((item.status || "Активна") !== "Активна") continue;
    const entries = item.regularSlots || normalizeRegularSlots(item);
    for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
      const date = isoDate(day);
      if (item.scheduleStartDate && date < item.scheduleStartDate) continue;
      if (item.scheduleEndDate && date > item.scheduleEndDate) continue;
      entries
        .filter((entry) => entry.weekday === day.getDay())
        .filter((entry) => !(state.exclusions || []).some((excluded) => excluded.groupId === item.id && excluded.date === date && excluded.time === entry.time))
        .forEach((entry) => {
          lessons.push({
            id: `group-${item.id}-${date}-${entry.time}`,
            expected: true,
            groupId: item.id,
            date,
            time: entry.time,
            subject: item.subject,
            price: 0,
            duration: Number(entry.duration || 60),
            onlineLink: item.onlineLink || "",
            note: "Групповое расписание",
            movedFrom: ""
          });
        });
    }
  }
  return lessons;
}

function parseRegularSchedule(text) {
  const days = { "вс": 0, "пн": 1, "вт": 2, "ср": 3, "чт": 4, "пт": 5, "сб": 6 };
  return text
    .split(/[,;\n]+/)
    .map((part) => part.trim().toLowerCase())
    .map((part) => {
      const dayKey = Object.keys(days).find((key) => part.startsWith(key));
      const time = part.match(/([01]?\d|2[0-3]):[0-5]\d/)?.[0];
      return dayKey && time ? { weekday: days[dayKey], time } : null;
    })
    .filter(Boolean);
}

function normalizeRegularSlots(item) {
  if (Array.isArray(item.regularSlots)) {
    return item.regularSlots
      .filter((slot) => slot && slot.weekday !== "" && slot.time)
      .map((slot) => ({
        weekday: Number(slot.weekday),
        time: slot.time,
        duration: slot.duration ? Number(slot.duration) : undefined
      }));
  }
  return parseRegularSchedule(item.regularSchedule || "");
}

function regularEntryForDateTime(item, date, time) {
  const weekday = asDate(date).getDay();
  return normalizeRegularSlots(item).find((slot) => slot.weekday === weekday && slot.time === time);
}

function regularSlotsSignature(slots, startDate = "", endDate = "") {
  const body = normalizeRegularSlots({ regularSlots: slots })
    .map((slot) => `${slot.weekday}-${slot.time}-${slot.duration || ""}`)
    .sort()
    .join("|");
  return `${startDate || ""}..${endDate || ""}:${body}`;
}

function lessonMatchesRegularSlots(lesson, slots) {
  return normalizeRegularSlots({ regularSlots: slots }).some((slot) =>
    slot.weekday === asDate(lesson.date).getDay()
    && slot.time === lesson.time
  );
}

function syncStudentRegularScheduleAfterChange(studentId, oldSlots, oldStartDate = "", oldEndDate = "") {
  const item = state.students.find((studentItem) => studentItem.id === studentId);
  if (!item) return;
  const newSlots = item.regularSlots || [];
  const oldSignature = regularSlotsSignature(oldSlots, oldStartDate, oldEndDate);
  const newSignature = regularSlotsSignature(newSlots, item.scheduleStartDate || "", item.scheduleEndDate || "");
  if (oldSignature === newSignature) return;
  const fromDate = todayIso();
  state.lessons = state.lessons.filter((lesson) => {
    if (lesson.studentId !== studentId) return true;
    if (isPersonalEvent(lesson) || lesson.conducted || lesson.movedFrom) return true;
    if (lesson.date < fromDate) return true;
    return !lessonMatchesRegularSlots(lesson, oldSlots);
  });
  cleanupStaleRegularLessons(studentId);
  state.exclusions = (state.exclusions || []).filter((excluded) => {
    if (excluded.studentId !== studentId) return true;
    if (excluded.date < fromDate) return true;
    return !lessonMatchesRegularSlots(excluded, oldSlots) && !lessonMatchesRegularSlots(excluded, newSlots);
  });
}

function cleanupStaleRegularLessons(studentId) {
  const item = state.students.find((studentItem) => studentItem.id === studentId);
  if (!item) return;
  const fromDate = todayIso();
  state.lessons = state.lessons.filter((lesson) => {
    if (lesson.studentId !== studentId) return true;
    if (isPersonalEvent(lesson) || lesson.groupId || lesson.conducted || lesson.movedFrom) return true;
    if (lesson.date < fromDate) return true;
    const fromRegular = lesson.source === "regular" || lesson.note === "Постоянное расписание";
    if (!fromRegular) return true;
    return Boolean(regularEntryForDateTime(item, lesson.date, lesson.time));
  });
}

function syncGroupRegularScheduleAfterChange(groupId, oldSlots, oldStartDate = "", oldEndDate = "") {
  const item = state.groups.find((groupItem) => groupItem.id === groupId);
  if (!item) return;
  const newSlots = item.regularSlots || [];
  const oldSignature = regularSlotsSignature(oldSlots, oldStartDate, oldEndDate);
  const newSignature = regularSlotsSignature(newSlots, item.scheduleStartDate || "", item.scheduleEndDate || "");
  if (oldSignature === newSignature) return;
  const fromDate = todayIso();
  state.lessons = state.lessons.filter((lesson) => {
    if (lesson.groupId !== groupId) return true;
    if (lesson.conducted || lesson.movedFrom) return true;
    if (lesson.date < fromDate) return true;
    return !lessonMatchesRegularSlots(lesson, oldSlots);
  });
  state.exclusions = (state.exclusions || []).filter((excluded) => {
    if (excluded.groupId !== groupId) return true;
    if (excluded.date < fromDate) return true;
    return !lessonMatchesRegularSlots(excluded, oldSlots) && !lessonMatchesRegularSlots(excluded, newSlots);
  });
}

function regularSlotsFromForm(data, count = maxRegularSlots) {
  return Array.from({ length: Math.max(1, Math.min(maxRegularSlots, Number(count || maxRegularSlots))) }, (_, index) => index + 1)
    .map((index) => ({ weekday: data[`regularDay${index}`], time: data[`regularTime${index}`], duration: data[`regularDuration${index}`] }))
    .filter((slot) => slot.weekday !== "" && slot.time)
    .map((slot) => ({
      weekday: Number(slot.weekday),
      time: slot.time,
      duration: slot.duration ? Number(slot.duration) : undefined
    }));
}

function setRegularSlotsForm(form, slots) {
  Array.from({ length: maxRegularSlots }, (_, index) => index + 1).forEach((index) => {
    const slot = slots[index - 1] || {};
    if (form[`regularDay${index}`]) form[`regularDay${index}`].value = slot.weekday ?? "";
    if (form[`regularTime${index}`]) form[`regularTime${index}`].value = slot.time || "";
    if (form[`regularDuration${index}`]) form[`regularDuration${index}`].value = slot.duration || "";
  });
  updateVisibleRegularRows(form);
}

function updateVisibleRegularRows(form) {
  const count = Math.max(1, Math.min(maxRegularSlots, Number(form.lessonsPerWeek?.value || 1)));
  form.querySelectorAll(".regular-slot-row").forEach((row, index) => {
    const visible = index < count;
    row.classList.toggle("hidden", !visible);
    row.querySelectorAll("input, select").forEach((field) => {
      field.disabled = !visible;
    });
  });
}

function studentHasGroup(format) {
  return format === "Группа" || format === "Индивидуально + группа";
}

function studentHasIndividualSchedule(format) {
  return format !== "Группа";
}

function updateStudentFormatFields() {
  const form = el("studentForm");
  const format = form.format.value;
  const showGroup = studentHasGroup(format);
  const showIndividual = studentHasIndividualSchedule(format);
  el("studentGroupField").classList.toggle("hidden", !showGroup);
  el("studentLessonsPerWeekField").classList.toggle("hidden", !showIndividual);
  el("studentIndividualScheduleBlock").classList.toggle("hidden", !showIndividual);
  el("studentGroupScheduleHint").classList.toggle("hidden", showIndividual);
  form.groupId.disabled = !showGroup;
  form.lessonsPerWeek.disabled = !showIndividual;
  form.scheduleStartDate.disabled = !showIndividual;
  form.scheduleEndDate.disabled = !showIndividual;
  form.onlineLink.disabled = !showIndividual;
  updateVisibleRegularRows(form);
}

function regularSlotsText(slots) {
  const names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  return slots.map((slot) => `${names[slot.weekday]} ${slot.time}${slot.duration ? ` (${slot.duration} мин)` : ""}`).join(", ");
}


function sum(items, field) {
  return items.reduce((total, item) => total + Number(item[field] || 0), 0);
}

function sumLessonPrices(lessons) {
  return lessons.reduce((total, lesson) => total + lessonPrice(lesson), 0);
}

