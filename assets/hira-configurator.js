/*
 * HIRA "Design your own" configurator.
 *
 * The preview is an SVG built here: a crochet balaclava on a dark mannequin,
 * openings cut with a mask (so the mannequin face shows through), ears, side
 * stripes, and accessories the customer drags into place (pointer events,
 * touch + mouse). Also: step UI, estimated price, PNG export (Web Share API on
 * phones, download elsewhere), WhatsApp order and a silent email copy through
 * Shopify's contact form. Vanilla JS, no build step.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var W = 400; // drawing width: the mask is drawn between x 0 and 400, mirrored around x 200
  // Square preview frame (viewBox -70 -40 540 540), centred on the drawing, so
  // square layer PNGs line up at offset 0 / 0 and scale 100%.
  var VB = { x: -70, y: -40, size: 540 };

  var OPENINGS = { wide: 'One wide', eyes: 'Two eyes' };
  var MOUTHS = { none: 'None', simple: 'Simple opening', teeth: 'Teeth' };
  var EARS = { none: 'None', bear: 'Bear ears', bunny: 'Bunny ears', horns: 'Horns', cat: 'Cat ears' };
  var EAR_PRICE = { bear: 'bear', cat: 'cat', bunny: 'bunny', horns: 'horns' };
  var ACCESSORIES = {
    chain: { label: 'Steel chain', price: 'chain', start: [262, 150] },
    rings: { label: 'Metal rings', price: 'accessory', start: [244, 150] },
    crystals: { label: 'Crystals', price: 'accessory', start: [200, 252] },
    charms: { label: 'Heart & bow charms', price: 'accessory', start: [146, 140] },
    stars: { label: 'Stars', price: 'accessory', start: [236, 112] },
    hearts: { label: 'Hearts', price: 'accessory', start: [158, 262] },
    pearls: { label: 'Pearls / beads', price: 'accessory', start: [200, 352] }
  };
  var ACC_ORDER = ['chain', 'rings', 'crystals', 'charms', 'stars', 'hearts', 'pearls'];
  var MAX_STRIPES = 8;
  var DEFAULT_COLORS = [
    { name: 'Black', hex: '#1A1A1C' }, { name: 'Grey', hex: '#8C8B91' }, { name: 'White', hex: '#F2EFEA' },
    { name: 'Beige', hex: '#D9C3A5' }, { name: 'Brown', hex: '#5A3524' }, { name: 'Red', hex: '#D2161E' },
    { name: 'Pink', hex: '#F08CB4' }, { name: 'Orange', hex: '#E07A2E' }, { name: 'Blue', hex: '#2F4F8F' }
  ];

  /* ---------- geometry (left side; right side is mirrored) ---------- */

  var HEAD = 'M200 36 C266 36 304 84 304 150 C304 192 298 216 296 240 C294 282 284 318 272 340 ' +
    'C266 352 266 362 266 372 L268 426 C270 442 280 452 290 460 L110 460 C120 452 130 442 132 426 ' +
    'L134 372 C134 362 134 352 128 340 C116 318 106 282 104 240 C102 216 96 192 96 150 C96 84 134 36 200 36 Z';
  var SHOULDERS = 'M140 428 C100 444 44 458 10 500 L390 500 C356 458 300 444 260 428 Z';
  var EYE_L = 'M136 203 C146 186 186 186 196 203 C186 220 146 220 136 203 Z';
  var BUNNY_OUT_RAW = 'M170 60 C120 38 64 60 54 122 C42 194 32 304 34 412 C35 462 60 486 86 486 ' +
    'C112 486 128 464 126 420 C122 330 118 232 120 162 C122 122 142 88 170 60 Z';
  var BUNNY_IN_RAW = 'M152 84 C116 74 84 98 78 142 C70 212 64 312 66 404 C67 442 78 460 87 460 ' +
    'C97 460 106 442 104 404 C100 320 98 232 102 162 C104 130 124 104 152 84 Z';
  var BUNNY_OUT = shiftPath(BUNNY_OUT_RAW, -9, 0);
  var BUNNY_IN = shiftPath(BUNNY_IN_RAW, -9, 0);
  var CAT_OUT = 'M112 120 L122 14 L192 66 Z';
  var CAT_IN = 'M127 100 L133 42 L172 70 Z';
  var HORN = 'M118 98 C94 70 88 22 108 -26 C124 10 148 44 178 64 Z';
  var TEETH_BARS = [166, 178, 190, 202, 214, 226];

  function shiftPath(d, dx, dy) {
    var nums = 0;
    return d.replace(/-?\d+(\.\d+)?/g, function (n) {
      nums += 1;
      return String(parseFloat(n) + (nums % 2 === 1 ? dx : dy));
    });
  }

  function mirrorPath(d) {
    // Every command used here (M, L, C, Z) takes absolute x y pairs.
    var nums = 0;
    return d.replace(/-?\d+(\.\d+)?/g, function (n) {
      nums += 1;
      return nums % 2 === 1 ? String(W - parseFloat(n)) : n;
    });
  }

  /* ---------- helpers ---------- */

  function el(tag, attrs, parent) {
    var node = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

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

  function shade(hex, amount) {
    // amount > 0 darkens, < 0 lightens; dark colours lighten instead so detail stays visible.
    var dark = luminance(hex) < 0.18;
    if (dark && amount > 0) return mix(hex, '#ffffff', amount * 0.5);
    return amount > 0 ? mix(hex, '#000000', amount) : mix(hex, '#ffffff', -amount);
  }

  function formatNumber(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function paint(node, color) {
    node.style.fill = color;
  }

  /* =====================================================================
   * Preview (SVG scene)
   * =================================================================== */

  function Scene(svg) {
    this.svg = svg;
    this.uid = 'hc' + Math.random().toString(36).slice(2, 8);
    this.paint = { base: [], baseDark: [], earOuter: [], earInner: [], earInnerDark: [], trim: [], mouth: [], mouthRim: [], face: [], faceStroke: [] };
    this.earShapes = { bear: [], cat: [], horns: [], bunny: [] };
    this.earGroups = {};
    this.build();
  }

  Scene.prototype.id = function (name) {
    return this.uid + '-' + name;
  };

  Scene.prototype.url = function (name) {
    return 'url(#' + this.id(name) + ')';
  };

  Scene.prototype.build = function () {
    var svg = this.svg;
    var defs = el('defs', null, svg);
    this.buildDefs(defs);

    // PNG layers (Theme settings > Configurator layers) sit in these slots, in
    // stack order; any part without an image keeps its SVG drawing.
    this.img = {};
    this.img.mannequin = this.imageSlot(svg);

    // Mannequin: shoulders, neck and a matte head (visible through the openings).
    var mannequin = el('g', { class: 'cfg-mannequin' }, svg);
    this.mannequinSvg = mannequin;
    el('path', { d: SHOULDERS, fill: this.url('matte') }, mannequin);
    el('path', { d: 'M136 372 L264 372 L268 434 L132 434 Z', fill: '#1c1c20' }, mannequin);
    el('path', { d: HEAD, fill: this.url('matte') }, mannequin);
    var face = el('g', { class: 'cfg-face' }, mannequin);
    [[166, 203], [234, 203]].forEach(function (c) {
      var cx = c[0], cy = c[1];
      el('path', { d: 'M' + (cx - 19) + ' ' + cy + ' C' + (cx - 10) + ' ' + (cy - 11) + ' ' + (cx + 10) + ' ' + (cy - 11) + ' ' + (cx + 19) + ' ' + cy +
        ' C' + (cx + 10) + ' ' + (cy + 9) + ' ' + (cx - 10) + ' ' + (cy + 9) + ' ' + (cx - 19) + ' ' + cy + ' Z', fill: '#141417' }, face);
      el('circle', { cx: cx, cy: cy, r: 6.4, fill: '#0b0b0d' }, face);
      el('circle', { cx: cx - 2, cy: cy - 2.2, r: 1.6, fill: '#fff', 'fill-opacity': '.35' }, face);
      el('path', { d: 'M' + (cx - 21) + ' ' + (cy - 15) + ' Q' + cx + ' ' + (cy - 24) + ' ' + (cx + 21) + ' ' + (cy - 14), fill: 'none', stroke: '#000', 'stroke-opacity': '.35', 'stroke-width': '3', 'stroke-linecap': 'round' }, face);
    });
    el('path', { d: 'M184 301 Q200 296 216 301 Q200 310 184 301 Z', fill: '#121215' }, face);

    // Ears behind the head.
    var back = el('g', null, svg);
    this.buildBear(back);
    this.buildCat(back);
    this.buildHorns(back);

    // The balaclava, with the openings cut out by a mask.
    var body = el('g', { mask: this.url('open') }, svg);
    this.body = body;
    this.headFill = el('path', { d: HEAD }, body);
    this.paint.base.push(this.headFill);
    var clip = el('g', { 'clip-path': this.url('head') }, body);
    this.stripes = el('g', { class: 'cfg-stripes' }, clip);
    var band = el('rect', { x: 0, y: 436, width: W, height: 30 }, clip);
    this.paint.baseDark.push(band);
    el('rect', { x: 0, y: 436, width: W, height: 30, fill: this.url('rib') }, clip);
    el('rect', { x: VB.x, y: VB.y, width: VB.size, height: VB.size, fill: this.url('stitch') }, clip);
    el('rect', { x: VB.x, y: VB.y, width: VB.size, height: VB.size, fill: this.url('vol') }, clip);
    el('path', { d: HEAD, fill: 'none', stroke: '#fff', 'stroke-opacity': '.12', 'stroke-width': '1.6' }, body);

    // Trimmed rims around the openings.
    this.rims = el('g', null, svg);
    var rim = function (attrs, key) {
      var g = el('g', { 'data-rim': key, style: 'display:none' }, this.rims);
      var a1 = Object.assign({ fill: 'none', 'stroke-width': '7', 'stroke-linejoin': 'round' }, attrs);
      this.paint.trim.push(el(attrs.tag || 'path', a1, g));
      el(attrs.tag || 'path', Object.assign({}, attrs, { fill: 'none', stroke: this.url('rimStitch'), 'stroke-width': '7' }), g);
      g.querySelectorAll('[tag]').forEach(function (n) { n.removeAttribute('tag'); });
      return g;
    }.bind(this);
    rim({ tag: 'rect', x: 126, y: 181, width: 148, height: 42, rx: 21 }, 'wide');
    rim({ d: EYE_L + ' ' + mirrorPath(EYE_L) }, 'eyes');
    rim({ tag: 'ellipse', cx: 200, cy: 300, rx: 22, ry: 13 }, 'simple');
    var teethRim = rim({ tag: 'rect', x: 160, y: 284, width: 80, height: 36, rx: 12 }, 'teeth');
    TEETH_BARS.forEach(function (x) {
      el('rect', { x: x - 0.5, y: 284, width: 7, height: 36, rx: 3.5, fill: 'none', stroke: '#000', 'stroke-opacity': '.28', 'stroke-width': '1.2' }, teethRim);
    });

    // PNG mask, mouth, stripes and ears (inner below outer).
    this.img.mask = this.imageSlot(svg);
    this.img.mouth = this.imageSlot(svg);
    this.buildMouthOverlay(svg);
    this.img.face = this.imageSlot(svg);
    this.buildFaceOverlay(svg);
    this.img.stripes = this.imageSlot(svg);
    this.img.earInner = this.splitSlot(svg);
    this.img.earOuter = this.splitSlot(svg);

    // Bunny ears hang in front of the face and onto the shoulders.
    var front = el('g', null, svg);
    this.buildBunny(front);

    this.pieces = el('g', { class: 'cfg-pieces' }, svg);
    this.ui = el('g', { class: 'cfg-ui', 'data-ui': '' }, svg);
    this.selectRing = el('circle', { r: 15, fill: 'none', stroke: '#b08ae0', 'stroke-width': '2', 'stroke-dasharray': '4 3', style: 'display:none' }, this.ui);
  };

  // Two copies of one image, clipped to its left and right half, so the halves
  // can be spread apart (the "Spread" slider on ear / horn layers).
  Scene.prototype.splitSlot = function (parent) {
    var g = el('g', null, parent);
    var left = this.imageSlot(g);
    var right = this.imageSlot(g);
    left.setAttribute('clip-path', this.url('halfL'));
    right.setAttribute('clip-path', this.url('halfR'));
    return { split: true, nodes: [left, right] };
  };

  Scene.prototype.imageSlot = function (parent) {
    return el('image', {
      class: 'cfg-png', x: VB.x, y: VB.y, width: VB.size, height: VB.size,
      preserveAspectRatio: 'xMidYMid meet', style: 'display:none'
    }, parent);
  };

  // Mouth drawn on top of a PNG mask (used when that mouth has no PNG yet).
  Scene.prototype.buildMouthOverlay = function (parent) {
    var self = this;
    var g = el('g', { style: 'display:none' }, parent);
    this.mouthOverlay = g;
    var simple = el('g', { 'data-mo': 'simple' }, g);
    el('ellipse', { cx: 200, cy: 300, rx: 22, ry: 13, fill: '#151518' }, simple);
    el('path', { d: 'M186 301 Q200 297 214 301 Q200 308 186 301 Z', fill: '#0c0c0e' }, simple);
    this.paint.mouthRim.push(el('ellipse', { cx: 200, cy: 300, rx: 22, ry: 13, fill: 'none', 'stroke-width': '7' }, simple));
    el('ellipse', { cx: 200, cy: 300, rx: 22, ry: 13, fill: 'none', stroke: this.url('rimStitch'), 'stroke-width': '7' }, simple);
    var teeth = el('g', { 'data-mo': 'teeth' }, g);
    el('rect', { x: 160, y: 284, width: 80, height: 36, rx: 12, fill: '#151518' }, teeth);
    TEETH_BARS.forEach(function (x) {
      self.paint.mouth.push(el('rect', { x: x, y: 284, width: 6, height: 36, rx: 3 }, teeth));
      el('rect', { x: x, y: 284, width: 6, height: 36, rx: 3, fill: self.url('stitch') }, teeth);
    });
    this.paint.mouthRim.push(el('rect', { x: 160, y: 284, width: 80, height: 36, rx: 12, fill: 'none', 'stroke-width': '7' }, teeth));
    el('rect', { x: 160, y: 284, width: 80, height: 36, rx: 12, fill: 'none', stroke: this.url('rimStitch'), 'stroke-width': '7' }, teeth);
  };

  // Drawn skull face piece (used until the "Face piece: skull" image is uploaded):
  // eye-socket rings, nose cavity, cheekbones and a jaw with its own teeth.
  Scene.prototype.buildFaceOverlay = function (parent) {
    var self = this;
    var g = el('g', { style: 'display:none' }, parent);
    this.faceOverlay = g;
    [[166, 203], [234, 203]].forEach(function (c) {
      self.paint.faceStroke.push(el('circle', { cx: c[0], cy: c[1], r: 27, fill: 'none', 'stroke-width': '9' }, g));
      el('circle', { cx: c[0], cy: c[1], r: 27, fill: 'none', stroke: self.url('rimStitch'), 'stroke-width': '9' }, g);
    });
    ['M136 236 Q156 262 182 252', 'M264 236 Q244 262 218 252'].forEach(function (d) {
      self.paint.faceStroke.push(el('path', { d: d, fill: 'none', 'stroke-width': '7', 'stroke-linecap': 'round' }, g));
    });
    var nose = 'M200 246 C191 260 186 272 193 277 L200 270 L207 277 C214 272 209 260 200 246 Z';
    el('path', { d: nose, fill: '#151518' }, g);
    self.paint.faceStroke.push(el('path', { d: nose, fill: 'none', 'stroke-width': '4', 'stroke-linejoin': 'round' }, g));
    self.paint.face.push(el('rect', { x: 148, y: 284, width: 104, height: 36, rx: 10 }, g));
    el('rect', { x: 148, y: 284, width: 104, height: 36, rx: 10, fill: self.url('stitch') }, g);
    el('path', { d: 'M150 302 L250 302', stroke: '#151518', 'stroke-width': '2.4' }, g);
    for (var x = 161; x < 250; x += 11) {
      el('path', { d: 'M' + x + ' 288 L' + x + ' 316', stroke: '#151518', 'stroke-width': '2', 'stroke-linecap': 'round' }, g);
    }
  };

  Scene.prototype.setFaceOverlay = function (show) {
    this.faceOverlay.style.display = show ? '' : 'none';
  };

  Scene.prototype.setMouthOverlay = function (mouth) {
    this.mouthOverlay.style.display = mouth === 'simple' || mouth === 'teeth' ? '' : 'none';
    this.mouthOverlay.querySelectorAll('[data-mo]').forEach(function (g) {
      g.style.display = g.getAttribute('data-mo') === mouth ? '' : 'none';
    });
  };

  Scene.prototype.buildDefs = function (defs) {
    var self = this;
    var grad = function (tag, name, attrs, stops) {
      var g = el(tag, Object.assign({ id: self.id(name) }, attrs || {}), defs);
      stops.forEach(function (s) {
        el('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] === undefined ? 1 : s[2] }, g);
      });
      return g;
    };

    // One crochet stitch: a rounded bump, light at the top, shadowed at the base.
    grad('radialGradient', 'st', { cx: '.45', cy: '.3', r: '.8' }, [[0, '#fff', 0.26], [0.5, '#fff', 0.05], [0.82, '#000', 0.04], [1, '#000', 0.28]]);
    var stitch = el('pattern', { id: this.id('stitch'), width: 9, height: 8, patternUnits: 'userSpaceOnUse' }, defs);
    // Two legs leaning apart at the top: a "V" stitch, stacked in columns.
    el('rect', { width: 9, height: 8, fill: '#000', 'fill-opacity': '.14' }, stitch);
    el('ellipse', { cx: 2.9, cy: 4, rx: 2.2, ry: 4.2, transform: 'rotate(-24 2.9 4)', fill: self.url('st') }, stitch);
    el('ellipse', { cx: 6.1, cy: 4, rx: 2.2, ry: 4.2, transform: 'rotate(24 6.1 4)', fill: self.url('st') }, stitch);
    el('path', { d: 'M4.5 6.6 L4.5 8', stroke: '#000', 'stroke-opacity': '.22', 'stroke-width': '1' }, stitch);
    var rib = el('pattern', { id: this.id('rib'), width: 7, height: 30, patternUnits: 'userSpaceOnUse' }, defs);
    el('rect', { x: 5, width: 2, height: 30, fill: '#000', 'fill-opacity': '.22' }, rib);
    var rimStitch = el('pattern', { id: this.id('rimStitch'), width: 6, height: 6, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 3, cy: 3, r: 2.2, fill: self.url('st') }, rimStitch);

    grad('radialGradient', 'vol', { cx: '.42', cy: '.3', r: '.78' }, [[0, '#fff', 0.16], [0.5, '#fff', 0], [0.82, '#000', 0.22], [1, '#000', 0.55]]);
    grad('linearGradient', 'earShade', { x1: 0, y1: 0, x2: 1, y2: 0 }, [[0, '#000', 0.4], [0.3, '#000', 0], [0.68, '#fff', 0.07], [1, '#000', 0.35]]);
    grad('linearGradient', 'hornShade', { x1: 0, y1: 0, x2: 1, y2: 0 }, [[0, '#000', 0.42], [0.55, '#fff', 0.12], [1, '#000', 0.2]]);
    grad('radialGradient', 'matte', { cx: '.5', cy: '.35', r: '.75' }, [[0, '#3a3a40'], [1, '#18181b']]);
    grad('linearGradient', 'silver', { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#f6f7fa'], [0.45, '#9ea3ad'], [0.7, '#e3e5ea'], [1, '#7d828c']]);
    grad('radialGradient', 'pearl', { cx: '.35', cy: '.3', r: '.75' }, [[0, '#ffffff'], [0.6, '#efe9df'], [1, '#c9bfae']]);

    // Halves of a layer image, in the image's own coordinates (its centre line is x 200).
    var halfL = el('clipPath', { id: this.id('halfL') }, defs);
    el('rect', { x: -5000, y: -5000, width: 5200, height: 10000 }, halfL);
    var halfR = el('clipPath', { id: this.id('halfR') }, defs);
    el('rect', { x: 200, y: -5000, width: 5200, height: 10000 }, halfR);

    var headClip = el('clipPath', { id: this.id('head') }, defs);
    el('path', { d: HEAD }, headClip);

    var mask = el('mask', { id: this.id('open'), maskUnits: 'userSpaceOnUse', x: VB.x, y: VB.y, width: VB.size, height: VB.size }, defs);
    el('rect', { x: VB.x, y: VB.y, width: VB.size, height: VB.size, fill: '#fff' }, mask);
    this.holes = {
      wide: el('rect', { x: 126, y: 181, width: 148, height: 42, rx: 21, fill: '#000', style: 'display:none' }, mask),
      eyes: el('path', { d: EYE_L + ' ' + mirrorPath(EYE_L), fill: '#000', style: 'display:none' }, mask),
      simple: el('ellipse', { cx: 200, cy: 300, rx: 22, ry: 13, fill: '#000', style: 'display:none' }, mask)
    };
    var teeth = el('g', { style: 'display:none' }, mask);
    el('rect', { x: 160, y: 284, width: 80, height: 36, rx: 12, fill: '#000' }, teeth);
    TEETH_BARS.forEach(function (x) {
      el('rect', { x: x, y: 282, width: 6, height: 40, rx: 3, fill: '#fff' }, teeth);
    });
    this.holes.teeth = teeth;
  };

  // A crochet-textured shape: colour + stitches + shading, registered for recolouring.
  Scene.prototype.textured = function (parent, d, colorKey, shadeName) {
    var g = el('g', null, parent);
    var base = el('path', { d: d }, g);
    this.paint[colorKey].push(base);
    el('path', { d: d, fill: this.url('stitch') }, g);
    el('path', { d: d, fill: this.url(shadeName || 'earShade') }, g);
    return base;
  };

  Scene.prototype.earGroup = function (parent, type) {
    var g = el('g', { class: 'cfg-layer', 'data-on': 'false' }, parent);
    this.earGroups[type] = g;
    return g;
  };

  Scene.prototype.buildBear = function (parent) {
    var g = this.earGroup(parent, 'bear');
    var circle = function (cx, cy, r) {
      return 'M' + (cx - r) + ' ' + cy + ' C' + (cx - r) + ' ' + (cy - r * 0.55) + ' ' + (cx - r * 0.55) + ' ' + (cy - r) + ' ' + cx + ' ' + (cy - r) +
        ' C' + (cx + r * 0.55) + ' ' + (cy - r) + ' ' + (cx + r) + ' ' + (cy - r * 0.55) + ' ' + (cx + r) + ' ' + cy +
        ' C' + (cx + r) + ' ' + (cy + r * 0.55) + ' ' + (cx + r * 0.55) + ' ' + (cy + r) + ' ' + cx + ' ' + (cy + r) +
        ' C' + (cx - r * 0.55) + ' ' + (cy + r) + ' ' + (cx - r) + ' ' + (cy + r * 0.55) + ' ' + (cx - r) + ' ' + cy + ' Z';
    };
    var outer = circle(112, 86, 38);
    var inner = circle(114, 88, 22);
    [outer, mirrorPath(outer)].forEach(function (d) {
      this.earShapes.bear.push(this.textured(g, d, 'earOuter'));
    }, this);
    [inner, mirrorPath(inner)].forEach(function (d) {
      this.textured(g, d, 'earInnerDark');
    }, this);
  };

  Scene.prototype.buildCat = function (parent) {
    var g = this.earGroup(parent, 'cat');
    [CAT_OUT, mirrorPath(CAT_OUT)].forEach(function (d) {
      var base = this.textured(g, d, 'earOuter');
      base.setAttribute('stroke-linejoin', 'round');
      base.setAttribute('stroke-width', '8');
      this.paint.earOuter.push({ stroke: base });
      this.earShapes.cat.push(base);
    }, this);
    [CAT_IN, mirrorPath(CAT_IN)].forEach(function (d) {
      this.textured(g, d, 'earInner');
    }, this);
  };

  Scene.prototype.buildHorns = function (parent) {
    var g = this.earGroup(parent, 'horns');
    [HORN, mirrorPath(HORN)].forEach(function (d, i) {
      var base = this.textured(g, d, 'earOuter', 'hornShade');
      this.earShapes.horns.push(base);
      // Rows of crochet rounds around the horn.
      var rows = i === 0
        ? 'M124 84 C134 82 146 76 154 70 M112 58 C122 58 132 52 138 46 M104 34 C112 34 118 28 122 22 M104 10 C108 10 112 6 114 2'
        : mirrorPath('M124 84 C134 82 146 76 154 70 M112 58 C122 58 132 52 138 46 M104 34 C112 34 118 28 122 22 M104 10 C108 10 112 6 114 2');
      el('path', { d: rows, fill: 'none', stroke: '#000', 'stroke-opacity': '.25', 'stroke-width': '2.2', 'stroke-linecap': 'round' }, g);
    }, this);
  };

  Scene.prototype.buildBunny = function (parent) {
    var g = this.earGroup(parent, 'bunny');
    [BUNNY_OUT, mirrorPath(BUNNY_OUT)].forEach(function (d) {
      el('path', { d: d, fill: '#000', 'fill-opacity': '.35', transform: 'translate(3 7)' }, g); // soft shadow
      this.earShapes.bunny.push(this.textured(g, d, 'earOuter'));
    }, this);
    [BUNNY_IN, mirrorPath(BUNNY_IN)].forEach(function (d) {
      this.textured(g, d, 'earInner');
    }, this);
  };

  Scene.prototype.setColors = function (c) {
    var p = this.paint;
    p.base.forEach(function (n) { paint(n, c.base); });
    p.baseDark.forEach(function (n) { paint(n, shade(c.base, 0.18)); });
    p.earOuter.forEach(function (n) {
      if (n.stroke) n.stroke.style.stroke = c.earOuter;
      else paint(n, c.earOuter);
    });
    p.earInner.forEach(function (n) { paint(n, c.earInner); });
    p.earInnerDark.forEach(function (n) { paint(n, c.earInner); });
    p.trim.forEach(function (n) { n.style.stroke = c.trim; });
    p.mouth.forEach(function (n) { paint(n, c.mouth); });
    p.mouthRim.forEach(function (n) { n.style.stroke = c.mouth; });
    p.face.forEach(function (n) { paint(n, c.face); });
    p.faceStroke.forEach(function (n) { n.style.stroke = c.face; });
  };

  Scene.prototype.setOpenings = function (opening, mouth) {
    var show = { wide: opening === 'wide', eyes: opening === 'eyes', simple: mouth === 'simple', teeth: mouth === 'teeth' };
    Object.keys(this.holes).forEach(function (k) {
      this.holes[k].style.display = show[k] ? '' : 'none';
    }, this);
    this.rims.querySelectorAll('[data-rim]').forEach(function (g) {
      g.style.display = show[g.getAttribute('data-rim')] ? '' : 'none';
    });
  };

  Scene.prototype.setEars = function (ears) {
    Object.keys(this.earGroups).forEach(function (k) {
      this.earGroups[k].setAttribute('data-on', k === ears ? 'true' : 'false');
    }, this);
    this.ears = ears;
  };

  // Side stripes run down both sides of the head, alternating left / right.
  Scene.prototype.setStripes = function (count, color) {
    var holder = this.stripes;
    while (holder.firstChild) holder.removeChild(holder.firstChild);
    var left = Math.ceil(count / 2);
    var right = Math.floor(count / 2);
    var make = function (k, mirror) {
      var o = 14 + k * 13;
      var d = 'M' + (118 + o) + ' 70 C' + (90 + o) + ' 150 ' + (94 + o) + ' 270 ' + (146 + o) + ' 356';
      el('path', { d: mirror ? mirrorPath(d) : d, fill: 'none', 'stroke-width': '7', 'stroke-linecap': 'round', style: 'stroke:' + color }, holder);
    };
    for (var i = 0; i < left; i++) make(i, false);
    for (var j = 0; j < right; j++) make(j, true);
  };

  /* ---------- placement: where a point lies on the mask ---------- */

  Scene.prototype.point = function (x, y) {
    var pt = this.svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    return pt;
  };

  Scene.prototype.inShape = function (shape, x, y) {
    try {
      return shape.isPointInFill(this.point(x, y));
    } catch (e) {
      var b = shape.getBBox();
      return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
    }
  };

  // Alpha maps (540 x 540, one cell per viewBox unit) built from PNG layers.
  Scene.prototype.alphaAt = function (map, x, y) {
    var ix = Math.round(x - VB.x), iy = Math.round(y - VB.y);
    if (ix < 0 || iy < 0 || ix >= VB.size || iy >= VB.size) return false;
    return map[(iy * VB.size + ix) * 4 + 3] > 40;
  };

  Scene.prototype.onEar = function (x, y) {
    if (this.alpha && this.alpha.ears) {
      return this.alphaAt(this.alpha.ears, x, y) ? (x < 200 ? 'left' : 'right') : null;
    }
    var list = this.ears && this.earShapes[this.ears];
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (this.inShape(list[i], x, y)) return i === 0 ? 'left' : 'right';
    }
    return null;
  };

  Scene.prototype.isOnMask = function (x, y) {
    if (this.onEar(x, y)) return true;
    if (this.alpha && this.alpha.mask) return this.alphaAt(this.alpha.mask, x, y);
    return this.inShape(this.headFill, x, y);
  };

  // Plain-language spot, as seen from the front.
  Scene.prototype.region = function (x, y) {
    var ear = this.onEar(x, y);
    if (ear) return ear + ' ' + ((this.earType || this.ears) === 'horns' ? 'horn' : 'ear');
    var side = x < 200 ? 'left' : 'right';
    var mid = Math.abs(x - 200);
    if (y < 172) return 'forehead';
    if (y < 232) return mid < 16 ? 'between the eyes' : side + ' eye area';
    if (y < 282) return mid < 24 ? 'nose' : side + ' cheek';
    if (y < 330) return mid < 46 ? 'mouth' : side + ' cheek';
    if (y < 378) return mid < 40 ? 'chin' : side + ' jaw';
    return 'neck';
  };

  /* =====================================================================
   * Accessory pieces
   * =================================================================== */

  Scene.prototype.drawPieceArt = function (g, type, opts) {
    var silver = this.url('silver');
    if (type === 'rings') {
      el('circle', { cx: 1, cy: 1.6, r: 6.6, fill: 'none', stroke: '#000', 'stroke-opacity': '.35', 'stroke-width': '2.6' }, g);
      el('circle', { r: 6.6, fill: 'none', stroke: silver, 'stroke-width': '2.6' }, g);
      el('path', { d: 'M-4.6 -4.6 A6.6 6.6 0 0 1 3 -5.9', fill: 'none', stroke: '#fff', 'stroke-opacity': '.8', 'stroke-width': '1' }, g);
    } else if (type === 'charms') {
      el('circle', { r: 3.6, fill: 'none', stroke: silver, 'stroke-width': '1.8' }, g);
      el('path', { d: 'M-1.5 3 L-5 10 M1.5 3 L5 10', stroke: silver, 'stroke-width': '1.4' }, g);
      el('path', { d: 'M-5 24 C-14 18 -14 9 -8.5 9 C-6.6 9 -5 10.6 -5 12 C-5 10.6 -3.4 9 -1.5 9 C4 9 4 18 -5 24 Z', fill: silver, stroke: '#6e737c', 'stroke-width': '.7' }, g);
      el('path', { d: 'M5 14 C-1 10 -1 18 4 16 Z M5 14 C11 10 11 18 6 16 Z M4.6 15 L2 24 M5.4 15 L8.4 24', fill: silver, stroke: '#6e737c', 'stroke-width': '.9', 'stroke-linecap': 'round' }, g);
    } else if (type === 'crystals') {
      var black = opts.crystalColor === 'black';
      var base = black ? '#17171b' : '#c8102e';
      var hi = black ? '#5c5c66' : '#ff6b7f';
      var lo = black ? '#050506' : '#7a0718';
      el('polygon', { points: '0,-7.5 6.5,-3 6.5,3 0,7.5 -6.5,3 -6.5,-3', fill: base, stroke: lo, 'stroke-width': '.6' }, g);
      el('polygon', { points: '0,-7.5 6.5,-3 0,-1.5 -6.5,-3', fill: hi, 'fill-opacity': '.75' }, g);
      el('polygon', { points: '-6.5,3 0,7.5 0,1.5', fill: lo, 'fill-opacity': '.7' }, g);
      el('polygon', { points: '-3,-2 3,-2 3.5,2 -3.5,2', fill: '#fff', 'fill-opacity': '.18' }, g);
      el('circle', { cx: -2, cy: -4, r: 1.1, fill: '#fff', 'fill-opacity': '.9' }, g);
    } else if (type === 'stars' || type === 'hearts') {
      var d = type === 'stars'
        ? 'M0 -12 L3.3 -4.3 L11.4 -3.7 L5.3 1.6 L7.1 9.7 L0 5.4 L-7.1 9.7 L-5.3 1.6 L-11.4 -3.7 L-3.3 -4.3 Z'
        : 'M0 10 C-15 1 -12 -11 -5 -11 C-2.3 -11 0 -8.6 0 -6.4 C0 -8.6 2.3 -11 5 -11 C12 -11 15 1 0 10 Z';
      el('path', { d: d, fill: '#000', 'fill-opacity': '.3', transform: 'translate(.8 1.4)' }, g);
      var shape = el('path', { d: d, 'data-applique': '', 'stroke-width': '1.6', 'stroke-linejoin': 'round' }, g);
      shape.style.fill = opts.applique;
      shape.style.stroke = shade(opts.applique, 0.25);
      el('path', { d: d, fill: this.url('stitch') }, g);
    } else if (type === 'pearls') {
      el('circle', { cx: 0.8, cy: 1.4, r: 4.8, fill: '#000', 'fill-opacity': '.3' }, g);
      el('circle', { r: 4.8, fill: this.url('pearl'), stroke: '#b5ab9b', 'stroke-width': '.5' }, g);
      el('circle', { cx: -1.6, cy: -1.8, r: 1.3, fill: '#fff' }, g);
    }
  };

  // Chain with a natural sag between its two ends.
  Scene.prototype.drawChain = function (g, a, b) {
    var links = g.querySelector('[data-links]');
    while (links.firstChild) links.removeChild(links.firstChild);
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var dist = Math.sqrt(dx * dx + dy * dy);
    var sag = Math.max(8, dist * 0.22);
    var cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2 + sag;
    var silver = this.url('silver');
    // Wide invisible strip along the chain so it is easy to grab with a finger.
    el('path', {
      class: 'cfg-hit', d: 'M' + a[0] + ' ' + a[1] + ' Q' + cx + ' ' + cy + ' ' + b[0] + ' ' + b[1],
      fill: 'none', stroke: 'none', 'stroke-width': '18', 'pointer-events': 'stroke'
    }, links);
    var steps = Math.max(2, Math.round(dist / 5.2));
    for (var i = 0; i <= steps; i++) {
      var t = i / steps, u = 1 - t;
      var x = u * u * a[0] + 2 * u * t * cx + t * t * b[0];
      var y = u * u * a[1] + 2 * u * t * cy + t * t * b[1];
      var tx = 2 * u * (cx - a[0]) + 2 * t * (b[0] - cx);
      var ty = 2 * u * (cy - a[1]) + 2 * t * (b[1] - cy);
      var ang = Math.atan2(ty, tx) * 180 / Math.PI;
      var attrs = i % 2
        ? { rx: 3.6, ry: 1.1, fill: silver, stroke: '#6e737c', 'stroke-width': '.5' }
        : { rx: 3.8, ry: 2.4, fill: 'none', stroke: silver, 'stroke-width': '1.7' };
      attrs.cx = x.toFixed(1);
      attrs.cy = y.toFixed(1);
      attrs.transform = 'rotate(' + ang.toFixed(1) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')';
      el('ellipse', attrs, links);
    }
  };

  /* =====================================================================
   * PNG layers: load on demand, tint (multiply, keeping stitches/shading),
   * composite stripes, and build alpha maps for dragging.
   * =================================================================== */

  var XLINK = 'http://www.w3.org/1999/xlink';
  var CANVAS_SCALE = 2; // composites are 1080 x 1080 (viewBox x 2)

  function Layers(config) {
    this.cfg = config || {};
    this.images = {};   // key -> Promise<HTMLImageElement>
    this.tints = {};    // key -> { color, promise } (latest only, to save memory)
    this.failed = {};
    this.canvasFor = {}; // object URL -> canvas (for export)
  }

  Layers.prototype.has = function (key) {
    var l = key && this.cfg[key];
    return !!(l && l.url) && !this.failed[key];
  };

  Layers.prototype.load = function (key) {
    if (!this.images[key]) {
      var url = this.cfg[key].url;
      this.images[key] = new Promise(function (resolve, reject) {
        var img = new Image();
        img.crossOrigin = 'anonymous'; // needed to tint on a canvas and export
        img.decoding = 'async';
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('layer failed: ' + key)); };
        img.src = url;
      });
    }
    return this.images[key];
  };

  Layers.prototype.toUrl = function (canvas) {
    var self = this;
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('toBlob failed')); return; }
        var url = URL.createObjectURL(blob);
        self.canvasFor[url] = canvas;
        resolve(url);
      }, 'image/png');
    });
  };

  // White-yarn PNG x colour (multiply), with the original transparency kept.
  Layers.prototype.tinted = function (key, hex) {
    var self = this;
    var cached = this.tints[key];
    if (cached && cached.color === hex) return cached.promise;
    // Free the previous colour once the new one has had time to swap in on screen.
    if (cached) cached.promise.then(function (r) { setTimeout(function () { self.release(r.url); }, 3000); }).catch(function () {});
    var promise = this.load(key).then(function (img) {
      var canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      if (hex) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = hex;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(img, 0, 0);
      }
      ctx.getImageData(0, 0, 1, 1); // throws now (not at export) if the image is not CORS-enabled
      return self.toUrl(canvas).then(function (url) { return { url: url, canvas: canvas, img: img }; });
    });
    this.tints[key] = { color: hex, promise: promise };
    return promise;
  };

  Layers.prototype.release = function (url) {
    if (!url) return;
    delete this.canvasFor[url];
    URL.revokeObjectURL(url);
  };

  var INNER_OF = { bunny_inner: 'bunny_outer', bear_inner: 'bear_outer', cat_inner: 'cat_outer' };
  var SPLIT = { bunny_outer: 1, bunny_inner: 1, bear_outer: 1, bear_inner: 1, cat_outer: 1, cat_inner: 1, horns: 1 };

  Layers.prototype.isSplit = function (key) {
    return !!SPLIT[key];
  };

  // Inner ears inherit their outer layer's placement, then apply their own on top.
  Layers.prototype.chain = function (key) {
    return INNER_OF[key] ? [INNER_OF[key], key] : [key];
  };

  Layers.prototype.spread = function (key) {
    var cfg = this.cfg;
    return this.chain(key).reduce(function (sum, k) { return sum + (+(cfg[k] || {}).spread || 0); }, 0);
  };

  // One layer's offset and scale (around the frame centre) as an SVG transform.
  Layers.prototype.transform = function (key) {
    var l = this.cfg[key] || {};
    var s = (+l.scale || 100) / 100;
    return 'translate(' + (+l.x || 0) + ' ' + (+l.y || 0) + ') translate(200 230) scale(' + s + ') translate(-200 -230)';
  };

  // Full placement of a layer image (half: -1 left, 1 right, 0 whole): each half
  // moves out by half the spread, then the inherited and own offsets / scale.
  Layers.prototype.transformFor = function (key, half) {
    var shift = half ? 'translate(' + (half * this.spread(key) / 2) + ' 0) ' : '';
    return shift + this.chain(key).map(this.transform, this).join(' ');
  };

  // One layer's offset and scale on a canvas (same as transform()).
  Layers.prototype.applyTransform = function (ctx, key) {
    var l = this.cfg[key] || {};
    var sc = (+l.scale || 100) / 100;
    ctx.translate(+l.x || 0, +l.y || 0);
    ctx.translate(200, 230);
    ctx.scale(sc, sc);
    ctx.translate(-200, -230);
  };

  // A layer image fitted (meet) into the square frame.
  Layers.prototype.drawFitted = function (ctx, source) {
    var w = source.naturalWidth || source.width;
    var h = source.naturalHeight || source.height;
    var f = Math.min(VB.size / w, VB.size / h);
    var dw = w * f, dh = h * f;
    ctx.drawImage(source, VB.x + (VB.size - dw) / 2, VB.y + (VB.size - dh) / 2, dw, dh);
  };

  // The same placement on a canvas (export composites and drag hit maps).
  Layers.prototype.draw = function (ctx, key, source, extra) {
    var self = this;
    var halves = this.isSplit(key) ? [-1, 1] : [0];
    halves.forEach(function (half) {
      ctx.save();
      if (extra) extra(ctx);
      if (half) ctx.translate(half * self.spread(key) / 2, 0);
      self.chain(key).forEach(function (k) { self.applyTransform(ctx, k); });
      if (half) {
        ctx.beginPath();
        if (half < 0) ctx.rect(-5000, -5000, 5200, 10000);
        else ctx.rect(200, -5000, 5200, 10000);
        ctx.clip();
      }
      self.drawFitted(ctx, source);
      ctx.restore();
    });
  };

  // Stripes: the stripe PNG (left side) tinted, placed like the mask (it is part
  // of the mask artwork) with its own sliders as fine adjustments on top,
  // repeated inward with spacing, mirrored around the mask's centre line for
  // the right side, then clipped to the mask's shape (eye holes included).
  Layers.prototype.stripes = function (opts) {
    var self = this;
    var cw = VB.size * CANVAS_SCALE, ch = VB.size * CANVAS_SCALE;
    var stripe = opts.usePng ? this.tinted('stripe', opts.color) : Promise.resolve(null);
    var mask = opts.maskKey ? this.load(opts.maskKey) : Promise.resolve(null);
    return Promise.all([stripe, mask]).then(function (res) {
      var canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      var ctx = canvas.getContext('2d');
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, -VB.x * CANVAS_SCALE, -VB.y * CANVAS_SCALE);
      var left = Math.ceil(opts.count / 2), right = Math.floor(opts.count / 2);
      var spacing = +self.cfg.stripeSpacing || 14;
      var one = function (k, mirror) {
        ctx.save();
        if (opts.maskKey) self.applyTransform(ctx, opts.maskKey);
        if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
        ctx.translate(k * spacing, 0);
        if (res[0]) {
          self.applyTransform(ctx, 'stripe');
          self.drawFitted(ctx, res[0].canvas);
        } else {
          // No stripe image: the drawn stripe path, so it can still be clipped to a PNG mask.
          var o = 14 + k * 13;
          ctx.strokeStyle = opts.color;
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          ctx.stroke(new Path2D('M' + (118 + o) + ' 70 C' + (90 + o) + ' 150 ' + (94 + o) + ' 270 ' + (146 + o) + ' 356'));
        }
        ctx.restore();
      };
      for (var i = 0; i < left; i++) one(i, false);
      for (var j = 0; j < right; j++) one(j, true);
      ctx.globalCompositeOperation = 'destination-in';
      if (res[1]) self.draw(ctx, opts.maskKey, res[1]);
      else ctx.fill(new Path2D(HEAD));
      return self.toUrl(canvas);
    });
  };

  // 540 x 540 alpha map of the given layers (for "stay on the mask" and naming spots).
  Layers.prototype.alphaMap = function (keys) {
    var self = this;
    keys = keys.filter(function (k) { return self.has(k); });
    if (!keys.length) return Promise.resolve(null);
    return Promise.all(keys.map(function (k) { return self.load(k); })).then(function (imgs) {
      var canvas = document.createElement('canvas');
      canvas.width = VB.size;
      canvas.height = VB.size;
      var ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, -VB.x, -VB.y);
      imgs.forEach(function (img, i) { self.draw(ctx, keys[i], img); });
      return ctx.getImageData(0, 0, VB.size, VB.size).data;
    });
  };

  function slotNodes(slot) {
    return slot.split ? slot.nodes : [slot];
  }

  function setHref(slot, url) {
    slotNodes(slot).forEach(function (node) {
      if (url) {
        node.setAttribute('href', url);
        node.setAttributeNS(XLINK, 'xlink:href', url);
        node.style.display = '';
      } else {
        node.style.display = 'none';
      }
    });
  }

  /* =====================================================================
   * Configurator
   * =================================================================== */

  function Configurator(root) {
    this.root = root;
    var config = {};
    try {
      config = JSON.parse(root.querySelector('[data-cfg-config]').textContent);
    } catch (e) { /* defaults */ }
    var colors = (config.colors || []).filter(function (c) { return c && c.hex; });
    this.colors = (colors.length ? colors : DEFAULT_COLORS).map(function (c, i) {
      return { id: i, name: c.name || 'Color ' + (i + 1), hex: c.hex };
    });
    this.prices = config.prices || {};
    this.usdRate = +config.usdRate > 0 ? +config.usdRate : 56;
    this.whatsapp = String(config.whatsapp || '').replace(/\D/g, '');
    var layerCfg = config.layers || {};
    layerCfg.stripeSpacing = config.stripeSpacing;
    this.layers = new Layers(layerCfg);
    this.layerToken = 0;

    var find = this.findColor.bind(this);
    var white = find('white'), brown = find('brown');
    this.state = {
      base: brown ? brown.id : 0,
      opening: 'eyes',
      mouth: 'none',
      mouthColor: null, // follows the base colour until chosen
      face: 'none',
      faceColor: find('grey') ? find('grey').id : 0,
      ears: 'none',
      earOuter: null, // follows the base colour until chosen
      earInner: null, // null = automatic: darker outer for bear ears, White otherwise
      acc: {},
      crystalColor: 'red',
      stripes: 0,
      stripeColor: white ? white.id : 0,
      accent: null
    };
    this.pieces = [];
    this.nextId = 1;
    this.selected = null;

    this.step = 1;
    this.steps = root.querySelectorAll('.hira-cfg__step');
    this.total = this.steps.length;
    this.svg = root.querySelector('[data-cfg-svg]');
    this.scene = new Scene(this.svg);
    this.pngBlob = null;

    this.buildSwatches();
    this.fillPriceTags();
    this.bind();
    this.bindDrag();
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

  Configurator.prototype.defaultInnerId = function () {
    var white = this.findColor('white');
    return white ? white.id : 0;
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
  };

  Configurator.prototype.syncInputs = function () {
    var s = this.state;
    var values = {
      'cfg-base': s.base,
      'cfg-earOuter': s.earOuter === null ? s.base : s.earOuter,
      'cfg-earInner': s.earInner === null ? (s.ears === 'bear' ? '' : this.defaultInnerId()) : s.earInner,
      'cfg-stripe': s.stripeColor,
      'cfg-mouth': s.mouthColor === null ? s.base : s.mouthColor,
      'cfg-face': s.faceColor,
      'cfg-accent': s.accent === null ? '' : s.accent
    };
    Object.keys(values).forEach(function (name) {
      this.root.querySelectorAll('input[name="' + name + '"]').forEach(function (input) {
        input.checked = String(input.value) === String(values[name]);
      });
    }, this);
    this.root.querySelectorAll('input[name="acc"]').forEach(function (input) {
      input.checked = !!s.acc[input.value];
    });
  };

  Configurator.prototype.fillPriceTags = function () {
    var prices = this.prices;
    this.root.querySelectorAll('[data-price-tag]').forEach(function (node) {
      var v = +prices[node.getAttribute('data-price-tag')] || 0;
      node.textContent = '+' + formatNumber(v) + ' EGP' + (node.getAttribute('data-price-suffix') || '');
    });
  };

  Configurator.prototype.bind = function () {
    var self = this;
    var form = this.root.querySelector('[data-cfg-form]');

    form.addEventListener('change', function (event) {
      var t = event.target;
      var s = self.state;
      switch (t.name) {
        case 'cfg-base': s.base = +t.value; break;
        case 'cfg-earOuter': s.earOuter = +t.value === s.base ? null : +t.value; break;
        case 'cfg-earInner': s.earInner = +t.value; break;
        case 'cfg-stripe': s.stripeColor = +t.value; break;
        case 'cfg-mouth': s.mouthColor = +t.value === s.base ? null : +t.value; break;
        case 'cfg-accent': s.accent = t.value === '' ? null : +t.value; break;
        case 'opening': s.opening = t.value; break;
        case 'mouth':
          // "Skull mask" is the skull face piece: it replaces the mouth (teeth included).
          s.face = t.value === 'skull' ? 'skull' : 'none';
          s.mouth = t.value === 'skull' ? 'none' : t.value;
          break;
        case 'cfg-face': s.faceColor = +t.value; break;
        case 'ears':
          s.ears = t.value;
          self.scene.setEars(s.ears);
          self.keepPiecesOnMask();
          break;
        case 'crystalColor': s.crystalColor = t.value; self.redrawPieces('crystals'); break;
        case 'acc':
          s.acc[t.value] = t.checked;
          if (t.checked) self.addPiece(t.value);
          else self.removeType(t.value);
          break;
        default: return;
      }
      self.render();
    });

    form.addEventListener('input', function (event) {
      if (event.target.closest('.hira-cfg__field')) self.clearError(event.target);
    });
    form.addEventListener('submit', function (event) { event.preventDefault(); });

    this.root.querySelectorAll('[data-acc-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.addPiece(btn.getAttribute('data-acc-add'));
        self.render();
      });
    });

    var stepStripes = function (delta) {
      self.state.stripes = Math.max(0, Math.min(MAX_STRIPES, self.state.stripes + delta));
      self.render();
    };
    this.root.querySelector('[data-stripes-minus]').addEventListener('click', function () { stepStripes(-1); });
    this.root.querySelector('[data-stripes-plus]').addEventListener('click', function () { stepStripes(1); });

    this.root.querySelector('[data-cfg-next]').addEventListener('click', function () { self.goTo(self.step + 1); });
    this.root.querySelector('[data-cfg-back]').addEventListener('click', function () { self.goTo(self.step - 1); });
    this.root.querySelectorAll('[data-cfg-progress] li').forEach(function (li, i) {
      li.addEventListener('click', function () {
        if (i + 1 <= self.maxStep) self.goTo(i + 1);
      });
    });
    this.root.querySelectorAll('[data-cfg-save]').forEach(function (btn) {
      btn.addEventListener('click', function () { self.save(); });
    });
    this.root.querySelector('[data-cfg-send]').addEventListener('click', function () { self.send(); });
    // "How to measure" guide: thumbnail opens a larger copy in a dialog.
    var guide = this.root.querySelector('[data-measure-dialog]');
    var guideOpen = this.root.querySelector('[data-measure-open]');
    if (guide && guideOpen) {
      guideOpen.addEventListener('click', function () {
        if (guide.showModal) guide.showModal();
        else guide.setAttribute('open', '');
      });
      var closeGuide = function () {
        if (guide.close) guide.close();
        else guide.removeAttribute('open');
        guideOpen.focus();
      };
      guide.querySelector('[data-measure-close]').addEventListener('click', closeGuide);
      // Tap outside the image (on the backdrop) closes it too.
      guide.addEventListener('click', function (event) {
        if (event.target === guide) closeGuide();
      });
    }
    var remind = this.root.querySelector('[data-cfg-remind]');
    if (remind) {
      this.root.querySelector('[data-cfg-remind-save]').addEventListener('click', function () {
        remind.hidden = true;
        self.save();
      });
      this.root.querySelector('[data-cfg-remind-continue]').addEventListener('click', function () {
        remind.hidden = true;
        self.send(true);
      });
    }
    var copy = this.root.querySelector('[data-copy-number]');
    if (copy) {
      copy.addEventListener('click', function () {
        var number = self.root.querySelector('[data-pay-number]').textContent.trim();
        var done = function () {
          copy.textContent = 'Copied';
          setTimeout(function () { copy.textContent = 'Copy number'; }, 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(number).then(done).catch(function () {});
        else done();
      });
    }
    this.root.querySelector('[data-piece-remove]').addEventListener('click', function () {
      if (self.selected) self.removePiece(self.selected.piece);
    });
    window.addEventListener('resize', function () { self.positionTools(); }, { passive: true });
  };

  Configurator.prototype.goTo = function (step, initial) {
    step = Math.max(1, Math.min(this.total, step));
    this.step = step;
    this.maxStep = Math.max(this.maxStep || 1, step);
    this.steps.forEach(function (node) {
      var on = +node.getAttribute('data-step') === step;
      node.hidden = !on;
      node.classList.toggle('is-active', on);
    });
    this.root.querySelectorAll('[data-cfg-progress] li').forEach(function (li, i) {
      li.classList.toggle('is-done', i + 1 < step);
      li.classList.toggle('is-current', i + 1 === step);
      li.classList.toggle('is-reachable', i + 1 <= this.maxStep);
      if (i + 1 === step) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    }, this);
    this.root.querySelector('[data-cfg-back]').hidden = step === 1;
    this.root.querySelector('[data-cfg-next]').hidden = step === this.total;
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
    return {
      base: this.color(s.base),
      accent: s.accent === null ? null : this.color(s.accent),
      earOuter: this.color(s.earOuter === null ? s.base : s.earOuter),
      earInner: this.innerColor(),
      stripe: this.color(s.stripeColor),
      mouth: this.color(s.mouthColor === null ? s.base : s.mouthColor),
      face: this.color(s.faceColor)
    };
  };

  Configurator.prototype.innerColor = function () {
    var s = this.state;
    if (s.earInner !== null) return this.color(s.earInner);
    if (s.ears === 'bear') {
      var outer = this.color(s.earOuter === null ? s.base : s.earOuter);
      return { name: 'darker ' + outer.name.toLowerCase(), hex: shade(outer.hex, 0.22) };
    }
    return this.color(this.defaultInnerId());
  };

  Configurator.prototype.appliqueColor = function () {
    var c = this.resolved();
    if (c.accent) return c.accent.hex;
    return luminance(c.base.hex) < 0.5 ? '#F2EFEA' : '#1A1A1C';
  };

  Configurator.prototype.render = function () {
    var s = this.state;
    var c = this.resolved();
    this.scene.setColors({
      base: c.base.hex,
      earOuter: c.earOuter.hex,
      earInner: c.earInner.hex,
      mouth: c.mouth.hex,
      face: c.face.hex,
      trim: c.accent ? c.accent.hex : shade(c.base.hex, 0.22)
    });
    var mode = this.layerMode();
    this.scene.mannequinSvg.style.display = mode.mannequin ? 'none' : '';
    this.scene.body.style.display = mode.mask ? 'none' : '';
    this.scene.rims.style.display = mode.mask ? 'none' : '';
    this.scene.setOpenings(s.opening, 'none');
    this.scene.setMouthOverlay(mode.mouth ? 'none' : s.mouth);
    this.scene.setFaceOverlay(s.face === 'skull' && !mode.face);
    this.scene.setEars(mode.ears ? 'none' : s.ears);
    this.scene.earType = s.ears;
    this.scene.setStripes(mode.stripesCanvas ? 0 : s.stripes, c.stripe.hex);
    this.updateLayers(mode);

    var applique = this.appliqueColor();
    this.svg.querySelectorAll('[data-applique]').forEach(function (node) {
      node.style.fill = applique;
      node.style.stroke = shade(applique, 0.25);
    });

    // Ear colour pickers once ears are chosen; horns use the outer colour only.
    this.root.querySelector('[data-ear-colors]').hidden = s.ears === 'none';
    this.root.querySelector('[data-ear-inner-wrap]').hidden = s.ears === 'horns';
    this.root.querySelector('[data-ear-outer-label]').textContent = s.ears === 'horns' ? 'Horn color' : 'Ear outer color';

    this.root.querySelector('[data-stripes-value]').textContent = s.stripes;
    this.root.querySelector('[data-stripes-minus]').disabled = s.stripes <= 0;
    this.root.querySelector('[data-stripes-plus]').disabled = s.stripes >= MAX_STRIPES;
    this.root.querySelector('[data-stripe-color]').hidden = s.stripes === 0;
    this.root.querySelector('[data-mouth-color]').hidden = s.mouth === 'none';
    // Skull face piece: its own colour, and it replaces the mouth (teeth included).
    var skull = s.face === 'skull';
    this.root.querySelector('[data-face-color]').hidden = !skull;
    this.root.querySelectorAll('input[name="mouth"]').forEach(function (input) {
      input.checked = input.value === (skull ? 'skull' : s.mouth);
    });

    // Accessory rows: count + "Add another" when active.
    ACC_ORDER.forEach(function (type) {
      var row = this.root.querySelector('[data-acc-row="' + type + '"]');
      if (!row) return;
      var n = this.countOf(type);
      row.querySelector('[data-acc-tools]').hidden = !s.acc[type];
      row.querySelector('[data-acc-count]').textContent = n + (type === 'chain' ? (n === 1 ? ' chain' : ' chains') : (n === 1 ? ' piece' : ' pieces'));
    }, this);
    var crystal = this.root.querySelector('[data-crystal-color]');
    if (crystal) crystal.hidden = !s.acc.crystals;

    this.syncInputs();
    this.renderPrice();
    this.queuePng();
  };

  /* ---------- PNG layers ---------- */

  // Which parts use an uploaded PNG right now (the rest keep their SVG drawing).
  Configurator.prototype.layerMode = function () {
    var s = this.state;
    var L = this.layers;
    var maskKey = s.opening === 'wide' ? 'mask_wide' : 'mask_eyes';
    var mouthKey = s.mouth === 'simple' ? 'mouth_simple' : s.mouth === 'teeth' ? 'mouth_teeth' : null;
    var outerKey = s.ears === 'none' ? null : s.ears === 'horns' ? 'horns' : s.ears + '_outer';
    var ears = !!outerKey && L.has(outerKey);
    var innerKey = ears && s.ears !== 'horns' && L.has(s.ears + '_inner') ? s.ears + '_inner' : null;
    var mask = L.has(maskKey);
    return {
      mannequin: L.has('mannequin'),
      mask: mask, maskKey: maskKey,
      mouth: !!mouthKey && L.has(mouthKey), mouthKey: mouthKey,
      face: s.face === 'skull' && L.has('face_skull'),
      ears: ears, outerKey: outerKey, innerKey: innerKey,
      stripePng: L.has('stripe'),
      stripesCanvas: s.stripes > 0 && (L.has('stripe') || mask)
    };
  };

  Configurator.prototype.updateLayers = function (mode) {
    var self = this;
    var L = this.layers;
    var s = this.state;
    var c = this.resolved();
    var img = this.scene.img;
    var token = ++this.layerToken;
    // Black yarn tinted to a dark grey so the stitch texture stays visible.
    var tint = function (hex) { return luminance(hex) < 0.12 ? '#2b2b2b' : hex; };

    var jobs = [
      ['mannequin', mode.mannequin ? L.tinted('mannequin', null) : null],
      ['mask', mode.mask ? L.tinted(mode.maskKey, tint(c.base.hex)) : null],
      ['mouth', mode.mouth ? L.tinted(mode.mouthKey, tint(c.mouth.hex)) : null],
      ['face', mode.face ? L.tinted('face_skull', tint(c.face.hex)) : null],
      ['stripes', mode.stripesCanvas ? L.stripes({
        usePng: mode.stripePng, color: mode.stripePng ? tint(c.stripe.hex) : c.stripe.hex, count: s.stripes,
        maskKey: mode.mask ? mode.maskKey : null
      }).then(function (url) { return { url: url, own: true }; }) : null],
      ['earInner', mode.innerKey ? L.tinted(mode.innerKey, tint(c.earInner.hex)) : null],
      ['earOuter', mode.ears ? L.tinted(mode.outerKey, tint(c.earOuter.hex)) : null]
    ];
    var keyFor = { mannequin: 'mannequin', mask: mode.maskKey, mouth: mode.mouthKey, face: 'face_skull', earInner: mode.innerKey, earOuter: mode.outerKey, stripes: 'stripe' };

    jobs.forEach(function (job) {
      var slot = job[0];
      var promise = job[1];
      if (!promise) {
        setHref(img[slot], null);
        return;
      }
      promise.then(function (res) {
        if (token !== self.layerToken) {
          if (res.own) L.release(res.url);
          return;
        }
        var nodes = slotNodes(img[slot]);
        if (slot !== 'stripes') {
          nodes.forEach(function (node, i) {
            var half = nodes.length > 1 ? (i === 0 ? -1 : 1) : 0;
            node.setAttribute('transform', L.transformFor(keyFor[slot], half));
          });
        }
        var previous = nodes[0].getAttribute('data-own-url');
        if (previous && previous !== res.url) L.release(previous);
        if (res.own) nodes[0].setAttribute('data-own-url', res.url);
        else nodes[0].removeAttribute('data-own-url');
        setHref(img[slot], res.url);
        self.queuePng();
      }).catch(function () {
        // Image missing, blocked (CORS) or broken: fall back to the SVG part.
        if (keyFor[slot] && slot !== 'stripes') L.failed[keyFor[slot]] = true;
        if (slot === 'stripes') L.failed.stripe = true;
        if (token === self.layerToken) self.render();
      });
    });

    // Alpha maps so pieces stay on the PNG mask / ears.
    Promise.all([
      mode.mask ? L.alphaMap([mode.maskKey]) : Promise.resolve(null),
      mode.ears ? L.alphaMap([mode.outerKey, mode.innerKey].filter(Boolean)) : Promise.resolve(null)
    ]).then(function (maps) {
      if (token !== self.layerToken) return;
      self.scene.alpha = { mask: maps[0], ears: maps[1] };
      self.keepPiecesOnMask();
    }).catch(function () {
      if (token === self.layerToken) self.scene.alpha = null;
    });
  };

  /* ---------- pieces ---------- */

  Configurator.prototype.countOf = function (type) {
    return this.pieces.filter(function (p) { return p.type === type; }).length;
  };

  Configurator.prototype.freeSpot = function (start) {
    var offsets = [[0, 0], [22, 14], [-22, 14], [0, 28], [22, -14], [-22, -14], [0, -28], [36, 0], [-36, 0], [14, 40], [-14, 40]];
    var taken = this.pieces;
    for (var i = 0; i < offsets.length; i++) {
      var x = start[0] + offsets[i][0], y = start[1] + offsets[i][1];
      var clash = taken.some(function (p) { return Math.abs(p.x - x) < 10 && Math.abs(p.y - y) < 10; });
      if (!clash && this.scene.isOnMask(x, y)) return [x, y];
    }
    return [200, 240];
  };

  Configurator.prototype.addPiece = function (type) {
    var spec = ACCESSORIES[type];
    var piece = { id: this.nextId++, type: type };
    if (type === 'chain') {
      var n = this.countOf('chain');
      var earSide = this.state.ears === 'bunny' ? [292, 150] : this.state.ears === 'bear' || this.state.ears === 'cat' ? [272, 104] : [270, 150];
      piece.a = n % 2 ? [400 - earSide[0], earSide[1] + n * 6] : [earSide[0], earSide[1] + n * 6];
      piece.b = n % 2 ? [182, 304] : [218, 304];
      if (!this.scene.isOnMask(piece.a[0], piece.a[1])) piece.a = [258, 160];
      piece.x = piece.a[0];
      piece.y = piece.a[1];
    } else {
      var spot = this.freeSpot(spec.start);
      piece.x = spot[0];
      piece.y = spot[1];
    }
    this.state.acc[type] = true;
    this.pieces.push(piece);
    this.drawPiece(piece);
    this.select(piece, type === 'chain' ? 'b' : null);
    this.revealPreview();
  };

  Configurator.prototype.drawPiece = function (piece) {
    var scene = this.scene;
    var g = piece.node;
    if (!g) {
      g = el('g', { class: 'cfg-piece', 'data-piece': piece.id }, scene.pieces);
      piece.node = g;
    }
    while (g.firstChild) g.removeChild(g.firstChild);

    if (piece.type === 'chain') {
      el('g', { 'data-links': '' }, g);
      ['a', 'b'].forEach(function (end) {
        var h = el('g', { class: 'cfg-handle', 'data-end': end, tabindex: '0', role: 'button' }, g);
        el('circle', { class: 'cfg-hit', r: 16, fill: 'none', 'pointer-events': 'all' }, h);
        el('circle', { r: 3.4, fill: 'none', stroke: scene.url('silver'), 'stroke-width': '2' }, h);
      });
      this.placeChain(piece);
    } else {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      el('circle', { class: 'cfg-hit', r: 16, fill: 'none', 'pointer-events': 'all' }, g);
      scene.drawPieceArt(g, piece.type, { crystalColor: this.state.crystalColor, applique: this.appliqueColor() });
      g.setAttribute('transform', 'translate(' + piece.x.toFixed(1) + ' ' + piece.y.toFixed(1) + ')');
    }
    this.labelPiece(piece);
  };

  Configurator.prototype.placeChain = function (piece) {
    var g = piece.node;
    this.scene.drawChain(g, piece.a, piece.b);
    g.querySelectorAll('.cfg-handle').forEach(function (h) {
      var p = piece[h.getAttribute('data-end')];
      h.setAttribute('transform', 'translate(' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ')');
    });
  };

  Configurator.prototype.labelPiece = function (piece) {
    var scene = this.scene;
    var name = ACCESSORIES[piece.type].label;
    if (piece.type === 'chain') {
      piece.node.querySelectorAll('.cfg-handle').forEach(function (h) {
        var end = h.getAttribute('data-end');
        var p = piece[end];
        h.setAttribute('aria-label', name + ' end ' + (end === 'a' ? '1' : '2') + ' on ' + scene.region(p[0], p[1]) +
          '. Arrow keys move it, Delete removes the chain.');
      });
    } else {
      piece.node.setAttribute('aria-label', name + ' on ' + scene.region(piece.x, piece.y) + '. Arrow keys move it, Delete removes it.');
    }
  };

  Configurator.prototype.redrawPieces = function (type) {
    this.pieces.forEach(function (p) {
      if (!type || p.type === type) this.drawPiece(p);
    }, this);
  };

  Configurator.prototype.removePiece = function (piece) {
    if (piece.node && piece.node.parentNode) piece.node.parentNode.removeChild(piece.node);
    this.pieces = this.pieces.filter(function (p) { return p !== piece; });
    if (!this.countOf(piece.type)) this.state.acc[piece.type] = false;
    this.select(null);
    this.render();
  };

  Configurator.prototype.removeType = function (type) {
    this.pieces.filter(function (p) { return p.type === type; }).forEach(function (p) {
      if (p.node && p.node.parentNode) p.node.parentNode.removeChild(p.node);
    });
    this.pieces = this.pieces.filter(function (p) { return p.type !== type; });
    if (this.selected && this.selected.piece.type === type) this.select(null);
  };

  // After ears change, pull pieces that are no longer on the mask back onto it.
  Configurator.prototype.keepPiecesOnMask = function () {
    var scene = this.scene;
    var pull = function (p) {
      var x = p[0], y = p[1];
      for (var i = 0; i < 30 && !scene.isOnMask(x, y); i++) {
        x += (200 - x) * 0.12;
        y += (230 - y) * 0.12;
      }
      return [x, y];
    };
    this.pieces.forEach(function (piece) {
      if (piece.type === 'chain') {
        piece.a = pull(piece.a);
        piece.b = pull(piece.b);
        this.placeChain(piece);
      } else {
        var p = pull([piece.x, piece.y]);
        piece.x = p[0];
        piece.y = p[1];
        piece.node.setAttribute('transform', 'translate(' + piece.x.toFixed(1) + ' ' + piece.y.toFixed(1) + ')');
      }
      this.labelPiece(piece);
    }, this);
    this.positionTools();
  };

  Configurator.prototype.select = function (piece, end) {
    this.selected = piece ? { piece: piece, end: end || null } : null;
    this.positionTools();
  };

  Configurator.prototype.selectedPoint = function () {
    if (!this.selected) return null;
    var p = this.selected.piece;
    if (p.type === 'chain') return p[this.selected.end || 'b'];
    return [p.x, p.y];
  };

  Configurator.prototype.positionTools = function () {
    var tools = this.root.querySelector('[data-piece-tools]');
    var ring = this.scene.selectRing;
    var pt = this.selectedPoint();
    if (!pt) {
      tools.hidden = true;
      ring.style.display = 'none';
      return;
    }
    ring.style.display = '';
    ring.setAttribute('cx', pt[0]);
    ring.setAttribute('cy', pt[1]);
    var ctm = this.svg.getScreenCTM();
    var box = tools.parentNode.getBoundingClientRect();
    if (!ctm) return;
    var screen = this.scene.point(pt[0], pt[1]).matrixTransform(ctm);
    tools.hidden = false;
    tools.style.left = (screen.x - box.left) + 'px';
    tools.style.top = (screen.y - box.top) + 'px';
    var label = this.selected.piece.type === 'chain' ? 'Remove chain' : 'Remove';
    tools.querySelector('[data-piece-remove]').textContent = label;
  };

  Configurator.prototype.revealPreview = function () {
    var preview = this.root.querySelector('.hira-cfg__preview');
    var r = preview.getBoundingClientRect();
    if (r.bottom < 80 || r.top > window.innerHeight - 80) {
      preview.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  /* ---------- dragging (pointer events: touch + mouse) ---------- */

  Configurator.prototype.toSvg = function (clientX, clientY) {
    var ctm = this.svg.getScreenCTM();
    if (!ctm) return null;
    var p = this.scene.point(clientX, clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  };

  Configurator.prototype.bindDrag = function () {
    var self = this;
    var svg = this.svg;
    var drag = null;
    var frame = null;

    var findPiece = function (target) {
      var g = target.closest && target.closest('.cfg-piece');
      if (!g) return null;
      var id = +g.getAttribute('data-piece');
      var piece = self.pieces.filter(function (p) { return p.id === id; })[0];
      if (!piece) return null;
      var handle = target.closest('.cfg-handle');
      return { piece: piece, end: handle ? handle.getAttribute('data-end') : null };
    };

    var position = function (hit) {
      var p = hit.piece;
      return p.type === 'chain' ? p[hit.end || 'b'] : [p.x, p.y];
    };

    var apply = function () {
      frame = null;
      if (!drag) return;
      var p = drag.hit.piece;
      if (p.type === 'chain') self.placeChain(p);
      else p.node.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')');
      self.positionTools();
    };

    // iOS: stop the page from scrolling when a drag starts on a piece.
    svg.addEventListener('touchstart', function (event) {
      if (event.target.closest && event.target.closest('.cfg-piece')) event.preventDefault();
    }, { passive: false });

    svg.addEventListener('pointerdown', function (event) {
      var hit = findPiece(event.target);
      if (!hit) {
        if (self.selected) self.select(null);
        return;
      }
      // Grabbing the chain itself (not an end) moves the whole chain.
      var whole = hit.piece.type === 'chain' && !hit.end;
      event.preventDefault();
      var pt = self.toSvg(event.clientX, event.clientY);
      var at = whole ? pt : position(hit);
      drag = {
        hit: hit, whole: whole, id: event.pointerId, start: [event.clientX, event.clientY], moved: false,
        offset: [at[0] - pt[0], at[1] - pt[1]], origin: pt,
        ends: whole ? [hit.piece.a.slice(), hit.piece.b.slice()] : null
      };
      try { svg.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
      hit.piece.node.classList.add('is-dragging');
    });

    svg.addEventListener('pointermove', function (event) {
      if (!drag || event.pointerId !== drag.id) return;
      if (!drag.moved && Math.abs(event.clientX - drag.start[0]) + Math.abs(event.clientY - drag.start[1]) < 5) return;
      drag.moved = true;
      var pt = self.toSvg(event.clientX, event.clientY);
      if (!pt) return;
      var p = drag.hit.piece;
      if (drag.whole) {
        var dx = pt[0] - drag.origin[0], dy = pt[1] - drag.origin[1];
        var na = [drag.ends[0][0] + dx, drag.ends[0][1] + dy];
        var nb = [drag.ends[1][0] + dx, drag.ends[1][1] + dy];
        if (!self.scene.isOnMask(na[0], na[1]) || !self.scene.isOnMask(nb[0], nb[1])) return;
        p.a = na;
        p.b = nb;
        if (!frame) frame = window.requestAnimationFrame(apply);
        return;
      }
      var x = pt[0] + drag.offset[0], y = pt[1] + drag.offset[1];
      if (!self.scene.isOnMask(x, y)) return; // stay on the mask or ears
      if (p.type === 'chain') p[drag.hit.end] = [x, y];
      else { p.x = x; p.y = y; }
      if (!frame) frame = window.requestAnimationFrame(apply);
    });

    var end = function (event) {
      if (!drag || event.pointerId !== drag.id) return;
      var hit = drag.hit;
      hit.piece.node.classList.remove('is-dragging');
      try { svg.releasePointerCapture(event.pointerId); } catch (e) { /* ignore */ }
      if (drag.moved) {
        self.labelPiece(hit.piece);
        self.select(hit.piece, hit.end);
        self.queuePng();
      } else {
        self.select(hit.piece, hit.end); // tap: show "Remove" (tap empty space to dismiss)
      }
      drag = null;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    // Keyboard: arrows nudge, Delete/Backspace removes, Enter selects.
    svg.addEventListener('keydown', function (event) {
      var hit = findPiece(event.target);
      if (!hit) return;
      if (hit.piece.type === 'chain' && !hit.end) hit.end = 'b';
      var moves = { ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] };
      if (moves[event.key]) {
        event.preventDefault();
        var at = position(hit);
        var x = at[0] + moves[event.key][0], y = at[1] + moves[event.key][1];
        if (!self.scene.isOnMask(x, y)) return;
        if (hit.piece.type === 'chain') hit.piece[hit.end] = [x, y];
        else { hit.piece.x = x; hit.piece.y = y; }
        drag = { hit: hit };
        apply();
        drag = null;
        self.labelPiece(hit.piece);
        self.select(hit.piece, hit.end);
        self.queuePng();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        self.removePiece(hit.piece);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        self.select(hit.piece, hit.end);
      }
    });
  };

  /* ---------- price ---------- */

  // Every priced selection: { label, qty, unit, egp }. Stripes and accessories
  // are charged per stripe / per placed piece.
  Configurator.prototype.lineItems = function () {
    var s = this.state;
    var p = this.prices;
    var c = this.resolved();
    var price = function (key) { return +p[key] || 0; };
    var item = function (label, unit, qty) {
      qty = qty || 1;
      return { label: label, qty: qty, unit: unit, egp: unit * qty };
    };
    var items = [item('Base custom mask', price('base'))];
    if (s.mouth !== 'none') {
      items.push(item('Mouth (' + MOUTHS[s.mouth] + ', mouth color: ' + c.mouth.name + ')', price(s.mouth === 'teeth' ? 'mouth_teeth' : 'mouth_simple')));
    }
    if (s.face === 'skull') items.push(item('Face piece (Skull, color: ' + c.face.name + ')', price('face_skull')));
    if (s.ears !== 'none') items.push(item(EARS[s.ears], price(EAR_PRICE[s.ears])));
    if (s.stripes > 0) items.push(item('Side stripes (' + c.stripe.name + ')', price('stripe'), s.stripes));
    ACC_ORDER.forEach(function (k) {
      var n = s.acc[k] ? this.countOf(k) : 0;
      if (n) items.push(item(this.accLabel(k), price(ACCESSORIES[k].price), n));
    }, this);
    if (c.accent) items.push(item('Accent color (' + c.accent.name + ')', price('accent')));
    return items;
  };

  // "Crystals (red) × 6 = 210 EGP" / "Bunny ears = 750 EGP"
  function itemText(item) {
    return item.label + (item.qty > 1 ? ' × ' + item.qty : '') + ' = ' + formatNumber(item.egp) + ' EGP';
  }

  Configurator.prototype.accLabel = function (type) {
    if (type === 'crystals') return 'Crystals (' + this.state.crystalColor + ')';
    return ACCESSORIES[type].label;
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
      list.innerHTML = this.lineItems().map(function (item) {
        var label = item.label + (item.qty > 1 ? ' × ' + item.qty : '');
        return '<li><span>' + label.replace(/</g, '&lt;') + '</span><span>' + formatNumber(item.egp) + ' EGP</span></li>';
      }).join('');
    }
  };

  /* ---------- summary / message ---------- */

  // e.g. "2 on forehead, right ear" / "right ear to mouth"
  Configurator.prototype.placement = function (type) {
    var scene = this.scene;
    var list = this.pieces.filter(function (p) { return p.type === type; });
    if (type === 'chain') {
      return list.map(function (p) {
        return scene.region(p.a[0], p.a[1]) + ' to ' + scene.region(p.b[0], p.b[1]);
      }).join('; ');
    }
    var counts = {};
    var order = [];
    list.forEach(function (p) {
      var r = scene.region(p.x, p.y);
      if (!counts[r]) order.push(r);
      counts[r] = (counts[r] || 0) + 1;
    });
    return order.map(function (r) { return counts[r] > 1 ? counts[r] + ' on ' + r : r; }).join(', ');
  };

  Configurator.prototype.accessoryLines = function () {
    return ACC_ORDER.filter(function (k) { return this.state.acc[k] && this.countOf(k); }, this).map(function (k) {
      var n = this.countOf(k);
      return this.accLabel(k) + (n > 1 ? ' x' + n : '') + ': ' + this.placement(k);
    }, this);
  };

  Configurator.prototype.summary = function () {
    var s = this.state;
    var c = this.resolved();
    var ears = EARS[s.ears];
    if (s.ears === 'horns') ears += ' (color: ' + c.earOuter.name + ')';
    else if (s.ears !== 'none') ears += ' (outer: ' + c.earOuter.name + ', inner: ' + c.earInner.name + ')';
    var short = ACC_ORDER.filter(function (k) { return s.acc[k]; }).map(function (k) {
      var n = this.countOf(k);
      return this.accLabel(k) + (n > 1 ? ' x' + n : '');
    }, this);
    return {
      base: c.base.name,
      openings: OPENINGS[s.opening],
      mouth: s.face === 'skull' ? 'Teeth included in the skull' : MOUTHS[s.mouth] + (s.mouth === 'none' ? '' : ' (mouth color: ' + c.mouth.name + ')'),
      face: s.face === 'skull' ? 'Skull (color: ' + c.face.name + ')' : 'None',
      stripes: s.stripes ? s.stripes + ' (' + c.stripe.name + ')' : 'None',
      ears: ears,
      accessories: short.length ? short.join(', ') : 'None',
      accent: c.accent ? c.accent.name : 'None'
    };
  };

  Configurator.prototype.details = function () {
    var form = this.root.querySelector('[data-cfg-form]');
    var get = function (n) { return (form.elements[n] && form.elements[n].value || '').trim(); };
    return {
      name: get('name'), whatsapp: get('whatsapp'), country: get('country'), city: get('city'),
      head: get('head'), email: get('email'), notes: get('notes')
    };
  };

  Configurator.prototype.message = function () {
    var d = this.details();
    var sm = this.summary();
    var price = this.price();
    var acc = this.accessoryLines();
    var priced = this.lineItems().map(function (item) { return '- ' + itemText(item); });
    return [
      "Hi HIRA! Here is my custom order. \uD83D\uDCCE I'm attaching my design image below.",
      '',
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
      'Face piece: ' + sm.face,
      'Ears: ' + sm.ears,
      'Side stripes: ' + sm.stripes,
      'Accessories' + (acc.length ? ' (placement as seen from the front):' : ': None')
    ].concat(acc.map(function (line) { return '- ' + line; }), [
      'Accent color: ' + sm.accent,
      '',
      'Head circumference: ' + d.head + ' cm',
      'Notes: ' + (d.notes || '-'),
      '',
      'Price breakdown:'
    ], priced, [
      '',
      'Estimated price: ' + formatNumber(price.egp) + ' EGP (~$' + formatNumber(price.usd) + ')'
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
    this.root.querySelector('[data-cfg-status]').textContent = text || '';
  };

  Configurator.prototype.send = function (skipReminder) {
    if (!this.validate()) {
      this.status('Please complete the required details.');
      return;
    }
    // Saving first is step 1: remind once before WhatsApp opens without an image.
    var remind = this.root.querySelector('[data-cfg-remind]');
    if (!skipReminder && remind && !this.isSaved()) {
      remind.hidden = false;
      remind.querySelector('[data-cfg-remind-save]').focus();
      return;
    }
    var text = this.message();
    var url = 'https://wa.me/' + this.whatsapp + '?text=' + encodeURIComponent(text);
    this.emailCopy(text);
    // Open synchronously inside the tap so it is never blocked as a popup.
    // ('noopener' in the features would make window.open return null, so clear opener instead.)
    var win = window.open(url, '_blank');
    if (win) win.opener = null;
    else window.location.href = url;
    this.status('WhatsApp is opening with your order. Attach your saved design image in the chat.');
    this.showConfirmation();
  };

  Configurator.prototype.showConfirmation = function () {
    var panel = this.root.querySelector('[data-cfg-confirm]');
    if (!panel) return;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    panel.focus({ preventScroll: true });
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
        method: 'POST', body: new FormData(form), credentials: 'same-origin', keepalive: true, headers: { Accept: 'text/html' }
      }).catch(function () {});
    } catch (e) { /* best effort */ }
  };

  /* ---------- PNG export ---------- */

  Configurator.prototype.queuePng = function () {
    var self = this;
    this.pngBlob = null;
    this.showSaved();
    clearTimeout(this.pngTimer);
    this.pngTimer = setTimeout(function () {
      self.renderPng().then(function (blob) { self.pngBlob = blob; }).catch(function () {});
    }, 400);
  };

  // A standalone copy of the preview: no selection UI, no touch targets.
  Configurator.prototype.svgMarkup = function () {
    var clone = this.svg.cloneNode(true);
    var layers = this.layers;
    clone.querySelectorAll('[data-ui], .cfg-hit, [data-on="false"]').forEach(function (n) { n.remove(); });
    // PNG layers are blob: URLs on screen; embed them so the standalone image can draw them.
    clone.querySelectorAll('image.cfg-png').forEach(function (node) {
      var url = node.getAttribute('href');
      var canvas = url && layers.canvasFor[url];
      if (node.style.display === 'none' || !canvas) {
        node.remove();
        return;
      }
      var data = canvas.toDataURL('image/png');
      node.setAttribute('href', data);
      node.setAttributeNS(XLINK, 'xlink:href', data);
    });
    clone.setAttribute('width', '1080');
    clone.setAttribute('height', '1080');
    return new XMLSerializer().serializeToString(clone);
  };

  Configurator.prototype.renderPng = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      var CW = 1080, CH = 1080; // square, like the preview and the layer PNGs
      var canvas = document.createElement('canvas');
      canvas.width = CW;
      canvas.height = CH;
      var ctx = canvas.getContext('2d');
      var img = new Image();
      var url = URL.createObjectURL(new Blob([self.svgMarkup()], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = function () {
        var bg = ctx.createRadialGradient(CW * 0.5, CH * 0.36, 40, CW * 0.5, CH * 0.42, CW * 0.8);
        bg.addColorStop(0, '#3a1f5c');
        bg.addColorStop(0.45, '#1d1426');
        bg.addColorStop(1, '#0e0d10');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CW, CH);
        ctx.drawImage(img, 0, 0, CW, CH);
        URL.revokeObjectURL(url);

        // Summary on a soft band across the bottom (over the shoulders).
        var sm = self.summary();
        var price = self.price();
        var band = ctx.createLinearGradient(0, CH - 250, 0, CH);
        band.addColorStop(0, 'rgba(10,9,12,0)');
        band.addColorStop(0.35, 'rgba(10,9,12,0.72)');
        band.addColorStop(1, 'rgba(10,9,12,0.9)');
        ctx.fillStyle = band;
        ctx.fillRect(0, CH - 250, CW, 250);
        ctx.fillStyle = '#b08ae0';
        ctx.font = '600 24px sans-serif';
        ctx.fillText('HIRA — DESIGN YOUR OWN', 60, CH - 150);
        ctx.fillStyle = '#ece8f2';
        ctx.font = '21px sans-serif';
        [
          sm.base + ' · ' + sm.openings + ' · Mouth: ' + sm.mouth + ' · Face: ' + sm.face + ' · Ears: ' + sm.ears,
          'Stripes: ' + sm.stripes + ' · Accessories: ' + sm.accessories + ' · Accent: ' + sm.accent,
          'Est. ' + formatNumber(price.egp) + ' EGP (~$' + formatNumber(price.usd) + ')'
        ].forEach(function (line, i) {
          ctx.fillText(line, 60, CH - 112 + i * 32, CW - 120);
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
      try { file = new File([blob], filename, { type: 'image/png' }); } catch (e) { /* older browsers */ }
      var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (coarse && file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'My HIRA design' }).then(function () {
          self.markSaved();
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

  // What the saved image shows; a change after saving means it needs saving again.
  Configurator.prototype.designKey = function () {
    return JSON.stringify([this.state, this.pieces.map(function (p) { return [p.type, p.x, p.y, p.a, p.b]; })]);
  };

  Configurator.prototype.isSaved = function () {
    return this.savedKey === this.designKey();
  };

  Configurator.prototype.markSaved = function () {
    this.savedKey = this.designKey();
    this.showSaved();
  };

  Configurator.prototype.showSaved = function () {
    var saved = this.isSaved();
    this.root.querySelectorAll('[data-cfg-saved]').forEach(function (node) {
      node.hidden = !saved;
      node.closest('[data-cfg-save]').classList.toggle('is-saved', saved);
    });
    if (saved) {
      var remind = this.root.querySelector('[data-cfg-remind]');
      if (remind) remind.hidden = true;
    }
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
    this.markSaved();
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
