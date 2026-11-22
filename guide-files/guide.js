/* Arctic AI brand style guide — page behaviour: the live aurora, the one entrance, the motion stage. */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var printing = new URLSearchParams(location.search).has('print');
  var still = reduced || printing;

  /* cover: aurora veils behind the title, and one entrance (title rises, check-mark strikes) */
  var heroAurora = ArcaiAurora.mount('#hero-aurora', still ? { time: 1.4 } : { interactive: true });
  var cover = ArcaiMotion.timeline({ duration: 2, loop: false });
  cover.add('.hero__title .row', 'rise', { at: 0.15, stagger: 0.08 })
       .add('.hero__title .arcai-tick', 'strike', { at: 1.0 })
       .add('.hero__lead', 'fadeUp', { at: 1.25 })
       .add('.hero__meta', 'fadeUp', { at: 1.4 });
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  cover.seek(still ? 2 : 0);
  if (!still) fontsReady.then(function () { cover.play(); });

  /* motion chapter: a live stage. The aurora drifts by itself; the sharp pieces snap in on request. */
  ArcaiAurora.mount('#stage-aurora', still ? { time: 1.4, blur: 8 } : { interactive: true, blur: 8 });
  var stage = ArcaiMotion.timeline({ duration: 4.2, loop: false });
  stage.add('#stage .arcai-gradient-line', 'lineWipe', { at: 0.1 })
       .add('#stage .arcai-title .row', 'rise', { at: 0.5, stagger: 0.08 })
       .add('#stage .arcai-tick', 'strike', { at: 1.25 })
       .add('#stage .arcai-lead', 'fadeUp', { at: 1.7 })
       .add('#stage .arcai-cta-band', 'slideIn', { at: 2.3 })
       .add('#stage .arcai-link', 'fadeUp', { at: 2.9 })
       .add('#stage .arcai-arrow', 'nudge', { at: 3.0 });
  stage.seek(4.2);
  var replay = document.getElementById('replay');
  function playStage() { stage.seek(0); if (!reduced) stage.play(); else stage.seek(4.2); }
  if (replay) replay.addEventListener('click', playStage);
  if (!still && 'IntersectionObserver' in window) {
    var seen = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { seen.disconnect(); playStage(); }
    }, { threshold: 0.6 });
    seen.observe(document.getElementById('stage'));
  }

  /* buttons chapter: the arrow becomes the check-mark */
  var confirm = document.getElementById('confirm');
  if (confirm) {
    var timer = 0;
    confirm.addEventListener('click', function () {
      confirm.classList.add('is-done');
      clearTimeout(timer);
      timer = setTimeout(function () { confirm.classList.remove('is-done'); }, 2600);
    });
  }

  /* contents: mark the chapter being read */
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  if (links.length && 'IntersectionObserver' in window) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var current = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute('aria-current'); });
        var link = byId[entry.target.id];
        if (link) link.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    document.querySelectorAll('.chapter').forEach(function (s) { current.observe(s); });
  }

  /* printing from the browser: show finished states */
  window.addEventListener('beforeprint', function () { cover.stop(); cover.seek(2); stage.stop(); stage.seek(4.2); });
})();
