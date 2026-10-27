/* ELE2307 - démonstrations interactives (canvas + formulaires), sans dépendance externe */
(function () {
  'use strict';

  /* ===================== Outils mathématiques ===================== */
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  const logFact = n => (n < 2 ? 0 : lgamma(n + 1));
  const logBinom = (N, n) => logFact(N) - logFact(n) - logFact(N - n);
  function binomPMF(N, n, p) {
    if (n < 0 || n > N) return 0;
    if (p <= 0) return n === 0 ? 1 : 0;
    if (p >= 1) return n === N ? 1 : 0;
    return Math.exp(logBinom(N, n) + n * Math.log(p) + (N - n) * Math.log(1 - p));
  }
  const gauss = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s)) / (Math.sqrt(2 * Math.PI) * s);

  /* ===================== Mise en forme (style français) ===================== */
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const sup = s => String(s).split('').map(c => SUP[c] || c).join('');
  function fr(x, digits) {
    if (!isFinite(x)) return String(x);
    return x.toLocaleString('fr-CA', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).replace(/ /g, ' ');
  }
  // notation scientifique : 3,3 × 10²⁷
  function sci(x, sig = 3) {
    if (x === 0) return '0';
    if (!isFinite(x)) return String(x);
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e < 5) return fr(x, Math.max(0, sig - 1 - e));
    const m = x / Math.pow(10, e);
    return `${fr(m, sig - 1)} × 10${sup(e)}`;
  }
  // 10^(grand nombre) : 10^(3,7 × 10²⁵)
  function pow10str(log10) {
    if (!isFinite(log10)) return String(log10);
    if (Math.abs(log10) < 6) return sci(Math.pow(10, log10));
    return `10^(${sci(log10, 3)})`;
  }
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ===================== Canvas ===================== */
  function setupCanvas(canvas, h = 300) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }
  function drawAxes(ctx, box, xr, yr, opts = {}) {
    const { x0, y0, x1, y1 } = box;
    ctx.strokeStyle = cssVar('--muted'); ctx.fillStyle = cssVar('--muted'); ctx.lineWidth = 1;
    ctx.font = '12px sans-serif';
    ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.stroke();
    const nx = opts.nx || 8, ny = opts.ny || 5;
    const sx = v => x0 + (v - xr[0]) / (xr[1] - xr[0]) * (x1 - x0);
    const sy = v => y1 - (v - yr[0]) / (yr[1] - yr[0]) * (y1 - y0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 0; i <= nx; i++) {
      const v = xr[0] + (xr[1] - xr[0]) * i / nx;
      ctx.fillText(opts.xfmt ? opts.xfmt(v) : fr(v, 2), sx(v), y1 + 4);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= ny; i++) {
      const v = yr[0] + (yr[1] - yr[0]) * i / ny;
      ctx.fillText(opts.yfmt ? opts.yfmt(v) : fr(v, 3), x0 - 4, sy(v));
      ctx.globalAlpha = .25; ctx.beginPath(); ctx.moveTo(x0, sy(v)); ctx.lineTo(x1, sy(v)); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (opts.xlabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(opts.xlabel, (x0 + x1) / 2, y1 + 34); }
    if (opts.ylabel) { ctx.save(); ctx.translate(12, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(opts.ylabel, 0, 0); ctx.restore(); }
    return { sx, sy };
  }

  /* ===================== Petits utilitaires DOM ===================== */
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => { if (c == null) return; e.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); });
    return e;
  }
  function numInput(label, value, attrs = {}) {
    const input = el('input', Object.assign({ type: 'number', value }, attrs));
    const lab = el('label', {}, [label, input]);
    return { lab, input };
  }
  function rangeInput(label, value, min, max, step, fmt = v => v) {
    const input = el('input', { type: 'range', min, max, step, value });   // min/max/step avant value, sinon le navigateur arrondit la valeur initiale
    const val = el('span', { class: 'val' }, fmt(value));
    const lab = el('label', {}, [el('span', { html: label + ' : ' }, [val]), input]);
    input.addEventListener('input', () => { val.textContent = fmt(parseFloat(input.value)); });
    return { lab, input, val };
  }
  function selectInput(label, options, value) {
    const sel = el('select');
    options.forEach(([v, t]) => sel.appendChild(el('option', { value: v }, t)));
    if (value !== undefined) sel.value = value;
    return { lab: el('label', {}, [label, sel]), input: sel };
  }
  function readout(pairs) {
    const r = el('div', { class: 'readout' });
    pairs.forEach(([k, v]) => r.appendChild(el('div', { class: 'stat' }, [el('div', { class: 'k', html: k }), el('div', { class: 'v', html: v })])));
    return r;
  }
  function header(container, title, desc) {
    container.appendChild(el('p', { class: 'w-title' }, title));
    if (desc) container.appendChild(el('p', { class: 'w-desc', html: desc }));
  }

  /* ===================== W1 : moyenne d'un dé pipé ===================== */
  function widgetMeanDie(c) {
    header(c, 'Moyenne et écart type d’un dé (éventuellement pipé)',
      'Entrez des poids relatifs pour chaque face (ils sont normalisés automatiquement) et choisissez la fonction f(n). Utile pour les exercices 3, 4 et 5 du chapitre 2.');
    const weights = [1, 1, 1, 1, 1, 1];
    const table = el('table', { class: 'prob-table' });
    const trFace = el('tr', {}, [el('th', {}, 'Face n')]);
    const trW = el('tr', {}, [el('th', {}, 'Poids')]);
    const trP = el('tr', {}, [el('th', {}, 'p(n)')]);
    const pCells = [];
    weights.forEach((w, i) => {
      trFace.appendChild(el('td', { class: 'num' }, String(i + 1)));
      const inp = el('input', { type: 'number', min: 0, step: 'any', value: w });
      inp.addEventListener('input', () => { weights[i] = Math.max(0, parseFloat(inp.value) || 0); update(); });
      trW.appendChild(el('td', {}, inp));
      const td = el('td', { class: 'num' }); pCells.push(td); trP.appendChild(td);
    });
    table.append(trFace, trW, trP);
    const fn = selectInput('Fonction f(n)', [['n', 'f(n) = n'], ['n2', 'f(n) = n²'], ['nm2', 'f(n) = (n − 2)²'], ['np2', 'f(n) = (n + 2)²'], ['poly', 'f(n) = n² − 5n + 1'], ['cube', 'f(n) = n³ − 10']], 'n');
    const presets = selectInput('Préréglages', [['fair', 'Dé parfait'], ['ex4', 'Ex. 4 chap. 2 : p(6) = 1/2, autres 1/10'], ['ex5', 'Ex. 5 chap. 2 : p(6) = 3/8, autres 1/8']], 'fair');
    presets.input.addEventListener('change', () => {
      const v = presets.input.value;
      const w = v === 'fair' ? [1, 1, 1, 1, 1, 1] : v === 'ex4' ? [1, 1, 1, 1, 1, 5] : [1, 1, 1, 1, 1, 3];
      w.forEach((x, i) => { weights[i] = x; trW.querySelectorAll('input')[i].value = x; });
      update();
    });
    fn.input.addEventListener('change', update);
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [presets.lab, fn.lab]), table, out);
    function f(n) {
      switch (fn.input.value) {
        case 'n2': return n * n; case 'nm2': return (n - 2) ** 2; case 'np2': return (n + 2) ** 2;
        case 'poly': return n * n - 5 * n + 1; case 'cube': return n ** 3 - 10; default: return n;
      }
    }
    function update() {
      const S = weights.reduce((a, b) => a + b, 0) || 1;
      const p = weights.map(w => w / S);
      p.forEach((pi, i) => pCells[i].textContent = fr(pi, 3));
      let m = 0, m2 = 0;
      for (let n = 1; n <= 6; n++) { m += p[n - 1] * f(n); m2 += p[n - 1] * f(n) ** 2; }
      const terms = p.map((pi, i) => `${fr(pi, 3)} × ${fr(f(i + 1), 2)}`).join(' + ');
      out.innerHTML = '';
      out.appendChild(readout([['Moyenne f̄ = Σ pᵢ fᵢ', fr(m, 4)], ['f²‾', fr(m2, 4)], ['Variance = f²‾ − f̄²', fr(m2 - m * m, 4)], ['Écart type σ', fr(Math.sqrt(Math.max(0, m2 - m * m)), 4)]]));
      out.appendChild(el('p', { class: 'w-note' }, 'f̄ = ' + terms + ' = ' + fr(m, 4)));
    }
    update();
  }

  /* ===================== W2 : binomiale ↔ gaussienne ===================== */
  function widgetBinomial(c) {
    header(c, 'Loi binomiale et approximation gaussienne',
      'Faites varier N et p : la distribution binomiale P<sub>N</sub>(n) (barres) et la gaussienne de même moyenne n̄ = pN et de même écart type σ = √(Npq) (courbe). Entrez un n pour comparer les deux valeurs.');
    const N = rangeInput('Nombre d’éléments N', 60, 1, 1000, 1);
    const p = rangeInput('Probabilité p', 1 / 6, 0.01, 0.99, 0.01, v => fr(v, 2));
    const nq = numInput('Calculer P<sub>N</sub>(n) pour n =', 10, { min: 0, step: 1 });
    nq.lab.firstChild.remove(); nq.lab.prepend(el('span', { html: 'Calculer P<sub>N</sub>(n) pour n =' }));
    const presets = selectInput('Préréglages', [['', '-'], ['coins100', '100 pièces, p = 1/2'], ['dice60', '60 dés, p = 1/6'], ['dice600', '600 dés, p = 1/6'], ['mol5', '5 molécules, p = 1/3'], ['dice6', '6 dés, p = 1/6']], '');
    presets.input.addEventListener('change', () => {
      const v = presets.input.value;
      const map = { coins100: [100, 0.5, 42], dice60: [60, 1 / 6, 10], dice600: [600, 1 / 6, 100], mol5: [5, 1 / 3, 2], dice6: [6, 1 / 6, 1] };
      if (map[v]) { N.input.value = map[v][0]; p.input.value = map[v][1]; nq.input.value = map[v][2]; N.input.dispatchEvent(new Event('input')); p.input.dispatchEvent(new Event('input')); update(); }
    });
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [presets.lab, N.lab, p.lab, nq.lab]), canvas, out);
    [N.input, p.input, nq.input].forEach(i => i.addEventListener('input', update));
    function update() {
      const Nv = parseInt(N.input.value, 10), pv = parseFloat(p.input.value), qv = 1 - pv;
      const mean = Nv * pv, sigma = Math.sqrt(Nv * pv * qv);
      const { ctx, w, h } = setupCanvas(canvas, 300);
      const lo = Math.max(0, Math.floor(mean - 4.5 * sigma - 1)), hi = Math.min(Nv, Math.ceil(mean + 4.5 * sigma + 1));
      const pm = []; let ymax = 0;
      for (let n = lo; n <= hi; n++) { const v = binomPMF(Nv, n, pv); pm.push([n, v]); if (v > ymax) ymax = v; }
      ymax = Math.max(ymax, gauss(mean, mean, sigma || 1)) * 1.15;
      const box = { x0: 52, y0: 12, x1: w - 12, y1: h - 42 };
      const { sx, sy } = drawAxes(ctx, box, [lo - 0.5, hi + 0.5], [0, ymax], { nx: Math.min(10, hi - lo + 1), xfmt: v => fr(Math.round(v), 0), yfmt: v => fr(v, 3), xlabel: 'n (nombre d’éléments satisfaisant le critère)', ylabel: 'P_N(n)' });
      const bw = Math.max(1, (sx(1) - sx(0)) * 0.8);
      ctx.fillStyle = cssVar('--accent');
      pm.forEach(([n, v]) => ctx.fillRect(sx(n) - bw / 2, sy(v), bw, sy(0) - sy(v)));
      if (sigma > 0) {
        ctx.strokeStyle = cssVar('--warn'); ctx.lineWidth = 2.2; ctx.beginPath();
        for (let i = 0; i <= 300; i++) { const x = (lo - 0.5) + (hi - lo + 1) * i / 300; const y = gauss(x, mean, sigma); if (i === 0) ctx.moveTo(sx(x), sy(y)); else ctx.lineTo(sx(x), sy(y)); }
        ctx.stroke();
      }
      const nv = Math.round(parseFloat(nq.input.value));
      const exact = binomPMF(Nv, nv, pv), approx = sigma > 0 ? gauss(nv, mean, sigma) : NaN;
      out.innerHTML = '';
      out.appendChild(readout([
        ['n̄ = pN', fr(mean, 3)], ['σ = √(Npq)', fr(sigma, 3)], ['σ / n̄ (fluctuation relative)', mean > 0 ? sci(sigma / mean, 3) : '-'],
        [`P<sub>N</sub>(${nv}) binomiale`, sci(exact, 3)], [`P<sub>N</sub>(${nv}) gaussienne`, sci(approx, 3)],
        ['A = 1/(√(2π) σ)', sigma > 0 ? sci(1 / (Math.sqrt(2 * Math.PI) * sigma), 3) : '-'], ['B = 1/(2σ²)', sigma > 0 ? sci(1 / (2 * sigma * sigma), 3) : '-']
      ]));
      out.appendChild(el('p', { class: 'w-note' }, 'Barres : loi binomiale exacte (calculée avec les logarithmes des factorielles). Courbe orange : gaussienne. Plus N est grand, plus les deux coïncident ; l’écart est visible pour N petit ou p proche de 0 ou 1.'));
    }
    update();
    window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== W3 : marche aléatoire ===================== */
  function widgetRandomWalk(c) {
    header(c, 'Simulateur de marche aléatoire',
      'Chaque marcheur fait n pas tirés au hasard selon la distribution d’un pas. L’histogramme des positions finales est comparé à la prédiction théorique : moyenne n s̄ et écart type σ√n.');
    const model = selectInput('Distribution d’un pas', [['sym', '±1 m (p droite = p gauche = 1/2)'], ['biased', '±1 m avec biais (p droite réglable)'], ['ex28', 'Ex. 28 chap. 3 : pas de 0, ±1, ±2 m'], ['ex27', 'Ex. 27 chap. 3 : −1, 0, +1 m (0,3 / 0,2 / 0,5)']], 'sym');
    const pr = rangeInput('p (aller à droite)', 0.5, 0, 1, 0.01, v => fr(v, 2));
    const n = rangeInput('Nombre de pas n', 100, 1, 2000, 1);
    const walkers = rangeInput('Nombre de marcheurs', 5000, 100, 50000, 100);
    const btn = el('button', { class: 'btn' }, 'Simuler');
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [model.lab, pr.lab, n.lab, walkers.lab, el('label', {}, [' ', btn])]), canvas, out);
    function stepDist() {
      switch (model.input.value) {
        case 'biased': { const p = parseFloat(pr.input.value); return [[1, p], [-1, 1 - p]]; }
        case 'ex28': return [[-2, .1], [-1, .1], [0, .3], [1, .3], [2, .2]];
        case 'ex27': return [[-1, .3], [0, .2], [1, .5]];
        default: return [[1, .5], [-1, .5]];
      }
    }
    model.input.addEventListener('change', () => { pr.lab.style.display = model.input.value === 'biased' ? '' : 'none'; });
    pr.lab.style.display = 'none';
    function simulate() {
      const dist = stepDist(), nv = parseInt(n.input.value, 10), W = parseInt(walkers.input.value, 10);
      const s1 = dist.reduce((a, [s, p]) => a + s * p, 0), s2 = dist.reduce((a, [s, p]) => a + s * s * p, 0);
      const sig1 = Math.sqrt(s2 - s1 * s1), meanN = nv * s1, sigN = sig1 * Math.sqrt(nv);
      const cum = []; let acc = 0; dist.forEach(([s, p]) => { acc += p; cum.push([s, acc]); });
      const finals = new Float64Array(W);
      for (let k = 0; k < W; k++) {
        let x = 0;
        for (let i = 0; i < nv; i++) { const r = Math.random(); for (let j = 0; j < cum.length; j++) { if (r < cum[j][1]) { x += cum[j][0]; break; } } }
        finals[k] = x;
      }
      let m = 0; for (let k = 0; k < W; k++) m += finals[k]; m /= W;
      let v = 0; for (let k = 0; k < W; k++) v += (finals[k] - m) ** 2; v /= W;
      const sdSim = Math.sqrt(v);
      // histogramme
      const lo = Math.floor(Math.min(meanN - 4.5 * sigN, m - 4 * sdSim) - 1), hi = Math.ceil(Math.max(meanN + 4.5 * sigN, m + 4 * sdSim) + 1);
      const span = hi - lo; const bins = Math.min(80, span || 1); const bwv = span / bins;
      const counts = new Float64Array(bins);
      for (let k = 0; k < W; k++) { let b = Math.floor((finals[k] - lo) / bwv); if (b >= bins) b = bins - 1; if (b < 0) b = 0; counts[b]++; }
      const dens = Array.from(counts, cnt => cnt / (W * bwv));
      const { ctx, w, h } = setupCanvas(canvas, 300);
      const ymax = Math.max(...dens, sigN > 0 ? gauss(meanN, meanN, sigN) : 0) * 1.15 || 1;
      const box = { x0: 52, y0: 12, x1: w - 12, y1: h - 42 };
      const { sx, sy } = drawAxes(ctx, box, [lo, hi], [0, ymax], { nx: 8, xfmt: x => fr(Math.round(x), 0), yfmt: y => fr(y, 3), xlabel: 'Position finale (m)', ylabel: 'densité de probabilité' });
      ctx.fillStyle = cssVar('--accent');
      dens.forEach((d, i) => { const x = lo + i * bwv; ctx.fillRect(sx(x), sy(d), Math.max(1, sx(x + bwv) - sx(x) - 1), sy(0) - sy(d)); });
      if (sigN > 0) {
        ctx.strokeStyle = cssVar('--warn'); ctx.lineWidth = 2.2; ctx.beginPath();
        for (let i = 0; i <= 300; i++) { const x = lo + span * i / 300; const y = gauss(x, meanN, sigN); if (i === 0) ctx.moveTo(sx(x), sy(y)); else ctx.lineTo(sx(x), sy(y)); }
        ctx.stroke();
      }
      ctx.strokeStyle = cssVar('--ok'); ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(sx(meanN), box.y0); ctx.lineTo(sx(meanN), box.y1); ctx.stroke(); ctx.setLineDash([]);
      out.innerHTML = '';
      out.appendChild(readout([
        ['Un pas : s̄', fr(s1, 3) + ' m'], ['Un pas : σ', fr(sig1, 3) + ' m'],
        ['Théorie : S̄ₙ = n s̄', fr(meanN, 2) + ' m'], ['Théorie : σₙ = σ√n', fr(sigN, 2) + ' m'],
        ['Simulation : moyenne', fr(m, 2) + ' m'], ['Simulation : écart type', fr(sdSim, 2) + ' m'],
        ['Rapport σₙ / |S̄ₙ|', meanN !== 0 ? fr(Math.abs(sigN / meanN), 3) : '∞ (moyenne nulle)']
      ]));
      out.appendChild(el('p', { class: 'w-note' }, 'La courbe orange est la gaussienne de moyenne n s̄ et d’écart type σ√n (ligne verte pointillée : la moyenne théorique). Remarquez que la dispersion croît comme √n alors que la dérive croît comme n : pour un pas biaisé, le rapport σₙ/S̄ₙ diminue en 1/√n.'));
    }
    btn.addEventListener('click', simulate);
    simulate();
  }

  /* ===================== W4 : formule de Stirling ===================== */
  function widgetStirling(c) {
    header(c, 'Calculatrice de factorielles (formule de Stirling)',
      'Les calculatrices débordent vers 70!. La formule de Stirling donne ln(m!) ; on convertit ensuite en puissance de 10 avec e<sup>x</sup> = 10<sup>0,4343 x</sup>.');
    const m = numInput('m', 100, { min: 1, max: 1e9, step: 1 });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [m.lab]), out);
    function update() {
      const mv = Math.max(1, Math.floor(parseFloat(m.input.value) || 1));
      let exact = 0;
      if (mv <= 200000) { for (let i = 2; i <= mv; i++) exact += Math.log(i); } else exact = lgamma(mv + 1);
      const full = mv * Math.log(mv) - mv + 0.5 * Math.log(2 * Math.PI * mv);
      const simple = mv * Math.log(mv) - mv;
      const log10 = exact / Math.LN10;
      const expo = Math.floor(log10), mant = Math.pow(10, log10 - expo);
      out.innerHTML = '';
      out.appendChild(readout([
        ['ln(m!) exact', fr(exact, 4)], ['Stirling : m ln m − m + ½ ln(2πm)', fr(full, 4)], ['Simplifiée : m ln m − m', fr(simple, 4)],
        ['Erreur relative (complète)', sci(Math.abs(full - exact) / Math.abs(exact || 1), 2)], ['log₁₀(m!) = 0,4343 ln(m!)', fr(log10, 3)], ['m!', `${fr(mant, 3)} × 10${sup(expo)}`]
      ]));
      out.appendChild(el('p', { class: 'w-note', html: `Sur une feuille d’examen : ln(${mv}!) ≈ ${mv} ln(${mv}) − ${mv} + ½ ln(2π ${mv}) = ${fr(full, 2)}, puis ${mv}! ≈ 10<sup>0,4343 × ${fr(full, 2)}</sup> = 10<sup>${fr(full / Math.LN10, 2)}</sup>.` }));
    }
    m.input.addEventListener('input', update); update();
  }

  /* ===================== W5 : degrés de liberté et énergie thermique ===================== */
  function widgetDof(c) {
    header(c, 'Degrés de liberté, équipartition et énergie thermique',
      'Chaque degré de liberté stocke en moyenne kT/2. Choisissez le type de particule, N et T : le calculateur donne E<sub>therm</sub> = Nν kT/2 et, pour un gaz, les vitesses et quantités de mouvement quadratiques moyennes.');
    const k = 1.381e-23, NA = 6.022e23, eV = 1.602e-19;
    const type = selectInput('Type de particule', [['mono', 'Gaz monoatomique (ν = 3 : 3 translations)'], ['di', 'Gaz diatomique (ν = 5 : 3 translations + 2 rotations)'], ['dihot', 'Gaz diatomique à haute T (ν = 7 : + vibration)'], ['solid', 'Solide (ν = 6 : 3 cinétiques + 3 potentiels)'], ['custom', 'ν personnalisé']], 'di');
    const nu = numInput('ν (si personnalisé)', 5, { min: 1, max: 20, step: 1 });
    const Nmode = selectInput('N donné en', [['count', 'nombre de particules'], ['mol', 'moles']], 'count');
    const N = numInput('N', 2.2e24, { step: 'any' });
    const T = numInput('T (K)', 500, { min: 0.1, step: 'any' });
    const mass = numInput('masse d’une particule (kg)', 4.8e-26, { step: 'any' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [type.lab, nu.lab, Nmode.lab, N.lab, T.lab, mass.lab]), out);
    function update() {
      const map = { mono: 3, di: 5, dihot: 7, solid: 6 };
      const nuv = type.input.value === 'custom' ? parseFloat(nu.input.value) || 1 : map[type.input.value];
      nu.lab.style.display = type.input.value === 'custom' ? '' : 'none';
      const Nv = (parseFloat(N.input.value) || 0) * (Nmode.input.value === 'mol' ? NA : 1);
      const Tv = parseFloat(T.input.value) || 0, mv = parseFloat(mass.input.value) || 0;
      const perDof = k * Tv / 2, eps = nuv * perDof, E = Nv * eps;
      const gas = type.input.value !== 'solid';
      const items = [
        ['ν (ddl par particule)', fr(nuv, 0)], ['Nν (ddl du système)', sci(Nv * nuv)], ['kT/2 par ddl', `${sci(perDof)} J = ${sci(perDof / eV)} eV`],
        ['ε_therm = ν kT/2 par particule', `${sci(eps)} J = ${sci(eps / eV)} eV`], ['E_therm = Nν kT/2', `${sci(E)} J`], ['Capacité à volume constant Nνk/2', `${sci(Nv * nuv * k / 2)} J/K`]
      ];
      if (gas && mv > 0) {
        const prms = Math.sqrt(3 * mv * k * Tv), vrms = Math.sqrt(3 * k * Tv / mv);
        items.push(['p_rms = √(3mkT) (3 ddl de translation)', `${sci(prms)} kg m/s`], ['v_rms = √(3kT/m)', `${sci(vrms)} m/s`], ['p₀ ≈ 2 p_rms (estimation du manuel)', `${sci(2 * prms)} kg m/s`]);
      }
      out.innerHTML = ''; out.appendChild(readout(items));
      out.appendChild(el('p', { class: 'w-note' }, gas ? 'Pour un gaz, l’énergie potentielle est nulle (u₀ ≈ 0) : l’énergie interne est purement thermique. Les 3 ddl de translation portent p²/2m = 3kT/2 en moyenne, d’où p_rms.' : 'Pour un solide, E = N u₀ + Nν kT/2 avec u₀ < 0 (les atomes sont liés). Les 3 ddl de position (½κx², ...) et les 3 ddl de quantité de mouvement portent chacun kT/2.'));
    }
    [type.input, nu.input, Nmode.input, N.input, T.input, mass.input].forEach(i => i.addEventListener('input', update));
    type.input.addEventListener('change', update); Nmode.input.addEventListener('change', update);
    update();
  }

  /* ===================== W6 : discrétisation de l'espace des phases ===================== */
  function widgetPhaseSpace(c) {
    header(c, 'Discrétisation de l’espace des phases (principe d’incertitude)',
      'À une dimension, un état occupe une aire minimale Δx Δp<sub>x</sub> = h. Le nombre d’états est l’aire accessible [x][p<sub>x</sub>] divisée par h, <em>quelle que soit</em> la façon de découper. En 3D, on divise le volume V<sub>r</sub>V<sub>p</sub> par h³.');
    // Partie 1 : grille 1D (unités arbitraires où h = 1)
    const X = rangeInput('Étendue en position [x] (unités)', 8, 1, 16, 1);
    const P = rangeInput('Étendue en quantité de mouvement [p] (unités)', 6, 1, 12, 1);
    const dx = rangeInput('Découpage Δx choisi (unités)', 1, 0.25, 4, 0.25, v => fr(v, 2));
    const canvas = el('canvas', { class: 'plot' });
    const out1 = el('div');
    c.append(el('h4', {}, '1D : aire accessible / h'), el('div', { class: 'controls' }, [X.lab, P.lab, dx.lab]), canvas, out1);
    function draw() {
      const Xv = parseFloat(X.input.value), Pv = parseFloat(P.input.value), dxv = parseFloat(dx.input.value), dpv = 1 / dxv; // h = 1
      const { ctx, w, h } = setupCanvas(canvas, 260);
      const box = { x0: 52, y0: 12, x1: w - 12, y1: h - 42 };
      const { sx, sy } = drawAxes(ctx, box, [0, Xv], [0, Pv], { nx: Math.min(8, Xv), ny: Math.min(6, Pv), xfmt: v => fr(v, 1), yfmt: v => fr(v, 1), xlabel: 'position x', ylabel: 'p_x' });
      ctx.fillStyle = cssVar('--ok-soft'); ctx.fillRect(sx(0), sy(Pv), sx(Xv) - sx(0), sy(0) - sy(Pv));
      ctx.strokeStyle = cssVar('--ok'); ctx.lineWidth = 1;
      for (let x = 0; x <= Xv + 1e-9; x += dxv) { ctx.beginPath(); ctx.moveTo(sx(x), sy(0)); ctx.lineTo(sx(x), sy(Pv)); ctx.stroke(); }
      for (let p = 0; p <= Pv + 1e-9; p += dpv) { ctx.beginPath(); ctx.moveTo(sx(0), sy(p)); ctx.lineTo(sx(Xv), sy(p)); ctx.stroke(); }
      const nStates = Xv * Pv;
      out1.innerHTML = '';
      out1.appendChild(readout([['Δx choisi', fr(dxv, 2)], ['Δp = h/Δx', fr(dpv, 2)], ['Cellules selon x', fr(Xv / dxv, 1)], ['Cellules selon p', fr(Pv / dpv, 1)], ['Nombre d’états = [x][p]/h', fr(nStates, 0)]]));
      out1.appendChild(el('p', { class: 'w-note' }, 'Changer Δx change la forme des cellules mais pas leur nombre : seul le produit [x][p]/h compte. C’est pourquoi on peut compter les états sans connaître la « vraie » précision de mesure.'));
    }
    [X.input, P.input, dx.input].forEach(i => i.addEventListener('input', draw));
    draw(); window.addEventListener('resize', draw); document.addEventListener('themechange', draw);

    // Partie 2 : calculateur 3D
    const h = 6.626e-34;
    const V = numInput('Volume accessible V_r (m³)', 2e-6, { step: 'any' });
    const pmax = numInput('p maximal (kg m/s)', 3e-24, { step: 'any' });
    const pmin = numInput('p minimal (kg m/s)', 0, { step: 'any' });
    const Np = numInput('N particules identiques (pour ω_c et Ω)', 1, { step: 'any' });
    const out2 = el('div');
    c.append(el('h4', {}, '3D : ω = V_r V_p / h³ pour une particule, puis ω_c et Ω'), el('div', { class: 'controls' }, [V.lab, pmax.lab, pmin.lab, Np.lab]), out2);
    function calc() {
      const Vv = parseFloat(V.input.value) || 0, p2 = parseFloat(pmax.input.value) || 0, p1 = parseFloat(pmin.input.value) || 0, Nv = parseFloat(Np.input.value) || 1;
      const Vp = 4 / 3 * Math.PI * (p2 ** 3 - p1 ** 3);
      const omega = Vv * Vp / h ** 3;
      const omegac = Math.E * omega / Nv;
      const log10Omega = Nv * Math.log10(omegac);
      out2.innerHTML = '';
      out2.appendChild(readout([
        ['V_p = (4/3)π(p₂³ − p₁³)', `${sci(Vp)} (kg m/s)³`], ['ω = V_r V_p / h³', sci(omega)], ['1/ω (probabilité d’un état)', sci(1 / omega)],
        ['ω_c = eω/N', sci(omegac)], ['Ω = ω_cᴺ', pow10str(log10Omega)], ['ln Ω = N ln ω_c', sci(log10Omega * Math.LN10)]
      ]));
      out2.appendChild(el('p', { class: 'w-note' }, 'Exemple par défaut : exercice 7 du chapitre 6 (boîte de 1 cm × 1 cm × 2 cm, p ≤ 3 × 10⁻²⁴ kg m/s). Pour un gaz réel, prenez p_max ≈ 2 p_rms = 2√(3mkT) (voir le calculateur des degrés de liberté).'));
    }
    [V.input, pmax.input, pmin.input, Np.input].forEach(i => i.addEventListener('input', calc)); calc();
  }

  /* ===================== W7 : croissance du nombre d'états ===================== */
  function widgetOmegaGrowth(c) {
    header(c, 'Sensibilité du nombre d’états : Ω ∝ (E_therm)^{Nν/2} - V^N',
      'Pour un système macroscopique, une variation minuscule de température ou de volume multiplie Ω par un facteur 10^(nombre astronomique). Le calcul se fait toujours avec les logarithmes.');
    const N = numInput('N particules', 1e28, { step: 'any' });
    const nu = numInput('ν (ddl par particule)', 5, { min: 1, step: 1 });
    const Ti = numInput('T initiale (K) ou E initiale', 295, { step: 'any' });
    const Tf = numInput('T finale (K) ou E finale', 296, { step: 'any' });
    const Vi = numInput('V initial (gaz seulement)', 1, { step: 'any' });
    const Vf = numInput('V final (gaz seulement)', 1, { step: 'any' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [N.lab, nu.lab, Ti.lab, Tf.lab, Vi.lab, Vf.lab]), out);
    function update() {
      const Nv = parseFloat(N.input.value) || 0, nuv = parseFloat(nu.input.value) || 0;
      const r = (parseFloat(Tf.input.value) || 1) / (parseFloat(Ti.input.value) || 1);
      const rv = (parseFloat(Vf.input.value) || 1) / (parseFloat(Vi.input.value) || 1);
      const expo = Nv * nuv / 2;
      const log10E = expo * Math.log10(r), log10V = Nv * Math.log10(rv);
      out.innerHTML = '';
      out.appendChild(readout([
        ['Exposant Nν/2', sci(expo)], ['Rapport E_f/E_i = T_f/T_i', fr(r, 6)], ['ln(E_f/E_i) ≈ ΔT/T si petit', sci(Math.log(r))],
        ['Facteur énergie : (E_f/E_i)^{Nν/2}', pow10str(log10E)], ['Facteur volume : (V_f/V_i)^N', pow10str(log10V)], ['Ω_f / Ω_i total', pow10str(log10E + log10V)]
      ]));
      out.appendChild(el('p', { class: 'w-note', html: `Méthode : log₁₀(Ω_f/Ω_i) = (Nν/2) log₁₀(E_f/E_i) + N log₁₀(V_f/V_i) = ${sci(log10E + log10V)}. Valeurs par défaut : exemple 6.3 du manuel (salle de 10²⁸ molécules chauffée de 1 K → 10^(3,7 × 10²⁵)).` }));
    }
    [N.input, nu.input, Ti.input, Tf.input, Vi.input, Vf.input].forEach(i => i.addEventListener('input', update)); update();
  }

  /* ===================== W8 : premier principe ===================== */
  function widgetFirstLaw(c) {
    header(c, 'Bilan d’énergie : ΔE = ΔQ − ΔW + μΔN',
      'Convention du cours : ΔQ est la chaleur <em>reçue</em> par le système, ΔW le travail <em>fourni par</em> le système, ΔN le nombre de particules reçues.');
    const Q = numInput('ΔQ reçue (J)', 0, { step: 'any' });
    const W = numInput('ΔW fourni par le système (J)', -50, { step: 'any' });
    const mu = numInput('μ (J par particule)', 0, { step: 'any' });
    const dN = numInput('ΔN (particules reçues)', 0, { step: 'any' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [Q.lab, W.lab, mu.lab, dN.lab]), out);
    function update() {
      const q = parseFloat(Q.input.value) || 0, w = parseFloat(W.input.value) || 0, m = parseFloat(mu.input.value) || 0, n = parseFloat(dN.input.value) || 0;
      const dE = q - w + m * n;
      const notes = [];
      notes.push(q > 0 ? 'le système reçoit de la chaleur' : q < 0 ? 'le système cède de la chaleur' : 'aucun échange de chaleur (adiabatique)');
      notes.push(w > 0 ? 'le système fournit du travail (ex. gaz qui se détend) → il perd de l’énergie' : w < 0 ? 'on fournit du travail au système (ex. compression) → il gagne de l’énergie' : 'aucun travail');
      notes.push(n !== 0 ? 'échange de particules : μΔN = ' + sci(m * n) + ' J' : 'système fermé (ΔN = 0)');
      out.innerHTML = '';
      out.appendChild(readout([['ΔE = ΔQ − ΔW + μΔN', `${sci(dE)} J`], ['Interprétation', dE > 0 ? 'l’énergie interne augmente' : dE < 0 ? 'l’énergie interne diminue' : 'énergie interne inchangée']]));
      out.appendChild(el('p', { class: 'w-note' }, notes.join(' ; ') + '.'));
    }
    [Q.input, W.input, mu.input, dN.input].forEach(i => i.addEventListener('input', update)); update();
  }

  /* ===================== Enregistrement ===================== */
  window.ELE = window.ELE || {};
  const REGISTRY = window.ELE.widgets = Object.assign(window.ELE.widgets || {}, { 'mean-die': widgetMeanDie, binomial: widgetBinomial, 'random-walk': widgetRandomWalk, stirling: widgetStirling, dof: widgetDof, 'phase-space': widgetPhaseSpace, 'omega-growth': widgetOmegaGrowth, 'first-law': widgetFirstLaw });
  // boîte à outils partagée avec widgets2.js
  window.ELE.wk = { el, numInput, rangeInput, selectInput, readout, header, setupCanvas, drawAxes, fr, sci, sup, pow10str, cssVar, lgamma, binomPMF, gauss };
  function init() {
    document.querySelectorAll('.widget[data-widget]').forEach(c => {
      if (c.dataset.init) return;
      const fn = REGISTRY[c.dataset.widget];
      if (!fn) return;
      c.dataset.init = '1';
      try { fn(c); } catch (e) { c.appendChild(el('p', { class: 'w-note' }, 'Erreur du widget : ' + e.message)); console.error(e); }
    });
  }
  window.ELE.initWidgets = init;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
