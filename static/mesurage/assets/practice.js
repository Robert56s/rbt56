/* Exercices générés (page Exercices) et tests pratiques chronométrés (page Tests).
   - <div id="drills"></div>   : une grille de types d'exercices par sujet, questions à valeurs aléatoires, corrigé immédiat.
   - <div id="test-app"></div> : tests de 40 questions en 45 minutes, résultat par sujet, révision des réponses. */
(function () {
  'use strict';
  const HQ = window.HQ, el = HQ.el, store = HQ.store;
  const LETTERS = 'abcd';
  const newSeed = () => (Math.floor(Math.random() * 4294967295) + 1) >>> 0;
  const gensOf = t => Object.values(HQ.gens || {}).filter(g => g.t === t);

  function figNode(item) {
    if (!item.fig) return null;
    try { return el('div', { class: 'd-fig' }, [item.fig().node]); } catch (e) { console.error(e); return null; }
  }

  /* ===================== Exercices générés ===================== */
  function initDrills() {
    const root = document.getElementById('drills');
    if (!root || !HQ.gens) return;
    const stats = store.get('drill', {});
    const statText = id => { const s = stats[id]; return s && s.n ? `${s.ok} / ${s.n} réussis` : 'pas encore essayé'; };

    HQ.topics.forEach(tp => {
      const gens = gensOf(tp.id);
      if (!gens.length) return;
      const sec = el('section', { class: 'drill-topic' });
      sec.appendChild(el('h3', { id: 'ex-' + tp.id }, tp.name));
      const grid = el('div', { class: 'skills' });
      const panel = el('div');
      const buttons = {};
      const mix = { id: 'mix-' + tp.id, t: tp.id, name: 'Mélange du sujet', make: r => r.pick(gens).make(r), mix: true };
      (gens.length > 1 ? gens.concat([mix]) : gens).forEach(g => {
        const stat = el('span', { class: 's-stat' }, g.mix ? 'tous les types ci-contre' : statText(g.id));
        const b = el('button', { class: 'skill', type: 'button' }, [el('span', { class: 's-name' }, g.name), stat]);
        b.addEventListener('click', () => {
          grid.querySelectorAll('.skill').forEach(x => x.classList.remove('on')); b.classList.add('on');
          openDrill(g, panel, () => { if (!g.mix) stat.textContent = statText(g.id); });
        });
        buttons[g.id] = b; grid.appendChild(b);
      });
      sec.append(grid, panel);
      root.appendChild(sec);
    });

    function openDrill(g, panel, onStat) {
      const rnd = HQ.rng(newSeed());
      let n = 0, ok = 0;
      const box = el('div', { class: 'drill' });
      panel.replaceChildren(box);
      function next() {
        const item = g.make(rnd);
        let answered = false;
        const score = el('span', { class: 'pill' }, n ? `Série en cours : ${ok} / ${n}` : 'Nouvelle série');
        const head = el('div', { class: 'd-head' }, [el('h3', {}, g.name), score]);
        const q = el('p', { class: 'd-q', html: item.q });
        const list = el('ul', { class: 'choices' });
        const sol = el('div');
        const nav = el('div', { class: 'w-row' });
        item.c.forEach((txt, i) => {
          const b = el('button', { type: 'button', class: 'choice-btn', html: `<span class="letter">${LETTERS[i]})</span><span class="txt">${txt}</span>` });
          b.addEventListener('click', () => {
            if (answered) return; answered = true;
            const good = i === item.a;
            n++; if (good) ok++;
            if (!g.mix) { const s = stats[g.id] = stats[g.id] || { n: 0, ok: 0 }; s.n++; if (good) s.ok++; store.set('drill', stats); onStat(); }
            list.querySelectorAll('.choice-btn').forEach((x, k) => { x.disabled = true; if (k === item.a) x.classList.add('correct'); });
            if (!good) b.classList.add('wrong');
            score.textContent = `Série en cours : ${ok} / ${n}`;
            sol.replaceChildren(el('div', { class: 'sol-box' + (good ? '' : ' wrong') }, [
              el('div', { class: 'verdict ' + (good ? 'ok' : 'no') }, good ? 'Bonne réponse' : 'Ce n’est pas ça'),
              el('p', { html: item.e })
            ]));
            const nb = el('button', { class: 'btn', type: 'button' }, 'Question suivante');
            nb.addEventListener('click', next);
            nav.replaceChildren(nb);
            nb.focus({ preventScroll: true });
          });
          list.appendChild(el('li', {}, [b]));
        });
        const skip = el('button', { class: 'btn secondary small', type: 'button' }, 'Passer');
        skip.addEventListener('click', next);
        nav.replaceChildren(skip);
        box.replaceChildren(head, q);
        const f = figNode(item); if (f) box.appendChild(f);
        box.append(list, sol, nav);
      }
      next();
      box.scrollIntoView({ behavior: HQ.reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
    }
  }

  /* ===================== Tests pratiques ===================== */
  // répartition d'un test de 40 questions (proportions gardées pour les autres longueurs)
  const QUOTA = { unites: 2, base: 4, calculs: 6, alternatif: 5, electrotechnique: 4, transformateurs: 4, triphase: 5, mesure: 4, securite: 4, schemas: 2 };
  // part des questions chiffrées (générées) dans chaque sujet
  const GENFRAC = { unites: 0.5, base: 0.5, calculs: 0.67, alternatif: 0.6, electrotechnique: 0.25, transformateurs: 0.5, triphase: 0.6, mesure: 0.5, securite: 0.25, schemas: 0.5 };

  function quotas(n) {
    const ids = Object.keys(QUOTA), raw = ids.map(id => QUOTA[id] * n / 40), out = {};
    let used = 0;
    ids.forEach((id, i) => { out[id] = Math.floor(raw[i]); used += out[id]; });
    ids.map((id, i) => [raw[i] - Math.floor(raw[i]), id]).sort((a, b) => b[0] - a[0]).slice(0, n - used).forEach(p => { out[p[1]]++; });
    return out;
  }
  function weighted(r, pool) {
    const total = pool.reduce((s, g) => s + (g.w || 1), 0);
    let x = r() * total;
    for (const g of pool) { x -= (g.w || 1); if (x <= 0) return g; }
    return pool[pool.length - 1];
  }
  function fromBank(r, b) {
    const order = r.shuffle([0, 1, 2, 3]);
    return { t: b.t, q: b.q, c: order.map(i => b.c[i]), a: order.indexOf(b.a), e: b.e, fig: b.fig };
  }
  function pickTopic(r, t, k) {
    const out = [];
    const gens = gensOf(t).filter(g => g.test !== false);
    const bankItems = r.shuffle((HQ.bank || []).filter(q => q.t === t));
    let ng = gens.length ? Math.min(k, Math.round(k * GENFRAC[t])) : 0;
    const nb = Math.min(k - ng, bankItems.length);
    ng = gens.length ? k - nb : 0;
    bankItems.slice(0, nb).forEach(b => out.push(fromBank(r, b)));
    let pool = [];
    for (let i = 0; i < ng; i++) {
      if (!pool.length) pool = gens.slice();
      const g = weighted(r, pool); pool.splice(pool.indexOf(g), 1);
      const it = g.make(r);
      out.push({ t, q: it.q, c: it.c, a: it.a, e: it.e, fig: it.fig });
    }
    return out;
  }
  function buildTest(seed, n, topic) {
    const r = HQ.rng(seed);
    let qs = [];
    if (topic) qs = pickTopic(r, topic, n);
    else { const qt = quotas(n); HQ.topics.forEach(tp => { qs = qs.concat(pickTopic(r, tp.id, qt[tp.id] || 0)); }); }
    return r.shuffle(qs);
  }
  HQ.buildTest = buildTest;

  const fmtTime = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const PRESETS = [
    { id: 'A', name: 'Test A', seed: 16112026 }, { id: 'B', name: 'Test B', seed: 20261116 }, { id: 'C', name: 'Test C', seed: 45504550 }
  ];

  function initTests() {
    const app = document.getElementById('test-app');
    if (!app || !HQ.gens || !HQ.bank) return;
    let ticker = null, keyHandler = null;
    const stop = () => { if (ticker) { clearInterval(ticker); ticker = null; } if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; } };

    /* ----- écran de départ ----- */
    function setup() {
      stop();
      const lenSel = el('select', { id: 'test-len' });
      [[20, '20 questions | 23 minutes'], [30, '30 questions | 34 minutes'], [40, '40 questions | 45 minutes (format conseillé)'], [50, '50 questions | 45 minutes (plus serré)']].forEach(o => lenSel.appendChild(el('option', { value: o[0] }, o[1])));
      lenSel.value = String(store.get('testLen', 40));
      lenSel.addEventListener('change', () => store.set('testLen', parseInt(lenSel.value, 10)));
      const noTimer = el('input', { type: 'checkbox', id: 'test-notimer' });
      const opts = el('div', { class: 'controls' }, [
        el('label', { for: 'test-len' }, ['Longueur du test', lenSel]),
        el('label', { for: 'test-notimer', style: 'flex-direction:row;align-items:center;gap:.5em' }, [noTimer, 'Sans limite de temps (pour apprendre)'])
      ]);
      const launch = (name, seed, topic) => {
        const n = topic ? 15 : parseInt(lenSel.value, 10);
        const secs = topic ? 15 * 60 : (n === 50 ? 45 * 60 : Math.round(n * 45 * 60 / 40));
        run({ name, seed, n, topic: topic || null, secs, timed: !noTimer.checked });
      };
      const cards = el('div', { class: 'test-setup' });
      PRESETS.forEach(p => {
        const b = el('button', { class: 'btn', type: 'button' }, 'Commencer le ' + p.name.charAt(0).toLowerCase() + p.name.slice(1));
        b.addEventListener('click', () => launch(p.name, p.seed));
        cards.appendChild(el('div', { class: 'test-card' }, [el('h3', {}, p.name), el('p', {}, 'Toujours les mêmes questions : pratique pour le refaire et mesurer tes progrès.'), b]));
      });
      const bs = el('button', { class: 'btn', type: 'button' }, 'Commencer un test surprise');
      bs.addEventListener('click', () => launch('Test surprise', newSeed()));
      cards.appendChild(el('div', { class: 'test-card' }, [el('h3', {}, 'Test surprise'), el('p', {}, 'Un nouveau tirage à chaque fois, avec de nouvelles valeurs dans les calculs.'), bs]));
      const topicSel = el('select', { id: 'test-topic' });
      HQ.topics.forEach(tp => topicSel.appendChild(el('option', { value: tp.id }, tp.name)));
      const bt = el('button', { class: 'btn secondary', type: 'button' }, 'Commencer le mini-test');
      bt.addEventListener('click', () => launch('Mini-test : ' + HQ.topicName(topicSel.value), newSeed(), topicSel.value));
      cards.appendChild(el('div', { class: 'test-card' }, [el('h3', {}, 'Mini-test par sujet'), el('p', {}, '15 questions en 15 minutes sur un seul sujet, pour travailler un point faible.'), el('label', { for: 'test-topic', class: 'sr-only' }, 'Sujet du mini-test'), topicSel, bt]));
      app.replaceChildren(opts, cards, history());
    }

    function history() {
      const hist = store.get('tests', []);
      const wrap = el('div');
      wrap.appendChild(el('h2', { id: 'historique' }, 'Mes résultats'));
      if (!hist.length) { wrap.appendChild(el('p', { class: 'small' }, 'Aucun test terminé pour le moment. Les résultats sont gardés seulement dans ce navigateur.')); return wrap; }
      const table = el('table', { class: 'hist tight' });
      table.appendChild(el('tr', {}, ['Date', 'Test', 'Score', 'Résultat', 'Temps'].map(h => el('th', {}, h))));
      hist.slice(-12).reverse().forEach(h => {
        const d = new Date(h.date);
        const date = d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
        table.appendChild(el('tr', {}, [el('td', {}, date), el('td', {}, h.name), el('td', { class: 'num' }, `${h.score} / ${h.n}`),
          el('td', {}, [el('span', { class: 'pill ' + (h.pct >= 50 ? 'ok' : 'bad') }, h.pct + ' %')]), el('td', { class: 'num' }, fmtTime(h.secs))]));
      });
      wrap.appendChild(el('div', { style: 'overflow-x:auto' }, [table]));
      const clear = el('button', { class: 'btn secondary small', type: 'button' }, 'Effacer mes résultats');
      let armed = false;
      clear.addEventListener('click', () => { if (!armed) { armed = true; clear.textContent = 'Confirmer l’effacement'; return; } store.set('tests', []); setup(); });
      wrap.appendChild(clear);
      return wrap;
    }

    /* ----- test en cours ----- */
    function run(cfg) {
      stop();
      const qs = buildTest(cfg.seed, cfg.n, cfg.topic);
      const ans = new Array(qs.length).fill(null), flag = new Array(qs.length).fill(false);
      let cur = 0;
      const t0 = Date.now();
      const elapsed = () => (Date.now() - t0) / 1000;
      const timer = el('span', { class: 'timer', role: 'timer' });
      const prog = el('span', { class: 't-prog' });
      const endBtn = el('button', { class: 'btn secondary small', type: 'button' }, 'Terminer le test');
      const bar = el('div', { class: 'test-bar' }, [el('strong', {}, cfg.name), timer, prog, el('span', { class: 'spacer' }), endBtn]);
      const grid = el('div', { class: 'qgrid', role: 'navigation', 'aria-label': 'Questions du test' });
      const card = el('div', { class: 'tq' });
      const gridBtns = qs.map((_, i) => { const b = el('button', { type: 'button', 'aria-label': 'Question ' + (i + 1) }, String(i + 1)); b.addEventListener('click', () => show(i)); grid.appendChild(b); return b; });
      let armed = false;
      const disarm = () => { if (armed) { armed = false; endBtn.textContent = 'Terminer le test'; endBtn.className = 'btn secondary small'; } };
      endBtn.addEventListener('click', () => {
        const left = ans.filter(a => a === null).length;
        if (!armed) { armed = true; endBtn.textContent = left ? `Confirmer (${left} sans réponse)` : 'Confirmer la remise'; endBtn.className = 'btn small'; return; }
        finish(false);
      });
      function tick() {
        const e = elapsed();
        if (cfg.timed) {
          const left = cfg.secs - e;
          timer.textContent = fmtTime(left);
          timer.classList.toggle('low', left < 300);
          if (left <= 0) finish(true);
        } else timer.textContent = fmtTime(e);
      }
      function refresh() {
        gridBtns.forEach((b, i) => { b.className = (ans[i] !== null ? 'done ' : '') + (flag[i] ? 'flag ' : '') + (i === cur ? 'cur' : ''); });
        prog.textContent = `${ans.filter(a => a !== null).length} / ${qs.length} répondues`;
      }
      function show(i) {
        cur = i; disarm();
        const q = qs[i];
        const list = el('ul', { class: 'choices' });
        q.c.forEach((txt, k) => {
          const b = el('button', { type: 'button', class: 'choice-btn' + (ans[i] === k ? ' picked' : ''), html: `<span class="letter">${LETTERS[k]})</span><span class="txt">${txt}</span>`, 'aria-pressed': ans[i] === k ? 'true' : 'false' });
          b.addEventListener('click', () => { ans[i] = ans[i] === k ? null : k; show(i); });
          list.appendChild(el('li', {}, [b]));
        });
        const prev = el('button', { class: 'btn secondary', type: 'button', disabled: i === 0 }, '← Précédente');
        prev.addEventListener('click', () => show(i - 1));
        const nextB = el('button', { class: 'btn', type: 'button', disabled: i === qs.length - 1 }, 'Suivante →');
        nextB.addEventListener('click', () => show(i + 1));
        const fl = el('button', { class: 'btn secondary', type: 'button' }, flag[i] ? 'Retirer la marque' : 'Marquer pour y revenir');
        fl.addEventListener('click', () => { flag[i] = !flag[i]; show(i); });
        card.replaceChildren(el('div', { class: 'tq-meta' }, [`Question ${i + 1} sur ${qs.length}`, flag[i] ? el('span', { class: 'pill warn' }, 'à revoir') : null]), el('p', { class: 'q-text', html: q.q }));
        const f = figNode(q); if (f) card.appendChild(f);
        card.append(list, el('div', { class: 'tq-nav' }, [prev, fl, nextB]));
        refresh();
      }
      keyHandler = ev => {
        if (ev.target && /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
        if (ev.key === 'ArrowRight' && cur < qs.length - 1) show(cur + 1);
        else if (ev.key === 'ArrowLeft' && cur > 0) show(cur - 1);
        else { const k = 'abcd'.indexOf(ev.key.toLowerCase()); const d = '1234'.indexOf(ev.key); const pick = k >= 0 ? k : d; if (pick >= 0 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ans[cur] = pick; show(cur); } }
      };
      document.addEventListener('keydown', keyHandler);
      function finish(timeout) {
        const secs = Math.min(elapsed(), cfg.timed ? cfg.secs : Infinity);
        stop();
        const score = qs.reduce((s, q, i) => s + (ans[i] === q.a ? 1 : 0), 0);
        const pct = Math.round(100 * score / qs.length);
        const hist = store.get('tests', []);
        hist.push({ name: cfg.name, date: Date.now(), n: qs.length, score, pct, secs: Math.round(secs) });
        store.set('tests', hist.slice(-40));
        results(cfg, qs, ans, { score, pct, secs, timeout });
      }
      app.replaceChildren(bar, grid, card, el('p', { class: 'small' }, 'Au clavier : flèches gauche et droite pour changer de question, touches a, b, c, d (ou 1 à 4) pour répondre. Tu peux changer une réponse tant que le test n’est pas remis.'));
      show(0); tick();
      ticker = setInterval(tick, 500);
      bar.scrollIntoView({ block: 'start' });
    }

    /* ----- résultats et révision ----- */
    function results(cfg, qs, ans, res) {
      const pass = res.pct >= 50;
      const hero = el('div', { class: 'result-hero ' + (pass ? 'pass' : 'fail') }, [
        el('div', { class: 'pct' }, res.pct + ' %'),
        el('div', {}, [
          el('div', { class: 'bigval' }, pass ? 'Au-dessus de la note de passage' : 'Sous la note de passage'),
          el('div', {}, `${res.score} bonnes réponses sur ${qs.length} | temps : ${fmtTime(res.secs)}${res.timeout ? ' (temps écoulé)' : ''} | note de passage du test réel : 50 %`),
          el('div', { class: 'small' }, pass ? (res.pct >= 70 ? 'Bonne marge de sécurité. Revois quand même les questions ratées ci-dessous.' : 'C’est réussi, mais la marge est mince : vise 70 % à l’entraînement.') : 'Regarde le détail par sujet et reprends la théorie des sujets les plus faibles avant de refaire un test.')
        ])
      ]);
      const by = {};
      qs.forEach((q, i) => { const b = by[q.t] = by[q.t] || { n: 0, ok: 0 }; b.n++; if (ans[i] === q.a) b.ok++; });
      const bars = el('div', { class: 'bars' });
      HQ.topics.forEach(tp => {
        const b = by[tp.id]; if (!b) return;
        const p = Math.round(100 * b.ok / b.n);
        bars.appendChild(el('div', { class: 'row' }, [el('a', { href: tp.page }, tp.name), el('div', { class: 'track' }, [el('span', { class: p < 50 ? 'low' : null, style: `width:${p}%` })]), el('div', { class: 'val' }, `${b.ok} / ${b.n}`)]));
      });
      const again = el('button', { class: 'btn', type: 'button' }, cfg.name.indexOf('Test surprise') === 0 || cfg.topic ? 'Refaire les mêmes questions' : 'Refaire ce test');
      again.addEventListener('click', () => run(cfg));
      const back = el('button', { class: 'btn secondary', type: 'button' }, 'Choisir un autre test');
      back.addEventListener('click', setup);
      const review = el('div', { class: 'review' });
      const onlyBad = el('input', { type: 'checkbox', id: 'only-bad' });
      const fill = () => {
        review.replaceChildren();
        qs.forEach((q, i) => {
          const good = ans[i] === q.a, skip = ans[i] === null;
          if (onlyBad.checked && good) return;
          const list = el('ul', { class: 'choices' });
          q.c.forEach((txt, k) => list.appendChild(el('li', {}, [el('button', { type: 'button', disabled: true, class: 'choice-btn' + (k === q.a ? ' correct' : (k === ans[i] ? ' wrong' : '')), html: `<span class="letter">${LETTERS[k]})</span><span class="txt">${txt}</span>` })])));
          const cardQ = el('div', { class: 'tq ' + (good ? 'ok' : skip ? 'skip' : 'no') }, [
            el('div', { class: 'tq-meta' }, [`Question ${i + 1}`, el('span', { class: 'pill' }, HQ.topicName(q.t)), el('span', { class: 'pill ' + (good ? 'ok' : skip ? 'warn' : 'bad') }, good ? 'réussie' : skip ? 'sans réponse' : 'ratée')]),
            el('p', { class: 'q-text', html: q.q })
          ]);
          const f = figNode(q); if (f) cardQ.appendChild(f);
          cardQ.append(list, el('div', { class: 'sol-box' + (good ? '' : ' wrong') }, [el('p', { html: q.e })]));
          review.appendChild(cardQ);
        });
        if (!review.children.length) review.appendChild(el('p', {}, 'Aucune erreur : tout est réussi.'));
      };
      onlyBad.addEventListener('change', fill);
      app.replaceChildren(hero, el('h2', {}, 'Résultat par sujet'), bars, el('div', { class: 'w-row' }, [again, back]),
        el('h2', {}, 'Révision des questions'), el('label', { for: 'only-bad', class: 'w-row' }, [onlyBad, 'Afficher seulement les questions ratées ou sans réponse']), review);
      fill();
      hero.scrollIntoView({ block: 'start' });
    }

    setup();
  }

  /* ===================== Version papier d'un test fixe (page papier.html#A, #B ou #C) ===================== */
  function initPaper() {
    const app = document.getElementById('paper-app');
    if (!app || !HQ.gens || !HQ.bank) return;
    function render() {
      const id = (location.hash || '#A').slice(1).toUpperCase();
      const p = PRESETS.find(x => x.id === id) || PRESETS[0];
      const qs = buildTest(p.seed, 40);
      const pick = el('p', { class: 'no-print w-row' }, [el('strong', {}, 'Test à afficher :')].concat(PRESETS.map(x => el('a', { href: '#' + x.id, class: 'pill' + (x.id === p.id ? ' accent' : '') }, x.name))));
      const head = el('div', { class: 'paper-head' }, [
        el('h1', {}, p.name + ' | version papier'),
        el('p', {}, '40 questions à choix de réponses | durée : 45 minutes | note de passage : 50 %, soit 20 bonnes réponses'),
        el('p', { class: 'small' }, 'Matériel : calculatrice scientifique, règle, crayon, efface. Encercle une seule réponse par question. Le corrigé est à la fin, sur une page séparée.'),
        el('p', { class: 'paper-id' }, 'Date : ________________     Heure de début : __________     Résultat : ______ / 40')
      ]);
      const list = el('div', { class: 'paper-list' });
      qs.forEach((q, i) => {
        const item = el('div', { class: 'pq' }, [el('p', { class: 'pq-q', html: `<span class="q-num">${i + 1}.</span> ${q.q}` })]);
        const f = figNode(q); if (f) item.appendChild(f);
        const ch = el('ol', { class: 'pq-c', type: 'a' });
        q.c.forEach(c => ch.appendChild(el('li', { html: c })));
        item.appendChild(ch);
        list.appendChild(item);
      });
      const key = el('div', { class: 'paper-key' }, [el('h2', {}, 'Corrigé | ' + p.name)]);
      const grid = el('p', { class: 'paper-grid' });
      qs.forEach((q, i) => grid.appendChild(el('span', {}, `${i + 1}. ${LETTERS[q.a]}`)));
      key.appendChild(grid);
      const table = el('table', { class: 'tight' });
      table.appendChild(el('tr', {}, [el('th', {}, 'No'), el('th', {}, 'Réponse'), el('th', {}, 'Explication')]));
      qs.forEach((q, i) => table.appendChild(el('tr', {}, [el('td', { class: 'num' }, String(i + 1)), el('td', { html: `<strong>${LETTERS[q.a]})</strong> ${q.c[q.a]}` }), el('td', { html: q.e })])));
      key.appendChild(table);
      app.replaceChildren(pick, head, list, key);
    }
    window.addEventListener('hashchange', render);
    render();
  }

  (HQ.hooks = HQ.hooks || []).push(initDrills, initTests, initPaper);
})();
