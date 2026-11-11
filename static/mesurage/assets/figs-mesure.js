/* Figures et démos de la page « Mesure et comptage électrique » */
(function () {
  'use strict';
  const HQ = window.HQ, wk = HQ.wk, el = HQ.el;
  // flèche de courant horizontale, étiquette dégagée de la pointe
  function cur(S, x1, y, x2, label) {
    S.arrow(x1, y, x2, y, 'c2', 'ahb');
    if (label) S.text((x1 + x2) / 2 + (x2 > x1 ? -5 : 5), y - 10, label, { cls: 'sm th' });
  }


  // double flèche de cote
  function cote(S, x1, y1, x2, y2) {
    return S.add('line', { x1, y1, x2, y2, class: 'ln', 'marker-start': 'url(#ah)', 'marker-end': 'url(#ah)' });
  }

  /* ---------- Figure : où brancher les appareils ---------- */
  HQ.figs['ou-brancher'] = function () {
    const S = HQ.S(780, 262, 'Circuit avec un ampèremètre en série, un voltmètre en parallèle sur la charge et une pince ampèremétrique autour d’un seul fil ; à droite, un ohmmètre branché sur un élément hors tension');
    S.comp('AC', 80, 200, 80, 70, { label: 'Source', val: '120 V', side: 'l' });
    S.comp('meter', 80, 70, 300, 70, { letter: 'A', label: 'Ampèremètre', val: 'en série' });
    S.wire([[300, 70], [450, 70]]);
    S.comp('R', 340, 70, 340, 200, { label: 'Charge', side: 'l' });
    S.comp('meter', 450, 70, 450, 200, { letter: 'V', label: 'Voltmètre', val: 'en parallèle' });
    S.wire([[450, 200], [80, 200]]);
    S.dot(340, 70); S.dot(340, 200);
    cur(S, 236, 58, 290, 'I');
    // pince ampèremétrique sur le fil de retour
    S.add('circle', { cx: 200, cy: 200, r: 15, class: 'c4', style: 'stroke-width:4.5' });
    S.rect(188, 216, 24, 30, 'soft4', 5);
    S.text(222, 232, 'Pince ampèremétrique', { anchor: 'start', cls: 'b' });
    S.text(222, 247, 'autour d’un seul fil, sans ouvrir le circuit', { anchor: 'start', cls: 'sm' });
    // ohmmètre : élément isolé, aucune source
    S.line(582, 24, 582, 246, 'dash');
    S.text(682, 30, 'Ohmmètre', { cls: 'b' });
    S.text(682, 46, 'élément hors tension', { cls: 'sm' });
    S.comp('R', 637, 80, 637, 190, { label: 'R', side: 'l' });
    S.comp('meter', 727, 80, 727, 190, { letter: 'Ω' });
    S.wire([[637, 80], [727, 80]]); S.wire([[637, 190], [727, 190]]);
    S.text(682, 216, 'aucune source', { cls: 'sm mut' });
    S.text(682, 231, 'dans la boucle', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : la pince autour d'un ou de deux conducteurs ---------- */
  HQ.figs['pince-conducteurs'] = function () {
    const S = HQ.S(690, 218, 'À gauche, une pince autour d’un seul conducteur indique 12 A ; à droite, une pince autour de l’aller et du retour indique environ 0 A');
    function panel(x0, both, title, reading, note, ncls) {
      S.text(x0 + 155, 20, title, { cls: 'b' });
      S.line(x0, 60, x0 + 310, 60, 'wire neu thick');
      S.line(x0, 100, x0 + 310, 100, 'wire hot thick');
      S.arrow(x0 + 95, 50, x0 + 35, 50, 'wire neu thin', 'ahm'); S.text(x0 + 65, 43, 'retour 12 A', { cls: 'sm mut' });
      S.arrow(x0 + 35, 112, x0 + 95, 112, 'c2', 'ahb'); S.text(x0 + 65, 129, 'aller 12 A', { cls: 'sm th' });
      const cx = x0 + 215;
      if (both) S.add('ellipse', { cx, cy: 80, rx: 20, ry: 40, class: 'c4', style: 'stroke-width:5' });
      else S.add('circle', { cx, cy: 100, r: 17, class: 'c4', style: 'stroke-width:5' });
      S.rect(cx - 30, 124, 60, 56, 'body', 7);
      S.rect(cx - 24, 131, 48, 22, 'panel', 3);
      S.text(cx, 147, reading, { cls: 'b' });
      S.text(cx, 170, 'pince', { cls: 'xs mut' });
      S.text(x0 + 155, 204, note, { cls: 'sm b ' + ncls });
    }
    panel(20, false, 'Autour d’un seul conducteur', '12,0 A', 'Lecture juste : 12 A', 'tok');
    panel(360, true, 'Autour de l’aller et du retour', '0,0 A', 'Les deux champs s’annulent : environ 0 A', 'th');
    return S;
  };

  /* ---------- Figure : énergie = puissance × temps ---------- */
  HQ.figs['energie-rectangle'] = function () {
    const S = HQ.S(660, 232, 'Graphique de la puissance en fonction du temps : un rectangle de 4,5 kW de haut et de 3 h de large représente 13,5 kWh');
    const p = S.plot({ x: 80, y: 44, w: 300, h: 140, xr: [0, 4], yr: [0, 6], xlabel: 'temps (h)', ylabel: 'puissance (kW)' });
    S.rect(p.sx(0), p.sy(4.5), p.sx(3) - p.sx(0), p.sy(0) - p.sy(4.5), 'soft1');
    [1, 2, 3].forEach(v => p.xtick(v, String(v)));
    [[1.5, '1,5'], [3, '3'], [4.5, '4,5']].forEach(t => p.ytick(t[0], t[1]));
    S.text(p.sx(1.5), 120, 'Énergie = 4,5 kW × 3 h', { cls: 'b te' });
    S.text(p.sx(1.5), 142, '= 13,5 kWh', { cls: 'lg b te' });
    S.text(478, 84, 'Le kW : un rythme', { anchor: 'start', cls: 'b' });
    S.text(478, 101, 'la hauteur du rectangle', { anchor: 'start', cls: 'sm mut' });
    S.text(478, 136, 'Le kWh : une quantité', { anchor: 'start', cls: 'b' });
    S.text(478, 153, 'la surface du rectangle', { anchor: 'start', cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : hauteur de l'embase et dégagement ---------- */
  HQ.figs['embase-degagement'] = function () {
    const S = HQ.S(620, 252, 'Vue de côté d’un mur avec une embase et son compteur : le centre de l’embase est entre 1,2 m et 1,6 m du sol fini, et un dégagement d’au moins 1 m est libre devant l’appareillage');
    const g = 222;                       // sol fini ; échelle : 100 px par mètre
    S.rect(64, 16, 20, g - 16, 'body');
    S.text(74, 244, 'mur', { cls: 'sm mut' });
    S.line(30, g, 590, g, 'ln');
    S.text(586, g + 16, 'sol fini', { anchor: 'end', cls: 'sm mut' });
    // plage permise pour le centre de l'embase
    S.rect(84, g - 160, 300, 40, 'soft3');
    S.line(384, g - 160, 462, g - 160, 'dash'); S.line(384, g - 120, 418, g - 120, 'dash');
    cote(S, 408, g - 2, 408, g - 118);
    cote(S, 452, g - 2, 452, g - 158);
    S.text(414, g - 60, '1,2 m', { anchor: 'start', cls: 'sm b' });
    S.text(458, g - 60, '1,6 m', { anchor: 'start', cls: 'sm b' });
    S.text(504, g - 144, 'Le centre de', { anchor: 'start', cls: 'sm td' });
    S.text(504, g - 129, 'l’embase est', { anchor: 'start', cls: 'sm td' });
    S.text(504, g - 114, 'dans cette plage.', { anchor: 'start', cls: 'sm td' });
    // embase et compteur (centre à 1,4 m)
    S.rect(84, g - 168, 22, 56, 'body', 3);
    S.rect(106, g - 155, 15, 30, 'soft1', 7);
    S.dot(95, g - 140, 2.6);
    S.text(92, g - 180, 'embase et compteur', { anchor: 'start', cls: 'sm b' });
    // dégagement devant l'appareillage
    S.line(121, g, 121, g - 44, 'dash'); S.line(221, g, 221, g - 44, 'dash');
    cote(S, 123, g - 22, 219, g - 22);
    S.text(171, g - 30, 'au moins 1 m', { cls: 'sm b' });
    S.text(232, g - 26, 'dégagement libre', { anchor: 'start', cls: 'sm mut' });
    S.text(232, g - 12, 'devant l’appareillage', { anchor: 'start', cls: 'sm mut' });
    return S;
  };

  /* ---------- Cadrans d'un compteur (figure et démo) ---------- */
  const DIAL_NAMES = ['Milliers', 'Centaines', 'Dizaines', 'Unités'];
  const DIAL_CW = [false, true, false, true];       // milliers antihoraire, centaines horaire, dizaines antihoraire, unités horaire
  const dialValues = N => [N / 1000 % 10, N / 100 % 10, N / 10 % 10, N % 10];
  function drawDial(S, cx, i, v, reveal) {
    S.dial(cx, 80, 46, v, DIAL_CW[i], DIAL_NAMES[i]);
    S.text(cx, 178, reveal ? String(Math.floor(v)) : '?', { cls: reveal ? 'lg b te' : 'lg b mut' });
  }
  // un dessin par cadran : sur un écran étroit, les quatre cadrans passent sur deux rangées au lieu de rapetisser
  function dialNodes(N, reveal) {
    return dialValues(N).map((v, i) => {
      const S = HQ.S(140, 192, 'Cadran des ' + DIAL_NAMES[i].toLowerCase() + (reveal ? ' : ' + Math.floor(v) : ''));
      drawDial(S, 70, i, v, reveal);
      return S.node;
    });
  }
  HQ.figs['cadrans-exemple'] = function () { return el('div', { class: 'mz-dials' }, dialNodes(7523.6, true)); };

  /* ---------- Figure : mesurage direct et mesurage avec TC ---------- */
  HQ.figs['mesurage-direct-tc'] = function () {
    const S = HQ.S(780, 262, 'À gauche, mesurage direct : tout le courant traverse le compteur. À droite, mesurage avec un transformateur de courant 200:5 : la ligne porte 160 A et le compteur ne reçoit que 4 A');
    // mesurage direct
    S.text(180, 22, 'Mesurage direct', { cls: 'b' });
    S.comp('meter', 40, 100, 320, 100, { letter: 'kWh', label: 'Compteur' });
    S.text(40, 124, 'Réseau', { anchor: 'start', cls: 'sm mut' });
    S.text(320, 124, 'Client', { anchor: 'end', cls: 'sm mut' });
    cur(S, 56, 90, 116, '80 A'); cur(S, 244, 90, 304, '80 A');
    S.text(180, 172, 'Tout le courant du client', { cls: 'sm' });
    S.text(180, 188, 'traverse le compteur.', { cls: 'sm' });
    S.text(180, 246, 'Multiplicateur : 1', { cls: 'b te' });
    S.line(366, 12, 366, 252, 'dash');
    // mesurage avec transformateur de courant
    S.text(585, 22, 'Mesurage avec transformateur de courant', { cls: 'b' });
    const ct = S.comp('ct', 410, 100, 760, 100, { label: 'TC 200:5' });
    S.text(410, 124, 'Réseau', { anchor: 'start', cls: 'sm mut' });
    S.text(760, 124, 'Client', { anchor: 'end', cls: 'sm mut' });
    cur(S, 426, 90, 486, '160 A'); cur(S, 684, 90, 744, '160 A');
    S.wire([ct.s1, [575, 140], [535, 140], [535, 186]], 'wire acc');
    S.wire([ct.s2, [595, 140], [635, 140], [635, 186]], 'wire acc');
    S.comp('meter', 535, 186, 635, 186, { letter: 'kWh', label: 'Compteur', side: 'b', wire: 'wire acc' });
    S.text(520, 158, '4 A seulement', { anchor: 'end', cls: 'sm b te' });
    S.text(520, 173, '(160 A ÷ 40)', { anchor: 'end', cls: 'sm mut' });
    S.text(650, 158, 'circuit secondaire', { anchor: 'start', cls: 'sm te' });
    S.text(650, 173, 'du TC', { anchor: 'start', cls: 'sm te' });
    S.text(585, 246, 'Multiplicateur : 200 ÷ 5 = 40', { cls: 'b te' });
    return S;
  };

  /* ---------- Démo : lecture d'un compteur à cadrans ---------- */
  HQ.widgets['lecture-compteur'] = function (c) {
    wk.header(c, 'Lis le compteur', 'Lis les quatre cadrans de gauche à droite, tape le relevé, puis vérifie. Regarde bien le sens de rotation de chaque cadran.');
    const box = el('div', { class: 'mz-dials' });
    const input = el('input', { type: 'text', inputmode: 'numeric', maxlength: '4', placeholder: '0000', autocomplete: 'off', class: 'mz-in', 'aria-label': 'Relevé lu sur les cadrans, en kWh' });
    const bCheck = el('button', { type: 'button', class: 'btn' }, 'Vérifier');
    const bNew = el('button', { type: 'button', class: 'btn secondary' }, 'Nouveau compteur');
    const out = el('div');
    let N = 0;
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const draw = reveal => box.replaceChildren(...dialNodes(N, reveal));
    function fresh() {
      const d = [ri(0, 9), ri(0, 9), ri(0, 9), ri(0, 9)];
      // une fois sur deux environ : un 9 suivi d'un chiffre élevé, pour qu'une aiguille semble « pile » sur un chiffre
      if (Math.random() < 0.45) { const k = ri(1, 2); d[k] = 9; d[k + 1] = ri(6, 9); }
      N = d[0] * 1000 + d[1] * 100 + d[2] * 10 + d[3] + 0.25 + Math.random() * 0.5;
      input.value = ''; out.replaceChildren(); draw(false);
    }
    function explain() {
      const vals = dialValues(N);
      return vals.map((v, i) => {
        const d = Math.floor(v), f = v - d, next = (d + 1) % 10;
        if (i < 3) {
          // la fraction d'un cadran vaut la lecture du cadran de droite ÷ 10 : à moins de 0,1 d'un chiffre, l'aiguille semble posée dessus
          if (f >= 0.9) return `l’aiguille semble sur le ${next}, mais le cadran de droite n’a pas encore dépassé 0 (son aiguille est entre 9 et 0) : on retient le chiffre précédent, <strong>${d}</strong>.`;
          if (f <= 0.1) return `l’aiguille semble sur le ${d}, et le cadran de droite a déjà dépassé 0 (son aiguille est entre 0 et 1) : on retient <strong>${d}</strong>.`;
        }
        if (d === 9) return 'l’aiguille est entre 9 et 0 : on retient <strong>9</strong>.';
        return `l’aiguille est entre ${d} et ${next} : on retient le plus petit, <strong>${d}</strong>.`;
      });
    }
    function check() {
      const txt = input.value.replace(/\s/g, '');
      if (!/^\d{1,4}$/.test(txt)) {
        out.replaceChildren(el('p', { class: 'w-note' }, 'Tape un relevé de quatre chiffres, par exemple 0472.'));
        return;
      }
      const good = Math.floor(N), ok = parseInt(txt, 10) === good;
      const s = String(good).padStart(4, '0');
      const items = explain().map((t, i) => el('li', { html: '<strong>' + DIAL_NAMES[i] + ' :</strong> ' + t }));
      out.replaceChildren(el('div', { class: 'sol-box' + (ok ? '' : ' wrong') }, [
        el('div', { class: 'verdict ' + (ok ? 'ok' : 'no') }, ok ? 'Bonne lecture : ' + s + ' kWh' : 'Pas tout à fait : le bon relevé est ' + s + ' kWh'),
        el('ul', {}, items)
      ]));
      draw(true);
    }
    bCheck.addEventListener('click', check);
    bNew.addEventListener('click', fresh);
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') check(); });
    c.append(box, el('div', { class: 'w-row' }, [el('label', {}, ['Ton relevé : ', input, ' kWh']), bCheck, bNew]), out);
    fresh();
  };

  /* ---------- Démo : multiplicateur de mesurage ---------- */
  HQ.widgets['multiplicateur'] = function (c) {
    wk.header(c, 'Le multiplicateur de mesurage', 'Choisis les transformateurs de mesure et entre deux relevés du compteur : la démo détaille le calcul de la consommation réelle.');
    const tc = wk.selectInput('Transformateur de courant (TC)', [['0', 'Aucun (mesurage direct)'], ['100', '100:5'], ['200', '200:5'], ['400', '400:5'], ['800', '800:5']], '200');
    const tt = wk.selectInput('Transformateur de tension (TT)', [['0', 'Aucun'], ['2400', '2400:120'], ['14400', '14 400:120']], '0');
    const r0 = wk.numInput('Relevé précédent', 2418, { min: 0, step: 1 });
    const r1 = wk.numInput('Relevé actuel', 2468, { min: 0, step: 1 });
    const out = el('div'), note = el('p', { class: 'w-note' });
    const f = x => HQ.fr(x, 2);
    function update() {
      const p = parseFloat(tc.input.value), v = parseFloat(tt.input.value);
      const kc = p ? p / 5 : 1, kv = v ? v / 120 : 1, m = kc * kv;
      const a = parseFloat(r0.input.value), b = parseFloat(r1.input.value);
      if (!isFinite(a) || !isFinite(b)) { out.replaceChildren(); note.textContent = 'Entre les deux relevés du compteur.'; return; }
      const d = b - a;
      out.replaceChildren(wk.readout([
        ['Rapport du TC', p ? f(p) + ' ÷ 5 = ' + f(kc) : 'aucun TC : 1'],
        ['Rapport du TT', v ? f(v) + ' ÷ 120 = ' + f(kv) : 'aucun TT : 1'],
        ['Multiplicateur', f(kc) + ' × ' + f(kv) + ' = ' + f(m)],
        ['Différence des relevés', d < 0 ? 'relevés à vérifier' : f(b) + ' − ' + f(a) + ' = ' + f(d)],
        ['Consommation réelle', d < 0 ? 'à recalculer' : f(d) + ' × ' + f(m) + ' = ' + f(d * m) + ' kWh']
      ]));
      if (d < 0) note.innerHTML = '<strong>Vérifie tes valeurs :</strong> le relevé actuel est plus petit que le relevé précédent.';
      else if (m === 1) note.innerHTML = '<strong>Mesurage direct :</strong> le compteur voit tout le courant et toute la tension. La différence des relevés donne directement la consommation.';
      else note.innerHTML = '<strong>Mesurage avec transformateurs :</strong> le compteur ne voit qu’une image réduite. Chaque kWh affiché en représente ' + f(m) + ' en réalité.';
    }
    [tc.input, tt.input].forEach(i => i.addEventListener('change', update));
    [r0.input, r1.input].forEach(i => i.addEventListener('input', update));
    c.append(el('div', { class: 'controls' }, [tc.lab, tt.lab, r0.lab, r1.lab]), out, note);
    update();
  };
})();
