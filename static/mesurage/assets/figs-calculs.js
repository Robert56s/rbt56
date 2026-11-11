/* Figures et démos de la page « Les calculs électriques simples » */
(function () {
  'use strict';
  const HQ = window.HQ, wk = HQ.wk, el = HQ.el, NB = HQ.NBSP;

  // espace des milliers dès 1 000 (HQ.fr ne la met qu'à partir de 10 000)
  const g4 = s => s.replace(/^(-?\d)(\d{3})(?=,|$)/, '$1' + NB + '$2');
  // valeur lisible avec son unité : 0,2 A | 18,75 A | 4 500 W | 2,5 mA | 120 kW
  function fmt(x, unit, n) {
    n = n || 4;
    const ax = Math.abs(x);
    if (!isFinite(x)) return 'infini';
    if (ax === 0) return '0' + NB + unit;
    if (ax >= 0.1 && ax < 100000) return g4(HQ.sig(x, n)) + NB + unit;
    return HQ.eng(x, unit, n);
  }
  const num = v => g4(HQ.sig(v, 5));
  const SVGNS = 'http://www.w3.org/2000/svg';

  // texte SVG avec exposants : rich(S, x, y, 'R × I^{2}', { anchor, cls, up })
  function rich(S, x, y, str, opts) {
    opts = opts || {};
    const t = S.add('text', { x, y, 'text-anchor': opts.anchor || 'middle', class: opts.cls || null });
    const up = opts.up || 5;
    let raised = false;
    String(str).split(/\^\{([^}]*)\}/).forEach((part, i) => {
      if (part === '') return;
      const ts = document.createElementNS(SVGNS, 'tspan');
      if (i % 2) { ts.setAttribute('dy', -up); ts.setAttribute('style', 'font-size:.76em'); raised = true; }
      else if (raised) { ts.setAttribute('dy', up); raised = false; }
      ts.textContent = part;
      t.appendChild(ts);
    });
    return t;
  }
  // flèche de courant avec une étiquette bien dégagée du trait
  function cur(S, x1, y1, x2, y2, label, o) {
    o = o || {};
    S.arrow(x1, y1, x2, y2, o.cls || 'c2', o.marker || 'ahb');
    if (!label) return;
    if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) S.text((x1 + x2) / 2, Math.min(y1, y2) - 9, label, { cls: o.tcls || 'sm b th' });
    else S.text(Math.max(x1, x2) + 8, (y1 + y2) / 2 + 4, label, { anchor: 'start', cls: o.tcls || 'sm b th' });
  }

  /* ---------- Figure : roue des formules ---------- */
  HQ.figs['roue-formules'] = function () {
    const S = HQ.S(440, 440, 'Roue des formules : au centre les quatre grandeurs P, U, I et R ; autour de chacune, ses trois formules');
    const cx = 220, cy = 220, r1 = 64, r2 = 208, rt = 146;
    const pt = (r, a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
    const P = (r, a) => { const p = pt(r, a); return p[0].toFixed(1) + ',' + p[1].toFixed(1); };
    const quads = [
      { a: 180, name: 'P', cls: 'soft1', tc: 'te', f: ['U × I', 'R × I^{2}', 'U^{2} ÷ R'] },
      { a: 270, name: 'U', cls: 'soft2', tc: 'th', f: ['R × I', 'P ÷ I', '√(P × R)'] },
      { a: 0, name: 'I', cls: 'soft3', tc: 'td', f: ['√(P ÷ R)', 'P ÷ U', 'U ÷ R'] },
      { a: 90, name: 'R', cls: 'soft4', tc: 'tw', f: ['U ÷ I', 'U^{2} ÷ P', 'P ÷ I^{2}'] }
    ];
    quads.forEach(q => {
      S.path(`M${cx},${cy} L${P(r2, q.a)} A${r2},${r2} 0 0 1 ${P(r2, q.a + 90)} Z`, q.cls);
      [30, 60].forEach(da => { const a = pt(r1, q.a + da), b = pt(r2, q.a + da); S.line(a[0], a[1], b[0], b[1], 'dash'); });
      q.f.forEach((t, k) => { const p = pt(rt, q.a + 15 + 30 * k); rich(S, p[0], p[1] + 5, t, { cls: 'b' }); });
    });
    S.circle(cx, cy, r1, 'sym fill');
    S.line(cx - r2, cy, cx + r2, cy, 'sym'); S.line(cx, cy - r2, cx, cy + r2, 'sym');
    S.circle(cx, cy, r2, 'sym');
    quads.forEach(q => {
      const p = pt(33, q.a + 45);
      S.add('text', { x: p[0], y: p[1] + 9, 'text-anchor': 'middle', class: 'b ' + q.tc, style: 'font-size:25px' }, q.name);
    });
    S.text(6, 18, 'P : puissance (W)', { anchor: 'start', cls: 'sm b te' });
    S.text(434, 18, 'U : tension (V)', { anchor: 'end', cls: 'sm b th' });
    S.text(434, 432, 'I : courant (A)', { anchor: 'end', cls: 'sm b td' });
    S.text(6, 432, 'R : résistance (Ω)', { anchor: 'start', cls: 'sm b tw' });
    return S;
  };

  /* ---------- Figure : bilan de puissance et rendement ---------- */
  HQ.figs['rendement-flux'] = function () {
    const S = HQ.S(620, 228, 'Bilan de puissance d’un moteur : 2000 watts absorbés, 1700 watts utiles et 300 watts de pertes');
    S.path('M24,52 H240 V152 H24 Z', 'soft1');                                // 100 px : puissance absorbée
    S.path('M340,52 H520 V38 L580,94.5 L520,151 V137 H340 Z', 'soft3');       // 85 px : puissance utile
    S.path('M282.5,160 V190 H272 L290,214 L308,190 H297.5 V160 Z', 'soft2');  // 15 px : pertes
    S.rect(236, 36, 108, 128, 'body', 10);
    S.text(130, 97, 'Puissance absorbée', { cls: 'b' }); S.text(130, 116, '2' + NB + '000 W (100 %)');
    S.text(290, 97, 'Moteur', { cls: 'b' }); S.text(290, 115, 'η = 85 %', { cls: 'sm' });
    S.text(436, 90, 'Puissance utile', { cls: 'b' }); S.text(436, 109, '1' + NB + '700 W (85 %)');
    S.text(322, 197, 'Pertes : 300 W (15 %)', { anchor: 'start', cls: 'b th' });
    S.text(322, 213, 'chaleur, frottement', { anchor: 'start', cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : circuit série ---------- */
  HQ.figs['circuit-serie'] = function () {
    const S = HQ.S(620, 250, 'Circuit série : une source de 12 volts et trois résistances de 10, 20 et 30 ohms à la suite');
    S.comp('V', 70, 205, 70, 85, { label: 'U', val: '12 V', side: 'l' });
    S.wire([[70, 85], [70, 65], [110, 65]]);
    [['R1', '10 Ω', '2 V'], ['R2', '20 Ω', '4 V'], ['R3', '30 Ω', '6 V']].forEach((r, i) => {
      const x1 = 110 + i * 140, m = x1 + 70;
      S.comp('R', x1, 65, x1 + 140, 65, { label: r[0], val: r[1] });
      S.add('line', { x1: m - 44, y1: 90, x2: m + 44, y2: 90, class: 'c1', 'marker-start': 'url(#ahe)', 'marker-end': 'url(#ahe)', style: 'stroke-width:1.4' });
      S.text(m, 109, 'U' + (i + 1) + ' = ' + r[2], { cls: 'b te' });
    });
    S.wire([[530, 65], [552, 65], [552, 225], [70, 225], [70, 205]]);
    cur(S, 352, 215, 272, 215, 'I = 0,2 A partout');
    S.text(312, 162, '2 V + 4 V + 6 V = 12 V', { cls: 'lg' });
    return S;
  };

  /* ---------- Figure : circuit parallèle ---------- */
  HQ.figs['circuit-parallele'] = function () {
    const S = HQ.S(620, 262, 'Circuit parallèle : une source de 120 volts et trois branches de 60, 40 et 24 ohms');
    S.comp('V', 70, 205, 70, 75, { label: 'U', val: '120 V', side: 'l' });
    S.wire([[70, 75], [70, 55], [500, 55]]); S.wire([[70, 205], [70, 225], [500, 225]]);
    [['R1', '60 Ω', '2 A'], ['R2', '40 Ω', '3 A'], ['R3', '24 Ω', '5 A']].forEach((r, i) => {
      const x = 220 + i * 140;
      S.comp('R', x, 55, x, 225, { label: r[0], val: r[1] });
      S.arrow(x - 13, 76, x - 13, 108, 'c2', 'ahb');
      S.text(x - 21, 97, 'I' + (i + 1) + ' = ' + r[2], { anchor: 'end', cls: 'sm b th' });
      if (i < 2) { S.dot(x, 55); S.dot(x, 225); }
    });
    cur(S, 98, 45, 168, 45, 'I total = 10 A');
    S.text(310, 252, '120 V sur chaque branche | 2 A + 3 A + 5 A = 10 A', { cls: 'mut' });
    return S;
  };

  /* ---------- Figure : réduction d'un circuit mixte en 3 étapes ---------- */
  HQ.figs['mixte-etapes'] = function () {
    const S = HQ.S(770, 258, 'Trois étapes : le circuit de départ, le groupe parallèle remplacé par 4 ohms, puis une seule résistance de 8 ohms');
    const top = 76, bot = 216;
    // 1. circuit de départ
    S.text(150, 18, '1. Circuit de départ', { cls: 'b' });
    S.rect(134, 96, 122, 100, 'soft4', 10);
    S.comp('V', 58, bot, 58, top + 20, { label: '24 V', side: 'l' });
    S.wire([[58, top + 20], [58, top]]);
    S.comp('R', 58, top, 150, top, { label: 'R1', val: '4 Ω' });
    S.wire([[150, top], [214, top]]);
    S.comp('R', 150, top, 150, bot, { label: 'R2', val: '12 Ω' });
    S.comp('R', 214, top, 214, bot, { label: 'R3', val: '6 Ω' });
    S.wire([[58, bot], [214, bot]]);
    S.dot(150, top); S.dot(150, bot);
    S.text(150, 247, 'R1 en série avec (R2 en parallèle avec R3)', { cls: 'sm mut' });
    S.arrow(266, 146, 290, 146, 'ln');
    // 2. groupe parallèle réduit
    S.text(420, 18, '2. Groupe parallèle réduit', { cls: 'b' });
    S.rect(430, 96, 96, 100, 'soft4', 10);
    S.comp('V', 354, bot, 354, top + 20, { label: '24 V', side: 'l' });
    S.wire([[354, top + 20], [354, top]]);
    S.comp('R', 354, top, 446, top, { label: 'R1', val: '4 Ω' });
    S.comp('R', 446, top, 446, bot, { label: '4 Ω', val: 'R2 et R3' });
    S.wire([[354, bot], [446, bot]]);
    S.text(430, 247, '12 × 6 ÷ (12 + 6) = 4 Ω', { cls: 'sm mut' });
    S.arrow(532, 146, 556, 146, 'ln');
    // 3. une seule résistance
    S.text(672, 18, '3. Une seule résistance', { cls: 'b' });
    S.comp('V', 620, bot, 620, top + 20, { label: '24 V', side: 'l' });
    S.wire([[620, top + 20], [620, top], [694, top]]);
    S.comp('R', 694, top, 694, bot, { label: '8 Ω', val: 'R totale' });
    S.wire([[620, bot], [694, bot]]);
    cur(S, 634, top - 10, 680, top - 10, 'I = 3 A');
    S.text(672, 247, '4 + 4 = 8 Ω | I = 24 ÷ 8 = 3 A', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : lois de Kirchhoff ---------- */
  HQ.figs['kirchhoff'] = function () {
    const S = HQ.S(690, 256, 'À gauche, un nœud où entrent 8 et 4 ampères et d’où sortent 5 et 7 ampères. À droite, une maille : une source de 120 volts et trois chutes de 45, 30 et 45 volts.');
    const inn = { cls: 'c2', marker: 'ahb', tcls: 'sm b th' }, outt = { cls: 'c1', marker: 'ahe', tcls: 'sm b te' };
    S.text(150, 18, 'Loi des nœuds', { cls: 'b' });
    S.wire([[40, 122], [260, 122]]); S.wire([[150, 42], [150, 202]]);
    S.dot(150, 122, 4.5);
    cur(S, 58, 112, 120, 112, '8 A', inn);
    cur(S, 161, 52, 161, 98, '4 A', inn);
    cur(S, 180, 112, 242, 112, '5 A', outt);
    cur(S, 161, 146, 161, 192, '7 A', outt);
    S.text(150, 226, 'il entre 8 + 4 = 12 A', { cls: 'sm b th' });
    S.text(150, 243, 'il sort 5 + 7 = 12 A', { cls: 'sm b te' });
    S.line(310, 12, 310, 244, 'dash');
    S.text(500, 18, 'Loi des mailles', { cls: 'b' });
    S.comp('V', 404, 196, 404, 86, { label: 'U', val: '120 V', side: 'l' });
    S.wire([[404, 86], [404, 66]]);
    S.comp('R', 404, 66, 594, 66, { label: 'U1 = 45 V', cls: 'sm b te' });
    S.comp('R', 594, 66, 594, 216, { label: 'U2 = 30 V', cls: 'sm b te' });
    S.comp('R', 594, 216, 404, 216, { label: 'U3 = 45 V', side: 'b', cls: 'sm b te' });
    S.wire([[404, 216], [404, 196]]);
    S.add('path', { d: 'M475,128 A24,24 0 1 1 499,152', class: 'dash', 'marker-end': 'url(#ahm)' });
    S.text(499, 182, '120 = 45 + 30 + 45', { cls: 'b' });
    return S;
  };

  /* ---------- Démo : série ou parallèle ---------- */
  HQ.widgets['serie-parallele'] = function (c) {
    wk.header(c, 'Série ou parallèle', 'Choisis le montage et règle les valeurs. Le schéma se redessine avec le courant, la tension et la puissance de chaque résistance.');
    let mode = 'serie', n = 3;
    const U = wk.rangeInput('Tension U de la source', 12, 1, 240, 1, v => v + ' V');
    const R = [10, 20, 30].map((v, i) => wk.rangeInput('R' + (i + 1), v, 1, 100, 1, x => x + ' Ω'));
    const box = el('div', { class: 'svg-wrap' }), out = el('div'), note = el('p', { class: 'w-note' });
    const names = idx => idx.map(i => 'R' + (i + 1)).join(' et ');

    function drawSerie(u, r, I) {
      const S = HQ.S(600, 246, 'Circuit série : une source et ' + r.length + ' résistances à la suite');
      S.comp('V', 66, 198, 66, 84, { label: 'U', val: fmt(u, 'V'), side: 'l' });
      const xa = 110, xb = 540, w = (xb - xa) / r.length;
      S.wire([[66, 84], [66, 64], [xa, 64]]);
      r.forEach((rv, i) => {
        const x1 = xa + i * w, m = x1 + w / 2, uk = rv * I;
        S.comp('R', x1, 64, x1 + w, 64, { label: 'R' + (i + 1), val: rv + ' Ω' });
        S.text(m, 97, 'U' + (i + 1) + ' = ' + fmt(uk, 'V', 3), { cls: 'b te' });
        S.text(m, 114, 'P' + (i + 1) + ' = ' + fmt(uk * I, 'W', 3), { cls: 'sm mut' });
      });
      S.wire([[xb, 64], [560, 64], [560, 218], [66, 218], [66, 198]]);
      cur(S, 352, 208, 272, 208, 'I = ' + fmt(I, 'A', 3) + ' partout');
      S.text(313, 164, r.map((rv, i) => 'U' + (i + 1)).join(' + ') + ' = ' + fmt(u, 'V'), { cls: 'mut' });
      return S;
    }
    function drawPar(u, r, IT) {
      const S = HQ.S(600, 246, 'Circuit parallèle : une source et ' + r.length + ' branches');
      S.comp('V', 66, 208, 66, 72, { label: 'U', val: fmt(u, 'V'), side: 'l' });
      const xs = r.length === 3 ? [200, 340, 480] : [230, 410];
      const xl = xs[xs.length - 1];
      S.wire([[66, 72], [66, 52], [xl, 52]]); S.wire([[66, 208], [66, 228], [xl, 228]]);
      r.forEach((rv, i) => {
        const x = xs[i], ik = u / rv;
        S.comp('R', x, 52, x, 228);
        S.text(x + 16, 128, 'R' + (i + 1) + ' = ' + rv + ' Ω', { anchor: 'start', cls: 'b' });
        S.text(x + 16, 145, 'I' + (i + 1) + ' = ' + fmt(ik, 'A', 3), { anchor: 'start', cls: 'sm b th' });
        S.text(x + 16, 161, 'P' + (i + 1) + ' = ' + fmt(u * ik, 'W', 3), { anchor: 'start', cls: 'sm mut' });
        S.arrow(x - 12, 74, x - 12, 104, 'c2', 'ahb');
        if (i < r.length - 1) { S.dot(x, 52); S.dot(x, 228); }
      });
      cur(S, 92, 42, 158, 42, 'I total = ' + fmt(IT, 'A', 3));
      return S;
    }
    function update() {
      const u = U.value, r = R.slice(0, n).map(x => x.value);
      R[2].lab.style.display = n === 3 ? '' : 'none';
      const serie = mode === 'serie';
      const RT = serie ? r.reduce((a, b) => a + b, 0) : 1 / r.reduce((a, b) => a + 1 / b, 0);
      const IT = u / RT;
      const S = serie ? drawSerie(u, r, IT) : drawPar(u, r, IT);
      S.node.style.minWidth = '480px';
      box.replaceChildren(S.node);
      const rmax = Math.max.apply(null, r), rmin = Math.min.apply(null, r);
      const same = rmax === rmin;
      const iMax = r.map((v, i) => (v === rmax ? i : -1)).filter(i => i >= 0), iMin = r.map((v, i) => (v === rmin ? i : -1)).filter(i => i >= 0);
      const list = r.map(v => v + ' Ω');
      out.replaceChildren(wk.readout(serie ? [
        ['R totale = ' + r.map((v, i) => 'R' + (i + 1)).join(' + '), list.map(s => s.replace(' Ω', '')).join(' + ') + ' = ' + fmt(RT, 'Ω')],
        ['Courant I = U ÷ R totale', fmt(IT, 'A')],
        ['Puissance totale P = U × I', fmt(u * IT, 'W')],
        ['Diviseur de tension', 'U1 = ' + num(u) + ' × ' + r[0] + ' ÷ ' + num(RT) + ' = ' + fmt(u * r[0] / RT, 'V')]
      ] : [
        ['R totale (inverse de la somme des inverses)', fmt(RT, 'Ω')],
        ['Courant total = ' + r.map((v, i) => 'I' + (i + 1)).join(' + '), fmt(IT, 'A')],
        ['Puissance totale P = U × I total', fmt(u * IT, 'W')],
        ['Vérification', 'R totale (' + fmt(RT, 'Ω', 3) + ') plus petite que ' + rmin + ' Ω']
      ]));
      if (serie) note.innerHTML = '<strong>En série :</strong> le même courant traverse tout. ' + (same ? 'Les résistances sont égales : elles se partagent la tension en parts égales.' : 'La plus grande résistance (' + names(iMax) + ') prend la plus grande part de la tension et dissipe le plus de puissance.') + ' Si une seule résistance ouvre, le courant tombe à 0 partout.';
      else note.innerHTML = '<strong>En parallèle :</strong> chaque branche reçoit toute la tension de la source. ' + (same ? 'Les résistances sont égales : elles se partagent le courant en parts égales (R totale = R ÷ ' + n + ').' : 'La plus petite résistance (' + names(iMin) + ') tire le plus grand courant et dissipe le plus de puissance.') + ' Si une branche ouvre, les autres continuent de fonctionner.';
    }
    const setSeg = (sg, idx) => sg.node.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === idx));
    const segMode = wk.seg([['serie', 'Série'], ['parallele', 'Parallèle']], 'serie', v => { mode = v; update(); });
    const segN = wk.seg([['2', '2 résistances'], ['3', '3 résistances']], '3', v => { n = +v; update(); });
    function preset(m, u, vals) {
      mode = m; n = 3; setSeg(segMode, m === 'serie' ? 0 : 1); setSeg(segN, 1);
      U.input.value = u; U.val.textContent = u + ' V';
      vals.forEach((v, i) => { R[i].input.value = v; R[i].val.textContent = v + ' Ω'; });
      update();
    }
    const presets = el('div', { class: 'w-row' }, [
      el('span', { class: 'small' }, 'Exemples de la page :'),
      el('button', { type: 'button', class: 'btn small secondary', onclick: () => preset('serie', 12, [10, 20, 30]) }, 'Série : 12 V, 10, 20 et 30 Ω'),
      el('button', { type: 'button', class: 'btn small secondary', onclick: () => preset('parallele', 120, [60, 40, 24]) }, 'Parallèle : 120 V, 60, 40 et 24 Ω')
    ]);
    [U].concat(R).forEach(x => x.input.addEventListener('input', update));
    c.append(el('div', { class: 'w-row' }, [segMode.node, segN.node]), el('div', { class: 'controls' }, [U.lab].concat(R.map(x => x.lab))), presets, box, out, note);
    update();
  };

  /* ---------- Démo : calculateur de puissance et d'énergie ---------- */
  HQ.widgets['puissance-energie'] = function (c) {
    wk.header(c, 'Calculateur de puissance et d’énergie', 'Choisis les deux grandeurs que tu connais et entre leurs valeurs. Règle ensuite la durée d’utilisation pour obtenir l’énergie en kWh.');
    let mode = 'UI';
    const U = wk.numInput('Tension U (V)', 240, { min: 0 });
    const I = wk.numInput('Courant I (A)', 18.75, { min: 0 });
    const R = wk.numInput('Résistance R (Ω)', 12.8, { min: 0 });
    const T = wk.rangeInput('Durée d’utilisation', 3, 0.25, 24, 0.25, v => HQ.fr(v, 2) + ' h');
    const K = wk.numInput('Tarif fictif ($ par kWh)', 0.1, { min: 0, step: 0.01 });
    const box = el('div', { class: 'svg-wrap' }), calc = el('div', { class: 'calc' }), out = el('div');
    const val = x => parseFloat(String(x.input.value).replace(',', '.'));
    const plainW = v => (v < 1e6 ? g4(HQ.sig(v, 4)) + NB + 'W' : HQ.eng(v, 'W', 4));
    const plainK = (v, unit) => g4(HQ.sig(v, 4)) + NB + unit;      // kW, kWh, MJ : jamais de second préfixe
    const money = v => { const q = v.toFixed(2).split('.'); return q[0].replace(/\B(?=(\d{3})+(?!\d))/g, NB) + ',' + q[1] + NB + '$'; };
    const STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    function update() {
      U.lab.style.display = mode === 'IR' ? 'none' : '';
      I.lab.style.display = mode === 'UR' ? 'none' : '';
      R.lab.style.display = mode === 'UI' ? 'none' : '';
      let u = val(U), i = val(I), r = val(R), p, line, third;
      if (mode === 'UI') { p = u * i; r = u / i; line = 'P = U × I = ' + num(u) + ' × ' + num(i); third = ['Résistance R = U ÷ I', fmt(r, 'Ω')]; }
      else if (mode === 'UR') { p = u * u / r; i = u / r; line = 'P = U² ÷ R = ' + num(u) + '² ÷ ' + num(r); third = ['Courant I = U ÷ R', fmt(i, 'A')]; }
      else { p = r * i * i; u = r * i; line = 'P = R × I² = ' + num(r) + ' × ' + num(i) + '²'; third = ['Tension U = R × I', fmt(u, 'V')]; }
      if (!(isFinite(p) && p > 0 && isFinite(u) && isFinite(i) && isFinite(r))) {
        box.replaceChildren(); out.replaceChildren();
        calc.innerHTML = '<p class="w-note">Entre deux valeurs plus grandes que zéro.</p>';
        return;
      }
      const t = T.value, pk = p / 1000, E = pk * t, k = val(K);
      const ymax = STEPS.find(s => s >= pk) || pk;
      const S = HQ.S(600, 232, 'Rectangle dont la largeur est la durée et la hauteur la puissance : son aire représente l’énergie');
      S.node.style.minWidth = '480px';
      const pl = S.plot({ x: 84, y: 36, w: 430, h: 150, xr: [0, 24], yr: [0, ymax], gridx: 6, gridy: 4, xlabel: 'heures' });
      const x1 = pl.sx(0), x2 = pl.sx(t), y1 = pl.sy(pk), y2 = pl.sy(0);
      S.rect(x1, y1, x2 - x1, y2 - y1, 'soft1');
      [0, 4, 8, 12, 16, 20, 24].forEach(v => pl.xtick(v, String(v)));
      [0.5, 1].forEach(q => pl.ytick(ymax * q, HQ.eng(ymax * q * 1000, 'W')));
      S.text(84, 16, 'puissance', { cls: 'sm' });
      const lab = 'E = ' + plainK(E, 'kWh');
      if (x2 - x1 >= 110) S.text((x1 + x2) / 2, (y1 + y2) / 2 + 5, lab, { cls: 'b te' });
      else S.text(x2 + 8, (y1 + y2) / 2 + 5, lab, { anchor: 'start', cls: 'b te' });
      box.replaceChildren(S.node);
      calc.innerHTML = '<p>' + line + ' = <strong>' + plainW(p) + '</strong>' + (p >= 1000 ? ' = ' + plainK(pk, 'kW') : '') + '</p>'
        + '<p>E = P × t = ' + plainK(pk, 'kW') + ' × ' + HQ.fr(t, 2) + ' h = <strong>' + plainK(E, 'kWh') + '</strong></p>';
      out.replaceChildren(wk.readout([
        third,
        ['Puissance P', plainW(p) + (p >= 1000 ? ' = ' + plainK(pk, 'kW') : '')],
        ['Énergie en ' + HQ.fr(t, 2) + ' h', plainK(E, 'kWh') + ' (' + plainK(E * 3.6, 'MJ') + ')'],
        ['Coût au tarif fictif', isFinite(k) && k >= 0 ? money(E * k) : 'entre un tarif']
      ]));
    }
    const segMode = wk.seg([['UI', 'Je connais U et I'], ['UR', 'Je connais U et R'], ['IR', 'Je connais I et R']], 'UI', v => { mode = v; update(); });
    [U, I, R, K].forEach(x => { x.input.addEventListener('input', update); x.input.addEventListener('change', update); });
    T.input.addEventListener('input', update);
    c.append(el('div', { class: 'w-row' }, [segMode.node]), el('div', { class: 'controls' }, [U.lab, I.lab, R.lab, T.lab, K.lab]), calc, box, out,
      el('p', { class: 'w-note' }, 'L’aire du rectangle (puissance × durée) représente l’énergie. Le tarif est fictif : il sert seulement à montrer le calcul du coût.'));
    update();
  };
})();
