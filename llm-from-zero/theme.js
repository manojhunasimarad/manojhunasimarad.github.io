// Light, dark, or follow the device. Loaded first in <head> so the page never flashes the wrong colours.
// The choice is kept per device ("lfz-theme"): a phone at night and a laptop by day may differ.
(function () {
  var KEY = "lfz-theme", CHOICES = ["system", "light", "dark"];
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function choice() {
    try { var v = localStorage.getItem(KEY); return CHOICES.indexOf(v) >= 0 ? v : "system"; } catch (e) { return "system"; }
  }
  function apply() {
    var c = choice(), dark = c === "dark" || (c === "system" && !!(media && media.matches));
    var root = document.documentElement;
    root.setAttribute("data-theme", dark ? "dark" : "light");
    root.setAttribute("data-theme-choice", c);
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].textContent = c === "system" ? "◐ System" : c === "dark" ? "☾ Dark" : "☀ Light";
      buttons[i].setAttribute("aria-label", "Colour theme: " + c + ". Press to change.");
    }
  }
  function set(c) {
    try { if (c === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, c); } catch (e) {}
    apply();
  }
  if (media) {
    if (media.addEventListener) media.addEventListener("change", apply); else if (media.addListener) media.addListener(apply);
  }
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-theme-toggle]");
    if (b) set(CHOICES[(CHOICES.indexOf(choice()) + 1) % CHOICES.length]);
  });
  document.addEventListener("DOMContentLoaded", apply);
  window.addEventListener("storage", function (e) { if (e.key === KEY) apply(); });
  window.lfzTheme = { get: choice, set: set, apply: apply };
  apply();
})();
