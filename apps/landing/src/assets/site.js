// VillKro website behaviour. Every page works without this file; it only
// adds the menu, scroll effects and the animated app screens.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PLAY = 'https://play.google.com/store/apps/details?id=com.yashsiwach.villkro';
  var APPLE = 'https://apps.apple.com/in/app/villkro-smart-food-delivery/id6800449391';
  function $(id) { return document.getElementById(id); }

  // Mobile menu
  var nav = $('nav');
  var menuBtn = $('menuBtn');
  function setMenu(open) {
    nav.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  if (nav && menuBtn) {
    menuBtn.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
    nav.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  }

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

  // Reveal on scroll
  var targets = document.querySelectorAll('.reveal, .stagger');
  function show(el) { el.classList.add('in'); }
  if (!reduce && 'IntersectionObserver' in window) {
    try {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
      targets.forEach(function (el) { el.classList.add('will-reveal'); io.observe(el); });
    } catch (error) {
      // Keep content readable if animation setup fails.
      targets.forEach(show);
    }
  } else {
    targets.forEach(show);
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
