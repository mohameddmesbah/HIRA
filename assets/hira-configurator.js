/*
 * HIRA "Design your own" configurator.
 * Live layered-SVG preview, step-by-step choices, estimated price, PNG export
 * (Web Share API on phones, download elsewhere), WhatsApp order message and a
 * silent email copy through Shopify's contact form. Vanilla JS, no build step.
 */
(function () {
  'use strict';

  var OPENINGS = { wide: 'One wide', eyes: 'Two eyes' };
  var MOUTHS = { none: 'None', simple: 'Simple opening', teeth: 'Teeth' };
  var EARS = { none: 'None', bear: 'Bear ears', bunny: 'Big bunny ears', horns: 'Horns', cat: 'Cat ears' };
  var EAR_PRICE = { bear: 'small_ears', cat: 'small_ears', bunny: 'bunny', horns: 'horns' };
  var ACCESSORIES = {
    chain: { label: 'Silver chain', price: 'chain' },
    rings: { label: 'Metal rings', price: 'accessory' },
    crystals: { label: 'Red crystals', price: 'accessory' },
    charms: { label: 'Heart & bow charms', price: 'accessory' },
    stars: { label: 'Stars', price: 'accessory' },
    hearts: { label: 'Hearts', price: 'accessory' },
    pearls: { label: 'Pearls / beads', price: 'accessory' }
  };
  var MAX_STRIPES = 8;
  var ACC_ORDER = ['chain', 'rings', 'crystals', 'charms', 'stars', 'hearts', 'pearls'];
  var DEFAULT_COLORS = [
    { name: 'Brown', hex: '#6B4632' }, { name: 'Beige', hex: '#D9C3A5' }, { name: 'Black', hex: '#1A1A1C' },
    { name: 'Blue', hex: '#2F4F8F' }, { name: 'Pink', hex: '#E8A3B8' }, { name: 'White', hex: '#F2EFEA' },
    { name: 'Orange', hex: '#E07A2E' }
  ];
  var SVGNS = 'http://www.w3.org/2000/svg';

  /* ---------- colour helpers ---------- */

  function hexToRgb(hex) {
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(rgb) {
    return '#' + rgb.map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  function mix(hex, withHex, amount) {
    var a = hexToRgb(hex), b = hexToRgb(withHex);
    return rgbToHex(a.map(function (v, i) { return v + (b[i] - v) * amount; }));
  }

  function luminance(hex) {
    var c = hexToRgb(hex);
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  }

  function formatNumber(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* ---------- configurator ---------- */

  function Configurator(root) {
    this.root = root;
    var config = {};
    try {
      config = JSON.parse(root.querySelector('[data-cfg-config]').textContent);
    } catch (e) { /* use defaults */ }
    this.colors = (config.colors && config.colors.length ? config.colors : DEFAULT_COLORS).map(function (c, i) {
      return { id: i, name: c.name || 'Color ' + (i + 1), hex: c.hex || '#888888' };
    });
    this.prices = config.prices || {};
    this.usdRate = +config.usdRate > 0 ? +config.usdRate : 56;
    this.whatsapp = String(config.whatsapp || '').replace(/\D/g, '');

    var white = this.findColor('white');
    this.state = {
      base: 0,
      opening: 'eyes',
      mouth: 'none',
      ears: 'none',
      earOuter: null, // null = follow the base colour
      earInner: white ? white.id : null,
      acc: {},
      stripes: 0,
      stripeColor: white ? white.id : 0,
      accent: null
    };
    this.step = 1;
    this.steps = root.querySelectorAll('.hira-cfg__step');
    this.total = this.steps.length;
    this.svg = root.querySelector('[data-cfg-svg]');
    this.pngBlob = null;
    this.pngTimer = null;

    this.buildSwatches();
    this.fillPriceTags();
    this.buildChain();
    this.buildPearls();
    this.bind();
    this.render();
    this.goTo(1, true);
  }

  Configurator.prototype.findColor = function (name) {
    var n = String(name).toLowerCase();
    for (var i = 0; i < this.colors.length; i++) {
      if (this.colors[i].name.toLowerCase() === n) return this.colors[i];
    }
    return null;
  };

  Configurator.prototype.color = function (id) {
    return this.colors[id] || this.colors[0];
  };

  Configurator.prototype.buildSwatches = function () {
    var self = this;
    this.root.querySelectorAll('[data-swatches]').forEach(function (wrap) {
      var group = wrap.getAttribute('data-swatches');
      var name = 'cfg-' + group;
      var html = '';
      if (group === 'accent') {
        html += '<label class="hira-cfg__swatch hira-cfg__swatch--none"><input type="radio" name="' + name + '" value="" checked>' +
          '<span class="hira-cfg__chip" aria-hidden="true"></span><span class="hira-cfg__swatch-name">None</span></label>';
      }
      self.colors.forEach(function (c) {
        html += '<label class="hira-cfg__swatch"><input type="radio" name="' + name + '" value="' + c.id + '">' +
          '<span class="hira-cfg__chip" style="--chip:' + c.hex + '" aria-hidden="true"></span>' +
          '<span class="hira-cfg__swatch-name">' + c.name.replace(/</g, '&lt;') + '</span></label>';
      });
      wrap.innerHTML = html;
      wrap.setAttribute('role', 'radiogroup');
    });
    this.syncSwatches();
  };

  Configurator.prototype.syncSwatches = function () {
    var s = this.state;
    var values = {
      base: s.base,
      earOuter: s.earOuter === null ? s.base : s.earOuter,
      earInner: s.earInner === null ? '' : s.earInner,
      stripe: s.stripeColor,
      accent: s.accent === null ? '' : s.accent
    };
    Object.keys(values).forEach(function (group) {
      this.root.querySelectorAll('input[name="cfg-' + group + '"]').forEach(function (input) {
        input.checked = String(input.value) === String(values[group]);
      });
    }, this);
  };

  // Chain links and pearls are laid out along hidden guide paths.
  Configurator.prototype.alongPaths = function (selector, spacing, draw) {
    this.svg.querySelectorAll(selector).forEach(function (path) {
      var length = path.getTotalLength();
      var count = Math.floor(length / spacing);
      for (var i = 0; i <= count; i++) {
        var d = (i / count) * length;
        var p = path.getPointAtLength(d);
        var q = path.getPointAtLength(Math.min(length, d + 1));
        var angle = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
        draw(p, angle, i);
      }
    });
  };

  Configurator.prototype.buildChain = function () {
    var holder = this.svg.querySelector('[data-chain-links]');
    if (!holder) return;
    var silver = this.svg.querySelector('linearGradient[id^="silver-"]');
    var stroke = silver ? 'url(#' + silver.id + ')' : '#c9ccd3';
    this.alongPaths('[data-chain-path]', 9, function (p, angle, i) {
      var link = document.createElementNS(SVGNS, 'ellipse');
      link.setAttribute('cx', p.x.toFixed(1));
      link.setAttribute('cy', p.y.toFixed(1));
      link.setAttribute('rx', i % 2 ? '5.5' : '6.5');
      link.setAttribute('ry', i % 2 ? '2.4' : '3.6');
      link.setAttribute('transform', 'rotate(' + angle.toFixed(1) + ' ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')');
      link.setAttribute('fill', 'none');
      link.setAttribute('stroke', stroke);
      link.setAttribute('stroke-width', '2.2');
      holder.appendChild(link);
    });
  };

  Configurator.prototype.buildPearls = function () {
    var holder = this.svg.querySelector('[data-pearls]');
    if (!holder) return;
    this.alongPaths('[data-pearl-path]', 13, function (p) {
      var pearl = document.createElementNS(SVGNS, 'circle');
      pearl.setAttribute('cx', p.x.toFixed(1));
      pearl.setAttribute('cy', p.y.toFixed(1));
      pearl.setAttribute('r', '5.6');
      holder.appendChild(pearl);
    });
  };

  Configurator.prototype.bind = function () {
    var self = this;
    var form = this.root.querySelector('[data-cfg-form]');

    form.addEventListener('change', function (event) {
      var t = event.target;
      var s = self.state;
      if (t.name === 'cfg-base') {
        s.base = +t.value;
      } else if (t.name === 'cfg-earOuter') {
        s.earOuter = +t.value === s.base ? null : +t.value;
      } else if (t.name === 'cfg-earInner') {
        s.earInner = +t.value;
      } else if (t.name === 'cfg-stripe') {
        s.stripeColor = +t.value;
      } else if (t.name === 'mouth') {
        s.mouth = t.value;
      } else if (t.name === 'cfg-accent') {
        s.accent = t.value === '' ? null : +t.value;
      } else if (t.name === 'opening') {
        s.opening = t.value;
      } else if (t.name === 'ears') {
        s.ears = t.value;
      } else if (t.name === 'acc') {
        s.acc[t.value] = t.checked;
      } else {
        return;
      }
      self.render();
    });

    form.addEventListener('input', function (event) {
      if (event.target.closest('.hira-cfg__field')) self.clearError(event.target);
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
    });

    this.root.querySelector('[data-cfg-next]').addEventListener('click', function () {
      self.goTo(self.step + 1);
    });
    this.root.querySelector('[data-cfg-back]').addEventListener('click', function () {
      self.goTo(self.step - 1);
    });
    this.root.querySelectorAll('[data-cfg-progress] li').forEach(function (li, i) {
      li.addEventListener('click', function () {
        if (i + 1 <= self.maxStep) self.goTo(i + 1);
      });
    });
    var stepStripes = function (delta) {
      self.state.stripes = Math.max(0, Math.min(MAX_STRIPES, self.state.stripes + delta));
      self.render();
    };
    this.root.querySelector('[data-stripes-minus]').addEventListener('click', function () { stepStripes(-1); });
    this.root.querySelector('[data-stripes-plus]').addEventListener('click', function () { stepStripes(1); });
    this.root.querySelector('[data-cfg-save]').addEventListener('click', function () {
      self.save();
    });
    this.root.querySelector('[data-cfg-send]').addEventListener('click', function () {
      self.send();
    });
  };

  Configurator.prototype.goTo = function (step, initial) {
    step = Math.max(1, Math.min(this.total, step));
    this.step = step;
    this.maxStep = Math.max(this.maxStep || 1, step);
    this.steps.forEach(function (el) {
      var on = +el.getAttribute('data-step') === step;
      el.hidden = !on;
      el.classList.toggle('is-active', on);
    });
    this.root.querySelectorAll('[data-cfg-progress] li').forEach(function (li, i) {
      li.classList.toggle('is-done', i + 1 < step);
      li.classList.toggle('is-current', i + 1 === step);
      li.classList.toggle('is-reachable', i + 1 <= this.maxStep);
      if (i + 1 === step) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    }, this);
    var back = this.root.querySelector('[data-cfg-back]');
    var next = this.root.querySelector('[data-cfg-next]');
    back.hidden = step === 1;
    next.hidden = step === this.total;
    if (!initial) {
      var legend = this.steps[step - 1].querySelector('legend');
      var panel = this.root.querySelector('.hira-cfg__panel');
      var rect = panel.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight * 0.6) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (legend) {
        legend.setAttribute('tabindex', '-1');
        legend.focus({ preventScroll: true });
      }
    }
  };

  /* ---------- rendering ---------- */

  Configurator.prototype.resolved = function () {
    var s = this.state;
    var base = this.color(s.base);
    var accent = s.accent === null ? null : this.color(s.accent);
    var earOuter = this.color(s.earOuter === null ? s.base : s.earOuter);
    var earInner = s.earInner === null ? { name: 'White', hex: '#F2EFEA' } : this.color(s.earInner);
    return { base: base, accent: accent, earOuter: earOuter, earInner: earInner };
  };

  Configurator.prototype.render = function () {
    var s = this.state;
    var c = this.resolved();
    var dark = luminance(c.base.hex) < 0.25;
    var vars = {
      '--c-base': c.base.hex,
      '--c-base-dark': mix(c.base.hex, dark ? '#ffffff' : '#000000', dark ? 0.08 : 0.22),
      '--c-trim': c.accent ? c.accent.hex : mix(c.base.hex, dark ? '#ffffff' : '#000000', dark ? 0.2 : 0.3),
      '--c-ear-outer': c.earOuter.hex,
      '--c-ear-inner': c.earInner.hex,
      '--c-charm': c.accent ? c.accent.hex : '#e8a3b8',
      '--c-star': c.accent ? c.accent.hex : '#f6f1ff',
      '--c-heart': c.accent ? c.accent.hex : '#e0457b'
    };
    Object.keys(vars).forEach(function (k) {
      this.svg.style.setProperty(k, vars[k]);
    }, this);

    var on = {
      'open-wide': s.opening === 'wide',
      'open-eyes': s.opening === 'eyes',
      'mouth-simple': s.mouth === 'simple',
      'mouth-teeth': s.mouth === 'teeth',
      'ears-bear': s.ears === 'bear',
      'ears-cat': s.ears === 'cat',
      'ears-bunny': s.ears === 'bunny',
      'ears-horns': s.ears === 'horns'
    };
    ACC_ORDER.forEach(function (k) { on['acc-' + k] = !!s.acc[k]; });
    this.svg.querySelectorAll('[data-layer]').forEach(function (g) {
      g.setAttribute('data-on', on[g.getAttribute('data-layer')] ? 'true' : 'false');
    });

    // Ear colour pickers: shown once ears are chosen; horns use the outer colour only.
    var earColors = this.root.querySelector('[data-ear-colors]');
    earColors.hidden = s.ears === 'none';
    this.root.querySelector('[data-ear-inner-wrap]').hidden = s.ears === 'horns';
    this.root.querySelector('[data-ear-outer-label]').textContent = s.ears === 'horns' ? 'Horn color' : 'Ear outer color';

    // Side stripes: count, stepper state and colour picker.
    this.drawStripes();
    this.root.querySelector('[data-stripes-value]').textContent = s.stripes;
    this.root.querySelector('[data-stripes-minus]').disabled = s.stripes <= 0;
    this.root.querySelector('[data-stripes-plus]').disabled = s.stripes >= MAX_STRIPES;
    this.root.querySelector('[data-stripe-color]').hidden = s.stripes === 0;

    this.syncSwatches();
    this.renderPrice();
    this.queuePng();
  };

  // Stripes run down the sides of the head, following its contour; they
  // alternate left / right (an odd count puts the extra one on the left).
  Configurator.prototype.drawStripes = function () {
    var holder = this.svg.querySelector('[data-stripes]');
    if (!holder) return;
    var s = this.state;
    var color = this.color(s.stripeColor).hex;
    while (holder.firstChild) holder.removeChild(holder.firstChild);
    var left = Math.ceil(s.stripes / 2);
    var right = Math.floor(s.stripes / 2);
    var make = function (k, mirror) {
      var o = 16 + k * 15;
      var d = 'M' + (96 + o) + ' 86 C' + (64 + o) + ' 150 ' + (60 + o) + ' 282 ' + (110 + o) + ' 372';
      var path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-width', '7');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('style', 'stroke: ' + color);
      if (mirror) path.setAttribute('transform', 'translate(400 0) scale(-1 1)');
      holder.appendChild(path);
    };
    for (var i = 0; i < left; i++) make(i, false);
    for (var j = 0; j < right; j++) make(j, true);
  };

  Configurator.prototype.fillPriceTags = function () {
    var prices = this.prices;
    this.root.querySelectorAll('[data-price-tag]').forEach(function (el) {
      var v = +prices[el.getAttribute('data-price-tag')] || 0;
      el.textContent = '+' + formatNumber(v) + ' EGP' + (el.getAttribute('data-price-suffix') || '');
    });
  };

  // Every priced selection as a line item: { label, egp }.
  Configurator.prototype.lineItems = function () {
    var s = this.state;
    var p = this.prices;
    var c = this.resolved();
    var price = function (key) { return +p[key] || 0; };
    var items = [{ label: 'Base custom mask', egp: price('base') }];
    if (s.mouth !== 'none') {
      items.push({ label: 'Mouth (' + MOUTHS[s.mouth] + ')', egp: price(s.mouth === 'teeth' ? 'mouth_teeth' : 'mouth_simple') });
    }
    if (s.ears !== 'none') items.push({ label: EARS[s.ears], egp: price(EAR_PRICE[s.ears]) });
    if (s.stripes > 0) {
      items.push({
        label: 'Side stripes x' + s.stripes + ' (' + this.color(s.stripeColor).name + ', ' + formatNumber(price('stripe')) + ' EGP each)',
        egp: s.stripes * price('stripe')
      });
    }
    ACC_ORDER.forEach(function (k) {
      if (s.acc[k]) items.push({ label: ACCESSORIES[k].label, egp: price(ACCESSORIES[k].price) });
    });
    if (c.accent) items.push({ label: 'Accent color (' + c.accent.name + ')', egp: price('accent') });
    return items;
  };

  Configurator.prototype.price = function () {
    var egp = this.lineItems().reduce(function (sum, item) { return sum + item.egp; }, 0);
    return { egp: egp, usd: Math.round(egp / this.usdRate) };
  };

  Configurator.prototype.renderPrice = function () {
    var price = this.price();
    this.root.querySelector('[data-cfg-egp]').textContent = formatNumber(price.egp);
    this.root.querySelector('[data-cfg-usd]').textContent = formatNumber(price.usd);
    var list = this.root.querySelector('[data-cfg-breakdown]');
    if (list) {
      list.innerHTML = this.lineItems().map(function (item, i) {
        var value = (i === 0 ? '' : '+') + formatNumber(item.egp) + ' EGP';
        return '<li><span>' + item.label.replace(/</g, '&lt;') + '</span><span>' + value + '</span></li>';
      }).join('');
    }
  };

  /* ---------- summary / message ---------- */

  Configurator.prototype.summary = function () {
    var s = this.state;
    var c = this.resolved();
    var ears = EARS[s.ears];
    if (s.ears === 'horns') ears += ' (color: ' + c.earOuter.name + ')';
    else if (s.ears !== 'none') ears += ' (outer: ' + c.earOuter.name + ', inner: ' + c.earInner.name + ')';
    var acc = ACC_ORDER.filter(function (k) { return s.acc[k]; }).map(function (k) { return ACCESSORIES[k].label; });
    return {
      base: c.base.name,
      openings: OPENINGS[s.opening],
      mouth: MOUTHS[s.mouth],
      stripes: s.stripes ? s.stripes + ' (' + this.color(s.stripeColor).name + ')' : 'None',
      ears: ears,
      accessories: acc.length ? acc.join(', ') : 'None',
      accent: c.accent ? c.accent.name : 'None'
    };
  };

  Configurator.prototype.details = function () {
    var form = this.root.querySelector('[data-cfg-form]');
    var get = function (n) { return (form.elements[n] && form.elements[n].value || '').trim(); };
    return {
      name: get('name'),
      whatsapp: get('whatsapp'),
      country: get('country'),
      city: get('city'),
      head: get('head'),
      email: get('email'),
      notes: get('notes')
    };
  };

  Configurator.prototype.message = function () {
    var d = this.details();
    var sm = this.summary();
    var price = this.price();
    var priced = this.lineItems().map(function (item, i) {
      return '- ' + item.label + ': ' + (i === 0 ? '' : '+') + formatNumber(item.egp) + ' EGP';
    });
    return [
      'NEW CUSTOM ORDER - HIRA',
      '',
      'Name: ' + d.name,
      'WhatsApp: ' + d.whatsapp,
      'Country: ' + d.country,
      'City: ' + d.city,
      '',
      'Base color: ' + sm.base,
      'Eye openings: ' + sm.openings,
      'Mouth: ' + sm.mouth,
      'Ears: ' + sm.ears,
      'Side stripes: ' + sm.stripes,
      'Accessories: ' + sm.accessories,
      'Accent color: ' + sm.accent,
      '',
      'Head circumference: ' + d.head + ' cm',
      'Notes: ' + (d.notes || '-'),
      '',
      'Price breakdown:'
    ].concat(priced, [
      '',
      'Estimated price: ' + formatNumber(price.egp) + ' EGP (~$' + formatNumber(price.usd) + ')',
      '',
      "(I'll attach my design image in this chat)"
    ]).join('\n');
  };

  /* ---------- validation ---------- */

  Configurator.prototype.setError = function (input, show) {
    var field = input.closest('.hira-cfg__field');
    if (field) field.classList.toggle('has-error', show);
    input.setAttribute('aria-invalid', show ? 'true' : 'false');
    var msg = this.root.querySelector('[data-error-for="' + input.name + '"]');
    if (msg) {
      if (!msg.id) msg.id = 'cfg-err-' + input.name + '-' + Math.random().toString(36).slice(2, 7);
      if (show) input.setAttribute('aria-describedby', msg.id);
      else input.removeAttribute('aria-describedby');
    }
  };

  Configurator.prototype.clearError = function (input) {
    if (input.getAttribute('aria-invalid') === 'true') this.setError(input, false);
  };

  Configurator.prototype.validate = function () {
    var form = this.root.querySelector('[data-cfg-form]');
    var d = this.details();
    var checks = {
      name: d.name.length >= 2,
      whatsapp: /^\+?[\d\s\-()]{8,}$/.test(d.whatsapp) && d.whatsapp.replace(/\D/g, '').length >= 8,
      country: d.country.length >= 2,
      city: d.city.length >= 2,
      head: +d.head >= 35 && +d.head <= 75,
      email: !d.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)
    };
    var firstInvalid = null;
    Object.keys(checks).forEach(function (name) {
      var input = form.elements[name];
      this.setError(input, !checks[name]);
      if (!checks[name] && !firstInvalid) firstInvalid = input;
    }, this);
    if (firstInvalid) {
      if (this.step !== this.total) this.goTo(this.total);
      firstInvalid.focus();
      return false;
    }
    return true;
  };

  /* ---------- actions ---------- */

  Configurator.prototype.status = function (text) {
    var el = this.root.querySelector('[data-cfg-status]');
    el.textContent = text || '';
  };

  Configurator.prototype.send = function () {
    if (!this.validate()) {
      this.status('Please complete the required details.');
      return;
    }
    var text = this.message();
    var url = 'https://wa.me/' + this.whatsapp + '?text=' + encodeURIComponent(text);

    // Email copy first (keepalive lets it finish even as the page hands off to WhatsApp).
    this.emailCopy(text);

    // Open WhatsApp synchronously inside the click so it is never blocked as a popup.
    // ('noopener' in the features would make window.open return null, so clear opener instead.)
    var win = window.open(url, '_blank');
    if (win) win.opener = null;
    else window.location.href = url;
    this.status('WhatsApp is opening with your order. Attach your saved design image in the chat.');
  };

  Configurator.prototype.emailCopy = function (text) {
    var form = document.getElementById('HiraCfgContact');
    if (!form || !window.fetch) return;
    var d = this.details();
    form.querySelector('[name="contact[name]"]').value = d.name;
    // Shopify's contact form requires an email; use a clearly-marked placeholder if none was given.
    form.querySelector('[name="contact[email]"]').value = d.email || 'no-email-given@example.com';
    form.querySelector('[name="contact[phone]"]').value = d.whatsapp;
    form.querySelector('[name="contact[body]"]').value = text;
    try {
      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        credentials: 'same-origin',
        keepalive: true,
        headers: { Accept: 'text/html' }
      }).catch(function () {});
    } catch (e) { /* best effort */ }
  };

  /* ---------- PNG export ---------- */

  Configurator.prototype.queuePng = function () {
    var self = this;
    this.pngBlob = null;
    clearTimeout(this.pngTimer);
    this.pngTimer = setTimeout(function () {
      self.renderPng().then(function (blob) {
        self.pngBlob = blob;
      }).catch(function () {});
    }, 350);
  };

  // Clone the SVG with every CSS variable resolved and hidden layers removed,
  // so it renders the same as a standalone image.
  Configurator.prototype.svgMarkup = function () {
    var clone = this.svg.cloneNode(true);
    var styles = this.svg.style;
    clone.querySelectorAll('[data-on="false"]').forEach(function (el) { el.remove(); });
    clone.querySelectorAll('[data-on]').forEach(function (el) { el.removeAttribute('class'); });
    clone.removeAttribute('style');
    clone.setAttribute('width', '800');
    clone.setAttribute('height', '1040');
    var markup = new XMLSerializer().serializeToString(clone);
    return markup.replace(/var\((--c-[a-z-]+)\)/g, function (m, name) {
      return styles.getPropertyValue(name).trim() || '#888888';
    });
  };

  Configurator.prototype.renderPng = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      var W = 1080, H = 1350;
      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext('2d');
      var img = new Image();
      var url = URL.createObjectURL(new Blob([self.svgMarkup()], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = function () {
        var bg = ctx.createRadialGradient(W * 0.5, H * 0.38, 40, W * 0.5, H * 0.45, W * 0.8);
        bg.addColorStop(0, '#2b2533');
        bg.addColorStop(1, '#141216');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, (W - 760) / 2, 70, 760, 988);
        URL.revokeObjectURL(url);

        var sm = self.summary();
        var price = self.price();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(80, 1090, W - 160, 1);
        ctx.fillStyle = '#b08ae0';
        ctx.font = '600 26px sans-serif';
        ctx.fillText('HIRA — DESIGN YOUR OWN', 80, 1140);
        ctx.fillStyle = '#ece8f2';
        ctx.font = '24px sans-serif';
        var lines = [
          'Base: ' + sm.base + '   ·   Eyes: ' + sm.openings + '   ·   Mouth: ' + sm.mouth,
          'Ears: ' + sm.ears + '   ·   Stripes: ' + sm.stripes,
          'Accessories: ' + sm.accessories,
          'Accent: ' + sm.accent + '   ·   Est. ' + formatNumber(price.egp) + ' EGP (~$' + formatNumber(price.usd) + ')'
        ];
        lines.forEach(function (line, i) {
          ctx.fillText(line, 80, 1186 + i * 38, W - 160);
        });
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('toBlob failed'));
        }, 'image/png');
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('SVG image failed to load'));
      };
      img.src = url;
    });
  };

  Configurator.prototype.save = function () {
    var self = this;
    var filename = 'hira-design.png';
    var finish = function (blob) {
      var file = null;
      try {
        file = new File([blob], filename, { type: 'image/png' });
      } catch (e) { /* older browsers */ }
      var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (coarse && file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'My HIRA design' }).then(function () {
          self.status('Design ready. Attach it in your WhatsApp chat.');
        }).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          self.download(blob, filename);
        });
        return;
      }
      self.download(blob, filename);
    };

    // A ready image lets the share sheet open straight from the tap (required on iOS).
    if (this.pngBlob) {
      finish(this.pngBlob);
      return;
    }
    this.status('Preparing your design…');
    this.renderPng().then(function (blob) {
      self.pngBlob = blob;
      finish(blob);
    }).catch(function () {
      self.status('Sorry, the image could not be created on this device. Please take a screenshot instead.');
    });
  };

  Configurator.prototype.download = function (blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    this.status('Design saved as ' + filename + '. Attach it in your WhatsApp chat.');
  };

  /* ---------- boot ---------- */

  function boot(scope) {
    (scope || document).querySelectorAll('[data-hira-configurator]').forEach(function (root) {
      if (root.dataset.cfgReady) return;
      root.dataset.cfgReady = 'true';
      root.hiraConfigurator = new Configurator(root);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(); });
  else boot();

  document.addEventListener('shopify:section:load', function (event) { boot(event.target); });
})();
