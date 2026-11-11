/* Figures et démos de la page « Lecture de schémas électriques » */
(function () {
  'use strict';
  const HQ = window.HQ, wk = HQ.wk, el = HQ.el;
  // flèche de courant horizontale, étiquette dégagée de la pointe
  function cur(S, x1, y, x2, label) {
    S.arrow(x1, y, x2, y, 'c2', 'ahb');
    if (label) S.text((x1 + x2) / 2 + (x2 > x1 ? -5 : 5), y - 10, label, { cls: 'sm th' });
  }


  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ---------- Catalogue des symboles (cadre de 120 × 72, conducteur à y = 36 ou 44) ----------
     name, sub : titre et précision dans la grille | q : réponse dans les cartes | ctx : contexte affiché sur la carte
     near : symboles avec lesquels on le confond | tip : phrase affichée après la réponse */
  const comp = (type, o, y) => S => S.comp(type, 14, y || 36, 106, y || 36, o);
  const cross = S => { S.wire([[14, 36], [106, 36]]); S.wire([[60, 8], [60, 64]]); };
  const SYMBOLS = [
    { id: 'fil', name: 'Conducteur', q: 'Conducteur', near: ['croise', 'noeud'], tip: 'Un trait continu représente un conducteur.', draw: S => S.wire([[14, 36], [106, 36]]) },
    { id: 'croise', name: 'Croisement', sub: 'sans connexion', q: 'Croisement sans connexion', near: ['noeud', 'fil'], tip: 'Deux traits qui se croisent sans point ne sont pas reliés.', draw: cross },
    { id: 'noeud', name: 'Connexion', sub: 'point', q: 'Connexion entre conducteurs', near: ['croise', 'fil'], tip: 'Le point noir indique que les conducteurs sont reliés.', draw: S => { cross(S); S.dot(60, 36, 4); } },
    { id: 'pile', name: 'Pile', sub: 'source continue', q: 'Pile', near: ['cond', 'no'], tip: 'Le trait long est la borne positive, le trait court et épais la borne négative.', draw: S => { S.comp('bat', 14, 36, 106, 36); S.text(76, 28, '+', { cls: 'b' }); S.text(44, 28, '−', { cls: 'b' }); } },
    { id: 'ca', name: 'Source alternative', q: 'Source alternative', near: ['volt', 'moteur', 'lampe'], tip: 'Un cercle qui contient une onde.', draw: comp('AC') },
    { id: 'terre', name: 'Mise à la terre', q: 'Mise à la terre', near: ['pile', 'cond'], tip: 'Trois traits de plus en plus courts sous le conducteur.', draw: S => { S.wire([[60, 10], [60, 30]]); S.gnd(60, 30); } },
    { id: 'rz', name: 'Résistance', sub: 'zigzag', q: 'Résistance', near: ['bobine', 'fusible'], tip: 'Le zigzag est le symbole nord-américain de la résistance. La bobine a des boucles arrondies.', draw: comp('R') },
    { id: 'rb', name: 'Résistance', sub: 'rectangle', q: 'Résistance', near: ['fusible', 'bobine'], tip: 'Le rectangle vide est l’autre symbole de la résistance. Le fusible, lui, est traversé par un trait.', draw: comp('Rbox') },
    { id: 'lampe', name: 'Lampe', q: 'Lampe', near: ['moteur', 'volt', 'ca'], tip: 'Un cercle barré d’une croix.', draw: comp('lamp') },
    { id: 'io', name: 'Interrupteur', sub: 'ouvert', q: 'Interrupteur ouvert', near: ['if', 'bpno', 'disj'], tip: 'La lame levée ne touche pas le second contact : le courant ne passe pas.', draw: comp('sw', { closed: false }, 42) },
    { id: 'if', name: 'Interrupteur', sub: 'fermé', q: 'Interrupteur fermé', near: ['io', 'bpnf', 'fusible'], tip: 'La lame relie les deux contacts : le courant passe.', draw: comp('sw', { closed: true }) },
    { id: 'bpno', name: 'Bouton-poussoir NO', sub: 'ferme à l’appui', q: 'Bouton-poussoir NO', near: ['bpnf', 'io'], tip: 'Au repos, la barre ne touche pas les contacts. Il faut appuyer pour fermer le circuit.', draw: comp('pbno', {}, 46) },
    { id: 'bpnf', name: 'Bouton-poussoir NF', sub: 'ouvre à l’appui', q: 'Bouton-poussoir NF', near: ['bpno', 'if'], tip: 'Au repos, la barre relie les contacts. Appuyer ouvre le circuit.', draw: comp('pbnc', {}, 44) },
    { id: 'fusible', name: 'Fusible', q: 'Fusible', near: ['rb', 'disj'], tip: 'Un petit rectangle traversé par le conducteur.', draw: comp('fuse') },
    { id: 'disj', name: 'Disjoncteur', q: 'Disjoncteur', near: ['io', 'fusible', 'bpno'], tip: 'Un arc au-dessus de deux bornes.', draw: comp('brk', {}, 42) },
    { id: 'bobine', name: 'Bobine', sub: 'inductance', q: 'Bobine (inductance)', near: ['rz', 'transfo', 'tc'], tip: 'Des boucles arrondies. Le zigzag pointu, lui, est une résistance.', draw: comp('L') },
    { id: 'cond', name: 'Condensateur', q: 'Condensateur', ctx: 'schéma de circuit', near: ['no', 'pile', 'nf'], tip: 'Deux plaques parallèles de même longueur. Dans un schéma de commande, le même dessin est un contact NO.', draw: comp('C') },
    { id: 'transfo', name: 'Transformateur', q: 'Transformateur', near: ['bobine', 'tc'], tip: 'Deux enroulements face à face, séparés par les traits du noyau.', draw: S => { const t = S.tr(60, 36); S.wire([t.p1, [28, 12]]); S.wire([t.p2, [28, 60]]); S.wire([t.s1, [92, 12]]); S.wire([t.s2, [92, 60]]); } },
    { id: 'moteur', name: 'Moteur', q: 'Moteur', near: ['volt', 'amp', 'lampe'], tip: 'Un cercle marqué M.', draw: comp('motor') },
    { id: 'volt', name: 'Voltmètre', q: 'Voltmètre', near: ['amp', 'watt', 'moteur'], tip: 'Un cercle marqué V. Il se branche en parallèle.', draw: comp('meter', { letter: 'V' }) },
    { id: 'amp', name: 'Ampèremètre', q: 'Ampèremètre', near: ['volt', 'watt', 'moteur'], tip: 'Un cercle marqué A. Il est inséré en série dans le conducteur.', draw: comp('meter', { letter: 'A' }) },
    { id: 'watt', name: 'Wattmètre', q: 'Wattmètre', near: ['volt', 'kwh', 'amp'], tip: 'Un cercle marqué W : il mesure la puissance.', draw: comp('meter', { letter: 'W' }) },
    { id: 'kwh', name: 'Compteur d’énergie', sub: 'kWh', q: 'Compteur d’énergie', near: ['watt', 'moteur', 'volt'], tip: 'Un cercle marqué kWh : il enregistre l’énergie.', draw: comp('meter', { letter: 'kWh' }) },
    { id: 'no', name: 'Contact NO', sub: 'normalement ouvert', q: 'Contact NO (normalement ouvert)', ctx: 'schéma de commande', near: ['nf', 'cond', 'pile'], tip: 'Deux traits parallèles : ouvert au repos, il se ferme quand sa bobine est alimentée.', draw: comp('no') },
    { id: 'nf', name: 'Contact NF', sub: 'normalement fermé', q: 'Contact NF (normalement fermé)', ctx: 'schéma de commande', near: ['no', 'cond', 'fusible'], tip: 'Les deux traits sont barrés d’une diagonale : fermé au repos, il s’ouvre quand sa bobine est alimentée.', draw: comp('nc') },
    { id: 'relais', name: 'Bobine de relais', sub: 'ou de contacteur', q: 'Bobine de relais', ctx: 'schéma de commande', near: ['moteur', 'lampe', 'volt'], tip: 'Un cercle marqué du nom du relais ou du contacteur. Ses contacts portent le même nom.', draw: comp('coil', { letter: 'K' }) },
    { id: 'tc', name: 'Transformateur de courant', sub: 'TC', q: 'Transformateur de courant', near: ['transfo', 'bobine'], tip: 'Des demi-boucles posées sur le conducteur de ligne, avec les deux bornes du secondaire.', draw: S => { const t = S.comp('ct', 14, 28, 106, 28); S.wire([t.s1, [50, 58]]); S.wire([t.s2, [70, 58]]); } }
  ];
  const symSvg = (s, w, label) => {
    const S = HQ.S(120, 72, label || s.name + (s.sub ? ' (' + s.sub + ')' : ''));
    s.draw(S);
    if (w) { S.node.setAttribute('width', w); S.node.setAttribute('height', w * 0.6); }
    return S.node;
  };

  /* ---------- Figure : grille des symboles ---------- */
  HQ.figs['symboles'] = function () {
    const grid = el('div', { class: 'sym-grid' });
    SYMBOLS.forEach(s => grid.appendChild(el('div', { class: 'sym-cell' }, [
      symSvg(s), el('div', { class: 'sym-name' }, s.name), s.sub ? el('div', { class: 'sym-sub' }, s.sub) : null
    ])));
    return grid;
  };

  /* ---------- Figure : un interrupteur, deux en série, deux en parallèle ---------- */
  HQ.figs['circuits-simples'] = function () {
    const S = HQ.S(770, 242, 'Trois circuits : une lampe commandée par un interrupteur ; deux interrupteurs en série, fonction ET ; deux interrupteurs en parallèle, fonction OU');
    const top = 94, bot = 188;
    function base(x0, title, note) {
      S.text(x0 + 120, 20, title, { cls: 'b' });
      S.comp('AC', x0 + 40, bot, x0 + 40, top);
      S.comp('lamp', x0 + 200, top, x0 + 200, bot, { label: 'L' });
      S.wire([[x0 + 200, bot], [x0 + 40, bot]]);
      S.text(x0 + 120, 226, note, { cls: 'sm b te' });
    }
    base(15, 'Un interrupteur', 'L s’allume si S est fermé.');
    S.comp('sw', 55, top, 215, top, { label: 'S' });
    base(265, 'En série : fonction ET', 'Il faut S1 ET S2 fermés.');
    S.comp('sw', 305, top, 385, top, { label: 'S1' }); S.comp('sw', 385, top, 465, top, { label: 'S2' });
    base(515, 'En parallèle : fonction OU', 'Il suffit de S1 OU S2 fermé.');
    const a = 590, b = 680;
    S.wire([[555, top], [a, top]]); S.wire([[b, top], [715, top]]);
    S.wire([[a, top + 22], [a, top - 22]]); S.wire([[b, top + 22], [b, top - 22]]);
    S.comp('sw', a, top - 22, b, top - 22, { label: 'S1' });
    S.comp('sw', a, top + 22, b, top + 22, { label: 'S2', side: 'b' });
    S.dot(a, top); S.dot(b, top);
    return S;
  };

  /* ---------- Figure : deux interrupteurs à trois voies ---------- */
  HQ.figs['trois-voies'] = function () {
    const S = HQ.S(770, 222, 'Une lampe commandée de deux endroits par deux interrupteurs à trois voies reliés par deux fils voyageurs. À gauche, les deux interrupteurs sont sur le même voyageur et la lampe est allumée ; à droite, ils sont sur des voyageurs différents et la lampe est éteinte');
    function circuit(x0, up1, up2, title) {
      const on = up1 === up2, yc = 112, yu = 88, yd = 136, bot = 190;
      const hot = on ? 'wire hot' : 'wire';
      S.text(x0 + 165, 22, title, { cls: 'b' });
      S.comp('AC', x0 + 30, bot, x0 + 30, yc, { wire: hot });
      S.text(x0 + 52, 160, '120 V', { anchor: 'start', cls: 'sm' });
      S.wire([[x0 + 30, yc], [x0 + 80, yc]], hot);
      S.wire([[x0 + 127, yu], [x0 + 207, yu]], on && up1 ? 'wire hot' : 'wire');
      S.wire([[x0 + 127, yd], [x0 + 207, yd]], on && !up1 ? 'wire hot' : 'wire');
      S.wire([[x0 + 255, yc], [x0 + 300, yc]], hot);
      S.comp('lamp', x0 + 300, yc, x0 + 300, bot, { on, wire: hot, label: on ? 'allumée' : 'éteinte', cls: 'sm' });
      S.wire([[x0 + 300, bot], [x0 + 30, bot]], hot);
      // S1 : borne commune à gauche, deux bornes de voyageurs à droite
      S.line(x0 + 84, yc, x0 + 122, up1 ? yu + 1 : yd - 1, on ? 'wire hot' : 'sym');
      S.circle(x0 + 82, yc, 2.6, 'sym fill'); S.circle(x0 + 124, yu, 2.6, 'sym fill'); S.circle(x0 + 124, yd, 2.6, 'sym fill');
      // S2 : deux bornes de voyageurs à gauche, borne commune à droite
      S.line(x0 + 250, yc, x0 + 212, up2 ? yu + 1 : yd - 1, on ? 'wire hot' : 'sym');
      S.circle(x0 + 210, yu, 2.6, 'sym fill'); S.circle(x0 + 210, yd, 2.6, 'sym fill'); S.circle(x0 + 252, yc, 2.6, 'sym fill');
      S.text(x0 + 103, 70, 'S1', { cls: 'b' }); S.text(x0 + 231, 70, 'S2', { cls: 'b' });
      S.text(x0 + 167, yc + 4, 'voyageurs', { cls: 'xs mut' });
    }
    circuit(15, true, true, 'Même voyageur : lampe allumée');
    circuit(395, true, false, 'Voyageurs différents : lampe éteinte');
    return S;
  };

  /* ---------- Figure : schéma de commande en échelle, marche-arrêt à auto-maintien ---------- */
  HQ.figs['echelle'] = function () {
    const S = HQ.S(640, 232, 'Schéma en échelle entre les montants L1 et N : bouton d’arrêt normalement fermé, bouton de marche normalement ouvert et bobine du contacteur M en série ; un contact normalement ouvert M est branché en parallèle avec le bouton de marche');
    const y = 96, y2 = 166;
    S.line(70, 36, 70, 204, 'wire thick'); S.line(570, 36, 570, 204, 'wire thick');
    S.text(70, 26, 'L1', { cls: 'b' }); S.text(570, 26, 'N', { cls: 'b' });
    S.wire([[70, y], [120, y]]);
    S.comp('pbnc', 120, y, 220, y);
    S.text(170, 52, 'Arrêt', { cls: 'b' }); S.text(170, 67, '(NF)', { cls: 'sm' });
    S.wire([[220, y], [250, y]]);
    S.comp('pbno', 250, y, 350, y);
    S.text(300, 52, 'Marche', { cls: 'b' }); S.text(300, 67, '(NO)', { cls: 'sm' });
    S.wire([[350, y], [400, y]]);
    S.comp('coil', 400, y, 570, y, { letter: 'M', label: 'Bobine du', val: 'contacteur M' });
    S.wire([[250, y], [250, y2]]); S.wire([[350, y], [350, y2]]);
    S.comp('no', 250, y2, 350, y2, { label: 'M', val: 'contact d’auto-maintien', side: 'b' });
    S.dot(250, y); S.dot(350, y); S.dot(70, y); S.dot(570, y);
    return S;
  };

  /* ---------- Figure : schéma unifilaire d'un branchement ---------- */
  HQ.figs['unifilaire-branchement'] = function () {
    const S = HQ.S(780, 330, 'Schéma unifilaire d’un branchement : ligne du distributeur, transformateur, branchement, compteur dans son embase, coffret de branchement avec disjoncteur principal, panneau de distribution et circuits. En dessous, la variante d’une grosse installation, où le compteur est alimenté par des transformateurs de courant');
    function start(y) {
      S.line(45, y - 42, 45, y + 42, 'wire thick'); S.dot(45, y);
      S.wire([[45, y], [138, y]]);
      S.tr(150, y);
    }
    function end(y, ys) {
      S.rect(420, y - 27, 80, 54, 'panel', 6);
      S.comp('brk', 420, y, 500, y);
      S.wire([[500, y], [580, y]]);
      const lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
      S.line(580, y + lo - 12, 580, y + hi + 12, 'wire thick');
      ys.forEach(d => { S.comp('brk', 580, y + d, 680, y + d); S.arrow(680, y + d, 716, y + d, 'wire', 'ah'); });
    }
    // installation courante : mesurage direct
    let y = 104;
    start(y);
    S.wire([[162, y], [280, y]]);
    [-8, 0, 8].forEach(k => S.line(218 + k, y + 7, 226 + k, y - 7, 'ln'));
    S.rect(280, y - 32, 70, 64, 'panel', 8);
    S.comp('meter', 280, y, 350, y, { letter: 'kWh' });
    S.wire([[350, y], [420, y]]);
    end(y, [-34, 0, 34]);
    S.text(45, 30, 'Ligne du', { cls: 'sm b' }); S.text(45, 45, 'distributeur', { cls: 'sm b' });
    S.text(150, 45, 'Transformateur', { cls: 'sm b' });
    S.text(222, y + 28, 'Branchement', { cls: 'sm b' }); S.text(222, y + 42, '3 conducteurs', { cls: 'xs mut' });
    S.text(315, 45, 'Compteur', { cls: 'sm b' }); S.text(315, 60, 'dans son embase', { cls: 'sm' });
    S.text(460, 45, 'Coffret de branchement', { cls: 'sm b' }); S.text(460, 60, 'disjoncteur principal', { cls: 'sm' });
    S.text(580, 30, 'Panneau de', { cls: 'sm b' }); S.text(580, 45, 'distribution', { cls: 'sm b' });
    S.text(698, 45, 'Circuits', { cls: 'sm b' });
    // grosse installation : mesurage avec transformateurs de courant
    S.line(20, 176, 760, 176, 'dash');
    S.text(20, 198, 'Variante pour une grosse installation : le compteur est alimenté par des transformateurs de courant (TC).', { anchor: 'start', cls: 'sm b' });
    y = 252;
    start(y);
    const ct = S.comp('ct', 162, y, 420, y, { label: 'TC' });
    S.wire([ct.s1, [281, y + 26], [261, y + 26], [261, y + 52]], 'wire acc');
    S.wire([ct.s2, [301, y + 26], [321, y + 26], [321, y + 52]], 'wire acc');
    S.comp('meter', 261, y + 52, 321, y + 52, { letter: 'kWh', wire: 'wire acc' });
    S.text(336, y + 56, 'Compteur', { anchor: 'start', cls: 'sm b' });
    end(y, [-24, 24]);
    return S;
  };

  /* ---------- Figure : schéma coté pour trouver une valeur ---------- */
  HQ.figs['schema-cote'] = function () {
    const S = HQ.S(640, 250, 'Source de 120 V, résistance R1 de 20 ohms en série avec deux branches en parallèle entre les points A et B : R2 de 60 ohms, et l’interrupteur S fermé suivi de R3 de 30 ohms');
    S.comp('V', 90, 200, 90, 70, { label: 'U', val: '120 V', side: 'l' });
    S.comp('R', 90, 70, 330, 70, { label: 'R1', val: '20 Ω' });
    S.wire([[330, 70], [510, 70]]);
    S.comp('R', 330, 70, 330, 200, { label: 'R2', val: '60 Ω' });
    S.comp('sw', 510, 70, 510, 130, { closed: true, label: 'S' });
    S.comp('R', 510, 130, 510, 200, { label: 'R3', val: '30 Ω' });
    S.wire([[510, 200], [90, 200]]);
    S.dot(330, 70); S.dot(330, 200);
    S.text(330, 56, 'A', { cls: 'b te' }); S.text(330, 222, 'B', { cls: 'b te' });
    cur(S, 112, 58, 162, 'I = 3 A');
    S.arrow(314, 160, 314, 188, 'c2', 'ahb'); S.text(306, 178, 'I2 = 1 A', { anchor: 'end', cls: 'sm th' });
    S.arrow(494, 138, 494, 164, 'c2', 'ahb'); S.text(486, 155, 'I3 = 2 A', { anchor: 'end', cls: 'sm th' });
    S.text(210, 98, 'U1 = 60 V', { cls: 'sm td' });
    S.text(420, 190, 'entre A et B : 60 V', { cls: 'sm td' });
    return S;
  };

  /* ---------- Démo : circuit à interrupteurs ---------- */
  HQ.widgets['circuit-interrupteurs'] = function (c) {
    wk.header(c, 'Circuit à interrupteurs', 'Clique sur un interrupteur pour l’ouvrir ou le fermer, ou sur le fusible pour le faire fondre. Le chemin du courant passe au rouge.');
    const st = { F: true, S1: false, S2: true, S3: true };
    const box = el('div', { class: 'svg-wrap' }), note = el('p', { class: 'w-note' }), out = el('div');
    const TITLES = { F: 'Fusible : le faire fondre ou le remplacer', S1: 'Interrupteur S1', S2: 'Interrupteur S2', S3: 'Interrupteur S3' };
    function draw(focus) {
      const feed = st.F && st.S1, on1 = feed && st.S2, on2 = feed && st.S3, any = on1 || on2;
      const w = live => (live ? 'wire hot' : 'wire');
      const S = HQ.S(480, 268, 'Source de 120 V, fusible et interrupteur S1 en série, puis deux branches en parallèle : S2 avec la lampe L1, S3 avec la lampe L2');
      const top = 62, bot = 232, xa = 300, xb = 400;
      S.comp('AC', 40, bot, 40, top, { wire: w(any) });
      S.text(62, 151, '120 V', { anchor: 'start', cls: 'sm' });
      S.comp('fuse', 40, top, 150, top, { label: 'Fusible', val: st.F ? 'intact' : 'fondu', side: 'b', wire: w(any) });
      if (!st.F) { S.line(87, top - 8, 103, top + 8, 'c2'); S.line(87, top + 8, 103, top - 8, 'c2'); }
      S.comp('sw', 150, top, 250, top, { closed: st.S1, label: 'S1', wire: w(any) });
      S.wire([[250, top], [xa, top]], w(any));
      S.wire([[xa, top], [xb, top]], w(on2));
      S.comp('sw', xa, top, xa, 140, { closed: st.S2, label: 'S2', side: 'l', wire: w(on1) });
      S.comp('lamp', xa, 140, xa, bot, { on: on1, label: 'L1', val: on1 ? 'allumée' : 'éteinte', wire: w(on1) });
      S.comp('sw', xb, top, xb, 140, { closed: st.S3, label: 'S3', side: 'l', wire: w(on2) });
      S.comp('lamp', xb, 140, xb, bot, { on: on2, label: 'L2', val: on2 ? 'allumée' : 'éteinte', wire: w(on2) });
      S.wire([[xb, bot], [xa, bot]], w(on2));
      S.wire([[xa, bot], [40, bot]], w(any));
      S.dot(xa, top); S.dot(xa, bot);
      if (any) cur(S, 254, top - 10, 292, 'I');
      const zones = { F: [63, top - 16, 64, 62], S1: [168, top - 34, 64, 50], S2: [xa - 40, top + 12, 64, 56], S3: [xb - 40, top + 12, 64, 56] };
      const hits = {};
      Object.keys(zones).forEach(k => {
        const z = zones[k];
        S.rect(z[0], z[1], z[2], z[3], 'dash', 6);
        hits[k] = S.hit(z[0], z[1], z[2], z[3], ev => toggle(k, ev), TITLES[k]);
      });
      box.replaceChildren(S.node);
      if (focus && hits[focus]) hits[focus].focus();
      let t;
      if (!st.F) t = '<strong>Fusible fondu :</strong> il est en série avec tout le circuit, donc plus rien n’est alimenté. Les deux lampes sont éteintes, peu importe les interrupteurs.';
      else if (!st.S1) t = '<strong>S1 est ouvert :</strong> il est en série avec les deux branches. Aucune lampe ne peut s’allumer, même si S2 et S3 sont fermés.';
      else if (on1 && on2) t = '<strong>Tout est fermé :</strong> le courant se partage entre les deux branches. L1 et L2 sont allumées, chacune sous la pleine tension de 120 V.';
      else if (on1) t = '<strong>L1 seule est allumée :</strong> S3 ouvre la branche de L2, mais la branche de L1 reste complète. En parallèle, une branche ouverte n’éteint pas l’autre.';
      else if (on2) t = '<strong>L2 seule est allumée :</strong> S2 ouvre la branche de L1, mais la branche de L2 reste complète. En parallèle, une branche ouverte n’éteint pas l’autre.';
      else t = '<strong>S1 est fermé, mais S2 et S3 sont ouverts :</strong> aucune branche n’offre un chemin complet. Les deux lampes sont éteintes.';
      note.innerHTML = t;
      out.replaceChildren(wk.readout([
        ['L1 : il faut le fusible ET S1 ET S2', on1 ? 'allumée' : 'éteinte'],
        ['L2 : il faut le fusible ET S1 ET S3', on2 ? 'allumée' : 'éteinte']
      ]));
    }
    function toggle(k, ev) { st[k] = !st[k]; draw(ev && ev.type === 'keydown' ? k : null); }
    c.append(box, note, out);
    draw();
  };

  /* ---------- Démo : cartes de symboles ---------- */
  HQ.widgets['cartes-symboles'] = function (c) {
    wk.header(c, 'Cartes de symboles', 'Reconnais le symbole affiché et choisis son nom parmi les quatre propositions.');
    const card = el('div', { class: 'sym-card' });
    const ctx = el('div', { class: 'small sym-ctx' });
    const list = el('ul', { class: 'choices sym-choices' });
    const fb = el('p', { class: 'w-note' });
    const score = el('span', { class: 'score' });
    const bNext = el('button', { type: 'button', class: 'btn' }, 'Symbole suivant');
    const bZero = el('button', { type: 'button', class: 'btn secondary' }, 'Remettre le score à zéro');
    let deck = [], cur = null, good = 0, total = 0, done = false;
    const showScore = () => { score.textContent = 'Score : ' + good + ' / ' + total; };
    function choices(sym) {
      const used = new Set([sym.q]), out = [];
      const near = shuffle(SYMBOLS.filter(s => (sym.near || []).includes(s.id))).slice(0, 2);
      near.concat(shuffle(SYMBOLS)).forEach(s => { if (out.length < 3 && !used.has(s.q)) { used.add(s.q); out.push(s.q); } });
      return shuffle([sym.q].concat(out));
    }
    function next() {
      if (!deck.length) deck = shuffle(SYMBOLS.filter(s => s !== cur));
      cur = deck.pop(); done = false;
      card.replaceChildren(symSvg(cur, 240, 'Symbole à reconnaître'));
      ctx.textContent = cur.ctx ? 'Contexte : ' + cur.ctx : '';
      fb.textContent = ''; bNext.disabled = true;
      list.replaceChildren(...choices(cur).map((name, i) => {
        const b = el('button', { type: 'button', class: 'choice-btn' }, [el('span', { class: 'letter' }, 'abcd'[i] + ')'), el('span', { class: 'txt' }, name)]);
        b.addEventListener('click', () => {
          if (done) return;
          done = true; total++;
          const ok = name === cur.q;
          if (ok) good++;
          list.querySelectorAll('.choice-btn').forEach(x => {
            x.disabled = true;
            if (x.querySelector('.txt').textContent === cur.q) x.classList.add('correct');
          });
          if (!ok) b.classList.add('wrong');
          fb.innerHTML = (ok ? '<strong>Bonne réponse.</strong> ' : '<strong>C’est : ' + cur.q + '.</strong> ') + cur.tip;
          bNext.disabled = false; showScore();
        });
        return el('li', {}, [b]);
      }));
    }
    bNext.addEventListener('click', next);
    bZero.addEventListener('click', () => { good = 0; total = 0; showScore(); });
    c.append(card, ctx, list, fb, el('div', { class: 'w-row' }, [bNext, bZero, score]));
    showScore(); next();
  };
})();
