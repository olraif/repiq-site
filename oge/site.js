document.documentElement.classList.add("js");

const yearNode = document.getElementById("year");
if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

const trackGoal = (goalName) => {
  if (typeof window.ym !== "function" || !window.METRIKA_COUNTER_ID) return;
  window.ym(window.METRIKA_COUNTER_ID, "reachGoal", goalName);
};

document.querySelectorAll('a[href^="tel:"]').forEach((link) => {
  link.addEventListener("click", () => trackGoal("CALL_CLICK"));
});

const revealItems = [...document.querySelectorAll("[data-reveal]")];

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  revealItems.forEach((item) => observer.observe(item));
  requestAnimationFrame(() => {
    revealItems.forEach((item) => {
      const rect = item.getBoundingClientRect();
      if (rect.top < window.innerHeight * 1.15 && rect.bottom > 0) {
        item.classList.add("is-visible");
      }
    });
  });
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const contactUrls = {
  vk: "https://vk.com/olraif",
  telegram: "https://t.me/olraif",
};

const configureContactLink = (link, url, label) => {
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  if (label) link.textContent = label;
  return link;
};

document.querySelectorAll("a").forEach((link) => {
  const label = link.textContent.trim().toLowerCase();
  if (label === "\u0432\u043a" || label === "\u043d\u0430\u043f\u0438\u0441\u0430\u0442\u044c \u0432 \u0432\u043a") configureContactLink(link, contactUrls.vk);
  if (label === "telegram") configureContactLink(link, contactUrls.telegram);
});

const heroAbout = document.querySelector(".hero");
if (heroAbout) {
  heroAbout.classList.add("hero-about-mode");
  const kicker = heroAbout.querySelector(".hero-copy > .eyebrow");
  if (kicker) kicker.lastChild.textContent = " \u041e\u0411\u041e \u041c\u041d\u0415";
  const title = heroAbout.querySelector(".hero-copy > h1");
  if (title) title.innerHTML = "\u0423\u0447\u0443 <span>\u043c\u0430\u0442\u0435\u043c\u0430\u0442\u0438\u043a\u0435</span> \u0438 <span>\u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0442\u0438\u043a\u0435</span> \u2014 \u0447\u0435\u0440\u0435\u0437 \u043f\u043e\u043d\u0438\u043c\u0430\u043d\u0438\u0435 \u0438 \u0441\u0438\u0441\u0442\u0435\u043c\u0443";
  const lead = heroAbout.querySelector(".hero-copy > .hero-lead");
  if (lead) lead.textContent = "\u041f\u0440\u0438\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044e! \u042f \u041e\u043b\u0435\u0441\u044f \u0420\u0430\u0438\u0444\u043e\u0432\u043d\u0430 \u0421\u0430\u0439\u0444\u0443\u043b\u043b\u0438\u043d\u0430 \u2014 \u043f\u0440\u0435\u043f\u043e\u0434\u0430\u0432\u0430\u0442\u0435\u043b\u044c \u043c\u0430\u0442\u0435\u043c\u0430\u0442\u0438\u043a\u0438 \u0438 \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0442\u0438\u043a\u0438, \u0432\u044b\u043f\u0443\u0441\u043a\u043d\u0438\u0446\u0430 \u041e\u0413\u041f\u0423. \u041f\u043e\u043c\u043e\u0433\u0430\u044e \u0434\u0435\u0432\u044f\u0442\u0438\u043a\u043b\u0430\u0441\u0441\u043d\u0438\u043a\u0430\u043c \u0443\u0432\u0435\u0440\u0435\u043d\u043d\u043e \u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c\u0441\u044f \u043a \u041e\u0413\u042d \u0438 \u0437\u0430\u043a\u043b\u0430\u0434\u044b\u0432\u0430\u0442\u044c \u0444\u0443\u043d\u0434\u0430\u043c\u0435\u043d\u0442 \u0434\u043b\u044f \u0415\u0413\u042d 80+.";
  if (!heroAbout.querySelector(".hero-stats")) {
    const stats = document.createElement("div");
    stats.className = "hero-stats";
    stats.innerHTML = "<div><strong>20+</strong><span>\u043b\u0435\u0442 \u043e\u043f\u044b\u0442\u0430</span></div><div><strong>300+</strong><span>\u0443\u0447\u0435\u043d\u0438\u043a\u043e\u0432</span></div>";
    const actions = heroAbout.querySelector(".hero-actions");
    if (actions) actions.before(stats);
  }
  heroAbout.querySelectorAll(".hero-note").forEach((note) => note.remove());
}
const heroAboutTitle = document.querySelector(".hero-about-mode .hero-copy > h1");
if (heroAboutTitle) heroAboutTitle.innerHTML = "\u0423\u0447\u0443 \u043c\u0430\u0442\u0435\u043c\u0430\u0442\u0438\u043a\u0435 \u0438 \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0442\u0438\u043a\u0435 \u2014 <span>\u0447\u0435\u0440\u0435\u0437 \u043f\u043e\u043d\u0438\u043c\u0430\u043d\u0438\u0435</span> \u0438 \u0441\u0438\u0441\u0442\u0435\u043c\u0443";
