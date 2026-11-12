/* Figures et démos de la page « Électrotechnique de base » */
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
  // arc de cercle de l'angle a0 à l'angle a1 (antihoraire si a1 > a0), pointe de flèche facultative
  function arc(S, cx, cy, r, a0, a1, cls, marker, style) {
    const p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    return S.add('path', {
      d: `M${p0[0]},${p0[1]} A${r},${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 0 : 1} ${p1[0]},${p1[1]}`,
      class: cls || 'c1', style: style || null, 'marker-end': marker ? `url(#${marker})` : null
    });
  }
  // ligne de champ (courbe de Bézier à 4 points) avec une pointe de flèche au milieu
  function fieldLine(S, p, cls, marker) {
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const a = mid(p[0], p[1]), b = mid(p[1], p[2]), c = mid(p[2], p[3]), d = mid(a, b), e = mid(b, c), f = mid(d, e);
    const pt = q => r1(q[0]) + ',' + r1(q[1]);
    S.add('path', { d: `M${pt(p[0])} C${pt(a)} ${pt(d)} ${pt(f)}`, class: cls, style: THIN, 'marker-end': `url(#${marker})` });
    S.add('path', { d: `M${pt(f)} C${pt(e)} ${pt(c)} ${pt(p[3])}`, class: cls, style: THIN });
  }
  // aimant droit horizontal : pôle de gauche puis pôle de droite ('N' ou 'S')
  function magnet(S, x, y, w, h, left, right) {
    const half = w / 2;
    [[left, x], [right, x + half]].forEach(q => {
      S.rect(q[1], y, half, h, q[0] === 'N' ? 'soft2' : 'soft1');
      S.text(q[1] + half / 2, y + h / 2 + 5, q[0], { cls: 'b ' + (q[0] === 'N' ? 'th' : 'te') });
    });
  }
  /* bobine enroulée sur un barreau horizontal (x, y, w, h) : n spires à partir de x0, espacées de pitch.
     Renvoie les deux sorties a (à gauche) et b (à droite), sous le barreau. */
  function winding(S, x, y, w, h, n, x0, pitch, cls, coreCls) {
    const top = y - 4, bot = y + h + 4, dx = 10;
    for (let i = -1; i < n - 1; i++) S.line(x0 + i * pitch + dx, bot, x0 + (i + 1) * pitch, top, cls);   // brins arrière
    S.rect(x, y, w, h, coreCls || 'body', 3);
    for (let i = 0; i < n; i++) S.line(x0 + i * pitch, top, x0 + i * pitch + dx, bot, cls);              // brins avant
    return { a: [x0 - pitch + dx, bot], b: [x0 + (n - 1) * pitch + dx, bot] };
  }

  /* ---------- Figure : aimant, lignes de champ, attraction et répulsion ---------- */
  HQ.figs['aimant-champ'] = function () {
    const S = HQ.S(700, 250, 'Un aimant droit et ses lignes de champ, qui sortent du pôle nord et entrent au pôle sud. À droite, deux aimants qui s’attirent et deux aimants qui se repoussent');
    S.text(190, 18, 'Le champ d’un aimant droit', { cls: 'b' });
    const loops = [
      [[142, 108], [142, 84], [238, 84], [238, 108]],
      [[128, 108], [104, 54], [276, 54], [252, 108]],
      [[120, 116], [14, 14], [366, 14], [260, 116]]
    ];
    loops.forEach(p => {
      fieldLine(S, p, 'c1', 'ahe');
      fieldLine(S, p.map(q => [q[0], 250 - q[1]]), 'c1', 'ahe');
    });
    S.add('line', { x1: 118, y1: 125, x2: 68, y2: 125, class: 'c1', style: THIN, 'marker-end': 'url(#ahe)' });
    S.add('line', { x1: 314, y1: 125, x2: 264, y2: 125, class: 'c1', style: THIN, 'marker-end': 'url(#ahe)' });
    magnet(S, 120, 108, 140, 34, 'N', 'S');
    S.text(190, 243, 'À l’extérieur de l’aimant : du nord vers le sud', { cls: 'sm te' });

    S.text(530, 40, 'Pôles contraires : ils s’attirent', { cls: 'b' });
    magnet(S, 410, 54, 90, 28, 'N', 'S'); magnet(S, 560, 54, 90, 28, 'N', 'S');
    S.arrow(432, 98, 478, 98, 'c3', 'ahd'); S.arrow(628, 98, 582, 98, 'c3', 'ahd');
    S.text(530, 150, 'Pôles identiques : ils se repoussent', { cls: 'b' });
    magnet(S, 410, 164, 90, 28, 'S', 'N'); magnet(S, 560, 164, 90, 28, 'N', 'S');
    S.arrow(478, 208, 432, 208, 'c2', 'ahb'); S.arrow(582, 208, 628, 208, 'c2', 'ahb');
    S.text(530, 243, 'Les flèches montrent la force sur chaque aimant', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : champ autour d'un conducteur et d'une bobine ---------- */
  HQ.figs['champ-courant'] = function () {
    const S = HQ.S(740, 262, 'Le champ magnétique tourne autour d’un fil parcouru par un courant ; une bobine sur un noyau de fer forme un électroaimant avec un pôle nord et un pôle sud');
    const BACK = 'stroke-width:1.4;stroke-opacity:.45';
    // A : fil droit vertical, courant vers le haut
    S.text(110, 18, 'Règle de la main droite', { cls: 'b' });
    // demi-ellipse arrière (pâle) puis, après le fil, demi-ellipse avant ; la pointe de flèche est placée à côté du fil
    [82, 152].forEach(cy => {
      S.add('path', { d: `M168,${cy} A58,17 0 0 0 76.7,${cy - 13.9}`, class: 'c1', style: BACK, 'marker-end': 'url(#ahe)' });
      S.add('path', { d: `M76.7,${cy - 13.9} A58,17 0 0 0 52,${cy}`, class: 'c1', style: BACK });
    });
    S.line(110, 34, 110, 228, 'wire thick');
    [82, 152].forEach(cy => {
      S.add('path', { d: `M52,${cy} A58,17 0 0 0 143.3,${cy + 13.9}`, class: 'c1', style: THIN, 'marker-end': 'url(#ahe)' });
      S.add('path', { d: `M143.3,${cy + 13.9} A58,17 0 0 0 168,${cy}`, class: 'c1', style: THIN });
    });
    S.arrow(128, 226, 128, 194, 'c2', 'ahb');
    S.text(137, 216, 'courant I', { anchor: 'start', cls: 'sm th' });
    S.text(176, 86, 'champ', { anchor: 'start', cls: 'sm te' });
    S.text(110, 252, 'pouce : courant | doigts : champ', { cls: 'sm' });

    // B : conducteurs vus en coupe
    S.text(362, 18, 'Le fil vu en coupe', { cls: 'b' });
    S.circle(300, 108, 38, 'c1').setAttribute('style', THIN);
    arc(S, 300, 108, 38, 30, 85, 'c1', 'ahe', THIN); arc(S, 300, 108, 38, 210, 265, 'c1', 'ahe', THIN);
    S.circle(300, 108, 13, 'sym fill'); S.dot(300, 108, 3.6);
    S.circle(424, 108, 38, 'c1').setAttribute('style', THIN);
    arc(S, 424, 108, 38, 150, 95, 'c1', 'ahe', THIN); arc(S, 424, 108, 38, 330, 275, 'c1', 'ahe', THIN);
    S.circle(424, 108, 13, 'sym fill');
    S.line(417, 101, 431, 115, 'sym'); S.line(417, 115, 431, 101, 'sym');
    S.text(300, 172, ['Point : le courant', 'vient vers toi'], { cls: 'sm' });
    S.text(300, 212, 'champ antihoraire', { cls: 'sm te' });
    S.text(424, 172, ['Croix : le courant', 's’éloigne de toi'], { cls: 'sm' });
    S.text(424, 212, 'champ horaire', { cls: 'sm te' });

    // C : bobine sur un noyau de fer
    S.text(610, 18, 'Bobine sur un noyau de fer', { cls: 'b' });
    fieldLine(S, [[710, 108], [772, 24], [448, 24], [510, 108]], 'c1', 'ahe');
    fieldLine(S, [[698, 100], [698, 62], [522, 62], [522, 100]], 'c1', 'ahe');
    S.add('line', { x1: 712, y1: 115, x2: 736, y2: 115, class: 'c1', style: THIN, 'marker-end': 'url(#ahe)' });
    S.add('line', { x1: 484, y1: 115, x2: 508, y2: 115, class: 'c1', style: THIN, 'marker-end': 'url(#ahe)' });
    const wd = winding(S, 510, 100, 200, 30, 7, 545, 18, 'c4');
    S.text(524, 120, 'S', { cls: 'b te' }); S.text(694, 120, 'N', { cls: 'b th' });
    S.wire([wd.a, [wd.a[0], 192]], 'c4'); S.wire([wd.b, [wd.b[0], 192]], 'c4');
    S.comp('bat', wd.b[0], 192, wd.a[0], 192, { label: 'Source CC', side: 'b', wire: 'c4' });
    S.text(584, 187, '+', { cls: 'b th' }); S.text(616, 187, '−', { cls: 'b' });
    S.arrow(525, 182, 525, 150, 'c2', 'ahb'); S.text(517, 170, 'I', { anchor: 'end', cls: 'b th' });
    S.text(600, 158, 'N spires', { cls: 'sm' });
    S.text(610, 252, 'Force magnétomotrice = N × I', { cls: 'sm te' });
    return S;
  };

  /* ---------- Figure : induction, aimant et bobine ---------- */
  HQ.figs['induction-aimant'] = function () {
    const S = HQ.S(720, 236, 'Trois cas : l’aimant approche de la bobine et l’aiguille dévie d’un côté, l’aimant est immobile et l’aiguille reste à zéro, l’aimant s’éloigne et l’aiguille dévie de l’autre côté');
    const cases = [
      { t: 'L’aimant approche', dir: 1, needle: -35, l1: 'Le flux augmente dans la bobine :', l2: 'une tension est induite' },
      { t: 'L’aimant est immobile', dir: 0, needle: 0, l1: 'Le flux ne change pas :', l2: 'aucune tension induite' },
      { t: 'L’aimant s’éloigne', dir: -1, needle: 35, l1: 'Le flux diminue :', l2: 'tension de sens contraire' }
    ];
    cases.forEach((c, k) => {
      const ox = 240 * k;
      if (k) S.line(ox, 30, ox, 226, 'grid');
      S.text(ox + 120, 20, c.t, { cls: 'b' });
      magnet(S, ox + 16, 62, 70, 26, 'S', 'N');
      if (c.dir) S.arrow(ox + 51 - 24 * c.dir, 46, ox + 51 + 24 * c.dir, 46, 'c3', 'ahd');
      const wd = winding(S, ox + 112, 60, 100, 30, 5, ox + 124, 17, 'c4', 'panel');
      // galvanomètre à zéro central
      const cx = (wd.a[0] + wd.b[0]) / 2, cy = 150, py = cy + 10;
      S.wire([wd.a, [wd.a[0], cy], [cx - 24, cy]], 'c4');
      S.wire([wd.b, [wd.b[0], cy], [cx + 24, cy]], 'c4');
      S.circle(cx, cy, 24, 'sym fill');
      [-40, -20, 0, 20, 40].forEach(a => {
        const s = Math.sin(a * RAD), co = Math.cos(a * RAD);
        S.line(r1(cx + 24 * s), r1(py - 24 * co), r1(cx + 28 * s), r1(py - 28 * co), 'ln');
      });
      const ns = Math.sin(c.needle * RAD), nc = Math.cos(c.needle * RAD);
      S.line(cx, py, r1(cx + 22 * ns), r1(py - 22 * nc), 'needle');
      S.circle(cx, py, 2.6, 'dot');
      S.text(ox + 120, 200, c.l1, { cls: 'sm' });
      S.text(ox + 120, 216, c.l2, { cls: 'sm b ' + (c.dir ? 'th' : 'mut') });
    });
    return S;
  };

  /* ---------- Figure : condensateurs en parallèle et en série ---------- */
  HQ.figs['condos-assoc'] = function () {
    const S = HQ.S(640, 226, 'Deux condensateurs de 10 et 20 microfarads : en parallèle la capacité totale est de 30 microfarads, en série elle est de 6,67 microfarads');
    S.text(160, 20, 'En parallèle', { cls: 'b' });
    S.circle(40, 62, 3, 'sym fill'); S.circle(40, 162, 3, 'sym fill');
    S.wire([[43, 62], [250, 62]]); S.wire([[43, 162], [250, 162]]);
    S.comp('C', 150, 62, 150, 162, { label: 'C1', val: '10 µF', side: 'l' });
    S.comp('C', 250, 62, 250, 162, { label: 'C2', val: '20 µF' });
    S.dot(150, 62); S.dot(150, 162);
    S.text(160, 196, 'C totale = 10 + 20 = 30 µF', { cls: 'b te' });
    S.text(160, 214, 'les capacités s’additionnent', { cls: 'sm mut' });

    S.text(480, 20, 'En série', { cls: 'b' });
    S.circle(360, 112, 3, 'sym fill'); S.circle(600, 112, 3, 'sym fill');
    S.comp('C', 363, 112, 480, 112, { label: 'C1', val: '10 µF' });
    S.comp('C', 480, 112, 597, 112, { label: 'C2', val: '20 µF' });
    S.text(480, 196, 'C totale = (10 × 20) ÷ (10 + 20) = 6,67 µF', { cls: 'b te' });
    S.text(480, 214, 'plus petite que la plus petite des deux', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : alternateur simplifié et tension produite ---------- */
  HQ.figs['alternateur'] = function () {
    const S = HQ.S(700, 250, 'Un aimant qui tourne à l’intérieur d’un bobinage fixe produit une tension sinusoïdale : un tour du rotor à deux pôles donne un cycle');
    const cx = 125, cy = 126;
    S.text(cx, 18, 'Alternateur simplifié (2 pôles)', { cls: 'b' });
    S.circle(cx, cy, 90, 'body'); S.circle(cx, cy, 66, 'sym fill');
    S.wire([[cx + 8, cy - 78], [238, cy - 78]], 'c4'); S.wire([[cx + 8, cy + 78], [238, cy + 78]], 'c4');
    S.circle(cx, cy - 78, 8, 'soft4'); S.circle(cx, cy + 78, 8, 'soft4');
    S.circle(241, cy - 78, 3, 'sym fill'); S.circle(241, cy + 78, 3, 'sym fill');
    S.g({ transform: `rotate(-30 ${cx} ${cy})` }, () => magnet(S, cx - 48, cy - 15, 96, 30, 'S', 'N'));
    S.circle(cx, cy, 4, 'dot');
    arc(S, cx, cy, 58, 58, 118, 'c3', 'ahd');
    S.text(250, cy - 10, 'sortie', { anchor: 'start', cls: 'sm' });
    S.text(250, cy + 5, 'CA', { anchor: 'start', cls: 'sm' });
    S.arrow(292, cy, 330, cy, 'dash', 'ahm');
    S.text(cx, 240, 'Le rotor aimanté tourne dans le stator', { cls: 'sm mut' });

    S.text(490, 18, 'Tension produite', { cls: 'b' });
    const p = S.plot({ x: 345, y: 66, w: 290, h: 120, xr: [0, 360], yr: [-1.25, 1.25], ylabel: 'tension' });
    p.curve(x => Math.sin(x * RAD), 'c1');
    [[90, '¼ tour'], [180, '½ tour'], [270, '¾ tour'], [360, '1 tour']].forEach(q => { p.xtick(q[0]); S.text(p.sx(q[0]), 203, q[1], { cls: 'sm mut' }); });
    S.text(490, 224, '2 pôles : 1 tour du rotor = 1 cycle', { cls: 'sm' });
    S.text(490, 240, '3\u00a0600 r/min = 60 tours par seconde = 60 Hz', { cls: 'sm b te' });
    return S;
  };

  /* ---------- Figure : surcharge, court-circuit, défaut à la terre ---------- */
  HQ.figs['trois-defauts'] = function () {
    const S = HQ.S(770, 256, 'Trois circuits protégés par un disjoncteur : une surcharge causée par trop de charges, un court-circuit entre la ligne et le neutre, et un défaut à la terre où la ligne touche un boîtier métallique');
    const base = (ox, title) => {
      S.text(ox + 125, 20, title, { cls: 'b' });
      S.text(ox + 15, 79, 'L', { anchor: 'end', cls: 'sm b' }); S.text(ox + 15, 179, 'N', { anchor: 'end', cls: 'sm b' });
      S.circle(ox + 22, 75, 3, 'sym fill'); S.circle(ox + 22, 175, 3, 'sym fill');
      S.comp('brk', ox + 25, 75, ox + 85, 75, { label: '15 A' });
    };
    S.line(254, 30, 254, 246, 'grid'); S.line(512, 30, 512, 246, 'grid');

    base(0, 'Surcharge');
    S.wire([[85, 75], [225, 75]]); S.wire([[25, 175], [225, 175]]);
    [135, 180, 225].forEach(x => S.comp('R', x, 75, x, 175));
    S.dot(135, 75); S.dot(180, 75); S.dot(135, 175); S.dot(180, 175);
    S.current(92, 64, 124, 64, '22 A');
    S.text(127, 204, 'Trop de charges sur le circuit :', { cls: 'sm' });
    S.text(127, 220, 'courant un peu trop élevé, longtemps', { cls: 'sm' });
    S.text(127, 242, 'Thermique : coupe après un délai', { cls: 'sm b tw' });

    base(258, 'Court-circuit');
    S.wire([[343, 75], [483, 75]]); S.wire([[283, 175], [483, 175]]);
    S.comp('R', 483, 75, 483, 175, { label: 'Charge', side: 'l' });
    S.wire([[403, 75], [403, 175]], 'wire hot thick'); S.dot(403, 75); S.dot(403, 175);
    S.text(395, 122, ['contact', 'direct'], { anchor: 'end', cls: 'sm th' });
    S.add('line', { x1: 350, y1: 62, x2: 384, y2: 62, class: 'c2', 'marker-end': 'url(#ahb)', style: 'stroke-width:4' });
    S.text(367, 48, 'I énorme', { cls: 'sm th' });
    S.text(383, 204, 'Deux conducteurs se touchent :', { cls: 'sm' });
    S.text(383, 220, 'courant énorme, tout de suite', { cls: 'sm' });
    S.text(383, 242, 'Magnétique : coupe instantanément', { cls: 'sm b th' });

    base(516, 'Défaut à la terre');
    S.wire([[601, 75], [690, 75]]); S.wire([[541, 175], [690, 175]]);
    S.rect(656, 96, 68, 58, 'dash', 6);
    S.comp('R', 690, 75, 690, 175);
    S.path('M668,75 l-5,7 l8,3 l-5,11', 'c2'); S.dot(668, 75);
    S.wire([[724, 125], [746, 125]], 'wire gnd'); S.gnd(746, 125);
    S.text(746, 160, 'MALT', { cls: 'xs tok' });
    S.text(648, 112, ['la ligne touche', 'le boîtier'], { anchor: 'end', cls: 'sm th' });
    S.text(648, 150, 'boîtier métallique', { anchor: 'end', cls: 'xs mut' });
    S.text(641, 204, 'Un fil sous tension touche une masse :', { cls: 'sm' });
    S.text(641, 220, 'le courant fuit vers la terre', { cls: 'sm' });
    S.text(641, 242, 'Disjoncteur, fusible ou DDFT', { cls: 'sm b td' });
    return S;
  };

  /* ---------- Démo : vitesse d'un moteur, champ tournant et glissement ---------- */
  HQ.widgets['vitesse-moteur'] = function (c) {
    wk.header(c, 'Vitesse d’un moteur à induction', 'Choisis la fréquence et le nombre de pôles. Le champ du stator tourne à la vitesse synchrone ; le rotor le suit un peu moins vite : c’est le glissement.');
    let f = 60, p = 4, thF = 0, thR = 0, last = 0;
    let field = null, rotor = null, labels = [];
    const cx = 130, cy = 130;
    const slip = wk.rangeInput('Glissement', 2.8, 0, 10, 0.1, v => HQ.fr(v, 1) + ' %');
    const box = el('div', { class: 'svg-wrap' }), out = el('div');
    const btn = el('button', { class: 'btn small secondary', type: 'button' }, 'Lecture');

    function frame() {
      if (!field) return;
      field.setAttribute('transform', `rotate(${(-thF).toFixed(2)} ${cx} ${cy})`);
      rotor.setAttribute('transform', `rotate(${(-thR).toFixed(2)} ${cx} ${cy})`);
      labels.forEach((t, i) => { const q = polar(cx, cy, 78, thF + (i + 0.5) * 360 / p); t.setAttribute('x', q[0]); t.setAttribute('y', q[1]); });
    }
    function build() {
      // l'écart est arrondi une seule fois, puis soustrait : la soustraction affichée tombe toujours juste
      const ns = 120 * f / p, s = slip.value, n = ns - Math.round(ns * s / 100);
      const S = HQ.S(540, 262, 'Coupe d’un moteur : l’anneau de pôles nord et sud représente le champ tournant du stator, le disque central représente le rotor');
      S.circle(cx, cy, 112, 'body'); S.circle(cx, cy, 90, 'sym fill');
      field = S.g({}, () => {
        for (let i = 0; i < p; i++) arc(S, cx, cy, 78, i * 360 / p + 5, (i + 1) * 360 / p - 5, i % 2 ? 'c1' : 'c2', null, 'stroke-width:14;stroke-linecap:butt');
      });
      labels = [];
      for (let i = 0; i < p; i++) labels.push(S.add('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'b sm', style: 'fill:var(--surface)' }, i % 2 ? 'S' : 'N'));
      rotor = S.g({}, () => {
        S.circle(cx, cy, 58, 'sym fill');
        for (let i = 0; i < 12; i++) { const q = polar(cx, cy, 48, i * 30 + 15); S.circle(q[0], q[1], 4.5, 'soft4'); }
        S.line(cx, cy, cx + 57, cy, 'needle');
        S.circle(cx, cy, 9, 'body');
      });
      S.rect(282, 46, 12, 12, 'f2'); S.rect(296, 46, 12, 12, 'f1');
      S.text(316, 57, 'Champ tournant du stator', { anchor: 'start', cls: 'sm' });
      S.text(282, 82, 'Vitesse synchrone : ' + nb(ns, 0) + ' r/min', { anchor: 'start', cls: 'b' });
      S.line(282, 122, 308, 122, 'needle');
      S.text(316, 126, 'Rotor (repère rouge)', { anchor: 'start', cls: 'sm' });
      S.text(282, 151, 'Vitesse du rotor : ' + nb(n, 0) + ' r/min', { anchor: 'start', cls: 'b' });
      S.text(282, 176, s > 0 ? 'Le rotor perd ' + nb(ns - n, 0) + ' tours par minute sur le champ' : 'Glissement nul : cas limite, impossible en charge', { anchor: 'start', cls: 'sm mut' });
      S.text(282, 214, 'Animation ralentie 120 fois', { anchor: 'start', cls: 'xs mut' });
      frame();   // place les étiquettes N et S avant de remettre le dessin : son cadre se mesure sur leur vraie position
      box.replaceChildren(S.node);
      out.replaceChildren(wk.readout([
        ['Vitesse synchrone n<sub>s</sub> = 120 × f ÷ p', '120 × ' + f + ' ÷ ' + p + ' = ' + nb(ns, 0) + ' r/min'],
        ['Glissement', HQ.fr(s, 1) + ' % de ' + nb(ns, 0) + ' = ' + nb(ns - n, 0) + ' r/min'],
        ['Vitesse du rotor', nb(ns, 0) + ' − ' + nb(ns - n, 0) + ' = ' + nb(n, 0) + ' r/min']
      ]));
    }
    const an = wk.anim(t => {
      const dt = Math.min(0.1, Math.max(0, t - last)); last = t;
      const turns = (120 * f / p) / 7200;          // tours par seconde à l'écran
      thF = (thF + 360 * turns * dt) % 360;
      thR = (thR + 360 * turns * (1 - slip.value / 100) * dt) % 360;
      frame();
    });
    const segF = wk.seg([['60', '60 Hz'], ['50', '50 Hz']], '60', v => { f = +v; build(); });
    const segP = wk.seg([['2', '2 pôles'], ['4', '4 pôles'], ['6', '6 pôles'], ['8', '8 pôles']], '4', v => { p = +v; build(); });
    slip.input.addEventListener('input', build);
    let wanted = !HQ.reducedMotion;
    const sync = () => { btn.textContent = an.running ? 'Pause' : 'Lecture'; };
    btn.addEventListener('click', () => { wanted = !an.running; if (wanted) an.play(); else an.pause(); sync(); });
    c.append(el('div', { class: 'w-row' }, [segF.node, segP.node, btn]), el('div', { class: 'controls' }, [slip.lab]), box, out,
      el('p', { class: 'w-note' }, 'À 60 Hz, un moteur à 4 pôles a une vitesse synchrone de 1\u00a0800 r/min. Sa plaque indique plutôt autour de 1\u00a0750 r/min : c’est sa vitesse réelle à pleine charge.'));
    build();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && wanted) an.play(); else an.pause(); sync(); })).observe(c);
    } else if (wanted) { an.play(); sync(); }
  };

  /* ---------- Démo : relais, contacts NO et NF ---------- */
  HQ.widgets['relais'] = function (c) {
    wk.header(c, 'Le relais : une bobine commande des contacts', 'Clique sur l’interrupteur S1 (ou sur le bouton) pour alimenter la bobine K, et observe les deux contacts et les deux lampes.');
    let on = false;
    const box = el('div', { class: 'svg-wrap' }), out = el('div'), note = el('p', { class: 'w-note' });
    const btn = el('button', { class: 'btn small', type: 'button' });
    function draw(refocus) {
      const S = HQ.S(540, 262, 'Schéma en échelle à trois échelons : l’interrupteur S1 alimente la bobine K ; le contact normalement ouvert de K alimente la lampe H1 ; le contact normalement fermé de K alimente la lampe H2');
      const cls = live => (live ? 'wire hot' : 'wire');
      S.text(50, 28, 'L', { cls: 'b' }); S.text(490, 28, 'N', { cls: 'b' });
      S.line(50, 36, 50, 244, 'wire thick'); S.line(490, 36, 490, 244, 'wire thick');
      const rung = (y, closed, live, load) => {
        const w = cls(live);
        S.wire([[50, y], [110, y]], w);
        S.comp('sw', 110, y, 210, y, { closed, wire: w });
        S.wire([[210, y], [330, y]], w);
        load(w);
        S.wire([[430, y], [490, y]], w);
        S.dot(50, y); S.dot(490, y);
      };
      rung(75, on, on, w => S.comp('coil', 330, 75, 430, 75, { letter: 'K', wire: w }));
      S.text(160, 50, 'Interrupteur S1', { cls: 'b' });
      S.text(380, 50, 'Bobine K', { cls: 'b te' });
      S.text(380, 105, on ? 'alimentée' : 'hors tension', { cls: 'sm ' + (on ? 'th' : 'mut') });
      rung(150, on, on, w => S.comp('lamp', 330, 150, 430, 150, { on, wire: w }));
      S.text(160, 126, 'Contact NO de K', { cls: 'b te' });
      S.text(160, 172, on ? 'fermé' : 'ouvert (repos)', { cls: 'sm mut' });
      S.text(380, 122, 'Lampe H1 : ' + (on ? 'allumée' : 'éteinte'), { cls: 'sm b' });
      rung(225, !on, !on, w => S.comp('lamp', 330, 225, 430, 225, { on: !on, wire: w }));
      S.text(160, 201, 'Contact NF de K', { cls: 'b te' });
      S.text(160, 247, on ? 'ouvert' : 'fermé (repos)', { cls: 'sm mut' });
      S.text(380, 197, 'Lampe H2 : ' + (on ? 'éteinte' : 'allumée'), { cls: 'sm b' });
      const hit = S.hit(100, 36, 120, 56, () => { on = !on; draw(true); }, 'Basculer l’interrupteur S1');
      box.replaceChildren(S.node);
      if (refocus) hit.focus();
      btn.textContent = on ? 'Couper l’alimentation de la bobine' : 'Alimenter la bobine';
      out.replaceChildren(wk.readout([
        ['Bobine K', on ? 'Alimentée' : 'Hors tension (repos)'],
        ['Contact NO (normalement ouvert)', on ? 'Fermé : H1 allumée' : 'Ouvert : H1 éteinte'],
        ['Contact NF (normalement fermé)', on ? 'Ouvert : H2 éteinte' : 'Fermé : H2 allumée']
      ]));
      note.innerHTML = on
        ? '<strong>Bobine alimentée :</strong> elle attire l’armature et les deux contacts changent d’état en même temps. Le NO se ferme, le NF s’ouvre. Les échelons parcourus par un courant sont en rouge.'
        : '<strong>Bobine hors tension :</strong> les contacts sont dans leur état « normal ». Le NO est ouvert, le NF est fermé. Sur un schéma, les contacts sont toujours dessinés dans cet état de repos.';
    }
    btn.addEventListener('click', () => { on = !on; draw(false); });
    c.append(el('div', { class: 'w-row' }, [btn]), box, out, note);
    draw(false);
  };
})();
