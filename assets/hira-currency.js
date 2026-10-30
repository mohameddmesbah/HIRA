/*
 * HIRA display currency.
 * Shows storefront prices converted from EGP at fixed rates (Theme settings > Display currency).
 * Display only: the cart, checkout and real prices stay in EGP.
 *
 * Prices are marked in Liquid as <span data-hira-money="CENTS">formatted EGP</span>.
 * Choice order: the visitor's saved pick > Shopify's country > the browser's timezone/locale.
 */
(function () {
  'use strict';

  var cfgNode = document.getElementById('HiraCurrencyConfig');
  if (!cfgNode) return;
  var cfg;
  try { cfg = JSON.parse(cfgNode.textContent); } catch (e) { return; }

  var BASE = 'EGP';
  var STORE_KEY = 'hira-currency';
  var DETECT_KEY = 'hira-currency-detected';
  var rates = { EGP: 1 };
  Object.keys(cfg.rates || {}).forEach(function (code) {
    var r = parseFloat(String(cfg.rates[code]).replace(',', '.'));
    if (r > 0) rates[code] = r;
  });

  var EURO = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK MC SM VA AD ME XK'.split(' ');
  var BY_COUNTRY = { EG: 'EGP', SA: 'SAR', AE: 'AED', KW: 'KWD', QA: 'QAR', US: 'USD', GB: 'GBP' };
  EURO.forEach(function (c) { BY_COUNTRY[c] = 'EUR'; });

  var BY_ZONE = {
    'Africa/Cairo': 'EG', 'Asia/Riyadh': 'SA', 'Asia/Dubai': 'AE', 'Asia/Kuwait': 'KW', 'Asia/Qatar': 'QA',
    'Europe/London': 'GB', 'Europe/Belfast': 'GB', 'Europe/Guernsey': 'GB', 'Europe/Jersey': 'GB', 'Europe/Isle_of_Man': 'GB',
    'Europe/Vienna': 'AT', 'Europe/Brussels': 'BE', 'Asia/Nicosia': 'CY', 'Europe/Nicosia': 'CY', 'Europe/Berlin': 'DE',
    'Europe/Busingen': 'DE', 'Europe/Tallinn': 'EE', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Africa/Ceuta': 'ES',
    'Europe/Helsinki': 'FI', 'Europe/Paris': 'FR', 'Europe/Athens': 'GR', 'Europe/Zagreb': 'HR', 'Europe/Dublin': 'IE',
    'Europe/Rome': 'IT', 'Europe/Vilnius': 'LT', 'Europe/Luxembourg': 'LU', 'Europe/Riga': 'LV', 'Europe/Malta': 'MT',
    'Europe/Amsterdam': 'NL', 'Europe/Lisbon': 'PT', 'Atlantic/Madeira': 'PT', 'Atlantic/Azores': 'PT',
    'Europe/Ljubljana': 'SI', 'Europe/Bratislava': 'SK', 'Europe/Monaco': 'MC', 'Europe/San_Marino': 'SM',
    'Europe/Vatican': 'VA', 'Europe/Andorra': 'AD', 'Europe/Podgorica': 'ME'
  };

  function store(key, value, session) {
    try { (session ? sessionStorage : localStorage).setItem(key, value); } catch (e) { /* private mode */ }
  }

  function read(key, session) {
    try { return (session ? sessionStorage : localStorage).getItem(key); } catch (e) { return null; }
  }

  // Any country without its own currency here shows USD.
  function currencyFor(country) {
    var code = BY_COUNTRY[String(country || '').toUpperCase()] || 'USD';
    return rates[code] ? code : (rates.USD ? 'USD' : BASE);
  }

  function browserCountry() {
    try {
      var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (BY_ZONE[zone]) return BY_ZONE[zone];
    } catch (e) { /* old browser */ }
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < langs.length; i++) {
      var m = /[-_]([A-Za-z]{2})$/.exec(langs[i]);
      if (m) return m[1].toUpperCase();
    }
    return '';
  }

  /* ---------- formatting ---------- */

  function format(egp, code) {
    var value = Math.round(egp * rates[code]);
    try {
      return new Intl.NumberFormat('en', {
        style: 'currency', currency: code, currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 0, maximumFractionDigits: 0
      }).format(value);
    } catch (e) {
      return code + ' ' + String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
  }

  /* ---------- applying ---------- */

  var current = BASE;

  function convertNode(node) {
    if (node.getAttribute('data-hira-shown') === current) return;
    if (!node.hasAttribute('data-hira-orig')) node.setAttribute('data-hira-orig', node.innerHTML);
    if (current === BASE) {
      node.innerHTML = node.getAttribute('data-hira-orig');
      node.removeAttribute('title');
    } else {
      var cents = parseFloat(node.getAttribute('data-hira-money')) || 0;
      node.textContent = format(cents / 100, current);
      node.title = node.getAttribute('data-hira-orig').replace(/<[^>]*>/g, '').trim();
    }
    node.setAttribute('data-hira-shown', current);
  }

  function fillNotes(scope) {
    (scope || document).querySelectorAll('[data-hira-currency-note]').forEach(function (note) {
      note.hidden = current === BASE;
      if (current !== BASE) note.textContent = String(cfg.note || '').replace(/\[CUR\]/g, current);
    });
  }

  function apply(scope) {
    (scope || document).querySelectorAll('[data-hira-money]').forEach(convertNode);
    fillNotes(scope);
    document.querySelectorAll('[data-hira-currency-select]').forEach(function (select) {
      select.value = current;
    });
  }

  function set(code, opts) {
    if (!rates[code]) code = BASE;
    var changed = code !== current;
    current = code;
    document.documentElement.setAttribute('data-hira-currency', code);
    if (opts && opts.save) store(STORE_KEY, code);
    apply();
    if (changed || (opts && opts.force)) {
      document.dispatchEvent(new CustomEvent('hira:currency', { detail: { code: code } }));
    }
  }

  /* ---------- public API (used by the Design Your Own configurator) ---------- */

  window.HIRA = window.HIRA || {};
  window.HIRA.currency = {
    base: BASE,
    get code() { return current; },
    format: function (egp) { return format(egp, current); },
    set: function (code) { set(code, { save: true }); }
  };

  /* ---------- detection ---------- */

  function detect() {
    var saved = read(STORE_KEY);
    if (saved && rates[saved]) return set(saved);

    // Shopify's country. When it is just the store's own default (a visitor outside
    // every market falls back to it), confirm with Shopify's IP suggestion and the browser.
    var shopify = String(cfg.country || '').toUpperCase();
    if (shopify && shopify !== String(cfg.shopCountry || '').toUpperCase()) return set(currencyFor(shopify));

    var cached = read(DETECT_KEY, true);
    if (cached && rates[cached]) return set(cached);

    var browser = browserCountry();
    set(currencyFor(browser || shopify));

    if (!window.fetch) return;
    fetch((cfg.root || '/') + 'browsing_context_suggestions.json', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var ip = data && data.detected_values && data.detected_values.country && data.detected_values.country.handle;
        var code = currencyFor(ip || browser || shopify);
        store(DETECT_KEY, code, true);
        if (!read(STORE_KEY)) set(code);
      })
      .catch(function () { store(DETECT_KEY, current, true); });
  }

  /* ---------- switcher + re-rendered HTML ---------- */

  document.addEventListener('change', function (event) {
    var select = event.target.closest && event.target.closest('[data-hira-currency-select]');
    if (select) set(select.value, { save: true });
  });

  // The cart drawer, cart page and variant picker swap in fresh HTML from Shopify.
  var queued = false;
  new MutationObserver(function (records) {
    if (queued) return;
    for (var i = 0; i < records.length; i++) {
      if (records[i].addedNodes.length) {
        queued = true;
        requestAnimationFrame(function () { queued = false; apply(); });
        return;
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  detect();
})();
