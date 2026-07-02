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

  // iOS standalone update button — force-refresh SW + caches (see WEB_APP_STANDARDS)
  const upd = document.getElementById("btn-update");
  if (upd) upd.addEventListener("click", async () => {
    if (!navigator.onLine) { alert("Connect to the internet, then try again."); return; }
    upd.textContent = "UPDATING…";
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.update();
      }
      if (window.caches) {
        const keys = await caches.keys();
        for (const k of keys) await caches.delete(k);
      }
    } catch (e) {}
    location.href = "index.html?u=" + Date.now();
  });

  const fb = document.getElementById("btn-feedback");
  if (fb && window.Feedback && window.Feedback.open) fb.addEventListener("click", () => window.Feedback.open());
  else if (fb) fb.addEventListener("click", () => {
    location.href = "mailto:info@conikersystems.com?subject=Axis 1942 feedback";
  });

  UI.init();
})();
