/* Figures et démos de la page « Bases du courant alternatif » */
(function () {
  'use strict';
  const HQ = window.HQ, wk = HQ.wk, el = HQ.el, NB = HQ.NBSP;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const rad = d => d * Math.PI / 180;

  // espace des milliers dès 1 000 (HQ.fr ne la met qu'à partir de 10 000)
  const g4 = s => s.replace(/^(-?\d)(\d{3})(?=,|$)/, '$1' + NB + '$2');
  // valeur lisible avec son unité : 0,6 | 2,4 A | 1 200 VA | 16,7 ms
  function fmt(x, unit, n) {
    n = n || 4;
    const ax = Math.abs(x);
    if (ax === 0) return '0' + NB + unit;
    if (ax >= 0.1 && ax < 100000) return g4(HQ.sig(x, n)) + NB + unit;
    return HQ.eng(x, unit, n);
  }

  // texte SVG avec indices et exposants : rich(S, x, y, 'X_{L} = 40 Ω', { anchor, cls })
  function rich(S, x, y, str, opts) {
    opts = opts || {};
    const t = S.add('text', { x, y, 'text-anchor': opts.anchor || 'middle', class: opts.cls || null });
    const parts = String(str).split(/([_^])\{([^}]*)\}/);
    let back = 0;
    for (let i = 0; i < parts.length; i += 3) {
      if (parts[i] !== '') {
        const ts = document.createElementNS(SVGNS, 'tspan');
        if (back) { ts.setAttribute('dy', back); back = 0; }
        ts.textContent = parts[i]; t.appendChild(ts);
      }
      if (i + 2 < parts.length) {
        const dy = parts[i + 1] === '^' ? -5 : 3.5;
        const ts = document.createElementNS(SVGNS, 'tspan');
        ts.setAttribute('dy', dy + back); ts.setAttribute('style', 'font-size:.76em');
        ts.textContent = parts[i + 2]; t.appendChild(ts); back = -dy;
      }
    }
    return t;
  }
  // trait avec une pointe à chaque bout (cote)
  const span = (S, x1, y1, x2, y2, cls, mk) => S.add('line', { x1, y1, x2, y2, class: cls, 'marker-start': `url(#${mk})`, 'marker-end': `url(#${mk})`, style: 'stroke-width:1.5' });
  // texte posé le long d'une droite inclinée (dy < 0 : au-dessus du trait)
  const along = (S, mx, my, deg, dy, str, cls) => S.g({ transform: `translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${deg.toFixed(2)})` }, () => S.text(0, dy, str, { cls }));

  /* ---------- Figure : de la centrale au client ---------- */
  HQ.figs['chaine-reseau'] = function () {
    const S = HQ.S(780, 200, 'De la centrale au client : alternateur, transformateur élévateur, ligne de transport à haute tension, poste abaisseur, ligne de distribution, transformateur de distribution et client');
    const y = 84;
    const tr = x => { S.circle(x - 7, y, 12, 'sym fill'); S.circle(x + 7, y, 12, 'sym'); };
    const below = (x, a, b) => { S.text(x, y + 46, a, { cls: 'sm b' }); if (b) S.text(x, y + 61, b, { cls: 'sm mut' }); };
    S.wire([[70, y], [136, y]]);
    S.wire([[174, y], [366, y]], 'wire hot thick');
    S.wire([[404, y], [556, y]], 'wire acc thick');
    S.wire([[594, y], [668, y]]);
    S.circle(52, y, 18, 'sym fill'); S.path(`M41,${y} q5.5,-11 11,0 t11,0`);
    tr(155); tr(385); tr(575);
    S.path(`M668,${y + 16} V${y - 8} L692,${y - 28} L716,${y - 8} V${y + 16} Z`, 'body');
    S.rect(686, y - 2, 12, 18, 'sym fill');
    S.text(103, y - 16, 'ex. : 13,8 kV', { cls: 'sm mut' });
    S.text(270, y - 17, 'Transport : jusqu’à 735 kV', { cls: 'b th' });
    S.text(270, y + 23, 'haute tension, courant faible', { cls: 'sm mut' });
    S.text(480, y - 17, 'Distribution : 25 kV', { cls: 'b te' });
    S.text(480, y + 23, 'dans les rues', { cls: 'sm mut' });
    S.text(631, y - 17, '120/240 V', { cls: 'b' });
    below(52, 'Alternateur', '(centrale)'); below(155, 'Transformateur', 'élévateur'); below(385, 'Poste', 'abaisseur');
    below(575, 'Transformateur', 'de distribution'); below(692, 'Client');
    rich(S, 390, 186, 'P = U × I : tension élevée, courant faible, donc peu de pertes dans la ligne (R × I^{2})', { cls: 'sm mut' });
    return S;
  };

  /* ---------- Figure : la sinusoïde annotée ---------- */
  HQ.figs['sinusoide-annotee'] = function () {
    const S = HQ.S(700, 312, 'Sinusoïde d’une tension de 120 volts efficaces à 60 hertz : crête de 170 volts, 339 volts crête à crête, période de 16,67 millisecondes');
    const p = S.plot({ x: 92, y: 42, w: 430, h: 232, xr: [0, 1.5], yr: [-1.3, 1.5], xlabel: 'temps', ylabel: 'tension' });
    const sx = p.sx, sy = p.sy, bot = 42 + 232;
    S.line(sx(0), sy(1), 596, sy(1), 'dash'); S.line(sx(0), sy(-1), 596, sy(-1), 'dash');
    S.add('line', { x1: sx(0), y1: sy(0.707), x2: sx(1.5), y2: sy(0.707), class: 'c3', style: 'stroke-width:1.5;stroke-dasharray:7 4' });
    p.curve(v => Math.sin(2 * Math.PI * v), 'c1');
    p.ytick(1, '+170 V'); p.ytick(0.707, '+120 V'); p.ytick(0, '0'); p.ytick(-1, '−170 V');
    [[0, '0'], [0.5, '8,33 ms'], [1, '16,67 ms'], [1.5, '25 ms']].forEach(t => { if (t[0]) p.xtick(t[0]); S.text(sx(t[0]), bot + 17, t[1], { cls: 'sm mut' }); });
    // valeur de crête
    S.arrow(sx(0.25), sy(0) - 1, sx(0.25), sy(1) + 2, 'c2', 'ahb');
    S.text(sx(0.25) + 7, sy(0.42), 'crête', { anchor: 'start', cls: 'sm b th' });
    S.text(sx(0.25) + 7, sy(0.42) + 14, '170 V', { anchor: 'start', cls: 'sm b th' });
    // période, entre deux sommets
    S.line(sx(0.25), sy(1.03), sx(0.25), sy(1.3), 'dash'); S.line(sx(1.25), sy(1.03), sx(1.25), sy(1.3), 'dash');
    span(S, sx(0.25), sy(1.22), sx(1.25), sy(1.22), 'c4', 'ahw');
    S.text(sx(0.75), sy(1.22) - 7, 'période T = 16,67 ms (un cycle)', { cls: 'sm b tw' });
    // valeur efficace
    S.text(sx(0.75), sy(0.707) - 7, 'efficace : 0,707 × 170 = 120 V', { cls: 'sm b td' });
    // alternances
    S.text(sx(0.75), sy(-0.42), 'alternance', { cls: 'sm mut' }); S.text(sx(0.75), sy(-0.42) + 14, 'négative', { cls: 'sm mut' });
    S.text(sx(1.25), sy(0.5), 'alternance', { cls: 'sm mut' }); S.text(sx(1.25), sy(0.5) + 14, 'positive', { cls: 'sm mut' });
    // crête à crête
    span(S, 588, sy(1), 588, sy(-1), 'ln', 'ah');
    S.text(598, sy(0.22), 'crête à crête', { anchor: 'start', cls: 'sm b' });
    S.text(598, sy(0.22) + 15, '2 × 169,7 = 339 V', { anchor: 'start', cls: 'sm' });
    return S;
  };

  /* ---------- Figure : charges résistive, inductive et capacitive ---------- */
  HQ.figs['trois-charges'] = function () {
    const S = HQ.S(780, 262, 'Trois graphiques de la tension et du courant : en phase pour une charge résistive, courant en retard de 90 degrés pour une bobine, courant en avance de 90 degrés pour un condensateur');
    const defs = [
      { t: 'Charge résistive (R)', sub: 'plinthe, chauffe-eau, incandescence', ph: 0, cap: 'Courant en phase : φ = 0°', l2: 'les maximums arrivent en même temps', ip: 0.25 },
      { t: 'Charge inductive (L)', sub: 'moteur, transformateur, bobine', ph: -90, cap: 'Courant en RETARD de 90°', l2: 'le maximum de i arrive après celui de u', ip: 0.5 },
      { t: 'Charge capacitive (C)', sub: 'condensateur', ph: 90, cap: 'Courant en AVANCE de 90°', l2: 'le maximum de i arrive avant celui de u', ip: 1 }
    ];
    defs.forEach((d, k) => {
      const x = 34 + k * 258, cx = x + 100;
      S.text(cx, 18, d.t, { cls: 'b' });
      S.text(cx, 34, d.sub, { cls: 'sm mut' });
      const p = S.plot({ x, y: 64, w: 200, h: 130, xr: [0, 1.25], yr: [-1.25, 1.25] });
      p.curve(v => Math.sin(2 * Math.PI * v), 'c1');
      p.curve(v => 0.65 * Math.sin(2 * Math.PI * v + rad(d.ph)), 'c2');
      S.text(p.sx(0.105), p.sy(0.97), 'u', { cls: 'b te' });
      if (d.ph === 0) S.text(p.sx(0.25), p.sy(0.3), 'i', { cls: 'b th' });
      else {
        S.text(p.sx(d.ip) + (d.ph > 0 ? -9 : 9), p.sy(0.72), 'i', { cls: 'b th' });
        // du sommet de u vers le sommet de i
        const xu = d.ph < 0 ? 0.25 : 1.25, ya = p.sy(1.14);
        S.line(p.sx(xu), p.sy(1.02), p.sx(xu), ya - 4, 'dash'); S.line(p.sx(d.ip), p.sy(0.67), p.sx(d.ip), ya - 4, 'dash');
        S.arrow(p.sx(xu), ya, p.sx(d.ip), ya, 'ln');
        S.text((p.sx(xu) + p.sx(d.ip)) / 2, ya - 6, '90°', { cls: 'sm b' });
      }
      S.text(cx, 222, d.cap, { cls: 'b' });
      S.text(cx, 239, d.l2, { cls: 'sm mut' });
    });
    S.line(310, 256, 334, 256, 'c1'); S.text(340, 260, 'tension u', { anchor: 'start', cls: 'sm te' });
    S.line(420, 256, 444, 256, 'c2'); S.text(450, 260, 'courant i', { anchor: 'start', cls: 'sm th' });
    return S;
  };

  /* ---------- Figure : triangle d'impédance ---------- */
  HQ.figs['triangle-impedance'] = function () {
    const S = HQ.S(580, 262, 'Triangle d’impédance : R égale 30 ohms à l’horizontale, X L égale 40 ohms à la verticale, Z égale 50 ohms sur l’hypoténuse, angle phi de 53,1 degrés');
    const A = [70, 226], B = [220, 226], C = [220, 26];      // 5 px par ohm
    S.path(`M${A} L${B} L${C} Z`, 'panel');
    S.path(`M${B[0] - 13},${B[1]} v-13 h13`, 'ln');
    const a = Math.atan2(200, 150), r = 40;
    S.path(`M${A[0] + r},${A[1]} A${r},${r} 0 0 0 ${(A[0] + r * Math.cos(a)).toFixed(1)},${(A[1] - r * Math.sin(a)).toFixed(1)}`, 'c4');
    S.line(A[0], A[1], B[0], B[1], 'c1'); S.line(B[0], B[1], C[0], C[1], 'c2'); S.line(A[0], A[1], C[0], C[1], 'c3');
    S.text(A[0] + 48, A[1] - 13, 'φ = 53,1°', { anchor: 'start', cls: 'sm b tw' });
    S.text(145, 246, 'R = 30 Ω', { cls: 'b te' });
    rich(S, 232, 130, 'X_{L} = 40 Ω', { anchor: 'start', cls: 'b th' });
    along(S, 145, 126, -53.13, -9, 'Z = 50 Ω', 'b td');
    S.line(332, 30, 332, 232, 'dash');
    [['Z = √(30^{2} + 40^{2}) = 50 Ω', 'b td'], ['I = U ÷ Z = 120 ÷ 50 = 2,4 A', ''], ['cos φ = R ÷ Z = 30 ÷ 50 = 0,6', ''], ['φ = 53,1° (courant en retard)', 'tw b']].forEach((r2, i) => {
      rich(S, 350, 78 + i * 34, r2[0], { anchor: 'start', cls: r2[1] || null });
    });
    return S;
  };

  /* ---------- Figure : triangle des puissances ---------- */
  HQ.figs['triangle-puissances'] = function () {
    const S = HQ.S(620, 252, 'Triangle des puissances : P égale 960 watts à l’horizontale, Q égale 720 vars à la verticale, S égale 1200 voltampères sur l’hypoténuse, angle phi de 36,9 degrés');
    const A = [56, 212], B = [296, 212], C = [296, 32];      // 0,25 px par unité
    S.path(`M${A} L${B} L${C} Z`, 'panel');
    S.path(`M${B[0] - 13},${B[1]} v-13 h13`, 'ln');
    const a = Math.atan2(180, 240), r = 50;
    S.path(`M${A[0] + r},${A[1]} A${r},${r} 0 0 0 ${(A[0] + r * Math.cos(a)).toFixed(1)},${(A[1] - r * Math.sin(a)).toFixed(1)}`, 'c4');
    S.line(A[0], A[1], B[0], B[1], 'c1'); S.line(B[0], B[1], C[0], C[1], 'c2'); S.line(A[0], A[1], C[0], C[1], 'c3');
    S.text(A[0] + 58, A[1] - 10, 'φ = 36,9°', { anchor: 'start', cls: 'sm b tw' });
    S.text(176, 232, 'P = 960 W (active)', { cls: 'b te' });
    S.text(308, 118, 'Q = 720 var', { anchor: 'start', cls: 'b th' });
    S.text(308, 134, '(réactive)', { anchor: 'start', cls: 'sm th' });
    along(S, 176, 122, -36.87, -9, 'S = 1' + NB + '200 VA (apparente)', 'b td');
    S.line(410, 30, 410, 222, 'dash');
    [['S = 120 × 10 = 1' + NB + '200 VA', 'b td'], ['P = 1' + NB + '200 × 0,8 = 960 W', 'b te'], ['Q = 1' + NB + '200 × 0,6 = 720 var', 'b th'], ['FP = P ÷ S = 0,8', 'b']].forEach((r2, i) => {
      S.text(426, 74 + i * 34, r2[0], { anchor: 'start', cls: r2[1] });
    });
    return S;
  };

  /* ---------- Figure : correction du facteur de puissance ---------- */
  HQ.figs['correction-fp'] = function () {
    const S = HQ.S(680, 232, 'Deux triangles des puissances : sans condensateur, 960 watts, 720 vars et 1200 voltampères ; avec un condensateur de 400 vars, 960 watts, 320 vars et 1012 voltampères');
    const k = 0.2, by = 196;
    // sans condensateur
    S.text(136, 18, 'Sans condensateur', { cls: 'b' });
    S.text(136, 35, 'FP = 0,80 | I = 10 A', { cls: 'sm mut' });
    let ax = 40, bx = ax + 960 * k, cy = by - 720 * k;
    S.path(`M${ax},${by} L${bx},${by} L${bx},${cy} Z`, 'panel');
    S.line(ax, by, bx, by, 'c1'); S.line(bx, by, bx, cy, 'c2'); S.line(ax, by, bx, cy, 'c3');
    S.text((ax + bx) / 2, by + 18, 'P = 960 W', { cls: 'sm b te' });
    S.text(bx + 8, (by + cy) / 2 + 4, 'Q = 720 var', { anchor: 'start', cls: 'sm b th' });
    along(S, (ax + bx) / 2, (by + cy) / 2, -36.87, -8, 'S = 1' + NB + '200 VA', 'sm b td');
    S.line(326, 12, 326, 222, 'dash');
    // avec condensateur de 400 var
    S.text(480, 18, 'Avec un condensateur de 400 var', { cls: 'b' });
    S.text(480, 35, 'FP = 0,95 | I = 8,4 A', { cls: 'sm mut' });
    ax = 350; bx = ax + 960 * k; cy = by - 320 * k;
    const cy0 = by - 720 * k;
    S.path(`M${ax},${by} L${bx},${by} L${bx},${cy} Z`, 'panel');
    S.line(ax, by, bx, cy0, 'dash'); S.line(bx, cy, bx, cy0, 'dash');
    S.line(ax, by, bx, by, 'c1'); S.line(bx, by, bx, cy, 'c2'); S.line(ax, by, bx, cy, 'c3');
    S.text((ax + bx) / 2, by + 18, 'P = 960 W (inchangée)', { cls: 'sm b te' });
    S.text(bx + 8, (by + cy) / 2 + 4, 'Q = 320 var', { anchor: 'start', cls: 'sm b th' });
    S.text(bx + 8, (cy + cy0) / 2 - 3, '400 var fournis', { anchor: 'start', cls: 'sm mut' });
    S.text(bx + 8, (cy + cy0) / 2 + 11, 'par le condensateur', { anchor: 'start', cls: 'sm mut' });
    along(S, (ax + bx) / 2, (by + cy) / 2, -18.43, 15, 'S = 1' + NB + '012 VA', 'sm b td');
    return S;
  };

  /* ---------- Démo : explorateur de sinusoïde ---------- */
  HQ.widgets['sinus-explorateur'] = function (c) {
    wk.header(c, 'Explorateur de sinusoïde', 'Règle la tension et la fréquence. Le graphique montre toujours 50 ms de signal : compte les cycles. Le bouton « Animer le point » fait défiler la valeur instantanée au ralenti (environ 200 fois plus lentement que la réalité).');
    let mode = 'eff';
    let dot = null, tsig = 1000 / 60 / 8;      // point mobile et son instant, en ms (au départ : 45°, où u = valeur efficace)
    function place() {
      if (!dot) return;
      const uv = dot.um * Math.sin(dot.w * tsig), X = dot.sx(tsig).toFixed(1), Y = dot.sy(uv).toFixed(1);
      dot.c.setAttribute('cx', X); dot.c.setAttribute('cy', Y);
      dot.l.setAttribute('x1', X); dot.l.setAttribute('x2', X); dot.l.setAttribute('y1', dot.sy(0)); dot.l.setAttribute('y2', Y);
      dot.t.textContent = 'à t = ' + HQ.fr(tsig, 1) + ' ms : u = ' + HQ.fr(uv, 0).replace('-', '−') + ' V';
    }
    const U = wk.rangeInput('Valeur efficace', 120, 10, 600, 1, v => v + ' V');
    const F = wk.rangeInput('Fréquence f', 60, 25, 100, 1, v => v + ' Hz');
    const box = el('div', { class: 'svg-wrap' }), out = el('div'), note = el('p', { class: 'w-note' });
    const NICE = [20, 30, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000];
    function update() {
      const v = U.value, f = F.value;
      const um = mode === 'eff' ? v * Math.SQRT2 : v, ue = um / Math.SQRT2, T = 1000 / f;
      const N = NICE.find(q => q >= um) || um;
      const S = HQ.S(690, 296, 'Sinusoïde de ' + fmt(ue, 'V', 3) + ' efficaces à ' + f + ' hertz, tracée sur 50 millisecondes');
      S.node.style.minWidth = '500px';
      const p = S.plot({ x: 72, y: 30, w: 480, h: 230, xr: [0, 50], yr: [-1.3 * N, 1.3 * N], gridx: 5, xlabel: 'ms' });
      const sx = p.sx, sy = p.sy, w = 2 * Math.PI / T;
      S.line(sx(0), sy(um), sx(50) + 8, sy(um), 'dash');
      S.add('line', { x1: sx(0), y1: sy(ue), x2: sx(50) + 8, y2: sy(ue), class: 'c3', style: 'stroke-width:1.5;stroke-dasharray:7 4' });
      p.curve(t => um * Math.sin(w * t), 'c1', 400);
      p.ytick(N, HQ.fr(N, 0) + ' V'); p.ytick(0, '0'); p.ytick(-N, '−' + HQ.fr(N, 0) + ' V');
      [10, 20, 30, 40, 50].forEach(t => { p.xtick(t); S.text(sx(t), 30 + 230 + 16, String(t), { cls: 'sm mut' }); });
      S.text(sx(50) + 12, sy(um) - 3, 'crête : ' + fmt(um, 'V', 3), { anchor: 'start', cls: 'sm b' });
      S.text(sx(50) + 12, sy(ue) + 13, 'efficace : ' + fmt(ue, 'V', 3), { anchor: 'start', cls: 'sm b td' });
      const yT = sy(um + 0.12 * N);
      S.line(sx(T / 4), sy(um) - 2, sx(T / 4), yT - 5, 'dash'); S.line(sx(5 * T / 4), sy(um) - 2, sx(5 * T / 4), yT - 5, 'dash');
      span(S, sx(T / 4), yT, sx(5 * T / 4), yT, 'c4', 'ahw');
      S.text((sx(T / 4) + sx(5 * T / 4)) / 2, yT - 6, 'T = ' + HQ.fr(T, 2) + ' ms', { cls: 'sm b tw' });
      dot = { um, w, sx, sy, l: S.line(0, 0, 0, 0, 'c2'), c: S.circle(0, 0, 5, 'f2'), t: S.text(sx(0) + 8, 30 + 230 - 7, '', { anchor: 'start', cls: 'sm b th' }) };
      place();
      box.replaceChildren(S.node);
      out.replaceChildren(wk.readout([
        ['Valeur efficace = 0,707 × crête', fmt(ue, 'V')],
        ['Valeur de crête = 1,414 × efficace', fmt(um, 'V')],
        ['Crête à crête = 2 × crête', fmt(2 * um, 'V')],
        ['Moyenne d’une alternance = 0,637 × crête', fmt(2 / Math.PI * um, 'V')],
        ['Période T = 1 ÷ f', HQ.fr(T, 2) + NB + 'ms'],
        ['Pulsation ω = 2πf', HQ.fr(2 * Math.PI * f, 0) + NB + 'rad/s']
      ]));
      note.innerHTML = 'En 50 ms, on voit <strong>' + HQ.fr(50 / T, 2) + ' cycles</strong>. À ' + f + ' Hz, la tension change de sens ' + (2 * f) + ' fois par seconde.';
    }
    const relabel = () => { U.lab.querySelector('span').firstChild.nodeValue = (mode === 'eff' ? 'Valeur efficace' : 'Valeur de crête') + ' : '; };
    const setSeg = (sg, idx) => sg.node.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === idx));
    const segMode = wk.seg([['eff', 'Je règle la valeur efficace'], ['max', 'Je règle la valeur de crête']], 'eff', v => { mode = v; relabel(); update(); });
    function preset(u, f) {
      mode = 'eff'; setSeg(segMode, 0); relabel();
      U.input.value = u; U.val.textContent = u + ' V'; F.input.value = f; F.val.textContent = f + ' Hz';
      update();
    }
    const presets = el('div', { class: 'w-row' }, [
      el('span', { class: 'small' }, 'Essaie :'),
      el('button', { type: 'button', class: 'btn small secondary', onclick: () => preset(120, 60) }, 'Prise : 120 V, 60 Hz'),
      el('button', { type: 'button', class: 'btn small secondary', onclick: () => preset(240, 60) }, 'Cuisinière : 240 V, 60 Hz'),
      el('button', { type: 'button', class: 'btn small secondary', onclick: () => preset(230, 50) }, 'Europe : 230 V, 50 Hz')
    ]);
    const an = wk.anim(t => { tsig = (t * 5) % 50; place(); });
    const play = el('button', { type: 'button', class: 'btn small' }, 'Animer le point');
    play.addEventListener('click', () => { an.toggle(); play.textContent = an.running ? 'Arrêter le point' : 'Animer le point'; });
    presets.appendChild(play);
    U.input.addEventListener('input', update); F.input.addEventListener('input', update);
    c.append(el('div', { class: 'w-row' }, [segMode.node]), el('div', { class: 'controls' }, [U.lab, F.lab]), presets, box, out, note);
    update();
  };

  /* ---------- Démo : déphasage et puissances ---------- */
  HQ.widgets['dephasage-puissances'] = function (c) {
    wk.header(c, 'Déphasage et puissances', 'Règle la tension, le courant et l’angle φ entre les deux. Angle positif : charge inductive. Angle négatif : charge capacitive.');
    const U = wk.rangeInput('Tension U (efficace)', 120, 10, 600, 10, v => v + ' V');
    const I = wk.rangeInput('Courant I (efficace)', 10, 0.5, 50, 0.5, v => HQ.fr(v, 1) + ' A');
    const PH = wk.rangeInput('Angle φ', 37, -90, 90, 1, v => String(v).replace('-', '−') + '°');
    let phi = Math.acos(0.8) * 180 / Math.PI;      // 36,87° : l'exemple de la page (FP = 0,8)
    const boxA = el('div', { class: 'svg-wrap' }), boxB = el('div', { class: 'svg-wrap' }), out = el('div'), note = el('p', { class: 'w-note' });
    function update() {
      const u = U.value, i = I.value, pos = phi >= 0, aphi = Math.abs(phi);
      let cs = Math.cos(rad(phi)), sn = Math.sin(rad(aphi));
      if (Math.abs(cs) < 1e-9) cs = 0;
      if (Math.abs(sn) < 1e-9) sn = 0;
      const Sva = u * i, P = Sva * cs, Q = Sva * sn;
      // courbes u et i
      const A = HQ.S(400, 258, 'Courbes de la tension et du courant, décalées de ' + HQ.fr(aphi, 1) + ' degrés');
      A.line(34, 13, 54, 13, 'c1'); A.text(59, 17, 'tension u', { anchor: 'start', cls: 'sm b te' });
      A.line(134, 13, 154, 13, 'c2'); A.text(159, 17, 'courant i', { anchor: 'start', cls: 'sm b th' });
      const p = A.plot({ x: 34, y: 34, w: 330, h: 190, xr: [0, 540], yr: [-1.45, 1.25] });
      const xu = p.sx(360), xi = p.sx(360 + phi), ym = p.sy(-1.15);
      A.line(xu, p.sy(0), xu, ym + 4, 'dash');
      if (aphi >= 1) A.line(xi, p.sy(0), xi, ym + 4, 'dash');
      p.curve(d => Math.sin(rad(d)), 'c1'); p.curve(d => 0.7 * Math.sin(rad(d - phi)), 'c2');
      [[0, '0°'], [180, '180°'], [360, '360°'], [540, '540°']].forEach(t => { if (t[0]) p.xtick(t[0]); A.text(p.sx(t[0]), 34 + 190 + 16, t[1], { cls: 'sm mut' }); });
      if (Math.abs(xi - xu) > 12) A.add('line', { x1: xu, y1: ym, x2: xi, y2: ym, class: 'c4', 'marker-end': 'url(#ahw)', style: 'stroke-width:1.6' });
      else if (aphi >= 1) A.line(xu, ym, xi, ym, 'c4');
      A.text((xu + xi) / 2, ym + 16, 'φ = ' + HQ.fr(aphi, 1) + '°', { cls: 'sm b tw' });
      boxA.replaceChildren(A.node);
      // triangle des puissances, à l'échelle
      const B = HQ.S(340, 258, 'Triangle des puissances : P à l’horizontale, Q à la verticale, S sur l’hypoténuse');
      const L = 166, ax = 58, ay = pos ? 212 : 50, bx = ax + L * cs, cy = pos ? ay - L * sn : ay + L * sn;
      B.text(8, pos ? 16 : 250, 'Triangle des puissances', { anchor: 'start', cls: 'sm mut' });
      B.path(`M${ax},${ay} L${bx.toFixed(1)},${ay} L${bx.toFixed(1)},${cy.toFixed(1)} Z`, 'panel');
      if (aphi >= 12) {
        const r = 34, h = rad(aphi / 2);
        B.path(`M${ax + r},${ay} A${r},${r} 0 0 ${pos ? 0 : 1} ${(ax + r * cs).toFixed(1)},${(pos ? ay - r * sn : ay + r * sn).toFixed(1)}`, 'c4');
        B.text(ax + 47 * Math.cos(h), (pos ? ay - 47 * Math.sin(h) : ay + 47 * Math.sin(h)) + 4, 'φ', { cls: 'sm b tw' });
      }
      B.line(ax, ay, bx, ay, 'c1'); B.line(bx, ay, bx, cy, 'c2'); B.line(ax, ay, bx, cy, 'c3');
      B.text((ax + bx) / 2, pos ? ay + 18 : ay - 9, 'P = ' + fmt(P, 'W', 3), { cls: 'sm b te' });
      B.text(bx + 9, (ay + cy) / 2 + 4, 'Q = ' + fmt(Q, 'var', 3), { anchor: 'start', cls: 'sm b th' });
      along(B, (ax + bx) / 2, (ay + cy) / 2, -phi, pos ? -7 : 16, 'S = ' + fmt(Sva, 'VA', 3), 'sm b td');
      boxB.replaceChildren(B.node);
      out.replaceChildren(wk.readout([
        ['Puissance apparente S = U × I', fmt(Sva, 'VA')],
        ['Puissance active P = S × cos φ', fmt(P, 'W')],
        ['Puissance réactive Q = S × sin φ', fmt(Q, 'var') + (Q === 0 ? '' : pos ? ' (inductive)' : ' (capacitive)')],
        ['Facteur de puissance FP = cos φ', HQ.fr(cs, 3) + (aphi < 0.5 ? '' : pos ? ' en retard' : ' en avance')]
      ]));
      let txt;
      if (aphi < 0.5) txt = '<strong>Courant en phase</strong> avec la tension : charge résistive. Toute la puissance apparente est active (FP = 1).';
      else if (pos) txt = '<strong>Courant en retard</strong> de ' + HQ.fr(aphi, 1) + '° sur la tension : charge inductive (moteur, transformateur, bobine).';
      else txt = '<strong>Courant en avance</strong> de ' + HQ.fr(aphi, 1) + '° sur la tension : charge capacitive (condensateurs).';
      if (cs === 0) txt += ' Aucune puissance active : le courant circule, mais aucun travail n’est fait.';
      else if (aphi >= 0.5) txt += ' Avec un FP de 1, la même puissance active ne demanderait que ' + fmt(P / u, 'A', 3) + ' au lieu de ' + fmt(i, 'A', 3) + '.';
      note.innerHTML = txt;
    }
    function setPhi(v) { phi = v; PH.input.value = Math.round(v); PH.val.textContent = HQ.fr(v, 1).replace('-', '−') + '°'; update(); }
    const presets = el('div', { class: 'w-row' }, [
      el('span', { class: 'small' }, 'Essaie :'),
      el('button', { type: 'button', class: 'btn small secondary', onclick: () => setPhi(0) }, 'Chauffage : φ = 0°'),
      el('button', { type: 'button', class: 'btn small secondary', onclick: () => setPhi(Math.acos(0.8) * 180 / Math.PI) }, 'Moteur : FP = 0,8 en retard'),
      el('button', { type: 'button', class: 'btn small secondary', onclick: () => setPhi(90) }, 'Bobine parfaite : 90°'),
      el('button', { type: 'button', class: 'btn small secondary', onclick: () => setPhi(-90) }, 'Condensateur parfait : −90°')
    ]);
    U.input.addEventListener('input', update); I.input.addEventListener('input', update);
    PH.input.addEventListener('input', () => { phi = PH.value; update(); });
    c.append(el('div', { class: 'controls' }, [U.lab, I.lab, PH.lab]), presets, el('div', { class: 'grid-2' }, [boxA, boxB]), out, note);
    PH.val.textContent = HQ.fr(phi, 1) + '°';
    update();
  };
})();
