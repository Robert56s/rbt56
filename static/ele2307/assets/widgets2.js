/* ELE2307 - démonstrations interactives des cours 3 à 6 (s'appuie sur la boîte à outils de widgets.js) */
(function () {
  'use strict';
  const W = window.ELE && window.ELE.wk;
  if (!W) { console.error('widgets.js doit être chargé avant widgets2.js'); return; }
  const { el, rangeInput, readout, header, setupCanvas, drawAxes, fr, sci, pow10str, cssVar } = W;
  const k = 1.381e-23, R = 8.314, SIGMA = 5.67e-8;
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
    t.appendChild(el('tr', {}, headers.map(h => el('th', { html: h }))));
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
  function logSumExp(arr) { const m = Math.max(...arr.filter(Number.isFinite)); if (!Number.isFinite(m)) return -Infinity; return m + Math.log(arr.reduce((a, v) => a + (Number.isFinite(v) ? Math.exp(v - m) : 0), 0)); }
  const K2C = T => T - 273.15, C2K = T => T + 273.15;

  /* ===================== Cours 3 : deux systèmes en interaction thermique ===================== */
  function widgetThermalContact(c) {
    header(c, 'Deux systèmes en interaction thermique',
      'Deux systèmes de n<sub>1</sub> et n<sub>2</sub> degrés de liberté se partagent une énergie totale E<sub>0</sub>. Le nombre d’états du système combiné Ω<sub>0</sub> = Ω<sub>1</sub>Ω<sub>2</sub> ∝ E<sub>1</sub><sup>n<sub>1</sub>/2</sup>(E<sub>0</sub> − E<sub>1</sub>)<sup>n<sub>2</sub>/2</sup> est maximal quand l’énergie est répartie au prorata des degrés de liberté. Plus les systèmes sont grands, plus le pic est étroit.');
    const presets = selIn('Préréglages', [['', '-'], ['s1', 'Diapo : 6 et 10 ddl, E₀ = 5 eV'], ['s2', 'Diapo : 60 et 100 ddl, E₀ = 5 eV'], ['b3', 'Chap. 7, ex. 3 : 3 et 4 ddl, E₀ = 4'], ['b5', 'Chap. 7, ex. 5 : 4 et 6 ddl, E₀ = 6'], ['big', 'Macroscopique : 6 × 10²⁴ et 10²⁵ ddl']], '');
    const n1 = numIn('n<sub>1</sub> = N<sub>1</sub>ν<sub>1</sub> (ddl du système 1)', 6, { min: 1, step: 'any' });
    const n2 = numIn('n<sub>2</sub> = N<sub>2</sub>ν<sub>2</sub> (ddl du système 2)', 10, { min: 1, step: 'any' });
    const E0 = numIn('E<sub>0</sub> (unités d’énergie, ex. eV)', 5, { min: 0.001, step: 'any' });
    const step = numIn('Pas d’énergie du tableau (0 = pas de tableau)', 1, { min: 0, step: 'any' });
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div'), tableWrap = el('div');
    c.append(el('div', { class: 'controls' }, [presets.lab, n1.lab, n2.lab, E0.lab, step.lab]), canvas, out, tableWrap);
    presets.input.addEventListener('change', () => {
      const m = { s1: [6, 10, 5, 1], s2: [60, 100, 5, 1], b3: [3, 4, 4, 1], b5: [4, 6, 6, 1], big: [6e24, 1e25, 5, 0] }[presets.input.value];
      if (m) { n1.input.value = m[0]; n2.input.value = m[1]; E0.input.value = m[2]; step.input.value = m[3]; update(); }
    });
    function update() {
      const a = val(n1.input) / 2, b = val(n2.input) / 2, E = val(E0.input), st = val(step.input);
      if (!(a > 0 && b > 0 && E > 0)) return;
      const Estar = a / (a + b) * E;
      const sigma = 1 / Math.sqrt(a / (Estar * Estar) + b / ((E - Estar) * (E - Estar)));
      // courbe normalisée
      const N = 400, pts = []; let lnmax = -Infinity; const lns = [];
      for (let i = 0; i <= N; i++) { const x = E * i / N; const ln = (x <= 0 || x >= E) ? -Infinity : a * Math.log(x) + b * Math.log(E - x); lns.push(ln); if (ln > lnmax) lnmax = ln; }
      for (let i = 0; i <= N; i++) pts.push([E * i / N, Number.isFinite(lns[i]) ? Math.exp(lns[i] - lnmax) : 0]);
      const { ctx, w, h } = setupCanvas(canvas, 280);
      const box = { x0: 52, y0: 12, x1: w - 12, y1: h - 42 };
      const { sx, sy } = drawAxes(ctx, box, [0, E], [0, 1.1], { nx: 5, ny: 5, xfmt: v => fr(v, 2), yfmt: v => fr(v, 1), xlabel: 'E₁ (énergie du système 1)', ylabel: 'Ω₀ / Ω₀,max' });
      polyline(ctx, pts, sx, sy, cssVar('--accent'));
      ctx.strokeStyle = cssVar('--ok'); ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(sx(Estar), box.y0); ctx.lineTo(sx(Estar), box.y1); ctx.stroke(); ctx.setLineDash([]);
      // tableau
      tableWrap.innerHTML = '';
      let Pstar = null;
      if (st > 0 && E / st <= 40) {
        const rows = [], lnList = [];
        for (let x = 0; x <= E + 1e-9; x += st) { const l1 = x > 0 ? a * Math.log(x) : -Infinity, l2 = (E - x) > 1e-12 ? b * Math.log(E - x) : -Infinity; lnList.push([x, l1, l2, l1 + l2]); }
        const lnTot = logSumExp(lnList.map(r => r[3]));
        let best = -1, bestLn = -Infinity;
        lnList.forEach((r, i) => { if (r[3] > bestLn) { bestLn = r[3]; best = i; } });
        lnList.forEach(r => {
          const P = Number.isFinite(r[3]) ? Math.exp(r[3] - lnTot) : 0;
          rows.push([fr(r[0], 3), fr(E - r[0], 3), Number.isFinite(r[1]) ? pow10str(r[1] / Math.LN10) : '0', Number.isFinite(r[2]) ? pow10str(r[2] / Math.LN10) : '0', Number.isFinite(r[3]) ? pow10str(r[3] / Math.LN10) : '0', fr(100 * P, 2) + ' %']);
        });
        Pstar = Math.exp(bestLn - lnTot);
        tableWrap.appendChild(table(['E₁', 'E₂ = E₀ − E₁', 'Ω₁ ∝ E₁^(n₁/2)', 'Ω₂ ∝ E₂^(n₂/2)', 'Ω₀ = Ω₁Ω₂', 'Probabilité'], rows, { highlight: best }));
      }
      out.innerHTML = '';
      const items = [['E₁* le plus probable = n₁/(n₁+n₂) × E₀', fr(Estar, 4)], ['E₂* = E₀ − E₁*', fr(E - Estar, 4)], ['Largeur du pic σ(E₁)', sci(sigma, 3)], ['Fluctuation relative σ/E₁*', sci(sigma / Estar, 3)]];
      if (Pstar !== null) items.push(['Probabilité de la répartition la plus probable (tableau)', fr(100 * Pstar, 1) + ' %']);
      out.appendChild(readout(items));
      out.appendChild(el('p', { class: 'w-note' }, 'La ligne verte pointillée marque le maximum de Ω₀, obtenu en annulant dΩ₀/dE₁ : E₁* = n₁E₀/(n₁+n₂), c’est l’équipartition (même énergie kT/2 par degré de liberté dans les deux systèmes). La largeur relative du pic décroît comme 1/√(nombre de ddl) : pour des systèmes macroscopiques, tout écart à cette répartition est inobservable.'));
    }
    [n1.input, n2.input, E0.input, step.input].forEach(i => i.addEventListener('input', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Cours 3 : entropie, chaleur et nombre d'états ===================== */
  const CP_TABLE = [['eau', 4.19], ['glace', 2.09], ['aluminium', 0.90], ['cuivre', 0.39], ['or', 0.126], ['marbre', 0.88], ['bois', 1.8], ['acétone', 2.22], ['alcool éthylique', 2.43], ['caoutchouc', 1.9], ['cuir sec', 1.5], ['sucre', 1.13], ['sel', 0.88], ['air', 1.05], ['hélium', 5.23], ['azote liquide', 1.97]];
  function widgetEntropyCalc(c) {
    header(c, 'Entropie, chaleur et nombre d’états',
      'Trois calculs qui reviennent sans cesse : S = k ln Ω ; ΔS = ΔQ/T et Ω<sub>f</sub>/Ω<sub>i</sub> = e<sup>ΔQ/kT</sup> ; ΔS = ∫C dT/T = m c ln(T<sub>f</sub>/T<sub>i</sub>) (plus L/T à un changement de phase).');
    const mode = selIn('Calcul', [['omega', 'S à partir du nombre d’états Ω'], ['heat', 'Chaleur ΔQ reçue à la température T'], ['heating', 'Chauffage d’une masse (chaleur spécifique)']], 'heat');
    // mode omega
    const logOmega = numIn('log<sub>10</sub> Ω (ex. 10²⁴ pour Ω = 10^(10²⁴))', 1e24, { step: 'any' });
    // mode heat
    const dQ = numIn('ΔQ reçue (J)', 1, { step: 'any' });
    const Tq = numIn('T (K)', 295, { min: 0.001, step: 'any' });
    // mode heating
    const mat = selIn('Substance (table 8.1)', CP_TABLE.map(([n, v]) => [n, `${n} (${fr(v, 3)} kJ/(kg K))`]).concat([['custom', 'personnalisée']]), 'eau');
    const cCustom = numIn('c personnalisé (kJ/(kg K))', 1, { min: 0, step: 'any' });
    const mass = numIn('Masse m (kg)', 0.1, { min: 0, step: 'any' });
    const Ti = numIn('T<sub>i</sub> (K)', 283, { min: 0.001, step: 'any' });
    const Tf = numIn('T<sub>f</sub> (K)', 368, { min: 0.001, step: 'any' });
    const Lat = numIn('Chaleur latente L (J/kg, 0 si aucune)', 0, { min: 0, step: 'any' });
    const Tph = numIn('Température du changement de phase (K)', 273, { min: 0.001, step: 'any' });
    const panels = {
      omega: [logOmega.lab], heat: [dQ.lab, Tq.lab], heating: [mat.lab, cCustom.lab, mass.lab, Ti.lab, Tf.lab, Lat.lab, Tph.lab]
    };
    const controls = el('div', { class: 'controls' }, [mode.lab]);
    Object.values(panels).flat().forEach(l => controls.appendChild(l));
    const out = el('div');
    c.append(controls, out);
    function update() {
      const m = mode.input.value;
      Object.entries(panels).forEach(([key, labs]) => labs.forEach(l => l.style.display = key === m ? '' : 'none'));
      cCustom.lab.style.display = (m === 'heating' && mat.input.value === 'custom') ? '' : 'none';
      out.innerHTML = '';
      if (m === 'omega') {
        const lg = val(logOmega.input); const S = k * Math.LN10 * lg;
        out.appendChild(readout([['Ω', pow10str(lg)], ['ln Ω = 2,303 log₁₀ Ω', sci(Math.LN10 * lg, 4)], ['S = k ln Ω', `${sci(S, 4)} J/K`]]));
        out.appendChild(el('p', { class: 'w-note' }, 'Exemple du cours : un verre d’eau de 10²⁴ molécules à 10 états chacune donne Ω = 10^(10²⁴) et S = 1,38 × 10⁻²³ × 10²⁴ × ln 10 ≈ 32 J/K. Le logarithme ramène un nombre inimaginable à une grandeur de quelques joules par kelvin.'));
      } else if (m === 'heat') {
        const q = val(dQ.input), T = val(Tq.input); const dS = q / T; const x = dS / k;
        out.appendChild(readout([['ΔS = ΔQ/T', `${sci(dS, 4)} J/K`], ['ΔS/k = ΔQ/kT', sci(x, 4)], ['Ω_f/Ω_i = e^(ΔQ/kT)', pow10str(x / Math.LN10)]]));
        out.appendChild(el('p', { class: 'w-note' }, 'Valable quand T reste pratiquement constante pendant l’échange (réservoir). Exemple du cours : 1 J ajouté à 295 K multiplie le nombre d’états par 10^(1,07 × 10²⁰).'));
      } else {
        const cval = (mat.input.value === 'custom' ? val(cCustom.input) : CP_TABLE.find(([n]) => n === mat.input.value)[1]) * 1000;
        const mm = val(mass.input), ti = val(Ti.input), tf = val(Tf.input), L = val(Lat.input), tp = val(Tph.input);
        const dSheat = mm * cval * Math.log(tf / ti), dQheat = mm * cval * (tf - ti);
        const dSph = L > 0 ? mm * L / tp : 0, dQph = L > 0 ? mm * L : 0;
        out.appendChild(readout([['c utilisée', `${fr(cval, 0)} J/(kg K)`], ['ΔQ = m c (T_f − T_i)', `${sci(dQheat, 4)} J`], ['ΔS = m c ln(T_f/T_i)', `${sci(dSheat, 4)} J/K`], ['Changement de phase : m L', `${sci(dQph, 4)} J`], ['ΔS_phase = m L / T_phase', `${sci(dSph, 4)} J/K`], ['ΔS total', `${sci(dSheat + dSph, 4)} J/K`], ['Ω_f/Ω_i = e^(ΔS/k)', pow10str((dSheat + dSph) / k / Math.LN10)]]));
        out.appendChild(el('p', { class: 'w-note' }, 'On intègre dS = dQ/T avec dQ = m c dT, c supposée constante : ΔS = m c ln(T_f/T_i). À un changement de phase la température ne bouge pas : ΔS = Q_latente/T. Valeurs par défaut : exercice 16 du chapitre 8 (100 g d’eau de 10 °C à 95 °C → 110 J/K).'));
      }
    }
    [mode.input, mat.input].forEach(i => i.addEventListener('change', update));
    [logOmega.input, dQ.input, Tq.input, cCustom.input, mass.input, Ti.input, Tf.input, Lat.input, Tph.input].forEach(i => i.addEventListener('input', update));
    update();
  }

  /* ===================== Cours 4 : explorateur de processus (gaz parfait) ===================== */
  function widgetProcessExplorer(c) {
    header(c, 'Explorateur de processus pour un gaz parfait',
      'Partant du même état initial, le gaz passe au volume final V<sub>f</sub> = r V<sub>i</sub> par un processus isobare, isotherme ou adiabatique. Le calculateur donne l’état final et le bilan ΔE, ΔW, ΔQ, ΔS (table 13.1 du manuel) et trace les trois chemins dans le diagramme p-V.');
    const presets = selIn('Préréglages', [['', '-'], ['ex22', 'Chap. 12, ex. 22 : 0,446 mol, 0 °C, 1 atm, 10 L → 15 L'], ['ex31', 'Chap. 13, ex. 31 : 0,2 L, 5 × 10⁵ Pa, 600 °C → 1 L'], ['comp', 'Compression : r = 0,5']], '');
    const n = numIn('n (mol)', 0.446, { min: 0.0001, step: 'any' });
    const nu = selIn('ν (ddl par molécule)', [['3', '3 (monoatomique)'], ['5', '5 (diatomique)'], ['6', '6'], ['7', '7']], '5');
    const Ti = numIn('T<sub>i</sub> (K)', 273, { min: 1, step: 'any' });
    const pi = numIn('p<sub>i</sub> (kPa)', 101.3, { min: 0.001, step: 'any' });
    const r = rangeInput('Rapport r = V_f / V_i', 1.5, 0.2, 4, 0.05, v => fr(v, 2));
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [presets.lab, n.lab, nu.lab, Ti.lab, pi.lab, r.lab]), canvas, out);
    presets.input.addEventListener('change', () => {
      const v = presets.input.value;
      if (v === 'ex22') { n.input.value = 0.446; nu.input.value = '5'; Ti.input.value = 273; pi.input.value = 101.3; r.input.value = 1.5; }
      if (v === 'ex31') { n.input.value = (5e5 * 0.2e-3 / (R * 873.15)).toFixed(5); nu.input.value = '5'; Ti.input.value = 873.15; pi.input.value = 500; r.input.value = 5; }
      if (v === 'comp') { r.input.value = 0.5; }
      r.input.dispatchEvent(new Event('input')); update();
    });
    function update() {
      const nv = val(n.input), nuv = parseFloat(nu.input.value), T0 = val(Ti.input), p0 = val(pi.input) * 1000, rv = val(r.input);
      const Cv = nuv / 2 * R, Cp = Cv + R, g = Cp / Cv;
      const V0 = nv * R * T0 / p0, Vf = rv * V0;
      const res = [];
      // isobare
      { const Tf = T0 * rv; res.push({ name: 'Isobare (p constante)', p: p0, V: Vf, T: Tf, dE: nv * Cv * (Tf - T0), W: p0 * (Vf - V0), Q: nv * Cp * (Tf - T0), dS: nv * Cp * Math.log(Tf / T0), color: PALETTE[2], pts: [[V0, p0], [Vf, p0]] }); }
      // isotherme
      { const pf = p0 / rv; const Wv = nv * R * T0 * Math.log(rv); const pts = []; for (let i = 0; i <= 60; i++) { const V = V0 + (Vf - V0) * i / 60; pts.push([V, nv * R * T0 / V]); } res.push({ name: 'Isotherme (T constante)', p: pf, V: Vf, T: T0, dE: 0, W: Wv, Q: Wv, dS: nv * R * Math.log(rv), color: PALETTE[0], pts }); }
      // adiabatique
      { const pf = p0 * Math.pow(1 / rv, g), Tf = T0 * Math.pow(1 / rv, g - 1); const Wv = (p0 * V0 - pf * Vf) / (g - 1); const pts = []; for (let i = 0; i <= 60; i++) { const V = V0 + (Vf - V0) * i / 60; pts.push([V, p0 * Math.pow(V0 / V, g)]); } res.push({ name: 'Adiabatique (ΔQ = 0)', p: pf, V: Vf, T: Tf, dE: -Wv, W: Wv, Q: 0, dS: 0, color: PALETTE[1], pts }); }
      // tracé
      const { ctx, w, h } = setupCanvas(canvas, 300);
      const allV = [V0, Vf], allP = res.flatMap(x => x.pts.map(q => q[1])).concat([p0]);
      const Vmin = Math.min(...allV) * 0.9, Vmax = Math.max(...allV) * 1.1, pmax = Math.max(...allP) * 1.1;
      const box = { x0: 60, y0: 12, x1: w - 12, y1: h - 42 };
      const { sx, sy } = drawAxes(ctx, box, [Vmin * 1000, Vmax * 1000], [0, pmax / 1000], { nx: 6, ny: 5, xfmt: v => fr(v, 2), yfmt: v => fr(v, 0), xlabel: 'V (L)', ylabel: 'p (kPa)' });
      res.forEach(x => polyline(ctx, x.pts.map(q => [q[0] * 1000, q[1] / 1000]), sx, sy, x.color));
      ctx.fillStyle = cssVar('--text'); ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
      res.forEach((x, i) => { ctx.fillStyle = x.color; ctx.fillRect(box.x1 - 190, box.y0 + 8 + i * 18, 12, 12); ctx.fillStyle = cssVar('--text'); ctx.fillText(x.name, box.x1 - 172, box.y0 + 19 + i * 18); });
      ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(sx(V0 * 1000), sy(p0 / 1000), 4, 0, 2 * Math.PI); ctx.fill();
      out.innerHTML = '';
      out.appendChild(readout([['V_i = nRT_i/p_i', `${fr(V0 * 1000, 3)} L`], ['V_f', `${fr(Vf * 1000, 3)} L`], ['C_V = (ν/2)R', `${fr(Cv, 2)} J/(mol K)`], ['C_p = C_V + R', `${fr(Cp, 2)} J/(mol K)`], ['γ = C_p/C_V = (ν+2)/ν', fr(g, 3)]]));
      out.appendChild(table(['Processus', 'p_f (kPa)', 'T_f (K)', 'ΔE (J)', 'ΔW fourni (J)', 'ΔQ reçue (J)', 'ΔS (J/K)'], res.map(x => [x.name, fr(x.p / 1000, 2), fr(x.T, 1), fr(x.dE, 1), fr(x.W, 1), fr(x.Q, 1), fr(x.dS, 3)])));
      out.appendChild(el('p', { class: 'w-note' }, 'Convention : ΔW est le travail fourni par le gaz (positif pour une détente), ΔQ la chaleur reçue, ΔE = ΔQ − ΔW. Pour une détente, l’adiabatique descend plus vite que l’isotherme (le gaz se refroidit) et fournit moins de travail ; l’isobare en fournit le plus mais exige beaucoup de chaleur.'));
    }
    [n.input, nu.input, Ti.input, pi.input, r.input].forEach(i => { i.addEventListener('input', update); i.addEventListener('change', update); });
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Cours 4 et 6 : résistances thermiques en série ===================== */
  const K_TABLE = [['argent', 410], ['cuivre', 380], ['aluminium', 210], ['acier', 45], ['roche', 2.2], ['verre', 0.95], ['béton (maçonnerie)', 0.62], ['eau', 0.56], ['plâtre', 0.50], ['bois', 0.10], ['isolant (styromousse)', 0.042], ['air immobile', 0.023], ['époxy (FR-4)', 0.35], ['pierre naturelle', 3.5]];
  function widgetThermalResistance(c) {
    header(c, 'Mur composite : résistances thermiques en série',
      'Chaque couche traversée par le même flux Q̇ a une résistance R = L/(kA) ; une convection sur une face ajoute R = 1/(hA). Les résistances s’additionnent, le flux vaut Q̇ = ΔT/R<sub>total</sub> et la chute de température dans chaque couche vaut Q̇ R.');
    const presets = selIn('Préréglages', [['', '-'], ['vitrine', 'Vitrine du cours 4 (verre, air, verre + films d’air)'], ['bois', 'Mur en bois de 0,5 m (cours 6, ex. 2)'], ['pierre', 'Mur en pierre de 0,5 m (cours 6, ex. 2)'], ['maison', 'Mur isolé avec convection des deux côtés'], ['vitre1', 'Vitre simple de 4 mm avec convection']], '');
    const area = numIn('Aire A (m²)', 15, { min: 0.0001, step: 'any' });
    const Th = numIn('T chaude (°C)', 20, { step: 'any' });
    const Tc = numIn('T froide (°C)', 0, { step: 'any' });
    const h1 = numIn('h côté chaud (W/(m² K), 0 = aucune convection)', 0, { min: 0, step: 'any' });
    const h2 = numIn('h côté froid (W/(m² K), 0 = aucune)', 0, { min: 0, step: 'any' });
    const layersBox = el('div');
    const addBtn = el('button', { class: 'btn secondary', type: 'button' }, 'Ajouter une couche');
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [presets.lab, area.lab, Th.lab, Tc.lab, h1.lab, h2.lab]), el('h4', {}, 'Couches (du côté chaud vers le côté froid)'), layersBox, el('div', { class: 'exo-tools' }, [addBtn]), canvas, out);
    let layers = [];
    function renderLayers() {
      layersBox.innerHTML = '';
      const t = el('table', { class: 'prob-table' });
      t.appendChild(el('tr', {}, [el('th', {}, '#'), el('th', {}, 'Matériau'), el('th', {}, 'k (W/(m K))'), el('th', {}, 'Épaisseur (mm)'), el('th', {}, '')]));
      layers.forEach((L, i) => {
        const sel = el('select'); K_TABLE.forEach(([nm]) => sel.appendChild(el('option', { value: nm }, nm))); sel.appendChild(el('option', { value: 'custom' }, 'personnalisé')); sel.value = L.mat;
        const kin = el('input', { type: 'number', step: 'any', min: 0.0001, value: L.k }); kin.disabled = L.mat !== 'custom';
        const tin = el('input', { type: 'number', step: 'any', min: 0.0001, value: L.t });
        sel.addEventListener('change', () => { L.mat = sel.value; if (L.mat !== 'custom') { L.k = K_TABLE.find(([nm]) => nm === L.mat)[1]; kin.value = L.k; } kin.disabled = L.mat !== 'custom'; update(); });
        kin.addEventListener('input', () => { L.k = val(kin); update(); });
        tin.addEventListener('input', () => { L.t = val(tin); update(); });
        const rm = el('button', { class: 'btn secondary', type: 'button', onclick: () => { layers.splice(i, 1); renderLayers(); update(); } }, '×');
        t.appendChild(el('tr', {}, [el('td', {}, String(i + 1)), el('td', {}, sel), el('td', {}, kin), el('td', {}, tin), el('td', {}, rm)]));
      });
      layersBox.appendChild(t);
    }
    function setPreset(v) {
      const mk = (mat, t, kk) => ({ mat, t, k: kk !== undefined ? kk : K_TABLE.find(([nm]) => nm === mat)[1] });
      if (v === 'vitrine') { layers = [mk('air immobile', 1), mk('verre', 3), mk('air immobile', 10), mk('verre', 3), mk('air immobile', 1)]; area.input.value = 15; Th.input.value = 20; Tc.input.value = 0; h1.input.value = 0; h2.input.value = 0; }
      if (v === 'bois') { layers = [mk('bois', 500, 0.15)]; layers[0].mat = 'custom'; area.input.value = 10; Th.input.value = 22; Tc.input.value = -10; h1.input.value = 0; h2.input.value = 0; }
      if (v === 'pierre') { layers = [mk('pierre naturelle', 500)]; area.input.value = 10; Th.input.value = 22; Tc.input.value = -10; h1.input.value = 0; h2.input.value = 0; }
      if (v === 'maison') { layers = [mk('plâtre', 12), mk('isolant (styromousse)', 100), mk('béton (maçonnerie)', 150)]; area.input.value = 10; Th.input.value = 21; Tc.input.value = -15; h1.input.value = 8; h2.input.value = 25; }
      if (v === 'vitre1') { layers = [mk('verre', 4)]; area.input.value = 1; Th.input.value = 21; Tc.input.value = -15; h1.input.value = 8; h2.input.value = 25; }
      renderLayers(); update();
    }
    presets.input.addEventListener('change', () => setPreset(presets.input.value));
    addBtn.addEventListener('click', () => { layers.push({ mat: 'verre', t: 3, k: 0.95 }); renderLayers(); update(); });
    function update() {
      const A = val(area.input), th = val(Th.input), tc = val(Tc.input), hh1 = val(h1.input), hh2 = val(h2.input);
      const Rs = [];
      if (hh1 > 0) Rs.push({ name: 'Convection côté chaud', R: 1 / (hh1 * A), L: 0 });
      layers.forEach((L, i) => Rs.push({ name: `Couche ${i + 1} : ${L.mat === 'custom' ? 'personnalisé' : L.mat}`, R: (L.t / 1000) / (L.k * A), L: L.t / 1000 }));
      if (hh2 > 0) Rs.push({ name: 'Convection côté froid', R: 1 / (hh2 * A), L: 0 });
      const Rtot = Rs.reduce((a, r) => a + r.R, 0);
      const Q = Rtot > 0 ? (th - tc) / Rtot : 0;
      // profil de température
      let T = th, x = 0; const prof = [[0, th]]; const temps = [th];
      Rs.forEach(r => { T -= Q * r.R; x += r.L; prof.push([x, T]); temps.push(T); });
      const { ctx, w, h } = setupCanvas(canvas, 240);
      const box = { x0: 60, y0: 12, x1: w - 12, y1: h - 42 };
      const xmax = Math.max(x, 1e-3) * 1000, tmin = Math.min(th, tc), tmax = Math.max(th, tc);
      const pad = (tmax - tmin) * 0.1 || 1;
      const { sx, sy } = drawAxes(ctx, box, [0, xmax], [tmin - pad, tmax + pad], { nx: 6, ny: 5, xfmt: v => fr(v, 1), yfmt: v => fr(v, 1), xlabel: 'position dans le mur (mm)', ylabel: 'T (°C)' });
      // couches colorées
      let xx = 0; layers.forEach((L, i) => { ctx.fillStyle = PALETTE[i % PALETTE.length]; ctx.globalAlpha = .12; ctx.fillRect(sx(xx * 1000), box.y0, sx((xx + L.t / 1000) * 1000) - sx(xx * 1000), box.y1 - box.y0); ctx.globalAlpha = 1; xx += L.t / 1000; });
      polyline(ctx, prof.map(p => [p[0] * 1000, p[1]]), sx, sy, cssVar('--bad'), 2.5);
      out.innerHTML = '';
      out.appendChild(table(['Élément', 'R (K/W)', 'Chute de température Q̇R (K)', 'T après (°C)'], Rs.map((r, i) => [r.name, sci(r.R, 3), fr(Q * r.R, 2), fr(temps[i + 1], 2)])));
      out.appendChild(readout([['R_total = Σ R', `${sci(Rtot, 4)} K/W`], ['Q̇ = ΔT / R_total', `${sci(Q, 4)} W`], ['Densité de flux Q̇/A', `${sci(Q / A, 3)} W/m²`], ['Énergie perdue en 1 jour', `${sci(Q * 86400, 3)} J`], ['Énergie en 3 mois (7,776 × 10⁶ s)', `${sci(Q * 7.776e6, 3)} J`]]));
      out.appendChild(el('p', { class: 'w-note' }, 'Lecture du profil : la couche la plus résistante (petit k, grande épaisseur) concentre presque toute la chute de température. Dans la vitrine du cours 4, la lame d’air de 1 cm représente 82 % de la résistance totale ; le verre presque rien. Les chutes par convection apparaissent comme des segments verticaux aux extrémités (épaisseur nulle).'));
    }
    const pre = c.dataset.preset || 'vitrine'; presets.input.value = pre; setPreset(pre);
    [area.input, Th.input, Tc.input, h1.input, h2.input].forEach(i => i.addEventListener('input', update));
    window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Cours 4 : équation de la chaleur (diffusion 1D) ===================== */
  const DIFF_MATS = [['cuivre', 380, 8960, 385], ['aluminium', 210, 2700, 900], ['acier', 45, 7850, 470], ['roche', 2.2, 2700, 880], ['verre', 0.95, 2500, 840], ['eau (immobile)', 0.56, 1000, 4190], ['bois', 0.10, 600, 1800], ['air (immobile)', 0.023, 1.2, 1005]];
  function widgetHeatEquation(c) {
    header(c, 'Équation de la chaleur : diffusion de la température dans une barre',
      'Résolution numérique de ∂T/∂t = K ∂²T/∂x² avec K = k/(ρ<sub>m</sub>c). Choisissez le matériau et la condition initiale, puis lancez : la température se lisse et le profil s’étale sur une distance de l’ordre de √(Kt).');
    const mat = selIn('Matériau (k, ρ_m, c)', DIFF_MATS.map(([n, kk, rho, cp]) => [n, `${n} : k = ${kk}, ρ = ${rho}, c = ${cp}`]), 'cuivre');
    const L = numIn('Longueur de la barre L (m)', 0.1, { min: 0.001, step: 'any' });
    const ic = selIn('Condition initiale', [['pic', 'Pic chaud au centre (100 °C dans 20 °C)'], ['marche', 'Moitié chaude (100 °C), moitié froide (20 °C)'], ['dirichlet', 'Extrémités maintenues à 100 °C et 20 °C']], 'pic');
    const speed = rangeInput('Vitesse (pas de calcul par image)', 20, 1, 300, 1);
    const play = el('button', { class: 'btn', type: 'button' }, 'Lancer');
    const reset = el('button', { class: 'btn secondary', type: 'button' }, 'Réinitialiser');
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [mat.lab, L.lab, ic.lab, speed.lab, el('label', {}, [' ', el('span', {}, [play, ' ', reset])])]), canvas, out);
    const N = 120; let T = new Float64Array(N), t = 0, running = false, raf = null, Kd = 1e-4, dx = 1e-3, dt = 1e-3;
    function params() { const m = DIFF_MATS.find(([n]) => n === mat.input.value); Kd = m[1] / (m[2] * m[3]); dx = val(L.input) / N; dt = 0.45 * dx * dx / Kd; }
    function init() {
      params(); t = 0; const mode = ic.input.value;
      for (let i = 0; i < N; i++) T[i] = 20;
      if (mode === 'pic') for (let i = N / 2 - 6; i < N / 2 + 6; i++) T[i] = 100;
      if (mode === 'marche') for (let i = 0; i < N / 2; i++) T[i] = 100;
      if (mode === 'dirichlet') { T[0] = 100; T[N - 1] = 20; }
      draw();
    }
    function step() {
      const Tn = new Float64Array(N); const a = Kd * dt / (dx * dx); const mode = ic.input.value;
      for (let i = 1; i < N - 1; i++) Tn[i] = T[i] + a * (T[i + 1] - 2 * T[i] + T[i - 1]);
      if (mode === 'dirichlet') { Tn[0] = 100; Tn[N - 1] = 20; } else { Tn[0] = Tn[1]; Tn[N - 1] = Tn[N - 2]; }
      T = Tn; t += dt;
    }
    function draw() {
      const { ctx, w, h } = setupCanvas(canvas, 260);
      const box = { x0: 52, y0: 12, x1: w - 12, y1: h - 42 };
      const Lv = val(L.input);
      const { sx, sy } = drawAxes(ctx, box, [0, Lv * 100], [0, 110], { nx: 5, ny: 5, xfmt: v => fr(v, 1), yfmt: v => fr(v, 0), xlabel: 'x (cm)', ylabel: 'T (°C)' });
      const pts = []; for (let i = 0; i < N; i++) pts.push([(i + 0.5) * dx * 100, T[i]]);
      polyline(ctx, pts, sx, sy, cssVar('--bad'), 2.5);
      out.innerHTML = '';
      const tStr = t < 60 ? `${fr(t, 2)} s` : t < 3600 ? `${fr(t / 60, 2)} min` : t < 86400 ? `${fr(t / 3600, 2)} h` : `${fr(t / 86400, 2)} jours`;
      out.appendChild(readout([['Diffusivité K = k/(ρ_m c)', `${sci(Kd, 3)} m²/s`], ['Temps écoulé t', tStr], ['Longueur de diffusion √(Kt)', `${sci(Math.sqrt(Kd * t), 3)} m`], ['Pas de temps stable dt = 0,45 dx²/K', `${sci(dt, 3)} s`]]));
      out.appendChild(el('p', { class: 'w-note' }, 'Le cuivre (K ≈ 10⁻⁴ m²/s) homogénéise une barre de 10 cm en quelques dizaines de secondes ; le bois ou le verre (K ≈ 10⁻⁷ m²/s) mettent des heures : le temps caractéristique est L²/K. Avec les extrémités maintenues, le profil tend vers la droite du régime permanent (flux uniforme, loi de Fourier).'));
    }
    function loop() { if (!running) return; const s = parseInt(speed.input.value, 10); for (let i = 0; i < s; i++) step(); draw(); raf = requestAnimationFrame(loop); }
    play.addEventListener('click', () => { running = !running; play.textContent = running ? 'Pause' : 'Lancer'; if (running) loop(); else if (raf) cancelAnimationFrame(raf); });
    reset.addEventListener('click', () => { running = false; play.textContent = 'Lancer'; if (raf) cancelAnimationFrame(raf); init(); });
    [mat.input, ic.input].forEach(i => i.addEventListener('change', () => { running = false; play.textContent = 'Lancer'; init(); }));
    L.input.addEventListener('input', () => { running = false; play.textContent = 'Lancer'; init(); });
    init(); window.addEventListener('resize', draw); document.addEventListener('themechange', draw);
  }

  /* ===================== Cours 5 : simulateur de cycle moteur ===================== */
  function widgetEngineCycle(c) {
    header(c, 'Simulateur de cycle moteur (1 mol de gaz parfait)',
      'Choisissez un cycle et ses paramètres : le simulateur calcule chaque état, le bilan ΔQ, ΔW, ΔE, ΔS de chaque étape (table 13.1) et trace les diagrammes p-V et T-S. L’aire intérieure du p-V est le travail net, celle du T-S la chaleur nette, et les deux sont égales.');
    const cycle = selIn('Cycle', [['carnot', 'Carnot : isotherme, adiabatique, isotherme, adiabatique'], ['otto', 'Moteur à piston / Otto : isochore, adiabatique, isochore, adiabatique'], ['brayton', 'Turbine à gaz : isobare, adiabatique, isobare, adiabatique'], ['ex34', 'Chap. 13, ex. 34 : isobare, adiabatique, isochore, isotherme'], ['rect', 'Chap. 13, ex. 14 : rectangle isobare / isochore']], 'carnot');
    const nu = selIn('ν (ddl par molécule)', [['3', '3 (γ = 1,67)'], ['5', '5 (γ = 1,4)'], ['6', '6 (γ = 1,33)'], ['7', '7 (γ = 1,29)']], '5');
    const Th = numIn('T<sub>h</sub> (K)', 600, { min: 1, step: 'any' });
    const Tc = numIn('T<sub>c</sub> (K)', 400, { min: 1, step: 'any' });
    const V1 = numIn('V<sub>1</sub> (L)', 1, { min: 0.01, step: 'any' });
    const rV = numIn('Rapport de volumes V<sub>2</sub>/V<sub>1</sub> (isotherme à T_h)', 2, { min: 1.01, step: 'any' });
    const Tadm = numIn('T d’admission (K)', 300, { min: 1, step: 'any' });
    const rc = numIn('Taux de compression V<sub>max</sub>/V<sub>min</sub>', 8, { min: 1.1, step: 'any' });
    const Qin = numIn('Chaleur fournie par cycle Q<sub>h</sub> (J)', 15000, { min: 1, step: 'any' });
    const p1 = numIn('p<sub>1</sub> (kPa)', 100, { min: 0.1, step: 'any' });
    const rp = numIn('Rapport de pressions p<sub>max</sub>/p<sub>min</sub>', 8, { min: 1.1, step: 'any' });
    const T1 = numIn('T<sub>1</sub> (K)', 300, { min: 1, step: 'any' });
    const T2 = numIn('T<sub>2</sub> (K)', 600, { min: 1, step: 'any' });
    const T3 = numIn('T<sub>3</sub> (K)', 400, { min: 1, step: 'any' });
    const vis = { carnot: [Th, Tc, V1, rV], otto: [Tadm, rc, V1, Qin], brayton: [Tadm, p1, rp, Qin], ex34: [T1, T2, T3, p1], rect: [T1, p1] };
    const all = [Th, Tc, V1, rV, Tadm, rc, Qin, p1, rp, T1, T2, T3];
    const controls = el('div', { class: 'controls' }, [cycle.lab, nu.lab]); all.forEach(x => controls.appendChild(x.lab));
    const cPV = el('canvas', { class: 'plot' }), cTS = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(controls, el('div', { class: 'two-col' }, [cPV, cTS]), out);

    function build() {
      const nuv = parseFloat(nu.input.value), Cv = nuv / 2 * R, Cp = Cv + R, g = Cp / Cv;
      const stages = []; let s;
      const iso = (st, Vb) => { const T = st.T, dS = R * Math.log(Vb / st.V), Q = R * T * Math.log(Vb / st.V); const pts = []; for (let i = 0; i <= 40; i++) { const V = st.V + (Vb - st.V) * i / 40; pts.push({ V, p: R * T / V, T, S: st.S + R * Math.log(V / st.V) }); } return { type: 'isotherme', Q, W: Q, dE: 0, dS, end: pts[40], pts }; };
      const adia = (st, Vb) => { const pts = []; for (let i = 0; i <= 40; i++) { const V = st.V + (Vb - st.V) * i / 40; pts.push({ V, p: st.p * Math.pow(st.V / V, g), T: st.T * Math.pow(st.V / V, g - 1), S: st.S }); } const dE = Cv * (pts[40].T - st.T); return { type: 'adiabatique', Q: 0, W: -dE, dE, dS: 0, end: pts[40], pts }; };
      const isoc = (st, Tb) => { const pts = []; for (let i = 0; i <= 40; i++) { const T = st.T + (Tb - st.T) * i / 40; pts.push({ V: st.V, p: R * T / st.V, T, S: st.S + Cv * Math.log(T / st.T) }); } const Q = Cv * (Tb - st.T); return { type: 'isochore', Q, W: 0, dE: Q, dS: Cv * Math.log(Tb / st.T), end: pts[40], pts }; };
      const isob = (st, Vb) => { const pts = []; for (let i = 0; i <= 40; i++) { const V = st.V + (Vb - st.V) * i / 40; const T = st.p * V / R; pts.push({ V, p: st.p, T, S: st.S + Cp * Math.log(T / st.T) }); } const Tb = pts[40].T; return { type: 'isobare', Q: Cp * (Tb - st.T), W: st.p * (Vb - st.V), dE: Cv * (Tb - st.T), dS: Cp * Math.log(Tb / st.T), end: pts[40], pts }; };
      let warn = '';
      const cy = cycle.input.value;
      if (cy === 'carnot') {
        const th = val(Th.input), tc = val(Tc.input), v1 = val(V1.input) / 1000, r = val(rV.input);
        if (tc >= th) warn = 'T_c doit être inférieure à T_h.';
        s = { V: v1, T: th, p: R * th / v1, S: 0 };
        const V2 = r * v1, V3 = V2 * Math.pow(th / tc, 1 / (g - 1)), V4 = v1 * Math.pow(th / tc, 1 / (g - 1));
        let st = s; [[iso, V2], [adia, V3], [iso, V4], [adia, v1]].forEach(([f, x]) => { const sg = f(st, x); stages.push(sg); st = sg.end; });
      } else if (cy === 'otto') {
        const ta = val(Tadm.input), r = val(rc.input), vmax = val(V1.input) / 1000, q = val(Qin.input);
        const vmin = vmax / r, TA = ta * Math.pow(r, g - 1);
        s = { V: vmin, T: TA, p: R * TA / vmin, S: 0 };
        let st = s; const TB = TA + q / Cv;
        [[isoc, TB], [adia, vmax], [isoc, ta], [adia, vmin]].forEach(([f, x]) => { const sg = f(st, x); stages.push(sg); st = sg.end; });
      } else if (cy === 'brayton') {
        const ta = val(Tadm.input), pl = val(p1.input) * 1000, r = val(rp.input), q = val(Qin.input);
        const ph = pl * r, TA = ta * Math.pow(r, (g - 1) / g);
        s = { V: R * TA / ph, T: TA, p: ph, S: 0 };
        let st = s; const TB = TA + q / Cp, VB = R * TB / ph, TC = TB * Math.pow(1 / r, (g - 1) / g), VC = R * TC / pl, VD = R * ta / pl;
        [[isob, VB], [adia, VC], [isob, VD], [adia, s.V]].forEach(([f, x]) => { const sg = f(st, x); stages.push(sg); st = sg.end; });
      } else if (cy === 'ex34') {
        const t1 = val(T1.input), t2 = val(T2.input), t3 = val(T3.input), pp = val(p1.input) * 1000;
        if (!(t2 > t3 && t3 > t1)) warn = 'Il faut T_2 > T_3 > T_1 pour que le cycle soit possible (détente adiabatique de T_2 à T_3, puis refroidissement isochore jusqu’à T_1).';
        s = { V: R * t1 / pp, T: t1, p: pp, S: 0 };
        let st = s; const V2 = s.V * t2 / t1, V3 = V2 * Math.pow(t2 / t3, 1 / (g - 1));
        [[isob, V2], [adia, V3], [isoc, t1], [iso, s.V]].forEach(([f, x]) => { const sg = f(st, x); stages.push(sg); st = sg.end; });
      } else {
        const t1 = val(T1.input), pp = val(p1.input) * 1000;
        s = { V: R * t1 / pp, T: t1, p: pp, S: 0 };
        let st = s;
        const sg1 = isob(st, 2 * s.V); stages.push(sg1); st = sg1.end;
        const sg2 = isoc(st, st.T / 2); stages.push(sg2); st = sg2.end;
        const sg3 = isob(st, s.V); stages.push(sg3); st = sg3.end;
        const sg4 = isoc(st, t1); stages.push(sg4);
      }
      return { stages, start: s, g, Cv, Cp, warn };
    }
    function update() {
      const cy = cycle.input.value;
      all.forEach(x => x.lab.style.display = vis[cy].includes(x) ? '' : 'none');
      const { stages, start, g, warn } = build();
      const Wnet = stages.reduce((a, x) => a + x.W, 0), Qin_ = stages.reduce((a, x) => a + (x.Q > 0 ? x.Q : 0), 0), Qout = stages.reduce((a, x) => a + (x.Q < 0 ? -x.Q : 0), 0);
      const temps = stages.flatMap(x => x.pts.map(p => p.T)); const Tmax = Math.max(...temps), Tmin = Math.min(...temps);
      const e = Qin_ > 0 ? Wnet / Qin_ : 0, eC = 1 - Tmin / Tmax;
      // p-V
      const allPts = stages.flatMap(x => x.pts);
      const drawPlot = (canvas, xk, yk, xl, yl, xs, ys) => {
        const { ctx, w, h } = setupCanvas(canvas, 280);
        const xv = allPts.map(p => p[xk] * xs), yv = allPts.map(p => p[yk] * ys);
        const xmin = Math.min(...xv), xmax = Math.max(...xv), ymin = Math.min(...yv), ymax = Math.max(...yv);
        const px = (xmax - xmin) * 0.1 || 1, py = (ymax - ymin) * 0.1 || 1;
        const box = { x0: 60, y0: 12, x1: w - 12, y1: h - 42 };
        const { sx, sy } = drawAxes(ctx, box, [xmin - px, xmax + px], [Math.max(0, ymin - py), ymax + py], { nx: 5, ny: 5, xfmt: v => fr(v, 2), yfmt: v => fr(v, 0), xlabel: xl, ylabel: yl });
        stages.forEach((st, i) => {
          polyline(ctx, st.pts.map(p => [p[xk] * xs, p[yk] * ys]), sx, sy, PALETTE[i], 2.5);
          const mid = st.pts[20]; ctx.fillStyle = PALETTE[i]; ctx.beginPath(); ctx.arc(sx(mid[xk] * xs), sy(mid[yk] * ys), 9, 0, 2 * Math.PI); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), sx(mid[xk] * xs), sy(mid[yk] * ys));
        });
        ctx.fillStyle = cssVar('--text'); ctx.beginPath(); ctx.arc(sx(start[xk] * xs), sy(start[yk] * ys), 4, 0, 2 * Math.PI); ctx.fill();
      };
      drawPlot(cPV, 'V', 'p', 'V (L)', 'p (kPa)', 1000, 1e-3);
      drawPlot(cTS, 'S', 'T', 'S − S₁ (J/K)', 'T (K)', 1, 1);
      out.innerHTML = '';
      if (warn) out.appendChild(el('p', { class: 'w-note' }, 'Attention : ' + warn));
      out.appendChild(table(['Étape', 'Type', 'État final (p kPa ; V L ; T K)', 'ΔQ reçue (J)', 'ΔW fourni (J)', 'ΔE (J)', 'ΔS (J/K)'], stages.map((st, i) => [String(i + 1), st.type, `${fr(st.end.p / 1000, 1)} ; ${fr(st.end.V * 1000, 3)} ; ${fr(st.end.T, 1)}`, fr(st.Q, 1), fr(st.W, 1), fr(st.dE, 1), fr(st.dS, 3)])));
      out.appendChild(readout([['W_net = Σ ΔW (aire du p-V)', `${fr(Wnet, 1)} J`], ['Q_h = Σ ΔQ > 0', `${fr(Qin_, 1)} J`], ['Q_c = Σ |ΔQ < 0|', `${fr(Qout, 1)} J`], ['Vérification Q_h − Q_c = W_net', `${fr(Qin_ - Qout, 1)} J`], ['Rendement e = W_net/Q_h', fr(e, 3)], ['Carnot entre T_max et T_min : 1 − T_min/T_max', fr(eC, 3)], ['γ = (ν+2)/ν', fr(g, 3)]]));
      out.appendChild(el('p', { class: 'w-note' }, 'Σ ΔE = 0 et Σ ΔS = 0 sur un cycle complet (fonctions d’état). Seul le cycle de Carnot atteint le rendement 1 − T_c/T_h ; pour Otto le rendement ne dépend que du taux de compression : e = 1 − (V_max/V_min)^(1−γ).'));
    }
    cycle.input.addEventListener('change', update); nu.input.addEventListener('change', update);
    all.forEach(x => x.input.addEventListener('input', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Cours 5 : rendements ===================== */
  function widgetEfficiency(c) {
    header(c, 'Rendements et coefficients de performance',
      'Comparez le rendement de Carnot, celui du cycle d’Otto (fonction du taux de compression) et les coefficients de performance d’un réfrigérateur et d’une pompe à chaleur idéaux.');
    const Th = numIn('T<sub>h</sub> (K)', 1100, { min: 1, step: 'any' });
    const Tc = numIn('T<sub>c</sub> (K)', 570, { min: 1, step: 'any' });
    const rc = rangeInput('Taux de compression V_max/V_min', 8, 1.5, 25, 0.5, v => fr(v, 1));
    const nu = selIn('ν (ddl par molécule)', [['3', '3'], ['5', '5 (air)'], ['6', '6'], ['7', '7']], '5');
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [Th.lab, Tc.lab, rc.lab, nu.lab]), canvas, out);
    function update() {
      const th = val(Th.input), tc = val(Tc.input), r = val(rc.input), g = (parseFloat(nu.input.value) + 2) / parseFloat(nu.input.value);
      const eC = 1 - tc / th, eO = 1 - Math.pow(r, 1 - g);
      const { ctx, w, h } = setupCanvas(canvas, 240);
      const box = { x0: 52, y0: 12, x1: w - 12, y1: h - 42 };
      const { sx, sy } = drawAxes(ctx, box, [1, 25], [0, 1], { nx: 6, ny: 5, xfmt: v => fr(v, 0), yfmt: v => fr(v, 1), xlabel: 'taux de compression V_max/V_min', ylabel: 'rendement d’Otto' });
      [['3', PALETTE[2]], ['5', PALETTE[0]], ['7', PALETTE[3]]].forEach(([nn, col]) => { const gg = (parseFloat(nn) + 2) / parseFloat(nn); const pts = []; for (let i = 0; i <= 100; i++) { const x = 1 + 24 * i / 100; pts.push([x, 1 - Math.pow(x, 1 - gg)]); } polyline(ctx, pts, sx, sy, col, nn === nu.input.value ? 3 : 1.5); ctx.fillStyle = col; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('ν = ' + nn, sx(25) - 40, sy(1 - Math.pow(25, 1 - gg)) - 6); });
      ctx.fillStyle = cssVar('--bad'); ctx.beginPath(); ctx.arc(sx(r), sy(eO), 5, 0, 2 * Math.PI); ctx.fill();
      out.innerHTML = '';
      out.appendChild(readout([['Carnot : e = 1 − T_c/T_h', fr(eC, 3)], ['Otto : e = 1 − (V_max/V_min)^(1−γ)', fr(eO, 3)], ['γ', fr(g, 3)], ['Réfrigérateur idéal : COP = Q_c/W = T_c/(T_h − T_c)', fr(tc / (th - tc), 2)], ['Pompe à chaleur idéale : Q_h/W = T_h/(T_h − T_c)', fr(th / (th - tc), 2)], ['T_c/T_h', fr(tc / th, 3)]]));
      out.appendChild(el('p', { class: 'w-note' }, 'Valeurs par défaut : moto du chapitre 13 (ex. 44 et 45) : allumage à 1100 K, échappement à 570 K → Carnot 0,48 ; rendement réel 0,21. Un moteur à essence typique (r = 8, γ = 1,4) a un rendement théorique d’Otto de 0,56 et réel de 0,15 à 0,20 ; le diesel (r plus élevé) atteint 0,35 à 0,40.'));
    }
    [Th.input, Tc.input, rc.input].forEach(i => i.addEventListener('input', update)); nu.input.addEventListener('change', update);
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Cours 6 : coefficient de convection, convection vs rayonnement ===================== */
  function hCoef(fluid, type, regime, Ts, Tinf, L, V) {
    const dT = Math.max(Ts - Tinf, 0);
    if (type === 'naturelle') {
      if (fluid === 'air') return regime === 'laminaire' ? 1.4 * Math.pow(dT / L, 0.25) : 1.1 * Math.pow(dT, 1 / 3);
      return regime === 'laminaire' ? 43.7 * Math.pow(dT / L, 0.25) : 51.6 * Math.pow(dT, 1 / 3);
    }
    return regime === 'laminaire' ? 3.9 * Math.sqrt(V / L) : 5.5 * Math.pow(Math.pow(V, 4) / L, 0.2);
  }
  function widgetConvection(c) {
    header(c, 'Coefficient de convection h et comparaison des modes de transfert',
      'Les corrélations du cours donnent h selon le fluide, le type de convection (naturelle ou forcée) et le régime (laminaire ou turbulent). On en déduit R<sub>conv</sub> = 1/(hA) et Q̇<sub>conv</sub> = hA(T<sub>s</sub> − T<sub>∞</sub>), que l’on compare au rayonnement Q̇<sub>rad</sub> = εσA(T<sub>s</sub>⁴ − T<sub>∞</sub>⁴).');
    const fluid = selIn('Fluide', [['air', 'air'], ['eau', 'eau (convection naturelle seulement)']], 'air');
    const type = selIn('Type de convection', [['forcee', 'forcée (ventilateur, pompe, vent)'], ['naturelle', 'naturelle (poussée d’Archimède)']], 'forcee');
    const regime = selIn('Régime', [['laminaire', 'laminaire'], ['turbulent', 'turbulent']], 'laminaire');
    const Ts = numIn('T<sub>s</sub> surface (°C)', 45, { step: 'any' });
    const Tinf = numIn('T<sub>∞</sub> fluide (°C)', 25, { step: 'any' });
    const L = numIn('Longueur caractéristique L (m)', 0.1, { min: 0.0001, step: 'any' });
    const V = numIn('Vitesse V<sub>∞</sub> (m/s)', 10, { min: 0, step: 'any' });
    const A = numIn('Aire d’échange A (m²)', 0.01, { min: 0.000001, step: 'any' });
    const eps = numIn('Émissivité ε (rayonnement)', 0.9, { min: 0, max: 1, step: 'any' });
    const nuk = numIn('Viscosité cinématique du fluide (m²/s)', 1.5e-5, { min: 1e-9, step: 'any' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [fluid.lab, type.lab, regime.lab, Ts.lab, Tinf.lab, L.lab, V.lab, A.lab, eps.lab, nuk.lab]), out);
    function update() {
      const f = fluid.input.value, ty = type.input.value, rg = regime.input.value;
      V.lab.style.display = ty === 'forcee' ? '' : 'none';
      out.innerHTML = '';
      if (f === 'eau' && ty === 'forcee') { out.appendChild(el('p', { class: 'w-note' }, 'Le cours ne donne pas de corrélation pour la convection forcée dans l’eau : choisissez l’air, ou la convection naturelle.')); return; }
      const ts = val(Ts.input), ti = val(Tinf.input), Lv = val(L.input), Vv = val(V.input), Av = val(A.input), e = val(eps.input);
      const hh = hCoef(f, ty, rg, ts, ti, Lv, Vv);
      const Qc = hh * Av * (ts - ti), Qr = e * SIGMA * Av * (Math.pow(C2K(ts), 4) - Math.pow(C2K(ti), 4));
      const Re = ty === 'forcee' ? Vv * Lv / val(nuk.input) : null;
      const items = [['h', `${fr(hh, 2)} W/(m² K)`], ['R_conv = 1/(hA)', `${sci(1 / (hh * Av), 3)} K/W`], ['Q̇_conv = hA(T_s − T_∞)', `${fr(Qc, 2)} W`], ['Q̇_rad = εσA(T_s⁴ − T_∞⁴)', `${fr(Qr, 2)} W`], ['Q̇_rad / Q̇_conv', fr(Qr / Qc, 2)]];
      if (Re !== null) items.push(['Nombre de Reynolds Re = V L/ν', sci(Re, 3)], ['Régime selon le cours', Re < 100 ? 'laminaire (Re < 100)' : Re > 2000 ? 'turbulent (Re > 2000)' : 'zone de transition']);
      out.appendChild(readout(items));
      out.appendChild(el('p', { class: 'w-note' }, 'Valeurs par défaut : exercice 3 du cours 6 (puce de 10 cm, 45 °C, air à 25 °C soufflé à 10 m/s en régime laminaire) : h = 3,9 √(10/0,1) = 39 W/(m² K) et Q̇ = 7,8 W. Le rayonnement reste du même ordre que la convection naturelle, mais devient négligeable dès qu’un ventilateur souffle.'));
    }
    [fluid.input, type.input, regime.input].forEach(i => i.addEventListener('change', update));
    [Ts.input, Tinf.input, L.input, V.input, A.input, eps.input, nuk.input].forEach(i => i.addEventListener('input', update));
    update();
  }

  /* ===================== Cours 6 : plaquette de circuit imprimé refroidie des deux côtés ===================== */
  function widgetPcbNetwork(c) {
    header(c, 'Circuit imprimé chauffé sur le dessus et refroidi des deux côtés',
      'Les composants dissipent Q̇ sur la face du dessus. La chaleur part soit directement dans l’air du dessus (R<sub>conv,1</sub>), soit à travers les couches cuivre/époxy puis dans l’air du dessous (R<sub>cond</sub> + R<sub>conv,2</sub>). Les deux chemins sont en parallèle entre T<sub>dessus</sub> et T<sub>∞</sub>.');
    const Q = numIn('Puissance dissipée Q̇ (W)', 20, { min: 0, step: 'any' });
    const side = numIn('Côté de la plaquette carrée (m)', 0.1, { min: 0.001, step: 'any' });
    const Tinf = numIn('T<sub>∞</sub> (°C)', 25, { step: 'any' });
    const Vt = numIn('Vitesse de l’air dessus (m/s)', 5, { min: 0, step: 'any' });
    const regT = selIn('Régime dessus', [['turbulent', 'turbulent'], ['laminaire', 'laminaire']], 'turbulent');
    const Vb = numIn('Vitesse de l’air dessous (m/s)', 3, { min: 0, step: 'any' });
    const regB = selIn('Régime dessous', [['laminaire', 'laminaire'], ['turbulent', 'turbulent']], 'laminaire');
    const ncu = numIn('Nombre de couches de cuivre', 3, { min: 0, step: 1 });
    const tcu = numIn('Épaisseur d’une couche de cuivre (mm)', 0.07, { min: 0, step: 'any' });
    const ttot = numIn('Épaisseur totale de la plaquette (mm)', 2, { min: 0.01, step: 'any' });
    const kcu = numIn('k cuivre (W/(m K))', 390, { min: 0.01, step: 'any' });
    const kep = numIn('k époxy (W/(m K))', 0.35, { min: 0.01, step: 'any' });
    const canvas = el('canvas', { class: 'plot' });
    const out = el('div');
    c.append(el('div', { class: 'controls' }, [Q.lab, side.lab, Tinf.lab, Vt.lab, regT.lab, Vb.lab, regB.lab, ncu.lab, tcu.lab, ttot.lab, kcu.lab, kep.lab]), canvas, out);
    function update() {
      const q = val(Q.input), Lc = val(side.input), A = Lc * Lc, ti = val(Tinf.input), n = Math.max(0, Math.round(val(ncu.input)));
      const hT = hCoef('air', 'forcee', regT.input.value, 1, 0, Lc, val(Vt.input)), hB = hCoef('air', 'forcee', regB.input.value, 1, 0, Lc, val(Vb.input));
      const Rc1 = 1 / (hT * A), Rc2 = 1 / (hB * A);
      const tE = Math.max(val(ttot.input) - n * val(tcu.input), 0) / 1000, tC = n * val(tcu.input) / 1000;
      const Rcond = tC / (val(kcu.input) * A) + tE / (val(kep.input) * A);
      const Rbr = Rcond + Rc2, Req = Rc1 * Rbr / (Rc1 + Rbr);
      const Ttop = ti + q * Req, Q2 = (Ttop - ti) / Rbr, Q1 = q - Q2, Tbot = Ttop - Q2 * Rcond;
      // schéma
      const { ctx, w } = setupCanvas(canvas, 170);
      ctx.font = '12px sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = cssVar('--text'); ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5;
      const y = 85, x0 = 30, xT = w / 2, xEnd = w - 30;
      const resistor = (xa, xb, yy, label, color) => { ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(xa, yy); ctx.lineTo(xb, yy); ctx.stroke(); ctx.fillStyle = color; ctx.fillRect((xa + xb) / 2 - 36, yy - 9, 72, 18); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(label, (xa + xb) / 2, yy); };
      ctx.fillStyle = cssVar('--text'); ctx.textAlign = 'left'; ctx.fillText('T∞ (dessus)', x0, 22);
      resistor(x0, xT, 40, 'R conv,1', PALETTE[0]);
      ctx.strokeStyle = cssVar('--muted'); ctx.beginPath(); ctx.moveTo(x0, 40); ctx.lineTo(x0, 30); ctx.moveTo(xT, 40); ctx.lineTo(xT, 130); ctx.stroke();
      ctx.fillStyle = cssVar('--text'); ctx.textAlign = 'center'; ctx.fillText('T dessus = ' + fr(K2C(C2K(Ttop)), 1) + ' °C   (Q̇ injecté ici)', xT, y);
      resistor(xT, (xT + xEnd) / 2, 130, 'R cond', PALETTE[3]);
      resistor((xT + xEnd) / 2, xEnd, 130, 'R conv,2', PALETTE[2]);
      ctx.fillStyle = cssVar('--text'); ctx.textAlign = 'center'; ctx.fillText('T dessous = ' + fr(Tbot, 1) + ' °C', (xT + xEnd) / 2, 152);
      ctx.textAlign = 'right'; ctx.fillText('T∞ (dessous)', xEnd, 152);
      out.innerHTML = '';
      out.appendChild(readout([['h dessus', `${fr(hT, 1)} W/(m² K)`], ['h dessous', `${fr(hB, 1)} W/(m² K)`], ['R_conv,1 = 1/(h₁A)', `${fr(Rc1, 3)} K/W`], ['R_conv,2 = 1/(h₂A)', `${fr(Rc2, 3)} K/W`], ['R_cond (cuivre + époxy en série)', `${fr(Rcond, 4)} K/W`], ['R_eq = R_conv,1 ∥ (R_cond + R_conv,2)', `${fr(Req, 3)} K/W`], ['T_dessus = T_∞ + Q̇ R_eq', `${fr(Ttop, 1)} °C (${fr(C2K(Ttop), 1)} K)`], ['Q̇₂ par le dessous', `${fr(Q2, 2)} W`], ['Q̇₁ par le dessus', `${fr(Q1, 2)} W`], ['T_dessous = T_dessus − Q̇₂ R_cond', `${fr(Tbot, 1)} °C (${fr(C2K(Tbot), 1)} K)`]]));
      out.appendChild(el('p', { class: 'w-note' }, 'Valeurs par défaut : exercice de l’intra 2019 repris en classe (plaquette 10 cm × 10 cm, 20 W, trois couches de cuivre de 0,07 mm, époxy 0,35 W/(m K), air à 5 m/s turbulent dessus et 3 m/s laminaire dessous). Le cuivre est si conducteur que sa résistance est négligeable devant l’époxy, et l’époxy elle-même reste petite devant les convections : ce sont les films d’air qui fixent la température de la carte.'));
    }
    [Q.input, side.input, Tinf.input, Vt.input, Vb.input, ncu.input, tcu.input, ttot.input, kcu.input, kep.input].forEach(i => i.addEventListener('input', update));
    [regT.input, regB.input].forEach(i => i.addEventListener('change', update));
    update(); window.addEventListener('resize', update); document.addEventListener('themechange', update);
  }

  /* ===================== Enregistrement ===================== */
  Object.assign(window.ELE.widgets, {
    'thermal-contact': widgetThermalContact, 'entropy-calc': widgetEntropyCalc, 'process-explorer': widgetProcessExplorer,
    'thermal-resistance': widgetThermalResistance, 'heat-equation': widgetHeatEquation, 'engine-cycle': widgetEngineCycle,
    efficiency: widgetEfficiency, convection: widgetConvection, 'pcb-network': widgetPcbNetwork
  });
  if (window.ELE.initWidgets) window.ELE.initWidgets();
})();
