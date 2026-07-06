/* App boot: footer/version, PWA registration, iOS update button, feedback. */
(function () {
  "use strict";

  // footer branding (standard: © year Coniker Systems™ · vX.Y.Z)
  for (const f of document.querySelectorAll(".site-footer")) {
    f.textContent = `© ${new Date().getFullYear()} Coniker Systems™ · v${window.APP_VERSION}`;
  }

  // service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  // iOS standalone update button. Checks the live version first (bypassing every
  // cache), reports what it found, then fully replaces the service worker +
  // caches and reloads. r.update() alone is not enough on iOS — unregister so
  // the next load installs the new worker and precaches a fresh shell.
  const upd = document.getElementById("btn-update");
  if (upd) upd.addEventListener("click", async () => {
    if (!navigator.onLine) { alert("Connect to the internet, then try again."); return; }
    upd.textContent = "CHECKING…";
    let remote = null;
    try {
      const txt = await fetch("static/js/version.js?u=" + Date.now(), { cache: "no-store" })
        .then((r) => r.text());
      remote = (txt.match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1] || null;
    } catch (e) {}
    if (remote && remote === window.APP_VERSION) {
      upd.textContent = "✅ UP TO DATE — v" + remote;
      setTimeout(() => { upd.textContent = "🔄 UPDATE APP"; }, 3000);
      return;
    }
    upd.textContent = remote ? ("UPDATING TO v" + remote + "…") : "UPDATING…";
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
      if (window.caches) {
        const keys = await caches.keys();
        for (const k of keys) await caches.delete(k);
      }
    } catch (e) {}
    location.replace("index.html?u=" + Date.now());
  });

  const fb = document.getElementById("btn-feedback");
  if (fb && window.Feedback && window.Feedback.open) fb.addEventListener("click", () => window.Feedback.open());
  else if (fb) fb.addEventListener("click", () => {
    location.href = "mailto:info@conikersystems.com?subject=Axis 1942 feedback";
  });

  UI.init();
})();
