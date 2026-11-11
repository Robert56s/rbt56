/* Figures et démos de la page « Unités, préfixes et notation scientifique » */
(function () {
  'use strict';
  const HQ = window.HQ, wk = HQ.wk, el = HQ.el, NB = HQ.NBSP;

  const PREF = [
    { s: 'G', name: 'giga', e: 9 }, { s: 'M', name: 'méga', e: 6 }, { s: 'k', name: 'kilo', e: 3 },
    { s: '', name: 'unité de base', e: 0 },
    { s: 'm', name: 'milli', e: -3 }, { s: 'µ', name: 'micro', e: -6 }, { s: 'n', name: 'nano', e: -9 }, { s: 'p', name: 'pico', e: -12 }
  ];
  const SVGNS = 'http://www.w3.org/2000/svg';
  const minus = e => String(e).replace('-', '−');
  const p10r = e => '10^{' + minus(e) + '}';            // pour rich() dans un SVG
  const p10h = e => '10<sup>' + minus(e) + '</sup>';    // pour du HTML

  // texte SVG avec exposants : rich(S, x, y, '4,7 × 10^{−3}', { anchor, cls, up })
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
  // mantisse et exposant d'un nombre positif : 0,00047 -> { m: 4.7, e: -4 }
  function split(ax) {
    const parts = ax.toExponential(11).split('e');
    let m = Number(Number(parts[0]).toPrecision(10)), e = Number(parts[1]);
    if (m >= 10) { m /= 10; e += 1; }
    return { m, e };
  }
  const sciH = x => { if (x === 0) return '0'; const q = split(Math.abs(x)); return (x < 0 ? '−' : '') + HQ.fr(q.m, 4) + ' × ' + p10h(q.e); };

  // nombre écrit au long : espaces par groupes de trois (dès 1 000) et virgule décimale
  function plain(x) {
    if (x === 0) return '0';
    const ax = Math.abs(x);
    if (ax >= 1e15 || ax < 1e-13) return HQ.sci(x, 4);
    const e = Math.floor(Math.log10(ax));
    let s = Number(ax.toPrecision(10)).toFixed(Math.max(0, Math.min(20, 9 - e)));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    const parts = s.split('.');
    const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, NB);
    return (x < 0 ? '−' : '') + int + (parts[1] ? ',' + parts[1] : '');
  }

  /* ---------- Figure : l'escalier des préfixes ---------- */
  HQ.figs['escalier-prefixes'] = function () {
    const S = HQ.S(760, 318, 'Escalier des préfixes : giga en haut à gauche, puis méga, kilo, unité de base, milli, micro, nano et pico en bas à droite. Chaque marche vaut un facteur 1000.');
    const x0 = 44, y0 = 62, sw = 84, sh = 28, base = 302, n = PREF.length;
    let d = `M${x0},${base} V${y0}`;
    for (let i = 0; i < n; i++) { d += ` H${x0 + (i + 1) * sw}`; d += i < n - 1 ? ` V${y0 + (i + 1) * sh}` : ` V${base}`; }
    S.path(d + ' Z', 'soft1');
    PREF.forEach((p, i) => {
      const cx = x0 + i * sw + sw / 2, y = y0 + i * sh;
      S.text(cx, y - 23, p.s || 'V, A, Ω', { cls: 'lg b te' });
      S.text(cx, y - 8, p.name, { cls: 'sm' });
      rich(S, cx, y + 20, p10r(p.e), { cls: 'b' });
    });
    // descendre : vers un préfixe plus petit
    S.add('line', { x1: 436, y1: 94, x2: 712, y2: 186, class: 'c2', 'marker-end': 'url(#ahb)', style: 'stroke-width:2.6' });
    S.text(746, 26, 'Descendre d’une marche : nombre × 1000', { anchor: 'end', cls: 'b th' });
    S.text(746, 43, 'la virgule avance de 3 rangs vers la droite', { anchor: 'end', cls: 'sm' });
    S.text(746, 59, 'exemple : 0,035 A = 35 mA', { anchor: 'end', cls: 'sm mut' });
    // monter : vers un préfixe plus grand
    S.add('line', { x1: 404, y1: 236, x2: 128, y2: 144, class: 'c3', 'marker-end': 'url(#ahd)', style: 'stroke-width:2.6' });
    S.text(58, 254, 'Monter d’une marche : nombre ÷ 1000', { anchor: 'start', cls: 'b td' });
    S.text(58, 271, 'la virgule recule de 3 rangs vers la gauche', { anchor: 'start', cls: 'sm' });
    S.text(58, 287, 'exemple : 4' + NB + '700 Ω = 4,7 kΩ', { anchor: 'start', cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : la virgule qui se déplace ---------- */
  HQ.figs['virgule-conversion'] = function () {
    const S = HQ.S(680, 218, 'Deux conversions : 4,7 kilohms devient 4700 ohms en avançant la virgule de 3 rangs ; 35 milliampères devient 0,035 ampère en reculant la virgule de 3 rangs');
    // digits : 4 chiffres ; fresh : indices des zéros ajoutés ; from, to : position de la virgule (0 à 4, entre les chiffres)
    function panel(cx, title, digits, fresh, from, to, result, how) {
      const cw = 42, left = cx - 2 * cw, yb = 104, bx = k => left + cw * k;
      S.text(cx, 24, title, { cls: 'b' });
      digits.forEach((dg, i) => {
        S.add('text', { x: left + cw * (i + 0.5), y: yb, 'text-anchor': 'middle', class: fresh.indexOf(i) >= 0 ? 'te' : 'b', style: 'font-size:30px' }, dg);
      });
      S.add('text', { x: bx(from), y: yb, 'text-anchor': 'middle', class: 'mut b', style: 'font-size:30px' }, ',');
      S.add('text', { x: bx(to), y: yb, 'text-anchor': 'middle', class: 'th b', style: 'font-size:30px' }, ',');
      S.text(bx(from), 62, 'départ', { cls: 'sm mut' });
      S.text(bx(to), 62, 'arrivée', { cls: 'sm b th' });
      const dir = to > from ? 1 : -1;
      for (let k = from, num = 1; k !== to; k += dir, num++) {
        S.add('path', { d: `M${bx(k)},118 q${dir * cw / 2},26 ${dir * cw},0`, class: 'c2', 'marker-end': 'url(#ahb)' });
        S.text(bx(k) + dir * cw / 2, 149, String(num), { cls: 'sm b th' });
      }
      S.text(cx, 181, result, { cls: 'lg b' });
      S.text(cx, 201, how, { cls: 'sm mut' });
    }
    panel(170, '4,7 kΩ en ohms : × 1000', ['4', '7', '0', '0'], [2, 3], 1, 4, '4,7 kΩ = 4' + NB + '700 Ω', 'la virgule avance de 3 rangs ; on ajoute 2 zéros');
    panel(510, '35 mA en ampères : ÷ 1000', ['0', '0', '3', '5'], [0, 1], 4, 1, '35 mA = 0,035 A', 'la virgule recule de 3 rangs ; on ajoute 2 zéros');
    S.line(340, 12, 340, 206, 'dash');
    return S;
  };

  /* ---------- Figure : anatomie de la notation scientifique ---------- */
  HQ.figs['notation-sci-anatomie'] = function () {
    const S = HQ.S(660, 214, 'Le nombre 4,7 fois 10 exposant 3 : 4,7 est la mantisse, 3 est l’exposant. Exposant positif, la virgule va vers la droite ; exposant négatif, vers la gauche.');
    const big = (x, y, t, cls, size, anchor) => S.add('text', { x, y, 'text-anchor': anchor || 'middle', class: cls, style: 'font-size:' + size + 'px' }, t);
    big(108, 120, '4,7', 'b te', 42);
    big(168, 117, '×', 'mut', 32);
    big(220, 120, '10', 'b', 42);
    big(250, 98, '3', 'b th', 27, 'start');
    S.line(108, 131, 108, 151, 'ln');
    S.text(108, 168, 'mantisse', { cls: 'b te' });
    S.text(108, 184, 'un seul chiffre, de 1 à 9,', { cls: 'sm' });
    S.text(108, 199, 'avant la virgule', { cls: 'sm' });
    S.line(258, 72, 258, 54, 'ln');
    S.text(258, 28, 'exposant', { cls: 'b th' });
    S.text(258, 45, 'nombre de rangs de la virgule', { cls: 'sm' });
    const rows = [
      ['4,7 × 10^{3} = 4' + NB + '700', 'exposant positif : 3 rangs vers la droite'],
      ['4,7 × 10^{−3} = 0,0047', 'exposant négatif : 3 rangs vers la gauche'],
      ['4,7 × 10^{0} = 4,7', 'exposant zéro : le nombre ne change pas']
    ];
    rows.forEach((r, i) => {
      rich(S, 388, 50 + i * 58, r[0], { anchor: 'start', cls: 'lg b', up: 6 });
      S.text(388, 68 + i * 58, r[1], { anchor: 'start', cls: 'sm mut' });
    });
    S.line(364, 26, 364, 196, 'dash');
    return S;
  };

  /* ---------- Figure : les touches de la calculatrice ---------- */
  HQ.figs['touches-calculatrice'] = function () {
    const S = HQ.S(720, 226, 'Quatre suites de touches : 4.7 EE 3 affiche 4700 ; 1 EE 3 affiche 1000 ; 10 EE 3 affiche 10000, ce qui est une erreur ; 2 EE signe moins 3 affiche 0.002');
    const key = (x, y, t) => { const w = Math.max(32, 16 + t.length * 8); S.rect(x, y, w, 28, 'body', 6); S.text(x + w / 2, y + 19, t, { cls: 'b' }); return w + 6; };
    const head = (x, t) => S.text(x, 20, t, { anchor: 'start', cls: 'sm mut' });
    head(16, 'Ce que tu veux'); head(176, 'Touches'); head(420, 'Écran'); head(548, 'Verdict');
    const rows = [
      ['4,7 × 10^{3}', ['4', '.', '7', 'EE', '3'], '4700', 'correct : 4' + NB + '700', 'tok'],
      ['10^{3}', ['1', 'EE', '3'], '1000', 'correct : 1' + NB + '000', 'tok'],
      ['10^{3} (piège)', ['1', '0', 'EE', '3'], '10000', 'erreur : c’est 10 × 10^{3}', 'th'],
      ['2 × 10^{−3}', ['2', 'EE', '(−)', '3'], '0.002', 'correct : 0,002', 'tok']
    ];
    rows.forEach((r, i) => {
      const y = 36 + i * 48;
      rich(S, 16, y + 19, r[0], { anchor: 'start', cls: 'b' });
      let x = 176;
      r[1].forEach(k => { x += key(x, y, k); });
      S.arrow(378, y + 14, 408, y + 14, 'ln');
      S.rect(420, y - 1, 112, 30, 'panel', 5);
      S.add('text', { x: 524, y: y + 20, 'text-anchor': 'end', style: 'font-family:ui-monospace,Consolas,monospace;font-size:15px' }, r[2]);
      rich(S, 548, y + 19, r[3], { anchor: 'start', cls: 'sm b ' + r[4], up: 4 });
    });
    return S;
  };

  /* ---------- Figure : échelle des ordres de grandeur du courant ---------- */
  HQ.figs['echelle-courants'] = function () {
    const S = HQ.S(720, 190, 'Échelle logarithmique du courant, de 1 milliampère à 10 kiloampères, avec des repères : DEL témoin, lampe de 60 watts, circuit de prises, branchement de maison, court-circuit');
    const x0 = 50, w = 620, ya = 112;
    const X = v => x0 + (Math.log10(v) + 3) / 7 * w;
    const zone = (a, b, cls, tcls, t) => { S.rect(X(a), ya + 32, X(b) - X(a), 9, cls, 4); S.text((X(a) + X(b)) / 2, ya + 60, t, { cls: 'sm ' + tcls }); };
    zone(1e-3, 1, 'soft3', 'td', 'on compte en milliampères (mA)');
    zone(1, 1e3, 'soft1', 'te', 'on compte en ampères (A)');
    zone(1e3, 1e4, 'soft2', 'th', 'kiloampères (kA)');
    S.arrow(x0 - 12, ya, x0 + w + 26, ya, 'ax');
    [[1e-3, '1 mA'], [1e-2, '10 mA'], [0.1, '100 mA'], [1, '1 A'], [10, '10 A'], [100, '100 A'], [1e3, '1 kA'], [1e4, '10 kA']].forEach(t => {
      S.line(X(t[0]), ya - 5, X(t[0]), ya + 5, 'ax');
      S.text(X(t[0]), ya + 21, t[1], { cls: 'sm' });
    });
    const mark = (v, y, l1, l2) => {
      const x = X(v);
      S.line(x, ya - 4, x, y + 21, 'dash'); S.circle(x, ya, 4.5, 'f1');
      S.text(x, y, l1, { cls: 'sm b' }); S.text(x, y + 15, l2, { cls: 'sm mut' });
    };
    mark(0.02, 26, 'DEL témoin', 'environ 20 mA');
    mark(0.5, 58, 'lampe de 60 W', '0,5 A sur 120 V');
    mark(15, 26, 'circuit de prises', '15 A');
    mark(200, 58, 'branchement de maison', '100 ou 200 A');
    const xc = (X(1e3) + X(1e4)) / 2;
    S.add('line', { x1: X(1e3), y1: ya, x2: X(1e4), y2: ya, class: 'c2', style: 'stroke-width:5' });
    S.line(xc, ya - 5, xc, 47, 'dash');
    S.text(xc, 26, 'court-circuit', { cls: 'sm b th' }); S.text(xc, 41, 'des milliers d’ampères', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Démo : convertisseur de préfixes ---------- */
  HQ.widgets['convertisseur-prefixes'] = function (c) {
    wk.header(c, 'Convertisseur de préfixes', 'Entre une valeur, puis choisis le préfixe de départ, le préfixe d’arrivée et l’unité. L’escalier montre le chemin.');
    const opts = PREF.map((p, i) => [String(i), p.s ? p.s + ' (' + p.name + ')' : 'aucun (unité de base)']);
    const V = wk.numInput('Valeur', 4.7);
    const A = wk.selectInput('Préfixe de départ', opts, '2');
    const B = wk.selectInput('Préfixe d’arrivée', opts, '3');
    const Un = wk.selectInput('Unité', [['Ω', 'Ω (ohm)'], ['V', 'V (volt)'], ['A', 'A (ampère)'], ['W', 'W (watt)'], ['Wh', 'Wh (wattheure)'], ['F', 'F (farad)'], ['H', 'H (henry)'], ['Hz', 'Hz (hertz)'], ['VA', 'VA (voltampère)'], ['s', 's (seconde)']], 'Ω');
    const box = el('div', { class: 'svg-wrap' });
    const big = el('p', { class: 'bigval center' });
    const note = el('p', { class: 'w-note' });
    const out = el('div');
    const scale = (v, e) => Number((e >= 0 ? v * Math.pow(10, e) : v / Math.pow(10, -e)).toPrecision(12));
    function update() {
      const v = parseFloat(String(V.input.value).replace(',', '.'));
      const i = +A.input.value, j = +B.input.value, u = Un.input.value;
      const pa = PREF[i], pb = PREF[j], d = pa.e - pb.e, ad = Math.abs(d), n = Math.abs(i - j);
      const S = HQ.S(600, 202, 'Escalier des préfixes avec la marche de départ et la marche d’arrivée');
      S.node.style.minWidth = '480px';
      const x0 = 20, sw = 70, y0 = 64, sh = 10, base = 196;
      PREF.forEach((p, k) => {
        const x = x0 + k * sw, y = y0 + k * sh;
        S.rect(x, y, sw, base - y, k === i ? 'soft4' : k === j ? 'soft3' : 'panel');
        S.text(x + sw / 2, y + 20, p.s + u, { cls: 'b' });
        rich(S, x + sw / 2, y + 37, p10r(p.e), { cls: 'sm mut', up: 4 });
        if (k === i) S.text(x + sw / 2, y + 53, 'départ', { cls: 'xs b tw' });
        else if (k === j) S.text(x + sw / 2, y + 53, 'arrivée', { cls: 'xs b td' });
      });
      if (n > 0) {
        const xa = x0 + i * sw + sw / 2, ya = y0 + i * sh - 4, xb = x0 + j * sw + sw / 2, yb = y0 + j * sh - 5;
        const top = Math.min(ya, yb) - 50, xm = (xa + xb) / 2, ym = 0.25 * ya + 0.5 * top + 0.25 * yb;
        S.add('path', { d: `M${xa},${ya} Q${xm},${top} ${xb},${yb}`, class: 'c2', 'marker-end': 'url(#ahb)' });
        rich(S, xm, ym - 7, (d > 0 ? '× ' : '÷ ') + (ad > 12 ? p10r(ad) : plain(Math.pow(10, ad))), { cls: 'b th' });
      }
      box.replaceChildren(S.node);
      if (!isFinite(v)) { big.textContent = 'Entre un nombre dans la case Valeur.'; note.textContent = ''; out.replaceChildren(); return; }
      const res = scale(v, d), baseVal = scale(v, pa.e), fac = ad > 12 ? p10h(ad) : plain(Math.pow(10, ad));
      const na = '<strong>' + pa.s + u + '</strong>', nb = '<strong>' + pb.s + u + '</strong>';
      big.textContent = plain(v) + NB + pa.s + u + ' = ' + plain(res) + NB + pb.s + u;
      if (n === 0) note.innerHTML = 'Même préfixe au départ et à l’arrivée : il n’y a rien à convertir.';
      else if (d > 0) note.innerHTML = `De ${na} à ${nb} : ${n} marche${n > 1 ? 's' : ''} vers le bas (préfixe plus petit). On <strong>multiplie par ${fac}</strong> : la virgule avance de ${3 * n} rangs vers la droite.`;
      else note.innerHTML = `De ${na} à ${nb} : ${n} marche${n > 1 ? 's' : ''} vers le haut (préfixe plus grand). On <strong>divise par ${fac}</strong> : la virgule recule de ${3 * n} rangs vers la gauche.`;
      out.replaceChildren(wk.readout([
        ['Opération', n === 0 ? 'aucune' : (d > 0 ? '× ' : '÷ ') + fac],
        ['Résultat', plain(res) + NB + pb.s + u],
        ['En unité de base', plain(baseVal) + NB + u],
        ['En notation scientifique', sciH(baseVal) + NB + u]
      ]));
    }
    [V.input, A.input, B.input, Un.input].forEach(nd => { nd.addEventListener('input', update); nd.addEventListener('change', update); });
    c.append(el('div', { class: 'controls' }, [V.lab, A.lab, B.lab, Un.lab]), box, big, note, out);
    update();
  };

  /* ---------- Démo : notation scientifique, notation d'ingénieur, préfixe ---------- */
  HQ.widgets['notation-sci'] = function (c) {
    wk.header(c, 'Trois écritures pour un même nombre', 'Tape un nombre (0,00047 ou 25000 ou 6,24e18). La démo l’écrit en notation scientifique, en notation d’ingénieur et avec un préfixe, puis donne les touches de la calculatrice.');
    const input = el('input', { type: 'text', value: '0,00047', inputmode: 'decimal', autocomplete: 'off' });
    const lab = el('label', {}, ['Nombre', input]);
    const Un = wk.selectInput('Unité (facultative)', [['', 'aucune'], ['F', 'F (farad)'], ['A', 'A (ampère)'], ['V', 'V (volt)'], ['Ω', 'Ω (ohm)'], ['W', 'W (watt)'], ['H', 'H (henry)'], ['s', 's (seconde)']], 'F');
    const out = el('div'), note = el('p', { class: 'w-note' });
    const tries = el('div', { class: 'w-row' }, [el('span', { class: 'small' }, 'Essaie :')]);
    [['4700', 'Ω'], ['0,035', 'A'], ['25000', 'V'], ['0,00047', 'F'], ['2200000', 'Ω'], ['6,24e18', '']].forEach(t => {
      tries.appendChild(el('button', { type: 'button', class: 'btn small secondary', onclick: () => { input.value = t[0]; Un.input.value = t[1]; update(); } }, t[0] + (t[1] ? ' ' + t[1] : '')));
    });
    function parse(s) {
      s = String(s).replace(/[\s  ]/g, '').replace(/,/g, '.').replace(/−/g, '-');
      s = s.replace(/[x×*]10\^?\(?(-?\d+)\)?$/i, 'e$1');
      return /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
    }
    const kb = t => '<kbd>' + t + '</kbd>';
    function update() {
      const x = parse(input.value), u = Un.input.value;
      if (!isFinite(x) || x === 0) {
        out.replaceChildren();
        note.textContent = x === 0 ? 'Zéro s’écrit simplement 0.' : 'Entre un nombre, par exemple 0,00047 ou 25000 ou 6,24e18.';
        return;
      }
      const neg = x < 0, ax = Math.abs(x), sg = neg ? '−' : '';
      const q = split(ax), m = q.m, e = q.e;
      const e3 = Math.floor(e / 3) * 3, m3 = Number((m * Math.pow(10, e - e3)).toPrecision(10));
      const pf = PREF.find(p => p.e === e3);
      const keys = (mant, ex) => (neg ? kb('(−)') + ' ' : '') + kb(String(mant)) + ' ' + kb('EE') + ' ' + (ex < 0 ? kb('(−)') + ' ' : '') + kb(Math.abs(ex));
      out.replaceChildren(wk.readout([
        ['Nombre ordinaire', e >= -13 && e <= 14 ? plain(x) + (u ? NB + u : '') : 'trop long à écrire'],
        ['Notation scientifique', sg + HQ.fr(m, 9) + ' × ' + p10h(e) + (u ? NB + u : '')],
        ['Notation d’ingénieur', sg + HQ.fr(m3, 7) + ' × ' + p10h(e3) + (u ? NB + u : '')],
        ['Avec préfixe', pf ? sg + HQ.fr(m3, 7) + (pf.s || u ? NB + pf.s + u : '') : 'pas de préfixe courant pour ' + p10h(e3)],
        ['Touches, notation scientifique', keys(m, e)],
        ['Touches, notation d’ingénieur', keys(m3, e3)]
      ]));
      const mv = e > 0 ? `Pour garder un seul chiffre avant la virgule, on recule la virgule de ${e} rang${e > 1 ? 's' : ''} vers la gauche : l’exposant vaut ${e}.`
        : e < 0 ? `Pour garder un seul chiffre avant la virgule, on avance la virgule de ${-e} rang${e < -1 ? 's' : ''} vers la droite : l’exposant vaut −${-e}.`
          : 'Le nombre est déjà entre 1 et 10 : l’exposant vaut 0.';
      const en = ' En notation d’ingénieur, on prend l’exposant multiple de 3 égal ou juste inférieur : ' + p10h(e3)
        + (pf && pf.s ? ', qui correspond au préfixe ' + pf.s + ' (' + pf.name + ').' : e3 === 0 ? ', donc aucun préfixe.' : ', qui n’a pas de préfixe courant.');
      note.innerHTML = mv + en;
    }
    input.addEventListener('input', update); Un.input.addEventListener('change', update);
    c.append(el('div', { class: 'controls' }, [lab, Un.lab]), tries, out, note);
    update();
  };
})();
