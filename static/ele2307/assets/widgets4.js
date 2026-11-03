/* ELE2307 - démonstrations interactives du cours 8 (s'appuie sur la boîte à outils de widgets.js) */
(function () {
  'use strict';
  const W = window.ELE && window.ELE.wk;
  if (!W) { console.error('widgets.js doit être chargé avant widgets4.js'); return; }
  const { el, rangeInput, readout, header, setupCanvas, drawAxes, fr, sci, cssVar } = W;
  const k = 1.381e-23, h = 6.626e-34, c = 2.998e8, eV = 1.602e-19, kB = 8.617e-5;
  const A_RAD = 8 * Math.pow(Math.PI, 5) * Math.pow(k, 4) / (15 * Math.pow(h, 3) * Math.pow(c, 3));   // 7,57e-16 J/(m³ K⁴)
  const SIGMA = c * A_RAD / 4;                                                                          // 5,67e-8 W/(m² K⁴)
  const PALETTE = ['#1f5fbf', '#c0392b', '#0d8f7a', '#b7791f', '#7c4dff'];

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
  function table(headers, rows) {
    const t = el('table');
    t.appendChild(el('tr', {}, headers.map(x => el('th', { html: x }))));
    rows.forEach(r => t.appendChild(el('tr', {}, r.map((cell, j) => el('td', { class: j === 0 ? '' : 'num', html: cell })))));
    return t;
  }

  /* ===================== Spectre de Planck ===================== */
  function widgetPlanck(c0) {
    header(c0, 'Spectre du corps noir : loi de Planck, loi de Wien, catastrophe ultraviolette',
      'Densité spectrale d’énergie du gaz de photons à la température T, en longueur d’onde (du/dλ) ou en énergie (du/dε). La courbe grise est la prédiction classique de Rayleigh-Jeans, qui diverge aux courtes longueurs d’onde. La bande colorée est le visible (380 à 750 nm).');
    const T = rangeInput('Température T (K)', 5800, 300, 12000, 50, v => fr(v, 0));
    const mode = selIn('Variable', [['lambda', 'longueur d’onde λ (du/dλ)'], ['eps', 'énergie ε (du/dε)']], 'lambda');
    const rj = selIn('Courbe de Rayleigh-Jeans', [['1', 'afficher'], ['0', 'masquer']], '1');
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c0.append(el('div', { class: 'controls' }, [T.lab, mode.lab, rj.lab]), canvas, out);
    function update() {
      const t = val(T.input), kT = k * t, lamMax = h * c / (4.965 * kT), epsMax = 2.821 * kT;
      const { ctx, w, h: hh } = setupCanvas(canvas, 300);
      const box = { x0: 60, y0: 12, x1: w - 12, y1: hh - 42 };
      const N = 360;
      if (mode.input.value === 'lambda') {
        const lmax = 6 * lamMax, pts = [], ptsRJ = [];
        const f = l => 8 * Math.PI * h * c * Math.pow(l, -5) / (Math.exp(h * c / (l * kT)) - 1);
        const peak = f(lamMax);
        for (let i = 1; i <= N; i++) { const l = lmax * i / N; pts.push([l * 1e9, f(l) / peak]); ptsRJ.push([l * 1e9, 8 * Math.PI * kT * Math.pow(l, -4) / peak]); }
        const { sx, sy } = drawAxes(ctx, box, [0, lmax * 1e9], [0, 1.15], { nx: 6, ny: 5, xfmt: v => fr(v, 0), yfmt: v => fr(v, 1), xlabel: 'longueur d’onde λ (nm)', ylabel: 'du/dλ (rapporté au maximum)' });
        ctx.fillStyle = 'rgba(255, 200, 0, 0.18)'; ctx.fillRect(sx(380), box.y0, sx(750) - sx(380), box.y1 - box.y0);
        ctx.fillStyle = cssVar('--muted'); ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('visible', (sx(380) + sx(750)) / 2, box.y0 + 2);
        if (rj.input.value === '1') polyline(ctx, ptsRJ.filter(p => p[1] <= 1.15), sx, sy, cssVar('--muted'), 1.6, [5, 4]);
        polyline(ctx, pts, sx, sy, PALETTE[1]);
        ctx.strokeStyle = PALETTE[3]; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(sx(lamMax * 1e9), box.y0); ctx.lineTo(sx(lamMax * 1e9), box.y1); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = PALETTE[3]; ctx.textAlign = 'left'; ctx.fillText('λ_max = ' + fr(lamMax * 1e9, 0) + ' nm', sx(lamMax * 1e9) + 4, box.y0 + 16);
        legend(ctx, [['Planck', PALETTE[1]], ['Rayleigh-Jeans (classique)', cssVar('--muted'), [5, 4]]], box.x1 - 200, box.y0 + 14);
      } else {
        const emax = 12 * kT, pts = [], ptsRJ = [];
        const f = e => Math.pow(e, 3) / (Math.exp(e / kT) - 1);
        const peak = f(epsMax);
        for (let i = 1; i <= N; i++) { const e = emax * i / N; pts.push([e / eV, f(e) / peak]); ptsRJ.push([e / eV, e * e * kT / peak]); }
        const { sx, sy } = drawAxes(ctx, box, [0, emax / eV], [0, 1.15], { nx: 6, ny: 5, xfmt: v => fr(v, 2), yfmt: v => fr(v, 1), xlabel: 'énergie du photon ε (eV)', ylabel: 'du/dε (rapporté au maximum)' });
        const e1 = h * c / 750e-9 / eV, e2 = h * c / 380e-9 / eV;
        ctx.fillStyle = 'rgba(255, 200, 0, 0.18)'; ctx.fillRect(sx(Math.min(e1, emax / eV)), box.y0, sx(Math.min(e2, emax / eV)) - sx(Math.min(e1, emax / eV)), box.y1 - box.y0);
        if (rj.input.value === '1') polyline(ctx, ptsRJ.filter(p => p[1] <= 1.15), sx, sy, cssVar('--muted'), 1.6, [5, 4]);
        polyline(ctx, pts, sx, sy, PALETTE[0]);
        ctx.strokeStyle = PALETTE[3]; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(sx(epsMax / eV), box.y0); ctx.lineTo(sx(epsMax / eV), box.y1); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = PALETTE[3]; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('ε_max = 2,82 kT = ' + fr(epsMax / eV, 3) + ' eV', sx(epsMax / eV) + 4, box.y0 + 16);
        legend(ctx, [['Planck', PALETTE[0]], ['Rayleigh-Jeans (classique)', cssVar('--muted'), [5, 4]]], box.x1 - 200, box.y0 + 14);
      }
      const u = A_RAD * Math.pow(t, 4);
      out.innerHTML = '';
      out.appendChild(readout([
        ['kT', fr(kB * t, 4) + ' eV'],
        ['λ<sub>max</sub> de du/dλ (Wien) = hc/(4,965 kT)', sci(lamMax, 3) + ' m'],
        ['ε<sub>max</sub> de du/dε = 2,82 kT', fr(epsMax / eV, 3) + ' eV, soit λ = ' + sci(h * c / epsMax, 3) + ' m'],
        ['Densité d’énergie u = aT<sup>4</sup>', sci(u, 3) + ' J/m³'],
        ['Flux émis J = σT<sup>4</sup>', sci(SIGMA * Math.pow(t, 4), 3) + ' W/m²'],
        ['Photons par m³ ≈ 2,03 × 10<sup>7</sup> T<sup>3</sup>', sci(2.03e7 * Math.pow(t, 3), 2)],
        ['Énergie moyenne par photon 2,70 kT', fr(2.70 * kB * t, 3) + ' eV']
      ]));
      out.appendChild(el('p', { class: 'w-note' }, 'Repères : Soleil 5800 K (maximum à 500 nm, vert), lampe à incandescence 2800 K (1 µm, surtout infrarouge), corps humain 310 K (9,3 µm), fond cosmologique 2,7 K (1,1 mm). Les deux maximums (en λ et en ε) ne correspondent pas à la même longueur d’onde : ex. 5 et 6 du chap. 21.'));
    }
    T.input.addEventListener('input', update); [mode.input, rj.input].forEach(i => i.addEventListener('change', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Distribution des particules d'un gaz quantique ===================== */
  function widgetGasDistribution(c0) {
    header(c0, 'Distribution des particules : dN/dε = g(ε) × n̄(ε)',
      'Le produit de la densité d’états (tirets) et du nombre d’occupation (pointillés) donne le nombre de particules par unité d’énergie (courbe pleine). Comparez fermions et bosons, basse et haute température, gaz non relativiste (g ∝ √ε) et relativiste (g ∝ ε²). Courbes rapportées à leur maximum.');
    const stat = selIn('Statistique', [['F', 'fermions'], ['B', 'bosons']], 'F');
    const rel = selIn('Densité d’états', [['nr', 'non relativiste, g ∝ √ε'], ['rel', 'relativiste, g ∝ ε²']], 'nr');
    const T = rangeInput('Température T (K)', 600, 50, 6000, 50, v => fr(v, 0));
    const mu = rangeInput('Potentiel chimique μ (eV)', 0.4, -0.5, 0.8, 0.01, v => fr(v, 2));
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c0.append(el('div', { class: 'controls' }, [stat.lab, rel.lab, T.lab, mu.lab]), canvas, out);
    function update() {
      const t = val(T.input), kT = kB * t, isF = stat.input.value === 'F', alpha = rel.input.value === 'nr' ? 0.5 : 2;
      let m = val(mu.input); if (!isF && m > -0.001) m = -0.001;   // bosons : μ sous le plus bas état
      const emax = Math.max(1.2, Math.abs(m) * 1.5 + 8 * kT);
      const g = e => Math.pow(e, alpha), n = e => 1 / (Math.exp((e - m) / kT) + (isF ? 1 : -1));
      const N = 400, pts = [], ptsG = [], ptsN = []; let peak = 0, peakE = 0, sumE = 0, sum = 0;
      for (let i = 1; i <= N; i++) { const e = emax * i / N, y = g(e) * n(e); if (y > peak) { peak = y; peakE = e; } sum += y; sumE += e * y; }
      const nmax = isF ? 1 : Math.min(n(emax / N), 50);
      for (let i = 1; i <= N; i++) { const e = emax * i / N; pts.push([e, g(e) * n(e) / peak]); ptsG.push([e, g(e) / g(emax)]); ptsN.push([e, Math.min(n(e) / nmax, 1.15)]); }
      const { ctx, w, h: hh } = setupCanvas(canvas, 300);
      const box = { x0: 52, y0: 12, x1: w - 12, y1: hh - 42 };
      const { sx, sy } = drawAxes(ctx, box, [0, emax], [0, 1.15], { nx: 6, ny: 5, xfmt: v => fr(v, 2), yfmt: v => fr(v, 1), xlabel: 'énergie ε (eV)', ylabel: 'unités arbitraires' });
      ctx.fillStyle = isF ? 'rgba(31, 95, 191, 0.15)' : 'rgba(192, 57, 43, 0.15)'; ctx.beginPath(); ctx.moveTo(sx(0), sy(0)); pts.forEach(p => ctx.lineTo(sx(p[0]), sy(p[1]))); ctx.lineTo(sx(emax), sy(0)); ctx.closePath(); ctx.fill();
      polyline(ctx, ptsG, sx, sy, cssVar('--muted'), 1.6, [6, 4]);
      polyline(ctx, ptsN, sx, sy, PALETTE[2], 1.6, [2, 3]);
      polyline(ctx, pts, sx, sy, isF ? PALETTE[0] : PALETTE[1], 2.4);
      if (m > 0 && m < emax) { ctx.strokeStyle = PALETTE[3]; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(sx(m), box.y0); ctx.lineTo(sx(m), box.y1); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = PALETTE[3]; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('μ', sx(m) + 4, box.y0 + 2); }
      legend(ctx, [['g(ε) densité d’états', cssVar('--muted'), [6, 4]], ['n̄(ε) nombre d’occupation', PALETTE[2], [2, 3]], ['dN/dε = g × n̄', isF ? PALETTE[0] : PALETTE[1]]], box.x1 - 215, box.y0 + 14);
      out.innerHTML = '';
      out.appendChild(readout([['kT', fr(kT, 4) + ' eV'], ['μ utilisé', fr(m, 3) + ' eV'], ['Maximum de dN/dε', fr(peakE, 3) + ' eV'], ['Énergie moyenne par particule (numérique)', fr(sumE / sum, 3) + ' eV, soit ' + fr(sumE / sum / kT, 2) + ' kT'], ['Largeur de la marche des fermions ≈ 4 kT', fr(4 * kT, 3) + ' eV']]));
      out.appendChild(el('p', { class: 'w-note' }, 'Lectures : fermions à basse température, les états sont pleins jusqu’à μ puis vides (gaz dégénéré, cours 9) ; à haute température ou μ très négatif, la courbe prend la forme classique ε^α e^(−βε) (énergie moyenne 3kT/2 pour α = 1/2, 3kT pour α = 2). Bosons avec μ = 0 et g ∝ ε² : c’est le gaz de photons, énergie moyenne 2,70 kT.'));
    }
    [T.input, mu.input].forEach(i => i.addEventListener('input', update)); [stat.input, rel.input].forEach(i => i.addEventListener('change', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Effet de serre ===================== */
  function widgetGreenhouse(c0) {
    header(c0, 'Effet de serre : la couche qui renvoie la moitié vers le sol',
      'Le sol absorbe un flux J<sub>abs</sub> et rayonne J<sub>o</sub> = eσT<sup>4</sup>. L’atmosphère (ou la vitre) absorbe une fraction x de J<sub>o</sub> et en réémet la moitié vers le haut, la moitié vers le sol. À l’équilibre J<sub>o</sub> = J<sub>abs</sub>/(1 − x/2), donc T<sub>sol</sub> = T<sub>0</sub>[2/(2 − x)]<sup>1/4</sup>. Réglages par défaut : exemples 3 et 4 des diapos.');
    const Ji = numIn('Flux solaire incident (W/m²)', 175, { min: 0, step: 'any' });
    const abs = rangeInput('Fraction absorbée par le sol', 0.9, 0.1, 1, 0.01, v => fr(v, 2));
    const em = rangeInput('Émissivité du sol dans l’infrarouge e', 0.9, 0.1, 1, 0.01, v => fr(v, 2));
    const x = rangeInput('Fraction x de l’infrarouge absorbée par l’atmosphère', 0, 0, 1, 0.01, v => fr(v, 2));
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c0.append(el('div', { class: 'controls' }, [Ji.lab, abs.lab, em.lab, x.lab]), canvas, out);
    function Ts(xx) { const Jabs = val(Ji.input) * val(abs.input); return Math.pow(Jabs / (1 - xx / 2) / (val(em.input) * SIGMA), 0.25); }
    function update() {
      const xx = val(x.input), Jabs = val(Ji.input) * val(abs.input), Jo = Jabs / (1 - xx / 2), T0 = Ts(0), T = Ts(xx);
      const { ctx, w, h: hh } = setupCanvas(canvas, 230);
      const box = { x0: 52, y0: 12, x1: w - 12, y1: hh - 42 };
      const pts = []; for (let i = 0; i <= 100; i++) pts.push([i / 100, Ts(i / 100)]);
      const { sx, sy } = drawAxes(ctx, box, [0, 1], [Math.floor(T0 / 10) * 10 - 10, Math.ceil(Ts(1) / 10) * 10 + 10], { nx: 5, ny: 4, xfmt: v => fr(v, 1), yfmt: v => fr(v, 0), xlabel: 'fraction x absorbée par l’atmosphère', ylabel: 'T du sol (K)' });
      polyline(ctx, pts, sx, sy, PALETTE[2]);
      ctx.fillStyle = cssVar('--bad'); ctx.beginPath(); ctx.arc(sx(xx), sy(T), 5, 0, 2 * Math.PI); ctx.fill();
      out.innerHTML = '';
      out.appendChild(readout([['Flux absorbé par le sol J<sub>abs</sub>', fr(Jabs, 1) + ' W/m²'], ['Flux rayonné par le sol J<sub>o</sub> = J<sub>abs</sub>/(1 − x/2)', fr(Jo, 1) + ' W/m²'], ['Renvoyé vers le sol (x/2)J<sub>o</sub>', fr(xx / 2 * Jo, 1) + ' W/m²'], ['T<sub>0</sub> sans atmosphère (x = 0)', fr(T0, 1) + ' K = ' + fr(T0 - 273.15, 1) + ' °C'], ['T du sol avec cette atmosphère', fr(T, 1) + ' K = ' + fr(T - 273.15, 1) + ' °C'], ['Facteur [2/(2 − x)]<sup>1/4</sup>', fr(Math.pow(2 / (2 - xx), 0.25), 4)]]));
      out.appendChild(el('p', { class: 'w-note' }, 'Avec 175 W/m², 90 % absorbés et e = 0,9 : 236 K (−37 °C) sans atmosphère, 280 K (7 °C) si l’atmosphère absorbe tout l’infrarouge sortant (x = 1). La Terre réelle est à 288 K : l’atmosphère renvoie plus que la moitié vers le bas (plusieurs couches, vapeur d’eau, nuages).'));
    }
    [Ji.input, abs.input, em.input, x.input].forEach(i => i.addEventListener('input', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Écrans thermiques (feuilles) ===================== */
  function widgetHeatShields(c0) {
    header(c0, 'Écrans thermiques : n feuilles entre deux surfaces',
      'En régime permanent, le même flux traverse chaque couche : eσ(T<sub>0</sub><sup>4</sup> − T<sub>1</sub><sup>4</sup>) = eσ(T<sub>1</sub><sup>4</sup> − T<sub>2</sub><sup>4</sup>) = ... Le flux radiatif est divisé par n + 1 et les T<sup>4</sup> des feuilles sont régulièrement espacés. Réglages par défaut : ex. 27 du chap. 21 (trois feuilles entre 100 K et 300 K).');
    const T0 = numIn('T<sub>0</sub> côté chaud (K)', 300, { min: 1, step: 'any' });
    const Tn = numIn('T<sub>n+1</sub> côté froid (K)', 100, { min: 0, step: 'any' });
    const em = rangeInput('Émissivité e (toutes les surfaces)', 1, 0.05, 1, 0.05, v => fr(v, 2));
    const n = rangeInput('Nombre de feuilles n', 3, 0, 10, 1, v => fr(v, 0));
    const out = el('div');
    c0.append(el('div', { class: 'controls' }, [T0.lab, Tn.lab, em.lab, n.lab]), out);
    function update() {
      const a = val(T0.input), b = val(Tn.input), e = val(em.input), nn = Math.round(val(n.input));
      const J0 = e * SIGMA * (Math.pow(a, 4) - Math.pow(b, 4)), J = J0 / (nn + 1);
      const rows = []; for (let i = 1; i <= nn; i++) rows.push(['feuille ' + i, fr(Math.pow(Math.pow(a, 4) - i * (Math.pow(a, 4) - Math.pow(b, 4)) / (nn + 1), 0.25), 1) + ' K']);
      out.innerHTML = '';
      out.appendChild(readout([['Flux sans feuille eσ(T<sub>0</sub><sup>4</sup> − T<sub>n+1</sub><sup>4</sup>)', fr(J0, 1) + ' W/m²'], ['Flux avec n feuilles : divisé par n + 1', fr(J, 1) + ' W/m²'], ['Réduction', '× 1/' + (nn + 1)]]));
      if (rows.length) out.appendChild(table(['Température des feuilles (T<sup>4</sup> régulièrement espacés)', 'T'], rows));
      out.appendChild(el('p', { class: 'w-note' }, 'Même principe pour les vêtements en couches, les couvertures de survie et les isolants multicouches des satellites. Le calcul ne tient compte que du rayonnement (pas de conduction par l’air entre les feuilles).'));
    }
    [T0.input, Tn.input, em.input, n.input].forEach(i => i.addEventListener('input', update));
    update();
  }

  /* ===================== Calculateur de flux (Stefan-Boltzmann) ===================== */
  function widgetStefan(c0) {
    header(c0, 'Calculateur de rayonnement : flux, puissance, échange net et flux à distance',
      'J = eσT<sup>4</sup> pour une surface, échange net eσA(T<sup>4</sup> − T<sub>env</sub><sup>4</sup>) avec un environnement de même émissivité, et flux reçu à la distance d d’une source sphérique de rayon R : J(d) = J(R)(R/d)<sup>2</sup>.');
    const PRESET = [['humain', 'corps humain habillé : 300 K dans 290 K, 2 m²', 300, 290, 1, 2, 0, 0], ['nu', 'corps humain nu dans l’espace : 300 K, 2 m²', 300, 0, 1, 2, 0, 0], ['soleil', 'Soleil : 5800 K, R = 7 × 10⁸ m, vu de la Terre (1,5 × 10¹¹ m)', 5800, 0, 1, 6.16e18, 7e8, 1.5e11], ['terre', 'Terre vue de l’espace : 240 K, R = 6,4 × 10⁶ m', 240, 2.7, 1, 5.15e14, 6.4e6, 3.84e8], ['ampoule', 'filament d’ampoule : 2800 K, 1 cm², e = 0,4', 2800, 300, 0.4, 1e-4, 0, 0], ['puce', 'boîtier de composant : 350 K dans 300 K, 4 cm², e = 0,9', 350, 300, 0.9, 4e-4, 0, 0]];
    const preset = selIn('Exemple', PRESET.map(p => [p[0], p[1]]), 'humain');
    const T = numIn('Température T (K)', 300, { min: 0, step: 'any' });
    const Te = numIn('Température de l’environnement T<sub>env</sub> (K)', 290, { min: 0, step: 'any' });
    const em = numIn('Émissivité e', 1, { min: 0, max: 1, step: 'any' });
    const A = numIn('Surface A (m²)', 2, { min: 0, step: 'any' });
    const R = numIn('Rayon de la source R (m), pour le flux à distance', 0, { min: 0, step: 'any' });
    const d = numIn('Distance d (m)', 0, { min: 0, step: 'any' });
    const out = el('div');
    c0.append(el('div', { class: 'controls' }, [preset.lab, T.lab, Te.lab, em.lab, A.lab, R.lab, d.lab]), out);
    function applyPreset() { const p = PRESET.find(q => q[0] === preset.input.value); if (!p) return; [T, Te, em, A, R, d].forEach((f, i) => { f.input.value = p[i + 2]; }); update(); }
    function update() {
      const t = val(T.input), te = val(Te.input), e = val(em.input), a = val(A.input), r = val(R.input), dd = val(d.input);
      const J = e * SIGMA * Math.pow(t, 4), Jnet = e * SIGMA * (Math.pow(t, 4) - Math.pow(te, 4)), P = Jnet * a;
      const rows = [['Flux émis J = eσT<sup>4</sup>', sci(J, 3) + ' W/m²'], ['Flux absorbé de l’environnement eσT<sub>env</sub><sup>4</sup>', sci(e * SIGMA * Math.pow(te, 4), 3) + ' W/m²'], ['Échange net par m²', sci(Jnet, 3) + ' W/m²'], ['Puissance nette P = J<sub>net</sub>A', sci(P, 3) + ' W'], ['Énergie par jour', sci(P * 86400, 3) + ' J = ' + fr(P * 86400 / 4184, 0) + ' kcal'], ['Coefficient linéarisé 4eσT<sup>3</sup> (loi de Newton)', fr(4 * e * SIGMA * Math.pow(t, 3), 2) + ' W/(m² K)'], ['λ<sub>max</sub> de l’émission (Wien)', sci(h * c / (4.965 * k * t), 3) + ' m']];
      if (r > 0 && dd > r) rows.push(['Flux à la distance d : J(R/d)<sup>2</sup>', sci(J * Math.pow(r / dd, 2), 3) + ' W/m²'], ['Puissance totale de la sphère 4πR<sup>2</sup>J', sci(4 * Math.PI * r * r * J, 3) + ' W']);
      out.innerHTML = ''; out.appendChild(readout(rows));
      out.appendChild(el('p', { class: 'w-note' }, 'Ex. 19 et 20 du chap. 21 : un corps nu dans le vide perd 920 W (19 000 kcal par jour) ; habillé dans une pièce à 290 K, 116 W et 2400 kcal par jour, ce qui est à peu près la ration alimentaire. Le Soleil : 6,4 × 10⁷ W/m² à sa surface, 1,4 kW/m² à la distance de la Terre.'));
    }
    preset.input.addEventListener('change', applyPreset); [T.input, Te.input, em.input, A.input, R.input, d.input].forEach(i => i.addEventListener('input', update));
    update();
  }

  /* ===================== Enregistrement ===================== */
  Object.assign(window.ELE.widgets, {
    'planck-spectrum': widgetPlanck, 'gas-distribution': widgetGasDistribution, greenhouse: widgetGreenhouse, 'heat-shields': widgetHeatShields, 'stefan-flux': widgetStefan
  });
  if (window.ELE.initWidgets) window.ELE.initWidgets();
})();
