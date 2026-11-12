/* Générateurs d'exercices à choix de réponses (valeurs tirées au hasard, corrigé détaillé).
   HQ.gens[id] = { id, t: sujet, name, make(rng) -> { q, c: [4 choix], a: indice, e: corrigé, fig: fonction de dessin facultative }, w: poids dans les tests, test: false pour l'exclure des tests } */
(function () {
  'use strict';
  const HQ = window.HQ, NB = HQ.NBSP, fr = HQ.fr, sig = HQ.sig, eng = HQ.eng, sup = HQ.sup;
  const G = HQ.gens = {};
  const R3 = Math.sqrt(3), R2 = Math.SQRT2, PI2 = 2 * Math.PI;
  const clean = v => Number(Number(v).toPrecision(10));
  const u = (v, unit, n) => sig(v, n || 3) + NB + unit;
  const int = v => fr(v, 0);
  // étape en unité de base avant un résultat écrit avec « kilo » : « 9 006 W = » devant « 9,01 kW »
  const base = (x, unit) => (Math.abs(Number(Number(x).toPrecision(3))) >= 1000 ? int(x) + NB + unit + ' = ' : '');
  // montant en dollars, toujours avec deux décimales : 0,60 $ et non 0,6 $
  const money = v => { const c = Math.round(v * 100); return int(Math.floor(c / 100)) + ',' + String(c % 100).padStart(2, '0') + NB + '$'; };

  function def(id, t, name, make, opts) { G[id] = Object.assign({ id, t, name, make, w: 1 }, opts || {}); }

  // 4 choix à partir de valeurs numériques : la bonne, puis des erreurs typiques ; complète au besoin.
  function mcq(r, good, bads, fmt) {
    const seen = new Set(), out = [];
    const push = v => { if (!isFinite(v) || v < 0) return; const s = fmt(v); if (seen.has(s)) return; seen.add(s); out.push(s); };
    push(good);
    bads.forEach(v => { if (out.length < 4) push(v); });
    const extra = [10, 0.1, 2, 0.5, 1.5, 100, 0.01, 3, 0.25, 4, 0.75];
    for (let i = 0; out.length < 4 && i < extra.length; i++) push(good * extra[i]);
    for (let k = 1; out.length < 4; k++) push(good + k);
    const first = out[0], c = r.shuffle(out);
    return { c, a: c.indexOf(first) };
  }
  // 4 choix à partir de textes (le premier est le bon)
  function mcqS(r, list) {
    const uniq = []; list.forEach(s => { if (uniq.indexOf(s) < 0 && uniq.length < 4) uniq.push(s); });
    const c = r.shuffle(uniq); return { c, a: c.indexOf(uniq[0]) };
  }
  const item = (q, m, e, fig) => ({ q, c: m.c, a: m.a, e, fig: fig || null });

  /* ---------- schémas réutilisés ---------- */
  function figSerie(U, Rs) {
    return () => {
      const S = HQ.S(460, 190, 'Circuit série');
      S.comp('V', 50, 150, 50, 50, { label: fr(U, 1) + ' V', side: 'l' });
      const x0 = 80, x1 = 400, w = (x1 - x0) / Rs.length;
      S.wire([[50, 50], [x0, 50]]);
      Rs.forEach((R, i) => S.comp('R', x0 + i * w, 50, x0 + (i + 1) * w, 50, { label: 'R' + (i + 1), val: R + ' Ω' }));
      S.wire([[x1, 50], [420, 50], [420, 150], [50, 150]]);
      return S;
    };
  }
  function figParallele(U, Rs) {
    return () => {
      const S = HQ.S(470, 200, 'Circuit parallèle');
      S.comp('V', 50, 160, 50, 50, { label: U + ' V', side: 'l' });
      const xs = Rs.map((_, i) => 170 + i * 110);
      const last = xs[xs.length - 1];
      S.wire([[50, 50], [last, 50]]); S.wire([[50, 160], [last, 160]]);
      Rs.forEach((R, i) => {
        S.comp('R', xs[i], 50, xs[i], 160, { label: 'R' + (i + 1), val: R + ' Ω' });
        if (i < Rs.length - 1) { S.dot(xs[i], 50); S.dot(xs[i], 160); }
      });
      return S;
    };
  }
  function figMixte(U, R1, R2, R3v) {
    return () => {
      const S = HQ.S(470, 200, 'Circuit mixte : R1 en série avec R2 et R3 en parallèle');
      S.comp('V', 50, 160, 50, 50, { label: U + ' V', side: 'l' });
      S.wire([[50, 50], [90, 50]]);
      S.comp('R', 90, 50, 210, 50, { label: 'R1', val: R1 + ' Ω' });
      S.wire([[210, 50], [380, 50]]); S.dot(270, 50);
      S.comp('R', 270, 50, 270, 160, { label: 'R2', val: R2 + ' Ω' });
      S.comp('R', 380, 50, 380, 160, { label: 'R3', val: R3v + ' Ω' });
      S.wire([[380, 160], [50, 160]]); S.dot(270, 160);
      return S;
    };
  }

  /* ======================= Unités et préfixes ======================= */
  const PFX = { M: 6, k: 3, '': 0, m: -3, 'µ': -6 };
  const PNAME = { M: 'méga', k: 'kilo', '': 'l’unité de base', m: 'milli', 'µ': 'micro' };
  def('conv-prefixe', 'unites', 'Convertir entre préfixes', r => {
    const cases = [['m', '', 'A'], ['', 'm', 'A'], ['k', '', 'Ω'], ['', 'k', 'Ω'], ['M', 'k', 'Ω'], ['M', '', 'Ω'], ['k', '', 'V'], ['', 'k', 'V'], ['', 'k', 'W'], ['k', '', 'W'], ['µ', 'm', 'A'], ['m', 'µ', 'A'], ['m', '', 'V'], ['k', 'M', 'W'], ['M', 'k', 'W'], ['k', 'M', 'Ω']];
    const cs = r.pick(cases), p1 = cs[0], p2 = cs[1], unit = cs[2];
    const v = r.pick([1.2, 2.5, 4.7, 15, 33, 47, 120, 250, 680, 0.5, 0.75, 3.3, 6.8, 22, 150, 8.2, 56]);
    const shift = PFX[p1] - PFX[p2];
    const res = clean(v * Math.pow(10, shift));
    const f = x => fr(clean(x), 9) + NB + p2 + unit;
    const m = mcq(r, res, [res * 1000, res / 1000, res * 1e6, res / 1e6, res * 10], f);
    const steps = Math.abs(shift) / 3;
    return item(`Convertis ${fr(v, 3)}${NB}${p1}${unit} en ${p2}${unit}.`, m,
      `De ${PNAME[p1]} (10${sup(PFX[p1])}) à ${PNAME[p2]} (10${sup(PFX[p2])}) : ${steps} marche${steps > 1 ? 's' : ''} de 1 000. Comme on va vers une unité plus ${shift > 0 ? 'petite, le nombre grossit : on multiplie' : 'grande, le nombre rapetisse : on divise'} par ${int(Math.pow(10, Math.abs(shift)))}. Résultat : <strong>${f(res)}</strong>.`);
  }, { w: 3 });

  def('ohm-prefixe', 'unites', 'Loi d’Ohm avec des préfixes', r => {
    const k = r.int(0, 2);
    if (k === 0) {
      const U = r.pick([5, 12, 24, 48, 120, 240, 600]), p = r.pick(['k', 'k', 'M']), Rv = r.pick([1.2, 2.2, 4.7, 10, 15, 22, 47, 100]);
      const Ro = Rv * Math.pow(10, PFX[p]), I = U / Ro, f = x => eng(x, 'A');
      return item(`Une tension de ${U}${NB}V est appliquée à une résistance de ${fr(Rv, 2)}${NB}${p}Ω. Quel est le courant ?`, mcq(r, I, [I * 1000, I / 1000, U * Rv, Rv / U], f),
        `On convertit d'abord : ${fr(Rv, 2)}${NB}${p}Ω = ${int(Ro)}${NB}Ω. Puis I = U ÷ R = ${U} ÷ ${int(Ro)} = ${sig(I, 3)}${NB}A = <strong>${f(I)}</strong>. Raccourci : des volts divisés par des ${p === 'k' ? 'kilohms donnent des milliampères' : 'mégohms donnent des microampères'}.`);
    }
    if (k === 1) {
      const Iv = r.pick([2, 5, 10, 20, 25, 40, 50]), Rv = r.pick([1, 1.5, 2.2, 3.3, 4.7, 10]), U = Iv * Rv, f = x => u(x, 'V');
      return item(`Un courant de ${Iv}${NB}mA traverse une résistance de ${fr(Rv, 2)}${NB}kΩ. Quelle est la tension à ses bornes ?`, mcq(r, U, [U * 1000, U / 1000, Iv / Rv, U * 10], f),
        `${Iv}${NB}mA = ${fr(Iv / 1000, 4)}${NB}A et ${fr(Rv, 2)}${NB}kΩ = ${int(Rv * 1000)}${NB}Ω. U = R × I = ${int(Rv * 1000)} × ${fr(Iv / 1000, 4)} = <strong>${f(U)}</strong>. Raccourci : mA × kΩ = V.`);
    }
    const U = r.pick([5, 12, 24, 120]), Iv = r.pick([2, 4, 5, 8, 10, 20, 25, 50]), Rr = U / (Iv / 1000), f = x => eng(x, 'Ω');
    return item(`Sous ${U}${NB}V, un circuit laisse passer ${Iv}${NB}mA. Quelle est sa résistance ?`, mcq(r, Rr, [Rr / 1000, Rr * 1000, U * Iv, Iv / U], f),
      `${Iv}${NB}mA = ${fr(Iv / 1000, 4)}${NB}A. R = U ÷ I = ${U} ÷ ${fr(Iv / 1000, 4)} = ${base(Rr, 'Ω')}<strong>${f(Rr)}</strong>. Raccourci : des volts divisés par des milliampères donnent des kilohms.`);
  }, { w: 3 });

  def('sci-ecrire', 'unites', 'Écrire en notation scientifique', r => {
    const mant = r.pick([1.5, 2.2, 3.3, 4.7, 5.6, 6.8, 8.2, 9.1, 2.5, 7.5]), e = r.pick([-6, -5, -4, -3, -2, 3, 4, 5, 6]);
    const x = clean(mant * Math.pow(10, e));
    const f = ee => `${fr(mant, 2)}${NB}×${NB}10${sup(ee)}`;
    const m = mcqS(r, [f(e), f(-e), f(e + 1), f(e - 1)]);
    const n = Math.abs(e);
    return item(`Comment s'écrit ${fr(x, 9)} en notation scientifique ?`, m,
      `On déplace la virgule pour obtenir un seul chiffre, différent de zéro, devant elle : ${n} rang${n > 1 ? 's' : ''} vers la ${e > 0 ? 'gauche, donc un exposant positif' : 'droite, donc un exposant négatif'}. ${fr(x, 9)} = <strong>${f(e)}</strong>.`);
  });

  def('sci-calcul', 'unites', 'Calculer avec des puissances de 10', r => {
    const a = r.pick([2, 3, 4, 5, 6, 8]), b = r.pick([2, 3, 4, 5]), m = r.pick([-6, -3, 3, 6]), n = r.pick([-6, -3, 3, 6]);
    const f = x => HQ.sci(x, 2);
    const p = (c, e) => `(${c}${NB}×${NB}10${sup(e)})`;
    const sg = x => (x < 0 ? '(−' + (-x) + ')' : String(x)), ng = x => String(x).replace('-', '−');
    if (r() < 0.5) {
      const val = a * b * Math.pow(10, m + n);
      return item(`Calcule ${p(a, m)} × ${p(b, n)}.`, mcq(r, val, [a * b * Math.pow(10, m - n), (a + b) * Math.pow(10, m + n), a * b * Math.pow(10, m + n + 1)], f),
        `On multiplie les nombres : ${a} × ${b} = ${a * b}. On additionne les exposants : ${sg(m)} + ${sg(n)} = ${ng(m + n)}. Résultat : ${a * b < 10 ? '' : a * b + NB + '×' + NB + '10' + sup(m + n) + ' = '}<strong>${f(val)}</strong>.`);
    }
    const A = a * b, val = a * Math.pow(10, m - n);
    return item(`Calcule ${p(A, m)} ÷ ${p(b, n)}.`, mcq(r, val, [a * Math.pow(10, m + n), a * Math.pow(10, n - m), (A - b) * Math.pow(10, m - n)], f),
      `On divise les nombres : ${A} ÷ ${b} = ${a}. On soustrait les exposants : ${sg(m)} − ${sg(n)} = ${ng(m - n)}. Résultat : <strong>${f(val)}</strong>.`);
  });

  /* ======================= Électricité de base ======================= */
  const RL = [4, 6, 8, 10, 12, 15, 20, 24, 30, 40, 48, 60, 80, 100, 120, 240];
  const UL = [12, 24, 48, 120, 208, 240, 347, 600];
  def('ohm-i', 'base', 'Loi d’Ohm : trouver le courant', r => {
    // si la résistance tirée a la même valeur que la tension, on la divise par deux : sinon U ÷ R et R ÷ U donneraient tous deux 1
    const U = r.pick(UL), R0 = r.pick(RL), R = R0 === U ? R0 / 2 : R0, I = U / R, f = x => u(x, 'A');
    return item(`Une résistance de ${R}${NB}Ω est branchée sur une source de ${U}${NB}V. Quel courant la traverse ?`, mcq(r, I, [R / U, U * R, Math.abs(U - R), U + R], f),
      `I = U ÷ R = ${U} ÷ ${R} = <strong>${f(I)}</strong>.`);
  });
  def('ohm-u', 'base', 'Loi d’Ohm : trouver la tension', r => {
    const I = r.pick([0.5, 1.5, 2, 2.5, 4, 5, 8, 10, 12, 15]), R = r.pick(RL), U = R * I, f = x => u(x, 'V');
    return item(`Un courant de ${fr(I, 1)}${NB}A traverse une résistance de ${R}${NB}Ω. Quelle est la tension à ses bornes ?`, mcq(r, U, [R / I, I / R, R + I, U / 2], f),
      `U = R × I = ${R} × ${fr(I, 1)} = <strong>${f(U)}</strong>.`);
  });
  def('ohm-r', 'base', 'Loi d’Ohm : trouver la résistance', r => {
    const U = r.pick(UL), I0 = r.pick([0.5, 1.5, 2, 2.5, 4, 5, 8, 10, 12, 15]), I = I0 === U ? I0 / 2 : I0, R = U / I, f = x => u(x, 'Ω');
    return item(`Sous ${U}${NB}V, une charge laisse passer ${fr(I, 1)}${NB}A. Quelle est sa résistance ?`, mcq(r, R, [I / U, U * I, Math.abs(U - I), U + I], f),
      `R = U ÷ I = ${U} ÷ ${fr(I, 1)} = <strong>${f(R)}</strong>.`);
  });
  def('ohm-effet', 'base', 'Loi d’Ohm : effet d’un changement', r => {
    const pair = r.pick([[120, 240], [240, 120], [120, 60], [100, 150], [200, 50], [120, 360]]), U1 = pair[0], U2 = pair[1];
    const I1 = r.pick([2, 3, 4, 6, 8, 10]), I2 = I1 * U2 / U1, f = x => u(x, 'A');
    return item(`Une résistance fixe laisse passer ${I1}${NB}A sous ${U1}${NB}V. Quel courant la traverse si la tension passe à ${U2}${NB}V ?`, mcq(r, I2, [I1 * U1 / U2, I1, I1 * (U2 / U1) * (U2 / U1)], f),
      `Pour une résistance fixe, le courant est proportionnel à la tension. La tension est multipliée par ${fr(U2 / U1, 2)}, le courant aussi : ${I1} × ${fr(U2 / U1, 2)} = <strong>${f(I2)}</strong>. (La résistance vaut ${u(U1 / I1, 'Ω')}.)`);
  });

  /* ======================= Calculs électriques ======================= */
  const PL = [600, 750, 1000, 1200, 1500, 2000, 3000, 4500, 5000];
  def('puissance', 'calculs', 'Puissance : P = U × I, R × I², U² ÷ R', r => {
    const k = r.int(0, 4);
    if (k === 0) {
      const U = r.pick([120, 208, 240, 600]), I = r.pick([2, 5, 8, 10, 12.5, 15, 20]), P = U * I, f = x => eng(x, 'W');
      return item(`Un appareil branché sur ${U}${NB}V tire ${fr(I, 1)}${NB}A. Quelle est sa puissance ?`, mcq(r, P, [U / I, U + I, P * I, P / 2], f), `P = U × I = ${U} × ${fr(I, 1)} = ${base(P, 'W')}<strong>${f(P)}</strong>.`);
    }
    if (k === 1) {
      const R = r.pick([5, 8, 10, 12, 20, 25, 50]), I = r.pick([2, 3, 4, 5, 10]), P = R * I * I, f = x => eng(x, 'W');
      return item(`Quelle puissance dissipe une résistance de ${R}${NB}Ω traversée par ${I}${NB}A ?`, mcq(r, P, [R * I, R * R * I, R / I, 2 * R * I], f), `P = R × I² = ${R} × ${I}² = ${R} × ${I * I} = ${base(P, 'W')}<strong>${f(P)}</strong>.`);
    }
    if (k === 2) {
      const U = r.pick([120, 240, 208, 600]), R = r.pick([10, 12, 16, 20, 24, 30, 48, 60]), P = U * U / R, f = x => eng(x, 'W');
      return item(`Une résistance de ${R}${NB}Ω est branchée sur ${U}${NB}V. Quelle puissance dissipe-t-elle ?`, mcq(r, P, [U / R, U * R, U * U * R, R / U], f), `P = U² ÷ R = ${U}² ÷ ${R} = ${int(U * U)} ÷ ${R} = ${base(P, 'W')}<strong>${f(P)}</strong>.`);
    }
    const P = r.pick(PL), U = r.pick([120, 240, 208, 600]);
    if (k === 3) {
      const I = P / U, f = x => u(x, 'A');
      return item(`Un appareil de ${int(P)}${NB}W est branché sur ${U}${NB}V. Quel courant tire-t-il ?`, mcq(r, I, [U / P, P * U, P / (U * U), I * 2], f), `I = P ÷ U = ${int(P)} ÷ ${U} = <strong>${f(I)}</strong>.`);
    }
    const R = U * U / P, f = x => u(x, 'Ω');
    return item(`Un élément chauffant de ${int(P)}${NB}W fonctionne sous ${U}${NB}V. Quelle est sa résistance ?`, mcq(r, R, [P / U, U / P, P / (U * U), R * 2], f), `R = U² ÷ P = ${U}² ÷ ${int(P)} = ${int(U * U)} ÷ ${int(P)} = <strong>${f(R)}</strong>. (${u(P / U, 'A')} serait le courant, pas la résistance.)`);
  }, { w: 2 });

  def('energie', 'calculs', 'Énergie en kWh et coût', r => {
    const P = r.pick([60, 100, 500, 750, 1000, 1500, 2000, 3000, 4500]), mins = r() < 0.3;
    const t = mins ? r.pick([15, 30, 45, 90]) : r.pick([2, 3, 5, 8, 10, 12, 24]);
    const h = mins ? t / 60 : t, E = P / 1000 * h;
    const dur = mins ? `${t}${NB}minutes` : `${t}${NB}heures`;
    const calc = `${int(P)}${NB}W = ${fr(P / 1000, 3)}${NB}kW${mins ? ` et ${t}${NB}min = ${fr(h, 2)}${NB}h` : ''}. E = P × t = ${fr(P / 1000, 3)} × ${fr(h, 2)}`;
    if (r() < 0.6) {
      const f = x => u(x, 'kWh');
      return item(`Un appareil de ${int(P)}${NB}W fonctionne pendant ${dur}. Quelle énergie consomme-t-il ?`, mcq(r, E, [P * h, mins ? P / 1000 * t : E / 10, P / 1000 / h, E * 10], f), `${calc} = <strong>${f(E)}</strong>.`);
    }
    // Question de coût : valeurs ramenées à un nombre pair d'heures et à 500 W au moins, pour que le coût tombe juste au cent près
    // (60 W pendant 15 minutes coûterait 0,0015 $, qui s'afficherait « 0 $ »). Aucun tirage supplémentaire : les tests fixes ne changent pas.
    const Pc = P < 500 ? P * 10 : P, tc = mins ? { 15: 2, 30: 4, 45: 6, 90: 8 }[t] : t + t % 2;
    const Ec = clean(Pc / 1000 * tc), cost = clean(Ec * 0.10), f = money;
    return item(`Un appareil de ${int(Pc)}${NB}W fonctionne pendant ${tc}${NB}heures. Avec un tarif fictif de 0,10${NB}$ le kWh, combien coûte cette énergie ?`, mcq(r, cost, [Ec, cost * 1000, cost * 100], f),   // oubli du tarif, watts au lieu de kilowatts, division par le tarif
      `${int(Pc)}${NB}W = ${fr(Pc / 1000, 3)}${NB}kW. E = P × t = ${fr(Pc / 1000, 3)} × ${tc} = ${u(Ec, 'kWh')}. Coût = ${fr(Ec, 3)} × 0,10 = <strong>${f(cost)}</strong>.`);
  });

  def('serie', 'calculs', 'Circuit série', r => {
    const n = r.int(2, 3), Rs = r.shuffle([5, 10, 15, 20, 25, 30, 40, 50, 60]).slice(0, n);
    // pas de courant de 1 A : la tension de chaque résistance aurait la même valeur que son étiquette en ohms
    const RT = Rs.reduce((s, x) => s + x, 0), I0 = r.pick([0.5, 1, 2, 3, 4]), I = I0 === 1 ? 1.5 : I0, U = I * RT, k = r.int(0, 2);
    const fig = figSerie(U, Rs), list = Rs.join(' + ');
    if (k === 0) { const f = x => u(x, 'Ω'); return item(`Quelle est la résistance totale de ce circuit série ?`, mcq(r, RT, [1 / Rs.reduce((s, x) => s + 1 / x, 0), RT / n, Math.max.apply(null, Rs)], f), `En série, les résistances s'additionnent : ${list} = <strong>${f(RT)}</strong>.`, fig); }
    if (k === 1) { const f = x => u(x, 'A'); return item(`Quel courant circule dans ce circuit série ?`, mcq(r, I, [U / Rs[0], U / Math.max.apply(null, Rs), U * RT / 1000, I * n], f), `R totale = ${list} = ${RT}${NB}Ω. I = U ÷ R totale = ${fr(U, 1)} ÷ ${RT} = <strong>${f(I)}</strong>. Ce courant est le même partout.`, fig); }
    const j = r.int(0, n - 1), Uj = I * Rs[j], f = x => u(x, 'V');
    return item(`Dans ce circuit série, quelle est la tension aux bornes de R${j + 1} ?`, mcq(r, Uj, [U, U / n, U - Uj, I * RT / 2], f), `R totale = ${RT}${NB}Ω, donc I = ${fr(U, 1)} ÷ ${RT} = ${u(I, 'A')}. U aux bornes de R${j + 1} = R${j + 1} × I = ${Rs[j]} × ${fr(I, 1)} = <strong>${f(Uj)}</strong>.`, fig);
  }, { w: 2 });

  const PAR = [[60, 40], [30, 60], [20, 30], [12, 6], [10, 15], [100, 25], [40, 10], [60, 30, 20], [24, 12, 8], [30, 30, 30], [60, 40, 24], [20, 20, 10], [12, 6, 4]];
  const PAR2 = PAR.filter(p => p.length === 2);
  const req = Rs => clean(1 / Rs.reduce((s, x) => s + 1 / x, 0));
  def('parallele', 'calculs', 'Circuit parallèle', r => {
    const Rs = r.pick(PAR), Req = req(Rs), U = r.pick([12, 24, 48, 120, 240]), k = r.int(0, 2), n = Rs.length;
    const sum = Rs.reduce((s, x) => s + x, 0), fig = figParallele(U, Rs);
    const inv = Rs.map(x => `1/${x}`).join(' + ');
    if (k === 0) { const f = x => u(x, 'Ω'); return item(`Quelle est la résistance équivalente de ce circuit parallèle ?`, mcq(r, Req, [sum, sum / n, Math.min.apply(null, Rs)], f), `1/R = ${inv} = ${fr(1 / Req, 4)}, donc R = 1 ÷ ${fr(1 / Req, 4)} = <strong>${f(Req)}</strong>.${n === 2 ? ` Ou produit sur somme : (${Rs[0]} × ${Rs[1]}) ÷ (${Rs[0]} + ${Rs[1]}).` : ''} Le résultat est plus petit que la plus petite branche.`, fig); }
    if (k === 1) { const IT = U / Req, f = x => u(x, 'A'); return item(`Quel courant total la source fournit-elle à ce circuit parallèle ?`, mcq(r, IT, [U / sum, U / Rs[0], U / Math.max.apply(null, Rs), IT / n], f), `Chaque branche reçoit ${U}${NB}V : ${Rs.map(x => `${U} ÷ ${x} = ${u(U / x, 'A')}`).join(' ; ')}. Les courants s'additionnent : <strong>${f(IT)}</strong>.`, fig); }
    const j = r.int(0, n - 1), Ij = U / Rs[j], f = x => u(x, 'A');
    return item(`Dans ce circuit parallèle, quel courant traverse R${j + 1} ?`, mcq(r, Ij, [U / Req, U / sum, Ij / n, U / Req - Ij], f), `En parallèle, chaque branche a la tension de la source. I = U ÷ R${j + 1} = ${U} ÷ ${Rs[j]} = <strong>${f(Ij)}</strong>.`, fig);
  }, { w: 2 });

  def('mixte', 'calculs', 'Circuit mixte', r => {
    const pr = r.pick(PAR2), R2v = pr[0], R3v = pr[1], Rp = req(pr), R1 = r.pick([2, 4, 6, 8, 10, 16, 20]);
    const RT = R1 + Rp, I = r.pick([1, 2, 3, 4, 5]), U = clean(I * RT), k = r.int(0, 2), fig = figMixte(U, R1, R2v, R3v);
    const base = `R2 et R3 en parallèle : (${R2v} × ${R3v}) ÷ (${R2v} + ${R3v}) = ${u(Rp, 'Ω')}. R totale = R1 + ${fr(Rp, 2)} = ${R1} + ${fr(Rp, 2)}`;
    if (k === 0) { const f = x => u(x, 'Ω'); return item(`Quelle est la résistance totale de ce circuit ?`, mcq(r, RT, [R1 + R2v + R3v, Rp, R1 + (R2v + R3v) / 2], f), `${base} = <strong>${f(RT)}</strong>.`, fig); }
    if (k === 1) { const f = x => u(x, 'A'); return item(`Quel courant la source fournit-elle ?`, mcq(r, I, [U / (R1 + R2v + R3v), U / R1, U / Rp], f), `${base} = ${u(RT, 'Ω')}. I = U ÷ R totale = ${fr(U, 2)} ÷ ${fr(RT, 2)} = <strong>${f(I)}</strong>.`, fig); }
    const Up = I * Rp, f = x => u(x, 'V');
    return item(`Quelle est la tension aux bornes du groupe R2 et R3 en parallèle ?`, mcq(r, Up, [U, I * R1, U / 2, U - Up / 2], f), `${base} = ${u(RT, 'Ω')}. I = ${fr(U, 2)} ÷ ${fr(RT, 2)} = ${u(I, 'A')}. Tension du groupe = I × ${fr(Rp, 2)} = <strong>${f(Up)}</strong> (et ${u(I * R1, 'V')} aux bornes de R1).`, fig);
  });

  def('rendement', 'calculs', 'Rendement et pertes', r => {
    const Pin = r.pick([500, 800, 1000, 1500, 2000, 2500, 4000, 5000]), eta = r.pick([0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]), Pout = clean(Pin * eta), k = r.int(0, 2);
    if (k === 0) { const f = x => sig(x, 3) + NB + '%'; return item(`Un moteur absorbe ${int(Pin)}${NB}W et fournit ${int(Pout)}${NB}W de puissance utile. Quel est son rendement ?`, mcq(r, eta * 100, [Pin / Pout * 100, (Pin - Pout) / Pin * 100, eta * 10], f), `Rendement = P utile ÷ P absorbée × 100 = ${int(Pout)} ÷ ${int(Pin)} × 100 = <strong>${f(eta * 100)}</strong>.`); }
    if (k === 1) { const f = x => eng(x, 'W'); return item(`Un appareil absorbe ${int(Pin)}${NB}W avec un rendement de ${fr(eta * 100, 0)}${NB}%. Quelles sont ses pertes ?`, mcq(r, Pin - Pout, [Pout, Pin * eta / 2, Pin + Pout], f), `P utile = ${int(Pin)} × ${fr(eta, 2)} = ${int(Pout)}${NB}W. Pertes = P absorbée − P utile = ${int(Pin)} − ${int(Pout)} = ${base(Pin - Pout, 'W')}<strong>${f(Pin - Pout)}</strong>.`); }
    const f = x => eng(x, 'W');
    return item(`Un moteur fournit ${int(Pout)}${NB}W de puissance utile avec un rendement de ${fr(eta * 100, 0)}${NB}%. Quelle puissance absorbe-t-il ?`, mcq(r, Pin, [Pout * eta, Pout, Pout * (1 + eta)], f), `P absorbée = P utile ÷ rendement = ${int(Pout)} ÷ ${fr(eta, 2)} = ${base(Pin, 'W')}<strong>${f(Pin)}</strong>. La puissance absorbée est toujours plus grande que la puissance utile.`);
  });

  def('puissance-tension', 'calculs', 'Même élément, autre tension', r => {
    const pair = r.pick([[240, 120], [240, 208], [208, 240], [600, 480]]), U1 = pair[0], U2 = pair[1], P = r.pick([1000, 1500, 2000, 3000, 4000, 4500]);
    const P2 = P * (U2 / U1) * (U2 / U1), f = x => eng(x, 'W');
    return item(`Un élément chauffant de ${int(P)}${NB}W prévu pour ${U1}${NB}V est branché sur ${U2}${NB}V. Quelle puissance dégage-t-il (résistance supposée constante) ?`, mcq(r, P2, [P * U2 / U1, P, P * (U1 / U2) * (U1 / U2)], f),
      `La résistance ne change pas et P = U² ÷ R : la puissance varie comme le carré de la tension. P = ${int(P)} × (${U2} ÷ ${U1})² = ${int(P)} × ${fr((U2 / U1) * (U2 / U1), 3)} = ${base(P2, 'W')}<strong>${f(P2)}</strong>.`);
  });

  def('hp', 'calculs', 'Moteur : HP, watts et rendement', r => {
    const hp = r.pick([0.5, 1, 2, 3, 5, 7.5, 10]), eta = r.pick([0.8, 0.85, 0.9]), W = hp * 746, f = x => eng(x, 'W');
    // réponse en watts, comme le demande l'énoncé (1 492 W et non 1,49 kW)
    if (r() < 0.45) { const fw = x => u(x, 'W'); return item(`À combien de watts correspond une puissance mécanique de ${fr(hp, 1)}${NB}HP ?`, mcq(r, W, [hp * 1000, hp * 373, W * 2], fw), `1 HP = 746 W, donc ${fr(hp, 1)} × 746 = <strong>${fw(W)}</strong>.`); }
    return item(`Un moteur de ${fr(hp, 1)}${NB}HP a un rendement de ${fr(eta * 100, 0)}${NB}%. Quelle puissance électrique absorbe-t-il à pleine charge ?`, mcq(r, W / eta, [W * eta, W, hp * 1000 / eta], f),
      `Puissance utile = ${fr(hp, 1)} × 746 = ${int(W)}${NB}W. P absorbée = P utile ÷ rendement = ${int(W)} ÷ ${fr(eta, 2)} = ${base(W / eta, 'W')}<strong>${f(W / eta)}</strong>.`);
  });

  /* ======================= Courant alternatif ======================= */
  def('periode', 'alternatif', 'Période et fréquence', r => {
    const f0 = r.pick([25, 50, 60, 100, 120, 400, 1000]), T = 1000 / f0;
    if (r() < 0.5) { const f = x => u(x, 'ms'); return item(`Quelle est la période d'un signal de ${int(f0)}${NB}Hz ?`, mcq(r, T, [f0, T * 10, T / 10, T * 2], f), `T = 1 ÷ f = 1 ÷ ${int(f0)} = ${fr(1 / f0, 5)}${NB}s = <strong>${f(T)}</strong>.`); }
    const f = x => u(x, 'Hz');
    // période écrite avec 4 chiffres (16,67 ms) : avec 16,7 ms on trouverait 59,9 Hz et non 60 Hz
    const exact = Number.isInteger(1e6 / f0);
    return item(`Un cycle d'une tension alternative dure ${sig(T, 4)}${NB}ms. Quelle est sa fréquence ?`, mcq(r, f0, [T, f0 / 1000, f0 * 2, f0 / 2], f), `f = 1 ÷ T. On convertit : ${sig(T, 4)}${NB}ms = ${sig(T / 1000, 4)}${NB}s. f = 1 ÷ ${sig(T / 1000, 4)} ${exact ? '=' : '≈'} <strong>${f(f0)}</strong>.`);
  });

  def('efficace-crete', 'alternatif', 'Valeur efficace et valeur de crête', r => {
    const Ue = r.pick([24, 120, 208, 240, 347, 600]), k = r.int(0, 2), f = x => u(x, 'V');
    if (k === 0) return item(`Une tension sinusoïdale a une valeur efficace de ${Ue}${NB}V. Quelle est sa valeur de crête ?`, mcq(r, Ue * R2, [Ue * 0.707, Ue * 2, Ue * R3, Ue], f), `U crête = 1,414 × U efficace = 1,414 × ${Ue} = <strong>${f(Ue * R2)}</strong>.`);
    if (k === 1) { const Uc = Math.round(Ue * R2); return item(`Une tension sinusoïdale a une valeur de crête de ${Uc}${NB}V. Quelle est sa valeur efficace ?`, mcq(r, Uc / R2, [Uc * R2, Uc / 2, Uc, Uc / R3], f), `U efficace = 0,707 × U crête = 0,707 × ${Uc} = <strong>${f(Uc / R2)}</strong>.`); }
    return item(`Une tension sinusoïdale a une valeur efficace de ${Ue}${NB}V. Quelle est sa valeur crête à crête ?`, mcq(r, 2 * Ue * R2, [Ue * R2, 2 * Ue, Ue, Ue * R3], f), `Crête à crête = 2 × crête = 2 × 1,414 × U efficace = 2,828 × ${Ue} = <strong>${f(2 * Ue * R2)}</strong>. La crête seule vaut 1,414 × ${Ue} = ${f(Ue * R2)}.`);
  });

  def('reactance', 'alternatif', 'Réactance d’une bobine ou d’un condensateur', r => {
    const f0 = r.pick([60, 60, 50]), f = x => eng(x, 'Ω');
    if (r() < 0.5) {
      const L = r.pick([0.05, 0.1, 0.2, 0.25, 0.5]), X = PI2 * f0 * L;
      return item(`Quelle est la réactance d'une bobine de ${fr(L, 2)}${NB}H à ${f0}${NB}Hz ?`, mcq(r, X, [f0 * L, 1 / (PI2 * f0 * L), PI2 * L, X * 2], f), `X<sub>L</sub> = 2πfL = 2 × 3,1416 × ${f0} × ${fr(L, 2)} = <strong>${f(X)}</strong>.`);
    }
    const C = r.pick([10, 22, 47, 100, 220, 470]), X = 1 / (PI2 * f0 * C * 1e-6);
    return item(`Quelle est la réactance d'un condensateur de ${C}${NB}µF à ${f0}${NB}Hz ?`, mcq(r, X, [PI2 * f0 * C * 1e-6, 1 / (f0 * C * 1e-6), X / 1000, X * 2], f), `On convertit : ${C}${NB}µF = ${fr(C * 1e-6, 6)}${NB}F. X<sub>C</sub> = 1 ÷ (2πfC) = 1 ÷ (2 × 3,1416 × ${f0} × ${fr(C * 1e-6, 6)}) = <strong>${f(X)}</strong>.`);
  });

  const TRI = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [30, 40, 50], [12, 16, 20], [40, 30, 50], [8, 6, 10], [60, 80, 100], [9, 12, 15]];
  def('impedance', 'alternatif', 'Impédance d’un circuit R-L série', r => {
    const t = r.pick(TRI), R = t[0], X = t[1], Z = t[2], k = r.int(0, 2);
    const zcalc = `Z = √(R² + X²) = √(${R}² + ${X}²) = √${int(R * R + X * X)} = ${Z}${NB}Ω`;
    if (k === 0) { const f = x => u(x, 'Ω'); return item(`Un circuit série comprend une résistance de ${R}${NB}Ω et une réactance inductive de ${X}${NB}Ω. Quelle est son impédance ?`, mcq(r, Z, [R + X, Math.abs(R - X), Math.sqrt(R * X)], f), `${zcalc}. On n'additionne pas directement R et X.`); }
    if (k === 1) { const U = r.pick([120, 240]), f = x => u(x, 'A'); return item(`Une résistance de ${R}${NB}Ω et une réactance inductive de ${X}${NB}Ω sont en série sous ${U}${NB}V. Quel courant circule ?`, mcq(r, U / Z, [U / (R + X), U / R, U / X], f), `${zcalc}. I = U ÷ Z = ${U} ÷ ${Z} = <strong>${f(U / Z)}</strong>.`); }
    const f = x => fr(x, 3);   // trois décimales : 5 ÷ 13 = 0,385 (0,38 serait à plus de 1 % de la valeur)
    return item(`Un circuit série a une résistance de ${R}${NB}Ω et une réactance inductive de ${X}${NB}Ω. Quel est son facteur de puissance ?`, mcq(r, R / Z, [X / Z, R / X > 1 ? X / R : R / X, R / (R + X)], f), `${zcalc}. cos φ = R ÷ Z = ${R} ÷ ${Z} = <strong>${f(R / Z)}</strong>.`);
  });

  def('puissances-ca', 'alternatif', 'Puissances P, Q et S', r => {
    const k = r.int(0, 3);
    if (k <= 1) {
      const U = r.pick([120, 240, 347, 600]), I = r.pick([5, 8, 10, 12, 15, 20, 25]), FP = r.pick([0.6, 0.7, 0.8, 0.85, 0.9]), S = U * I;
      if (k === 0) { const f = x => eng(x, 'W'); return item(`Une charge monophasée tire ${I}${NB}A sous ${U}${NB}V avec un facteur de puissance de ${fr(FP, 2)}. Quelle est la puissance active ?`, mcq(r, S * FP, [S, S / FP, S * (1 - FP)], f), `P = U × I × cos φ = ${U} × ${I} × ${fr(FP, 2)} = ${base(S * FP, 'W')}<strong>${f(S * FP)}</strong>. (U × I = ${eng(S, 'VA')} est la puissance apparente.)`); }
      const f = x => eng(x, 'VA');
      return item(`Une charge monophasée tire ${I}${NB}A sous ${U}${NB}V avec un facteur de puissance de ${fr(FP, 2)}. Quelle est la puissance apparente ?`, mcq(r, S, [S * FP, S / FP, S * R3], f), `S = U × I = ${U} × ${I} = ${base(S, 'VA')}<strong>${f(S)}</strong>. Le facteur de puissance n'entre pas dans la puissance apparente : il sert à passer de S à la puissance active (P = S × cos φ).`);
    }
    const t = r.pick(TRI), P = t[0], Qv = t[1], S = t[2];
    if (k === 2) { const f = x => fr(x, 3); return item(`Une installation absorbe ${P}${NB}kW pour une puissance apparente de ${S}${NB}kVA. Quel est son facteur de puissance ?`, mcq(r, P / S, [Qv / S, 1 - P / S, P / (P + S)], f), `FP = P ÷ S = ${P} ÷ ${S} = <strong>${f(P / S)}</strong>.`); }
    const f = x => u(x, 'kVA');
    return item(`Une installation absorbe ${P}${NB}kW de puissance active et ${Qv}${NB}kvar de puissance réactive. Quelle est sa puissance apparente ?`, mcq(r, S, [P + Qv, Math.abs(P - Qv), Math.sqrt(P * Qv)], f), `S = √(P² + Q²) = √(${P}² + ${Qv}²) = √${int(P * P + Qv * Qv)} = <strong>${f(S)}</strong>.`);
  }, { w: 2 });

  def('courant-fp', 'alternatif', 'Courant d’une charge monophasée', r => {
    const U = r.pick([120, 240, 240, 347]), P = r.pick([600, 900, 1200, 1800, 2400, 3600, 4800]), FP = r.pick([0.6, 0.7, 0.8, 0.85, 0.9]), I = P / (U * FP), f = x => u(x, 'A');
    return item(`Un moteur monophasé de ${int(P)}${NB}W (puissance active absorbée) fonctionne sous ${U}${NB}V avec un facteur de puissance de ${fr(FP, 2)}. Quel courant tire-t-il ?`, mcq(r, I, [P / U, P * FP / U, P / (U * FP * R3)], f),
      `P = U × I × cos φ, donc I = P ÷ (U × cos φ) = ${int(P)} ÷ (${U} × ${fr(FP, 2)}) = <strong>${f(I)}</strong>. Sans le facteur de puissance on trouverait ${f(P / U)}, ce qui est trop peu.`);
  });

  def('lire-sinus', 'alternatif', 'Lire une sinusoïde sur un graphique', r => {
    const peak = r.pick([10, 20, 50, 100, 170, 340]), T = r.pick([4, 8, 10, 20, 40]), d = peak / 2, k = r.int(0, 4);
    const fig = () => {
      const S = HQ.S(540, 262, 'Sinusoïde tracée sur une grille graduée');
      const p = S.plot({ x: 70, y: 34, w: 400, h: 180, xr: [0, 2 * T], yr: [-3 * d, 3 * d], gridx: 8, gridy: 6, xlabel: 't (ms)', ylabel: 'u (V)' });
      p.curve(x => peak * Math.sin(PI2 * x / T), 'c1');
      // graduations du temps écrites sous la grille : posées contre l'axe, elles seraient traversées par la courbe là où elle coupe zéro
      for (let i = 0; i <= 4; i++) { if (i) p.xtick(i * T / 2); S.text(p.sx(i * T / 2), 34 + 180 + 16, fr(i * T / 2, 1), { cls: 'sm mut' }); }
      for (let j = -3; j <= 3; j++) if (j !== 0) p.ytick(j * d, fr(j * d, 0).replace('-', '−'));
      return S;
    };
    const base = `Sur le graphique, la courbe monte jusqu'à ${fr(peak, 0)}${NB}V et un cycle complet dure ${T}${NB}ms.`;
    if (k === 0) { const f = x => u(x, 'V'); return item(`Quelle est la valeur de crête de cette tension ?`, mcq(r, peak, [2 * peak, peak * 0.707, peak / 2, 3 * d], f), `${base} La valeur de crête est le maximum : <strong>${f(peak)}</strong>.`, fig); }
    if (k === 1) { const f = x => u(x, 'V'); return item(`Quelle est la valeur crête à crête de cette tension ?`, mcq(r, 2 * peak, [peak, peak * R2, 4 * peak, 3 * d], f), `${base} Du minimum (−${fr(peak, 0)}${NB}V) au maximum (+${fr(peak, 0)}${NB}V) : <strong>${f(2 * peak)}</strong>.`, fig); }
    if (k === 2) { const f = x => u(x, 'ms'); return item(`Quelle est la période de cette tension ?`, mcq(r, T, [2 * T, T / 2, T / 4, 4 * T], f), `${base} La période est la durée d'un cycle : <strong>${f(T)}</strong>. Le graphique montre deux cycles.`, fig); }
    if (k === 3) { const f = x => u(x, 'Hz'); return item(`Quelle est la fréquence de cette tension ?`, mcq(r, 1000 / T, [500 / T, 2000 / T, T, 1 / T], f), `${base} f = 1 ÷ T = 1 ÷ ${fr(T / 1000, 3)}${NB}s = <strong>${f(1000 / T)}</strong>.`, fig); }
    const f = x => u(x, 'V');
    return item(`Quelle est la valeur efficace de cette tension ?`, mcq(r, peak / R2, [peak, peak * R2, peak / 2, 2 * peak], f), `${base} U efficace = 0,707 × U crête = 0,707 × ${fr(peak, 0)} = <strong>${f(peak / R2)}</strong>.`, fig);
  }, { w: 2 });

  /* ======================= Électrotechnique ======================= */
  def('vitesse-synchrone', 'electrotechnique', 'Vitesse synchrone d’un moteur', r => {
    const f0 = r.pick([60, 60, 60, 50]), p = r.pick([2, 4, 6, 8, 12]), n = 120 * f0 / p;
    if (r() < 0.7) { const f = x => int(x) + NB + 'r/min'; return item(`Quelle est la vitesse synchrone d'un moteur à ${p} pôles alimenté en ${f0}${NB}Hz ?`, mcq(r, n, [60 * f0 / p, 240 * f0 / p, f0 * p, 120 * p / f0 * 10], f), `n = 120 × f ÷ p = 120 × ${f0} ÷ ${p} = <strong>${f(n)}</strong>.`); }
    const f = x => u(x, 'Hz');
    return item(`Un alternateur à ${p} pôles tourne à ${int(n)}${NB}r/min. Quelle est la fréquence de la tension produite ?`, mcq(r, f0, [n / p, p * n / 60, n / 120, f0 === 60 ? 50 : 60], f), `f = p × n ÷ 120 = ${p} × ${int(n)} ÷ 120 = <strong>${f(f0)}</strong>.`);
  });

  def('condensateurs', 'electrotechnique', 'Condensateurs en série et en parallèle', r => {
    const pr = r.pick(PAR2), C1 = pr[0], C2 = pr[1], par = r() < 0.5, sum = C1 + C2, ser = req(pr), f = x => u(x, 'µF');
    const good = par ? sum : ser;
    return item(`Deux condensateurs de ${C1}${NB}µF et ${C2}${NB}µF sont branchés en ${par ? 'parallèle' : 'série'}. Quelle est la capacité totale ?`, mcq(r, good, [par ? ser : sum, sum / 2, Math.max(C1, C2)], f),
      par ? `En parallèle, les capacités s'additionnent : ${C1} + ${C2} = <strong>${f(sum)}</strong>. C'est l'inverse des résistances.` : `En série : 1/C = 1/${C1} + 1/${C2}, donc C = (${C1} × ${C2}) ÷ (${C1} + ${C2}) = <strong>${f(ser)}</strong>. C'est l'inverse des résistances : en série, la capacité diminue.`);
  });

  def('fmm', 'electrotechnique', 'Force magnétomotrice d’une bobine', r => {
    const N = r.pick([50, 100, 150, 200, 400, 500, 1000]), I = r.pick([0.5, 1.5, 2, 3, 4, 5]), F = N * I, f = x => int(x) + NB + 'At';
    if (r() < 0.6) return item(`Une bobine de ${int(N)} spires est parcourue par un courant de ${fr(I, 1)}${NB}A. Quelle est sa force magnétomotrice ?`, mcq(r, F, [N / I, N + I, F / 10], f), `Force magnétomotrice = N × I = ${int(N)} × ${fr(I, 1)} = <strong>${f(F)}</strong> (ampères-tours).`);
    const g = x => u(x, 'A');
    return item(`On veut une force magnétomotrice de ${int(F)} ampères-tours avec une bobine de ${int(N)} spires. Quel courant faut-il ?`, mcq(r, I, [F * N / 1000, N / F, I * 10], g), `I = force magnétomotrice ÷ N = ${int(F)} ÷ ${int(N)} = <strong>${g(I)}</strong>.`);
  }, { test: false });

  /* ======================= Transformateurs ======================= */
  def('transfo-tension', 'transformateurs', 'Rapport de transformation', r => {
    const a = r.pick([2, 4, 5, 10, 20, 0.5, 0.25]), U1 = r.pick([120, 240, 480, 600, 2400]), N1 = r.pick([200, 400, 500, 800, 1000, 1200]);
    const U2 = U1 / a, N2 = N1 / a, k = r.int(0, 2);
    if (k === 0) { const f = x => u(x, 'V'); return item(`Un transformateur a ${int(N1)} spires au primaire et ${int(N2)} spires au secondaire. Le primaire est alimenté en ${int(U1)}${NB}V. Quelle est la tension au secondaire ?`, mcq(r, U2, [U1 * a, U1, U1 / (a * a)], f), `U2 = U1 × N2 ÷ N1 = ${int(U1)} × ${int(N2)} ÷ ${int(N1)} = <strong>${f(U2)}</strong>. ${a > 1 ? 'Moins de spires au secondaire : la tension baisse.' : 'Plus de spires au secondaire : la tension monte.'}`); }
    if (k === 1) { const f = x => int(x) + NB + 'spires'; return item(`Un transformateur ${int(U1)}${NB}V / ${fr(U2, 1)}${NB}V a ${int(N1)} spires au primaire. Combien de spires a le secondaire ?`, mcq(r, N2, [N1 * a, N1, N1 / (a * a)], f), `N2 = N1 × U2 ÷ U1 = ${int(N1)} × ${fr(U2, 1)} ÷ ${int(U1)} = <strong>${f(N2)}</strong>.`); }
    const f = x => fr(x, 3);
    return item(`Quel est le rapport de transformation (primaire sur secondaire) d'un transformateur ${int(U1)}${NB}V / ${fr(U2, 1)}${NB}V ?`, mcq(r, a, [1 / a, a * a, a + 1], f), `a = U1 ÷ U2 = ${int(U1)} ÷ ${fr(U2, 1)} = <strong>${f(a)}</strong>.`);
  }, { w: 2 });

  def('transfo-courant', 'transformateurs', 'Courants et kVA d’un transformateur', r => {
    const k = r.int(0, 2), f = x => u(x, 'A');
    if (k === 0) {
      const pr = r.pick([[600, 120], [2400, 240], [14400, 240], [480, 120], [240, 24], [600, 208]]), U1 = pr[0], U2 = pr[1], I2 = r.pick([5, 10, 20, 50, 100]), I1 = I2 * U2 / U1;
      return item(`Un transformateur ${int(U1)}${NB}V / ${U2}${NB}V (supposé idéal) alimente une charge qui tire ${I2}${NB}A au secondaire. Quel est le courant au primaire ?`, mcq(r, I1, [I2 * U1 / U2, I2, I1 * 2], f), `La puissance se conserve : U1 × I1 = U2 × I2. I1 = I2 × U2 ÷ U1 = ${I2} × ${U2} ÷ ${int(U1)} = <strong>${f(I1)}</strong>. Côté haute tension, le courant est plus faible.`);
    }
    if (k === 1) {
      const S = r.pick([5, 10, 15, 25, 37.5, 50, 75, 100]), U = r.pick([120, 240, 600, 2400, 14400]), I = S * 1000 / U;
      return item(`Quel est le courant nominal d'un transformateur monophasé de ${fr(S, 1)}${NB}kVA du côté ${int(U)}${NB}V ?`, mcq(r, I, [S / U, I / R3, I * R3, I / 2], f), `I = S ÷ U = ${int(S * 1000)}${NB}VA ÷ ${int(U)}${NB}V = <strong>${f(I)}</strong>. Il faut convertir les kVA en VA.`);
    }
    const S = r.pick([15, 30, 45, 75, 112.5, 150, 300]), U = r.pick([208, 480, 600]), I = S * 1000 / (R3 * U);
    return item(`Quel est le courant nominal de ligne d'un transformateur triphasé de ${fr(S, 1)}${NB}kVA du côté ${U}${NB}V ?`, mcq(r, I, [S * 1000 / U, S * 1000 / (3 * U), S * 1000 * R3 / U], f), `En triphasé : I = S ÷ (√3 × U) = ${int(S * 1000)} ÷ (1,732 × ${U}) = <strong>${f(I)}</strong>. Sans le √3 on trouverait ${f(S * 1000 / U)}.`);
  }, { w: 2 });

  def('tc', 'transformateurs', 'Transformateur de courant et multiplicateur', r => {
    const prim = r.pick([100, 200, 400, 600, 800, 1200]), ratio = prim / 5, k = r.int(0, 2);
    if (k === 0) { const I = prim * r.pick([0.25, 0.4, 0.5, 0.6, 0.75, 0.8]), f = x => u(x, 'A'); return item(`Un transformateur de courant ${int(prim)}:5 est installé sur une ligne qui porte ${int(I)}${NB}A. Quel courant circule dans son secondaire ?`, mcq(r, I / ratio, [5, I / 5, I / prim], f), `Rapport = ${int(prim)} ÷ 5 = ${ratio}. Courant au secondaire = ${int(I)} ÷ ${ratio} = <strong>${f(I / ratio)}</strong>.`); }
    if (k === 1) { const s = r.pick([1, 1.5, 2, 2.5, 3, 4, 4.5]), f = x => u(x, 'A'); return item(`Un ampèremètre branché au secondaire d'un transformateur de courant ${int(prim)}:5 indique ${fr(s, 1)}${NB}A. Quel est le courant dans la ligne ?`, mcq(r, s * ratio, [s * prim, s * 5, s / ratio], f), `Rapport = ${int(prim)} ÷ 5 = ${ratio}. Courant de ligne = ${fr(s, 1)} × ${ratio} = <strong>${f(s * ratio)}</strong>.`); }
    const tt = r.pick([[2400, 120], [7200, 120], [14400, 120]]), rt = tt[0] / tt[1], f = x => int(x);
    return item(`Un compteur est alimenté par des transformateurs de courant ${int(prim)}:5 et des transformateurs de tension ${int(tt[0])}:${tt[1]}. Quel est le multiplicateur du compteur ?`, mcq(r, ratio * rt, [ratio, rt, ratio + rt], f), `Rapport du TC = ${int(prim)} ÷ 5 = ${ratio}. Rapport du TT = ${int(tt[0])} ÷ ${tt[1]} = ${rt}. Multiplicateur = ${ratio} × ${rt} = <strong>${f(ratio * rt)}</strong>.`);
  }, { w: 2 });

  /* ======================= Monophasé et triphasé ======================= */
  def('ligne-phase', 'triphase', 'Grandeurs de ligne et de phase', r => {
    const k = r.int(0, 3);
    if (k === 0) { const Up = r.pick([120, 277, 347, 2400, 14400]), f = x => u(x, 'V'); return item(`Dans un réseau triphasé en étoile, la tension entre une phase et le neutre est de ${int(Up)}${NB}V. Quelle est la tension entre deux phases ?`, mcq(r, Up * R3, [Up, 2 * Up, 3 * Up, Up * R2], f), `En étoile : U ligne = √3 × U phase = 1,732 × ${int(Up)} = <strong>${f(Up * R3)}</strong>.`); }
    if (k === 1) { const UL2 = r.pick([208, 480, 600, 4160, 25000]), f = x => u(x, 'V'); return item(`Dans un réseau triphasé en étoile, la tension entre deux phases est de ${int(UL2)}${NB}V. Quelle est la tension entre une phase et le neutre ?`, mcq(r, UL2 / R3, [UL2, UL2 / 2, UL2 / 3, UL2 / R2], f), `En étoile : U phase = U ligne ÷ √3 = ${int(UL2)} ÷ 1,732 = <strong>${f(UL2 / R3)}</strong>.`); }
    if (k === 2) { const Ip = r.pick([10, 15, 20, 30, 50]), f = x => u(x, 'A'); return item(`Une charge équilibrée est couplée en triangle. Le courant dans chaque branche du triangle (courant de phase) est de ${Ip}${NB}A. Quel est le courant de ligne ?`, mcq(r, Ip * R3, [Ip, 3 * Ip, Ip / R3], f), `En triangle : I ligne = √3 × I phase = 1,732 × ${Ip} = <strong>${f(Ip * R3)}</strong>.`); }
    const UL3 = r.pick([208, 480, 600]), f = x => u(x, 'V');
    return item(`Une charge couplée en triangle est alimentée par un réseau de ${UL3}${NB}V entre phases. Quelle tension reçoit chaque branche du triangle ?`, mcq(r, UL3, [UL3 / R3, UL3 * R3, UL3 / 3], f), `En triangle, chaque branche est branchée directement entre deux phases : U phase = U ligne = <strong>${f(UL3)}</strong>. C'est le courant qui est multiplié par √3.`);
  }, { w: 2 });

  def('puissance-3ph', 'triphase', 'Puissance en triphasé', r => {
    const U = r.pick([208, 480, 600]), I = r.pick([10, 15, 20, 25, 30, 40, 50]), FP = r.pick([0.8, 0.85, 0.9, 1]), S = R3 * U * I;
    if (r() < 0.65) { const f = x => eng(x, 'W'); return item(`Une charge triphasée équilibrée tire ${I}${NB}A par ligne sous ${U}${NB}V entre phases, avec un facteur de puissance de ${fr(FP, 2)}. Quelle est sa puissance active ?`, mcq(r, S * FP, [U * I * FP, 3 * U * I * FP, FP < 1 ? S : S * 2, S * FP / 2], f), `P = √3 × U × I × cos φ = 1,732 × ${U} × ${I} × ${fr(FP, 2)} = ${base(S * FP, 'W')}<strong>${f(S * FP)}</strong>. Sans le √3 : ${f(U * I * FP)} ; avec un 3 : ${f(3 * U * I * FP)}.`); }
    const f = x => eng(x, 'VA');
    return item(`Une charge triphasée équilibrée tire ${I}${NB}A par ligne sous ${U}${NB}V entre phases. Quelle est sa puissance apparente ?`, mcq(r, S, [U * I, 3 * U * I, S / R3 / R3], f), `S = √3 × U × I = 1,732 × ${U} × ${I} = ${base(S, 'VA')}<strong>${f(S)}</strong>.`);
  }, { w: 2 });

  def('courant-3ph', 'triphase', 'Courant de ligne en triphasé', r => {
    const U = r.pick([208, 480, 600]), P = r.pick([5, 7.5, 10, 15, 20, 30, 45, 60]), FP = r.pick([0.8, 0.85, 0.9, 1]), I = P * 1000 / (R3 * U * FP), f = x => u(x, 'A');
    return item(`Une charge triphasée équilibrée de ${fr(P, 1)}${NB}kW est alimentée en ${U}${NB}V entre phases avec un facteur de puissance de ${fr(FP, 2)}. Quel est le courant de ligne ?`, mcq(r, I, [P * 1000 / (U * FP), P * 1000 / (3 * U * FP), P * 1000 * FP / (R3 * U), I * 2], f),
      `I = P ÷ (√3 × U × cos φ) = ${int(P * 1000)} ÷ (1,732 × ${U} × ${fr(FP, 2)}) = <strong>${f(I)}</strong>.`);
  }, { w: 2 });

  def('neutre', 'triphase', 'Courant de neutre en 120/240 V', r => {
    const I1 = r.pick([10, 15, 20, 25, 30, 40, 50]), I2 = r.pick([5, 10, 15, 20, 25, 30, 40]), In = Math.abs(I1 - I2), f = x => u(x, 'A');
    return item(`Dans un branchement monophasé 120/240 V, les charges résistives branchées à 120 V tirent ${I1}${NB}A sur la ligne 1 et ${I2}${NB}A sur la ligne 2. Quel est le courant dans le neutre ?`, mcq(r, In, [I1 + I2, (I1 + I2) / 2, Math.max(I1, I2), Math.min(I1, I2), 2 * I1, 5], f),
      `Le neutre ne porte que la différence entre les deux lignes : ${Math.max(I1, I2)} − ${Math.min(I1, I2)} = <strong>${f(In)}</strong>.${In === 0 ? ' Les deux lignes sont équilibrées : le neutre ne porte aucun courant.' : ''}`);
  });

  /* ======================= Mesure et comptage ======================= */
  def('consommation', 'mesure', 'Consommation à partir de deux relevés', r => {
    const mult = r.pick([1, 10, 20, 40, 80, 120, 160]), prev = r.int(1000, 8500), d = mult === 1 ? r.int(150, 1900) : r.int(12, 95), cur = prev + d, E = d * mult, f = x => int(x) + NB + 'kWh';
    if (mult === 1) return item(`Un compteur à mesurage direct ne porte aucun multiplicateur. Relevé précédent : ${int(prev)}. Relevé actuel : ${int(cur)}. Quelle est la consommation ?`, mcq(r, E, [cur, cur + prev, E * 10, E / 10], f), `Sans multiplicateur, la consommation est l'écart des relevés : ${int(cur)} − ${int(prev)} = <strong>${f(E)}</strong>.`);
    // multiplicateur inscrit sur le compteur lui-même, sans transformateurs de mesure : l'exemple que publie Hydro-Québec (MULT 10)
    if (mult === 10) return item(`Un compteur à cadrans porte la mention MULT 10. Relevé précédent : ${int(prev)}. Relevé actuel : ${int(cur)}. Quelle est la consommation ?`, mcq(r, E, [d, d * 100, cur, cur * 10], f), `Écart des relevés = ${int(cur)} − ${int(prev)} = ${d}. La mention MULT 10 veut dire que cet écart est multiplié par 10 : ${d} × 10 = <strong>${f(E)}</strong>.`);
    return item(`Un compteur est alimenté par des transformateurs de courant ${mult * 5}:5. Relevé précédent : ${int(prev)}. Relevé actuel : ${int(cur)}. Quelle est la consommation réelle ?`, mcq(r, E, [d, d * mult * 5, d * 5, cur * mult], f), `Écart des relevés = ${int(cur)} − ${int(prev)} = ${d}. Multiplicateur = ${mult * 5} ÷ 5 = ${mult}. Consommation réelle = ${d} × ${mult} = <strong>${f(E)}</strong>.`);
  }, { w: 2 });

  const DIALS = [['Milliers', false], ['Centaines', true], ['Dizaines', false], ['Unités', true]];
  def('cadrans', 'mesure', 'Lire un compteur à cadrans', r => {
    const N = r.int(1000, 9998), v = N + 0.5;
    const vals = [v / 1000 % 10, v / 100 % 10, v / 10 % 10, v % 10];
    const digs = vals.map(x => Math.floor(x));
    const pad = x => String(((x % 10000) + 10000) % 10000).padStart(4, '0');
    const fig = () => {
      const S = HQ.S(580, 205, 'Quatre cadrans de compteur');
      DIALS.forEach((dl, i) => S.dial(85 + i * 137, 92, 50, vals[i], dl[1], dl[0]));
      return S;
    };
    const rounded = vals.map(x => Math.round(x) % 10).join('');
    const mirrored = vals.map((x, i) => DIALS[i][1] ? Math.floor(x) : Math.floor((10 - x) % 10)).join('');
    const reversed = digs.slice().reverse().join('');
    const m = mcqS(r, [pad(N), rounded, mirrored, reversed, pad(N + 110), pad(N + 1001), pad(N - 10)]);
    const lines = digs.map((dg, i) => {
      const part = vals[i] - Math.floor(vals[i]), nx = (dg + 1) % 10;
      let note = '';
      if (i < 3 && part > 0.8) note = ` (elle semble presque sur le ${nx}, mais le cadran de droite n'a pas encore dépassé 0 : le ${nx} n'est pas atteint)`;
      else if (i < 3 && part < 0.1) note = ` (elle est presque sur le ${dg} : le cadran de droite a déjà repassé par 0, donc le ${dg} est bien atteint)`;
      return `${DIALS[i][0]} : l'aiguille est entre ${dg} et ${nx}${note}, on retient <strong>${dg}</strong>`;
    }).join(' ; ');
    return item(`Quel relevé indiquent ces cadrans ? (Les flèches pointillées montrent le sens de rotation de chaque cadran.)`, m,
      `On lit de gauche à droite et on retient le plus petit des deux chiffres voisins (9 entre 9 et 0). ${lines}. Relevé : <strong>${pad(N)}</strong>. Attention au sens de rotation, qui alterne d'un cadran à l'autre. Quand une aiguille semble pile sur un chiffre, c'est le cadran de droite qui tranche.`, fig);
  }, { w: 2 });

  def('puissance-appelee', 'mesure', 'Puissance appelée avec multiplicateur', r => {
    const mult = r.pick([20, 40, 80, 120, 160]), W = r.pick([450, 625, 750, 900, 1250, 1500, 2250]), kW = W * mult / 1000, f = x => u(x, 'kW');
    return item(`L'afficheur de puissance d'un compteur indique ${int(W)}${NB}W. Le multiplicateur de l'installation est ${mult}. Quelle est la puissance appelée ?`, mcq(r, kW, [W / 1000, kW * 1000, kW / 10, W * mult / 100], f),
      `Puissance appelée = valeur lue × multiplicateur ÷ 1 000 = ${int(W)} × ${mult} ÷ 1 000 = <strong>${f(kW)}</strong>.`);
  });

  def('erreur-mesure', 'mesure', 'Erreur de mesure en pourcentage', r => {
    const real = r.pick([100, 200, 250, 400, 500, 1000]), pct = r.pick([-4, -2, -1, 1, 2, 3, 5]), meas = clean(real * (1 + pct / 100));
    const s = x => (x > 0 ? '+' : '−') + fr(Math.abs(x), 2) + NB + '%';
    const m = mcqS(r, [s(pct), s(-pct), s(pct * 10), s(meas - real === pct ? pct * 2 : meas - real), s(pct / 10)]);
    return item(`Un compteur en essai enregistre ${fr(meas, 1)}${NB}kWh alors que l'énergie réellement fournie est de ${int(real)}${NB}kWh. Quelle est son erreur ?`, m,
      `Erreur = (mesuré − réel) ÷ réel × 100 = (${fr(meas, 1)} − ${int(real)}) ÷ ${int(real)} × 100 = <strong>${s(pct)}</strong>. Le signe est ${pct > 0 ? 'positif : le compteur enregistre trop' : 'négatif : le compteur n’enregistre pas assez'}.`);
  });

  def('kh', 'mesure', 'Compteur à disque : puissance à partir de Kh', r => {
    const Kh = r.pick([3.6, 7.2, 14.4, 21.6]), n = r.pick([5, 10, 20]), t = r.pick([20, 30, 40, 60, 90]), P = 3600 * Kh * n / t, f = x => eng(x, 'W');
    return item(`Le disque d'un compteur électromécanique (Kh = ${fr(Kh, 1)}${NB}Wh par tour) fait ${n} tours en ${t}${NB}secondes. Quelle puissance la charge consomme-t-elle ?`, mcq(r, P, [Kh * n / t, Kh * n * t, 3600 * Kh / (n * t), P / 60], f),
      `Énergie = Kh × tours = ${fr(Kh, 1)} × ${n} = ${fr(Kh * n, 1)}${NB}Wh en ${t}${NB}s. P = 3 600 × Kh × tours ÷ temps = 3 600 × ${fr(Kh, 1)} × ${n} ÷ ${t} = ${base(P, 'W')}<strong>${f(P)}</strong>.`);
  }, { test: false });

  /* ======================= Sécurité ======================= */
  def('courant-corps', 'securite', 'Courant à travers le corps', r => {
    const U = r.pick([120, 240, 347, 600]), R0 = r.pick([1000, 1500, 2000, 5000, 10000, 50000, 100000]);
    // Une résistance de peau sèche (10 000 Ω et plus) n'a de sens qu'à basse tension : au-delà de 120 V la peau cède et il reste de l'ordre de 1 000 Ω.
    // Sans cela, « 600 V et 100 000 Ω » donnerait 6 mA et un corrigé rassurant pour un contact en réalité mortel.
    const Rb = U > 120 && R0 > 5000 ? { 10000: 1000, 50000: 1500, 100000: 2000 }[R0] : R0, sec = Rb > 5000;
    const I = U / Rb, mA = I * 1000, f = x => eng(x, 'A');
    const effet = mA < 1 ? 'en dessous du seuil de perception' : mA < 5 ? 'perceptible' : mA < 10 ? 'un choc douloureux' : mA < 30 ? 'assez pour ne plus pouvoir lâcher prise' : mA < 50 ? 'assez pour gêner la respiration' : 'assez pour provoquer un arrêt cardiaque (fibrillation ventriculaire)';
    return item(`Une personne entre en contact avec une tension de ${U}${NB}V. La résistance de son corps sur ce trajet est d'environ ${int(Rb)}${NB}Ω${sec ? ' (peau sèche)' : ''}. Quel courant la traverse ?`, mcq(r, I, [I * 10, I / 10, I * 1000, I / 1000], f),
      `I = U ÷ R = ${U} ÷ ${int(Rb)} = ${fr(I, 5)}${NB}A = <strong>${f(I)}</strong>. Ordre de grandeur : c'est ${effet}.${sec ? ' Cette résistance élevée suppose une peau sèche : mouillée, elle tombe vers 1 000 Ω et le même contact devient mortel.' : ''}`);
  });

  /* ======================= Lecture de schémas ======================= */
  def('lampes', 'schemas', 'Quelles lampes sont allumées ?', r => {
    const s1 = r() < 0.75, s2 = r() < 0.55, s3 = r() < 0.55, l1 = s1 && s2, l2 = s1 && s3;
    const fig = () => {
      const S = HQ.S(480, 240, 'Source, interrupteur S1 en série, puis deux branches : S2 avec L1 et S3 avec L2');
      S.comp('V', 50, 200, 50, 50, { label: '120 V', side: 'l' });
      S.wire([[50, 50], [90, 50]]);
      S.comp('sw', 90, 50, 200, 50, { closed: s1, label: 'S1' });
      S.wire([[200, 50], [390, 50]]); S.dot(270, 50);
      S.comp('sw', 270, 50, 270, 120, { closed: s2, label: 'S2', side: 'l' });
      S.comp('lamp', 270, 120, 270, 200, { label: 'L1', side: 'l' });
      S.comp('sw', 390, 50, 390, 120, { closed: s3, label: 'S3', side: 'r' });
      S.comp('lamp', 390, 120, 390, 200, { label: 'L2', side: 'r' });
      S.wire([[390, 200], [50, 200]]); S.dot(270, 200);
      return S;
    };
    const good = l1 && l2 ? 'L1 et L2' : l1 ? 'L1 seulement' : l2 ? 'L2 seulement' : 'Aucune lampe';
    const m = mcqS(r, [good, 'L1 et L2', 'L1 seulement', 'L2 seulement', 'Aucune lampe']);
    const st = b => b ? 'fermé' : 'ouvert';
    return item(`Les interrupteurs sont dans l'état dessiné. Quelles lampes sont allumées ?`, m,
      `S1 (${st(s1)}) est en série avec tout le circuit${s1 ? '' : ' : comme il est ouvert, aucun courant ne passe'}. L1 a besoin de S1 et S2 fermés (S2 est ${st(s2)}). L2 a besoin de S1 et S3 fermés (S3 est ${st(s3)}). Réponse : <strong>${good}</strong>.`, fig);
  }, { w: 2 });

  // [type, options, nom, à quoi on le reconnaît, famille] : deux symboles de la même famille ne sont jamais proposés ensemble
  // (un bouton-poussoir normalement fermé est, au repos, un contact fermé : « un interrupteur fermé » serait un leurre défendable)
  const SYMN = [['R', {}, 'Une résistance', 'un trait en zigzag'], ['L', {}, 'Une bobine (inductance)', 'une suite de petites boucles'], ['C', {}, 'Un condensateur', 'deux traits parallèles de même longueur'], ['lamp', {}, 'Une lampe', 'un cercle barré d’une croix'],
    ['fuse', {}, 'Un fusible', 'un petit rectangle traversé par le fil'], ['brk', {}, 'Un disjoncteur', 'un arc au-dessus de deux bornes'], ['bat', {}, 'Une pile', 'deux traits parallèles, un long et un court'],
    ['AC', {}, 'Une source de tension alternative', 'un cercle qui contient une petite sinusoïde'], ['motor', {}, 'Un moteur', 'un cercle marqué M'],
    ['pbno', {}, 'Un bouton-poussoir normalement ouvert', 'une barre surmontée d’un bouton, qui ne touche pas les deux bornes au repos', 'o'], ['pbnc', {}, 'Un bouton-poussoir normalement fermé', 'une barre surmontée d’un bouton, qui relie les deux bornes au repos', 'f'], ['nc', {}, 'Un contact normalement fermé', 'deux traits parallèles barrés d’une diagonale', 'f'],
    ['meter', { letter: 'V' }, 'Un voltmètre', 'un cercle marqué V'], ['meter', { letter: 'A' }, 'Un ampèremètre', 'un cercle marqué A'], ['meter', { letter: 'W' }, 'Un wattmètre', 'un cercle marqué W'],
    ['sw', {}, 'Un interrupteur ouvert', 'une lame levée qui ne touche pas la seconde borne', 'o'], ['sw', { closed: true }, 'Un interrupteur fermé', 'une lame qui relie les deux bornes', 'f']];
  def('symbole', 'schemas', 'Reconnaître un symbole', r => {
    const order = r.shuffle(SYMN), s = order[0];
    const fig = () => { const S = HQ.S(200, 84, 'Symbole à identifier'); S.comp(s[0], 30, 50, 170, 50, s[1]); return S; };
    const others = order.slice(1).filter(o => !(s[4] && o[4] === s[4]));
    const m = mcqS(r, [s[2], others[0][2], others[1][2], others[2][2]]);
    return item(`Que représente ce symbole ?`, m, `Ce symbole représente <strong>${s[2].toLowerCase()}</strong> : on le reconnaît à ${s[3]}. Revois la grille des symboles dans la page Lecture de schémas si tu hésites.`, fig);
  });
  /* ---------- figure du problème 12 de la page Exercices ---------- */
  HQ.figs = HQ.figs || {};
  HQ.figs['p-trois-lampes'] = function () {
    const S = HQ.S(440, 190, 'Source de 120 V, lampe L1 en série, puis lampes L2 et L3 en parallèle');
    S.comp('V', 50, 155, 50, 50, { label: '120 V', side: 'l' });
    S.wire([[50, 50], [100, 50]]);
    S.comp('lamp', 100, 50, 200, 50, { label: 'L1', val: '240 Ω' });
    S.wire([[200, 50], [360, 50]]); S.dot(270, 50);
    S.comp('lamp', 270, 50, 270, 155, { label: 'L2', val: '240 Ω' });
    S.comp('lamp', 360, 50, 360, 155, { label: 'L3', val: '240 Ω' });
    S.wire([[360, 155], [50, 155]]); S.dot(270, 155);
    return S;
  };
})();
