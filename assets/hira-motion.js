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

  // Two triggers, so a reveal can never be missed: an IntersectionObserver
  // plus a rAF-throttled position check on scroll/resize/load. The check also
  // reveals anything already scrolled past (fast flicks on phones).
  var observers = {};
  var pending = new Set();
  var checkQueued = false;
  var listening = false;

  // How far down the viewport (0-1) an element's top must come before it
  // reveals. Story chapters use a later point (data-hira-reveal-at) so their
  // slide is seen, not finished before the reader gets there.
  function revealAt(el) {
    var at = parseFloat(el.getAttribute('data-hira-reveal-at'));
    return at > 0 && at <= 1 ? at : 0.94;
  }

  function reveal(el) {
    if (!pending.has(el) && el.classList.contains('is-revealed')) return;
    pending.delete(el);
    Object.keys(observers).forEach(function (key) {
      observers[key].unobserve(el);
    });
    // Add the class on the next frame so the hidden start state has been
    // painted and the transition always runs (never a jump to the end state).
    window.requestAnimationFrame(function () {
      el.classList.add('is-revealed');
    });
  }

  function revealNow(el) {
    pending.delete(el);
    el.classList.add('is-revealed');
  }

  function observerFor(at) {
    var key = String(at);
    if (!observers[key]) {
      observers[key] = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) reveal(entry.target);
          });
        },
        { rootMargin: '0px 0px -' + Math.round((1 - at) * 100) + '% 0px', threshold: 0 }
      );
    }
    return observers[key];
  }

  function shouldReveal(el) {
    var rect = el.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    return rect.top < vh * revealAt(el) || rect.bottom <= 0;
  }

  function checkPending() {
    checkQueued = false;
    pending.forEach(function (el) {
      if (!el.isConnected) pending.delete(el);
      else if (shouldReveal(el)) reveal(el);
    });
  }

  function queueCheck() {
    if (!checkQueued && pending.size) {
      checkQueued = true;
      window.requestAnimationFrame(checkPending);
    }
  }

  function initReveals(scope) {
    var els = (scope || document).querySelectorAll('[data-hira-reveal]:not(.is-revealed)');
    if (!els.length) return;

    if (!motionOn()) {
      els.forEach(revealNow);
      return;
    }

    if (!listening) {
      listening = true;
      ['scroll', 'resize', 'orientationchange', 'load', 'pageshow'].forEach(function (type) {
        window.addEventListener(type, queueCheck, { passive: true });
      });
      document.addEventListener('scroll', queueCheck, { passive: true, capture: true });
    }

    els.forEach(function (el) {
      pending.add(el);
      if ('IntersectionObserver' in window) observerFor(revealAt(el)).observe(el);
    });

    // Measuring first makes the browser commit the hidden state, so elements
    // already in view still animate in on load instead of popping in.
    checkPending();
  }

  /* ---------------------------------------------------------------------
   * Product cards: second image on touch devices
   * Press on the card image shows image 2 (a tap still opens the product);
   * a horizontal swipe on the image toggles image 1 / 2 without opening it.
   * Swipes inside a scrolling rail are left to the rail.
   * ------------------------------------------------------------------- */

  function initCardTouch() {
    var card = null;
    var startX = 0;
    var startY = 0;
    var swiped = false;
    var suppressClick = null;

    function hasSecondImage(el) {
      return !!el.querySelector('.card__media .media--hover-effect > img + img');
    }

    function inMedia(el, x, y) {
      var media = el.querySelector('.card__media');
      if (!media) return false;
      var r = media.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    function setShown(el, shown) {
      el.classList.toggle('hira-alt-shown', shown);
    }

    function release(el) {
      if (el && el.dataset.hiraAltSticky !== 'true') setShown(el, false);
    }

    document.addEventListener(
      'touchstart',
      function (event) {
        if (event.touches.length !== 1) return;
        var el = event.target.closest && event.target.closest('.card-wrapper');
        if (!el || !hasSecondImage(el)) return;
        var t = event.touches[0];
        if (!inMedia(el, t.clientX, t.clientY)) return;
        card = el;
        startX = t.clientX;
        startY = t.clientY;
        swiped = false;
        setShown(card, true);
      },
      { passive: true }
    );

    document.addEventListener(
      'touchmove',
      function (event) {
        if (!card || swiped) return;
        var t = event.touches[0];
        var dx = t.clientX - startX;
        var dy = t.clientY - startY;
        var horizontal = Math.abs(dx) > Math.abs(dy) * 1.5;
        var inRail = !!card.closest('[data-hira-rail]');

        if (Math.abs(dx) > 30 && horizontal && !inRail) {
          swiped = true;
          var showSecond = dx < 0;
          card.dataset.hiraAltSticky = String(showSecond);
          setShown(card, showSecond);
          suppressClick = card;
          setTimeout(function () {
            suppressClick = null;
          }, 600);
        } else if ((Math.abs(dy) > 10 && !horizontal) || (inRail && Math.abs(dx) > 10)) {
          // Scrolling the page or a rail: not a press on the image.
          release(card);
          card = null;
        }
      },
      { passive: true }
    );

    document.addEventListener(
      'touchend',
      function () {
        if (!card) return;
        var el = card;
        card = null;
        // A tap opens the product with image 2 showing; if the page does not
        // navigate (e.g. long press), return to image 1 shortly after.
        if (!swiped) setTimeout(function () { release(el); }, 1200);
      },
      { passive: true }
    );

    document.addEventListener(
      'touchcancel',
      function () {
        release(card);
        card = null;
      },
      { passive: true }
    );

    document.addEventListener(
      'click',
      function (event) {
        if (suppressClick && suppressClick.contains(event.target)) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick = null;
        }
      },
      true
    );

    // Coming back with the back button: show image 1 again (unless swiped).
    window.addEventListener('pageshow', function () {
      document.querySelectorAll('.card-wrapper.hira-alt-shown').forEach(release);
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
    initCardTouch();
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
    event.target.querySelectorAll('[data-hira-reveal]').forEach(revealNow);
  });

  document.addEventListener('shopify:block:select', function (event) {
    var host = event.target.closest('.shopify-section') || event.target;
    host.querySelectorAll('[data-hira-reveal]').forEach(revealNow);
  });

  window.HIRA = window.HIRA || {};
  window.HIRA.initMotion = init;
})();
