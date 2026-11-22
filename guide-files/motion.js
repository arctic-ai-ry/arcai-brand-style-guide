/*! Arctic AI motion kit.
 *  A tiny timeline on top of the Web Animations API, with the brand's signature moves as presets.
 *  The same timeline plays live in the browser and can be stepped frame by frame for video export
 *  (tools/render-video.mjs), so what you preview is exactly what you render.
 *
 *      const tl = ArcaiMotion.timeline({ duration: 8, aurora });   // aurora: optional ArcaiAurora instance
 *      tl.add('.line', 'lineWipe', { at: 0.2 })
 *        .add('.title .row', 'rise', { at: 0.8, stagger: 0.08 })
 *        .add('.arcai-tick', 'strike', { at: 1.6 });
 *      ArcaiMotion.run(tl);      // plays; honours ?t=3.2 (freeze on a frame), ?capture and reduced motion
 *
 *  Two speeds only: "snap" for sharp things (titles, check-marks, bands, facets) and "drift" for the aurora.
 *  No bounce, no elastic, no spin.
 */
(function (root) {
  'use strict';

  var SNAP = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var GLIDE = 'cubic-bezier(0.65, 0, 0.35, 1)';

  /** Signature moves. Each returns { keyframes, duration (ms), easing, iterations?, pseudoElement? }. */
  var PRESETS = {
    /* Gradient line grows from the left edge. */
    lineWipe: function () {
      return { keyframes: [{ transform: 'scaleX(0)', transformOrigin: '0 50%' }, { transform: 'scaleX(1)', transformOrigin: '0 50%' }], duration: 900, easing: GLIDE };
    },
    /* A title line rises from behind its own baseline. Put each line in its own inline-block element. */
    rise: function () {
      return {
        keyframes: [
          { transform: 'translateY(100%)', clipPath: 'inset(-60% -6% 100% -6%)' },
          { transform: 'translateY(0)', clipPath: 'inset(-60% -6% 0% -6%)' }
        ],
        duration: 700, easing: SNAP
      };
    },
    /* The check-mark is struck: short arm first, then the long arm up to the right. */
    strike: function () {
      return { keyframes: [{ clipPath: 'inset(-5% 100% -5% 0)' }, { clipPath: 'inset(-5% -5% -5% 0)' }], duration: 400, easing: SNAP };
    },
    /* The same strike on a list item's ::before check-mark. */
    strikeBullet: function () {
      var p = PRESETS.strike();
      p.pseudoElement = '::before';
      return p;
    },
    /* Small things arrive: logo, lead text, links, list rows. */
    fadeUp: function () {
      return { keyframes: [{ opacity: 0, transform: 'translateY(0.4em)' }, { opacity: 1, transform: 'translateY(0)' }], duration: 400, easing: SNAP };
    },
    /* Navy band wipes in from the left edge. */
    bandIn: function () {
      return { keyframes: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], duration: 700, easing: SNAP };
    },
    /* Green call-to-action band slides in from the left, slanted end leading. */
    slideIn: function () {
      return { keyframes: [{ transform: 'translateX(-101%)' }, { transform: 'translateX(0)' }], duration: 700, easing: SNAP };
    },
    /* A facet crystallises: use with stagger on the <path> elements of an inline facet SVG. */
    crystallise: function () {
      return {
        keyframes: [
          { opacity: 0, transform: 'translate(2.5%, -2%) scale(0.86)' },
          { opacity: 1, transform: 'translate(0, 0) scale(1)' }
        ],
        duration: 500, easing: SNAP
      };
    },
    /* The arrow nudges right, forever. */
    nudge: function () {
      return {
        keyframes: [{ transform: 'translateX(0)' }, { transform: 'translateX(0.16em)', offset: 0.5 }, { transform: 'translateX(0)' }],
        duration: 1600, easing: GLIDE, iterations: Infinity
      };
    },
    /* Everything leaves together at the end of a loop. */
    fadeOut: function () {
      return { keyframes: [{ opacity: 1 }, { opacity: 0 }], duration: 400, easing: GLIDE };
    }
  };

  /** Facets crystallise outward from a corner of an inline facet <svg>.
   *  corner: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left'. at / step in seconds. */
  function crystallise(tl, svg, corner, at, step) {
    if (typeof svg === 'string') svg = document.querySelector(svg);
    var vb = svg.viewBox.baseVal;
    var cx = /right/.test(corner) ? vb.x + vb.width : vb.x;
    var cy = /bottom/.test(corner) ? vb.y + vb.height : vb.y;
    Array.prototype.map.call(svg.querySelectorAll('path'), function (p) {
      var b = p.getBBox();
      return { p: p, d: Math.hypot(b.x + b.width / 2 - cx, b.y + b.height / 2 - cy) };
    }).sort(function (a, b) { return a.d - b.d; }).forEach(function (o, i) {
      tl.add(o.p, 'crystallise', { at: (at || 0) + i * (step == null ? 0.03 : step) });
    });
    return tl;
  }

  function timeline(options) {
    /* auroraLoop: the aurora eases forward and back once per loop, so the last frame equals the first
       and the video loops without a jump (the veils drift so slowly that the turn is invisible). */
    var o = Object.assign({ duration: 8, aurora: null, auroraStart: 0, auroraLoop: true, loop: true }, options || {});
    var anims = [];
    var raf = 0, origin = 0, now = 0;

    var api = {
      duration: o.duration,
      /** target: selector, element or list. at / stagger in seconds. */
      add: function (target, preset, opts) {
        opts = opts || {};
        var make = typeof preset === 'function' ? preset : PRESETS[preset];
        if (!make) throw new Error('ArcaiMotion: unknown preset "' + preset + '"');
        var els = typeof target === 'string' ? document.querySelectorAll(target) : (target.length != null && !target.tagName ? target : [target]);
        Array.prototype.forEach.call(els, function (el, i) {
          /* a preset may return one move or several; a move may target a child with `selector` */
          [].concat(make(el, opts)).forEach(function (def) {
            var node = def.selector ? el.querySelector(def.selector) : el;
            if (!node) return;
            if (def.keyframes[0].transform && /^(path|g)$/i.test(node.tagName)) {
              node.style.transformBox = 'fill-box';
              node.style.transformOrigin = '50% 50%';
            }
            var timing = {
              duration: opts.duration != null ? opts.duration * 1000 : def.duration,
              delay: ((opts.at || 0) + i * (opts.stagger || 0)) * 1000,
              easing: opts.easing || def.easing,
              iterations: def.iterations || 1,
              fill: 'both'
            };
            if (def.pseudoElement) timing.pseudoElement = def.pseudoElement;
            var a = node.animate(def.keyframes, timing);
            a.pause();
            anims.push(a);
          });
        });
        return api;
      },
      /** Draw the exact frame at `seconds`. */
      seek: function (seconds) {
        now = seconds;
        for (var i = 0; i < anims.length; i++) anims[i].currentTime = seconds * 1000;
        if (o.aurora) {
          var drift = o.auroraLoop ? (o.duration / 2) * (1 - Math.cos((2 * Math.PI * seconds) / o.duration)) / 2 : seconds;
          o.aurora.seek(o.auroraStart + drift);
        }
        return api;
      },
      play: function () {
        api.stop();
        origin = performance.now() - now * 1000;
        (function loop(ts) {
          var t = (ts - origin) / 1000;
          if (t >= o.duration) {
            if (!o.loop) { api.seek(o.duration); return; }
            origin = ts; t = 0;
          }
          api.seek(Math.max(0, t));
          raf = root.requestAnimationFrame(loop);
        })(performance.now());
        return api;
      },
      stop: function () { root.cancelAnimationFrame(raf); return api; },
      get time() { return now; }
    };
    return api;
  }

  /** Start a timeline the standard way.
   *  ?t=3.2      freeze on that second (also how stills and posters are rendered)
   *  ?capture    do not autoplay; tools call window.arcaiSeek(seconds) for each video frame
   *  reduced motion: show the hold frame (options.holdAt, default 70% of the duration) */
  function run(tl, options) {
    var o = Object.assign({ holdAt: tl.duration * 0.7 }, options || {});
    var q = new URLSearchParams(root.location.search);
    var ready = (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
      return Promise.all(Array.prototype.map.call(document.images, function (img) {
        return img.complete ? null : new Promise(function (res) { img.onload = img.onerror = res; });
      }));
    });
    root.arcaiTimeline = tl;
    root.arcaiDuration = tl.duration;
    root.arcaiReady = ready;
    root.arcaiSeek = function (seconds) {
      tl.seek(seconds);
      return new Promise(function (res) { root.requestAnimationFrame(function () { root.requestAnimationFrame(res); }); });
    };
    tl.seek(0);
    ready.then(function () {
      if (q.has('t')) tl.seek(parseFloat(q.get('t')) || 0);
      else if (q.has('capture')) tl.seek(0);
      else if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) tl.seek(o.holdAt);
      else tl.play();
      document.documentElement.setAttribute('data-arcai-ready', '');
    });
    return tl;
  }

  root.ArcaiMotion = { timeline: timeline, run: run, crystallise: crystallise, PRESETS: PRESETS, SNAP: SNAP, GLIDE: GLIDE };
})(typeof window !== 'undefined' ? window : this);
