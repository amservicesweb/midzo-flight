(function() {
  'use strict';

  // ── Attend que le DOM TP soit prêt ──
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // ── Retry helper ──
  function retry(fn, delay, max) {
    var attempts = 0;
    var interval = setInterval(function() {
      if (fn() || ++attempts >= max) clearInterval(interval);
    }, delay);
  }

  // ── 1. Remplace le logo TP par logo Midzo ──
  function injectLogo() {
    var selectors = [
      '.header a[href="/"]',
      '.header-logo a',
      'header a[href="/"]',
      'nav a[href="/"]',
      '[class*="logo"] a',
      '[class*="Logo"] a',
      'a[class*="logo"]',
      'a[class*="Logo"]'
    ];

    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) {
        el.innerHTML =
          '<img src="https://midzoflight.com/logo.png" alt="Midzo Flight" ' +
          'style="height:34px;width:auto;vertical-align:middle;" ' +
          'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' +
          '<span style="display:none;align-items:center;gap:6px;">' +
          '<span style="font-family:sans-serif;font-weight:800;font-size:1rem;color:#0770e3;">MIDZO</span>' +
          '<span style="font-size:.48rem;font-weight:700;color:#0770e3;background:#e8f2fd;border-radius:3px;padding:2px 5px;">FLIGHT</span>' +
          '</span>';
        el.style.textDecoration = 'none';
        return true;
      }
    }
    return false;
  }

  // ── 2. Ajoute bouton Sofia dans la nav ──
  function injectSofiaBtn() {
    if (document.getElementById('mz-sofia-btn')) return true;

    var navSelectors = [
      'header nav',
      '.header nav',
      '[class*="header"] nav',
      '[class*="Header"] nav',
      'header',
      '.header'
    ];

    for (var i = 0; i < navSelectors.length; i++) {
      var nav = document.querySelector(navSelectors[i]);
      if (nav) {
        var btn = document.createElement('a');
        btn.id = 'mz-sofia-btn';
        btn.href = 'https://midzoflight.com/sofia';
        btn.style.cssText =
          'display:inline-flex;align-items:center;gap:6px;' +
          'background:linear-gradient(135deg,#0770e3,#044faa);' +
          'color:#fff;padding:6px 14px;border-radius:20px;' +
          'font-family:sans-serif;font-size:.8rem;font-weight:700;' +
          'text-decoration:none;margin-left:12px;' +
          'box-shadow:0 2px 8px rgba(7,112,227,.25);' +
          'white-space:nowrap;flex-shrink:0;';
        btn.innerHTML =
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none">' +
          '<circle cx="12" cy="8" r="4" stroke="white" stroke-width="2"/>' +
          '<path d="M4 22c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="white" stroke-width="2" stroke-linecap="round"/>' +
          '</svg>Sofia IA';
        nav.appendChild(btn);
        return true;
      }
    }
    return false;
  }

  // ── 3. Bouton flottant Sofia ──
  function injectFloat() {
    if (document.getElementById('mz-float')) return true;

    var wrap = document.createElement('div');
    wrap.id = 'mz-float';
    wrap.style.cssText = 'position:fixed;bottom:22px;right:22px;z-index:99999;';

    var btn = document.createElement('a');
    btn.href = 'https://midzoflight.com/sofia';
    btn.title = 'Parler à Sofia IA';
    btn.style.cssText =
      'width:52px;height:52px;border-radius:50%;' +
      'background:linear-gradient(135deg,#0770e3,#044faa);' +
      'box-shadow:0 4px 18px rgba(7,112,227,.35);' +
      'display:flex;align-items:center;justify-content:center;' +
      'text-decoration:none;transition:transform .2s;';
    btn.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' +
      '<circle cx="12" cy="8" r="4" stroke="white" stroke-width="2"/>' +
      '<path d="M4 22c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="white" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="19" cy="5" r="3" fill="#00d26a" stroke="white" stroke-width="1.5"/>' +
      '</svg>';

    btn.addEventListener('mouseenter', function(){ this.style.transform='scale(1.1)'; });
    btn.addEventListener('mouseleave', function(){ this.style.transform='scale(1)'; });

    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    return true;
  }

  // ── INIT ──
  ready(function() {
    retry(injectLogo,    300, 15);
    retry(injectSofiaBtn,400, 15);
    injectFloat();
  });

})();
