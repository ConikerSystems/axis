/* Single source of truth for the app version. Shown in the footer so a user
   can report which build they're on. Bump this AND the sw.js cache name on
   every deploy. */
window.APP_VERSION = "1.13.1";

/* Config for the shared Share/Feedback widget (must be set before feedback.js loads). */
window.APP_INFO = {
  name: "Axis 1942",
  url: "https://conikersystems.github.io/axis/",
  email: "info@conikersystems.com",
  noFab: true, // we have our own feedback button on the home screen
};
