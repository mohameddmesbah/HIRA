/*
 * HIRA motion: scroll reveals, parallax, magnetic buttons and drag rails.
 * Vanilla JS, no dependencies. Does nothing unless html.hira-motion is set
 * (see snippets/hira-head.liquid), except the rail controls, which always work.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var motionOn = function () {
    return root.classList.contains('hira-motion');
  };
  var fullMotion = function () {
    return root.classList.contains('hira-motion--full');
  };

  /* ---------------------------------------------------------------------
   * Reveals
   * ------------------------------------------------------------------- */

  var revealObserver = null;

  function reveal(el) {
    el.classList.add('is-revealed');
    if (revealObserver) revealObserver.unobserve(el);
  }

  function initReveals(scope) {
    var els = (scope || document).querySelectorAll('[data-hira-reveal]:not(.is-revealed)');
    if (!els.length) return;

    if (!motionOn() || !('IntersectionObserver' in window)) {
      els.forEach(reveal);
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) reveal(entry.target);
          });
        },
        { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
      );
    }

    els.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* ---------------------------------------------------------------------
   * Parallax: [data-hira-parallax="0.15"] moves at a fraction of scroll
   * ------------------------------------------------------------------- */

  var parallaxEls = [];
  var visibleParallax = new Set();
  var ticking = false;
  var parallaxObserver = null;

  function updateParallax() {
    ticking = false;
    var vh = window.innerHeight;
    visibleParallax.forEach(function (el) {
      var speed = parseFloat(el.getAttribute('data-hira-parallax')) || 0.15;
      var rect = el.parentElement.getBoundingClientRect();
      var progress = (rect.top + rect.height / 2 - vh / 2) / vh;
      el.style.transform = 'translate3d(0,' + (progress * speed * -100).toFixed(2) + 'px,0)';
    });
  }

  function requestParallax() {
    if (!ticking && visibleParallax.size) {
      ticking = true;
      window.requestAnimationFrame(updateParallax);
    }
  }

  function initParallax(scope) {
    if (!fullMotion() || !('IntersectionObserver' in window)) return;
    var els = (scope || document).querySelectorAll('[data-hira-parallax]');
    if (!els.length) return;

    if (!parallaxObserver) {
      parallaxObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visibleParallax.add(entry.target);
          else visibleParallax.delete(entry.target);
        });
        requestParallax();
      });
      window.addEventListener('scroll', requestParallax, { passive: true });
      window.addEventListener('resize', requestParallax, { passive: true });
    }

    els.forEach(function (el) {
      if (parallaxEls.indexOf(el) === -1) {
        parallaxEls.push(el);
        parallaxObserver.observe(el);
      }
    });
  }

  /* ---------------------------------------------------------------------
   * Magnetic buttons (fine pointers only)
   * ------------------------------------------------------------------- */

  function initMagnetic() {
    if (!fullMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    document.addEventListener(
      'pointermove',
      function (event) {
        var btn = event.target.closest && event.target.closest('[data-hira-magnetic]');
        if (!btn) return;
        var rect = btn.getBoundingClientRect();
        var x = (event.clientX - rect.left - rect.width / 2) * 0.18;
        var y = (event.clientY - rect.top - rect.height / 2) * 0.3;
        btn.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      },
      { passive: true }
    );

    document.addEventListener(
      'pointerout',
      function (event) {
        var btn = event.target.closest && event.target.closest('[data-hira-magnetic]');
        if (btn && !btn.contains(event.relatedTarget)) btn.style.transform = '';
      },
      { passive: true }
    );
  }

  /* ---------------------------------------------------------------------
   * Rails: prev/next buttons + pointer drag (mouse only; touch scrolls natively)
   * ------------------------------------------------------------------- */

  function initRails(scope) {
    (scope || document).querySelectorAll('[data-hira-rail]').forEach(function (rail) {
      if (rail.dataset.hiraRailReady) return;
      rail.dataset.hiraRailReady = 'true';

      var section = rail.closest('[data-hira-rail-scope]') || rail.parentElement;
      var prev = section.querySelector('[data-hira-rail-prev]');
      var next = section.querySelector('[data-hira-rail-next]');

      function step() {
        var item = rail.querySelector(':scope > li');
        return item ? item.getBoundingClientRect().width + 24 : rail.clientWidth * 0.8;
      }

      function updateButtons() {
        var max = rail.scrollWidth - rail.clientWidth - 2;
        if (prev) prev.disabled = rail.scrollLeft <= 2;
        if (next) next.disabled = rail.scrollLeft >= max;
      }

      if (prev) prev.addEventListener('click', function () {
        rail.scrollBy({ left: -step(), behavior: motionOn() ? 'smooth' : 'auto' });
      });
      if (next) next.addEventListener('click', function () {
        rail.scrollBy({ left: step(), behavior: motionOn() ? 'smooth' : 'auto' });
      });
      rail.addEventListener('scroll', updateButtons, { passive: true });
      window.addEventListener('resize', updateButtons, { passive: true });
      updateButtons();

      var startX = 0;
      var startScroll = 0;
      var moved = false;
      var pointerId = null;

      rail.addEventListener('pointerdown', function (event) {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startScroll = rail.scrollLeft;
        moved = false;
      });

      rail.addEventListener('pointermove', function (event) {
        if (pointerId !== event.pointerId) return;
        var dx = event.clientX - startX;
        if (!moved && Math.abs(dx) > 6) {
          moved = true;
          rail.classList.add('is-dragging');
          rail.setPointerCapture(pointerId);
        }
        if (moved) rail.scrollLeft = startScroll - dx;
      });

      function endDrag() {
        if (pointerId === null) return;
        pointerId = null;
        if (moved) {
          // Let the click that follows a drag pass without navigating.
          setTimeout(function () {
            rail.classList.remove('is-dragging');
          }, 0);
        }
      }

      rail.addEventListener('pointerup', endDrag);
      rail.addEventListener('pointercancel', endDrag);
      rail.addEventListener('dragstart', function (event) {
        event.preventDefault();
      });
    });
  }

  /* ---------------------------------------------------------------------
   * Boot + theme editor support
   * ------------------------------------------------------------------- */

  function init(scope) {
    initReveals(scope);
    initParallax(scope);
    initRails(scope);
  }

  function pauseVideos(scope) {
    if (motionOn()) return;
    (scope || document).querySelectorAll('[data-hira-autoplay] video').forEach(function (video) {
      video.removeAttribute('autoplay');
      video.pause();
    });
  }

  function boot() {
    init(document);
    pauseVideos(document);
    initMagnetic();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Re-run when the theme editor re-renders a section; show content at once.
  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
    pauseVideos(event.target);
    event.target.querySelectorAll('[data-hira-reveal]').forEach(reveal);
  });

  document.addEventListener('shopify:block:select', function (event) {
    var host = event.target.closest('.shopify-section') || event.target;
    host.querySelectorAll('[data-hira-reveal]').forEach(reveal);
  });

  window.HIRA = window.HIRA || {};
  window.HIRA.initMotion = init;
})();
