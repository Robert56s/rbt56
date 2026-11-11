/* Figures et démos de la page « Électricité de base » */
(function () {
  'use strict';
  const HQ = window.HQ, wk = HQ.wk, el = HQ.el;

  /* ---------- Figure : analogie hydraulique ---------- */
  HQ.figs['analogie-eau'] = function () {
    const S = HQ.S(780, 245, 'À gauche un circuit d’eau avec une pompe et un passage étroit, à droite un circuit électrique avec une source et une résistance');
    const pipe = 'stroke:var(--accent);stroke-opacity:.28;stroke-width:16;fill:none';
    S.text(195, 22, 'Circuit d’eau', { cls: 'b' });
    S.add('rect', { x: 100, y: 60, width: 190, height: 120, rx: 16, style: pipe });
    S.add('rect', { x: 279, y: 100, width: 22, height: 40, style: 'fill:var(--surface);stroke:none' });
    S.add('line', { x1: 290, y1: 100, x2: 290, y2: 140, style: 'stroke:var(--accent);stroke-opacity:.45;stroke-width:5' });
    S.circle(100, 120, 20, 'sym fill'); S.text(100, 125, 'P', { cls: 'b' });
    S.text(72, 116, 'Pompe', { anchor: 'end' }); S.text(72, 132, '(pression)', { anchor: 'end', cls: 'sm mut' });
    S.text(306, 116, 'Passage', { anchor: 'start' }); S.text(306, 132, 'étroit', { anchor: 'start' });
    S.arrow(160, 60, 232, 60, 'c1', 'ahe'); S.text(196, 46, 'débit d’eau', { cls: 'sm te' });
    S.arrow(232, 180, 160, 180, 'c1', 'ahe');

    S.text(590, 22, 'Circuit électrique', { cls: 'b' });
    S.comp('V', 500, 180, 500, 60, { label: 'Source', val: '(tension U)', side: 'l' });
    S.wire([[500, 60], [680, 60]]);
    S.comp('R', 680, 60, 680, 180, { label: 'Résistance R' });
    S.wire([[680, 180], [500, 180]]);
    S.current(555, 50, 630, 50, 'courant I');
    S.current(630, 190, 555, 190);
    S.text(390, 232, 'pression ↔ tension (volts)   |   débit ↔ courant (ampères)   |   passage étroit ↔ résistance (ohms)', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : triangle de la loi d'Ohm ---------- */
  HQ.figs['triangle-ohm'] = function () {
    const S = HQ.S(600, 200, 'Triangle de la loi d’Ohm : U en haut, R et I en bas');
    S.path('M140,20 L240,170 L40,170 Z', 'soft1');
    S.line(87, 100, 193, 100, 'sym'); S.line(140, 100, 140, 170, 'sym');
    S.text(140, 80, 'U', { cls: 'lg b' }); S.text(102, 146, 'R', { cls: 'lg b' }); S.text(178, 146, 'I', { cls: 'lg b' });
    const rows = [['Cache U : il reste R à côté de I', 'U = R × I'], ['Cache I : il reste U au-dessus de R', 'I = U ÷ R'], ['Cache R : il reste U au-dessus de I', 'R = U ÷ I']];
    rows.forEach((r, i) => {
      S.text(285, 52 + i * 52, r[0], { anchor: 'start', cls: 'sm mut' });
      S.text(285, 72 + i * 52, r[1], { anchor: 'start', cls: 'lg b te' });
    });
    return S;
  };

  /* ---------- Figure : courant continu et courant alternatif ---------- */
  HQ.figs['cc-ca'] = function () {
    const S = HQ.S(680, 215, 'Deux graphiques de la tension en fonction du temps : une droite horizontale pour le courant continu, une sinusoïde pour le courant alternatif');
    S.text(170, 20, 'Courant continu (CC)', { cls: 'b' });
    const p1 = S.plot({ x: 60, y: 45, w: 220, h: 140, xr: [0, 1], yr: [-1.3, 1.3], xlabel: 'temps', ylabel: 'tension' });
    p1.curve(() => 1, 'c1');
    S.text(170, 60, 'valeur et sens constants', { cls: 'sm te' });
    S.text(510, 20, 'Courant alternatif (CA)', { cls: 'b' });
    const p2 = S.plot({ x: 400, y: 45, w: 220, h: 140, xr: [0, 1], yr: [-1.3, 1.3], xlabel: 'temps', ylabel: 'tension' });
    p2.curve(x => Math.sin(2 * Math.PI * 2 * x), 'c2');
    S.text(510, 205, 'le sens s’inverse 120 fois par seconde à 60 Hz', { cls: 'sm th' });
    return S;
  };

  /* ---------- Démo : circuit fermé, ouvert ou en court-circuit ---------- */
  HQ.widgets['etat-circuit'] = function (c) {
    wk.header(c, 'Circuit fermé, ouvert ou en court-circuit', 'Choisis un état et observe le chemin du courant.');
    const box = el('div', { class: 'svg-wrap' });
    const note = el('p', { class: 'w-note' });
    const texts = {
      ferme: '<strong>Circuit fermé :</strong> le chemin est complet de la borne + à la borne −. Le courant circule (I = U ÷ R) et la lampe s’allume.',
      ouvert: '<strong>Circuit ouvert :</strong> le chemin est coupé, donc I = 0 A et la lampe est éteinte. Attention : toute la tension de la source se retrouve aux bornes de l’interrupteur ouvert.',
      court: '<strong>Court-circuit :</strong> le courant contourne la lampe par un chemin de résistance presque nulle. Il devient énorme, les fils chauffent : le fusible fond (ou le disjoncteur déclenche) pour couper le circuit.'
    };
    function draw(state) {
      const S = HQ.S(540, 235, 'Circuit avec pile, interrupteur, fusible et lampe');
      const on = state === 'ferme';
      S.comp('bat', 80, 150, 80, 80, { label: 'Pile', val: '12 V', side: 'l' });
      S.text(96, 78, '+', { cls: 'b th' }); S.text(96, 160, '−', { cls: 'b' });
      S.wire([[80, 80], [80, 50], [140, 50]]);
      S.comp('sw', 140, 50, 240, 50, { closed: state !== 'ouvert', label: 'Interrupteur' });
      S.comp('fuse', 240, 50, 340, 50, { label: 'Fusible', val: state === 'court' ? 'il fond' : null });
      S.wire([[340, 50], [460, 50], [460, 80]]);
      S.comp('lamp', 460, 80, 460, 150, { on, label: 'Lampe', val: on ? 'allumée' : 'éteinte' });
      S.wire([[460, 150], [460, 190], [80, 190], [80, 150]]);
      if (on) { S.current(360, 40, 430, 40, 'I'); S.current(300, 200, 230, 200, 'I'); }
      if (state === 'court') {
        S.wire([[390, 50], [390, 190]], 'wire hot'); S.dot(390, 50); S.dot(390, 190);
        S.text(382, 125, 'court-circuit', { anchor: 'end', cls: 'sm th' });
        S.add('line', { x1: 350, y1: 40, x2: 384, y2: 40, class: 'c2', 'marker-end': 'url(#ahb)', style: 'stroke-width:4' });
        S.text(366, 30, 'I très élevé', { cls: 'sm th' });
      }
      if (state === 'ouvert') S.text(190, 92, 'I = 0 A', { cls: 'sm mut' });
      box.replaceChildren(S.node);
      note.innerHTML = texts[state];
    }
    const s = wk.seg([['ferme', 'Fermé'], ['ouvert', 'Ouvert'], ['court', 'Court-circuit']], 'ferme', draw);
    c.append(el('div', { class: 'w-row' }, [s.node]), box, note);
    draw('ferme');
  };

  /* ---------- Démo : loi d'Ohm ---------- */
  HQ.widgets['loi-ohm'] = function (c) {
    wk.header(c, 'La loi d’Ohm en direct', 'Change la tension de la source et la résistance : le courant suit <em>I = U ÷ R</em>.');
    const U = wk.rangeInput('Tension U', 120, 0, 240, 1, v => v + ' V');
    const R = wk.rangeInput('Résistance R', 60, 5, 500, 5, v => v + ' Ω');
    const box = el('div', { class: 'svg-wrap' });
    const out = el('div');
    function update() {
      const u = U.value, r = R.value, i = u / r, p = u * i;
      const S = HQ.S(540, 210, 'Source, résistance et flèche de courant');
      S.comp('V', 90, 170, 90, 50, { label: 'U', val: u + ' V', side: 'l' });
      S.wire([[90, 50], [440, 50]]);
      S.comp('R', 440, 50, 440, 170, { label: 'R', val: r + ' Ω' });
      S.wire([[440, 170], [90, 170]]);
      if (i > 0) {
        const w = Math.min(9, 1.5 + i * 0.5);
        S.add('line', { x1: 200, y1: 50, x2: 330, y2: 50, class: 'c2', 'marker-end': 'url(#ahb)', style: `stroke-width:${w.toFixed(1)}` });
        S.text(265, 34, 'I = ' + HQ.sig(i, 3) + ' A', { cls: 'b th' });
      } else S.text(265, 34, 'I = 0 A', { cls: 'b mut' });
      S.text(265, 115, u + ' V ÷ ' + r + ' Ω = ' + HQ.sig(i, 3) + ' A', { cls: 'lg' });
      box.replaceChildren(S.node);
      out.replaceChildren(wk.readout([
        ['Courant I = U ÷ R', HQ.eng(i, 'A')],
        ['Puissance P = U × I', HQ.eng(p, 'W')],
        ['Si U double (R fixe)', 'I double : ' + HQ.eng(2 * i, 'A')],
        ['Si R double (U fixe)', 'I est divisé par 2 : ' + HQ.eng(i / 2, 'A')]
      ]));
    }
    U.input.addEventListener('input', update); R.input.addEventListener('input', update);
    c.append(el('div', { class: 'controls' }, [U.lab, R.lab]), box, out);
    update();
  };
})();
