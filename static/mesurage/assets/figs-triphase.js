/* Figures et démos de la page « Circuits monophasés et triphasés » */
(function () {
  'use strict';
  const HQ = window.HQ, wk = HQ.wk, el = HQ.el;
  const R3 = Math.sqrt(3), RAD = Math.PI / 180, C30 = Math.cos(30 * RAD);
  // couleurs des phases selon le code du branchement 347/600 V : A rouge, B noir, C bleu
  const COL = { A: { line: 'c2', mark: 'ahb', text: 'th', fill: 'f2', wire: 'wire hot' }, B: { line: 'wire', mark: 'ah', text: '', fill: 'dot', wire: 'wire' }, C: { line: 'c1', mark: 'ahe', text: 'te', fill: 'f1', wire: 'wire acc' } };

  // cote à deux pointes avec son texte
  function cote(S, x1, y1, x2, y2, label) {
    S.add('line', { x1, y1, x2, y2, class: 'c3', style: 'stroke-width:1.4', 'marker-start': 'url(#ahd)', 'marker-end': 'url(#ahd)' });
    if (!label) return;
    if (x1 === x2) S.text(x1 + 7, (y1 + y2) / 2 + 4, label, { anchor: 'start', cls: 'sm b td' });
    else S.text((x1 + x2) / 2, y1 - 6, label, { cls: 'sm b td' });
  }
  // arc fléché (angles en degrés, sens trigonométrique si a1 > a0)
  function arcArrow(S, cx, cy, r, a0, a1, cls, marker) {
    const p = a => (cx + r * Math.cos(a * RAD)).toFixed(1) + ',' + (cy - r * Math.sin(a * RAD)).toFixed(1);
    S.add('path', { d: `M${p(a0)} A${r},${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 0 : 1} ${p(a1)}`, class: cls || 'ln', style: 'stroke-width:1.6', 'marker-end': `url(#${marker || 'ah'})` });
  }
  // couplage en étoile : trois enroulements autour du point neutre
  function drawY(S, cx, cy, r) {
    const A = [cx, cy - r], B = [cx + r * C30, cy + r / 2], C = [cx - r * C30, cy + r / 2];
    S.comp('L', cx, cy, A[0], A[1], { wire: COL.A.wire });
    S.comp('L', cx, cy, B[0], B[1], { wire: COL.B.wire });
    S.comp('L', cx, cy, C[0], C[1], { wire: COL.C.wire });
    S.dot(cx, cy);
    return { A, B, C, N: [cx, cy] };
  }
  // couplage en triangle : trois enroulements entre les bornes A, B et C
  function drawD(S, cx, cy, r) {
    const A = [cx, cy - r], B = [cx + r * C30, cy + r / 2], C = [cx - r * C30, cy + r / 2];
    S.comp('L', A[0], A[1], B[0], B[1]); S.comp('L', B[0], B[1], C[0], C[1]); S.comp('L', C[0], C[1], A[0], A[1]);
    [A, B, C].forEach(q => S.dot(q[0], q[1]));
    return { A, B, C };
  }
  // trois vecteurs tournants ; order = ordre de passage, theta = angle du premier en degrés
  function phasors(S, cx, cy, R, order, theta) {
    S.circle(cx, cy, R, 'dash');
    S.line(cx - R - 8, cy, cx + R + 8, cy, 'grid');
    order.forEach((name, k) => {
      const a = (theta - 120 * k) * RAD, c = COL[name];
      S.add('line', { x1: cx, y1: cy, x2: (cx + R * Math.cos(a)).toFixed(1), y2: (cy - R * Math.sin(a)).toFixed(1), class: c.line, style: 'stroke-width:2.6', 'marker-end': `url(#${c.mark})` });
      S.text(cx + (R + 15) * Math.cos(a), cy - (R + 15) * Math.sin(a) + 5, name, { cls: 'b ' + c.text });
    });
    S.dot(cx, cy, 3);
  }

  /* ---------- Figure : branchement monophasé à trois fils 120/240 V ---------- */
  HQ.figs['mono-3fils'] = function () {
    const S = HQ.S(740, 262, 'Secondaire d’un transformateur de distribution avec prise médiane : 120 V entre chaque ligne et le neutre, 240 V entre les deux lignes');
    const t = S.tr(96, 130);
    S.wire([[36, 106], t.p1]); S.wire([[36, 154], t.p2]);
    S.text(58, 96, '14,4 kV', { cls: 'sm mut' });
    S.text(20, 226, 'Transformateur de distribution', { anchor: 'start', cls: 'sm mut' });
    S.wire([t.s1, [128, 106], [128, 60], [680, 60]]);
    S.wire([t.sc, [480, 130]], 'wire neu');
    S.wire([t.s2, [128, 154], [128, 200], [680, 200]], 'wire hot');
    S.dot(t.sc[0], t.sc[1]);
    S.text(150, 52, 'L1 (noir)', { anchor: 'start', cls: 'b' });
    S.text(170, 122, 'N (blanc)', { anchor: 'start', cls: 'b mut' });
    S.text(150, 192, 'L2 (rouge)', { anchor: 'start', cls: 'b th' });
    S.dot(150, 130); S.gnd(150, 130);
    S.text(164, 158, 'neutre mis à la terre', { anchor: 'start', cls: 'xs mut' });
    S.comp('lamp', 330, 60, 330, 130, { label: 'Éclairage', val: '120 V' }); S.dot(330, 60); S.dot(330, 130);
    S.comp('R', 440, 130, 440, 200, { label: 'Prises', val: '120 V' }); S.dot(440, 130); S.dot(440, 200);
    S.comp('R', 580, 60, 580, 200, { label: 'Cuisinière', val: '240 V' }); S.dot(580, 60); S.dot(580, 200);
    cote(S, 262, 65, 262, 125, '120 V'); cote(S, 262, 135, 262, 195, '120 V');
    cote(S, 690, 65, 690, 195, '240 V');
    S.text(370, 246, '120 V entre une ligne et le neutre | 240 V entre les deux lignes', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : trois tensions décalées de 120 degrés ---------- */
  HQ.figs['trois-sinus'] = function () {
    const S = HQ.S(700, 262, 'Trois sinusoïdes de même amplitude, décalées de 120 degrés l’une par rapport à l’autre');
    const p = S.plot({ x: 60, y: 46, w: 560, h: 170, xr: [0, 540], yr: [-1.25, 1.25], xlabel: 'angle', ylabel: 'tension' });
    ['A', 'B', 'C'].forEach((name, k) => {
      p.curve(x => Math.sin((x - 120 * k) * RAD), COL[name].line);
      S.text(p.sx(90 + 120 * k), p.sy(1) - 8, 'phase ' + name, { cls: 'sm b ' + COL[name].text });
    });
    [120, 240, 360, 480].forEach(v => p.xtick(v, v + '°'));
    S.text(340, 252, 'Chaque phase atteint son maximum 120° après la précédente. À tout instant, la somme des trois tensions est nulle.', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : couplage en étoile ---------- */
  HQ.figs['etoile'] = function () {
    const S = HQ.S(720, 268, 'Couplage en étoile : trois enroulements reliés au point neutre, quatre fils, tension de phase de 347 V et tension de ligne de 600 V');
    const y = drawY(S, 140, 136, 92);
    S.wire([y.A, [600, 44]], COL.A.wire); S.wire([y.N, [600, 136]], 'wire neu');
    S.wire([y.B, [600, 182]], COL.B.wire); S.wire([y.C, [y.C[0], 232], [600, 232]], COL.C.wire);
    S.text(610, 48, 'A (rouge)', { anchor: 'start', cls: 'b th' }); S.text(610, 140, 'N (blanc)', { anchor: 'start', cls: 'b mut' });
    S.text(610, 186, 'B (noir)', { anchor: 'start', cls: 'b' }); S.text(610, 236, 'C (bleu)', { anchor: 'start', cls: 'b te' });
    S.text(152, 128, 'point neutre', { anchor: 'start', cls: 'xs mut' });
    cote(S, 330, 49, 330, 131, 'U phase = 347 V');
    cote(S, 470, 49, 470, 177, 'U ligne = 600 V');
    S.text(360, 258, 'U ligne = 1,732 × U phase | I ligne = I phase', { cls: 'sm b' });
    return S;
  };

  /* ---------- Figure : couplage en triangle ---------- */
  HQ.figs['triangle'] = function () {
    const S = HQ.S(720, 268, 'Couplage en triangle : trois enroulements branchés entre les phases, trois fils, pas de neutre');
    const d = drawD(S, 140, 140, 100);
    S.wire([d.A, [600, 40]], COL.A.wire); S.wire([d.B, [600, 190]], COL.B.wire); S.wire([d.C, [d.C[0], 232], [600, 232]], COL.C.wire);
    S.text(610, 44, 'A (rouge)', { anchor: 'start', cls: 'b th' }); S.text(610, 194, 'B (noir)', { anchor: 'start', cls: 'b' }); S.text(610, 236, 'C (bleu)', { anchor: 'start', cls: 'b te' });
    cote(S, 420, 45, 420, 185, 'U ligne = U phase = 600 V');
    S.current(270, 30, 340, 30, 'I ligne');
    S.text(140, 150, 'I phase', { cls: 'sm th' }); S.text(140, 166, 'dans chaque', { cls: 'xs mut' }); S.text(140, 178, 'enroulement', { cls: 'xs mut' });
    S.text(360, 258, 'U ligne = U phase | I ligne = 1,732 × I phase | pas de neutre', { cls: 'sm b' });
    return S;
  };

  /* ---------- Figure : séquence des phases ---------- */
  HQ.figs['sequence'] = function () {
    const S = HQ.S(740, 262, 'Deux diagrammes de vecteurs : séquence ABC et séquence ACB obtenue en intervertissant deux phases ; le moteur tourne dans l’autre sens');
    S.text(130, 20, 'Séquence ABC', { cls: 'b' });
    phasors(S, 130, 128, 66, ['A', 'B', 'C'], 90);
    arcArrow(S, 130, 128, 96, 112, 162, 'ln', 'ah');
    S.circle(300, 128, 27, 'sym fill'); S.text(300, 134, 'M', { cls: 'lg b' });
    arcArrow(S, 300, 128, 40, 140, 40, 'c3', 'ahd');
    S.text(300, 190, 'le moteur tourne', { cls: 'sm' }); S.text(300, 205, 'dans un sens', { cls: 'sm td' });
    S.line(372, 30, 372, 215, 'dash');
    S.text(490, 20, 'Séquence ACB (B et C intervertis)', { cls: 'b' });
    phasors(S, 490, 128, 66, ['A', 'C', 'B'], 90);
    arcArrow(S, 490, 128, 96, 112, 162, 'ln', 'ah');
    S.circle(660, 128, 27, 'sym fill'); S.text(660, 134, 'M', { cls: 'lg b' });
    arcArrow(S, 660, 128, 40, 40, 140, 'c2', 'ahb');
    S.text(660, 190, 'le moteur tourne', { cls: 'sm' }); S.text(660, 205, 'dans l’autre sens', { cls: 'sm th' });
    S.text(370, 250, 'Les vecteurs tournent dans le sens antihoraire. L’ordre dans lequel ils passent en haut donne la séquence.', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Démo : le triphasé en mouvement ---------- */
  HQ.widgets['triphase-anime'] = function (c) {
    wk.header(c, 'Le triphasé en mouvement', 'Trois vecteurs tournent ensemble, décalés de 120°. La hauteur de chaque pointe donne la tension de sa phase à cet instant : c’est ce que trace le graphique. Déplace le curseur ou lance l’animation.');
    let order = ['A', 'B', 'C'], theta = 60;
    const ang = wk.rangeInput('Angle', theta, 0, 720, 1, v => Math.round(v) + '°');
    const box = el('div', { class: 'svg-wrap' }), out = el('div');
    function draw() {
      const S = HQ.S(720, 252, 'Diagramme des trois vecteurs tournants et graphique des trois tensions');
      phasors(S, 112, 128, 76, order, theta);
      const p = S.plot({ x: 250, y: 34, w: 420, h: 188, xr: [0, 720], yr: [-1.25, 1.25] });
      const vals = {};
      order.forEach((name, k) => { p.curve(x => Math.sin((x - 120 * k) * RAD), COL[name].line); vals[name] = Math.sin((theta - 120 * k) * RAD); });
      [180, 360, 540, 720].forEach(v => p.xtick(v, v + '°'));
      S.line(p.sx(theta), 34, p.sx(theta), 222, 'dash');
      order.forEach(name => S.circle(p.sx(theta), p.sy(vals[name]), 4.6, COL[name].fill));
      box.replaceChildren(S.node);
      const pct = v => (v >= 0 ? '+' : '−') + HQ.fr(Math.abs(100 * v), 0) + ' % de la crête';
      out.replaceChildren(wk.readout([
        ['Phase A', pct(vals.A)], ['Phase B', pct(vals.B)], ['Phase C', pct(vals.C)],
        ['Somme des trois', '0 (à tout instant)'],
        ['Ordre de passage au maximum', order.join(' → ')]
      ]));
    }
    const play = el('button', { class: 'btn small', type: 'button' }, 'Lancer l’animation');
    const an = wk.anim(() => {
      theta = (theta + 1.5) % 720;
      ang.input.value = theta; ang.val.textContent = Math.round(theta) + '°';
      draw();
    });
    play.addEventListener('click', () => { play.textContent = an.toggle() ? 'Mettre en pause' : 'Lancer l’animation'; });
    ang.input.addEventListener('input', () => { theta = ang.value; draw(); });
    const sq = wk.seg([['ABC', 'Séquence ABC'], ['ACB', 'Séquence ACB']], 'ABC', v => { order = v.split(''); draw(); });
    c.append(el('div', { class: 'controls' }, [ang.lab]), el('div', { class: 'w-row' }, [play, sq.node]), box, out);
    draw();
  };

  /* ---------- Démo : calculateur étoile ou triangle ---------- */
  HQ.widgets['calc-couplage'] = function (c) {
    wk.header(c, 'Calculateur étoile ou triangle', 'Choisis le couplage de la charge, la tension entre phases, le courant de ligne et le facteur de puissance. Les puissances sont les mêmes dans les deux couplages : ce sont les grandeurs de phase qui changent.');
    let mode = 'Y';
    const U = wk.selectInput('Tension de ligne (entre phases)', [['208', '208 V'], ['480', '480 V'], ['600', '600 V']], '600');
    const I = wk.rangeInput('Courant de ligne', 20, 1, 100, 1, v => v + ' A');
    const FP = wk.rangeInput('Facteur de puissance', 0.85, 0.5, 1, 0.05, v => HQ.fr(v, 2));
    const box = el('div', { class: 'svg-wrap' }), out = el('div');
    function update() {
      const u = parseFloat(U.input.value), i = I.value, fp = FP.value, star = mode === 'Y';
      const uph = star ? u / R3 : u, iph = star ? i : i / R3;
      const s = R3 * u * i, p = s * fp, q = s * Math.sqrt(Math.max(0, 1 - fp * fp));
      const S = HQ.S(720, 250, star ? 'Charge couplée en étoile avec ses grandeurs de ligne et de phase' : 'Charge couplée en triangle avec ses grandeurs de ligne et de phase');
      const g = star ? drawY(S, 130, 128, 86) : drawD(S, 130, 132, 92);
      S.wire([g.A, [330, g.A[1]]], COL.A.wire); S.wire([g.B, [330, g.B[1]]], COL.B.wire); S.wire([g.C, [g.C[0], 228], [330, 228]], COL.C.wire);
      S.text(338, g.A[1] + 4, 'A', { anchor: 'start', cls: 'b th' }); S.text(338, g.B[1] + 4, 'B', { anchor: 'start', cls: 'b' }); S.text(338, 232, 'C', { anchor: 'start', cls: 'b te' });
      if (star) { S.wire([g.N, [330, g.N[1]]], 'wire neu'); S.text(338, g.N[1] + 4, 'N', { anchor: 'start', cls: 'b mut' }); }
      const rows = [
        ['Tension de ligne', HQ.sig(u, 3) + ' V', 'entre deux phases'],
        ['Tension de phase', HQ.sig(uph, 3) + ' V', star ? 'U ligne ÷ 1,732' : 'égale à la tension de ligne'],
        ['Courant de ligne', HQ.sig(i, 3) + ' A', 'dans chaque fil'],
        ['Courant de phase', HQ.sig(iph, 3) + ' A', star ? 'égal au courant de ligne' : 'I ligne ÷ 1,732']
      ];
      S.text(400, 30, star ? 'Couplage en étoile' : 'Couplage en triangle', { anchor: 'start', cls: 'lg b' });
      rows.forEach((r, k) => {
        S.text(400, 66 + k * 44, r[0] + ' : ' + r[1], { anchor: 'start', cls: 'b' + (k % 2 ? ' td' : '') });
        S.text(400, 82 + k * 44, r[2], { anchor: 'start', cls: 'sm mut' });
      });
      box.replaceChildren(S.node);
      out.replaceChildren(wk.readout([
        ['S = 1,732 × U × I', HQ.eng(s, 'VA')],
        ['P = S × cos φ', HQ.eng(p, 'W')],
        ['Q = S × sin φ', HQ.eng(q, 'var')],
        ['Vérification : 3 × U phase × I phase', HQ.eng(3 * uph * iph, 'VA')]
      ]));
    }
    const sg = wk.seg([['Y', 'Étoile'], ['D', 'Triangle']], 'Y', v => { mode = v; update(); });
    U.input.addEventListener('change', update); I.input.addEventListener('input', update); FP.input.addEventListener('input', update);
    c.append(el('div', { class: 'w-row' }, [sg.node]), el('div', { class: 'controls' }, [U.lab, I.lab, FP.lab]), box, out);
    update();
  };
})();
