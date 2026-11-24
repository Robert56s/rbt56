/* ELE2307 - démonstrations interactives du cours 10B, applications de la jonction PN (s'appuie sur la boîte à outils de widgets.js) */
(function () {
  'use strict';
  const W = window.ELE && window.ELE.wk;
  if (!W) { console.error('widgets.js doit être chargé avant widgets7.js'); return; }
  const { el, rangeInput, readout, header, setupCanvas, drawAxes, fr, sci, sup, cssVar } = W;
  const KB = 8.617333e-5, Q = 1.602177e-19, HC = 1239.84;       // eV/K, C, eV nm
  const val = inp => parseFloat(inp.value);
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
  /** Notation scientifique systématique : 1,45 × 10⁴ */
  const sc = (x, d = 2) => { if (!isFinite(x) || x === 0) return String(x); let e = Math.floor(Math.log10(Math.abs(x))), m = Number((x / Math.pow(10, e)).toFixed(d)); if (Math.abs(m) >= 10) { m /= 10; e += 1; } return fr(m, d) + ' × 10' + sup(e); };
  /** Couleur approximative d'une longueur d'onde (nm), pour l'affichage. */
  function wlColor(w, alpha = 1) {
    let r, g, b;
    if (w < 380) { r = 0.5; g = 0; b = 0.7; } else if (w < 440) { r = (440 - w) / 60; g = 0; b = 1; } else if (w < 490) { r = 0; g = (w - 440) / 50; b = 1; }
    else if (w < 510) { r = 0; g = 1; b = (510 - w) / 20; } else if (w < 580) { r = (w - 510) / 70; g = 1; b = 0; } else if (w < 645) { r = 1; g = (645 - w) / 65; b = 0; } else { r = 1; g = 0; b = 0; }
    let f = 1; if (w < 420) f = 0.35 + 0.65 * Math.max(0, w - 380) / 40; else if (w > 700) f = 0.35 + 0.65 * Math.max(0, 780 - w) / 80;
    const c = v => Math.round(255 * Math.pow(v * f, 0.8));
    return 'rgba(' + c(r) + ',' + c(g) + ',' + c(b) + ',' + alpha + ')';
  }
  function colorName(w) {
    if (w < 380) return 'ultraviolet (invisible)'; if (w < 450) return 'violet'; if (w < 495) return 'bleu'; if (w < 570) return 'vert';
    if (w < 590) return 'jaune'; if (w < 620) return 'orange'; if (w <= 750) return 'rouge'; return 'infrarouge (invisible)';
  }
  function spectrumBar(ctx, sx, l0, l1, y, h) {
    for (let l = l0; l < l1; l += 2) { ctx.fillStyle = wlColor(l); ctx.fillRect(sx(l), y, Math.ceil(sx(l + 2) - sx(l)) + 0.5, h); }
  }

  /* ===================== Syntoniseur à diode varicap ===================== */
  function widgetVaricap(c) {
    header(c, 'Syntoniseur : accorder un circuit LC avec une diode varicap',
      'La tension inverse V<sub>R</sub> élargit la zone désertée, donc diminue C<sub>d</sub> = C<sub>d</sub>(0)/√(1 + V<sub>R</sub>/V<sub>B</sub>) et augmente la fréquence de résonance f = 1/(2π√(LC)). Déplacez l’aiguille du cadran avec la tension.');
    const L = numIn('Inductance L (nH)', 100, { step: 'any', min: 1 }), C0 = numIn('C<sub>d</sub>(0) (pF)', 40, { step: 'any', min: 0.1 }), VB = numIn('V<sub>B</sub> (V)', 0.7, { step: 'any', min: 0.1 });
    const VR = rangeInput('Tension inverse V<sub>R</sub> (V)', 1, 0, 30, 0.05, v => fr(v, 2));
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [L.lab, C0.lab, VB.lab, VR.lab]), canvas, out);
    function update() {
      const l = Math.max(val(L.input) || 1, 1e-3) * 1e-9, c0 = Math.max(val(C0.input) || 0.1, 1e-3) * 1e-12, vb = Math.max(val(VB.input) || 0.1, 0.05), vr = val(VR.input), C = colors();
      const cap = v => c0 / Math.sqrt(1 + v / vb), freq = v => 1 / (2 * Math.PI * Math.sqrt(l * cap(v)));
      const f = freq(vr), fmin = freq(0), fmax = freq(30);
      const { ctx, w, h } = setupCanvas(canvas, 300);
      // --- cadran
      const x0 = 30, x1 = w - 30, yd = 54, sxf = v => x0 + (v - fmin) / (fmax - fmin) * (x1 - x0), MHz = v => v / 1e6;
      ctx.fillStyle = C.s; ctx.strokeStyle = C.m; ctx.lineWidth = 1; ctx.fillRect(x0 - 12, 14, x1 - x0 + 24, 66); ctx.strokeRect(x0 - 12, 14, x1 - x0 + 24, 66);
      const a = Math.max(87.5e6, fmin), b = Math.min(108e6, fmax);
      if (b > a) { ctx.globalAlpha = 0.22; ctx.fillStyle = C.d; ctx.fillRect(sxf(a), 20, sxf(b) - sxf(a), 54); ctx.globalAlpha = 1; ctx.fillStyle = C.d; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('bande FM (87,5 à 108 MHz)', (sxf(a) + sxf(b)) / 2, 22); }
      const span = MHz(fmax - fmin), stepM = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find(s => span / s <= 10) || 2000;
      ctx.strokeStyle = C.t; ctx.fillStyle = C.t; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let m = Math.ceil(MHz(fmin) / stepM) * stepM; m <= MHz(fmax); m += stepM) { const x = sxf(m * 1e6); ctx.beginPath(); ctx.moveTo(x, yd - 8); ctx.lineTo(x, yd + 2); ctx.stroke(); ctx.fillText(fr(m, 0), x, yd + 6); }
      ctx.strokeStyle = C.h; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sxf(f), 18); ctx.lineTo(sxf(f), 76); ctx.stroke();
      ctx.fillStyle = C.m; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('MHz', x1 + 8, 18);
      // --- courbe f(V_R)
      const box = { x0: 62, y0: 104, x1: w - 14, y1: h - 42 };
      const { sx, sy } = drawAxes(ctx, box, [0, 30], [MHz(fmin), MHz(fmax)], { nx: 6, ny: 4, xfmt: v => fr(v, 0), yfmt: v => fr(v, 0), xlabel: 'tension inverse (V)', ylabel: 'fréquence (MHz)' });
      const pts = []; for (let i = 0; i <= 200; i++) { const v = 30 * i / 200; pts.push([sx(v), sy(MHz(freq(v)))]); }
      polyline(ctx, pts, C.e, 2.4);
      ctx.fillStyle = C.h; ctx.beginPath(); ctx.arc(sx(vr), sy(MHz(f)), 5, 0, 2 * Math.PI); ctx.fill();
      const need = ff => { const cc = 1 / (Math.pow(2 * Math.PI * ff, 2) * l), v = vb * (Math.pow(c0 / cc, 2) - 1); return v >= 0 && v <= 30 ? fr(v, 2) + ' V' : 'hors de portée'; };
      out.innerHTML = '';
      out.appendChild(readout([
        ['Capacité C<sub>d</sub>', fr(cap(vr) * 1e12, 2) + ' pF'], ['Fréquence de résonance f', fr(MHz(f), 2) + ' MHz'], ['Pulsation ω = 1/√(LC)', sc(2 * Math.PI * f) + ' rad/s'],
        ['Zone désertée W/W(0)', fr(Math.sqrt(1 + vr / vb), 2)], ['Plage accessible (0 à 30 V)', fr(MHz(fmin), 1) + ' à ' + fr(MHz(fmax), 1) + ' MHz'],
        ['Tension pour 88 MHz', need(88e6)], ['Tension pour 108 MHz', need(108e6)]
      ]));
      out.appendChild(el('p', { class: 'w-note', html: 'Valeurs par défaut : celles de l’exercice D1 (79,6 MHz sans tension ; 0,35 V pour 88 MHz et 1,67 V pour 108 MHz). La fréquence varie comme (1 + V<sub>R</sub>/V<sub>B</sub>)<sup>1/4</sup> : il faut multiplier la barrière par 16 pour doubler la fréquence.' }));
    }
    [L, C0, VB].forEach(f => f.input.addEventListener('input', update)); VR.input.addEventListener('input', update);
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Photon et bande interdite, profondeur d'absorption ===================== */
  const MATS = [['Si', 1.12], ['Ge', 0.67], ['GaAs', 1.42], ['InGaAs', 0.75], ['PbS', 0.37]];
  // coefficient d'absorption du silicium (cm⁻¹), valeurs approximatives à 300 K
  const ALPHA_SI = [[400, 9.52e4], [450, 2.55e4], [500, 1.11e4], [550, 6.99e3], [600, 4.14e3], [650, 2.81e3], [700, 1.90e3], [750, 1.30e3], [800, 8.50e2], [850, 5.35e2], [900, 3.06e2], [950, 1.57e2], [1000, 6.40e1], [1050, 1.63e1], [1100, 3.5]];
  function alphaSi(l) {
    if (l < 400 || l > 1100) return null;
    for (let i = 0; i < ALPHA_SI.length - 1; i++) { const [a, va] = ALPHA_SI[i], [b, vb] = ALPHA_SI[i + 1]; if (l <= b) return Math.exp(Math.log(va) + (Math.log(vb) - Math.log(va)) * (l - a) / (b - a)); }
    return ALPHA_SI[ALPHA_SI.length - 1][1];
  }
  function widgetPhotonGap(c) {
    header(c, 'Photon et bande interdite : absorbé ou transparent ?',
      'Choisissez une longueur d’onde. Le photon est absorbé par un matériau si son énergie hν = 1240/λ (eV, λ en nm) dépasse la bande interdite. En bas : où la lumière est absorbée dans le silicium, I(x) = I<sub>0</sub>e<sup>−αx</sup>, avec une profondeur en échelle logarithmique.');
    const lam = rangeInput('Longueur d’onde λ (nm)', 650, 200, 3600, 10, v => fr(v, 0));
    const canvas = el('canvas', { class: 'plot' });
    const table = el('div'), out = el('div');
    c.append(el('div', { class: 'controls' }, [lam.lab]), table, canvas, out);
    function update() {
      const l = val(lam.input), E = HC / l, C = colors();
      // --- tableau des matériaux
      const rows = MATS.map(([name, gap]) => '<tr><td>' + name + '</td><td class="num">' + fr(gap, 2) + ' eV</td><td class="num">' + fr(HC / gap, 0) + ' nm</td><td><strong>' + (E > gap ? 'absorbé' : 'transparent') + '</strong></td></tr>').join('');
      table.innerHTML = '<table><tr><th>Matériau</th><th>Bande interdite</th><th>λ maximale = 1240/ε<sub>gap</sub></th><th>Photon de ' + fr(l, 0) + ' nm (' + fr(E, 2) + ' eV)</th></tr>' + rows + '</table>';
      // --- absorption dans le silicium
      const { ctx, w, h } = setupCanvas(canvas, 250);
      const box = { x0: 58, y0: 16, x1: w - 14, y1: h - 42 };
      const { sx, sy } = drawAxes(ctx, box, [-2, 3], [0, 1], { nx: 5, ny: 4, xfmt: v => (v < 0 ? fr(Math.pow(10, v), 2) : fr(Math.pow(10, v), 0)), yfmt: v => fr(v, 2), xlabel: 'profondeur x dans le silicium (µm), échelle log', ylabel: 'I(x) / I₀' });
      const marks = [[0.2, 'couche n+ (0,2 µm)'], [1, 'zone désertée (1 µm)'], [20, 'couche i d’une PIN (20 µm)'], [300, 'plaquette (300 µm)']];
      ctx.font = '11px sans-serif'; ctx.textBaseline = 'top';
      marks.forEach(([d, name], i) => { const x = sx(Math.log10(d)); ctx.strokeStyle = C.m; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, box.y0); ctx.lineTo(x, box.y1); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.m; ctx.textAlign = i === 3 ? 'right' : 'left'; ctx.fillText(name, x + (i === 3 ? -4 : 4), box.y0 + 2 + 13 * (i % 2)); });
      const a = alphaSi(l);
      const rd = [['Énergie du photon hν', fr(E, 3) + ' eV'], ['Couleur', colorName(l)]];
      if (a) {
        const pts = []; for (let i = 0; i <= 250; i++) { const lx = -2 + 5 * i / 250, x = Math.pow(10, lx) * 1e-4; pts.push([sx(lx), sy(Math.exp(-a * x))]); }
        polyline(ctx, pts, l >= 380 && l <= 750 ? wlColor(l) : C.t, 3);
        const d = 1e4 / a, lx = Math.log10(d);
        if (lx >= -2 && lx <= 3) { ctx.fillStyle = C.t; ctx.beginPath(); ctx.arc(sx(lx), sy(Math.exp(-1)), 4.5, 0, 2 * Math.PI); ctx.fill(); }
        const frac = um => fr(100 * (1 - Math.exp(-a * um * 1e-4)), 1) + ' %';
        rd.push(['α du silicium', sc(a) + ' cm⁻¹'], ['Profondeur de pénétration 1/α', (d >= 1 ? fr(d, 1) : fr(d, 2)) + ' µm'], ['Absorbé dans 0,2 µm', frac(0.2)], ['Absorbé dans 1 µm', frac(1)], ['Absorbé dans 20 µm', frac(20)], ['Absorbé dans 300 µm', frac(300)]);
      } else {
        ctx.fillStyle = C.m; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(l > 1100 ? 'au-delà de 1107 nm le silicium est transparent : rien n’est absorbé' : 'en dessous de 400 nm tout est absorbé dans les premiers nanomètres', (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2 + 20);
        rd.push(['Silicium', l > 1100 ? 'transparent (hν < 1,12 eV)' : 'absorption en extrême surface']);
      }
      out.innerHTML = ''; out.appendChild(readout(rd));
      out.appendChild(el('p', { class: 'w-note', html: 'Le point noir marque la profondeur 1/α, où il reste 37 % de la lumière. À essayer : 450 nm (bleu, absorbé dans le premier micromètre, donc près de la surface), 850 nm (fibre optique locale : il faut une couche épaisse, d’où la photodiode PIN), 1300 et 1550 nm (fibre longue distance : le silicium est transparent, on prend de l’InGaAs). Coefficients d’absorption du silicium : valeurs approximatives à 300 K.' }));
    }
    lam.input.addEventListener('input', update);
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Cellule solaire : caractéristique, charge et puissance ===================== */
  function widgetSolarCell(c) {
    header(c, 'Cellule solaire : caractéristique, charge et puissance maximale',
      'Cellule au silicium de 15,6 cm de côté (J<sub>sc</sub> = 42 mA/cm² et V<sub>oc</sub> = 0,60 V sous 1000 W/m²). Changez l’éclairement et la résistance de charge : le point de fonctionnement est l’intersection de la courbe de la cellule et de la droite de charge.');
    const AREA = 15.6 * 15.6, VT = KB * 300, J0 = 42e-3 / (Math.exp(0.60 / VT) - 1), I0 = J0 * AREA;
    const G = rangeInput('Éclairement (W/m²)', 1000, 0, 1200, 25, v => fr(v, 0));
    const lR = rangeInput('Résistance de charge', Math.log10(0.05), -3, 1, 0.02, v => sci(Math.pow(10, v), 2) + ' Ω');
    const rs = rangeInput('Résistance série de la cellule (mΩ)', 0, 0, 20, 0.5, v => fr(v, 1));
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [G.lab, lR.lab, rs.lab]), canvas, out);
    function update() {
      const g = val(G.input), R = Math.pow(10, val(lR.input)), r = val(rs.input) * 1e-3, Iph = 42e-3 * AREA * g / 1000, C = colors();
      // courant fourni pour une tension aux bornes v : I = Iph − I0 (exp((v + r I)/VT) − 1), résolu par dichotomie
      const cur = v => { let lo = -5, hi = Iph + 1; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (Iph - I0 * (Math.exp((v + r * m) / VT) - 1) - m > 0) lo = m; else hi = m; } return (lo + hi) / 2; };
      const voc = g > 0 ? VT * Math.log(1 + Iph / I0) : 0, isc = cur(0);
      let vm = 0, pm = 0; for (let i = 0; i <= 600; i++) { const v = voc * i / 600, p = v * cur(v); if (p > pm) { pm = p; vm = v; } }
      const im = vm > 0 ? pm / vm : 0;
      let lo = 0, hi = Math.max(voc, 1e-6); for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (cur(m) - m / R > 0) lo = m; else hi = m; }
      const vop = (lo + hi) / 2, iop = vop / R, pop = vop * iop;
      const { ctx, w, h } = setupCanvas(canvas, 300);
      const box = { x0: 52, y0: 14, x1: w - 14, y1: h - 42 };
      const { sx, sy } = drawAxes(ctx, box, [0, 0.7], [0, 13], { nx: 7, ny: 13, xfmt: v => fr(v, 1), yfmt: v => (Math.abs(v - Math.round(v)) < 1e-6 && Math.round(v) % 2 === 0 ? fr(v, 0) : ''), xlabel: 'tension aux bornes (V)', ylabel: 'courant (A) et puissance (W)' });
      if (g > 0) {
        ctx.globalAlpha = 0.16; ctx.fillStyle = C.d; ctx.fillRect(sx(0), sy(im), sx(vm) - sx(0), sy(0) - sy(im)); ctx.globalAlpha = 1;
        const pi = [], pp = []; for (let i = 0; i <= 300; i++) { const v = voc * i / 300, ii = cur(v); pi.push([sx(v), sy(Math.max(ii, 0))]); pp.push([sx(v), sy(Math.max(v * ii, 0))]); }
        polyline(ctx, pp, C.d, 2, [6, 4]); polyline(ctx, pi, C.e, 2.6);
        ctx.fillStyle = C.d; ctx.beginPath(); ctx.arc(sx(vm), sy(im), 4.5, 0, 2 * Math.PI); ctx.fill();
      }
      const vEnd = Math.min(0.7, 13 * R); polyline(ctx, [[sx(0), sy(0)], [sx(vEnd), sy(vEnd / R)]], C.w, 1.8);
      if (g > 0) { ctx.fillStyle = C.h; ctx.beginPath(); ctx.arc(sx(vop), sy(iop), 5.5, 0, 2 * Math.PI); ctx.fill(); }
      legend(ctx, [['courant de la cellule', C.e], ['puissance V × I', C.d, [6, 4]], ['droite de charge I = V/R', C.w]], sx(0.26), sy(1.9));
      const eta = g > 0 ? 100 * pm / (g * AREA * 1e-4) : 0;
      out.innerHTML = '';
      out.appendChild(readout([
        ['Courant de court-circuit I<sub>sc</sub>', fr(isc, 2) + ' A'], ['Tension en circuit ouvert V<sub>oc</sub>', fr(voc, 3) + ' V'],
        ['Puissance maximale', fr(pm, 2) + ' W à ' + fr(vm, 3) + ' V et ' + fr(im, 2) + ' A'], ['Facteur de forme FF', g > 0 ? fr(pm / (voc * isc), 3) : '-'],
        ['Rendement de conversion', g > 0 ? fr(eta, 1) + ' %' : '-'], ['Point de fonctionnement', fr(vop, 3) + ' V ; ' + fr(iop, 2) + ' A ; ' + fr(pop, 2) + ' W'],
        ['Part de la puissance maximale utilisée', pm > 0 ? fr(100 * pop / pm, 0) + ' %' : '-'], ['Résistance de charge optimale V<sub>m</sub>/I<sub>m</sub>', im > 0 ? sci(vm / im, 2) + ' Ω' : '-']
      ]));
      out.appendChild(el('p', { class: 'w-note', html: 'Diode idéale (n = 1, 300 K) : son facteur de forme est de 0,83 sans résistance série ; les cellules réelles sont entre 0,7 et 0,8 (essayez 5 à 10 mΩ). À observer : diviser l’éclairement par deux divise I<sub>sc</sub> par deux mais ne retire que 18 mV à V<sub>oc</sub> ; une charge trop faible ou trop forte gaspille la puissance disponible (point rouge loin du coude).' }));
    }
    [G.input, lR.input, rs.input].forEach(i => i.addEventListener('input', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Spectre d'une LED ===================== */
  function widgetLedSpectrum(c) {
    header(c, 'LED : la bande interdite fixe la couleur, kT fixe la largeur de la raie',
      'Choisissez un matériau ou réglez la bande interdite. Le spectre émis est tracé avec le modèle simple de la diapo 23 : seuil à ε<sub>gap</sub>, maximum à ε<sub>gap</sub> + kT, largeur à mi-hauteur d’environ 2,5 kT.');
    const PRESET = [['1.42', 'GaAs : 1,42 eV (infrarouge)'], ['1.89', 'AlGaAs rouge : 1,89 eV'], ['2.07', 'InAlGaP ambre : 2,07 eV'], ['2.19', 'GaP dopé N, vert : 2,19 eV'], ['2.38', 'InGaN vert : 2,38 eV'], ['2.70', 'InGaN bleu : 2,70 eV'], ['1.12', 'Si : 1,12 eV (gap indirect)']];
    const mat = selIn('Matériau', PRESET, '1.89');
    const gap = rangeInput('Bande interdite ε<sub>gap</sub> (eV)', 1.89, 0.8, 3.5, 0.01, v => fr(v, 2));
    const T = rangeInput('Température T (K)', 300, 250, 400, 5, v => fr(v, 0));
    const V = numIn('Tension (V)', 2.0, { step: 'any', min: 0 }), I = numIn('Courant (mA)', 20, { step: 'any', min: 0 }), P = numIn('Puissance optique (mW)', 4, { step: 'any', min: 0 });
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [mat.lab, gap.lab, T.lab, V.lab, I.lab, P.lab]), canvas, out);
    function update() {
      const eg = val(gap.input), t = val(T.input), kT = KB * t, C = colors();
      const ep = eg + kT, lp = HC / ep, dE = 2.4464 * kT, dl = lp * lp * dE / HC;
      const { ctx, w, h } = setupCanvas(canvas, 250);
      const x0 = 40, x1 = w - 16, y0 = 16, y1 = h - 58, sx = l => x0 + (l - 350) / 800 * (x1 - x0), sy = v => y1 - v * (y1 - y0);
      spectrumBar(ctx, sx, 380, 780, y1 + 6, 12);
      ctx.fillStyle = C.s2; ctx.strokeStyle = C.m; ctx.lineWidth = 1; ctx.fillRect(sx(780), y1 + 6, sx(1150) - sx(780), 12); ctx.strokeRect(sx(780), y1 + 6, sx(1150) - sx(780), 12);
      ctx.fillRect(sx(350), y1 + 6, sx(380) - sx(350), 12); ctx.strokeRect(sx(350), y1 + 6, sx(380) - sx(350), 12);
      ctx.strokeStyle = C.m; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.fillStyle = C.m; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let l = 400; l <= 1100; l += 100) { ctx.fillText(String(l), sx(l), y1 + 22); }
      ctx.fillText('longueur d’onde (nm) ; infrarouge à droite du rouge', (x0 + x1) / 2, y1 + 38);
      // raie : I(E) ∝ (E − Eg) exp(−(E − Eg)/kT)
      const col = lp >= 380 && lp <= 750 ? wlColor(lp) : C.m, pts = [];
      for (let i = 0; i <= 400; i++) { const u = 9 * i / 400, e = eg + u * kT, l = HC / e; if (l < 350 || l > 1150) continue; pts.push([sx(l), sy(u * Math.exp(1 - u))]); }
      if (pts.length > 1) {
        ctx.globalAlpha = 0.35; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0][0], y1); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(pts[pts.length - 1][0], y1); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        polyline(ctx, pts, lp >= 380 && lp <= 750 ? col : C.t, 2.4);
      } else { ctx.fillStyle = C.m; ctx.textBaseline = 'middle'; ctx.fillText('émission hors du graphique (' + fr(lp, 0) + ' nm)', (x0 + x1) / 2, (y0 + y1) / 2); }
      const pin = (val(V.input) || 0) * (val(I.input) || 0), eta = pin > 0 ? 100 * (val(P.input) || 0) / pin : 0;
      out.innerHTML = '';
      out.appendChild(readout([
        ['Longueur d’onde du maximum', fr(lp, 0) + ' nm'], ['Couleur', colorName(lp)], ['Énergie du maximum : ε<sub>gap</sub> + kT', fr(ep, 3) + ' eV'],
        ['Largeur de raie Δ(hν) ≈ 2,5 kT', fr(dE * 1000, 0) + ' meV'], ['Largeur en longueur d’onde Δλ', fr(dl, 1) + ' nm'], ['kT', fr(kT * 1000, 1) + ' meV'],
        ['Puissance électrique V × I', fr(pin, 1) + ' mW'], ['Rendement externe', pin > 0 ? fr(eta, 1) + ' %' : '-']
      ]));
      out.appendChild(el('p', { class: 'w-note', html: (Math.abs(eg - 1.12) < 0.006 ? '<strong>Silicium :</strong> il émettrait dans l’infrarouge, mais son gap est indirect : la recombinaison passe par des phonons et ne donne presque pas de lumière. ' : '')
        + 'Rendement externe = puissance optique sortie / (V × I). La raie s’élargit quand la température monte (kT) ; en longueur d’onde, Δλ = λ² Δ(hν)/hc. Les diapos donnent une largeur de 2,5 à 3 kT : pour la LED rouge à 655 nm, 24 nm à 300 K.' }));
    }
    mat.input.addEventListener('change', () => { gap.input.value = mat.input.value; gap.val.textContent = fr(parseFloat(mat.input.value), 2); update(); });
    [gap.input, T.input].forEach(i => i.addEventListener('input', update)); [V, I, P].forEach(f => f.input.addEventListener('input', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Enregistrement ===================== */
  Object.assign(window.ELE.widgets, {
    'varicap-tuner': widgetVaricap, 'photon-gap': widgetPhotonGap, 'solar-cell': widgetSolarCell, 'led-spectrum': widgetLedSpectrum
  });
  if (window.ELE.initWidgets) window.ELE.initWidgets();
})();
