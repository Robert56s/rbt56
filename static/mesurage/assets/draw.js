/* Boîte à outils de dessin : schémas de circuits et courbes en SVG, plus les contrôles des démos.
   Utilisation :
     const S = HQ.S(520, 220, 'Description pour lecteur d’écran');
     S.comp('R', 100, 40, 220, 40, { label: 'R1', val: '10 Ω' });   // composant entre deux points (horizontal ou vertical)
     S.wire([[220, 40], [300, 40], [300, 160]]);                    // fil
     return S;                                                       // une figure renvoie S (ou S.node)
   Classes de couleur (thème clair/sombre automatique) : voir « Dessins SVG » dans style.css. */
(function () {
  'use strict';
  const HQ = window.HQ = window.HQ || {};
  const NS = 'http://www.w3.org/2000/svg';
  const el = HQ.el;

  function set(node, attrs) {
    for (const k in attrs) { const v = attrs[k]; if (v != null && v !== false) node.setAttribute(k, v); }
    return node;
  }
  function ensureDefs() {
    if (document.getElementById('hq-defs')) return;
    const svg = document.createElementNS(NS, 'svg');
    set(svg, { id: 'hq-defs', class: 'fig-defs', width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
    const colors = { ah: '--text', ahe: '--accent', ahb: '--bad', ahd: '--accent-2', ahw: '--warn', ahm: '--muted', aho: '--ok' };
    let html = '<defs>';
    for (const id in colors) html += `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0.8 L9,5 L0,9.2 z" style="fill:var(${colors[id]})"/></marker>`;
    svg.innerHTML = html + '</defs>';
    document.body.insertBefore(svg, document.body.firstChild);
  }

  /* Symboles : dessinés le long de l'axe x local, centrés en m. len = longueur occupée, h = demi-hauteur (pour placer l'étiquette). */
  const SYMS = {
    // résistance (zigzag nord-américain)
    R: { len: 40, h: 8, draw(s, m) { s.path(`M${m - 20},0 l3.33,-7 l6.67,14 l6.67,-14 l6.67,14 l6.67,-14 l6.67,14 l3.33,-7`); } },
    // résistance (rectangle, norme internationale)
    Rbox: { len: 40, h: 8, draw(s, m) { s.rect(m - 20, -7, 40, 14, 'sym fill'); } },
    // bobine / inductance
    L: { len: 40, h: 8, draw(s, m) { s.path(`M${m - 20},0 a5,5 0 0 1 10,0 a5,5 0 0 1 10,0 a5,5 0 0 1 10,0 a5,5 0 0 1 10,0`); } },
    // condensateur
    C: { len: 8, h: 12, draw(s, m) { s.line(m - 4, -12, m - 4, 12, 'sym'); s.line(m + 4, -12, m + 4, 12, 'sym'); } },
    // lampe (o.on = allumée)
    lamp: { len: 26, h: 13, draw(s, m, o) { if (o.on) s.circle(m, 0, 21, 'lamp-glow'); s.circle(m, 0, 13, 'sym fill' + (o.on ? ' lamp-on' : '')); s.line(m - 9, -9, m + 9, 9, 'sym'); s.line(m - 9, 9, m + 9, -9, 'sym'); } },
    // source de tension continue (le + est du côté du 2e point)
    V: { len: 30, h: 15, draw(s, m, o) { s.circle(m, 0, 15, 'sym fill'); s.textU(m + 7, 0, '+', o._ang, 'b'); s.textU(m - 7, 0, '−', o._ang, 'b'); } },
    // source alternative
    AC: { len: 30, h: 15, draw(s, m) { s.circle(m, 0, 15, 'sym fill'); s.path(`M${m - 9},0 q4.5,-10 9,0 t9,0`); } },
    // pile (grande plaque = +, du côté du 2e point)
    bat: { len: 8, h: 13, draw(s, m) { s.line(m - 4, -6, m - 4, 6, 'sym thk'); s.line(m + 4, -13, m + 4, 13, 'sym'); } },
    // interrupteur (o.closed)
    sw: { len: 34, h: 10, draw(s, m, o) { s.circle(m - 15, 0, 2.6, 'sym fill'); s.circle(m + 15, 0, 2.6, 'sym fill'); if (o.closed) s.line(m - 13, 0, m + 13, 0, 'sym'); else s.line(m - 13, -1, m + 11, -15, 'sym'); } },
    fuse: { len: 32, h: 7, draw(s, m) { s.rect(m - 16, -6, 32, 12, 'sym fill', 2); s.line(m - 16, 0, m + 16, 0, 'sym'); } },
    // disjoncteur
    brk: { len: 34, h: 12, draw(s, m) { s.circle(m - 15, 0, 2.6, 'sym fill'); s.circle(m + 15, 0, 2.6, 'sym fill'); s.path(`M${m - 13},-4 Q${m},-24 ${m + 13},-4`); } },
    // appareil de mesure : o.letter = 'V', 'A', 'W', 'Ω', 'kWh'
    meter: { len: 32, h: 16, draw(s, m, o) { s.circle(m, 0, 16, 'sym fill'); s.textU(m, 0, o.letter || 'V', o._ang, 'b' + ((o.letter || '').length > 2 ? ' xs' : '')); } },
    motor: { len: 34, h: 17, draw(s, m, o) { s.circle(m, 0, 17, 'sym fill'); s.textU(m, 0, o.letter || 'M', o._ang, 'b'); } },
    // bobine de relais ou de contacteur (schéma de commande)
    coil: { len: 28, h: 14, draw(s, m, o) { s.circle(m, 0, 14, 'sym fill'); s.textU(m, 0, o.letter || 'K', o._ang, 'b sm'); } },
    // contacts de schéma de commande : normalement ouvert / normalement fermé
    no: { len: 10, h: 11, draw(s, m) { s.line(m - 5, -11, m - 5, 11, 'sym'); s.line(m + 5, -11, m + 5, 11, 'sym'); } },
    nc: { len: 10, h: 11, draw(s, m) { s.line(m - 5, -11, m - 5, 11, 'sym'); s.line(m + 5, -11, m + 5, 11, 'sym'); s.line(m - 10, 11, m + 10, -11, 'sym'); } },
    // boutons-poussoirs NO et NF
    pbno: { len: 28, h: 14, draw(s, m) { s.circle(m - 12, 0, 2.6, 'sym fill'); s.circle(m + 12, 0, 2.6, 'sym fill'); s.line(m - 14, -9, m + 14, -9, 'sym'); s.line(m, -9, m, -19, 'sym'); } },
    pbnc: { len: 28, h: 14, draw(s, m) { s.circle(m - 12, 0, 2.6, 'sym fill'); s.circle(m + 12, 0, 2.6, 'sym fill'); s.line(m - 14, 4, m + 14, 4, 'sym'); s.line(m, 4, m, -15, 'sym'); } },
    // transformateur de courant sur un conducteur (bornes du secondaire renvoyées : s1, s2)
    ct: { len: 0, h: 6, draw(s, m) { s.path(`M${m - 10},6 a5,5 0 0 0 10,0 a5,5 0 0 0 10,0`); }, extra(loc, m) { return { s1: loc(m - 10, 6), s2: loc(m + 10, 6) }; } }
  };

  class Svg {
    constructor(w, h, label) {
      ensureDefs();
      this.w = w; this.h = h;
      this.node = document.createElementNS(NS, 'svg');
      set(this.node, { viewBox: `0 0 ${w} ${h}`, width: w, height: h, class: 'hq', role: 'img', 'aria-label': label || null });
      this.parent = this.node;
    }
    add(tag, attrs, text) {
      const e = set(document.createElementNS(NS, tag), attrs || {});
      if (text != null) e.textContent = text;
      this.parent.appendChild(e);
      return e;
    }
    // groupe : S.g({ transform: '...' }, () => { ...dessins... })
    g(attrs, fn) {
      const g = this.add('g', attrs); const prev = this.parent; this.parent = g;
      try { if (fn) fn(g); } finally { this.parent = prev; }
      return g;
    }
    line(x1, y1, x2, y2, cls) { return this.add('line', { x1, y1, x2, y2, class: cls || 'wire' }); }
    wire(pts, cls) { return this.add('polyline', { points: pts.map(p => p[0] + ',' + p[1]).join(' '), class: cls || 'wire' }); }
    path(d, cls) { return this.add('path', { d, class: cls || 'sym' }); }
    rect(x, y, w, h, cls, r) { return this.add('rect', { x, y, width: w, height: h, rx: r || 0, class: cls || 'sym' }); }
    circle(cx, cy, r, cls) { return this.add('circle', { cx, cy, r, class: cls || 'sym' }); }
    dot(x, y, r) { return this.add('circle', { cx: x, cy: y, r: r || 3.2, class: 'dot' }); }
    // texte : str peut être un tableau (une ligne par élément). opts : anchor ('start' | 'middle' | 'end'), cls
    text(x, y, str, opts) {
      opts = opts || {};
      const lines = Array.isArray(str) ? str : [str];
      const t = this.add('text', { x, y, 'text-anchor': opts.anchor || 'middle', class: opts.cls || null });
      if (lines.length === 1) t.textContent = lines[0];
      else lines.forEach((ln, i) => { const ts = document.createElementNS(NS, 'tspan'); set(ts, { x, dy: i ? '1.25em' : 0 }); ts.textContent = ln; t.appendChild(ts); });
      return t;
    }
    // texte droit à l'intérieur d'un groupe pivoté (usage interne des symboles)
    textU(x, y, str, ang, cls) {
      return this.add('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: cls || null, transform: ang ? `rotate(${-ang} ${x} ${y})` : null }, str);
    }
    // flèche : marker = 'ah' (texte), 'ahe' (accent), 'ahb' (rouge), 'ahd' (vert-bleu), 'ahw' (orangé), 'ahm' (gris), 'aho' (vert)
    arrow(x1, y1, x2, y2, cls, marker) { return this.add('line', { x1, y1, x2, y2, class: cls || 'ln', 'marker-end': `url(#${marker || 'ah'})` }); }
    // flèche de courant posée le long d'un fil, avec étiquette
    current(x1, y1, x2, y2, label, opts) {
      opts = opts || {};
      const a = this.arrow(x1, y1, x2, y2, opts.cls || 'c2', opts.marker || 'ahb');
      if (label) {
        const horiz = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
        if (horiz) this.text((x1 + x2) / 2, Math.min(y1, y2) - 6, label, { cls: opts.tcls || 'sm th' });
        else this.text(Math.max(x1, x2) + 6, (y1 + y2) / 2 + 4, label, { anchor: 'start', cls: opts.tcls || 'sm th' });
      }
      return a;
    }
    // zone cliquable transparente
    hit(x, y, w, h, onclick, title) {
      const r = this.add('rect', { x, y, width: w, height: h, rx: 6, class: 'hit', tabindex: 0, role: 'button', 'aria-label': title || null });
      r.addEventListener('click', onclick);
      r.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onclick(ev); } });
      return r;
    }
    /* composant entre (x1,y1) et (x2,y2) : fils d'amenée + symbole centré.
       o : label, val (2e ligne), side ('t' | 'b' | 'l' | 'r'), wire (classe des fils), plus les options du symbole (on, closed, letter).
       Renvoie { a, b, mid, g } et, pour 'ct', les bornes s1 et s2 du secondaire. */
    comp(type, x1, y1, x2, y2, o) {
      o = Object.assign({}, o || {});
      const def = SYMS[type]; if (!def) throw new Error('Composant inconnu : ' + type);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
      const rad = Math.atan2(dy, dx), ang = Math.round(rad * 180 / Math.PI);
      const m = L / 2, half = def.len / 2;
      o._ang = ang;
      const g = this.g({ transform: `translate(${x1},${y1}) rotate(${ang})` }, () => {
        if (def.len === 0) this.line(0, 0, L, 0, o.wire);
        else { if (m - half > 0.5) { this.line(0, 0, m - half, 0, o.wire); this.line(m + half, 0, L, 0, o.wire); } }
        def.draw(this, m, o);
      });
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const horiz = Math.abs(dx) >= Math.abs(dy);
      const lines = [o.label, o.val].filter(v => v != null && v !== '');
      if (lines.length) {
        const side = o.side || (horiz ? 't' : 'r');
        const off = def.h + 8;
        const cls = i => (i === 0 ? (o.cls || 'b') : 'sm');
        lines.forEach((ln, i) => {
          if (side === 't') this.text(mx, my - off - (lines.length - 1 - i) * 15, ln, { cls: cls(i) });
          else if (side === 'b') this.text(mx, my + off + 11 + i * 15, ln, { cls: cls(i) });
          else if (side === 'r') this.text(mx + off, my + 4 + (i - (lines.length - 1) / 2) * 15, ln, { anchor: 'start', cls: cls(i) });
          else this.text(mx - off, my + 4 + (i - (lines.length - 1) / 2) * 15, ln, { anchor: 'end', cls: cls(i) });
        });
      }
      const loc = (px, py) => [x1 + Math.cos(rad) * px - Math.sin(rad) * py, y1 + Math.sin(rad) * px + Math.cos(rad) * py];
      const out = { a: [x1, y1], b: [x2, y2], mid: [mx, my], g };
      if (def.extra) Object.assign(out, def.extra(loc, m));
      return out;
    }
    // mise à la terre sous le point (x, y)
    gnd(x, y) {
      this.line(x, y, x, y + 8, 'wire');
      this.line(x - 11, y + 8, x + 11, y + 8, 'sym'); this.line(x - 7, y + 12.5, x + 7, y + 12.5, 'sym'); this.line(x - 3, y + 17, x + 3, y + 17, 'sym');
    }
    /* transformateur vertical centré en (x, y) : primaire à gauche, secondaire à droite, noyau au centre.
       o.tap = true ajoute une prise médiane au secondaire. Renvoie les bornes p1, p2 (haut, bas), s1, s2 et sc (prise médiane). */
    tr(x, y, o) {
      o = o || {};
      const hump = (cx, sweep) => { let d = `M${cx},${y - 24}`; for (let i = 0; i < 4; i++) d += ` a6,6 0 0 ${sweep} 0,12`; return d; };
      this.path(hump(x - 12, 1)); this.path(hump(x + 12, 0));
      if (!o.air) { this.line(x - 2.5, y - 27, x - 2.5, y + 27, 'sym'); this.line(x + 2.5, y - 27, x + 2.5, y + 27, 'sym'); }
      return { p1: [x - 12, y - 24], p2: [x - 12, y + 24], s1: [x + 12, y - 24], s2: [x + 12, y + 24], sc: [x + 12, y] };
    }
    /* repère de courbes. o : x, y, w, h (zone de tracé), xr [min, max], yr [min, max], xlabel, ylabel, gridx, gridy (nombre de divisions).
       Renvoie { sx, sy, curve(fn, classe, n), xtick(v, texte), ytick(v, texte) }. */
    plot(o) {
      const self = this;
      const sx = v => o.x + (v - o.xr[0]) / (o.xr[1] - o.xr[0]) * o.w;
      const sy = v => o.y + o.h - (v - o.yr[0]) / (o.yr[1] - o.yr[0]) * o.h;
      if (o.gridx) for (let i = 0; i <= o.gridx; i++) { const X = o.x + o.w * i / o.gridx; this.line(X, o.y, X, o.y + o.h, 'grid'); }
      if (o.gridy) for (let i = 0; i <= o.gridy; i++) { const Y = o.y + o.h * i / o.gridy; this.line(o.x, Y, o.x + o.w, Y, 'grid'); }
      const y0 = (o.yr[0] < 0 && o.yr[1] > 0) ? sy(0) : o.y + o.h;
      this.arrow(o.x, y0, o.x + o.w + 12, y0, 'ax');
      this.arrow(o.x, o.y + o.h, o.x, o.y - 12, 'ax');
      if (o.xlabel) this.text(o.x + o.w + 16, y0 + 4, o.xlabel, { anchor: 'start', cls: 'sm' });
      if (o.ylabel) this.text(o.x, o.y - 18, o.ylabel, { cls: 'sm' });
      return {
        sx, sy, y0,
        curve(fn, cls, n) {
          n = n || 200; let d = '';
          for (let i = 0; i <= n; i++) { const xv = o.xr[0] + (o.xr[1] - o.xr[0]) * i / n; d += (i ? 'L' : 'M') + sx(xv).toFixed(1) + ',' + sy(fn(xv)).toFixed(1); }
          return self.path(d, cls || 'c1');
        },
        xtick(v, label) { self.line(sx(v), y0 - 4, sx(v), y0 + 4, 'ax'); if (label != null) self.text(sx(v), y0 + 17, label, { cls: 'sm mut' }); },
        ytick(v, label) { self.line(o.x - 4, sy(v), o.x + 4, sy(v), 'ax'); if (label != null) self.text(o.x - 7, sy(v) + 4, label, { anchor: 'end', cls: 'sm mut' }); }
      };
    }
    /* cadran de compteur : value de 0 à 10 (décimal), cw = sens horaire (sinon antihoraire). */
    dial(cx, cy, r, value, cw, label) {
      this.circle(cx, cy, r, 'sym fill');
      for (let d = 0; d < 10; d++) {
        const th = (cw ? d : -d) * 36 * Math.PI / 180;
        const sn = Math.sin(th), cs = Math.cos(th);
        this.line(cx + (r - 4) * sn, cy - (r - 4) * cs, cx + r * sn, cy - r * cs, 'sym');
        this.add('text', { x: cx + (r - 13) * sn, y: cy - (r - 13) * cs, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'sm b' }, String(d));
      }
      const tn = (cw ? value : -value) * 36 * Math.PI / 180;
      this.line(cx, cy, cx + (r - 20) * Math.sin(tn), cy - (r - 20) * Math.cos(tn), 'needle');
      this.circle(cx, cy, 3.2, 'dot');
      // petite flèche courbe indiquant le sens de rotation
      const a0 = cw ? -40 : 40, a1 = cw ? 40 : -40, R = r + 9;
      const p = a => [cx + R * Math.sin(a * Math.PI / 180), cy - R * Math.cos(a * Math.PI / 180)];
      const A = p(a0), B = p(a1);
      this.add('path', { d: `M${A[0].toFixed(1)},${A[1].toFixed(1)} A${R},${R} 0 0 ${cw ? 1 : 0} ${B[0].toFixed(1)},${B[1].toFixed(1)}`, class: 'dash', 'marker-end': 'url(#ahm)' });
      if (label) this.text(cx, cy + r + 20, label, { cls: 'sm mut' });
    }
  }
  HQ.S = (w, h, label) => new Svg(w, h, label);
  HQ.SYMS = SYMS;

  /* ---------- Contrôles des démos ---------- */
  function numInput(label, value, attrs) {
    const input = el('input', Object.assign({ type: 'number', value, step: 'any' }, attrs || {}));
    return { lab: el('label', {}, [label, input]), input };
  }
  function rangeInput(label, value, min, max, step, fmt) {
    fmt = fmt || (v => v);
    const input = el('input', { type: 'range', min, max, step, value });   // min, max et step avant value
    const val = el('span', { class: 'val' }, fmt(value));
    const lab = el('label', {}, [el('span', { html: label + ' : ' }, [val]), input]);
    input.addEventListener('input', () => { val.textContent = fmt(parseFloat(input.value)); });
    return { lab, input, val, get value() { return parseFloat(input.value); } };
  }
  function selectInput(label, options, value) {
    const sel = el('select');
    options.forEach(o => sel.appendChild(el('option', { value: o[0] }, o[1])));
    if (value !== undefined) sel.value = value;
    return { lab: el('label', {}, [label, sel]), input: sel };
  }
  // boutons segmentés : seg([['a', 'Texte A'], ['b', 'Texte B']], 'a', valeur => ...)
  function seg(options, value, onchange) {
    const box = el('div', { class: 'seg', role: 'group' });
    const api = { node: box, value };
    options.forEach(o => {
      const b = el('button', { type: 'button', class: o[0] === value ? 'on' : null }, o[1]);
      b.addEventListener('click', () => {
        api.value = o[0];
        box.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on');
        if (onchange) onchange(o[0]);
      });
      box.appendChild(b);
    });
    return api;
  }
  function readout(pairs) {
    const r = el('div', { class: 'readout' });
    pairs.forEach(p => r.appendChild(el('div', { class: 'stat' }, [el('div', { class: 'k', html: p[0] }), el('div', { class: 'v', html: p[1] })])));
    return r;
  }
  function header(container, title, desc) {
    container.appendChild(el('p', { class: 'w-title' }, title));
    if (desc) container.appendChild(el('p', { class: 'w-desc', html: desc }));
  }
  // animation : anim(t => { ... }) où t est en secondes ; renvoie { play(), pause(), toggle(), running }
  function anim(step) {
    let raf = null, t0 = null, acc = 0, last = 0;
    const loop = ts => { if (t0 === null) t0 = ts; last = acc + (ts - t0) / 1000; step(last); raf = requestAnimationFrame(loop); };
    const api = {
      play() { if (raf) return; t0 = null; raf = requestAnimationFrame(loop); },
      pause() { if (!raf) return; cancelAnimationFrame(raf); raf = null; acc = last; },
      toggle() { if (raf) api.pause(); else api.play(); return !!raf; },
      get running() { return !!raf; }
    };
    return api;
  }
  HQ.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  HQ.wk = { el, numInput, rangeInput, selectInput, seg, readout, header, anim };
})();
