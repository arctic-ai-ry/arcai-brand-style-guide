/*! Arctic AI aurora veils.
 *  Standalone port of the animated background on arcai.fi (same curtains, hues, blur and pointer response).
 *  No dependencies. Works from a file:// page.
 *
 *  Full-page background, as on the website:
 *      <div id="aurora" aria-hidden="true"></div>
 *      <script src="aurora.js"></script>
 *      <script>ArcaiAurora.mount('#aurora', { fixed: true });</script>
 *
 *  Inside a box (hero, card, video canvas): give the box a size and `position: relative`, then
 *      ArcaiAurora.mount(box);
 *
 *  Still image or video frame: freeze the clock and draw the second you want
 *      const aurora = ArcaiAurora.mount(box, { time: 1.4 });   // still
 *      aurora.seek(3.25);                                       // any other frame
 *
 *  The aurora always sits on white (#FEFEFE). Never put it on a dark or night-sky background.
 */
(function (root) {
  'use strict';

  /** The three veils. Hues follow the logo: flare ~142°, teal ~163°, blue ~201°. */
  var CURTAINS = [
    { hue: 146, y: 0.24, speed: 0.22, alpha: 0.62, depth: 0.17 },
    { hue: 163, y: 0.30, speed: 0.16, alpha: 0.50, depth: 0.15 },
    { hue: 198, y: 0.27, speed: 0.13, alpha: 0.42, depth: 0.16 }
  ];

  var DEFAULTS = {
    curtains: CURTAINS,
    hueShift: 22,          // total hue swing as the pointer crosses the width (±11°): stays inside green–blue
    fps: 10,               // the site draws 10 frames a second and lets the blur smooth them; 0 = every animation frame
    blur: 10,              // px of CSS blur; about 1% of the shorter side of the box
    scaleY: 0.72,          // vertical squash of the veil layer
    shiftY: 0,             // move the veils down (+) or up (−), as a fraction of the box height
    interactive: true,     // veils lean toward the pointer
    parallax: false,       // veils drift up slightly on scroll; only with fixed: true
    fixed: false,          // true = fixed full-viewport background (like arcai.fi)
    pointer: { x: 0.5, y: 0.32 },   // resting pointer position, 0–1
    time: null,            // number = frozen at that second; null = running
    respectReducedMotion: true,     // prefers-reduced-motion: draw one still frame (second 1.4)
    maxPixels: 420000
  };

  function mount(target, options) {
    var box = typeof target === 'string' ? document.querySelector(target) : target;
    if (!box) throw new Error('ArcaiAurora: container not found');
    var o = Object.assign({}, DEFAULTS, options || {});
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) throw new Error('ArcaiAurora: canvas 2D context unavailable');

    box.setAttribute('aria-hidden', 'true');
    if (o.fixed) {
      css(box, { position: 'fixed', inset: '0', zIndex: '0', pointerEvents: 'none', background: 'transparent' });
    } else {
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
      css(box, { overflow: 'hidden', pointerEvents: 'none' });
    }
    css(canvas, {
      position: 'absolute', top: '-6%', left: '-2%', width: '104%', height: '118%', display: 'block',
      background: 'transparent', transformOrigin: '50% 22%', filter: 'blur(' + o.blur + 'px)', willChange: 'transform'
    });
    box.appendChild(canvas);

    var reduced = o.respectReducedMotion && root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var frozen = typeof o.time === 'number';
    var width = 1, height = 1;
    var targetX = o.pointer.x, targetY = o.pointer.y, mouseX = targetX, mouseY = targetY;
    var frame = 0, timer = 0, running = false, scrollY = 0, lastTime = frozen ? o.time : 1.4;

    function size() {
      var rect = o.fixed ? { width: root.innerWidth, height: root.innerHeight } : box.getBoundingClientRect();
      var viewW = Math.max(rect.width, 1), viewH = Math.max(rect.height, 1);
      var factor = viewW >= 1400 ? 0.5 : viewW >= 900 ? 0.42 : 0.34;
      var w = Math.max(260, Math.round(Math.min(viewW * factor, 880)));
      var h = Math.round(w * (viewH / viewW) * 1.12);
      if (w * h > o.maxPixels) {
        var s = Math.sqrt(o.maxPixels / (w * h));
        w = Math.round(w * s); h = Math.round(h * s);
      }
      width = w; height = h; canvas.width = w; canvas.height = h;
    }

    function onPointer(event) {
      var rect = o.fixed ? { left: 0, top: 0, width: root.innerWidth, height: root.innerHeight } : box.getBoundingClientRect();
      targetX = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
      targetY = clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
    }

    function veilPoint(nx, time, layer, index) {
      var cursor = Math.exp(-Math.pow(nx - mouseX, 2) * 6);
      var drift = (mouseX - 0.5) * 0.08;
      var wave = Math.sin(nx * 3.2 + time * layer.speed + index) * 0.035 +
                 Math.sin(nx * 1.3 - time * layer.speed * 0.65 + index) * 0.055;
      var y = layer.y + o.shiftY + drift + (0.42 - mouseY) * 0.16 + cursor * 0.07 + wave;
      var depth = (layer.depth == null ? 0.17 : layer.depth) + cursor * 0.07 + (1 - mouseY) * 0.035;
      return { top: y * height, bottom: (y + depth) * height };
    }

    function traceVeil(time, layer, index) {
      var step = Math.max(4, width / 36), points = [], x, i, p, prev, next, midX;
      for (x = -step; x <= width + step; x += step) {
        p = veilPoint(x / width, time, layer, index);
        points.push({ x: x, top: p.top, bottom: p.bottom });
      }
      ctx.beginPath();
      for (i = 0; i < points.length; i++) {
        p = points[i];
        if (i === 0) { ctx.moveTo(p.x, p.top); continue; }
        prev = points[i - 1]; midX = (prev.x + p.x) / 2;
        ctx.quadraticCurveTo(prev.x, prev.top, midX, (prev.top + p.top) / 2);
      }
      var last = points[points.length - 1];
      ctx.lineTo(last.x, last.top);
      for (i = points.length - 1; i >= 0; i--) {
        p = points[i];
        if (i === points.length - 1) { ctx.lineTo(p.x, p.bottom); continue; }
        next = points[i + 1]; midX = (next.x + p.x) / 2;
        ctx.quadraticCurveTo(next.x, next.bottom, midX, (next.bottom + p.bottom) / 2);
      }
      ctx.closePath();
      return points;
    }

    function drawCurtain(time, layer, index) {
      var hue = (((layer.hue + (mouseX - 0.5) * o.hueShift) % 360) + 360) % 360;
      var points = traceVeil(time, layer, index);
      var crest = points[0].top, foot = points[0].bottom, i;
      for (i = 0; i < points.length; i++) {
        if (points[i].top < crest) crest = points[i].top;
        if (points[i].bottom > foot) foot = points[i].bottom;
      }
      var glow = ctx.createLinearGradient(0, crest, 0, foot);
      var strength = layer.alpha * (0.55 + (1 - mouseY) * 0.2);
      glow.addColorStop(0, 'hsla(' + hue + ', 78%, 46%, 0)');
      glow.addColorStop(0.22, 'hsla(' + hue + ', 76%, 44%, ' + strength + ')');
      glow.addColorStop(0.62, 'hsla(' + hue + ', 70%, 34%, ' + strength * 0.55 + ')');
      glow.addColorStop(1, 'hsla(' + hue + ', 68%, 26%, 0)');
      ctx.fillStyle = glow;
      ctx.fill();
    }

    function applyTransform() {
      var depth = o.fixed && o.parallax && !reduced ? Math.min(scrollY, 1200) : 0;
      canvas.style.transform = 'translate3d(0, ' + (-depth * 0.06).toFixed(1) + 'px, 0) scale(1, ' + o.scaleY + ')';
    }

    function render(time) {
      lastTime = time;
      applyTransform();
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      for (var i = 0; i < o.curtains.length; i++) drawCurtain(time, o.curtains[i], i);
    }

    function tick(now) {
      if (document.hidden) { running = false; return; }
      mouseX += (targetX - mouseX) * 0.25;
      mouseY += (targetY - mouseY) * 0.25;
      render(now * 0.001);
      if (!running) return;
      if (o.fps > 0) {
        timer = root.setTimeout(function () { timer = 0; frame = root.requestAnimationFrame(tick); }, 1000 / o.fps);
      } else {
        frame = root.requestAnimationFrame(tick);
      }
    }

    function start() {
      if (running || reduced || frozen) return;
      running = true;
      frame = root.requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      root.cancelAnimationFrame(frame);
      root.clearTimeout(timer);
    }

    /** Draw one exact frame. Stops the running clock: use for stills and frame-by-frame video capture. */
    function seek(seconds, pointer) {
      stop();
      frozen = true;
      if (pointer) { targetX = pointer.x; targetY = pointer.y; }
      mouseX = targetX; mouseY = targetY;
      render(seconds);
    }

    var resizeTimer = 0;
    function onResize() {
      root.clearTimeout(resizeTimer);
      resizeTimer = root.setTimeout(function () { size(); if (!running) render(lastTime); }, 150);
    }
    function onScroll() { scrollY = root.scrollY; applyTransform(); }
    function onVisibility() { if (document.hidden) stop(); else if (!frozen) start(); }

    size();
    root.addEventListener('resize', onResize);
    if (o.interactive && !frozen) root.addEventListener('pointermove', onPointer, { passive: true });
    if (o.fixed && o.parallax) root.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    if (frozen || reduced) render(lastTime);
    else start();

    return {
      canvas: canvas,
      seek: seek,
      start: function () { frozen = false; start(); },
      stop: stop,
      resize: function () { size(); render(lastTime); },
      setPointer: function (x, y) { targetX = clamp(x, 0, 1); targetY = clamp(y, 0, 1); },
      destroy: function () {
        stop();
        root.removeEventListener('resize', onResize);
        root.removeEventListener('pointermove', onPointer);
        root.removeEventListener('scroll', onScroll);
        document.removeEventListener('visibilitychange', onVisibility);
        canvas.remove();
      }
    };
  }

  function css(el, styles) { for (var k in styles) el.style[k] = styles[k]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  root.ArcaiAurora = { mount: mount, CURTAINS: CURTAINS, DEFAULTS: DEFAULTS };
})(typeof window !== 'undefined' ? window : this);
