/* ELE2307 - démonstrations interactives du cours 7 (s'appuie sur la boîte à outils de widgets.js) */
(function () {
  'use strict';
  const W = window.ELE && window.ELE.wk;
  if (!W) { console.error('widgets.js doit être chargé avant widgets3.js'); return; }
  const { el, rangeInput, readout, header, setupCanvas, drawAxes, fr, sci, cssVar } = W;
  const kB = 8.617e-5;                 // eV/K
  const k = 1.381e-23, h = 6.626e-34;  // SI
  const PALETTE = ['#1f5fbf', '#c0392b', '#0d8f7a', '#b7791f', '#7c4dff'];

  /* ---------- petits utilitaires ---------- */
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
  function table(headers, rows, opts = {}) {
    const t = el('table');
    t.appendChild(el('tr', {}, headers.map(x => el('th', { html: x }))));
    rows.forEach((r, i) => {
      const tr = el('tr', {}, r.map((cell, j) => el('td', { class: j === 0 ? '' : 'num', html: cell })));
      if (opts.highlight === i) tr.style.fontWeight = '700';
      t.appendChild(tr);
    });
    return t;
  }
  function polyline(ctx, pts, sx, sy, color, width = 2.2, dash = null) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.beginPath();
    pts.forEach((p, i) => { const x = sx(p[0]), y = sy(p[1]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);
  }
  function legend(ctx, items, x, y) {
    ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    items.forEach(([name, col], i) => {
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y + 16 * i); ctx.lineTo(x + 18, y + 16 * i); ctx.stroke();
      ctx.fillStyle = cssVar('--text'); ctx.fillText(name, x + 24, y + 16 * i);
    });
  }
  function choose(n, r) { if (r < 0 || r > n) return 0; let v = 1; for (let i = 1; i <= r; i++) v = v * (n - r + i) / i; return Math.round(v); }
  function fact(n) { let v = 1; for (let i = 2; i <= n; i++) v *= i; return v; }

  /* ===================== Nombre d'occupation : fermions, bosons, classique ===================== */
  function widgetOccupation(c) {
    header(c, 'Nombre d’occupation : fermions, bosons et cas classique',
      'Nombre moyen de particules dans un état d’énergie ε, selon la statistique. À haute énergie les trois courbes se confondent (e<sup>−β(ε−μ)</sup>) ; près de μ elles se séparent : bosons au-dessus, fermions en dessous, et le fermion vaut exactement 1/2 à ε = μ quelle que soit T.');
    const T = rangeInput('Température T (K)', 1000, 10, 3000, 10, v => fr(v, 0));
    const mu = rangeInput('Potentiel chimique μ (eV)', 0.10, -0.2, 0.4, 0.01, v => fr(v, 2));
    const eps = rangeInput('Énergie ε de l’état à lire (eV)', 0.15, -0.2, 0.6, 0.005, v => fr(v, 3));
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [T.lab, mu.lab, eps.lab]), canvas, out);
    const nF = x => 1 / (Math.exp(x) + 1), nB = x => (x > 0 ? 1 / (Math.exp(x) - 1) : NaN), nC = x => Math.exp(-x);
    function update() {
      const t = val(T.input), m = val(mu.input), e0 = val(eps.input), kT = kB * t;
      const { ctx, w, h: hh } = setupCanvas(canvas, 290);
      const box = { x0: 52, y0: 12, x1: w - 12, y1: hh - 42 };
      const xr = [-0.2, 0.6], yr = [0, 3];
      const { sx, sy } = drawAxes(ctx, box, xr, yr, { nx: 8, ny: 6, xfmt: v => fr(v, 1), yfmt: v => fr(v, 1), xlabel: 'énergie de l’état ε (eV)', ylabel: 'nombre d’occupation' });
      const N = 320;
      [[nB, PALETTE[1]], [nC, PALETTE[2]], [nF, PALETTE[0]]].forEach(([f, col]) => {
        const pts = [];
        for (let i = 0; i <= N; i++) {
          const e = xr[0] + (xr[1] - xr[0]) * i / N; const n = f((e - m) / kT);
          if (Number.isFinite(n) && n >= 0 && n <= yr[1] * 1.02) pts.push([e, Math.min(n, yr[1])]);
          else if (pts.length && !Number.isFinite(n)) { polyline(ctx, pts, sx, sy, col); pts.length = 0; }
        }
        if (pts.length) polyline(ctx, pts, sx, sy, col);
      });
      ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(sx(m), box.y0); ctx.lineTo(sx(m), box.y1); ctx.moveTo(box.x0, sy(0.5)); ctx.lineTo(box.x1, sy(0.5)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = cssVar('--muted'); ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('ε = μ', sx(m) + 4, box.y0 + 2); ctx.textBaseline = 'bottom'; ctx.fillText('n = 1/2', box.x1 - 50, sy(0.5) - 2);
      const x0 = (e0 - m) / kT;
      [[nF(x0), PALETTE[0]], [nC(x0), PALETTE[2]], [nB(x0), PALETTE[1]]].forEach(([n, col]) => {
        if (!Number.isFinite(n) || n > yr[1]) return;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx(e0), sy(n), 5, 0, 2 * Math.PI); ctx.fill();
      });
      legend(ctx, [['bosons : 1/(e^x − 1)', PALETTE[1]], ['classique : e^(−x)', PALETTE[2]], ['fermions : 1/(e^x + 1)', PALETTE[0]]], box.x1 - 190, box.y0 + 14);
      out.innerHTML = '';
      out.appendChild(readout([
        ['x = (ε − μ)/kT', fr(x0, 3)], ['kT', fr(kT, 4) + ' eV'],
        ['Fermions : 1/(e<sup>x</sup> + 1)', sci(nF(x0), 3)],
        ['Bosons : 1/(e<sup>x</sup> − 1)', x0 > 0 ? sci(nB(x0), 3) : 'ε ≤ μ : non défini'],
        ['Classique : e<sup>−x</sup>', sci(nC(x0), 3)],
        ['Écart type fermions √(n(1 − n))', fr(Math.sqrt(nF(x0) * (1 - nF(x0))), 3)],
        ['Écart type bosons √(n(1 + n))', x0 > 0 ? sci(Math.sqrt(nB(x0) * (1 + nB(x0))), 3) : '-'],
        ['Largeur de la transition (≈ 4 kT)', fr(4 * kT, 3) + ' eV']
      ]));
      out.appendChild(el('p', { class: 'w-note' }, 'Pour les bosons, μ doit rester sous l’énergie du plus bas état : à ε = μ le nombre d’occupation diverge. Avec x ≥ 3 (ε − μ ≥ 3kT), les trois expressions diffèrent de moins de 5 %. Cas des ex. 1, 2, 4, 5 et 16 du chap. 19.'));
    }
    [T.input, mu.input, eps.input].forEach(i => i.addEventListener('input', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Petit système à deux niveaux (Boltzmann) ===================== */
  function widgetLevels(c) {
    header(c, 'Petit système à deux niveaux : probabilités de Boltzmann',
      'Un niveau fondamental (g<sub>0</sub> états) et un niveau excité à Δε au-dessus (g<sub>1</sub> états). Le graphique donne la fraction de systèmes au niveau excité en fonction de T, le point suit vos réglages. Mêmes calculs que les ex. 16, 20, 39 et 40 du chap. 15.');
    const T = rangeInput('Température T (K)', 290, 10, 3000, 5, v => fr(v, 0));
    const d = rangeInput('Écart Δε = ε<sub>1</sub> − ε<sub>0</sub> (eV)', 0.04, 0.005, 0.5, 0.005, v => fr(v, 3));
    const g0 = numIn('g<sub>0</sub> : états du niveau fondamental', 1, { min: 1, max: 20, step: 1 });
    const g1 = numIn('g<sub>1</sub> : états du niveau excité', 3, { min: 1, max: 20, step: 1 });
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [T.lab, d.lab, g0.lab, g1.lab]), canvas, out);
    function fracExc(t, de, a, b) { const r = Math.exp(-de / (kB * t)); return b * r / (a + b * r); }
    function update() {
      const t = val(T.input), de = val(d.input), a = Math.max(1, Math.round(val(g0.input)) || 1), b = Math.max(1, Math.round(val(g1.input)) || 1);
      const kT = kB * t, r = Math.exp(-de / kT), C = 1 / (a + b * r);
      const { ctx, w, h: hh } = setupCanvas(canvas, 260);
      const box = { x0: 52, y0: 12, x1: w - 12, y1: hh - 42 };
      const { sx, sy } = drawAxes(ctx, box, [0, 3000], [0, 1], { nx: 6, ny: 5, xfmt: v => fr(v, 0), yfmt: v => fr(v, 1), xlabel: 'température T (K)', ylabel: 'fraction au niveau excité' });
      const pts = []; for (let i = 1; i <= 200; i++) { const tt = 3000 * i / 200; pts.push([tt, fracExc(tt, de, a, b)]); }
      polyline(ctx, pts, sx, sy, PALETTE[0]);
      const lim = b / (a + b);
      ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(box.x0, sy(lim)); ctx.lineTo(box.x1, sy(lim)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = cssVar('--muted'); ctx.font = '12px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('limite T → ∞ : g1/(g0 + g1) = ' + fr(lim, 3), box.x1 - 4, sy(lim) - 2);
      const Te = de / kB;
      if (Te <= 3000) { ctx.setLineDash([2, 4]); ctx.strokeStyle = PALETTE[3]; ctx.beginPath(); ctx.moveTo(sx(Te), box.y0); ctx.lineTo(sx(Te), box.y1); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = PALETTE[3]; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('T_e = Δε/k', sx(Te) + 4, box.y0 + 2); }
      ctx.fillStyle = cssVar('--bad'); ctx.beginPath(); ctx.arc(sx(t), sy(fracExc(t, de, a, b)), 5, 0, 2 * Math.PI); ctx.fill();
      out.innerHTML = '';
      const Thalf = b > a ? de / (kB * Math.log(b / a)) : null;
      out.appendChild(readout([
        ['kT', fr(kT, 4) + ' eV'], ['e<sup>−Δε/kT</sup>', sci(r, 3)],
        ['C = 1/(g<sub>0</sub> + g<sub>1</sub>e<sup>−Δε/kT</sup>)', fr(C, 4)],
        ['P d’un état fondamental = C', fr(C, 4)], ['P d’un état excité = C e<sup>−Δε/kT</sup>', sci(C * r, 3)],
        ['Fraction au niveau fondamental g<sub>0</sub>C', fr(a * C, 4)], ['Fraction au niveau excité g<sub>1</sub>Ce<sup>−Δε/kT</sup>', sci(b * C * r, 3)],
        ['Rapport niveaux (g<sub>1</sub>/g<sub>0</sub>)e<sup>−Δε/kT</sup>', sci(b / a * r, 3)],
        ['Température d’excitation T<sub>e</sub> = Δε/k', fr(Te, 0) + ' K'],
        ['T où la moitié est excitée', Thalf ? fr(Thalf, 0) + ' K' : 'jamais (g1 ≤ g0)']
      ]));
      out.appendChild(el('p', { class: 'w-note' }, 'Réglages par défaut : ex. 16 du chap. 15 (Δε = 0,04 eV, trois états excités, 17 °C) : 62 % au fondamental, moitié excitée à 423 K. La fraction excitée ne dépasse jamais g1/(g0 + g1) : même à T infinie, les états sont seulement équiprobables.'));
    }
    [T.input, d.input, g0.input, g1.input].forEach(i => i.addEventListener('input', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Limite du cas classique : rp/h ===================== */
  function widgetClassicalLimit(c) {
    header(c, 'Limite du cas classique : le critère rp/h ≫ 1',
      'Séparation moyenne r = (V/N)<sup>1/3</sup>, quantité de mouvement thermique p = √(3mkT) et rapport rp/h, soit r sur la longueur d’onde de de Broglie h/p. Statistique classique valable si rp/h ≫ 1, sinon le système est dégénéré (quantique).');
    const PART = [['e', 'électron (9,11 × 10⁻³¹ kg)', 9.109e-31], ['p', 'nucléon, proton (1,67 × 10⁻²⁷ kg)', 1.673e-27], ['He', 'atome d’hélium 4 (6,65 × 10⁻²⁷ kg)', 6.646e-27], ['N2', 'molécule N₂ (4,65 × 10⁻²⁶ kg)', 4.65e-26], ['H2O', 'molécule d’eau (2,99 × 10⁻²⁶ kg)', 2.99e-26], ['Cu', 'atome de cuivre (1,06 × 10⁻²⁵ kg)', 1.055e-25]];
    const PRESET = [['cu', 'électrons de conduction du cuivre : 8,4 × 10²⁸ m⁻³', 8.4e28, 'e', 298], ['air', 'air à 1 atm et 20 °C : 2,5 × 10²⁵ m⁻³', 2.5e25, 'N2', 293], ['eau', 'eau liquide : 3,3 × 10²⁸ m⁻³', 3.3e28, 'H2O', 295], ['cuat', 'atomes de cuivre dans le métal : 8,4 × 10²⁸ m⁻³', 8.4e28, 'Cu', 298], ['he', 'hélium liquide : 2,2 × 10²⁸ m⁻³', 2.2e28, 'He', 4], ['wd', 'électrons d’une naine blanche : 10³⁵ m⁻³', 1e35, 'e', 1e9], ['nuc', 'nucléons d’un noyau : 6 × 10⁴³ m⁻³', 6e43, 'p', 7e10]];
    const preset = selIn('Exemple', PRESET.map(p => [p[0], p[1]]), 'air');
    const part = selIn('Particule', PART.map(p => [p[0], p[1]]), 'N2');
    const dens = numIn('Densité N/V (m⁻³)', 2.5e25, { step: 'any', min: 0 });
    const logT = rangeInput('Température T (K), échelle log', Math.log10(293), 0, 11, 0.05, v => sci(Math.pow(10, v), 2));
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [preset.lab, part.lab, dens.lab, logT.lab]), out);
    function applyPreset() {
      const p = PRESET.find(x => x[0] === preset.input.value); if (!p) return;
      dens.input.value = p[2]; part.input.value = p[3]; logT.input.value = Math.log10(p[4]); logT.val.textContent = sci(p[4], 2); update();
    }
    function update() {
      const m = PART.find(x => x[0] === part.input.value)[2], n = val(dens.input), T = Math.pow(10, val(logT.input));
      const r = Math.pow(1 / n, 1 / 3), p = Math.sqrt(3 * m * k * T), lam = h / p, ratio = r * p / h;
      const T1 = h * h / (3 * m * k * r * r);
      const verdict = ratio >= 10 ? 'classique valable (rp/h ≫ 1)' : ratio >= 1 ? 'zone grise : rp/h de l’ordre de 1, approche classique approximative' : 'système dégénéré : statistique quantique obligatoire';
      out.innerHTML = '';
      out.appendChild(readout([
        ['Séparation r = (V/N)<sup>1/3</sup>', sci(r, 3) + ' m'], ['p = √(3mkT)', sci(p, 3) + ' kg m/s'],
        ['Longueur d’onde de de Broglie h/p', sci(lam, 3) + ' m'], ['<strong>rp/h</strong>', sci(ratio, 3)],
        ['Verdict', verdict], ['T où rp/h = 1 (à cette densité)', sci(T1, 2) + ' K'], ['T où rp/h = 10', sci(100 * T1, 2) + ' K'],
        ['Nombre d’états par particule ≈ (rp/h)³', sci(Math.pow(ratio, 3), 2)]
      ]));
      out.appendChild(el('p', { class: 'w-note' }, 'Repères du cours : N₂ de l’air à 293 K donne rp/h ≈ 120 (classique) ; les électrons du cuivre donnent 0,04 à 298 K et 0,2 à 10 000 K (toujours quantiques) ; les atomes de cuivre eux-mêmes donnent 12 (classique). Ex. 24 à 28 du chap. 19.'));
    }
    preset.input.addEventListener('change', applyPreset);
    [part.input].forEach(i => i.addEventListener('change', update)); [dens.input, logT.input].forEach(i => i.addEventListener('input', update));
    update();
  }

  /* ===================== Compter les arrangements : distinctes, classique, bosons, fermions ===================== */
  function widgetArrangements(c) {
    header(c, 'Compter les arrangements : particules distinctes, bosons, fermions',
      'n particules réparties dans m états. Particules distinctes : Ω<sub>D</sub> = m<sup>n</sup> ; classique corrigé : Ω<sub>D</sub>/n! ; bosons identiques : C(n + m − 1, n) ; fermions identiques : C(m, n). Le tableau sépare les arrangements selon l’occupation maximale d’un état, comme les diapos 24 et 25.');
    const n = rangeInput('Nombre de particules n', 2, 1, 5, 1, v => fr(v, 0));
    const m = rangeInput('Nombre d’états m', 2, 1, 6, 1, v => fr(v, 0));
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [n.lab, m.lab]), out);
    function update() {
      const N = Math.round(val(n.input)), M = Math.round(val(m.input));
      const byMax = {};    // occupation max -> { D, bosons:Set, fermions }
      const total = Math.pow(M, N);
      const occ = new Array(M);
      for (let code = 0; code < total; code++) {
        occ.fill(0); let x = code; for (let i = 0; i < N; i++) { occ[x % M]++; x = Math.floor(x / M); }
        const mx = Math.max(...occ); const key = occ.join(',');
        const b = byMax[mx] || (byMax[mx] = { D: 0, B: new Set() }); b.D++; b.B.add(key);
      }
      const names = ['', 'occupation simple', 'occupation double', 'occupation triple', 'occupation quadruple', 'occupation quintuple'];
      const rows = []; let sD = 0, sC = 0, sB = 0, sF = 0;
      Object.keys(byMax).map(Number).sort((a, b) => a - b).forEach(mx => {
        const D = byMax[mx].D, B = byMax[mx].B.size, F = mx === 1 ? B : 0, C = D / fact(N);
        sD += D; sC += C; sB += B; sF += F;
        rows.push([names[mx] || ('occupation ' + mx), fr(D, 0), fr(C, 3), fr(B, 0), fr(F, 0)]);
      });
      rows.push(['<strong>total</strong>', '<strong>' + fr(sD, 0) + '</strong>', '<strong>' + fr(sC, 3) + '</strong>', '<strong>' + fr(sB, 0) + '</strong>', '<strong>' + fr(sF, 0) + '</strong>']);
      out.innerHTML = '';
      out.appendChild(table(['Arrangements', 'distinctes Ω<sub>D</sub>', 'classique Ω<sub>D</sub>/n!', 'bosons', 'fermions'], rows));
      out.appendChild(readout([['Formules : m<sup>n</sup>', fr(Math.pow(M, N), 0)], ['m<sup>n</sup>/n!', fr(Math.pow(M, N) / fact(N), 3)], ['C(n + m − 1, n)', fr(choose(N + M - 1, N), 0)], ['C(m, n)', fr(choose(M, N), 0)]]));
      if (N <= 3 && M <= 4) {
        const sym = ['①', '②', '③'];
        const list = [];
        for (let code = 0; code < total; code++) {
          const cells = Array.from({ length: M }, () => []); let x = code;
          for (let i = 0; i < N; i++) { cells[x % M].push(sym[i]); x = Math.floor(x / M); }
          list.push(cells.map(cl => cl.length ? cl.join('') : '-').join(' | '));
        }
        const bos = Array.from(new Set(Object.values(byMax).flatMap(b => Array.from(b.B)))).map(key => key.split(',').map(v => v === '0' ? '-' : '●'.repeat(+v)).join(' | '));
        out.appendChild(el('p', { class: 'w-note', html: '<strong>Particules distinctes</strong> (' + list.length + ') : ' + list.join(' ; ') + '<br><strong>Bosons</strong> (' + bos.length + ', un arrangement par vecteur d’occupation) : ' + bos.join(' ; ') + '<br><strong>Fermions</strong> : les arrangements de bosons sans état doublement occupé.' }));
      }
      out.appendChild(el('p', { class: 'w-note' }, 'Lecture : pour l’occupation simple, la correction classique 1/n! redonne exactement le bon compte ; pour les occupations multiples, elle sous-estime les bosons et surestime les fermions (qui n’en ont aucune). C’est l’origine de n_bosons > n_classique > n_fermions à basse énergie.'));
    }
    [n.input, m.input].forEach(i => i.addEventListener('input', update));
    update();
  }

  /* ===================== Enregistrement ===================== */
  Object.assign(window.ELE.widgets, {
    'occupation-number': widgetOccupation, 'boltzmann-levels': widgetLevels, 'classical-limit': widgetClassicalLimit, arrangements: widgetArrangements
  });
  if (window.ELE.initWidgets) window.ELE.initWidgets();
})();
