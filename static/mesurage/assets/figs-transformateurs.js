/* Figures et démos de la page « Les transformateurs » */
(function () {
  'use strict';
  const HQ = window.HQ, wk = HQ.wk, el = HQ.el;
  const RAD = Math.PI / 180;
  const THIN = 'stroke-width:1.4';
  const r1 = v => Number(v.toFixed(1));
  // comme HQ.fr, avec une espace insécable dès 1000 (1 800 r/min)
  const nb = (x, d) => HQ.fr(x, d).replace(/^(-?\d)(\d{3})(?=,|$)/, '$1\u00a0$2');

  // point d'un cercle : angle en degrés, sens antihoraire à l'écran
  function polar(cx, cy, r, a) { return [r1(cx + r * Math.cos(a * RAD)), r1(cy - r * Math.sin(a * RAD))]; }
  // cote : trait fin avec une pointe de flèche à chaque bout
  function dbl(S, x1, y1, x2, y2, cls, marker) {
    const m = `url(#${marker || 'ahe'})`;
    return S.add('line', { x1, y1, x2, y2, class: cls || 'c1', style: THIN, 'marker-start': m, 'marker-end': m });
  }
  // flèche de courant horizontale, avec son étiquette placée au-dessus de la pointe
  function flow(S, x1, y, x2, label) {
    S.arrow(x1, y, x2, y, 'c2', 'ahb');
    S.text((x1 + x2) / 2, y - 13, label, { cls: 'sm th' });
  }
  // enroulement vertical en demi-cercles de (x, y1) à (x, y2) : n boucles bombées vers la droite (dir = 1) ou la gauche (dir = -1)
  function vcoil(S, x, y1, y2, n, dir, cls) {
    const r = (y2 - y1) / (2 * n);
    let d = `M${x},${y1}`;
    for (let i = 0; i < n; i++) d += ` a${r},${r} 0 0 ${dir > 0 ? 1 : 0} 0,${2 * r}`;
    return S.path(d, cls || 'sym');
  }
  /* transformateur à noyau fermé centré en (cx, cy) : n1 spires dessinées à gauche, n2 à droite, espacées de pitch.
     o.flux = true dessine le trajet du flux. Renvoie les sorties p1, p2 (primaire) et s1, s2 (secondaire). */
  function coreTransfo(S, cx, cy, n1, n2, pitch, o) {
    o = o || {};
    const yc = (i, n) => cy - 4 - pitch / 2 + (i - (n - 1) / 2) * pitch;
    const L = [cx - 101, cx - 55], R = [cx + 101, cx + 55];      // [côté des sorties, côté de la fenêtre]
    const strokes = (X, n, cls, back) => {
      for (let i = 0; i < n; i++) {
        if (back) S.line(X[1], yc(i, n) - 4, X[0], yc(i, n) + pitch + 4, cls);
        else S.line(X[0], yc(i, n) + 4, X[1], yc(i, n) - 4, cls);
      }
    };
    S.g({ style: 'opacity:.45' }, () => { strokes(L, n1, 'c4', true); strokes(R, n2, 'c3', true); });
    S.add('path', { d: `M${cx - 95},${cy - 95} h190 v190 h-190 Z M${cx - 61},${cy - 61} h122 v122 h-122 Z`, class: 'body', 'fill-rule': 'evenodd' });
    if (o.flux) {
      S.add('path', { d: `M${cx - 78},${cy - 78} h156 v156 h-156 Z`, class: 'c1', style: 'stroke-width:1.3;stroke-dasharray:5 4' });
      S.add('line', { x1: cx - 14, y1: cy - 78, x2: cx + 14, y2: cy - 78, class: 'c1', style: THIN, 'marker-end': 'url(#ahe)' });
      S.add('line', { x1: cx + 14, y1: cy + 78, x2: cx - 14, y2: cy + 78, class: 'c1', style: THIN, 'marker-end': 'url(#ahe)' });
    }
    strokes(L, n1, 'c4'); strokes(R, n2, 'c3');
    return { p1: [L[0], cy - n1 * pitch / 2], p2: [L[0], cy + n1 * pitch / 2], s1: [R[0], cy - n2 * pitch / 2], s2: [R[0], cy + n2 * pitch / 2] };
  }

  /* ---------- Figure : principe du transformateur ---------- */
  HQ.figs['transfo-principe'] = function () {
    const S = HQ.S(650, 262, 'Un noyau de fer fermé porte deux enroulements : le primaire, relié à la source alternative, et le secondaire, relié à la charge. Le flux magnétique variable circule dans le noyau et traverse les deux enroulements');
    const cx = 330, cy = 138;
    const t = coreTransfo(S, cx, cy, 8, 4, 10, { flux: true });
    S.wire([t.p1, [110, t.p1[1]]]); S.wire([t.p2, [110, t.p2[1]]]);
    S.comp('AC', 110, t.p2[1], 110, t.p1[1], { label: 'Source', val: 'CA', side: 'l' });
    flow(S, 140, t.p1[1] - 10, 200, 'I₁');
    S.text(170, cy + 6, 'U₁', { cls: 'lg b' });
    S.wire([t.s1, [480, t.s1[1]], [480, cy - 40], [560, cy - 40]]);
    S.wire([t.s2, [480, t.s2[1]], [480, cy + 40], [560, cy + 40]]);
    S.comp('R', 560, cy - 40, 560, cy + 40, { label: 'Charge' });
    flow(S, 490, cy - 50, 550, 'I₂');
    S.text(520, cy + 6, 'U₂', { cls: 'lg b' });
    S.text(cx - 78, 18, 'Primaire', { cls: 'b tw' }); S.text(cx - 78, 34, 'N₁ spires', { cls: 'sm' });
    S.text(cx + 78, 18, 'Secondaire', { cls: 'b td' }); S.text(cx + 78, 34, 'N₂ spires', { cls: 'sm' });
    S.text(cx, cy - 2, 'flux Φ', { cls: 'sm te' }); S.text(cx, cy + 13, 'variable', { cls: 'sm te' });
    S.text(cx, 252, 'Noyau de tôles de fer feuilletées', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : pertes et rendement ---------- */
  HQ.figs['pertes-transfo'] = function () {
    const S = HQ.S(620, 206, 'Bilan de puissance : 10 kilowatts absorbés au primaire, 9,7 kilowatts fournis au secondaire, 0,1 kilowatt de pertes dans le fer et 0,2 kilowatt de pertes dans le cuivre');
    S.path('M150,48 L440,48 L440,34 L484,78 L440,122 L440,108 L150,108 Z', 'soft1');
    S.path('M205,108 L235,108 L235,138 L246,138 L220,160 L194,138 L205,138 Z', 'soft4');
    S.path('M385,108 L415,108 L415,138 L426,138 L400,160 L374,138 L385,138 Z', 'soft2');
    S.text(310, 83, 'Transformateur', { cls: 'b' });
    S.text(138, 74, 'Puissance absorbée', { anchor: 'end', cls: 'b' });
    S.text(138, 91, 'P₁ = 10 kW', { anchor: 'end' });
    S.text(494, 74, 'Puissance fournie', { anchor: 'start', cls: 'b' });
    S.text(494, 91, 'P₂ = 9,7 kW', { anchor: 'start' });
    S.text(220, 178, 'Pertes fer : 0,1 kW', { cls: 'sm b tw' });
    S.text(220, 194, 'noyau, constantes', { cls: 'sm mut' });
    S.text(400, 178, 'Pertes cuivre : 0,2 kW', { cls: 'sm b th' });
    S.text(400, 194, 'enroulements, selon la charge', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : transformateur de distribution 14,4 kV - 120/240 V ---------- */
  HQ.figs['transfo-distribution'] = function () {
    const S = HQ.S(700, 280, 'Transformateur de distribution : le primaire est branché entre une phase de 14 400 volts et le neutre. Le secondaire de 240 volts a une prise médiane reliée au neutre et à la terre : 120 volts entre chaque ligne et le neutre, 240 volts entre les deux lignes');
    S.text(130, 24, 'Moyenne tension', { cls: 'b' });
    S.text(430, 24, 'Basse tension : 120/240 V', { cls: 'b' });
    // côté primaire
    S.wire([[40, 90], [150, 90]]); S.comp('fuse', 150, 90, 226, 90, { label: 'Fusible' }); S.wire([[226, 90], [262, 90]]);
    S.wire([[40, 210], [262, 210]], 'wire neu');
    S.text(40, 82, 'Phase', { anchor: 'start', cls: 'sm b' }); S.text(40, 202, 'Neutre', { anchor: 'start', cls: 'sm b' });
    dbl(S, 100, 97, 100, 203);
    S.text(108, 148, '14 400 V', { anchor: 'start', cls: 'b te' }); S.text(108, 164, '(14,4 kV)', { anchor: 'start', cls: 'sm mut' });
    S.dot(190, 210); S.gnd(190, 210);
    // transformateur
    S.rect(238, 68, 90, 164, 'dash', 8);
    S.text(283, 60, 'Transformateur', { cls: 'sm b' });
    vcoil(S, 262, 90, 210, 6, 1); S.line(280, 84, 280, 216, 'sym'); S.line(286, 84, 286, 216, 'sym'); vcoil(S, 304, 90, 210, 6, -1);
    S.text(283, 252, 'rapport : 14 400 ÷ 240 = 60', { cls: 'sm' });
    // côté secondaire
    S.wire([[304, 90], [520, 90]]); S.wire([[304, 150], [520, 150]], 'wire neu'); S.wire([[304, 210], [520, 210]], 'wire hot');
    [[90, 'L1', 664], [150, 'N', 630], [210, 'L2', 664]].forEach(q => {
      S.circle(523, q[0], 3, 'sym fill'); S.text(532, q[0] + 4, q[1], { anchor: 'start', cls: 'b' }); S.line(556, q[0], q[2], q[0], 'dash');
    });
    dbl(S, 585, 96, 585, 144); S.text(592, 124, '120 V', { anchor: 'start', cls: 'b te' });
    dbl(S, 585, 156, 585, 204); S.text(592, 184, '120 V', { anchor: 'start', cls: 'b te' });
    dbl(S, 648, 96, 648, 204); S.text(655, 154, '240 V', { anchor: 'start', cls: 'b te' });
    S.dot(400, 150); S.gnd(400, 150);
    S.text(416, 172, 'prise médiane mise à la terre', { anchor: 'start', cls: 'sm tok' });
    S.text(350, 82, 'ligne 1', { cls: 'sm mut' }); S.text(350, 228, 'ligne 2', { cls: 'sm mut' }); S.text(350, 142, 'neutre', { cls: 'sm mut' });
    S.text(480, 252, 'vers le branchement du client (3 fils)', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : bornes et points de polarité ---------- */
  HQ.figs['polarite'] = function () {
    const S = HQ.S(440, 194, 'Transformateur avec les bornes H1 et H2 du côté haute tension, X1 et X2 du côté basse tension, et un point de polarité près de H1 et de X1');
    const x0 = 220, yt = 94, yb = 174;
    S.text(x0 - 96, 20, 'Haute tension', { cls: 'b' }); S.text(x0 - 96, 36, 'primaire', { cls: 'sm mut' });
    S.text(x0 + 96, 20, 'Basse tension', { cls: 'b' }); S.text(x0 + 96, 36, 'secondaire', { cls: 'sm mut' });
    vcoil(S, x0 - 18, yt, yb, 5, 1); S.line(x0 - 3, yt - 6, x0 - 3, yb + 6, 'sym'); S.line(x0 + 3, yt - 6, x0 + 3, yb + 6, 'sym'); vcoil(S, x0 + 18, yt, yb, 5, -1);
    [[yt, '1'], [yb, '2']].forEach(q => {
      S.wire([[x0 - 18, q[0]], [x0 - 109, q[0]]]); S.circle(x0 - 112, q[0], 3, 'sym fill'); S.text(x0 - 121, q[0] + 4, 'H' + q[1], { anchor: 'end', cls: 'b' });
      S.wire([[x0 + 18, q[0]], [x0 + 109, q[0]]]); S.circle(x0 + 112, q[0], 3, 'sym fill'); S.text(x0 + 121, q[0] + 4, 'X' + q[1], { anchor: 'start', cls: 'b' });
    });
    S.dot(x0 - 30, yt - 12, 4); S.dot(x0 + 30, yt - 12, 4);
    flow(S, x0 - 104, yt - 12, x0 - 50, 'I₁ entre par H1');
    flow(S, x0 + 50, yt - 12, x0 + 104, 'I₂ sort par X1');
    S.text(x0 - 96, yt + 22, '+', { cls: 'b th' }); S.text(x0 - 96, yb - 8, '−', { cls: 'b th' });
    S.text(x0 + 96, yt + 22, '+', { cls: 'b th' }); S.text(x0 + 96, yb - 8, '−', { cls: 'b th' });
    S.text(x0 - 62, (yt + yb) / 2 + 5, 'U₁', { cls: 'lg b' }); S.text(x0 + 62, (yt + yb) / 2 + 5, 'U₂', { cls: 'lg b' });
    return S;
  };

  /* ---------- Figure : transformateur de courant et transformateur de tension ---------- */
  HQ.figs['tc-tt'] = function () {
    const S = HQ.S(720, 326, 'Sur une ligne, un transformateur de courant branché en série alimente un ampèremètre ou un compteur, et un transformateur de tension branché en parallèle, protégé par des fusibles, alimente un voltmètre ou un compteur');
    S.wire([[40, 70], [680, 70]], 'wire thick');
    S.text(40, 92, 'Source', { anchor: 'start', cls: 'sm mut' }); S.text(680, 92, 'Charge', { anchor: 'end', cls: 'sm mut' });
    flow(S, 64, 58, 124, 'I = 128 A');
    // transformateur de courant
    S.text(200, 28, 'Transformateur de courant (TC)', { cls: 'b' });
    S.path('M176,78 a8,8 0 0 0 16,0 a8,8 0 0 0 16,0 a8,8 0 0 0 16,0');
    S.wire([[176, 78], [176, 170]]); S.wire([[224, 78], [224, 170]]);
    S.comp('meter', 176, 170, 224, 170, { letter: 'A' });
    S.wire([[176, 170], [176, 188]]); S.gnd(176, 188);
    S.text(236, 110, 'rapport 200:5', { anchor: 'start', cls: 'sm b' });
    S.text(236, 126, 'primaire en série', { anchor: 'start', cls: 'sm' });
    S.text(236, 166, 'ampèremètre', { anchor: 'start', cls: 'sm mut' });
    S.text(236, 180, 'ou compteur', { anchor: 'start', cls: 'sm mut' });
    S.text(166, 132, '3,2 A', { anchor: 'end', cls: 'b th' });
    // transformateur de tension
    S.text(560, 28, 'Transformateur de tension (TT)', { cls: 'b' });
    S.dot(470, 70);
    S.comp('fuse', 470, 70, 470, 132, { label: 'Fusible', side: 'l' });
    S.wire([[470, 132], [470, 136]]);
    vcoil(S, 470, 136, 216, 4, 1); S.line(487, 130, 487, 222, 'sym'); S.line(493, 130, 493, 222, 'sym'); vcoil(S, 510, 136, 216, 4, -1);
    S.wire([[470, 216], [470, 232]]); S.gnd(470, 232);
    S.wire([[510, 136], [540, 136]]); S.comp('fuse', 540, 136, 600, 136); S.wire([[600, 136], [640, 136]]);
    S.comp('meter', 640, 136, 640, 216, { letter: 'V' });
    S.wire([[640, 216], [510, 216]]); S.dot(565, 216); S.gnd(565, 216);
    S.text(455, 172, 'rapport 14 400:120', { anchor: 'end', cls: 'sm b' });
    S.text(455, 188, 'primaire en parallèle', { anchor: 'end', cls: 'sm' });
    S.text(616, 181, '120 V', { anchor: 'end', cls: 'b th' });
    S.text(640, 250, 'voltmètre ou compteur', { cls: 'sm mut' });
    // lectures
    S.text(200, 278, '3,2 A × 40 = 128 A', { cls: 'b te' });
    S.text(200, 295, 'Ne jamais ouvrir le secondaire', { cls: 'sm th' });
    S.text(560, 278, '120 V × 120 = 14 400 V', { cls: 'b te' });
    S.text(560, 295, 'Ne jamais court-circuiter le secondaire', { cls: 'sm th' });
    S.text(360, 318, 'Multiplicateur du compteur : 40 × 120 = 4\u00a0800', { cls: 'b' });
    return S;
  };

  /* ---------- Figure : transformateur d'isolement et autotransformateur ---------- */
  HQ.figs['autotransfo'] = function () {
    const S = HQ.S(620, 204, 'À gauche un transformateur d’isolement à deux enroulements séparés, à droite un autotransformateur dont l’unique enroulement porte une prise');
    S.text(150, 22, 'Transformateur d’isolement', { cls: 'b' });
    S.text(150, 38, 'rapport 1:1', { cls: 'sm mut' });
    vcoil(S, 132, 62, 142, 5, 1); S.line(147, 56, 147, 148, 'sym'); S.line(153, 56, 153, 148, 'sym'); vcoil(S, 168, 62, 142, 5, -1);
    [62, 142].forEach(y => {
      S.wire([[132, y], [53, y]]); S.circle(50, y, 3, 'sym fill');
      S.wire([[168, y], [247, y]]); S.circle(250, y, 3, 'sym fill');
    });
    S.text(88, 107, '120 V', { cls: 'b te' }); S.text(212, 107, '120 V', { cls: 'b te' });
    S.text(150, 176, 'Deux enroulements séparés :', { cls: 'sm' });
    S.text(150, 192, 'aucun lien électrique entre les deux', { cls: 'sm b tok' });

    S.text(470, 22, 'Autotransformateur', { cls: 'b' });
    S.text(470, 38, 'un seul enroulement à prise', { cls: 'sm mut' });
    S.line(446, 66, 446, 138, 'sym'); S.line(452, 66, 452, 138, 'sym');
    vcoil(S, 470, 52, 152, 5, -1);
    [52, 152].forEach(y => { S.wire([[470, y], [383, y]]); S.circle(380, y, 3, 'sym fill'); });
    [72, 152].forEach(y => { S.wire([[470, y], [557, y]]); S.circle(560, y, 3, 'sym fill'); S.dot(470, y); });
    S.text(408, 107, '600 V', { cls: 'b te' }); S.text(528, 117, '480 V', { cls: 'b te' });
    S.text(470, 176, 'Entrée et sortie partagent le même enroulement :', { cls: 'sm' });
    S.text(470, 192, 'pas d’isolation entre les deux', { cls: 'sm b th' });
    return S;
  };

  /* ---------- Démo : rapport de transformation ---------- */
  HQ.widgets['transfo'] = function (c) {
    wk.header(c, 'Le transformateur en chiffres', 'Change les nombres de spires, la tension du primaire et le courant de la charge : le rapport de transformation fixe tout le reste.');
    let u1 = 600;
    const N1 = wk.rangeInput('Spires au primaire N<sub>1</sub>', 500, 50, 3000, 50, v => nb(v, 0));
    const N2 = wk.rangeInput('Spires au secondaire N<sub>2</sub>', 100, 50, 3000, 50, v => nb(v, 0));
    const I2 = wk.rangeInput('Courant de la charge I<sub>2</sub>', 12, 0, 200, 1, v => v + ' A');
    const box = el('div', { class: 'svg-wrap' }), out = el('div'), note = el('p', { class: 'w-note' });
    function update() {
      const n1 = N1.value, n2 = N2.value, i2 = I2.value;
      const a = n1 / n2, u2 = u1 / a, i1 = i2 / a, s = u2 * i2;
      const kind = a > 1 ? 'Abaisseur' : (a < 1 ? 'Élévateur' : 'Isolement');
      const big = Math.max(n1, n2);
      const d1 = Math.max(2, Math.round(12 * n1 / big)), d2 = Math.max(2, Math.round(12 * n2 / big));
      const S = HQ.S(560, 250, 'Transformateur à noyau : source et enroulement primaire à gauche, enroulement secondaire et charge à droite, avec les tensions et les courants calculés');
      const cx = 280, cy = 142;
      const t = coreTransfo(S, cx, cy, d1, d2, 8);
      S.wire([t.p1, [cx - 124, t.p1[1]], [cx - 124, cy - 50], [84, cy - 50]]);
      S.wire([t.p2, [cx - 124, t.p2[1]], [cx - 124, cy + 50], [84, cy + 50]]);
      S.comp('AC', 84, cy + 50, 84, cy - 50, { label: 'U₁', val: HQ.eng(u1, 'V'), side: 'l' });
      S.wire([t.s1, [cx + 124, t.s1[1]], [cx + 124, cy - 50], [476, cy - 50]]);
      S.wire([t.s2, [cx + 124, t.s2[1]], [cx + 124, cy + 50], [476, cy + 50]]);
      S.comp('R', 476, cy - 50, 476, cy + 50, { label: 'U₂', val: HQ.eng(u2, 'V') });
      flow(S, 98, cy - 60, 146, 'I₁ = ' + HQ.eng(i1, 'A'));
      flow(S, 414, cy - 60, 462, 'I₂ = ' + HQ.eng(i2, 'A'));
      S.text(cx - 78, 20, 'N₁ = ' + nb(n1, 0) + ' spires', { cls: 'b tw' }); S.text(cx - 78, 36, 'primaire', { cls: 'sm mut' });
      S.text(cx + 78, 20, 'N₂ = ' + nb(n2, 0) + ' spires', { cls: 'b td' }); S.text(cx + 78, 36, 'secondaire', { cls: 'sm mut' });
      S.text(cx, cy - 4, kind, { cls: 'b' });
      S.text(cx, cy + 13, 'a = ' + HQ.sig(a, 3), { cls: 'sm' });
      box.replaceChildren(S.node);
      const why = a > 1 ? 'Abaisseur : tension plus basse et courant plus fort au secondaire'
        : (a < 1 ? 'Élévateur : tension plus haute et courant plus faible au secondaire' : 'Rapport 1:1 : même tension et même courant des deux côtés');
      out.replaceChildren(wk.readout([
        ['Rapport a = N<sub>1</sub> ÷ N<sub>2</sub>', nb(n1, 0) + ' ÷ ' + nb(n2, 0) + ' = ' + HQ.sig(a, 3)],
        ['Tension U<sub>2</sub> = U<sub>1</sub> ÷ a', HQ.eng(u2, 'V')],
        ['Courant I<sub>1</sub> = I<sub>2</sub> ÷ a', HQ.eng(i1, 'A')],
        ['Puissance S = U<sub>2</sub> × I<sub>2</sub>', HQ.eng(s, 'VA')]
      ]));
      note.innerHTML = '<strong>' + why + '.</strong> Vérification (transformateur idéal) : U<sub>1</sub> × I<sub>1</sub> = ' + HQ.eng(u1, 'V') + ' × ' + HQ.eng(i1, 'A') + ' = ' + HQ.eng(u1 * i1, 'VA') + ', la même puissance qu’au secondaire.';
    }
    const segU = wk.seg([['120', '120 V'], ['240', '240 V'], ['600', '600 V'], ['14400', '14\u00a0400 V']], '600', v => { u1 = +v; update(); });
    [N1, N2, I2].forEach(r => r.input.addEventListener('input', update));
    c.append(el('div', { class: 'w-row' }, [el('span', { class: 'small' }, 'Tension au primaire U₁ :'), segU.node]),
      el('div', { class: 'controls' }, [N1.lab, N2.lab, I2.lab]), box, out, note);
    update();
  };

  /* ---------- Démo : transformateur de courant ---------- */
  HQ.widgets['tc'] = function (c) {
    wk.header(c, 'Lire un transformateur de courant', 'Choisis le rapport du TC, puis bouge l’un ou l’autre curseur : le courant de ligne et la lecture au secondaire restent liés par le rapport.');
    let prim = 200;
    const IL = wk.rangeInput('Courant réel dans la ligne', 128, 0, 200, 2, v => HQ.fr(v, 0) + ' A');
    const IS = wk.rangeInput('Lecture de l’appareil au secondaire', 3.2, 0, 5, 0.05, v => HQ.fr(v, 2) + ' A');
    const box = el('div', { class: 'svg-wrap' }), out = el('div'), note = el('p', { class: 'w-note' });
    const setR = (r, v, fmt) => { r.input.value = v; r.val.textContent = fmt(parseFloat(r.input.value)); };
    const fmtL = v => HQ.fr(v, 0) + ' A', fmtS = v => HQ.fr(v, 2) + ' A';
    function draw() {
      const k = prim / 5, il = IL.value, is = il / k;
      const S = HQ.S(540, 240, 'Un conducteur traverse un transformateur de courant dont le secondaire alimente un ampèremètre gradué de 0 à 5 ampères');
      S.wire([[30, 56], [510, 56]], 'wire thick');
      flow(S, 50, 46, 120, 'I ligne = ' + fmtL(il));
      S.text(270, 30, 'TC ' + prim + ':5 | rapport ' + k, { cls: 'b' });
      S.text(500, 44, 'vers la charge', { anchor: 'end', cls: 'sm mut' });
      S.path('M246,66 a8,8 0 0 0 16,0 a8,8 0 0 0 16,0 a8,8 0 0 0 16,0');
      S.wire([[246, 66], [246, 118]]); S.wire([[294, 66], [294, 118]]);
      S.rect(190, 118, 160, 108, 'panel', 10);
      const px = 270, py = 204;
      S.add('path', { d: `M${polar(px, py, 62, 150).join(',')} A62,62 0 0 1 ${polar(px, py, 62, 30).join(',')}`, class: 'ln' });
      for (let i = 0; i <= 5; i++) {
        const a = 150 - i * 24, p0 = polar(px, py, 56, a), p1 = polar(px, py, 62, a), pt = polar(px, py, 72, a);
        S.line(p0[0], p0[1], p1[0], p1[1], 'ln');
        S.add('text', { x: pt[0], y: pt[1], 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'xs' }, String(i));
      }
      const tip = polar(px, py, 52, 150 - Math.min(5, is) / 5 * 120);
      S.line(px, py, tip[0], tip[1], 'needle'); S.circle(px, py, 4, 'dot');
      S.text(px, 222, 'A', { cls: 'sm b mut' });
      S.text(178, 164, 'Ampèremètre', { anchor: 'end', cls: 'b' });
      S.text(178, 180, 'gradué de 0 à 5 A', { anchor: 'end', cls: 'sm mut' });
      S.text(362, 160, 'Lecture', { anchor: 'start', cls: 'sm mut' });
      S.text(362, 180, fmtS(is), { anchor: 'start', cls: 'lg b th' });
      S.text(362, 198, '× ' + k + ' = ' + fmtL(il), { anchor: 'start', cls: 'sm' });
      box.replaceChildren(S.node);
      out.replaceChildren(wk.readout([
        ['Rapport du TC', prim + ' ÷ 5 = ' + k],
        ['Ligne → secondaire', fmtL(il) + ' ÷ ' + k + ' = ' + fmtS(is)],
        ['Lecture → courant réel', fmtS(is) + ' × ' + k + ' = ' + fmtL(il)],
        ['Multiplicateur (TC seul)', '× ' + k]
      ]));
      note.textContent = 'Un compteur branché sur ce TC n’enregistre qu’une fraction de l’énergie : on multiplie sa lecture par ' + k + '. Avec en plus un TT de 14\u00a0400:120, le multiplicateur serait ' + k + ' × 120 = ' + nb(k * 120, 0) + '.';
    }
    IL.input.addEventListener('input', () => { setR(IS, IL.value / (prim / 5), fmtS); draw(); });
    IS.input.addEventListener('input', () => { setR(IL, IS.value * (prim / 5), fmtL); draw(); });
    const seg = wk.seg([['100', '100:5'], ['200', '200:5'], ['400', '400:5'], ['800', '800:5']], '200', v => {
      const old = IL.value;
      prim = +v;
      const step = prim / 100;
      IL.input.max = prim; IL.input.step = step;
      setR(IL, Math.round(Math.min(old, prim) / step) * step, fmtL);
      setR(IS, IL.value / (prim / 5), fmtS);
      draw();
    });
    c.append(el('div', { class: 'w-row' }, [el('span', { class: 'small' }, 'Rapport du TC :'), seg.node]),
      el('div', { class: 'controls' }, [IL.lab, IS.lab]), box, out, note);
    draw();
  };
})();
