// VillKro website behaviour. Every page works without this file; it only
// adds the theme switch, menu, scroll effects, page-transition morphs and
// the animated app screens.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PLAY = 'https://play.google.com/store/apps/details?id=com.yashsiwach.villkro';
  var APPLE = 'https://apps.apple.com/in/app/villkro-smart-food-delivery/id6800449391';
  var root = document.documentElement;
  function $(id) { return document.getElementById(id); }

  // Light / dark theme. Light is the default; the choice is remembered on
  // this device only (the head script applies it before first paint).
  var themeBtn = $('themeBtn');
  function isDark() { return root.getAttribute('data-theme') === 'dark'; }
  function syncThemeBtn() {
    if (!themeBtn) return;
    var dark = isDark();
    themeBtn.setAttribute('aria-label', themeBtn.getAttribute(dark ? 'data-to-light' : 'data-to-dark'));
    themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    var meta = $('themeColor');
    if (meta) meta.content = dark ? '#08080B' : '#FBF8F3';
  }
  function setTheme(dark) {
    if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    try { localStorage.setItem('vk-theme', dark ? 'dark' : 'light'); } catch (e) { /* private mode */ }
    syncThemeBtn();
  }
  if (themeBtn) {
    syncThemeBtn();
    themeBtn.addEventListener('click', function () {
      var next = !isDark();
      if (!document.startViewTransition || reduce) { setTheme(next); return; }
      var r = themeBtn.getBoundingClientRect();
      root.style.setProperty('--tx', (r.left + r.width / 2) + 'px');
      root.style.setProperty('--ty', (r.top + r.height / 2) + 'px');
      root.classList.add('theme-anim');
      var vt = document.startViewTransition(function () { setTheme(next); });
      vt.ready.catch(function () { /* skipped: the theme still changed */ });
      vt.finished.finally(function () { root.classList.remove('theme-anim'); });
    });
  }

  // Mobile menu
  var nav = $('nav');
  var menuBtn = $('menuBtn');
  function setMenu(open) {
    nav.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', menuBtn.getAttribute(open ? 'data-close' : 'data-open'));
  }
  if (nav && menuBtn) {
    menuBtn.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
    nav.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
    // A tap on the scrim around the open menu closes it
    nav.addEventListener('click', function (e) { if (e.target === nav) setMenu(false); });
  }

  // Nav pill: a glass pill slides to the link under the pointer and rests on
  // the current page's link (desktop; the CSS hides it in the phone menu).
  var navLinks = $('navLinks');
  if (navLinks) {
    var pill = document.createElement('span');
    pill.className = 'nav-pill';
    pill.setAttribute('aria-hidden', 'true');
    navLinks.insertBefore(pill, navLinks.firstChild);
    navLinks.classList.add('has-pill');
    var currentLink = navLinks.querySelector('a[aria-current]');
    var pillShown = false;
    var movePill = function (a) {
      if (!a || !a.offsetWidth) { pill.style.opacity = '0'; pillShown = false; return; }
      if (!pillShown) pill.style.transition = 'none'; // appear in place, don't slide in from the left
      pill.style.width = a.offsetWidth + 'px';
      pill.style.transform = 'translateX(' + a.offsetLeft + 'px)';
      if (!pillShown) { void pill.offsetWidth; pill.style.transition = ''; }
      pill.style.opacity = '1';
      pillShown = true;
    };
    navLinks.querySelectorAll('a:not(.btn)').forEach(function (a) {
      a.addEventListener('mouseenter', function () { movePill(a); });
      a.addEventListener('focus', function () { movePill(a); });
    });
    navLinks.addEventListener('mouseleave', function () { movePill(currentLink); });
    navLinks.addEventListener('focusout', function (e) { if (!navLinks.contains(e.relatedTarget)) movePill(currentLink); });
    window.addEventListener('resize', function () { pillShown = false; movePill(currentLink); });
    movePill(currentLink);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { pillShown = false; movePill(currentLink); });
  }

  // Stacked sheets: each one sticks when its bottom reaches the bottom of the
  // screen, and the next slides over it while it shrinks and dims a little.
  var sheets = Array.prototype.slice.call(document.querySelectorAll('.sheet'));
  var stackOn = sheets.length > 1 && !reduce;
  function placeSheets() {
    if (!stackOn) return;
    var vh = window.innerHeight;
    sheets.forEach(function (s) {
      // Only sticky sheets get an offset; on the last (relative) one a top would shift it.
      s.style.top = getComputedStyle(s).position === 'sticky' ? Math.min(0, vh - s.offsetHeight) + 'px' : '';
    });
  }
  function coverSheets() {
    if (!stackOn) return;
    var vh = window.innerHeight;
    for (var i = 0; i < sheets.length - 1; i++) {
      var p = (vh - sheets[i + 1].getBoundingClientRect().top) / vh;
      p = p < 0 ? 0 : (p > 1 ? 1 : p);
      sheets[i].style.setProperty('--cover', p.toFixed(3));
      sheets[i].style.transform = p > 0 ? 'scale(' + (1 - p * 0.05).toFixed(4) + ')' : '';
    }
  }
  placeSheets();
  window.addEventListener('resize', function () { placeSheets(); coverSheets(); });
  window.addEventListener('load', placeSheets);

  // Scroll-linked UI
  var progress = $('progress');
  var toTop = $('toTop');
  var mbar = $('mbar');
  var download = $('download');
  var ticking = false;
  function onScroll() {
    var y = window.scrollY;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (nav) nav.classList.toggle('scrolled', y > 8);
    if (progress) progress.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
    if (toTop) toTop.classList.toggle('show', y > 700);
    if (mbar) {
      var near = false;
      if (download) {
        var r = download.getBoundingClientRect();
        near = r.top < window.innerHeight && r.bottom > 0;
      }
      mbar.classList.toggle('show', y > 500 && !near);
    }
    coverSheets();
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });

  // "Get the app" buttons go straight to the right store on phones
  var ua = navigator.userAgent || '';
  var store = /iPhone|iPad|iPod/i.test(ua) ? APPLE : (/Android/i.test(ua) ? PLAY : null);
  if (store) document.querySelectorAll('[data-store-link]').forEach(function (a) { a.href = store; });

  // Page transitions: the tapped dish or shop card's photo and name morph
  // into the next page's hero. Names are set only for the link being
  // followed, and the old page's own hero names are cleared, because two
  // elements with one name would cancel the transition.
  var morphFrom = null;
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-morph]');
    morphFrom = (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) ? a : null;
  }, true);
  function clearMorph() {
    document.querySelectorAll('[data-morph-img], [data-morph-title], .vt-title, .vt-img').forEach(function (el) { el.style.viewTransitionName = ''; });
  }
  // A skipped transition (hidden tab, fast clicks) rejects "ready"; that is fine.
  function quiet(vt) { if (vt && vt.ready) vt.ready.catch(function () {}); }
  window.addEventListener('pageswap', function (e) {
    quiet(e.viewTransition);
    if (!e.viewTransition || !morphFrom) return;
    var to = e.activation && e.activation.entry && e.activation.entry.url;
    if (!to || to.split('#')[0] !== morphFrom.href.split('#')[0]) return;
    document.querySelectorAll('.vt-title, .vt-img').forEach(function (el) { el.style.viewTransitionName = 'none'; });
    var img = morphFrom.querySelector('[data-morph-img]');
    var title = morphFrom.querySelector('[data-morph-title]');
    if (img) img.style.viewTransitionName = 'page-img';
    if (title) title.style.viewTransitionName = 'page-title';
    e.viewTransition.finished.finally(clearMorph);
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) clearMorph(); });

  // Reveal on scroll
  var targets = document.querySelectorAll('.reveal, .stagger');
  function show(el) { el.classList.add('in'); }
  if (!reduce && 'IntersectionObserver' in window) {
    try {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      targets.forEach(function (el) {
        // Things already on screen at load stay put (no flash on page change).
        if (el.getBoundingClientRect().top < window.innerHeight * 0.9) { show(el); return; }
        el.classList.add('will-reveal');
        io.observe(el);
      });
    } catch (error) {
      targets.forEach(show);
    }
  } else {
    targets.forEach(show);
  }

  // Homepage food video: the poster shows first; the video loads after the
  // page, picks the tall or wide file by screen shape, and never loads on
  // Save-Data, 2G or reduced motion. It pauses while off screen.
  var hv = $('heroVideo');
  if (hv) {
    var conn = navigator.connection || {};
    var skipVideo = reduce || conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');
    if (!skipVideo) {
      var heroOnScreen = true;
      var playVideo = function () {
        if (!hv.src || document.hidden || !heroOnScreen) return;
        var p = hv.play();
        if (p && p.catch) p.catch(function () { /* autoplay blocked: the poster stays */ });
      };
      var startVideo = function () {
        var tall = window.matchMedia('(max-aspect-ratio: 4/5)').matches;
        hv.addEventListener('playing', function () { hv.classList.add('playing'); }, { once: true });
        hv.src = hv.getAttribute(tall ? 'data-tall' : 'data-wide');
        playVideo();
      };
      if (document.readyState === 'complete') setTimeout(startVideo, 200);
      else window.addEventListener('load', function () { setTimeout(startVideo, 200); });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          heroOnScreen = entries[0].isIntersecting;
          if (heroOnScreen) playVideo(); else hv.pause();
        }).observe(hv);
      }
      document.addEventListener('visibilitychange', function () { if (document.hidden) hv.pause(); else playVideo(); });
    }
  }

  // Card spotlight follows the pointer
  document.querySelectorAll('.card').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  // Pause the SVG map animations for reduced motion
  if (reduce) document.querySelectorAll('svg.smil').forEach(function (svg) { if (svg.pauseAnimations) svg.pauseAnimations(); });

  // Rotating word in the hero heading
  var rot = $('rot');
  if (rot && !reduce) {
    var words = (rot.getAttribute('data-words') || '').split('|');
    var w = 0;
    setInterval(function () {
      if (document.hidden) return;
      rot.classList.remove('in');
      rot.classList.add('out');
      setTimeout(function () {
        w = (w + 1) % words.length;
        rot.textContent = words[w];
        rot.classList.remove('out');
        rot.classList.add('in');
      }, 350);
    }, 2400);
  }

  // Hero phone: Home -> Cart -> Live tracking, on a loop
  var phone = $('phone');
  if (!phone) return;

  if (!reduce && window.matchMedia('(hover: hover) and (min-width: 981px)').matches) {
    document.addEventListener('pointermove', function (e) {
      var x = (e.clientX / window.innerWidth - 0.5) * 10;
      var y = (e.clientY / window.innerHeight - 0.5) * -10;
      phone.style.transform = 'perspective(1000px) rotateY(' + x + 'deg) rotateX(' + y + 'deg)';
    });
  }

  var screens = phone.querySelectorAll('.scr');
  var dots = document.querySelectorAll('#screenDots i');
  var badge = $('cartBadge');
  var addBtn = $('addBtn');
  var payBtn = $('payBtn');
  var stepItems = phone.querySelectorAll('.a-steps li');
  var stepTitle = $('trackTitle');
  var bar = $('trackBar');
  var titles = ['Order accepted', 'Packed at the shop', 'Out for delivery', 'Delivered!'];
  var widths = ['12%', '38%', '70%', '100%'];

  function setStep(stage) {
    stepItems.forEach(function (li, i) {
      li.classList.toggle('done', i < stage || (stage === 3 && i === 3));
      li.classList.toggle('now', i === stage && stage !== 3);
    });
    stepTitle.textContent = titles[stage];
    bar.style.width = widths[stage];
  }
  function showScreen(n) {
    screens.forEach(function (s, i) {
      s.classList.toggle('active', i === n);
      s.classList.toggle('left', i < n);
    });
    dots.forEach(function (d, i) { d.classList.toggle('on', i === n); });
  }

  if (reduce) { showScreen(2); setStep(2); return; }

  // A tiny timeline. Timers only run while the phone is on screen.
  var timers = [];
  var running = false;
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function flash(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function cycle() {
    timers = [];
    badge.textContent = '2';
    setStep(0);
    showScreen(0);
    at(1500, function () { flash(addBtn, 'tap'); badge.textContent = '3'; flash(badge, 'bump'); });
    at(3600, function () { addBtn.classList.remove('tap'); showScreen(1); });
    at(5400, function () { flash(payBtn, 'press'); });
    at(6300, function () { payBtn.classList.remove('press'); showScreen(2); });
    at(7900, function () { setStep(1); });
    at(9500, function () { setStep(2); });
    at(12300, function () { setStep(3); });
    at(14600, cycle);
  }
  function start() { if (!running) { running = true; cycle(); } }
  function stop() { running = false; timers.forEach(clearTimeout); timers = []; }

  start();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) start(); else stop(); });
    }).observe(phone);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (phone.getBoundingClientRect().top < window.innerHeight) start();
  });
})();
