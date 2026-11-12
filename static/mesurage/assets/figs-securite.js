/* Figures et démos de la page « Règles de sécurité électrique » */
(function () {
  'use strict';
  const HQ = window.HQ, wk = HQ.wk, el = HQ.el;
  // flèche de courant horizontale, étiquette dégagée de la pointe
  function cur(S, x1, y, x2, label) {
    S.arrow(x1, y, x2, y, 'c2', 'ahb');
    if (label) S.text((x1 + x2) / 2 + (x2 > x1 ? -5 : 5), y - 10, label, { cls: 'sm th' });
  }


  /* Zones d'effets du courant à 60 Hz (ordres de grandeur). Bornes en mA, choisies pour que les zones se touchent. */
  const ZONES = [
    { lo: 0.1, hi: 0.25, col: '--muted', op: 0.12, range: 'Moins de 0,25 mA', txt: 'sous le seuil de perception, on ne sent rien' },
    { lo: 0.25, hi: 5, col: '--ok', op: 0.28, range: 'Environ 0,25 à 5 mA', txt: 'perception : fourmillement, picotement' },
    { lo: 5, hi: 10, col: '--warn', op: 0.2, range: 'Environ 5 à 10 mA', txt: 'choc léger ; un DDFT déclenche vers 5 mA' },
    { lo: 10, hi: 30, col: '--warn', op: 0.48, range: 'Environ 10 à 30 mA', txt: 'contraction musculaire, on ne peut plus lâcher prise' },
    { lo: 30, hi: 50, col: '--bad', op: 0.22, range: 'Environ 30 à 50 mA', txt: 'difficulté à respirer' },
    { lo: 50, hi: 2000, col: '--bad', op: 0.46, range: '50 mA et plus', txt: 'risque d’arrêt cardiaque (fibrillation ventriculaire)' },
    { lo: 2000, hi: 10000, col: '--bad', op: 0.78, range: 'Plusieurs ampères', txt: 'arrêt cardiaque ; brûlures graves au-delà de 10 A' }
  ];

  // bande graduée (échelle logarithmique de 0,1 mA à 10 A) ; renvoie la fonction de position
  function drawScale(S, x0, x1, y, h, tcls) {
    const sx = v => x0 + (Math.log10(v) + 1) / 5 * (x1 - x0);
    ZONES.forEach(z => S.add('rect', {
      x: sx(z.lo).toFixed(1), y, width: (sx(z.hi) - sx(z.lo)).toFixed(1), height: h,
      style: `fill:var(${z.col});fill-opacity:${z.op};stroke:var(--text);stroke-opacity:.45;stroke-width:.8`
    }));
    for (let d = -1; d < 4; d++) for (let k = 2; k < 10; k++) { const X = sx(k * Math.pow(10, d)); S.line(X, y + h, X, y + h + 3, 'ax'); }
    [[0.1, '0,1 mA'], [1, '1 mA'], [10, '10 mA'], [100, '100 mA'], [1000, '1 A'], [10000, '10 A']].forEach(t => {
      S.line(sx(t[0]), y + h, sx(t[0]), y + h + 7, 'ax');
      S.text(sx(t[0]), y + h + 20, t[1], { cls: tcls || 'sm mut' });
    });
    return sx;
  }

  /* ---------- Figure : échelle des effets du courant ---------- */
  HQ.figs['echelle-effets'] = function () {
    const S = HQ.S(760, 224, 'Échelle logarithmique du courant qui traverse le corps, de 0,1 mA à 10 A : perception dès 0,25 mA environ, choc léger et seuil d’un DDFT vers 5 mA, impossibilité de lâcher prise au-delà de 10 mA, difficulté à respirer de 30 à 50 mA, arrêt cardiaque possible (fibrillation ventriculaire) à partir de 50 mA, brûlures graves au-delà de 10 A');
    const y = 108, h = 28;
    const sx = drawScale(S, 40, 720, y, h);
    // repères au-dessus : (valeur, y du texte, ancre, x du texte, titre, effet)
    const up = (v, ty, anchor, tx, l1, l2) => {
      S.line(sx(v), y, sx(v), ty + 8, 'ln');
      S.text(tx, ty - 15, l1, { anchor, cls: 'b' }); S.text(tx, ty, l2, { anchor, cls: 'sm' });
    };
    const down = (v, anchor, tx, l1, l2) => {
      S.line(sx(v), y + h, sx(v), 174, 'ln');
      S.text(tx, 188, l1, { anchor, cls: 'b' }); S.text(tx, 203, l2, { anchor, cls: 'sm' });
    };
    up(0.25, 88, 'middle', sx(0.25) + 14, '≈ 0,25 mA', 'seuil de perception');
    up(10, 88, 'middle', sx(14), 'plus de 10 mA', 'on ne peut plus lâcher prise');
    up(50, 44, 'start', sx(50) - 8, '50 mA et plus', 'risque d’arrêt cardiaque (fibrillation)');
    down(5, 'middle', sx(5), '≈ 5 mA', 'choc léger, seuil d’un DDFT');
    down(39, 'start', sx(39) - 8, '30 à 50 mA', 'difficulté à respirer');
    up(10000, 88, 'end', 738, 'au-delà de 10 A', 'brûlures graves');   // au-dessus de l'échelle : en dessous, le trait couperait la graduation « 10 A »
    return S;
  };

  /* ---------- Figure : cadenassage ---------- */
  function padlock(S, x, y, col) {
    S.path(`M${x - 5},${y} v-4 a5,5 0 0 1 10,0 v4`, 'sym');
    S.add('rect', { x: x - 8, y, width: 16, height: 13, rx: 2.5, style: `fill:var(${col});stroke:var(--text);stroke-width:1.2` });
  }
  HQ.figs['cadenassage'] = function () {
    const S = HQ.S(760, 240, 'Schéma d’un cadenassage : la source reste sous tension en amont du sectionneur ouvert, cadenassé et étiqueté ; en aval, on vérifie l’absence de tension, on dissipe l’énergie résiduelle et l’équipement est arrêté');
    const top = 84, bot = 188;
    S.comp('AC', 95, bot, 95, top);
    S.text(95, 210, '1. Identifier', { cls: 'b' }); S.text(95, 226, 'toutes les sources', { cls: 'sm' });
    S.wire([[95, top], [203, top]], 'wire hot');
    S.text(149, top - 9, 'sous tension', { cls: 'sm th' });
    S.comp('sw', 203, top, 237, top, { closed: false });
    S.text(220, 40, '4. Isoler', { cls: 'b' }); S.text(220, 56, 'sectionneur ouvert', { cls: 'sm' });
    padlock(S, 208, 104, '--bad'); padlock(S, 232, 104, '--accent');
    S.rect(194, 124, 52, 15, 'soft4', 3); S.text(220, 135.5, 'DANGER', { cls: 'xs b' });
    S.text(220, 158, '5. Cadenasser, étiqueter', { cls: 'b' }); S.text(220, 174, 'un cadenas par travailleur', { cls: 'sm' });
    S.wire([[237, top], [700, top]], 'wire off');
    S.text(460, top - 9, 'hors tension', { cls: 'sm mut' });
    S.comp('meter', 380, top, 380, bot, { letter: 'V' });
    S.text(404, 132, '7. Vérifier', { anchor: 'start', cls: 'b' }); S.text(404, 148, 'l’absence de tension', { anchor: 'start', cls: 'sm' });
    S.comp('C', 548, top, 548, bot);
    S.text(568, 132, '6. Dissiper', { anchor: 'start', cls: 'b' }); S.text(568, 148, 'l’énergie résiduelle', { anchor: 'start', cls: 'sm' });
    S.comp('motor', 700, top, 700, bot);
    S.text(700, 40, '3. Arrêter', { cls: 'b' }); S.text(700, 56, 'l’équipement', { cls: 'sm' });
    S.wire([[700, bot], [95, bot]]);
    S.dot(380, top); S.dot(548, top); S.dot(380, bot); S.dot(548, bot);
    return S;
  };

  /* ---------- Figure : vérification d'absence de tension en trois temps ---------- */
  HQ.figs['trois-temps'] = function () {
    const S = HQ.S(740, 204, 'Trois étapes : tester le vérificateur sur une source connue (il indique 120 V), tester le circuit (0 V), puis retester le vérificateur sur la source connue (120 V)');
    function panel(x0, title, sub, reading, live, note) {
      S.text(x0 + 105, 20, title, { cls: 'b' });
      S.text(x0 + 105, 36, sub, { cls: 'sm mut' });
      S.rect(x0 + 65, 50, 80, 48, 'body', 8);
      S.rect(x0 + 73, 57, 64, 24, 'panel', 3);
      S.text(x0 + 105, 74, reading, { cls: 'b ' + (live ? 'th' : 'tok') });
      S.wire([[x0 + 88, 98], [x0 + 75, 138]]); S.wire([[x0 + 122, 98], [x0 + 135, 138]]);
      S.rect(x0 + 35, 138, 140, 28, live ? 'soft2' : 'panel', 5);
      S.dot(x0 + 75, 138); S.dot(x0 + 135, 138);
      S.text(x0 + 105, 156, live ? 'Source connue' : 'Circuit à vérifier', { cls: 'sm b' });
      S.text(x0 + 105, 190, note, { cls: 'sm' });
    }
    panel(10, '1. Tester le vérificateur', 'sur une source connue', '120 V', true, 'Il indique la tension : il fonctionne.');
    panel(265, '2. Tester le circuit', 'chaque phase, entre phases, à la terre', '0 V', false, 'Aucune tension détectée.');
    panel(520, '3. Retester le vérificateur', 'sur la source connue', '120 V', true, 'Il fonctionne toujours.');
    S.arrow(226, 106, 258, 106, 'ln', 'ah'); S.arrow(481, 106, 513, 106, 'ln', 'ah');
    return S;
  };

  /* ---------- Figure : défaut à la masse et mise à la terre ---------- */
  HQ.figs['defaut-terre'] = function () {
    const S = HQ.S(760, 300, 'Un fil sous tension touche le boîtier métallique d’un appareil. Le courant de défaut retourne à la source par le fil de continuité des masses et fait déclencher le disjoncteur');
    S.rect(450, 50, 240, 196, 'body', 10);
    S.text(570, 236, 'Boîtier métallique de l’appareil', { cls: 'sm b' });
    S.comp('AC', 90, 204, 90, 90, { label: 'Source', val: '120 V', side: 'l' });
    S.comp('brk', 90, 90, 300, 90, { label: 'Disjoncteur', val: 'il déclenche', wire: 'wire hot' });
    S.wire([[300, 90], [570, 90]], 'wire hot');
    S.comp('R', 570, 90, 570, 204, { label: 'Charge' });
    S.wire([[570, 204], [90, 204]], 'wire neu');
    S.text(330, 197, 'neutre', { cls: 'sm mut' });
    // défaut : le fil sous tension touche le boîtier
    S.path('M500,90 l-7,-13 l11,-3 l-6,-24', 'c2');
    S.text(506, 32, 'Défaut : un fil sous tension touche le boîtier', { cls: 'sm b th' });
    // neutre mis à la terre à la source, boîtier relié par le fil de mise à la terre
    S.dot(140, 204); S.gnd(140, 204);
    S.wire([[490, 246], [490, 272], [200, 272], [200, 204]], 'wire gnd');
    S.dot(200, 204); S.dot(490, 246);
    S.text(345, 290, 'fil de continuité des masses (vert ou nu)', { cls: 'sm tok' });
    cur(S, 326, 80, 414, 'courant de défaut');
    cur(S, 414, 262, 326);
    return S;
  };

  /* ---------- Figure : principe du DDFT ---------- */
  HQ.figs['ddft'] = function () {
    const S = HQ.S(740, 236, 'Un DDFT entoure le fil de ligne et le fil neutre et compare leurs courants : 8,000 A à l’aller, 7,994 A au retour, donc 6 mA fuient vers la terre et le DDFT coupe');
    S.text(34, 78, 'Ligne', { anchor: 'start', cls: 'sm b th' });
    S.text(34, 138, 'Neutre', { anchor: 'start', cls: 'sm b mut' });
    S.wire([[84, 74], [540, 74]], 'wire hot');
    S.wire([[84, 134], [540, 134]], 'wire neu');
    S.add('ellipse', { cx: 300, cy: 104, rx: 22, ry: 50, class: 'c1', style: 'stroke-width:4.5' });
    S.text(300, 24, 'DDFT', { cls: 'b te' });
    S.text(300, 40, 'il compare les deux courants', { cls: 'sm te' });
    S.arrow(120, 62, 200, 62, 'c2', 'ahb'); S.text(160, 52, 'aller : 8,000 A', { cls: 'sm th' });
    S.arrow(200, 146, 120, 146, 'wire neu thin', 'ahm'); S.text(160, 164, 'retour : 7,994 A', { cls: 'sm mut' });
    S.comp('R', 540, 74, 540, 134, { label: 'Charge', side: 'l' });
    S.wire([[540, 74], [640, 74]], 'wire hot');
    S.add('line', { x1: 640, y1: 74, x2: 640, y2: 160, class: 'c2', style: 'stroke-dasharray:5 4', 'marker-end': 'url(#ahb)' });
    S.gnd(640, 166);
    S.text(654, 112, 'fuite : 6 mA', { anchor: 'start', cls: 'sm b th' });
    S.text(654, 127, 'vers la terre', { anchor: 'start', cls: 'sm th' });
    S.text(370, 216, 'Différence : 8,000 − 7,994 = 0,006 A = 6 mA. Le DDFT coupe (seuil d’environ 5 mA).', { cls: 'b' });
    return S;
  };

  /* ---------- Figure : tension de pas près d'un fil tombé ---------- */
  HQ.figs['tension-pas'] = function () {
    const S = HQ.S(740, 262, 'Un fil tombé met le sol sous tension. Le potentiel du sol baisse quand on s’éloigne. Près du fil, un grand pas place les deux pieds à des potentiels différents. Il faut rester à plus de 10 m et s’éloigner en glissant les pieds ou à petits sauts, pieds joints');
    const g = 208, base = 108, xc = 140;
    const V = x => 80 * Math.exp(-(x - xc) / 110);
    // potentiel du sol en fonction de la distance
    S.line(xc, base, 720, base, 'dash');
    S.arrow(xc, base, xc, 14, 'ax');
    S.text(xc + 8, 16, 'potentiel du sol', { anchor: 'start', cls: 'sm tw' });
    let d = '';
    for (let x = xc; x <= 720; x += 4) d += (x === xc ? 'M' : 'L') + x + ',' + (base - V(x)).toFixed(1);
    S.path(d, 'c4');
    S.text(318, 44, 'Il baisse quand on s’éloigne du point de contact.', { anchor: 'start', cls: 'sm tw' });
    // sol, poteau et fil tombé
    S.rect(20, g, 700, 9, 'panel');
    S.line(20, g, 720, g, 'ln');
    S.rect(50, 30, 8, g - 30, 'body');
    S.line(36, 42, 72, 42, 'sym');
    S.path(`M72,42 C108,66 ${xc},150 ${xc},${g}`, 'c2');
    S.text(118, 176, 'fil tombé', { anchor: 'end', cls: 'sm b th' });
    function person(x1, x2) {
      const hx = (x1 + x2) / 2;
      S.line(x1, g, x1, base - V(x1), 'dash'); S.line(x2, g, x2, base - V(x2), 'dash');
      S.line(x1, g, hx, g - 42, 'sym'); S.line(x2, g, hx, g - 42, 'sym');
      S.line(hx, g - 42, hx, g - 72, 'sym');
      S.line(hx - 12, g - 60, hx + 12, g - 60, 'sym');
      S.circle(hx, g - 80, 8, 'sym fill');
    }
    person(200, 244);
    const y1 = base - V(200), y2 = base - V(244);
    S.line(200, y1, 262, y1, 'c2'); S.line(244, y2, 262, y2, 'c2');
    S.add('line', { x1: 262, y1, x2: 262, y2, class: 'c2', style: 'stroke-width:4' });
    S.text(270, (y1 + y2) / 2 + 2, 'tension de pas', { anchor: 'start', cls: 'sm b th' });
    S.text(262, 152, 'Grand pas près du fil :', { anchor: 'start', cls: 'sm b' });
    S.text(262, 167, 'les deux pieds ne sont pas', { anchor: 'start', cls: 'sm' });
    S.text(262, 182, 'au même potentiel.', { anchor: 'start', cls: 'sm' });
    person(604, 616);
    S.text(630, 152, 'Pieds joints,', { anchor: 'start', cls: 'sm b' });
    S.text(630, 167, 'sans les soulever', { anchor: 'start', cls: 'sm' });
    // distance de sécurité
    S.line(xc, g, xc, g + 34, 'dash'); S.line(560, g, 560, g + 34, 'dash');
    S.add('line', { x1: xc + 2, y1: g + 26, x2: 558, y2: g + 26, class: 'ln', 'marker-start': 'url(#ah)', 'marker-end': 'url(#ah)' });
    S.text(350, g + 46, 'au moins 10 m', { cls: 'b' });
    return S;
  };

  /* ---------- Démo : courant dans le corps ---------- */
  HQ.widgets['courant-corps'] = function (c) {
    wk.header(c, 'Le courant dans le corps', 'Règle la tension de contact et l’état de la peau. La loi d’Ohm donne un ordre de grandeur du courant, placé sur l’échelle des effets.');
    const U = wk.rangeInput('Tension de contact', 120, 12, 600, 1, v => v + ' V');
    const presets = el('div', { class: 'w-row' }, [el('span', { class: 'small' }, 'Tensions courantes :')].concat(
      [24, 120, 240, 347, 600].map(v => el('button', { type: 'button', class: 'btn secondary small', onclick: () => { U.input.value = v; U.input.dispatchEvent(new Event('input')); } }, v + ' V'))));
    let R = 100000;
    const skin = wk.seg([['100000', 'Peau sèche (≈ 100 kΩ)'], ['10000', 'Peau humide (≈ 10 kΩ)'], ['1000', 'Peau mouillée (≈ 1 kΩ)']], '100000', v => { R = parseFloat(v); update(); });
    const box = el('div', { class: 'svg-wrap' }), out = el('div'), zone = el('p', { class: 'center' });
    const note = el('p', { class: 'w-note', html: '<strong>Ordres de grandeur seulement.</strong> La résistance réelle du corps change d’une personne et d’une situation à l’autre, et les seuils entre les zones sont approximatifs. Au-delà d’environ 120 V, la peau cède et la résistance tombe vers 1 000 à 2 000 Ω, même si elle est sèche. Un petit résultat ne prouve jamais qu’un contact est sans danger.' });
    function update() {
      const u = U.value;
      const Rb = u > 120 && R > 5000 ? (R > 50000 ? 2000 : 1000) : R;   // au-delà de 120 V, la peau cède (même règle que gen.js)
      const i = u / Rb * 1000;          // courant en mA
      const z = ZONES.find(zz => i < zz.hi) || ZONES[ZONES.length - 1];
      const S = HQ.S(520, 122, 'Échelle des effets du courant avec un repère à ' + HQ.eng(i / 1000, 'A'));
      const sx = drawScale(S, 26, 494, 62, 26, 'mut');
      const X = sx(Math.max(0.1, Math.min(10000, i)));
      S.line(X, 52, X, 92, 'needle');
      S.path(`M${(X - 6).toFixed(1)},42 L${(X + 6).toFixed(1)},42 L${X.toFixed(1)},53 Z`, 'f2');
      S.text(Math.max(56, Math.min(464, X)), 32, 'I ≈ ' + HQ.eng(i / 1000, 'A'), { cls: 'b th' });
      box.replaceChildren(S.node);
      zone.innerHTML = '<strong>' + z.range + ' :</strong> ' + z.txt;
      out.replaceChildren(wk.readout([
        ['Tension de contact U', u + ' V'],
        ['Résistance du corps R', HQ.eng(Rb, 'Ω') + (Rb !== R ? ' (au-delà de 120 V, la peau cède)' : '')],
        ['Courant I = U ÷ R', HQ.eng(i / 1000, 'A')],
        ['Effet probable', z.txt]
      ]));
    }
    U.input.addEventListener('input', update);
    c.append(el('div', { class: 'controls' }, [U.lab]), presets, el('div', { class: 'w-row' }, [skin.node]), box, zone, out, note);
    update();
  };

  /* ---------- Démo : remettre le cadenassage en ordre ---------- */
  HQ.widgets['ordre-cadenassage'] = function (c) {
    wk.header(c, 'Remets le cadenassage en ordre', 'Clique sur les étapes dans l’ordre où on les fait. Pour corriger, clique sur une étape déjà placée : elle retourne dans la réserve.');
    const STEPS = [
      'Identifier toutes les sources d’énergie',
      'Aviser les personnes concernées',
      'Arrêter l’équipement',
      'Isoler : ouvrir le sectionneur ou le disjoncteur',
      'Cadenasser et étiqueter',
      'Dissiper l’énergie résiduelle',
      'Vérifier l’absence de tension et faire un essai de démarrage'
    ];
    let pool = [], order = [], checked = false;
    const poolBox = el('div', { class: 'cad-pool' });
    const list = el('ol', { class: 'steps cad-list' });
    const out = el('div');
    const bCheck = el('button', { type: 'button', class: 'btn' }, 'Vérifier');
    const bReset = el('button', { type: 'button', class: 'btn secondary' }, 'Mélanger de nouveau');
    function shuffle() {
      do {
        pool = STEPS.map((_, i) => i);
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      } while (pool.every((v, i) => v === i));
      order = []; checked = false; out.replaceChildren(); render();
    }
    function render() {
      poolBox.replaceChildren(...pool.map(i => el('button', { type: 'button', class: 'cad-step', onclick: () => {
        pool = pool.filter(k => k !== i); order.push(i); checked = false; out.replaceChildren(); render();
      } }, STEPS[i])));
      if (!pool.length) poolBox.appendChild(el('span', { class: 'small' }, 'Toutes les étapes sont placées.'));
      list.replaceChildren(...order.map((i, pos) => el('li', { class: checked ? (i === pos ? 'ok' : 'no') : null }, [
        el('button', { type: 'button', class: 'cad-step', title: 'Retirer cette étape', onclick: () => {
          order = order.filter(k => k !== i); pool.push(i); checked = false; out.replaceChildren(); render();
        } }, STEPS[i])
      ])));
      if (!order.length) list.appendChild(el('li', { class: 'cad-empty' }, 'Clique sur la première étape à faire.'));
      bCheck.disabled = order.length < STEPS.length;
    }
    bCheck.addEventListener('click', () => {
      if (order.length < STEPS.length) return;
      checked = true; render();
      const good = order.filter((v, i) => v === i).length, ok = good === STEPS.length;
      const kids = [el('div', { class: 'verdict ' + (ok ? 'ok' : 'no') }, ok ? 'Bon ordre : les 7 étapes sont à leur place.' : good + ' étape' + (good > 1 ? 's' : '') + ' sur 7 à la bonne place. Le bon ordre :')];
      if (!ok) kids.push(el('ol', {}, STEPS.map(s => el('li', {}, s))));
      kids.push(el('p', {}, 'La logique : on prépare (identifier, aviser), on coupe (arrêter, isoler), on verrouille (cadenasser, étiqueter), puis on s’assure qu’il ne reste aucune énergie (dissiper, vérifier). Selon les sources, « dissiper » se place parfois avant « cadenasser » : retiens surtout que la vérification vient en dernier.'));
      out.replaceChildren(el('div', { class: 'sol-box' + (ok ? '' : ' wrong') }, kids));
    });
    bReset.addEventListener('click', shuffle);
    c.append(
      el('div', { class: 'cad-cols' }, [
        el('div', {}, [el('div', { class: 'cad-head' }, 'Étapes à placer'), poolBox]),
        el('div', {}, [el('div', { class: 'cad-head' }, 'Ton ordre'), list])
      ]),
      el('div', { class: 'w-row' }, [bCheck, bReset]), out);
    shuffle();
  };
})();
