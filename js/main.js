(function(){
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- can this visitor hover? ----------
     Decided by behaviour, not by media query. (hover:hover) and even
     (any-hover:hover) come back false on plenty of touchscreen laptops with
     a perfectly good mouse attached, and every hover rule on the page died
     with them. So: the first time a pointer that is not a touch moves, the
     page marks itself hover-capable and the hover rules switch on. A phone
     never trips it, so nothing sticks after a tap. The media query is still
     honoured when it does say yes, so desktops light up before any movement. */
  var root = document.documentElement;
  function canHover(){ return root.classList.contains('has-hover'); }
  (function armHover(){
    function arm(){ root.classList.add('has-hover'); window.removeEventListener('pointermove', onMove, true); }
    function onMove(e){ if(e.pointerType !== 'touch') arm(); }
    if(window.matchMedia('(any-hover:hover)').matches){ arm(); return; }
    if(window.PointerEvent){ window.addEventListener('pointermove', onMove, true); }
    else { window.addEventListener('mousemove', arm, {once:true}); }
  })();

  /* ---------- loader ----------
     Counts up while the fonts and page finish loading, then lifts away and
     hands off to the hero reveal. Two guarantees: it never shows for less
     than ~0.7s (no flash), and never for more than ~3.5s (no trap).      */
  var loader  = document.getElementById('loader');
  var loadNum = document.getElementById('loadNum');
  var loadBar = document.getElementById('loadBar');

  function revealHero(){ document.body.classList.add('loaded'); }

  if(!loader){
    revealHero();
  } else {
    document.documentElement.classList.add('is-loading');

    /* --- the honeycomb ignites, then flips ---
       Act 1: a dark grid of empty cells.
       Act 2: cells ignite in a wave from the centre, a few burning accent
              orange, each flashing bright as it lands.
       Act 3: at 100% a front sweeps outward and flips every cell to the
              finished cream honeycomb — which is the hero's own background,
              pre-painted once into an offscreen canvas. So when the layer
              finally fades, the grid does not move a pixel.               */
    var lhex = document.getElementById('loadHex');
    var lgeo = null, lctx = null, lw = 0, lh = 0, ldpr = 1, lmax = 1;

    function initLoaderHoney(){
      if(!lhex) return;
      lw = lhex.clientWidth; lh = lhex.clientHeight;
      if(!lw || !lh){ lgeo = null; return; }
      var c = sizeCanvas(lhex, lw, lh);
      lctx = c.x; ldpr = c.dpr;
      lgeo = honeyGeo(lw, lh);
      lmax = Math.sqrt(lw * lw + lh * lh) / 2;

      buildBuffers();
    }

    /* Two buffers are rendered once so no frame has to rebuild them:
       ldark = the finished dark grid, lacc = the grid plus every cell that has
       already landed. A frame is then one blit plus the handful of cells still
       in flight, instead of fifty gradient fills.                          */
    var ldark = null, lacc = null, laccX = null;

    function offscreen(){
      var cv = document.createElement('canvas');
      cv.width = lhex.width; cv.height = lhex.height;
      var x = cv.getContext('2d');
      x.setTransform(ldpr, 0, 0, ldpr, 0, 0);
      return { cv: cv, x: x };
    }

    /* one gradient per cell, reused every frame instead of rebuilt */
    function cellGrad(x, c, cache){
      if(cache && c._g) return c._g;
      var R = lgeo.R;
      var g = x.createLinearGradient(c.x - R, c.y - R, c.x + R, c.y + R);
      if(c.hot){ g.addColorStop(0, '#FF6A1E'); g.addColorStop(1, '#A82B00'); }
      else     { g.addColorStop(0, '#302B24'); g.addColorStop(1, '#171513'); }
      if(cache) c._g = g;
      return g;
    }

    function drawCell(x, c, a, cache){
      var e = 1 - Math.pow(1 - a, 3);                       // ease out
      var r = lgeo.R * (0.42 + 0.58 * e);                   // pops up to size
      x.save();
      x.globalAlpha = e;
      honeyPath(x, c.x, c.y, r * 0.975);
      x.fillStyle = cellGrad(x, c, cache);
      x.fill();
      /* bright on arrival, settling as it lands */
      x.strokeStyle = c.hot ? 'rgba(255,203,2,.85)'
                            : 'rgba(255,73,1,' + (0.12 + 0.55 * (1 - e)).toFixed(3) + ')';
      x.lineWidth = c.hot ? 1.6 : 1 + (1 - e) * 1.6;
      x.stroke();
      x.restore();
    }

    function darkBase(x){
      x.fillStyle = '#121212';
      x.fillRect(0, 0, lw, lh);
      x.strokeStyle = 'rgba(245,240,230,.07)';              // empty cells
      x.lineWidth = 1;
      lgeo.cells.forEach(function(c){ honeyPath(x, c.x, c.y, lgeo.R * 0.975); x.stroke(); });
    }

    function buildBuffers(){
      var d = offscreen();
      ldark = d.cv;
      darkBase(d.x);
      lgeo.cells.forEach(function(c){ drawCell(d.x, c, 1, false); });

      var acc = offscreen();
      lacc = acc.cv; laccX = acc.x;
      darkBase(laccX);
    }

    function paintBuild(p){
      if(!lgeo || !lacc) return;
      var x = lctx, cells = lgeo.cells, live = [], i, c, a;
      for(i = 0; i < cells.length; i++){
        c = cells[i];
        a = (p - c.t) / 0.18;
        if(a <= 0) continue;
        if(a >= 1){                                         // landed — bake it once
          if(!c.done){ drawCell(laccX, c, 1, false); c.done = true; }
          continue;
        }
        live.push(c);
      }
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.drawImage(lacc, 0, 0);
      x.setTransform(ldpr, 0, 0, ldpr, 0, 0);
      for(i = 0; i < live.length; i++){
        c = live[i];
        drawCell(x, c, (p - c.t) / 0.18, true);
      }
    }

    /* The front only ever moves outward, so each frame paints just the cells it
       crossed since the last one. Nothing is cleared: the glow on cells ahead
       of the front builds up frame by frame, and the cream wipe erases it when
       the front arrives. One blit clipped to a few cells, and that is all.  */
    /* The exit. No cream stage any more: the dark cells peel off the hero
       itself. A front runs out from the centre; each cell it reaches shrinks
       toward its own middle, turns a little and fades, and the hero — the
       film, the name, the photo — is already there underneath. Cells just
       ahead of the front glow yellow, the same charge they landed with. */
    function paintPeel(f){
      if(!lgeo) return;
      var x = lctx, R = lgeo.R, cells = lgeo.cells, i, c;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, lhex.width, lhex.height);
      if(f >= 1) return;
      x.setTransform(ldpr, 0, 0, ldpr, 0, 0);

      var edge = f * lmax * 1.22, band = R * 1.35;
      for(i = 0; i < cells.length; i++){
        c = cells[i];
        var a = (edge - c.raw) / band;                        // <0 untouched, 0..1 peeling, >1 gone
        if(a >= 1) continue;
        if(a <= 0){
          /* intact: drawn a hair over size so no seam shows the hero early */
          honeyPath(x, c.x, c.y, R * 1.012);
          x.fillStyle = cellGrad(x, c, true); x.fill();
          var g = 1 + a * (band / R) * 0.9;                   // a is negative here: 1 at the front, 0 a cell away
          if(g > 0){
            x.strokeStyle = 'rgba(255,203,2,' + (g * 0.35).toFixed(3) + ')';
            x.lineWidth = 1 + g * 2.2; x.stroke();
          }
          continue;
        }
        /* peeling: ease-in so it hangs a moment, then goes fast */
        var e = a * a * (3 - 2 * a);
        x.save();
        x.translate(c.x, c.y);
        x.rotate(e * 0.42);
        x.scale(1 - e, 1 - e);
        x.globalAlpha = 1 - e * e;
        honeyPath(x, 0, 0, R * 1.012);
        x.fillStyle = cellGrad(x, c, true); x.fill();
        x.strokeStyle = 'rgba(255,203,2,' + (0.7 * (1 - e)).toFixed(3) + ')';
        x.lineWidth = 1.6; x.stroke();
        x.restore();
      }
    }

    /* Cut the mark into vertical slices. --p picks which strip of the logo a
       slice shows, --i is its stagger step counted from the middle outward. */
    loader.querySelectorAll('[data-slices]').forEach(function(el){
      var n = Math.max(2, parseInt(el.getAttribute('data-slices'), 10) || 12);
      var mid = (n - 1) / 2;
      el.style.setProperty('--n', n);
      el.textContent = '';
      for(var k = 0; k < n; k++){
        var slice = document.createElement('i');
        slice.style.setProperty('--k', k);
        slice.style.setProperty('--i', Math.abs(k - mid).toFixed(2));
        el.appendChild(slice);
      }
    });

    initLoaderHoney();
    paintBuild(0);                      // the dark grid is ready under the veil
    var lrz;
    window.addEventListener('resize', function(){
      clearTimeout(lrz);
      lrz = setTimeout(function(){
        if(!document.getElementById('loader')) return;
        initLoaderHoney();
        if(!ended) paintBuild(pct / 100);
      }, 150);
    });

    var startedAt = Date.now(), pct = 0, ready = false, ended = false;
    function markReady(){ ready = true; }

    if(document.fonts && document.fonts.ready){ document.fonts.ready.then(markReady); }
    else { markReady(); }
    window.addEventListener('load', markReady);
    setTimeout(markReady, 3500);

    function handOff(){
      loader.classList.add('is-done');
      document.documentElement.classList.remove('is-loading');
      setTimeout(function(){ loader.remove(); }, 500);
    }

    function endLoader(){
      if(ended) return;
      ended = true;
      loadNum.textContent = '100';
      loadBar.style.transform = 'scaleX(1)';

      if(reduce || !lgeo){ revealHero(); paintPeel(1); handOff(); return; }

      setTimeout(function(){                                 // a beat on the full dark grid
        loader.classList.add('is-flipping');                 // text clears out, backdrop goes clear
        var t0 = null, DUR = 1050, shown = false;
        requestAnimationFrame(function peel(now){
          if(t0 === null) t0 = now;
          var f = Math.min(1, (now - t0) / DUR);
          var e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;   // ease in-out cubic
          paintPeel(e);
          /* the hero starts its own entrance as the first cells open, so the
             name and photo rise through the gaps rather than after them */
          if(!shown && e > 0.12){ shown = true; revealHero(); }
          if(f < 1){ requestAnimationFrame(peel); return; }
          if(!shown) revealHero();
          handOff();
        });
      }, 170);
    }

    /* Act 0 -> Act 1. A beat on pure black, then the veil lifts and, in the
       same moment, everything underneath starts: the bloom, the grid's
       push-in, the counter and the cell ignition. The mark follows a step
       behind so it rises out of the black rather than sitting there when
       the lights come on. */
    function ignite(){
      startedAt = Date.now();             // minimum display counts from when the loader is seen
      loader.classList.add('is-lit');
      setTimeout(function(){ loader.classList.add('is-in'); }, reduce ? 0 : 220);

      if(reduce){
        loadNum.textContent = '100';
        loadBar.style.transform = 'scaleX(1)';
        setTimeout(endLoader, 250);
        return;
      }
      /* the count waits until the veil is about half lifted. The ramp is
         fastest at the start, so starting it with the veil would have the
         digits at 60 before anyone could read them. */
      var lastFrame = null, shown = -1;
      setTimeout(function(){ requestAnimationFrame(count); }, 330);
      function count(now){
        if(lastFrame === null) lastFrame = now;
        var dt = Math.min(0.05, (now - lastFrame) / 1000);   // clamp a dropped frame
        lastFrame = now;

        var ceiling = ready ? 100 : 92;                      // hold below 100 until it really is
        /* time-based, so the pace is the same on a 60Hz and a 120Hz screen */
        pct += (ceiling - pct) * (1 - Math.exp(-2 * dt)) + 6 * dt;
        if(pct > ceiling) pct = ceiling;

        var n = Math.floor(pct);
        if(n !== shown){ loadNum.textContent = n; shown = n; }   // only touch the DOM on a change
        loadBar.style.transform = 'scaleX(' + (pct / 100).toFixed(4) + ')';
        paintBuild(pct / 100);

        if(ready && pct > 99 && Date.now() - startedAt > 850){ endLoader(); return; }
        requestAnimationFrame(count);
      }
    }
    setTimeout(ignite, reduce ? 0 : 420);
  }

  /* ---------- portraits: pointer tilt ----------
     Pointer-fine devices only. A section is the listening surface and the
     card's rectangle comes from a small function per portrait, so no
     hit-testing on pseudo-elements is needed. Everything eases with a
     time-based lerp: quick to follow the pointer, slower to settle home, so
     the return reads as the card coming to rest rather than snapping. */
  function attachTilt(ph, surface, cardRect, whenReady){
    var armed = false, hovering = false, raf = null, last = null;
    var t = {x:0,y:0,rx:0,ry:0,s:0,gx:50,gy:50,g:0};     // targets
    var c = {x:0,y:0,rx:0,ry:0,s:0,gx:50,gy:50,g:0};     // current

    function onMove(e){
      if(!armed) return;
      var k = cardRect(), pad = 26;
      var inside = e.clientX >= k.l - pad && e.clientX <= k.l + k.w + pad &&
                   e.clientY >= k.t - pad && e.clientY <= k.t + k.h + pad;
      if(inside){
        var nx = Math.max(-1, Math.min(1, ((e.clientX - k.l) / k.w) * 2 - 1));
        var ny = Math.max(-1, Math.min(1, ((e.clientY - k.t) / k.h) * 2 - 1));
        t.x = nx * 12;  t.y = ny * 10;                    // magnetic pull, px
        t.ry = nx * 7;  t.rx = -ny * 5.5;                 // tilt toward the pointer, deg
        t.s = 1;                                          // lift
        t.gx = (nx + 1) * 50;  t.gy = (ny + 1) * 50;  t.g = 1;
        hovering = true;
      } else if(hovering){ leave(); }
      start();
    }
    function leave(){
      hovering = false;
      t.x = t.y = t.rx = t.ry = t.s = t.g = 0;
    }
    function start(){ if(raf === null){ last = null; raf = requestAnimationFrame(step); } }
    function step(now){
      if(last === null) last = now;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      var a = 1 - Math.exp(-(hovering ? 11 : 5) * dt);   // follow fast, come home slow
      for(var key in c) c[key] += (t[key] - c[key]) * a;

      ph.style.transform =
        'perspective(1000px) translate3d(' + c.x.toFixed(2) + 'px,' + c.y.toFixed(2) + 'px,0) ' +
        'rotateX(' + c.rx.toFixed(2) + 'deg) rotateY(' + c.ry.toFixed(2) + 'deg) ' +
        'scale(' + (1 + c.s * 0.035).toFixed(4) + ')';
      ph.style.setProperty('--sx', (-c.x * 0.55).toFixed(2) + 'px');
      ph.style.setProperty('--sy', (-c.y * 0.55).toFixed(2) + 'px');
      ph.style.setProperty('--gx', c.gx.toFixed(1) + '%');
      ph.style.setProperty('--gy', c.gy.toFixed(1) + '%');
      ph.style.setProperty('--glare', 'rgba(255,255,255,' + (c.g * 0.2).toFixed(3) + ')');

      var moving = Math.abs(c.x) + Math.abs(c.y) + Math.abs(c.rx) + Math.abs(c.ry) + Math.abs(c.s) + Math.abs(c.g);
      if(!hovering && moving < 0.02){                    // home — hand the element back to the CSS
        ph.style.transform = '';
        ['--sx','--sy','--gx','--gy','--glare'].forEach(function(p){ ph.style.removeProperty(p); });
        raf = null; return;
      }
      raf = requestAnimationFrame(step);
    }
    /* Mouse: follows the pointer whenever it is over the card. Touch and pen:
       only while pressed — touch the card and it tilts toward the finger,
       drag and it follows, lift and it settles home. A vertical swipe is
       left to the browser (touch-action: pan-y), which cancels the pointer
       and releases the card. */
    var pressed = false;
    function onPointer(e){
      if(e.pointerType !== 'mouse' && !pressed) return;
      onMove(e);
    }
    function release(e){
      if(e && e.pointerType === 'mouse') return;
      pressed = false;
      if(hovering){ leave(); start(); }
    }
    surface.addEventListener('pointermove', onPointer);
    surface.addEventListener('pointerdown', function(e){
      if(e.pointerType === 'mouse') return;
      pressed = true; onMove(e);
    });
    surface.addEventListener('pointerleave', function(e){ if(e.pointerType === 'mouse' && hovering){ leave(); start(); } });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    /* engage only once the entrance has landed, so the two never fight */
    whenReady(function(){ armed = true; ph.classList.add('is-live'); });
  }

  if(!reduce && 'PointerEvent' in window){
    var heroPh = document.querySelector('.hero__photo'), heroSec = document.querySelector('.hero');
    if(heroPh && heroSec){
      attachTilt(heroPh, heroSec,
        function(){ var r = heroPh.getBoundingClientRect();
                    if(r.height > 1) return { l:r.left, t:r.top, w:r.width, h:r.height };   // stacked layout: real box
                    var h = r.width * 37 / 27;                                             // wide layout: 0px host, centred on the card
                    return { l:r.left, t:r.top - h / 2, w:r.width, h:h }; },
        function(cb){ (function w(){ if(!document.body.classList.contains('loaded')){ setTimeout(w, 120); return; } setTimeout(cb, 1400); })(); });
    }
    var deckPh = document.getElementById('stackTilt'), deckSec = deckPh && deckPh.closest('section');
    if(deckPh && deckSec){
      attachTilt(deckPh, deckSec,
        function(){ var r = deckPh.getBoundingClientRect(); return { l:r.left, t:r.top, w:r.width, h:r.height }; },
        function(cb){ var host = document.getElementById('stackPreview');
                      (function w(){ if(!host.classList.contains('in')){ setTimeout(w, 150); return; } setTimeout(cb, 1300); })(); });
    }
    var aboutPh = document.querySelector('.about__portrait'), aboutSec = aboutPh && aboutPh.closest('section');
    if(aboutPh && aboutSec){
      attachTilt(aboutPh, aboutSec,
        function(){ var r = aboutPh.getBoundingClientRect(); return { l:r.left, t:r.top, w:r.width, h:r.height }; },
        function(cb){ (function w(){ if(!aboutPh.classList.contains('in')){ setTimeout(w, 150); return; } setTimeout(cb, 1200); })(); });
    }

    /* the same pointer tilt on every skill card's visual frame */
    var stackSurf = document.getElementById('stack');
    if(stackSurf){
      Array.prototype.forEach.call(stackSurf.querySelectorAll('.stack__frame'), function(fr){
        attachTilt(fr, stackSurf,
          function(){ var r = fr.getBoundingClientRect(); return { l:r.left, t:r.top, w:r.width, h:r.height }; },
          function(cb){ (function w(){ if(!document.body.classList.contains('loaded')){ setTimeout(w, 120); return; } setTimeout(cb, 800); })(); });
      });
    }
  }

  /* ---------- skills deck ----------
     Three full-width cards, each carrying its own text and visual. p = how far
     the NEXT card has slid over the one before it (0..1), which pushes that row
     back and dims it — the cards stack up from the bottom as you scroll. */
  (function deck(){
    var stack = document.getElementById('stack'); if(!stack) return;
    var cards = Array.prototype.slice.call(stack.querySelectorAll('.scard'));
    if(!cards.length) return;

    /* card reels (Graphic Design, Video Editing) stay unloaded until their
       card is close to the screen, play while it is there, and pause once it
       has left — nothing downloads or runs on first load */
    (function cardReels(){
      var vids = Array.prototype.slice.call(stack.querySelectorAll('.viz__vid'));
      if(!vids.length || reduce) return;
      function play(v){ var pr = v.play(); if(pr && pr.catch){ pr.catch(function(){}); } }
      if(!('IntersectionObserver' in window)){ vids.forEach(play); return; }
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          var v = en.target;
          if(en.isIntersecting && !document.hidden) play(v); else v.pause();
        });
      }, {rootMargin:'250px 0px'});
      vids.forEach(function(v){ io.observe(v); });
      document.addEventListener('visibilitychange', function(){
        if(document.hidden) vids.forEach(function(v){ v.pause(); });
      });
    })();

    /* the playhead travels in px (transform), so tell it how wide the timeline is */
    function sizeTimelines(){
      Array.prototype.forEach.call(document.querySelectorAll('.viz__tl'), function(t){
        t.style.setProperty('--tlw', t.clientWidth + 'px');
      });
    }
    sizeTimelines(); window.addEventListener('resize', sizeTimelines);

    var ticking = false;
    function update(){
      ticking = false;
      var cs = getComputedStyle(stack);
      var top  = parseFloat(cs.getPropertyValue('--stack-top')) || 88;
      var peek = parseFloat(cs.getPropertyValue('--peek')) || 16;
      var vh = window.innerHeight;
      for(var i = 1; i < cards.length; i++){
        var r = cards[i].getBoundingClientRect();
        var pinAt = top + i * peek;
        /* progress of card i covering card i-1: from entering the viewport bottom to pinning */
        var travel = Math.max(1, vh - pinAt);
        var p = 1 - (r.top - pinAt) / travel;
        p = Math.max(0, Math.min(1, (p - 0.35) / 0.65));   // nothing happens until the next card is a third of the way up
        cards[i - 1].style.setProperty('--p', reduce ? 0 : p.toFixed(3));
      }
      cards[cards.length - 1].style.setProperty('--p', 0);
    }
    function onScroll(){ if(!ticking){ ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, {passive:true});
    window.addEventListener('resize', onScroll);
    update();
  })();

  /* ---------- toolkit honeycombs: placement ----------
     Each hive is a grid of half-width columns. For n cells per row there are
     2n+1 columns; a cell spans two, and odd rows start one column in. The
     count per row follows the width: 4 wide, 3 on tablets, 2 on phones. */
  function layoutHives(){
    var per = window.innerWidth <= 560 ? 2 : window.innerWidth <= 860 ? 3 : 4;
    Array.prototype.forEach.call(document.querySelectorAll('.hive'), function(h){
      var tiles = h.querySelectorAll('.tool'), core = 0;
      Array.prototype.forEach.call(tiles, function(t){ if(!t.hasAttribute('data-ai')) core++; });
      /* the AI tiles always start a row of their own, however many craft
         tiles came before — the split is the point of the layout */
      var aiRow0 = Math.ceil(core / per), ai = tiles.length - core;
      var rows = aiRow0 + Math.ceil(ai / per);
      h.style.setProperty('--cols', per * 2 + 1);
      h.style.setProperty('--rows', rows);
      Array.prototype.forEach.call(tiles, function(t, i){
        var k = i < core ? i : i - core;
        var row = (i < core ? 0 : aiRow0) + Math.floor(k / per);
        var col = (k % per) * 2 + 1 + (row % 2);
        t.style.gridColumn = col + ' / span 2';
        t.style.setProperty('--row', row);
      });
    });
  }
  layoutHives();
  /* the cells tilt toward the pointer (mouse and pen only) and spring back
     when it leaves; the mark and text parallax through --px/--py */
  (function hiveTilt(){
    if(reduce || !window.PointerEvent) return;
    Array.prototype.forEach.call(document.querySelectorAll('.tool'), function(t){
      var tx = 0, ty = 0, cx = 0, cy = 0, cs = 1, raf = 0, on = false, last = 0;
      function frame(now){
        var dt = Math.min(48, now - (last || now)); last = now;
        var k = 1 - Math.pow(0.001, dt / (on ? 140 : 520));
        cx += (tx - cx) * k; cy += (ty - cy) * k; cs += ((on ? 1.07 : 1) - cs) * k;
        t.style.setProperty('--px', cx.toFixed(3)); t.style.setProperty('--py', cy.toFixed(3));
        t.style.setProperty('--ry', (cx * 9).toFixed(2) + 'deg');
        t.style.setProperty('--rx', (cy * -8).toFixed(2) + 'deg');
        t.style.setProperty('--s', cs.toFixed(4));
        if(on || Math.abs(tx - cx) > .002 || Math.abs(ty - cy) > .002 || Math.abs(cs - 1) > .002){ raf = requestAnimationFrame(frame); }
        else { raf = 0; last = 0; t.classList.remove('is-tilting'); ['--px','--py','--rx','--ry','--s'].forEach(function(v){ t.style.removeProperty(v); }); }
      }
      function aim(e){
        var r = t.getBoundingClientRect();
        tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - .5) * 2));
        ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - .5) * 2));
      }
      t.addEventListener('pointerenter', function(e){
        if(e.pointerType === 'touch') return;
        on = true; t.classList.add('is-tilting'); aim(e);
        if(!raf) raf = requestAnimationFrame(frame);
      });
      t.addEventListener('pointermove', function(e){ if(on) aim(e); });
      function off(){ on = false; tx = 0; ty = 0; if(!raf) raf = requestAnimationFrame(frame); }
      t.addEventListener('pointerleave', off);
      t.addEventListener('pointercancel', off);
    });
  })();
  var hvT;

  window.addEventListener('resize', function(){ clearTimeout(hvT); hvT = setTimeout(layoutHives, 120); });

  /* ---------- process rail ----------
     Each step fills its own slice of the rail as a line ~60% down the
     viewport moves through it; the node lights once the fill is past it.
     Cheap: one rAF per scroll, six rows, custom properties only. */
  (function processRail(){
    var steps = document.querySelectorAll('.pstep');
    if(!steps.length) return;
    var ticking = false;
    function paint(){
      ticking = false;
      var anchor = window.innerHeight * 0.6;
      Array.prototype.forEach.call(steps, function(s){
        var r = s.getBoundingClientRect(), n = s.querySelector('.pstep__node').getBoundingClientRect();
        var nodeP = (n.top + n.height / 2 - r.top) / r.height;
        var p = (anchor - r.top) / r.height;
        p = p < 0 ? 0 : p > 1 ? 1 : p;
        s.style.setProperty('--fill', p.toFixed(3));
        s.style.setProperty('--node', nodeP.toFixed(3));
        s.classList.toggle('is-filling', p > 0 && p < 1);
        s.classList.toggle('is-lit', p >= nodeP);
      });
    }
    function onScroll(){ if(!ticking){ ticking = true; requestAnimationFrame(paint); } }
    window.addEventListener('scroll', onScroll, { passive:true });
    window.addEventListener('resize', onScroll);
    if(reduce){ Array.prototype.forEach.call(steps, function(s){ s.style.setProperty('--fill', 1); s.classList.add('is-lit'); }); return; }
    paint();
  })();

  /* ---------- work stage ----------
     Three projects, one visible at a time. Each holds for a few seconds, then
     leaves to the left as the next arrives from the right. It stops while the
     pointer is on it, while the section is off screen, and for anyone who has
     asked for less motion. */
  (function workStage(){
    var stage = document.getElementById('wkStage'); if(!stage) return;
    var slides = stage.querySelectorAll('.slide'),
        metas  = stage.querySelectorAll('.smeta'),
        rails  = stage.querySelectorAll('.srail');
    var n = slides.length, at = 0, timer = 0, held = false, onScreen = false;
    var HOLD = 4000;                                   /* 3s still, ~1s moving */
    stage.style.setProperty('--hold', HOLD + 'ms');

    function go(next, manual){
      if(next === at) return;
      var prev = at; at = (next + n) % n;
      slides[prev].classList.remove('is-on');
      slides[prev].classList.add('is-out');
      setTimeout(function(){ slides[prev].classList.remove('is-out'); }, 980);
      slides[at].classList.add('is-on');
      metas[prev].classList.remove('is-on');
      metas[at].classList.add('is-on');
      rails.forEach(function(r, i){
        r.classList.toggle('is-on', i === at);
        r.classList.toggle('is-done', i < at);
        r.setAttribute('aria-selected', i === at ? 'true' : 'false');
      });
      if(manual) restart();
    }
    function tick(){ go(at + 1); }
    function restart(){ clearInterval(timer); if(!reduce && onScreen && !held) timer = setInterval(tick, HOLD); }
    function stop(){ clearInterval(timer); timer = 0; }

    rails.forEach(function(r){
      r.addEventListener('click', function(){ go(+r.getAttribute('data-i'), true); });
    });
    stage.addEventListener('pointerenter', function(e){ if(e.pointerType === 'touch') return; held = true; stage.classList.add('is-held'); stop(); });
    stage.addEventListener('pointerleave', function(){ held = false; stage.classList.remove('is-held'); restart(); });
    stage.addEventListener('keydown', function(e){
      if(e.key === 'ArrowRight'){ go(at + 1, true); } else if(e.key === 'ArrowLeft'){ go(at - 1, true); }
    });
    /* on a phone there is no hover to pause on, so a swipe moves it instead */
    var sx = 0, sy = 0, swiping = false;
    stage.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; swiping = true; stop();
    }, {passive:true});
    stage.addEventListener('touchend', function(e){
      if(!swiping) return; swiping = false;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if(Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4){ go(at + (dx < 0 ? 1 : -1), true); }
      else { restart(); }
    }, {passive:true});
    if('IntersectionObserver' in window){
      new IntersectionObserver(function(en){
        onScreen = en[0].isIntersecting;
        onScreen ? restart() : stop();
      }, {threshold:0.3}).observe(stage);
    } else { onScreen = true; restart(); }
    document.addEventListener('visibilitychange', function(){ document.hidden ? stop() : restart(); });
  })();

  /* ---------- reviews ----------
     A track of cards that steps one card left every hold. The whole set is
     cloned once and appended, so when the run reaches the end the track can
     snap back to the start with the transition switched off — the join is
     invisible because card N looks exactly like card 0. Step size is measured
     from the DOM rather than assumed, so the card width can stay in CSS. */
  (function reviewCards(){
    var stage = document.getElementById('revStage'), track = document.getElementById('revTrack');
    if(!stage || !track) return;
    var cards = track.querySelectorAll('.rcd');
    var N = cards.length; if(!N) return;
    var ticks = stage.querySelectorAll('.rtick');
    var at = 0, timer = 0, held = false, onScreen = false, step = 0, jump = 0;
    var HOLD = 4000, SLIDE = 800;
    stage.style.setProperty('--hold', HOLD + 'ms');
    stage.classList.add('is-paused');   /* nothing counts down until it is on screen */

    /* the second run, for the seamless join */
    var i, c;
    for(i = 0; i < N; i++) cards[i].style.setProperty('--k', i);
    for(i = 0; i < N; i++){
      c = cards[i].cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.setAttribute('data-clone', '');
      track.appendChild(c);
    }
    for(i = 0; i < ticks.length; i++){
      ticks[i].setAttribute('data-i', i);
      ticks[i].setAttribute('aria-label', 'Review ' + (i + 1));
    }

    function measure(){
      var k = track.children;
      if(k.length > 1){
        step = k[1].getBoundingClientRect().left - k[0].getBoundingClientRect().left;
      } else {
        step = k[0] ? k[0].getBoundingClientRect().width : 0;
      }
    }
    function place(animate){
      track.style.transition = animate ? 'transform ' + SLIDE + 'ms cubic-bezier(.65,0,.2,1)' : 'none';
      track.style.transform = 'translateX(' + (-at * step) + 'px)';
    }
    function syncTicks(){
      var live = ((at % N) + N) % N;
      for(var k = 0; k < ticks.length; k++) ticks[k].classList.toggle('is-on', k === live);
    }
    measure(); place(false); syncTicks();

    var rt;
    window.addEventListener('resize', function(){
      clearTimeout(rt);
      rt = setTimeout(function(){ measure(); place(false); }, 140);
    });
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ measure(); place(false); }).catch(function(){});
    window.addEventListener('load', function(){ measure(); place(false); });

    /* replay the live tick from empty — a class alone will not restart an
       animation already running on that element */
    function armTick(){
      var live = ((at % N) + N) % N;
      var f = ticks[live] && ticks[live].querySelector('i');
      if(!f || reduce) return;
      f.style.animation = 'none';
      void f.offsetWidth;
      f.style.animation = '';
    }

    function go(next, manual){
      clearTimeout(jump);
      /* stepping back off the start: hop to the cloned run first, unseen */
      if(next < 0){ at = next + N; place(false); void track.offsetWidth; next = at - 1; }
      at = next;
      place(true);
      syncTicks();
      /* landing on the clone of card 0: let it finish, then snap home */
      if(at >= N){
        jump = setTimeout(function(){ at = at - N; place(false); }, SLIDE + 20);
      }
      if(manual) restart(); else armTick();
    }
    function tick(){ go(at + 1); }
    function restart(){
      clearInterval(timer);
      if(!reduce && onScreen && !held){
        stage.classList.add('is-live');
        stage.classList.remove('is-paused');
        armTick();
        timer = setInterval(tick, HOLD);
      } else {
        stage.classList.add('is-paused');
      }
    }
    function stop(){ clearInterval(timer); timer = 0; stage.classList.add('is-paused'); }

    Array.prototype.forEach.call(ticks, function(t){
      t.addEventListener('click', function(){ go(+t.getAttribute('data-i'), true); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.rqbtn'), function(btn){
      btn.addEventListener('click', function(){ go(at + (+btn.getAttribute('data-go')), true); });
    });
    stage.addEventListener('pointerenter', function(e){ if(e.pointerType === 'touch') return; held = true; stop(); });
    stage.addEventListener('pointerleave', function(){ held = false; restart(); });
    stage.addEventListener('keydown', function(e){
      if(e.key === 'ArrowRight'){ go(at + 1, true); } else if(e.key === 'ArrowLeft'){ go(at - 1, true); }
    });
    /* a phone has no hover to pause on, so a swipe moves it instead */
    var sx = 0, sy = 0, swiping = false;
    stage.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; swiping = true; stop();
    }, {passive:true});
    stage.addEventListener('touchend', function(e){
      if(!swiping) return; swiping = false;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if(Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4){ go(at + (dx < 0 ? 1 : -1), true); }
      else { restart(); }
    }, {passive:true});

    if('IntersectionObserver' in window){
      new IntersectionObserver(function(en){
        onScreen = en[0].isIntersecting;
        onScreen ? restart() : stop();
      }, {threshold:0.25}).observe(stage);
    } else { onScreen = true; restart(); }
    document.addEventListener('visibilitychange', function(){ document.hidden ? stop() : restart(); });
  })();

  /* ---------- all work: the gallery page ----------
     The tiles come from the archive pool the trail already carries, plus the
     project slots at the top, so nothing is loaded twice. Filtering hides
     tiles and re-runs the stagger; the browser's back button closes the page. */
  (function workDoc(){
    var doc = document.getElementById('workDoc'), openBtn = document.querySelector('.work__all');
    var grid = document.getElementById('wGrid');
    if(!doc || !openBtn || !grid || !window.TRAIL_POOL) return;
    var scroll = document.getElementById('workScroll'), back = document.getElementById('workBack');
    var filt = document.getElementById('wFilt');
    var light = document.getElementById('wLight'), lImg = document.getElementById('wLightImg');
    var lT = document.getElementById('wLightT'), lD = document.getElementById('wLightD');

    /* the five project slots first — they carry the case studies */
    var projects = [
      { cat:'ux', cap:'Braxtone · App redesign', ghost:'Braxtone screens', art:'work__art--a' },
      { cat:'ux', cap:'LuxuryNest · E-commerce app', ghost:'LuxuryNest screens', art:'work__art--b' },
      { cat:'ux', cap:'Clients · Website redesigns', ghost:'Before / after', art:'work__art--c' }
    ];
    var items = projects.concat(window.TRAIL_POOL.map(function(p){
      return { cat: /reel/i.test(p.cap || '') ? 'mo' : 'gfx', cap: p.cap || '', src: p.src };
    }));

    var html = '';
    items.forEach(function(it, i){
      var face = it.src
        ? '<img src="' + it.src + '" alt="' + (it.cap || '') + '" loading="lazy" decoding="async">'
        : '<span class="wtile__ph work__art ' + it.art + '">' + (it.ghost || '') + '</span>';
      html += '<figure class="wtile" data-cat="' + it.cat + '" style="--k:' + (i % 14) + '">'
            +   '<button class="wtile__open" type="button" data-i="' + i + '" aria-label="' + (it.cap || 'View') + '">'
            +     face + '<figcaption class="wtile__cap">' + (it.cap || '') + '</figcaption>'
            +   '</button>'
            + '</figure>';
    });
    grid.innerHTML = html;
    var tiles = grid.querySelectorAll('.wtile');
    var shots = grid.querySelectorAll('.wtile__open');
    document.getElementById('wCount').textContent = items.length;

    /* the count beside each filter */
    Array.prototype.forEach.call(filt.querySelectorAll('button'), function(b){
      var c = b.getAttribute('data-cat');
      var n = c === 'all' ? items.length : items.filter(function(it){ return it.cat === c; }).length;
      b.querySelector('b').textContent = n;
    });

    var at = 0, shown = [], open = false, lightOn = false, pushed = false;
    function stagger(){
      Array.prototype.forEach.call(tiles, function(t){ t.classList.remove('is-in'); });
      var k = 0;
      Array.prototype.forEach.call(tiles, function(t){ if(!t.hidden){ t.style.setProperty('--k', k % 14); k++; } });
      requestAnimationFrame(function(){ requestAnimationFrame(function(){
        Array.prototype.forEach.call(tiles, function(t){ if(!t.hidden) t.classList.add('is-in'); });
      }); });
    }
    function apply(cat){
      shown = [];
      Array.prototype.forEach.call(tiles, function(t, i){
        var on = cat === 'all' || t.getAttribute('data-cat') === cat;
        t.hidden = !on; if(on) shown.push(i);
      });
      stagger();
    }
    filt.addEventListener('click', function(e){
      var b = e.target.closest('button'); if(!b) return;
      Array.prototype.forEach.call(filt.querySelectorAll('button'), function(x){
        var on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      apply(b.getAttribute('data-cat'));
      scroll.scrollTop = Math.min(scroll.scrollTop, grid.offsetTop - 90);
    });

    function lock(on){ document.body.classList.toggle('is-locked', on); }
    function show(){
      if(open) return; open = true;
      doc.hidden = false; lock(true);
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ doc.classList.add('is-open'); }); });
      scroll.scrollTop = 0; apply('all');
      setTimeout(function(){ back.focus(); }, 120);
      try{ history.pushState({work:1}, '', '#all-work'); pushed = true; }catch(e){ pushed = false; }
    }
    function hide(fromPop){
      if(!open) return;
      if(lightOn) closeLight();
      open = false; doc.classList.remove('is-open');
      setTimeout(function(){ if(!open){ doc.hidden = true; lock(false); } }, 420);
      openBtn.focus();
      if(pushed && !fromPop){ try{ history.back(); }catch(e){} }
      pushed = false;
    }
    function paint(i){
      var it = items[i]; if(!it || !it.src) return;
      at = i;
      lImg.src = it.src; lImg.alt = it.cap || '';
      var bits = (it.cap || '').split('·');
      lT.textContent = (bits[1] || bits[0] || '').trim();
      lD.textContent = (bits[0] || '').trim();
    }
    function openLight(i){
      if(!items[i] || !items[i].src) return;
      paint(i); light.hidden = false; lightOn = true;
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ light.classList.add('is-open'); }); });
      document.getElementById('wLightX').focus();
    }
    function closeLight(){
      lightOn = false; light.classList.remove('is-open');
      setTimeout(function(){ if(!lightOn) light.hidden = true; }, 360);
      if(shots[at]) shots[at].focus();
    }
    function step(d){
      if(!shown.length) return;
      var pos = shown.indexOf(at); if(pos < 0) pos = 0;
      for(var n = 1; n <= shown.length; n++){
        var j = shown[(pos + d * n + shown.length * 9) % shown.length];
        if(items[j] && items[j].src){ paint(j); return; }
      }
    }

    openBtn.addEventListener('click', function(e){ e.preventDefault(); show(); });
    back.addEventListener('click', function(){ hide(); });
    Array.prototype.forEach.call(shots, function(b){
      b.addEventListener('click', function(){ openLight(+b.getAttribute('data-i')); });
    });
    document.getElementById('wLightX').addEventListener('click', closeLight);
    document.getElementById('wLightP').addEventListener('click', function(){ step(-1); });
    document.getElementById('wLightN').addEventListener('click', function(){ step(1); });
    light.addEventListener('click', function(e){ if(e.target === light) closeLight(); });
    document.addEventListener('keydown', function(e){
      if(!open) return;
      if(e.key === 'Escape'){ lightOn ? closeLight() : hide(); }
      else if(lightOn && e.key === 'ArrowLeft'){ step(-1); }
      else if(lightOn && e.key === 'ArrowRight'){ step(1); }
    });
    window.addEventListener('popstate', function(){ if(open) hide(true); });
    if(location.hash === '#all-work'){ setTimeout(show, 900); }
  })();

  /* ---------- certificates: a page inside the page ----------
     The button opens a full-screen takeover with its own history entry, so
     the browser's back button closes it. Escape steps back one level at a
     time: out of a certificate first, then out of the page. */
  (function certDoc(){
    var doc = document.getElementById('certDoc'), openBtn = document.getElementById('certOpen');
    if(!doc || !openBtn || !window.CERTS) return;
    var scroll = document.getElementById('certScroll'), back = document.getElementById('certBack');
    var light = document.getElementById('cLight'), lImg = document.getElementById('cLightImg');
    var lT = document.getElementById('cLightT'), lD = document.getElementById('cLightD'), lGo = document.getElementById('cLightGo');
    var shots = doc.querySelectorAll('.ccard__open');
    var open = false, lightOn = false, at = 0, pushed = false;

    function lock(on){ document.body.classList.toggle('is-locked', on); }
    function show(){
      if(open) return; open = true;
      doc.hidden = false; lock(true);
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ doc.classList.add('is-open'); }); });
      scroll.scrollTop = 0;
      setTimeout(function(){ back.focus(); }, 120);
      try{ history.pushState({cert:1}, '', '#certificates'); pushed = true; }catch(e){ pushed = false; }
    }
    function hide(fromPop){
      if(!open) return;
      if(lightOn) closeLight();
      open = false; doc.classList.remove('is-open');
      setTimeout(function(){ if(!open){ doc.hidden = true; lock(false); } }, 420);
      openBtn.focus();
      if(pushed && !fromPop){ try{ history.back(); }catch(e){} }
      pushed = false;
    }
    function paint(i){
      var c = window.CERTS[i]; if(!c) return;
      at = i;
      lImg.src = shots[i].querySelector('img').src;
      lImg.alt = 'Google course certificate for ' + c.t;
      lT.textContent = c.t; lD.textContent = c.d + ' · ID ' + c.c;
      lGo.href = 'https://www.coursera.org/account/accomplishments/'
        + (c.pro ? 'professional-cert/' : 'verify/') + c.c;
    }
    function openLight(i){
      paint(i); light.hidden = false; lightOn = true;
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ light.classList.add('is-open'); }); });
      document.getElementById('cLightX').focus();
    }
    function closeLight(){
      lightOn = false; light.classList.remove('is-open');
      setTimeout(function(){ if(!lightOn) light.hidden = true; }, 360);
      if(shots[at]) shots[at].focus();
    }
    function step(d){ paint((at + d + window.CERTS.length) % window.CERTS.length); }

    openBtn.addEventListener('click', function(e){ e.preventDefault(); show(); });
    back.addEventListener('click', function(){ hide(); });
    Array.prototype.forEach.call(shots, function(b){
      b.addEventListener('click', function(){ openLight(+b.getAttribute('data-i')); });
    });
    document.getElementById('cLightX').addEventListener('click', closeLight);
    document.getElementById('cLightP').addEventListener('click', function(){ step(-1); });
    document.getElementById('cLightN').addEventListener('click', function(){ step(1); });
    light.addEventListener('click', function(e){ if(e.target === light) closeLight(); });
    document.addEventListener('keydown', function(e){
      if(!open) return;
      if(e.key === 'Escape'){ lightOn ? closeLight() : hide(); }
      else if(lightOn && e.key === 'ArrowLeft'){ step(-1); }
      else if(lightOn && e.key === 'ArrowRight'){ step(1); }
    });
    window.addEventListener('popstate', function(){ if(open) hide(true); });
    /* someone landing on the hash straight away */
    if(location.hash === '#certificates'){ setTimeout(show, 900); }
  })();

  /* ---------- tenure ----------
     The role's length is worked out from the start date, so the page never
     goes stale sitting on a server. */
  (function tenure(){
    var el = document.getElementById('xpLen'); if(!el) return;
    var start = new Date(2025, 1, 1), now = new Date();
    var m = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if(m < 1){ el.textContent = ''; return; }
    var y = Math.floor(m / 12), r = m % 12, out = [];
    if(y) out.push(y + ' yr' + (y > 1 ? 's' : ''));
    if(r) out.push(r + ' mo');
    el.textContent = '· ' + out.join(' ');
  })();

  /* ---------- everything else: the trail ----------
     Pieces drop every `step` px of pointer travel, centred on the pointer,
     with a tiny random tilt; each holds for `hold` ms then fades. A ring of
     nodes is reused so the DOM never grows. Touch screens get a ghost
     pointer that wanders while the section is on screen. */
  (function trail(){
    var sec = document.getElementById('archive'), layer = document.getElementById('trailLayer');
    if(!sec || !layer || !window.TRAIL_POOL) return;
    var pool = window.TRAIL_POOL, RING = 14, ring = [], z = 0, k = 0, last = null, live = false;
    var step = window.innerWidth <= 640 ? 70 : 92, hold = 650, fade = 1000;
    for(var i = 0; i < RING; i++){
      var n = document.createElement('div'); n.className = 'trail__item'; n.innerHTML = '<i></i>';
      layer.appendChild(n); ring.push({el:n, t1:0, t2:0});
    }
    var cap = document.getElementById('trailCount'); if(cap) cap.textContent = pool.length;
    if(reduce){
      /* a still scatter: eight pieces around the copy, no motion */
      sec.classList.add('is-still');
      var spots = [[12,22],[30,78],[50,14],[70,80],[88,26],[18,58],[82,60],[58,90]];
      spots.forEach(function(s, i){ place(ring[i], pool[i % pool.length], s[0] * sec.clientWidth / 100, s[1] * sec.clientHeight / 100, (i % 2 ? 1 : -1) * 2.5); ring[i].el.classList.add('is-on'); });
      return;
    }
    function place(slot, piece, x, y, r){
      var el = slot.el;
      el.setAttribute('data-shape', piece.shape || 'tall');
      var face = el.querySelector('img,.ph'); if(face) face.remove();
      if(piece.src){ var im = document.createElement('img'); im.src = piece.src; im.alt = ''; im.decoding = 'async'; el.insertBefore(im, el.firstChild); }
      else { var ph = document.createElement('span'); ph.className = 'ph'; ph.style.background = piece.wash || '#EAE2D0'; ph.textContent = piece.ghost || ''; el.insertBefore(ph, el.firstChild); }
      el.querySelector('i').textContent = piece.cap || '';
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.style.setProperty('--r', r.toFixed(2) + 'deg');
    }
    function drop(x, y){
      var slot = ring[k % RING]; k++;
      clearTimeout(slot.t1); clearTimeout(slot.t2);
      var el = slot.el;
      el.classList.remove('is-on', 'is-out', 'is-new');
      void el.offsetWidth;                                   /* restart the pop */
      place(slot, pool[(k - 1) % pool.length], x, y, (Math.random() * 6 - 3));
      el.style.zIndex = ++z;
      ring.forEach(function(s){ s.el.classList.remove('is-new'); });
      el.classList.add('is-on', 'is-new');
      slot.t1 = setTimeout(function(){ el.classList.add('is-out'); }, hold);
      slot.t2 = setTimeout(function(){ el.classList.remove('is-on', 'is-out', 'is-new'); }, hold + fade + 60);
      if(!live){ live = true; sec.classList.add('is-live'); }
    }
    function maybe(x, y){
      if(!last){ last = [x, y]; drop(x, y); return; }
      var dx = x - last[0], dy = y - last[1];
      if(dx * dx + dy * dy >= step * step){ last = [x, y]; drop(x, y); }
    }
    function local(e){ var r = sec.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    sec.addEventListener('pointermove', function(e){ if(e.pointerType === 'touch') return; var p = local(e); maybe(p[0], p[1]); });
    sec.addEventListener('pointerleave', function(){ last = null; });
    sec.addEventListener('pointerdown', function(e){ if(e.pointerType !== 'touch') return; var p = local(e); last = p; drop(p[0], p[1]); });
    /* ghost pointer: a slow figure-of-eight across the band, on touch
       screens always, and once as a demo on desktop the first time the
       section arrives */
    var ghost = 0, gt = 0;
    function coarseNow(){ return !canHover(); }
    function ghostFrame(now){
      if(!gt) gt = now;
      var t = (now - gt) / 1000;
      var w = sec.clientWidth, h = sec.clientHeight;
      var x = w * (0.5 + 0.38 * Math.sin(t * 0.9)), y = h * (0.5 + 0.30 * Math.sin(t * 1.8 + 1.2));
      maybe(x, y);
      if(coarseNow() || t < 4.2){ ghost = requestAnimationFrame(ghostFrame); } else { ghost = 0; last = null; }
    }
    var seen = false;
    if('IntersectionObserver' in window){
      new IntersectionObserver(function(en){
        var on = en[0].isIntersecting;
        if(on && (coarseNow() || !seen)){ seen = true; gt = 0; if(!ghost) ghost = requestAnimationFrame(ghostFrame); }
        if(!on && ghost){ cancelAnimationFrame(ghost); ghost = 0; last = null; }
      }, {threshold:0.35}).observe(sec);
    }
    /* the user taking over stops the demo on desktop */
    sec.addEventListener('pointermove', function(e){ if(e.pointerType !== 'touch' && ghost){ cancelAnimationFrame(ghost); ghost = 0; } });
  })();

  /* ---------- toolkit rail ----------
     Copies each group's head into the sticky rail, then shows whichever
     group's honeycomb has reached the rail's line. */
  (function toolkitRail(){
    var tk = document.getElementById('tk'); if(!tk) return;
    var rail = tk.querySelector('.tk__rail'), groups = Array.prototype.slice.call(tk.querySelectorAll('.tkgroup'));
    if(!rail || !groups.length) return;
    var heads = groups.map(function(g){
      var h = g.querySelector('.tkgroup__head').cloneNode(true);
      h.removeAttribute('data-reveal'); h.classList.remove('in');
      rail.appendChild(h); return h;
    });
    var active = -1, ticking = false;
    function update(){
      ticking = false;
      var line = rail.getBoundingClientRect().top + 60, on = 0;
      for(var i = 0; i < groups.length; i++){
        if(groups[i].getBoundingClientRect().top <= line) on = i;
      }
      if(on !== active){
        active = on;
        heads.forEach(function(h, k){ h.classList.toggle('is-on', k === on); });
        /* the rail keeps the tallest head's height so the column never jumps */
      }
    }
    function onScroll(){ if(!ticking){ ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, {passive:true});
    window.addEventListener('resize', onScroll);
    /* size the rail to its tallest head once fonts are in */
    function size(){ var m = 0; heads.forEach(function(h){ m = Math.max(m, h.offsetHeight); }); rail.style.minHeight = m + 'px'; }
    size(); window.addEventListener('load', size);
    if(document.fonts && document.fonts.ready){ document.fonts.ready.then(size); }
    update();
  })();

  /* ---------- year ---------- */
  document.getElementById('yr').textContent = new Date().getFullYear();

  /* ---------- live clock (change the offset for your timezone) ---------- */
  var OFFSET_MINUTES = 330; // GMT+5:30 — e.g. 180 for GMT+3, -300 for GMT-5
  var clock = document.getElementById('clock'), clock2 = document.getElementById('clock2');
  function tick(){
    var d = new Date(Date.now() + (OFFSET_MINUTES + new Date().getTimezoneOffset()) * 60000);
    var hhmmss = String(d.getHours()).padStart(2,'0') + ':' +
      String(d.getMinutes()).padStart(2,'0') + ':' +
      String(d.getSeconds()).padStart(2,'0');
    clock.textContent = hhmmss;
    if(clock2) clock2.textContent = hhmmss.slice(0,5);
  }
  tick(); setInterval(tick, 1000);

  /* ---------- keep the split name inside its column ----------
     The CSS clamp covers the usual case. This shrinks the type further
     if a name is long enough to still reach the portrait, so the hero
     never overlaps whatever name goes in.                            */
  var heroWords = document.querySelectorAll('.hero__word');
  var mcv = document.createElement('canvas').getContext('2d');

  /* Big type carries side bearings — blank space baked into the glyph box — so
     a 104px "S" sits a few pixels right of its own edge while the 16px kicker
     above it does not. This trims that space so the ink of the name lines up
     with the small text, instead of the invisible box around it. */
  function textWidth(el){                                        // width of the glyphs, not the box
    var r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().width;
  }

  function opticalAlign(w){
    var cs = getComputedStyle(w), align = cs.textAlign;
    if(align === 'center' || align === 'justify') return;       // stacked layout
    var txt = w.textContent.trim(), m;
    if(cs.textTransform === 'uppercase') txt = txt.toUpperCase();   // canvas ignores text-transform
    else if(cs.textTransform === 'lowercase') txt = txt.toLowerCase();
    try{
      mcv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      if('letterSpacing' in mcv){ mcv.letterSpacing = cs.letterSpacing; }
      m = mcv.measureText(txt);
    }catch(e){ return; }
    if(!m || typeof m.actualBoundingBoxLeft !== 'number') return;

    var domW = textWidth(w);                                      // sanity check
    if(!domW || Math.abs(m.width - domW) / domW > 0.12) return;    // canvas disagrees, leave it alone

    var cap = parseFloat(cs.fontSize) * 0.1;                      // never nudge more than this
    if(align === 'right' || align === 'end'){
      var rsb = m.width - m.actualBoundingBoxRight;
      if(rsb > 0.5) w.style.marginRight = (-Math.min(rsb, cap)).toFixed(2) + 'px';
    } else {
      var lsb = -m.actualBoundingBoxLeft;
      if(lsb > 0.5) w.style.marginLeft = (-Math.min(lsb, cap)).toFixed(2) + 'px';
    }
  }

  function fitHeroNames(){
    heroWords.forEach(function(w){                               // back to the CSS values
      w.style.fontSize = ''; w.style.marginLeft = ''; w.style.marginRight = '';
    });
    heroWords.forEach(function(w){
      var line  = w.parentNode;
      /* measure the glyphs, not the box: the entrance slides the word out of
         its mask, and scrollWidth would count that offset as overflow */
      var avail = line.clientWidth, text = textWidth(w);
      if(avail > 0 && text > avail){
        var fs = parseFloat(getComputedStyle(w).fontSize);
        w.style.fontSize = (fs * (avail / text) * 0.98).toFixed(1) + 'px';
      }
    });
    heroWords.forEach(opticalAlign);
  }
  fitHeroNames();
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(fitHeroNames); }
  var fitT;
  window.addEventListener('resize', function(){ clearTimeout(fitT); fitT = setTimeout(fitHeroNames, 120); });

  /* ---------- 3D honeycomb hero background ----------
     Painted once on a canvas. Tweak R for bigger/smaller cells,
     and the two fill colours below for a different material.      */
  /* ---------- hero film ----------
     Fades in once it can actually play (the poster covers the wait), pauses
     while the hero is off screen or the tab is hidden, and stays on its
     poster for people who asked for reduced motion. */
  (function heroFilm(){
    var v = document.getElementById('heroVideo'); if(!v) return;
    if(reduce){ v.removeAttribute('autoplay'); v.pause(); v.classList.add('is-ready'); return; }
    function ready(){ v.classList.add('is-ready'); }
    if(v.readyState >= 3) ready(); else v.addEventListener('canplay', ready, {once:true});
    var onScreen = true;
    function sync(){
      if(onScreen && !document.hidden){ var p = v.play(); if(p && p.catch) p.catch(function(){}); }
      else v.pause();
    }
    if('IntersectionObserver' in window){
      new IntersectionObserver(function(en){ onScreen = en[0].isIntersecting; sync(); }, {threshold:0.05}).observe(v);
    }
    document.addEventListener('visibilitychange', sync);
  })();

  /* ---------- seamless marquees ----------
     See .mq in the stylesheet. Rebuilt on resize and once the webfonts land,
     from the original items each time, so nothing accumulates. */
  function buildMarquees(){
    Array.prototype.forEach.call(document.querySelectorAll('.mq'), function(mq){
      var set = mq.querySelector('.mq__set'), track;
      if(!set) return;
      if(!mq.__items){                                   // first run: remember the originals, add the track
        mq.__items = Array.prototype.slice.call(set.children);
        track = document.createElement('div'); track.className = 'mq__track';
        set.parentNode.insertBefore(track, set); track.appendChild(set);
        mq.__track = track;
      }
      track = mq.__track;
      set.textContent = '';
      mq.__items.forEach(function(li){ set.appendChild(li); });
      while(track.children.length > 1) track.removeChild(track.lastChild);

      var box = mq.clientWidth, one = set.getBoundingClientRect().width;
      if(!box || !one) return;
      var reps = Math.max(1, Math.ceil(box / one));   // the set must cover the viewport on its own
      for(var r = 1; r < reps; r++) mq.__items.forEach(function(li){ set.appendChild(li.cloneNode(true)); });
      var twin = set.cloneNode(true); twin.setAttribute('aria-hidden', 'true');
      track.appendChild(twin);                         // two identical sets; the loop slides exactly one

      var speed = parseFloat(mq.getAttribute('data-speed')) || 50;   // px per second
      track.style.animationDuration = (set.getBoundingClientRect().width / speed).toFixed(2) + 's';
    });
  }
  buildMarquees();
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(buildMarquees); }
  window.addEventListener('load', buildMarquees);
  var mqT;
  window.addEventListener('resize', function(){ clearTimeout(mqT); mqT = setTimeout(buildMarquees, 150); });

  /* ---------- honeycomb painter ----------
     One painter, used twice: for the hero background and for the loader.
     Same width in, same grid out — which is what lets the loader hand over
     to the hero without the pattern shifting a pixel.
     Change R in honeyGeo() to resize the cells.                        */
  function honeyPath(x, cx, cy, r, add){
    if(!add) x.beginPath();
    for(var k = 0; k < 6; k++){
      var a  = Math.PI / 180 * (60 * k - 90);        // pointy-top
      var px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
      k ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath();
  }
  /* stable pseudo-random so the pattern never jumps between repaints */
  function honeyNoise(i, j){ var s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }

  function honeyGeo(w, h){
    var R  = Math.max(74, Math.min(w * 0.101, 215));  // cell radius
    var hw = Math.sqrt(3) * R / 2, vs = R * 1.5;      // half width, row spacing
    var rows = Math.ceil(h / vs) + 2, cols = Math.ceil(w / (hw * 2)) + 2;
    var mx = w / 2, my = h / 2, far = Math.sqrt(mx * mx + my * my) || 1;
    var cells = [];
    /* built bottom-right → top-left so each cell drops its shadow on the one
       beneath it, which is what reads as depth */
    for(var j = rows; j >= -1; j--){
      for(var i = cols; i >= -1; i--){
        var cx = i * hw * 2 + (Math.abs(j % 2) ? hw : 0), cy = j * vs;
        var d = honeyNoise(i, j);
        var raw  = Math.sqrt((cx - mx) * (cx - mx) + (cy - my) * (cy - my));
        var dist = raw / far;
        /* t   = when this cell ignites during the loader: a wave out from the
                centre, roughened so it does not read as a plain ripple
           hot = the ~1 in 7 cells that burn accent-orange instead of dark   */
        cells.push({
          x: cx, y: cy, d: d, raw: raw,
          t: Math.min(0.8, 0.6 * dist + 0.36 * d),
          hot: honeyNoise(j * 7 + 3, i * 13 + 5) > 0.86
        });
      }
    }
    return { R: R, cells: cells };
  }

  function sizeCanvas(cv, w, h, cap){
    var dpr = Math.min(window.devicePixelRatio || 1, cap || 2);
    cv.width  = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { x: x, dpr: dpr };
  }

  function paintHoney(x, w, h, geo){
    paintHoneyCells(x, w, h, geo);
    paintHoneyWash(x, w, h);
  }
  function paintHoneyCells(x, w, h, geo){
    x.fillStyle = '#EEE7D8';
    x.fillRect(0, 0, w, h);
    geo.cells.forEach(function(c){
      x.save();
      x.shadowColor   = 'rgba(112,101,78,' + (0.20 + c.d * 0.16) + ')';
      x.shadowBlur    = 9 + c.d * 15;
      x.shadowOffsetX = 4 + c.d * 7;
      x.shadowOffsetY = 6 + c.d * 9;
      honeyPath(x, c.x, c.y, geo.R * 0.975);
      x.fillStyle = '#F3EEE2';
      x.fill();
      x.restore();

      var g = x.createLinearGradient(c.x - geo.R, c.y - geo.R, c.x + geo.R, c.y + geo.R);
      g.addColorStop(0,    '#FEFCF7');
      g.addColorStop(0.45, '#F7F2E7');
      g.addColorStop(1,    '#E4DCC8');
      honeyPath(x, c.x, c.y, geo.R * 0.975);
      x.fillStyle = g;
      x.fill();
      x.strokeStyle = 'rgba(255,253,247,.85)';
      x.lineWidth = 1;
      x.stroke();
    });
  }
  function paintHoneyWash(x, w, h){
    /* wash through the middle so the name stays readable */
    var v = x.createRadialGradient(w * 0.5, h * 0.46, 0, w * 0.5, h * 0.46, Math.max(w, h) * 0.72);
    v.addColorStop(0,   'rgba(255,252,244,.52)');
    v.addColorStop(0.5, 'rgba(255,252,244,.24)');
    v.addColorStop(1,   'rgba(255,252,244,0)');
    x.fillStyle = v;
    x.fillRect(0, 0, w, h);
  }

  /* ---------- scroll reveal ---------- */
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, {threshold:0.12, rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('[data-reveal],[data-rise]').forEach(function(el){ io.observe(el); });
  document.querySelectorAll('[data-mask]').forEach(function(el){ io.observe(el); });

  /* ---------- animated stat counters ---------- */
  var cio = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(!en.isIntersecting) return;
      cio.unobserve(en.target);
      var el = en.target, end = +el.dataset.count, suffix = el.dataset.suffix || '';
      if(reduce){ el.textContent = end + suffix; return; }
      var t0 = performance.now(), dur = 1400;
      (function step(now){
        var p = Math.min(1, (now - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(end * e) + suffix;
        if(p < 1) requestAnimationFrame(step);
      })(t0);
    });
  }, {threshold:0.6});
  document.querySelectorAll('[data-count]').forEach(function(el){ cio.observe(el); });

  /* ---------- active nav link ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll('.dock a.dlink'));
  var secs = links.map(function(a){ return document.querySelector(a.getAttribute('href')); }).filter(Boolean);
  var sio = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(!en.isIntersecting) return;
      links.forEach(function(a){ a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id); });
      Array.prototype.forEach.call(document.querySelectorAll('.sheet__link'), function(a){
        a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id);
      });
    });
  }, {rootMargin:'-45% 0px -50% 0px'});
  secs.forEach(function(s){ sio.observe(s); });

  /* ---------- magnetic buttons (desktop only) ---------- */
  if(!reduce){
    document.querySelectorAll('.btn').forEach(function(b){
      b.addEventListener('pointermove', function(e){
        if(e.pointerType === 'touch') return;      /* a finger does not hover */
        var r = b.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width/2) * 0.16;
        var y = (e.clientY - r.top - r.height/2) * 0.28;
        b.style.transform = 'translate(' + x + 'px,' + (y - 2) + 'px)';
      });
      b.addEventListener('pointerleave', function(){ b.style.transform = ''; });
    });
  }

  /* ---------- contact form ----------
     Posts to Formspree over fetch so the page never navigates away. The form
     still carries a real action and method, so if this script never runs the
     browser submits it the ordinary way and the message still arrives. */
  var form = document.getElementById('form'), sent = document.getElementById('sent');
  var sendBtn = document.getElementById('send'), sendT = document.getElementById('sendT');
  var errBox = document.getElementById('formErr');
  var MAILTO = 'raikwarsanskar049@gmail.com';

  function fail(msg){
    errBox.textContent = msg + ' You can email me at ' + MAILTO + ' instead.';
    errBox.hidden = false;
  }

  form.addEventListener('submit', function(e){
    if(!window.fetch) return;              /* no fetch: let the browser post it */
    e.preventDefault();
    errBox.hidden = true;

    var ok = true;
    ['f-name','f-email','f-msg'].forEach(function(id){
      var el = document.getElementById(id);
      if(!el.value.trim()){ el.style.borderBottomColor = '#FF4901'; ok = false; }
      else el.style.borderBottomColor = '';
    });
    var email = document.getElementById('f-email');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())){
      email.style.borderBottomColor = '#FF4901'; ok = false;
    }
    if(!ok){ fail('Check the highlighted fields.'); return; }

    sendBtn.disabled = true; sendT.textContent = 'Sending…';

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' }
    })
    .then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(data){
        return { res: res, data: data };
      });
    })
    .then(function(r){
      if(r.res.ok){
        form.classList.add('hide');
        sent.classList.add('show');
        return;
      }
      /* Formspree returns its own reason — show that rather than a generic line */
      var why = (r.data.errors && r.data.errors.length && r.data.errors[0].message) || null;
      fail(why ? why + '.' : 'That did not send.');
    })
    .catch(function(){ fail('That did not send — the network refused.'); })
    .then(function(){ sendBtn.disabled = false; sendT.textContent = 'Send message'; });
  });

  document.getElementById('again').addEventListener('click', function(){
    form.reset(); form.classList.remove('hide'); sent.classList.remove('show');
    errBox.hidden = true;
  });

  /* ---------- dock labels ----------
     Each letter becomes its own little cube so the flip can run across the
     word instead of turning it in one piece. */
  (function splitDockLabels(){
    document.querySelectorAll('.dlink .flip').forEach(function(f){
      var word = f.getAttribute('data-text') || f.textContent.trim();
      var n = word.length, out = '';
      for(var i = 0; i < n; i++){
        var c = word[i] === ' ' ? '\u00a0' : word[i];
        out += '<span class="flip__ch" style="--i:' + i + ';--n:' + n + '"><b>' + c + '</b><i>' + c + '</i></span>';
      }
      f.innerHTML = out;
      /* the letters are decoration now — the link carries the name */
      f.setAttribute('aria-hidden', 'true');
      var a = f.closest('a'); if(a && !a.getAttribute('aria-label')) a.setAttribute('aria-label', word);
    });
  })();

  /* ---------- copy email ----------
     Clipboard API where it exists, a hidden field where it does not. The
     button says what happened either way. */
  (function copyMail(){
    var btn = document.getElementById('copyMail'); if(!btn) return;
    var label = btn.querySelector('.btn__t'), mail = btn.getAttribute('data-mail');
    var resting = label.textContent, busy = 0;
    function fallback(text){
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly',''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try{ ok = document.execCommand('copy'); }catch(e){}
      document.body.removeChild(ta); return ok;
    }
    function say(text, good){
      clearTimeout(busy);
      btn.classList.add('is-swapping');
      setTimeout(function(){ label.textContent = text; btn.classList.remove('is-swapping'); }, 180);
      btn.classList.toggle('is-done', !!good);
      busy = setTimeout(function(){
        btn.classList.add('is-swapping');
        setTimeout(function(){ label.textContent = resting; btn.classList.remove('is-swapping'); }, 180);
        btn.classList.remove('is-done');
      }, 2200);
    }
    btn.addEventListener('click', function(){
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(mail).then(function(){ say('Copied to clipboard', true); },
          function(){ say(fallback(mail) ? 'Copied to clipboard' : mail, true); });
      } else {
        say(fallback(mail) ? 'Copied to clipboard' : mail, true);
      }
    });
  })();

  /* ---------- CV placeholder ---------- */
  document.querySelectorAll('[data-cv]').forEach(function(a){
    a.addEventListener('click', function(e){
      e.preventDefault();
      a.textContent = 'Add your CV file first';
      setTimeout(function(){ a.textContent = 'Download CV'; }, 1800);
    });
  });

  /* ---------- back to top ----------
     The hexagon's ring is the scroll position, so the button doubles as a
     progress readout. 138 is the perimeter of the polygon in the SVG.   */
  var toTop = document.getElementById('toTop'), toTopBar = document.getElementById('toTopBar');
  var RING = 138;

  function trackScroll(){
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    toTopBar.style.strokeDashoffset = (RING * (1 - p)).toFixed(1);
    toTop.classList.toggle('show', window.scrollY > window.innerHeight * 0.55);
  }
  trackScroll();
  window.addEventListener('scroll', trackScroll, {passive:true});
  window.addEventListener('resize', trackScroll);

  /* ---------- in-page links: eased scroll ----------
     Native smooth scrolling only kicks in here when the clicked link takes
     focus, which Safari never gives it — so every #link is driven by one
     tween instead. Duration scales with distance (a hop to the next section
     is quick, hero-to-contact takes a little longer), the ease is the same
     in-out curve the rest of the site uses, and a wheel or touch during the
     ride hands control straight back to the reader. */
  var scrollRaf = null, rootStyle = document.documentElement.style;
  function cancelScroll(){
    if(scrollRaf !== null){ cancelAnimationFrame(scrollRaf); scrollRaf = null; }
    rootStyle.scrollBehavior = '';
  }
  function scrollToY(target, done){
    cancelScroll();
    var max = document.documentElement.scrollHeight - window.innerHeight;
    target = Math.max(0, Math.min(max, target));
    var from = window.scrollY, dist = target - from;
    if(reduce || Math.abs(dist) < 2){ window.scrollTo(0, target); if(done) done(); return; }
    /* the stylesheet's scroll-behavior:smooth would turn every frame of this
       tween into its own smooth scroll — switch it off while we drive */
    rootStyle.scrollBehavior = 'auto';
    /* paced so the journey is actually seen — a section-and-a-half used to
       cross in ~640ms, which reads as a jump rather than a scroll */
    var dur = Math.max(700, Math.min(1500, Math.abs(dist) / 1.9)), t0 = null;
    scrollRaf = requestAnimationFrame(function step(now){
      if(t0 === null) t0 = now;
      var p = Math.min(1, (now - t0) / dur);
      var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;    // ease in-out cubic
      window.scrollTo(0, from + dist * e);
      if(p < 1){ scrollRaf = requestAnimationFrame(step); return; }
      scrollRaf = null; rootStyle.scrollBehavior = '';
      if(done) done();
    });
  }
  ['wheel', 'touchstart', 'keydown'].forEach(function(ev){
    window.addEventListener(ev, cancelScroll, {passive:true});
  });

  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href^="#"]');
    if(!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var id = a.getAttribute('href').slice(1);
    if(!id) return;
    var el = document.getElementById(id);
    if(!el) return;
    e.preventDefault();
    var bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar')) || 0;
    var top = el.getBoundingClientRect().top + window.scrollY - bar;
    if(document.body.classList.contains('menu-open')) closeMenu();
    scrollToY(top, function(){
      /* sandboxed previews (srcdoc frames) refuse URL changes — not worth an error */
      try{ if(history.pushState) history.pushState(null, '', '#' + id); }catch(err){}
      /* move focus along so keyboard and screen-reader users land there too */
      if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({preventScroll:true});
    });
  });

  toTop.addEventListener('click', function(){ scrollToY(0); });

  /* ---------- phone menu ---------- */
  var menuBtn = document.getElementById('menuBtn'), sheet = document.getElementById('sheet');
  function openMenu(){ document.body.classList.add('menu-open'); menuBtn.setAttribute('aria-expanded', 'true'); }
  function closeMenu(){ document.body.classList.remove('menu-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  if(menuBtn && sheet){
    menuBtn.addEventListener('click', function(){
      document.body.classList.contains('menu-open') ? closeMenu() : openMenu();
    });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeMenu(); });
    /* the sheet is phone-only; if the window grows past it, never leave it stuck open */
    window.addEventListener('resize', function(){ if(window.innerWidth > 640) closeMenu(); });
  }
})();
