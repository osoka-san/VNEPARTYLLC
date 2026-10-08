// Native POST stays native: credentials are never read, copied or logged here.
(() => {
  const form = document.querySelector('form[action="/admin-login"]');
  const overlay = document.querySelector("[data-gate-loading]");
  if (!form || !overlay) return;
  const percent = overlay.querySelector("[data-loading-percent]");
  const percentValue = overlay.querySelector("[data-loading-percent-value]");
  let showTimer, resetTimer, progressTimer;
  let progress = 0;
  let startedAt = 0;
  let showDelay = 180;
  try {
    const settings = JSON.parse(
      document.getElementById("vne-loading-defaults")?.textContent || "{}",
    );
    if (typeof settings.showDelay === "number" && Number.isFinite(settings.showDelay))
      showDelay = Math.max(0, Math.min(1000, settings.showDelay));
  } catch {
    /* The native form remains usable if optional settings are unavailable. */
  }
  function setProgress(value) {
    progress = value;
    if (percent) {
      percent.style.setProperty("--loading-progress", String(progress / 100));
      percent.setAttribute("aria-valuenow", String(progress));
      percent.setAttribute("aria-valuetext", `Приблизительно ${progress}%`);
    }
    if (percentValue) percentValue.textContent = `${progress}%`;
  }
  function tickProgress() {
    const elapsed = Math.max(0, Date.now() - startedAt);
    setProgress(Math.min(94, Math.max(progress, Math.round(94 * (1 - Math.exp(-elapsed / 4000))))));
    // Native navigation has no byte/milestone completion callback. Never claim 100%.
    if (progress < 94) progressTimer = setTimeout(tickProgress, 250);
  }
  function reset() {
    clearTimeout(showTimer);
    clearTimeout(resetTimer);
    clearTimeout(progressTimer);
    overlay.hidden = true;
    setProgress(0);
    form.removeAttribute("aria-busy");
    const button = form.querySelector("button");
    if (button) button.disabled = false;
  }
  form.addEventListener("submit", (event) => {
    if (event.defaultPrevented) return;
    clearTimeout(showTimer);
    clearTimeout(resetTimer);
    clearTimeout(progressTimer);
    startedAt = Date.now();
    setProgress(0);
    form.setAttribute("aria-busy", "true");
    const button = form.querySelector("button");
    if (button) button.disabled = true;
    showTimer = setTimeout(() => {
      overlay.hidden = false;
      tickProgress();
    }, showDelay);
    // A stalled navigation must not trap the form. Normal POST navigation is untouched.
    resetTimer = setTimeout(reset, 12_000);
  });
  window.addEventListener("pageshow", reset);
})();
