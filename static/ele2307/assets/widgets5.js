/* ELE2307 - démonstrations interactives du cours 9 (s'appuie sur la boîte à outils de widgets.js) */
(function () {
  'use strict';
  const W = window.ELE && window.ELE.wk;
  if (!W) { console.error('widgets.js doit être chargé avant widgets5.js'); return; }
  const { el, rangeInput, readout, header, setupCanvas, drawAxes, fr, sci, cssVar } = W;
  const kB = 8.617e-5, Q = 1.602e-19;     // eV/K, C
  const PALETTE = ['#1f5fbf', '#c0392b', '#0d8f7a', '#b7791f', '#7c4dff'];
  const MAT = {
    Si: { name: 'silicium (1,14 eV)', gap: 1.14, mue: 0.135, muh: 0.048 },
    Ge: { name: 'germanium (0,67 eV)', gap: 0.67, mue: 0.39, muh: 0.19 },
    GaAs: { name: 'arséniure de gallium (1,43 eV)', gap: 1.43, mue: 0.85, muh: 0.04 },
    InSb: { name: 'InSb (0,18 eV)', gap: 0.18, mue: 8.0, muh: 0.075 },
    iso: { name: 'isolant (5 eV)', gap: 5.0, mue: 0.01, muh: 0.01 }
  };
  const ED = 0.03, EA = 0.05;             // profondeur des niveaux donneurs et accepteurs (eV)

  /* ---------- utilitaires ---------- */
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
  const val = inp => parseFloat(inp.value);
  function polyline(ctx, pts, sx, sy, color, width = 2.2, dash = null) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.beginPath();
    pts.forEach((p, i) => { const x = sx(p[0]), y = sy(p[1]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
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
  const dens = n => sci(n, 3) + ' m⁻³ = ' + sci(n / 1e6, 3) + ' cm⁻³';

  /* ---------- physique : modèle du manuel (gaz de Fermi, m* = m) ---------- */
  const Nband = T => 2.51e25 * Math.pow(T / 300, 1.5);       // états équivalents en bord de bande (m⁻³)
  const nIntr = (gap, T) => Nband(T) * Math.exp(-gap / (2 * kB * T));
  /** Résout la neutralité électrique. Énergies comptées depuis εv = 0. Nd, Na : densités d'ATOMES dopants (m⁻³). */
  function solve(gap, T, Nd, Na) {
    const kT = kB * T, N = Nband(T);
    const f = mu => N * Math.exp(-(gap - mu) / kT) - N * Math.exp(-mu / kT)
      + Na / (1 + 2 * Math.exp((EA - mu) / kT)) - Nd / (1 + 2 * Math.exp((mu - (gap - ED)) / kT));
    let lo = -1, hi = gap + 1;
    for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
    const mu = (lo + hi) / 2, n = N * Math.exp(-(gap - mu) / kT), p = N * Math.exp(-mu / kT);
    const ion = Nd > 0 ? 1 / (1 + 2 * Math.exp((mu - (gap - ED)) / kT)) : (Na > 0 ? 1 / (1 + 2 * Math.exp((EA - mu) / kT)) : 1);
    const ni = nIntr(gap, T), dop = Math.max(Nd, Na);
    let regime = 'intrinsèque (pas de dopant)';
    if (dop > 0) regime = ni > dop ? 'intrinsèque : les paires thermiques dominent' : (ion < 0.9 ? 'ionisation : dopants partiellement ionisés (' + fr(100 * ion, 0) + ' %)' : 'extrinsèque : porteurs fixés par le dopage');
    return { mu, n, p, ni, ion, N, regime };
  }
  function tIntrinsic(gap, dop) { let T = 400; for (let i = 0; i < 60; i++) T = gap / (2 * kB * Math.log(Nband(T) / dop)); return T; }

  /* ===================== Diagramme de bandes vivant ===================== */
  function widgetBandDiagram(c) {
    header(c, 'Diagramme de bandes : porteurs, niveau de Fermi et occupation',
      'À gauche les bandes avec les électrons de conduction (points pleins) et les trous de valence (cercles) ; chaque point supplémentaire représente environ un facteur 3 sur la concentration. À droite la fonction de Fermi-Dirac centrée sur μ. Changez le matériau, la température et le dopage.');
    const mat = selIn('Matériau', Object.keys(MAT).map(k => [k, MAT[k].name]), 'Si');
    const T = rangeInput('Température T (K)', 300, 20, 1000, 10, v => fr(v, 0));
    const dop = selIn('Dopage', [['i', 'aucun (intrinsèque)'], ['N', 'type N (donneurs)'], ['P', 'type P (accepteurs)']], 'i');
    const logN = rangeInput('Densité de dopants', 22, 18, 25, 0.25, v => '10^' + fr(v, 2) + ' m⁻³ = 10^' + fr(v - 6, 2) + ' cm⁻³');
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [mat.lab, T.lab, dop.lab, logN.lab]), canvas, out);
    function rnd(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
    function update() {
      const m = MAT[mat.input.value], t = val(T.input), type = dop.input.value, Nx = Math.pow(10, val(logN.input));
      const r = solve(m.gap, t, type === 'N' ? Nx : 0, type === 'P' ? Nx : 0), kT = kB * t;
      const { ctx, w, h } = setupCanvas(canvas, 330);
      const x0 = 64, x1 = Math.round(w * 0.6), y0 = 16, y1 = h - 18, pad = Math.max(0.28, 0.3 * m.gap);
      const emin = -pad, emax = m.gap + pad, sy = e => y1 - (e - emin) / (emax - emin) * (y1 - y0);
      const txt = cssVar('--text'), mut = cssVar('--muted');
      // bandes
      ctx.fillStyle = 'rgba(183, 121, 31, 0.10)'; ctx.fillRect(x0, sy(m.gap), x1 - x0, sy(0) - sy(m.gap));
      ctx.fillStyle = cssVar('--surface-2'); ctx.fillRect(x0, y0, x1 - x0, sy(m.gap) - y0);
      ctx.fillStyle = 'rgba(31, 95, 191, 0.26)'; ctx.fillRect(x0, sy(0), x1 - x0, y1 - sy(0));
      ctx.strokeStyle = mut; ctx.lineWidth = 1.2; ctx.strokeRect(x0, y0, x1 - x0, sy(m.gap) - y0);
      ctx.strokeStyle = PALETTE[0]; ctx.strokeRect(x0, sy(0), x1 - x0, y1 - sy(0));
      ctx.fillStyle = txt; ctx.font = '12px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText('εc', x0 - 6, sy(m.gap)); ctx.fillText('εv', x0 - 6, sy(0));
      ctx.textAlign = 'left'; ctx.fillStyle = mut; ctx.textBaseline = 'top'; ctx.fillText('bande de conduction', x0 + 6, y0 + 4);
      ctx.textBaseline = 'bottom'; ctx.fillText('bande de valence', x0 + 6, y1 - 4);
      // niveaux dopants
      if (type !== 'i') {
        const e = type === 'N' ? m.gap - ED : EA; let y = sy(e);
        if (type === 'N' && y - sy(m.gap) < 6) y = sy(m.gap) + 6; if (type === 'P' && sy(0) - y < 6) y = sy(0) - 6;
        ctx.strokeStyle = type === 'N' ? PALETTE[2] : PALETTE[1]; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(x0 + 8, y); ctx.lineTo(x1 - 8, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = type === 'N' ? PALETTE[2] : PALETTE[1]; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(type === 'N' ? 'εd' : 'εa', x1 + 22, y);
      }
      // porteurs
      const dots = n => Math.max(0, Math.min(40, Math.round(2.1 * (Math.log10(Math.max(n, 1)) - 9))));
      const R = rnd(12345), ne = dots(r.n), nh = dots(r.p);
      for (let i = 0; i < 40; i++) {
        const fx = R(), fy = R();
        if (i < ne) { ctx.fillStyle = PALETTE[0]; ctx.beginPath(); ctx.arc(x0 + 12 + fx * (x1 - x0 - 24), sy(m.gap) - 8 - fy * fy * 34, 4, 0, 2 * Math.PI); ctx.fill(); }
      }
      const R2 = rnd(999);
      for (let i = 0; i < 40; i++) {
        const fx = R2(), fy = R2();
        if (i < nh) { ctx.fillStyle = cssVar('--surface'); ctx.strokeStyle = PALETTE[1]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x0 + 12 + fx * (x1 - x0 - 24), sy(0) + 8 + fy * fy * 34, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
      }
      // niveau de Fermi
      const ymu = Math.max(y0 + 2, Math.min(y1 - 2, sy(r.mu)));
      ctx.strokeStyle = PALETTE[3]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 - 10, ymu); ctx.lineTo(w - 14, ymu); ctx.stroke();
      ctx.fillStyle = PALETTE[3]; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('μ', x1 + 6, ymu - 2);
      // fonction de Fermi (énergie verticale)
      const fx0 = Math.round(w * 0.7), fx1 = w - 24;
      ctx.strokeStyle = mut; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(fx0, y0); ctx.lineTo(fx0, y1); ctx.lineTo(fx1, y1); ctx.stroke();
      ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(fx1, y0); ctx.lineTo(fx1, y1); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = PALETTE[0]; ctx.lineWidth = 2.4; ctx.beginPath();
      for (let i = 0; i <= 200; i++) { const e = emin + (emax - emin) * i / 200, fd = 1 / (Math.exp((e - r.mu) / kT) + 1), x = fx0 + (fx1 - fx0) * fd, y = sy(e); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.fillStyle = mut; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('0', fx0, y1 + 3); ctx.fillText('1', fx1, y1 + 3); ctx.fillText('occupation', (fx0 + fx1) / 2, y1 + 3);
      out.innerHTML = '';
      out.appendChild(readout([
        ['Électrons de conduction n<sub>e</sub>', dens(r.n)], ['Trous de valence n<sub>h</sub>', dens(r.p)],
        ['Porteurs intrinsèques n<sub>i</sub> à cette T', dens(r.ni)], ['Vérification : n<sub>e</sub>n<sub>h</sub>/n<sub>i</sub>²', fr(r.n * r.p / (r.ni * r.ni), 3)],
        ['Niveau de Fermi : μ − ε<sub>v</sub>', fr(r.mu, 3) + ' eV'], ['ε<sub>c</sub> − μ', fr(m.gap - r.mu, 3) + ' eV'],
        ['Écart au milieu de la bande interdite', fr(r.mu - m.gap / 2, 3) + ' eV'], ['kT', fr(kT, 4) + ' eV'],
        ['Régime', r.regime], ['Conductivité σ = e(n<sub>e</sub>μ<sub>e</sub> + n<sub>h</sub>μ<sub>h</sub>)', sci(Q * (r.n * m.mue + r.p * m.muh), 3) + ' S/m']
      ]));
      out.appendChild(el('p', { class: 'w-note' }, 'Modèle du manuel : N_c = N_v = 2,51 × 10²⁵ (T/300)^(3/2) m⁻³ (m* = m), niveaux donneurs à 0,03 eV sous ε_c, accepteurs à 0,05 eV au-dessus de ε_v, mobilités à 300 K. À essayer : Si intrinsèque de 300 à 600 K ; Si type N à 10²² m⁻³ puis baisser T sous 100 K (ionisation) ou monter au-delà de 700 K (retour à l’intrinsèque).'));
    }
    [T.input, logN.input].forEach(i => i.addEventListener('input', update)); [mat.input, dop.input].forEach(i => i.addEventListener('change', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Porteurs intrinsèques en fonction de T ===================== */
  function widgetIntrinsic(c) {
    header(c, 'Porteurs intrinsèques en fonction de la température',
      'n<sub>i</sub> = √(N<sub>c</sub>N<sub>v</sub>) e<sup>−Δε/2kT</sup> pour le germanium, le silicium et l’arséniure de gallium, tracé comme sur la diapo 18 (échelle log, en fonction de 1000/T). Plus la bande interdite est large, plus la droite est raide et basse.');
    const T = rangeInput('Température T (K)', 300, 250, 600, 5, v => fr(v, 0));
    const gap = rangeInput('Bande interdite d’un quatrième matériau (eV)', 2.0, 0.1, 3, 0.05, v => fr(v, 2));
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [T.lab, gap.lab]), canvas, out);
    function update() {
      const t = val(T.input), g4 = val(gap.input);
      const { ctx, w, h } = setupCanvas(canvas, 300);
      const box = { x0: 58, y0: 12, x1: w - 12, y1: h - 42 };
      const { sx, sy } = drawAxes(ctx, box, [1.6, 4], [0, 18], { nx: 6, ny: 6, xfmt: v => fr(v, 1), yfmt: v => '10^' + fr(v, 0), xlabel: '1000/T (K⁻¹)   [600 K à gauche, 250 K à droite]', ylabel: 'nᵢ (cm⁻³)' });
      const curves = [['Ge', MAT.Ge.gap, PALETTE[2], null], ['Si', MAT.Si.gap, PALETTE[0], null], ['GaAs', MAT.GaAs.gap, PALETTE[1], null], [fr(g4, 2) + ' eV', g4, PALETTE[4], [6, 4]]];
      curves.forEach(([name, g, col, dash]) => {
        const pts = []; for (let i = 0; i <= 120; i++) { const x = 1.6 + 2.4 * i / 120, y = Math.log10(nIntr(g, 1000 / x) / 1e6); if (y >= 0 && y <= 18) pts.push([x, y]); }
        polyline(ctx, pts, sx, sy, col, 2.2, dash);
      });
      ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(sx(1000 / t), box.y0); ctx.lineTo(sx(1000 / t), box.y1); ctx.stroke(); ctx.setLineDash([]);
      curves.forEach(([name, g, col]) => { const y = Math.log10(nIntr(g, t) / 1e6); if (y >= 0 && y <= 18) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx(1000 / t), sy(y), 4.5, 0, 2 * Math.PI); ctx.fill(); } });
      legend(ctx, curves.map(([name, g, col, dash]) => [name, col, dash]), box.x1 - 96, box.y0 + 12);
      out.innerHTML = '';
      const rows = [['kT', fr(kB * t, 4) + ' eV'], ['N<sub>c</sub> = N<sub>v</sub> à cette T', dens(Nband(t))]];
      ['Ge', 'Si', 'GaAs'].forEach(k => rows.push(['n<sub>i</sub> ' + k, dens(nIntr(MAT[k].gap, t)) + ' ; σ = ' + sci(Q * nIntr(MAT[k].gap, t) * (MAT[k].mue + MAT[k].muh), 2) + ' S/m']));
      rows.push(['n<sub>i</sub> pour Δε = ' + fr(g4, 2) + ' eV', dens(nIntr(g4, t))]);
      out.appendChild(readout(rows));
      out.appendChild(el('p', { class: 'w-note' }, 'Valeurs du modèle du manuel (m* = m) : à 300 K, 6,7 × 10⁹ cm⁻³ pour Si, 5,9 × 10¹³ pour Ge, 2,4 × 10⁷ pour GaAs. La diapo 18 donne les valeurs mesurées (1,5 × 10¹⁰, 2,5 × 10¹³ et 2 × 10⁶ cm⁻³), qui tiennent compte des masses effectives réelles. Un doublement de n_i demande environ 11 K pour le silicium.'));
    }
    [T.input, gap.input].forEach(i => i.addEventListener('input', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Régimes d'un semiconducteur dopé ===================== */
  function widgetDopingRegimes(c) {
    header(c, 'Semiconducteur dopé : les trois régimes et le niveau de Fermi',
      'En haut, la concentration des porteurs majoritaires en fonction de 1000/T : ionisation à basse température, plateau extrinsèque, puis régime intrinsèque. En bas, la position du niveau de Fermi dans la bande interdite en fonction de T (comme la figure 23.7 du manuel).');
    const mat = selIn('Matériau', ['Si', 'Ge', 'GaAs'].map(k => [k, MAT[k].name]), 'Si');
    const type = selIn('Dopage', [['N', 'type N (donneurs)'], ['P', 'type P (accepteurs)']], 'N');
    const logN = rangeInput('Densité d’atomes dopants', 21, 18, 25, 0.25, v => '10^' + fr(v, 2) + ' m⁻³ = 10^' + fr(v - 6, 2) + ' cm⁻³');
    const T = rangeInput('Température T (K)', 300, 25, 1000, 5, v => fr(v, 0));
    const canvas = el('canvas', { class: 'plot' }), canvas2 = el('canvas', { class: 'plot' });
    canvas2.style.marginTop = '.5rem';
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [mat.lab, type.lab, logN.lab, T.lab]), canvas, canvas2, out);
    function update() {
      const m = MAT[mat.input.value], isN = type.input.value === 'N', Nx = Math.pow(10, val(logN.input)), t = val(T.input);
      const run = tt => solve(m.gap, tt, isN ? Nx : 0, isN ? 0 : Nx);
      const r = run(t), major = isN ? r.n : r.p, lN = Math.log10(Nx);
      // --- graphique 1 : porteurs majoritaires
      let g1 = setupCanvas(canvas, 260), ctx = g1.ctx;
      let box = { x0: 66, y0: 12, x1: g1.w - 12, y1: g1.h - 42 };
      const yr = [Math.floor(lN) - 5, Math.floor(lN) + 3];
      let ax = drawAxes(ctx, box, [0, 40], yr, { nx: 8, ny: 8, xfmt: v => fr(v, 0), yfmt: v => '10^' + fr(v, 0), xlabel: '1000/T (K⁻¹)   [1000 K à gauche, 25 K à droite]', ylabel: 'porteurs (m⁻³)' });
      const pts = [], pin = [];
      for (let i = 0; i <= 260; i++) { const x = 1 + 39 * i / 260, tt = 1000 / x, rr = run(tt), y = Math.log10(isN ? rr.n : rr.p), yi = Math.log10(rr.ni); if (y >= yr[0] && y <= yr[1]) pts.push([x, y]); if (yi >= yr[0] && yi <= yr[1]) pin.push([x, yi]); }
      polyline(ctx, pin, ax.sx, ax.sy, cssVar('--muted'), 1.6, [5, 4]);
      polyline(ctx, [[0, lN], [40, lN]], ax.sx, ax.sy, PALETTE[3], 1.2, [2, 4]);
      polyline(ctx, pts, ax.sx, ax.sy, isN ? PALETTE[0] : PALETTE[1], 2.6);
      const ym = Math.log10(major);
      if (ym >= yr[0] && ym <= yr[1]) { ctx.fillStyle = cssVar('--bad'); ctx.beginPath(); ctx.arc(ax.sx(1000 / t), ax.sy(ym), 5, 0, 2 * Math.PI); ctx.fill(); }
      legend(ctx, [[isN ? 'électrons nₑ' : 'trous nₕ', isN ? PALETTE[0] : PALETTE[1]], ['nᵢ intrinsèque', cssVar('--muted'), [5, 4]], ['densité de dopants', PALETTE[3], [2, 4]]], box.x1 - 170, box.y1 - 52);
      // --- graphique 2 : niveau de Fermi
      const g2 = setupCanvas(canvas2, 220); ctx = g2.ctx;
      box = { x0: 58, y0: 12, x1: g2.w - 12, y1: g2.h - 42 };
      ax = drawAxes(ctx, box, [0, 1000], [0, m.gap], { nx: 5, ny: 4, xfmt: v => fr(v, 0), yfmt: v => fr(v, 2), xlabel: 'température T (K)', ylabel: 'μ − εv (eV)' });
      const pm = []; for (let i = 1; i <= 200; i++) { const tt = 1000 * i / 200; if (tt < 12) continue; const mu = run(tt).mu; pm.push([tt, Math.max(0, Math.min(m.gap, mu))]); }
      polyline(ctx, [[0, m.gap / 2], [1000, m.gap / 2]], ax.sx, ax.sy, cssVar('--muted'), 1.2, [5, 4]);
      const lev = isN ? m.gap - ED : EA;
      polyline(ctx, [[0, lev], [1000, lev]], ax.sx, ax.sy, isN ? PALETTE[2] : PALETTE[1], 1.4, [8, 6]);
      polyline(ctx, pm, ax.sx, ax.sy, PALETTE[3], 2.6);
      ctx.fillStyle = cssVar('--bad'); ctx.beginPath(); ctx.arc(ax.sx(t), ax.sy(Math.max(0, Math.min(m.gap, r.mu))), 5, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = cssVar('--muted'); ctx.font = '11px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText('milieu de la bande interdite', box.x1 - 4, ax.sy(m.gap / 2) - 2); ctx.fillText(isN ? 'niveau donneur εd (εc en haut du graphique)' : 'niveau accepteur εa (εv en bas du graphique)', box.x1 - 4, ax.sy(lev) + (isN ? 14 : -2));
      // --- lectures
      const Ti = tIntrinsic(m.gap, Nx), simple = kB * t * Math.log(r.N / Nx);
      out.innerHTML = '';
      out.appendChild(readout([
        ['n<sub>e</sub> à T', dens(r.n)], ['n<sub>h</sub> à T', dens(r.p)], ['n<sub>i</sub> à T', dens(r.ni)],
        ['Régime', r.regime],
        [isN ? 'ε<sub>c</sub> − μ (numérique)' : 'μ − ε<sub>v</sub> (numérique)', fr(isN ? m.gap - r.mu : r.mu, 3) + ' eV'],
        [isN ? 'Formule kT ln(N<sub>c</sub>/N<sub>D</sub>)' : 'Formule kT ln(N<sub>v</sub>/N<sub>A</sub>)', fr(simple, 3) + ' eV'],
        ['Température de retour à l’intrinsèque Δε/(2k ln(N<sub>c</sub>/N))', fr(Ti, 0) + ' K'],
        ['Porteurs minoritaires n<sub>i</sub>²/N', sci(r.ni * r.ni / Nx, 3) + ' m⁻³']
      ]));
      out.appendChild(el('p', { class: 'w-note' }, 'La formule simple n’est valable que dans le régime extrinsèque : comparez les deux valeurs en baissant T sous 100 K ou en dépassant la température de transition. Attention aux notations : le manuel compte les états donneurs, deux par atome (𝒩_d = 2N_D), d’où son ln(2N_c/𝒩_d), qui est le même nombre.'));
    }
    [logN.input, T.input].forEach(i => i.addEventListener('input', update)); [mat.input, type.input].forEach(i => i.addEventListener('change', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Dérive et diffusion animées ===================== */
  function widgetDriftDiffusion(c) {
    header(c, 'Dérive et diffusion des porteurs (animation)',
      'Chaque point est un porteur qui subit des collisions aléatoires. Un champ électrique ajoute une vitesse de dérive ; un gradient de concentration s’efface tout seul par diffusion. Les barres du bas donnent la concentration le long du barreau.');
    const scen = selIn('Scénario', [['drift', 'champ appliqué, circuit fermé : dérive'], ['diff', 'gradient initial, sans champ : diffusion'], ['both', 'gradient initial et champ : les deux']], 'drift');
    const car = selIn('Porteurs', [['e', 'électrons (charge −e)'], ['h', 'trous (charge +e)']], 'e');
    const E = rangeInput('Champ électrique E (V/cm), positif vers la droite', 100, -200, 200, 10, v => fr(v, 0));
    const btnReset = el('button', { class: 'btn secondary', type: 'button' }, 'Relancer');
    const btnPause = el('button', { class: 'btn secondary', type: 'button' }, 'Pause');
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [scen.lab, car.lab, E.lab, el('label', {}, [el('span', {}, 'Animation'), el('span', {}, [btnReset, ' ', btnPause])])]), canvas, out);
    const NP = 120; let parts = [], running = true, visible = true, raf = null, geom = null;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { running = false; btnPause.textContent = 'Reprendre'; }
    function gauss() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.2; }
    function reset() {
      const grad = scen.input.value !== 'drift';
      parts = Array.from({ length: NP }, () => ({ x: grad ? Math.pow(Math.random(), 2.2) * 0.45 : Math.random(), y: Math.random() }));
    }
    function step() {
      const sign = car.input.value === 'e' ? -1 : 1, s = scen.input.value;
      const Ef = s === 'diff' ? 0 : val(E.input), v = sign * Ef / 200 * 0.006, wrap = s === 'drift';
      parts.forEach(p => {
        p.x += v + gauss() * 0.006; p.y += gauss() * 0.02;
        if (wrap) { if (p.x < 0) p.x += 1; if (p.x > 1) p.x -= 1; } else { if (p.x < 0) p.x = -p.x; if (p.x > 1) p.x = 2 - p.x; }
        if (p.y < 0) p.y = -p.y; if (p.y > 1) p.y = 2 - p.y;
      });
    }
    function draw() {
      const { ctx, w, h } = setupCanvas(canvas, 270);
      const x0 = 30, x1 = w - 30, y0 = 62, y1 = 170, isE = car.input.value === 'e', s = scen.input.value, Ef = s === 'diff' ? 0 : val(E.input);
      const txt = cssVar('--text'), mut = cssVar('--muted'), col = isE ? PALETTE[0] : PALETTE[1];
      ctx.fillStyle = cssVar('--surface-2'); ctx.strokeStyle = mut; ctx.lineWidth = 1.2; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      parts.forEach(p => {
        const x = x0 + 6 + p.x * (x1 - x0 - 12), y = y0 + 6 + p.y * (y1 - y0 - 12);
        ctx.beginPath(); ctx.arc(x, y, 3.6, 0, 2 * Math.PI);
        if (isE) { ctx.fillStyle = col; ctx.fill(); } else { ctx.fillStyle = cssVar('--surface'); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke(); }
      });
      // flèches
      ctx.font = '12px sans-serif'; ctx.textBaseline = 'middle';
      const mid = (x0 + x1) / 2, L = Math.min(120, (x1 - x0) / 4);
      if (Ef !== 0) {
        const d = Ef > 0 ? 1 : -1, dd = isE ? -d : d;
        arrowLine(ctx, mid - d * L, 16, mid + d * L, 16, txt); ctx.fillStyle = txt; ctx.textAlign = 'left'; ctx.fillText('champ E', x0, 16);
        arrowLine(ctx, mid - dd * L, 34, mid + dd * L, 34, col); ctx.fillStyle = col; ctx.fillText('dérive des ' + (isE ? 'électrons' : 'trous'), x0, 34);
        arrowLine(ctx, mid - d * L, 52, mid + d * L, 52, PALETTE[3]); ctx.fillStyle = PALETTE[3]; ctx.textAlign = 'right'; ctx.fillText('courant de dérive J', x1, 52);
      } else { ctx.fillStyle = mut; ctx.textAlign = 'left'; ctx.fillText('pas de champ : seul le mouvement aléatoire agit', x0, 34); }
      // histogramme de concentration
      const NB = 16, bins = new Array(NB).fill(0); parts.forEach(p => { bins[Math.min(NB - 1, Math.floor(p.x * NB))]++; });
      const bw = (x1 - x0) / NB, hmax = 60, top = 186;
      bins.forEach((b, i) => { ctx.fillStyle = isE ? 'rgba(31, 95, 191, 0.45)' : 'rgba(192, 57, 43, 0.45)'; const bh = Math.min(hmax, b / NP * NB * 18); ctx.fillRect(x0 + i * bw + 1, top + hmax - bh, bw - 2, bh); });
      ctx.fillStyle = mut; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('concentration le long du barreau', x0, top - 14);
      if (s !== 'drift') {
        const left = bins.slice(0, NB / 2).reduce((a, b) => a + b, 0), right = NP - left;
        if (Math.abs(left - right) > NP * 0.12) { const d = left > right ? 1 : -1, jd = isE ? -d : d; arrowLine(ctx, mid - d * 50, top + 12, mid + d * 50, top + 12, col); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText('flux de diffusion', mid + 60, top + 6); arrowLine(ctx, mid - jd * 50, top + 30, mid + jd * 50, top + 30, PALETTE[3]); ctx.fillStyle = PALETTE[3]; ctx.fillText('courant de diffusion', mid + 60, top + 24); }
        else { ctx.fillStyle = mut; ctx.textAlign = 'right'; ctx.fillText('concentration uniforme : plus de diffusion nette', x1, top - 14); }
      }
    }
    function readouts() {
      const isE = car.input.value === 'e', mu = isE ? 1350 : 480, Ef = scen.input.value === 'diff' ? 0 : val(E.input), D = mu * kB * 300;
      out.innerHTML = '';
      out.appendChild(readout([
        ['Mobilité dans le silicium à 300 K', fr(mu, 0) + ' cm²/(V s)'], ['Vitesse de dérive v<sub>d</sub> = μ|E|', sci(mu * Math.abs(Ef), 3) + ' cm/s'],
        ['Courant de dérive J = enμE (n = 10<sup>16</sup> cm⁻³)', sci(Q * 1e16 * mu * Math.abs(Ef), 3) + ' A/cm²'],
        ['Coefficient de diffusion D = μkT/e', fr(D, 1) + ' cm²/s'], ['kT/e à 300 K', fr(kB * 300 * 1000, 1) + ' mV'],
        ['Sens du courant de dérive', Ef === 0 ? 'aucun' : 'celui de E, pour les électrons comme pour les trous']
      ]));
      out.appendChild(el('p', { class: 'w-note' }, 'Les électrons dérivent contre le champ mais portent une charge négative : leur courant est dans le sens de E, comme celui des trous. Pour la diffusion, le flux de particules va vers les faibles concentrations ; le courant a le même sens pour les trous et le sens opposé pour les électrons. La vitesse de dérive réelle (10⁵ cm/s pour 100 V/cm) reste petite devant la vitesse thermique (10⁷ cm/s) : l’animation exagère la dérive.'));
    }
    function loop() { raf = null; if (!running || !visible) return; step(); draw(); raf = requestAnimationFrame(loop); }
    function kick() { if (running && visible && raf === null) raf = requestAnimationFrame(loop); }
    btnReset.addEventListener('click', () => { reset(); draw(); kick(); });
    btnPause.addEventListener('click', () => { running = !running; btnPause.textContent = running ? 'Pause' : 'Reprendre'; kick(); });
    scen.input.addEventListener('change', () => { reset(); readouts(); draw(); kick(); });
    car.input.addEventListener('change', () => { readouts(); draw(); }); E.input.addEventListener('input', () => { readouts(); draw(); });
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; kick(); }, { threshold: 0.05 }).observe(canvas);
    reset(); readouts(); draw(); kick();
    window.addEventListener('resize', draw); document.addEventListener('themechange', draw);
  }

  /* ===================== Conductivité et résistance d'un barreau ===================== */
  function widgetConductivity(c) {
    header(c, 'Conductivité et résistance d’un barreau (modèle de Drude)',
      'σ = e(n<sub>e</sub>μ<sub>e</sub> + n<sub>h</sub>μ<sub>h</sub>), ρ = 1/σ, R = ρL/A. Choisissez un exemple ou entrez vos valeurs ; une tension appliquée donne le champ, le courant et la vitesse de dérive.');
    const ni = nIntr(1.14, 300), niGe = nIntr(0.67, 300);
    const PRESET = [['siN', 'silicium type N, 10¹⁶ cm⁻³', 1e22, 0.135, ni * ni / 1e22, 0.048], ['siP', 'silicium type P, 10¹⁷ cm⁻³', ni * ni / 1e23, 0.135, 1e23, 0.048], ['siI', 'silicium intrinsèque à 300 K', ni, 0.135, ni, 0.048], ['geI', 'germanium intrinsèque à 300 K', niGe, 0.39, niGe, 0.19], ['cu', 'cuivre (métal)', 8.5e28, 0.0043, 0, 0]];
    const preset = selIn('Exemple', PRESET.map(p => [p[0], p[1]]), 'siN');
    const ne = numIn('n<sub>e</sub> (m⁻³)', 1e22, { step: 'any', min: 0 }), mue = numIn('μ<sub>e</sub> (m²/(V s))', 0.135, { step: 'any', min: 0 });
    const nh = numIn('n<sub>h</sub> (m⁻³)', sci(ni * ni / 1e22, 3).replace(/[^0-9,.]/g, '') ? ni * ni / 1e22 : 0, { step: 'any', min: 0 }), muh = numIn('μ<sub>h</sub> (m²/(V s))', 0.048, { step: 'any', min: 0 });
    const L = numIn('Longueur L (mm)', 1, { step: 'any', min: 0 }), A = numIn('Section A (mm²)', 0.01, { step: 'any', min: 0 }), V = numIn('Tension appliquée (V)', 1, { step: 'any' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [preset.lab, ne.lab, mue.lab, nh.lab, muh.lab, L.lab, A.lab, V.lab]), out);
    function applyPreset() { const p = PRESET.find(q => q[0] === preset.input.value); if (!p) return; ne.input.value = p[2].toPrecision(4); mue.input.value = p[3]; nh.input.value = p[4].toPrecision(4); muh.input.value = p[5]; update(); }
    function update() {
      const a = val(ne.input) || 0, b = val(mue.input) || 0, cH = val(nh.input) || 0, d = val(muh.input) || 0, l = val(L.input) * 1e-3, s = val(A.input) * 1e-6, v = val(V.input);
      const sig = Q * (a * b + cH * d), rho = 1 / sig, R = rho * l / s, Ef = v / l, I = v / R;
      out.innerHTML = '';
      out.appendChild(readout([
        ['Conductivité σ', sci(sig, 3) + ' S/m'], ['Part des électrons dans σ', fr(100 * a * b / (a * b + cH * d || 1), 1) + ' %'],
        ['Résistivité ρ = 1/σ', sci(rho, 3) + ' Ω m = ' + sci(rho * 100, 3) + ' Ω cm'], ['Résistance R = ρL/A', sci(R, 3) + ' Ω'],
        ['Champ E = V/L', sci(Ef, 3) + ' V/m'], ['Courant I = V/R', sci(I, 3) + ' A'], ['Densité de courant J = σE', sci(sig * Ef, 3) + ' A/m²'],
        ['Vitesse de dérive des électrons μ<sub>e</sub>E', sci(b * Math.abs(Ef), 3) + ' m/s']
      ]));
      out.appendChild(el('p', { class: 'w-note' }, 'Ordres de grandeur : le cuivre conduit 10¹¹ fois mieux que le silicium intrinsèque, non parce que ses électrons sont plus mobiles (ils le sont 30 fois moins) mais parce qu’ils sont 10¹³ fois plus nombreux. Doper le silicium à 10¹⁶ cm⁻³, soit un atome sur cinq millions, multiplie sa conductivité par un million.'));
    }
    preset.input.addEventListener('change', applyPreset); [ne, mue, nh, muh, L, A, V].forEach(f => f.input.addEventListener('input', update));
    applyPreset();
  }

  /* ===================== Enregistrement ===================== */
  Object.assign(window.ELE.widgets, {
    'band-diagram': widgetBandDiagram, 'intrinsic-carriers': widgetIntrinsic, 'doping-regimes': widgetDopingRegimes, 'drift-diffusion': widgetDriftDiffusion, conductivity: widgetConductivity
  });
  if (window.ELE.initWidgets) window.ELE.initWidgets();
})();
