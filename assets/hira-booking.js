/*
 * HIRA booking: Cal.com popup + inline embed.
 *
 * Booking buttons are plain links to the Cal.com page (see snippets/hira-button.liquid),
 * so they always work. This script upgrades them to a Cal.com popup and loads
 * Cal's embed script only when a visitor shows intent (hover, focus, click) or
 * an inline embed scrolls near the viewport. If Cal.com cannot load, the visitor
 * is sent to the booking link instead.
 */
(function () {
  'use strict';

  var config = (window.HIRA && window.HIRA.booking) || {};
  var NS_POPUP = 'hira';
  var inlineCount = 0;
  var state = { requested: false, failed: false, namespaces: {} };

  function parseLink(raw) {
    if (!raw) return null;
    var value = String(raw).trim();
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value.replace(/^\/+/, '');
    try {
      var url = new URL(value);
      var calLink = url.pathname.replace(/^\/+|\/+$/g, '');
      if (!calLink) return null;
      var hosted = /(^|\.)cal\.com$/i.test(url.hostname);
      var origin = hosted ? 'https://app.cal.com' : url.origin;
      return {
        href: url.href,
        calLink: calLink + url.search,
        origin: origin,
        embedSrc: (hosted ? 'https://app.cal.com' : url.origin) + '/embed/embed.js',
      };
    } catch (e) {
      return null;
    }
  }

  function brandUi() {
    var accent = config.accent || '#8E5BD0';
    return {
      theme: config.theme === 'light' ? 'light' : 'dark',
      hideEventTypeDetails: false,
      layout: 'month_view',
      cssVarsPerTheme: {
        light: { 'cal-brand': accent },
        dark: { 'cal-brand': accent },
      },
    };
  }

  /* Cal.com's official embed bootstrap (queues calls until embed.js loads). */
  function installCal(embedSrc) {
    (function (C, A, L) {
      var p = function (a, ar) {
        a.q.push(ar);
      };
      var d = C.document;
      C.Cal =
        C.Cal ||
        function () {
          var cal = C.Cal;
          var ar = arguments;
          if (!cal.loaded) {
            cal.ns = {};
            cal.q = cal.q || [];
            var s = d.createElement('script');
            s.src = A;
            s.async = true;
            s.addEventListener('error', function () {
              state.failed = true;
              document.dispatchEvent(new CustomEvent('hira:booking-failed'));
            });
            d.head.appendChild(s);
            cal.loaded = true;
          }
          if (ar[0] === L) {
            var api = function () {
              p(api, arguments);
            };
            var namespace = ar[1];
            api.q = api.q || [];
            if (typeof namespace === 'string') {
              cal.ns[namespace] = cal.ns[namespace] || api;
              p(cal.ns[namespace], ar);
              p(cal, ['initNamespace', namespace]);
            } else p(cal, ar);
            return;
          }
          p(cal, ar);
        };
    })(window, embedSrc, 'init');
  }

  function ensureNamespace(ns, link) {
    if (!link) return null;
    if (!state.requested) {
      state.requested = true;
      installCal(link.embedSrc);
    }
    if (!state.namespaces[ns]) {
      window.Cal('init', ns, { origin: link.origin });
      window.Cal.ns[ns]('ui', brandUi());
      state.namespaces[ns] = true;
    }
    return window.Cal.ns[ns];
  }

  /* ---------------------------------------------------------------------
   * Popup buttons
   * ------------------------------------------------------------------- */

  var popupLink = parseLink(config.link);
  var activeButton = null;

  function clearLoading() {
    if (activeButton) {
      activeButton.classList.remove('is-loading');
      activeButton.removeAttribute('aria-busy');
      activeButton = null;
    }
  }

  function warmUp() {
    var api = ensureNamespace(NS_POPUP, popupLink);
    if (api && !warmUp.bound) {
      warmUp.bound = true;
      api('on', { action: 'linkReady', callback: clearLoading });
      api('on', {
        action: 'linkFailed',
        callback: function () {
          clearLoading();
          window.location.href = popupLink.href;
        },
      });
    }
    return api;
  }

  document.addEventListener('click', function (event) {
    var btn = event.target.closest && event.target.closest('[data-hira-book]');
    if (!btn) return;
    // Respect "open in new tab" gestures.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

    var link = parseLink(btn.getAttribute('href')) || popupLink;
    if (!link || state.failed) return; // native link to Cal.com

    event.preventDefault();
    popupLink = link;
    var api = warmUp();
    if (!api) {
      window.location.href = link.href;
      return;
    }

    activeButton = btn;
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
    setTimeout(clearLoading, 6000);

    api('modal', { calLink: link.calLink, config: { layout: 'month_view', theme: brandUi().theme } });
  });

  ['pointerenter', 'focusin', 'touchstart'].forEach(function (type) {
    document.addEventListener(
      type,
      function (event) {
        if (event.target.closest && event.target.closest('[data-hira-book]')) warmUp();
      },
      { capture: true, passive: true }
    );
  });

  document.addEventListener('hira:booking-failed', function () {
    if (activeButton && popupLink) window.location.href = popupLink.href;
    clearLoading();
  });

  /* ---------------------------------------------------------------------
   * Inline embeds: <div data-hira-cal-inline data-cal-link="..."></div>
   * ------------------------------------------------------------------- */

  function mountInline(el) {
    if (el.dataset.hiraMounted) return;
    var link = parseLink(el.getAttribute('data-cal-link') || config.link);
    if (!link) return;
    el.dataset.hiraMounted = 'true';
    if (!el.id) el.id = 'hira-cal-' + Math.random().toString(36).slice(2, 9);

    // One namespace per inline embed, so a re-rendered section mounts cleanly.
    inlineCount += 1;
    var api = ensureNamespace('hira-inline-' + inlineCount, link);
    api('on', {
      action: 'linkReady',
      callback: function () {
        el.classList.add('is-ready');
      },
    });
    api('inline', {
      elementOrSelector: '#' + el.id,
      calLink: link.calLink,
      config: { layout: 'month_view', theme: brandUi().theme },
    });
  }

  function initInline(scope) {
    var els = (scope || document).querySelectorAll('[data-hira-cal-inline]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(mountInline);
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            io.unobserve(entry.target);
            mountInline(entry.target);
          }
        });
      },
      { rootMargin: '400px 0px' }
    );
    els.forEach(function (el) {
      io.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initInline(document);
    });
  } else {
    initInline(document);
  }

  document.addEventListener('shopify:section:load', function (event) {
    initInline(event.target);
  });
})();
