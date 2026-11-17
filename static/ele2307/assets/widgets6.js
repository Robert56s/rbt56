/* ELE2307 - démonstrations interactives du cours 10, la jonction PN (s'appuie sur la boîte à outils de widgets.js) */
(function () {
  'use strict';
  const W = window.ELE && window.ELE.wk;
  if (!W) { console.error('widgets.js doit être chargé avant widgets6.js'); return; }
  const { el, rangeInput, readout, header, setupCanvas, drawAxes, fr, sci, sup, cssVar } = W;
  const KB = 8.617333e-5, Q = 1.602177e-19, EPS = 1.04e-12, EG = 1.12;     // eV/K, C, F/cm (silicium), eV
  const val = inp => parseFloat(inp.value);
  const vt = T => KB * T;                                                    // kT/q en volts
  /** Porteurs intrinsèques du silicium (cm⁻³), calés sur 1,5 × 10¹⁰ à 300 K. */
  const ni = T => 1.5e10 * Math.pow(T / 300, 1.5) * Math.exp(-EG / (2 * KB) * (1 / T - 1 / 300));
  const colors = () => ({ e: cssVar('--accent'), h: cssVar('--bad'), d: cssVar('--accent-2'), w: cssVar('--warn'), t: cssVar('--text'), m: cssVar('--muted'), s: cssVar('--surface'), s2: cssVar('--surface-2') });
  function numIn(labelHtml, value, attrs = {}) {
    const input = el('input', Object.assign({ type: 'number', value }, attrs));
    return { lab: el('label', {}, [el('span', { html: labelHtml }), input]), input };
  }
  function selIn(labelHtml, options, value) {
    const sel = el('select');
    options.forEach(([v, t]) => sel.appendChild(el('option', { value: v }, t)));
    if (value !== undefined) sel.value = value;
    return { lab: el('label', {}, [el('span', { html: labelHtml }), sel]), input: sel };
  }
  function polyline(ctx, pts, color, width = 2.2, dash = null) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.beginPath();
    pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.stroke(); ctx.setLineDash([]);
  }
  function legend(ctx, items, x, y) {
    ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    items.forEach(([name, col, dash], i) => {
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(x, y + 16 * i); ctx.lineTo(x + 18, y + 16 * i); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = cssVar('--text'); ctx.fillText(name, x + 24, y + 16 * i);
    });
  }
  function arrowLine(ctx, x1, y1, x2, y2, color, width = 2) {
    const a = Math.atan2(y2 - y1, x2 - x1), hl = 8;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - hl * Math.cos(a - 0.4), y2 - hl * Math.sin(a - 0.4)); ctx.lineTo(x2 - hl * Math.cos(a + 0.4), y2 - hl * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
  }
  const pow10 = v => '10^' + fr(v, 2) + ' cm⁻³';
  const len = cm => (cm >= 1e-5 ? fr(cm * 1e4, 3) + ' µm' : fr(cm * 1e7, 2) + ' nm');
  /** Notation scientifique systématique : 1,45 × 10⁴ */
  const sc = (x, d = 2) => { if (!isFinite(x) || x === 0) return String(x); let e = Math.floor(Math.log10(Math.abs(x))), m = Number((x / Math.pow(10, e)).toFixed(d)); if (Math.abs(m) >= 10) { m /= 10; e += 1; } return fr(m, d) + ' × 10' + sup(e); };

  /** Jonction abrupte : barrière, largeurs, champ maximal, capacité par unité de surface. vd : tension appliquée (positive en avant). */
  function junction(NA, ND, T, vd) {
    const VT = vt(T), n = ni(T), VB = VT * Math.log(NA * ND / (n * n));
    const V = Math.max(VB - vd, 0.02 * VB);
    const wn = Math.sqrt(2 * EPS * V / (Q * ND * (1 + ND / NA))), wp = wn * ND / NA, Wd = wn + wp;
    return { VT, ni: n, VB, V, wn, wp, W: Wd, Emax: 2 * V / Wd, C: EPS / Wd, clamped: VB - vd < 0.02 * VB };
  }

  /* ===================== Zone désertée : charge, champ, potentiel ===================== */
  function widgetPnJunction(c) {
    header(c, 'Zone désertée : charge, champ et potentiel',
      'Choisissez les dopages, la température et la tension appliquée V<sub>D</sub> (négative en polarisation inverse). Les trois courbes de la figure 4 se redessinent à l’échelle : la zone désertée s’étend du côté le moins dopé et s’élargit en polarisation inverse.');
    const lNA = rangeInput('Dopage du côté P : N<sub>A</sub>', 15, 14, 19, 0.25, pow10);
    const lND = rangeInput('Dopage du côté N : N<sub>D</sub>', 17, 14, 19, 0.25, pow10);
    const T = rangeInput('Température T (K)', 300, 250, 450, 5, v => fr(v, 0));
    const VD = rangeInput('Tension appliquée V<sub>D</sub> (V)', 0, -10, 0.6, 0.05, v => fr(v, 2));
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [lND.lab, lNA.lab, T.lab, VD.lab]), canvas, out);
    function update() {
      const NA = Math.pow(10, val(lNA.input)), ND = Math.pow(10, val(lND.input)), t = val(T.input), vd = val(VD.input);
      const j = junction(NA, ND, t, vd), C = colors();
      const { ctx, w, h } = setupCanvas(canvas, 400);
      const x0 = 104, x1 = w - 16, span = 1.7 * j.W, xmin = -j.wn - 0.35 * j.W;
      const sx = x => x0 + (x - xmin) / span * (x1 - x0);
      const xa = sx(-j.wn), xj = sx(0), xb = sx(j.wp);
      ctx.font = '12px sans-serif';
      // bandeau : jonction
      ctx.globalAlpha = 0.16; ctx.fillStyle = C.e; ctx.fillRect(x0, 10, xa - x0, 26); ctx.fillStyle = C.h; ctx.fillRect(xb, 10, x1 - xb, 26); ctx.globalAlpha = 1;
      ctx.strokeStyle = C.m; ctx.lineWidth = 1; ctx.strokeRect(x0, 10, x1 - x0, 26);
      ctx.fillStyle = C.t; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (xa - x0 > 60) ctx.fillText('zone neutre N', (x0 + xa) / 2, 23); if (x1 - xb > 60) ctx.fillText('zone neutre P', (xb + x1) / 2, 23);
      ctx.fillStyle = C.m; if (xb - xa > 86) ctx.fillText('zone désertée', (xa + xb) / 2, 23);
      const rows = [{ y0: 52, y1: 142, name: 'charge Q(x)' }, { y0: 162, y1: 252, name: 'champ E(x)' }, { y0: 272, y1: 362, name: 'potentiel V(x)' }];
      // repères verticaux
      ctx.strokeStyle = C.m; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      [xa, xj, xb].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 36); ctx.lineTo(x, 362); ctx.stroke(); });
      ctx.setLineDash([]);
      rows.forEach(r => { ctx.fillStyle = C.m; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(r.name, 4, r.y0 - 2); });
      // charge : rectangles (hauteur proportionnelle au dopage, 3 px au minimum pour rester visible)
      let r = rows[0]; const mid = (r.y0 + r.y1) / 2, half = (r.y1 - r.y0) / 2 - 4, big = Math.max(NA, ND);
      const hD = Math.max(3, half * ND / big), hA = Math.max(3, half * NA / big);
      ctx.globalAlpha = 0.3; ctx.fillStyle = C.d; ctx.fillRect(xa, mid - hD, xj - xa, hD); ctx.fillStyle = C.w; ctx.fillRect(xj, mid, xb - xj, hA); ctx.globalAlpha = 1;
      ctx.strokeStyle = C.d; ctx.lineWidth = 1.5; ctx.strokeRect(xa, mid - hD, xj - xa, hD); ctx.strokeStyle = C.w; ctx.strokeRect(xj, mid, xb - xj, hA);
      ctx.strokeStyle = C.t; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x1, mid); ctx.stroke();
      ctx.fillStyle = C.d; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('ions donneurs +', x0 + 4, mid - 4);
      ctx.fillStyle = C.w; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('ions accepteurs −', x1 - 4, mid + 4);
      // champ : triangle
      r = rows[1];
      ctx.globalAlpha = 0.14; ctx.fillStyle = C.e; ctx.beginPath(); ctx.moveTo(xa, r.y1); ctx.lineTo(xj, r.y0 + 6); ctx.lineTo(xb, r.y1); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      polyline(ctx, [[x0, r.y1], [xa, r.y1], [xj, r.y0 + 6], [xb, r.y1], [x1, r.y1]], C.e, 2.4);
      ctx.fillStyle = C.t; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('champ maximal : ' + sc(j.Emax) + ' V/cm', Math.min(xj + 10, x1 - 190), r.y0);
      // potentiel : deux paraboles
      r = rows[2]; const pts = [];
      for (let i = 0; i <= 160; i++) {
        const x = xmin + span * i / 160; let v;
        if (x <= -j.wn) v = j.V; else if (x >= j.wp) v = 0;
        else if (x <= 0) v = j.V - Q * ND / (2 * EPS) * (j.wn + x) * (j.wn + x); else v = Q * NA / (2 * EPS) * (x - j.wp) * (x - j.wp);
        pts.push([sx(x), r.y1 - (r.y1 - r.y0 - 8) * v / j.V]);
      }
      polyline(ctx, pts, C.e, 2.4);
      ctx.fillStyle = C.t; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('côté N : ' + fr(j.V, 3) + ' V', x0 + 4, r.y0 + 6);
      ctx.textAlign = 'right'; ctx.fillText('côté P : 0 V', x1 - 4, r.y1 - 3);
      // axe x
      ctx.fillStyle = C.m; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const tightN = xj - xa < 26, tightP = xb - xj < 26;
      ctx.textAlign = tightN ? 'right' : 'center'; ctx.fillText('−wₙ', xa - (tightN ? 3 : 0), 366);
      ctx.textAlign = tightP ? 'left' : 'center'; ctx.fillText('wₚ', xb + (tightP ? 3 : 0), 366);
      ctx.textAlign = tightN && !tightP ? 'left' : (tightP && !tightN ? 'right' : 'center'); ctx.fillText('0', xj + (tightN && !tightP ? 3 : (tightP && !tightN ? -3 : 0)), 366);
      ctx.textAlign = 'right'; ctx.fillText('largeur affichée : ' + len(span), x1, 384);
      out.innerHTML = '';
      out.appendChild(readout([
        ['Barrière à l’équilibre V<sub>B</sub> = (kT/q) ln(N<sub>A</sub>N<sub>D</sub>/n<sub>i</sub>²)', fr(j.VB, 3) + ' V'],
        ['Barrière sous tension V<sub>B</sub> − V<sub>D</sub>', fr(j.V, 3) + ' V'],
        ['w<sub>n</sub> (côté N)', len(j.wn)], ['w<sub>p</sub> (côté P)', len(j.wp)], ['W = w<sub>n</sub> + w<sub>p</sub>', len(j.W)],
        ['Champ maximal E<sub>max</sub> = 2(V<sub>B</sub> − V<sub>D</sub>)/W', sc(j.Emax) + ' V/cm'],
        ['Capacité C<sub>d</sub>/A = ε<sub>s</sub>/W', fr(j.C * 1e9, 2) + ' nF/cm²'],
        ['n<sub>i</sub> à cette température', sc(j.ni) + ' cm⁻³'], ['kT/q', fr(j.VT * 1000, 2) + ' mV'],
        ['Minoritaires : n<sub>pe</sub> et p<sub>ne</sub>', sc(j.ni * j.ni / NA) + ' et ' + sc(j.ni * j.ni / ND) + ' cm⁻³']
      ]));
      out.appendChild(el('p', { class: 'w-note', html: (j.clamped ? 'La tension appliquée atteint la barrière : le modèle de la zone désertée ne s’applique plus, le calcul est bloqué à 2 % de V<sub>B</sub>. ' : '')
        + 'Valeurs par défaut : celles de l’exercice 3 des notes (0,693 V ; 9,4 nm et 0,94 µm ; 1,45 × 10⁴ V/cm ; 10,9 nF/cm²). À essayer : égaliser les deux dopages (zone symétrique), puis appliquer −5 V (tout s’élargit, le champ augmente, la capacité baisse). Les hauteurs des deux rectangles de charge sont proportionnelles aux dopages et leurs aires sont égales.' }));
    }
    [lNA.input, lND.input, T.input, VD.input].forEach(i => i.addEventListener('input', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Capacité de la diode en fonction de la tension ===================== */
  function widgetCapacitance(c) {
    header(c, 'Capacité de la diode : zone désertée et stockage',
      'C<sub>d</sub> = C<sub>d</sub>(0)/√(1 − V<sub>D</sub>/V<sub>B</sub>) et C<sub>s</sub> = τ<sub>T</sub> dI<sub>D</sub>/dV<sub>D</sub>, tracées en échelle logarithmique. En polarisation inverse seule la zone désertée compte ; en polarisation avant la capacité de stockage prend le dessus.');
    const C0 = numIn('C<sub>d</sub>(0) (pF)', 2, { step: 'any', min: 0 }), VB = numIn('V<sub>B</sub> (V)', 0.8, { step: 'any', min: 0.1 });
    const tau = numIn('τ<sub>T</sub> (ns)', 5, { step: 'any', min: 0 }), lIS = rangeInput('Courant de saturation I<sub>S</sub>', -14, -16, -10, 0.25, v => '10^' + fr(v, 2) + ' A');
    const n = rangeInput('Facteur n', 1, 1, 2, 0.01, v => fr(v, 2));
    const VD = rangeInput('Tension V<sub>D</sub> (V)', -5, -10, 0.78, 0.02, v => fr(v, 2));
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [C0.lab, VB.lab, tau.lab, lIS.lab, n.lab, VD.lab]), canvas, out);
    function update() {
      const c0 = Math.max(val(C0.input) || 0, 1e-6), vb = Math.max(val(VB.input) || 0.1, 0.1), tt = Math.max(val(tau.input) || 0, 0) * 1e-9, IS = Math.pow(10, val(lIS.input)), nn = val(n.input);
      const VT = vt(300), vmax = Math.min(0.78, vb - 0.01), v = Math.min(val(VD.input), vmax), C = colors();
      const cd = x => c0 / Math.sqrt(1 - x / vb), cs = x => tt * IS * Math.exp(x / (nn * VT)) / (nn * VT) * 1e12;     // pF
      const { ctx, w, h } = setupCanvas(canvas, 300);
      const box = { x0: 58, y0: 12, x1: w - 12, y1: h - 42 };
      const ymin = Math.floor(Math.log10(c0)) - 2, ymax = ymin + 6;
      const { sx, sy } = drawAxes(ctx, box, [-10, 1], [ymin, ymax], { nx: 11, ny: 6, xfmt: x => fr(x, 0), yfmt: y => '10^' + fr(y, 0), xlabel: 'tension appliquée (V) : inverse à gauche, avant à droite', ylabel: 'capacité (pF)' });
      const P = { d: [], s: [], t: [] };
      for (let i = 0; i <= 400; i++) {
        const x = -10 + (vmax + 10) * i / 400, a = cd(x), b = cs(x);
        const push = (arr, y) => { const l = Math.log10(y); if (l >= ymin && l <= ymax) arr.push([sx(x), sy(l)]); };
        push(P.d, a); push(P.s, b); push(P.t, a + b);
      }
      polyline(ctx, P.t, C.t, 4); polyline(ctx, P.d, C.e, 2.2, [7, 4]); polyline(ctx, P.s, C.h, 2.2, [2, 4]);
      ctx.strokeStyle = C.m; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx(v), box.y0); ctx.lineTo(sx(v), box.y1); ctx.stroke(); ctx.setLineDash([]);
      const lt = Math.log10(cd(v) + cs(v)); if (lt >= ymin && lt <= ymax) { ctx.fillStyle = C.w; ctx.beginPath(); ctx.arc(sx(v), sy(lt), 5, 0, 2 * Math.PI); ctx.fill(); }
      legend(ctx, [['capacité totale', C.t], ['zone désertée', C.e, [7, 4]], ['stockage', C.h, [2, 4]]], box.x0 + 12, box.y0 + 12);
      // tension où les deux capacités sont égales
      let lo = 0, hi = vmax; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (cs(m) > cd(m)) hi = m; else lo = m; }
      const ID = IS * (Math.exp(v / (nn * VT)) - 1);
      out.innerHTML = '';
      out.appendChild(readout([
        ['C<sub>d</sub> à V<sub>D</sub>', sci(cd(v), 3) + ' pF'], ['C<sub>s</sub> à V<sub>D</sub>', (cs(v) < 1e-6 ? 'négligeable' : sci(cs(v), 3) + ' pF')], ['C<sub>D</sub> = C<sub>d</sub> + C<sub>s</sub>', sci(cd(v) + cs(v), 3) + ' pF'],
        ['Largeur de la zone désertée W/W(0)', fr(Math.sqrt(1 - v / vb), 3)], ['Courant I<sub>D</sub>', (v < -0.2 ? '−I<sub>S</sub> = −' + sci(IS, 2) + ' A' : sci(ID, 3) + ' A')],
        ['C<sub>s</sub> = C<sub>d</sub> pour V<sub>D</sub> =', tt > 0 && cs(vmax) > cd(vmax) ? fr(lo, 3) + ' V (' + fr(lo / vb, 2) + ' V<sub>B</sub>)' : 'jamais dans cette plage'],
        ['Tension inverse qui divise C<sub>d</sub> par 2', fr(3 * vb, 2) + ' V (3 V<sub>B</sub>)']
      ]));
      out.appendChild(el('p', { class: 'w-note', html: 'Valeurs par défaut : celles de l’exercice D9. La formule de C<sub>d</sub> diverge quand V<sub>D</sub> tend vers V<sub>B</sub> : le tracé s’arrête juste avant, et dans cette zone c’est de toute façon C<sub>s</sub> qui domine. Température fixée à 300 K.' }));
    }
    [C0, VB, tau].forEach(f => f.input.addEventListener('input', update)); [lIS.input, n.input, VD.input].forEach(i => i.addEventListener('input', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Caractéristique courant-tension ===================== */
  function widgetDiodeIV(c) {
    header(c, 'Caractéristique de la diode : courant de saturation, facteur n, température et résistance série',
      'I<sub>D</sub> = I<sub>S</sub>(e<sup>qV/nkT</sup> − 1), avec V la tension de la jonction. La courbe en tirets est la diode idéale (n = 1, r<sub>S</sub> = 0) de même I<sub>S</sub>. Passez en échelle semi-logarithmique pour voir la droite de pente q/nkT et le courant inverse.');
    const lIS = rangeInput('Courant de saturation I<sub>S</sub> à 300 K', -14, -16, -9, 0.25, v => '10^' + fr(v, 2) + ' A');
    const n = rangeInput('Facteur n', 1, 1, 2, 0.01, v => fr(v, 2));
    const T = rangeInput('Température T (K)', 300, 250, 400, 5, v => fr(v, 0));
    const rS = rangeInput('Résistance série r<sub>S</sub> (Ω)', 0, 0, 50, 1, v => fr(v, 0));
    const V = rangeInput('Tension aux bornes V<sub>D</sub> (V)', 0.65, -1, 1, 0.01, v => fr(v, 2));
    const mode = selIn('Échelle', [['lin', 'linéaire (0 à 10 mA)'], ['log', 'semi-logarithmique (valeur absolue)']], 'lin');
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [lIS.lab, n.lab, T.lab, rS.lab, V.lab, mode.lab]), canvas, out);
    /** Courant pour une tension aux bornes v : on résout v = vj + r × I(vj) par dichotomie sur la tension de jonction vj. */
    function solve(v, IS, nVT, r) {
      const I = vj => IS * (Math.exp(vj / nVT) - 1);
      if (r === 0) return { vj: v, i: I(v) };
      let lo = Math.min(v, -2), hi = Math.max(v, 0);
      for (let k = 0; k < 70; k++) { const m = (lo + hi) / 2; if (m + r * I(m) > v) hi = m; else lo = m; }
      const vj = (lo + hi) / 2; return { vj, i: I(vj) };
    }
    function update() {
      const t = val(T.input), VT = vt(t), nn = val(n.input), r = val(rS.input), v = val(V.input), isLog = mode.input.value === 'log', C = colors();
      const IS = Math.pow(10, val(lIS.input)) * Math.pow(t / 300, 3) * Math.exp(-EG / KB * (1 / t - 1 / 300));       // I_S ∝ n_i²
      const { ctx, w, h } = setupCanvas(canvas, 310);
      const box = { x0: 62, y0: 12, x1: w - 12, y1: h - 42 };
      const yr = isLog ? [-16, 0] : [-1, 10];
      const { sx, sy } = drawAxes(ctx, box, [-1, 1], yr, isLog
        ? { nx: 8, ny: 8, xfmt: x => fr(x, 2), yfmt: y => '10^' + fr(y, 0), xlabel: 'tension aux bornes (V)', ylabel: 'courant, valeur absolue (A)' }
        : { nx: 8, ny: 11, xfmt: x => fr(x, 2), yfmt: y => fr(y, 0), xlabel: 'tension aux bornes (V)', ylabel: 'courant (mA)' });
      const curve = (nVT, rr) => {
        const pts = [];
        for (let i = 0; i <= 400; i++) {
          const x = -1 + 2 * i / 400, cur = solve(x, IS, nVT, rr).i;
          const y = isLog ? Math.log10(Math.max(Math.abs(cur), 1e-30)) : cur * 1000;
          if (y > yr[1]) { if (pts.length && !isLog) pts.push([sx(x), sy(yr[1])]); if (!isLog) break; else continue; }
          if (y < yr[0]) continue;
          pts.push([sx(x), sy(y)]);
        }
        return pts;
      };
      if (!isLog) { ctx.strokeStyle = C.m; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(box.x0, sy(0)); ctx.lineTo(box.x1, sy(0)); ctx.moveTo(sx(0), box.y0); ctx.lineTo(sx(0), box.y1); ctx.stroke(); }
      polyline(ctx, curve(VT, 0), C.m, 1.8, [6, 4]);
      polyline(ctx, curve(nn * VT, r), C.e, 2.6);
      const pt = solve(v, IS, nn * VT, r), yv = isLog ? Math.log10(Math.max(Math.abs(pt.i), 1e-30)) : pt.i * 1000;
      ctx.strokeStyle = C.m; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx(v), box.y0); ctx.lineTo(sx(v), box.y1); ctx.stroke(); ctx.setLineDash([]);
      if (yv >= yr[0] && yv <= yr[1]) { ctx.fillStyle = C.w; ctx.beginPath(); ctx.arc(sx(v), sy(yv), 5, 0, 2 * Math.PI); ctx.fill(); }
      legend(ctx, [['diode avec n et résistance série', C.e], ['diode idéale (n = 1, sans résistance)', C.m, [6, 4]]], box.x0 + 12, box.y0 + 12);
      const v1 = nn * VT * Math.log(1e-3 / IS + 1) + r * 1e-3;
      out.innerHTML = '';
      out.appendChild(readout([
        ['Courant I<sub>D</sub> à V<sub>D</sub>', sci(pt.i, 3) + ' A'], ['Tension de la jonction', fr(pt.vj, 3) + ' V'], ['Chute dans r<sub>S</sub>', fr((v - pt.vj) * 1000, 1) + ' mV'],
        ['I<sub>S</sub> à cette température', sci(IS, 3) + ' A'], ['kT/q', fr(VT * 1000, 2) + ' mV'],
        ['Pente de ln I<sub>D</sub> : q/nkT', fr(1 / (nn * VT), 1) + ' V⁻¹'], ['Tension pour une décade de courant', fr(nn * VT * Math.LN10 * 1000, 1) + ' mV'],
        ['Tension aux bornes pour 1 mA', fr(v1, 3) + ' V']
      ]));
      out.appendChild(el('p', { class: 'w-note', html: 'I<sub>S</sub> suit la température comme n<sub>i</sub>² (bande interdite de 1,12 eV). À essayer : semi-log avec n = 1,23 (la pente passe de 38,7 à 31,4 V⁻¹, figure 12) ; r<sub>S</sub> = 10 Ω (la courbe se couche à fort courant et, en semi-log, elle quitte la droite) ; T de 300 à 310 K (I<sub>S</sub> est multiplié par 4,5 et la tension pour 1 mA baisse d’environ 20 mV).' }));
    }
    [lIS.input, n.input, T.input, rS.input, V.input].forEach(i => i.addEventListener('input', update)); mode.input.addEventListener('change', update);
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Diagramme de bandes sous tension (animation) ===================== */
  function widgetPnBias(c) {
    header(c, 'Jonction sous tension : barrière, diffusion et dérive (animation)',
      'Réglez V<sub>D</sub>. Les bandes se déplacent, la zone désertée change de largeur et les porteurs réagissent : les majoritaires tentent de franchir la barrière (diffusion), les minoritaires créés près de la jonction la dévalent (dérive). Électrons en points pleins, trous en cercles.');
    const NA = 1e16, ND = 1e17, VT = vt(300), VB = VT * Math.log(NA * ND / 2.25e20);
    const NEFF = 1.5e10 * Math.exp(EG / (2 * VT));                     // N_C = N_V cohérent avec n_i et ε_gap
    const dN = VT * Math.log(NEFF / ND), dP = VT * Math.log(NEFF / NA); // ε_C − ε_F côté N, ε_F − ε_V côté P (eV)
    const VD = rangeInput('Tension appliquée V<sub>D</sub> (V)', 0, -1, 0.6, 0.02, v => fr(v, 2));
    const btnPause = el('button', { class: 'btn secondary', type: 'button' }, 'Pause');
    const btnReset = el('button', { class: 'btn secondary', type: 'button' }, 'Remettre les compteurs à zéro');
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [VD.lab, el('label', {}, [el('span', {}, 'Animation'), el('span', {}, [btnPause, ' ', btnReset])])]), canvas, out);
    const KT_ANIM = 0.25, SCALE = 78, H = 400;      // agitation exagérée pour l'animation (eV), pixels par eV
    let running = true, visible = true, raf = null, parts = [], g = null, frame = 0;
    const count = { diff: [0, 0], drift: [0, 0], att: 0.02 };
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { running = false; btnPause.textContent = 'Reprendre'; }
    function geometry(w) {
      const vd = val(VD.input), bar = VB - vd, x0 = 56, x1 = w - 76, xc = (x0 + x1) / 2;
      const wd = Math.max(16, 0.24 * (x1 - x0) * Math.sqrt(Math.max(bar, 0.01) / VB));      // largeur de la zone désertée à l'écran
      const xa = xc - 0.3 * wd, xj = xa + 0.2 * wd, xb = xa + wd;                           // elle s'étend surtout du côté P, le moins dopé
      const yCP = 40, yVP = yCP + EG * SCALE, yCN = yCP + bar * SCALE, yVN = yCN + EG * SCALE;
      const f = (xj - xa) / (xb - xa);
      const prof = (x, yl, yr) => {
        if (x <= xa) return yl; if (x >= xb) return yr;
        if (x <= xj) return yl + (yr - yl) * f * Math.pow((x - xa) / (xj - xa), 2);
        return yr - (yr - yl) * (1 - f) * Math.pow((xb - x) / (xb - xj), 2);
      };
      return { vd, bar, x0, x1, xa, xb, yCP, yVP, yCN, yVN, yC: x => prof(x, yCN, yCP), yV: x => prof(x, yVN, yVP), yFN: yCN + dN * SCALE, yFP: yVP - dP * SCALE };
    }
    // espèce 0 : électrons (majoritaires à gauche, bande de conduction) ; espèce 1 : trous (majoritaires à droite, bande de valence)
    function spawnMaj(sp, anywhere) {
      const home = sp === 0 ? [g.x0 + 4, g.xa - 3] : [g.xb + 3, g.x1 - 4];
      const x = anywhere ? home[0] + Math.random() * (home[1] - home[0]) : (sp === 0 ? home[0] : home[1]);
      return { sp, mode: 'maj', x, vx: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1.1), off: 5 + Math.random() * Math.random() * 26, a: 1, t: 0 };
    }
    function reset() { parts = []; for (let i = 0; i < 26; i++) { parts.push(spawnMaj(0, true)); parts.push(spawnMaj(1, true)); } }
    function step() {
      frame++;
      const pc = Math.exp(-Math.max(g.bar, 0) / KT_ANIM), dir = sp => (sp === 0 ? 1 : -1);       // sens de la traversée par diffusion
      let attempts = 0;
      parts.forEach(p => {
        const d = dir(p.sp), edgeHome = p.sp === 0 ? g.xa : g.xb, edgeFar = p.sp === 0 ? g.xb : g.xa, wall = p.sp === 0 ? g.x0 + 4 : g.x1 - 4;
        if (p.mode === 'maj') {
          if (Math.random() < 0.02) p.vx = -p.vx;
          p.x += p.vx;
          if ((p.x - wall) * d < 0) { p.x = wall; p.vx = Math.abs(p.vx) * d; }
          if ((p.x - edgeHome) * d > -3) {
            attempts++;
            if (Math.random() < pc) { p.mode = 'cross'; p.t = 0; p.depth = 14 + Math.random() * 60; }
            else { p.x = edgeHome - 3 * d; p.vx = -Math.abs(p.vx) * d; }
          }
        } else if (p.mode === 'cross') {
          p.t++; p.x += 1.7 * d;
          if ((p.x - edgeFar) * d > p.depth) { p.mode = 'fade'; count.diff[p.sp]++; }
        } else if (p.mode === 'min') {
          p.a = Math.min(1, p.a + 0.08); p.x -= 0.7 * d;
          if ((p.x - edgeFar) * d < 2) p.mode = 'slide';
        } else if (p.mode === 'slide') {
          p.x -= 2.4 * d;
          if ((p.x - edgeHome) * d < -(10 + p.depth)) { p.mode = 'fade'; count.drift[p.sp]++; }
        } else if (p.mode === 'fade') { p.a -= 0.05; }
      });
      // les porteurs disparus (recombinés ou absorbés) sont remplacés : le contact fournit de nouveaux majoritaires
      for (let i = 0; i < parts.length; i++) if (parts[i].mode === 'fade' && parts[i].a <= 0) { if (parts[i].born === 'min') { parts.splice(i, 1); i--; } else parts[i] = spawnMaj(parts[i].sp, false); }
      // génération thermique de minoritaires : rythme constant, égal au rythme de diffusion à l'équilibre
      count.att = 0.995 * count.att + 0.005 * attempts / 2;
      const gen = count.att * Math.exp(-VB / KT_ANIM);
      for (let sp = 0; sp < 2; sp++) if (Math.random() < gen) {
        const d = dir(sp), edgeFar = sp === 0 ? g.xb : g.xa;
        parts.push({ sp, mode: 'min', born: 'min', x: edgeFar + d * (12 + Math.random() * 46), vx: 0, off: 6 + Math.random() * 8, a: 0, t: 0, depth: Math.random() * 40 });
      }
    }
    function yOf(p) {
      const up = p.sp === 0 ? -1 : 1, band = p.sp === 0 ? g.yC : g.yV;         // les électrons sont au-dessus de ε_C, les trous sous ε_V
      if (p.mode === 'cross') {
        const top = p.sp === 0 ? Math.min(g.yCN, g.yCP) - 7 : Math.max(g.yVN, g.yVP) + 7, start = band(p.x) + up * p.off;
        const k = Math.min(1, p.t / 14); return p.sp === 0 ? Math.min(start, start + (top - start) * k) : Math.max(start, start + (top - start) * k);
      }
      return band(p.x) + up * p.off;
    }
    function draw() {
      const { ctx, w } = setupCanvas(canvas, H), C = colors();
      const old = g; g = geometry(w);
      if (old && (Math.abs(old.xa - g.xa) > 0.5 || Math.abs(old.x1 - g.x1) > 0.5)) parts.forEach(p => { if (p.mode === 'maj') { const lo = p.sp === 0 ? g.x0 + 4 : g.xb + 3, hi = p.sp === 0 ? g.xa - 3 : g.x1 - 4; p.x = Math.max(lo, Math.min(hi, p.x)); } });
      const xs = []; for (let x = g.x0; x <= g.x1; x += 3) xs.push(x); xs.push(g.x1);
      // bande interdite
      ctx.globalAlpha = 0.12; ctx.fillStyle = C.w; ctx.beginPath();
      xs.forEach((x, i) => { if (i === 0) ctx.moveTo(x, g.yC(x)); else ctx.lineTo(x, g.yC(x)); });
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i], g.yV(xs[i]));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      // zone désertée
      ctx.strokeStyle = C.m; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      [g.xa, g.xb].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 22); ctx.lineTo(x, H - 30); ctx.stroke(); }); ctx.setLineDash([]);
      polyline(ctx, xs.map(x => [x, g.yC(x)]), C.t, 2); polyline(ctx, xs.map(x => [x, g.yV(x)]), C.t, 2);
      // niveaux de Fermi
      if (Math.abs(g.vd) < 1e-9) polyline(ctx, [[g.x0, g.yFN], [g.x1, g.yFP]], C.w, 1.8, [10, 4, 2, 4]);
      else { polyline(ctx, [[g.x0, g.yFN], [g.xa, g.yFN]], C.w, 1.8, [10, 4, 2, 4]); polyline(ctx, [[g.xb, g.yFP], [g.x1, g.yFP]], C.w, 1.8, [10, 4, 2, 4]); }
      // porteurs
      parts.forEach(p => {
        const y = yOf(p); ctx.globalAlpha = Math.max(0, Math.min(1, p.a)); ctx.beginPath(); ctx.arc(p.x, y, 3.6, 0, 2 * Math.PI);
        if (p.sp === 0) { ctx.fillStyle = C.e; ctx.fill(); } else { ctx.fillStyle = C.s; ctx.fill(); ctx.strokeStyle = C.h; ctx.lineWidth = 1.8; ctx.stroke(); }
      });
      ctx.globalAlpha = 1;
      // étiquettes
      ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = C.t; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText('côté N', g.x0, 4); ctx.textAlign = 'right'; ctx.fillText('côté P', g.x1, 4);
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = C.m; ctx.fillText('zone désertée', (g.xa + g.xb) / 2, 4);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.t; ctx.fillText('εC', g.x0 - 6, g.yCN - 5); ctx.fillText('εV', g.x0 - 6, g.yVN); ctx.fillStyle = C.w; ctx.fillText('εF', g.x0 - 6, g.yFN + 7);
      // barrière
      const xq = g.x1 + 18;
      ctx.strokeStyle = C.m; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(g.xb, g.yCN); ctx.lineTo(xq + 6, g.yCN); ctx.moveTo(g.x1, g.yCP); ctx.lineTo(xq + 6, g.yCP); ctx.stroke(); ctx.setLineDash([]);
      if (Math.abs(g.yCN - g.yCP) > 14) { arrowLine(ctx, xq, (g.yCN + g.yCP) / 2, xq, g.yCP + 1, C.t, 1.4); arrowLine(ctx, xq, (g.yCN + g.yCP) / 2, xq, g.yCN - 1, C.t, 1.4); }
      ctx.fillStyle = C.t; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('barrière', xq + 18, g.yCP - 16); ctx.fillText(fr(g.bar, 2) + ' eV', xq + 18, g.yCP - 2);
      // bilan des flèches en bas
      const yb = H - 14; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = C.m;
      const state = g.vd > 0.005 ? 'polarisation avant : la barrière est abaissée, la diffusion l’emporte' : (g.vd < -0.005 ? 'polarisation inverse : la barrière est relevée, il ne reste que la dérive' : 'équilibre : diffusion et dérive se compensent en moyenne');
      ctx.fillText(state, g.x0, yb);
    }
    function readouts() {
      const vd = val(VD.input), f = Math.exp(vd / VT), nd = count.diff[0] + count.diff[1], nr = count.drift[0] + count.drift[1];
      out.innerHTML = '';
      out.appendChild(readout([
        ['Barrière q(V<sub>B</sub> − V<sub>D</sub>)', fr(VB - vd, 3) + ' eV (V<sub>B</sub> = ' + fr(VB, 3) + ' V)'],
        ['Largeur de la zone désertée W/W(0)', fr(Math.sqrt(Math.max(VB - vd, 0) / VB), 2)],
        ['Écart des niveaux de Fermi', fr(Math.abs(vd), 2) + ' eV' + (vd > 0 ? ' (N plus haut)' : (vd < 0 ? ' (N plus bas)' : ''))],
        ['Minoritaires aux frontières : facteur e<sup>qV<sub>D</sub>/kT</sup>', sci(f, 3)],
        ['Courant réel I<sub>D</sub>/I<sub>S</sub> = e<sup>qV<sub>D</sub>/kT</sup> − 1', sci(f - 1, 3)],
        ['Animation : traversées par diffusion', String(nd)], ['Animation : traversées par dérive', String(nr)], ['Animation : bilan (diffusion − dérive)', String(nd - nr)]
      ]));
      out.appendChild(el('p', { class: 'w-note', html: 'Jonction N<sub>D</sub> = 10¹⁷ cm⁻³, N<sub>A</sub> = 10¹⁶ cm⁻³ à 300 K (V<sub>B</sub> = 0,753 V). Les facteurs affichés sont calculés avec le vrai kT/q = 25,85 mV. L’animation, elle, exagère l’agitation thermique (kT dix fois plus grand) : avec le vrai kT, une traversée à l’équilibre serait bien trop rare pour être vue. Regardez surtout ce qui ne change pas : le rythme des porteurs qui dévalent la pente (dérive) est le même à toutes les tensions.' }));
    }
    let last = 0, acc = 0, shown = 0;
    function loop(now) {
      raf = null; if (!running || !visible) return;
      acc += Math.min(100, last ? now - last : 16.7); last = now;
      while (acc >= 16.6) { step(); acc -= 16.6; }       // même vitesse à 15, 60 ou 144 images par seconde
      draw(); if (frame - shown >= 30) { shown = frame; readouts(); }
      raf = requestAnimationFrame(loop);
    }
    function kick() { if (running && visible && raf === null) { last = 0; raf = requestAnimationFrame(loop); } }
    btnPause.addEventListener('click', () => { running = !running; btnPause.textContent = running ? 'Pause' : 'Reprendre'; kick(); });
    btnReset.addEventListener('click', () => { count.diff = [0, 0]; count.drift = [0, 0]; readouts(); });
    VD.input.addEventListener('input', () => { count.diff = [0, 0]; count.drift = [0, 0]; draw(); readouts(); kick(); });
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; kick(); }, { threshold: 0.05 }).observe(canvas);
    g = geometry(canvas.clientWidth || 600); reset(); draw(); readouts(); kick();
    c.pnBiasState = () => ({ frame, running, visible, att: count.att, diff: count.diff.slice(), drift: count.drift.slice(), modes: parts.reduce((m, q) => { m[q.sp + q.mode] = (m[q.sp + q.mode] || 0) + 1; return m; }, {}), bar: g.bar });   // pour les tests
    c.pnBiasAdvance = n => { for (let i = 0; i < n; i++) step(); draw(); readouts(); return c.pnBiasState(); };
    window.addEventListener('resize', draw); document.addEventListener('themechange', draw);
  }

  /* ===================== Enregistrement ===================== */
  Object.assign(window.ELE.widgets, {
    'pn-junction': widgetPnJunction, 'junction-capacitance': widgetCapacitance, 'diode-iv': widgetDiodeIV, 'pn-bias': widgetPnBias
  });
  if (window.ELE.initWidgets) window.ELE.initWidgets();
})();
