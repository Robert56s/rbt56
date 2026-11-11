/* Test technique Installateur Mesurage - logique commune :
   thème, sommaire, quiz (statiques ou tirés de la banque), suivi, rendu KaTeX, registres de figures et de démos. */
(function () {
  'use strict';

  const HQ = window.HQ = window.HQ || {};
  const LS_PREFIX = 'hqmes:';
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(LS_PREFIX + key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ }
    }
  };
  HQ.store = store;
  HQ.figs = HQ.figs || {};       // nom -> fonction(figure) qui dessine dans <figure data-fig="nom">
  HQ.widgets = HQ.widgets || {}; // nom -> fonction(conteneur) pour <div class="widget" data-widget="nom">

  /* ---------- Sujets (ordre d'étude) ---------- */
  HQ.topics = [
    { id: 'unites', page: 'unites.html', name: 'Unités et préfixes' },
    { id: 'base', page: 'base.html', name: 'Électricité de base' },
    { id: 'calculs', page: 'calculs.html', name: 'Calculs électriques' },
    { id: 'alternatif', page: 'alternatif.html', name: 'Courant alternatif' },
    { id: 'electrotechnique', page: 'electrotechnique.html', name: 'Électrotechnique' },
    { id: 'transformateurs', page: 'transformateurs.html', name: 'Transformateurs' },
    { id: 'triphase', page: 'triphase.html', name: 'Monophasé et triphasé' },
    { id: 'mesure', page: 'mesure.html', name: 'Mesure et comptage' },
    { id: 'securite', page: 'securite.html', name: 'Sécurité électrique' },
    { id: 'schemas', page: 'schemas.html', name: 'Lecture de schémas' }
  ];
  HQ.topicName = id => (HQ.topics.find(t => t.id === id) || { name: id }).name;

  /* ---------- Petits utilitaires ---------- */
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => { if (c == null) return; e.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); });
    return e;
  }
  const NBSP = ' ';
  // "1234.5" -> "1234,5" ; espace insécable par groupes de trois à partir de 10 000
  function frStr(s) {
    let [int, dec] = String(s).split('.');
    const neg = int.startsWith('-'); if (neg) int = int.slice(1);
    if (int.length > 4) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (neg ? '-' : '') + int + (dec ? ',' + dec : '');
  }
  // nombre fixe de décimales (zéros inutiles retirés)
  function fr(x, digits = 2) {
    if (!isFinite(x)) return String(x);
    let s = Number(x).toFixed(digits);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return frStr(s);
  }
  // n chiffres significatifs, sans exposant
  function sig(x, n = 3) {
    if (x === 0) return '0';
    if (!isFinite(x)) return String(x);
    const e = Math.floor(Math.log10(Math.abs(x)));
    return fr(x, Math.min(10, Math.max(0, n - 1 - e)));
  }
  const PREFIX = { 9: 'G', 6: 'M', 3: 'k', 0: '', '-3': 'm', '-6': 'µ', '-9': 'n', '-12': 'p' };
  // notation d'ingénieur avec préfixe : eng(0.00255, 'A') -> "2,55 mA"
  function eng(x, unit, n = 3) {
    if (x === 0) return '0' + NBSP + unit;
    let e3 = Math.floor(Math.log10(Math.abs(x)) / 3) * 3;
    e3 = Math.max(-12, Math.min(9, e3));
    let v = x / Math.pow(10, e3);
    if (Math.abs(Number(v.toPrecision(n))) >= 1000 && e3 < 9) { e3 += 3; v = x / Math.pow(10, e3); }
    return sig(v, n) + NBSP + PREFIX[e3] + unit;
  }
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const sup = s => String(s).split('').map(c => SUP[c] || c).join('');
  // notation scientifique : sci(6.24e18) -> "6,24 × 10¹⁸"
  function sci(x, n = 3) {
    if (x === 0) return '0';
    let e = Math.floor(Math.log10(Math.abs(x)));
    let m = Number((x / Math.pow(10, e)).toPrecision(n));
    if (Math.abs(m) >= 10) { m /= 10; e += 1; }
    return fr(m, n - 1) + NBSP + '×' + NBSP + '10' + sup(e);
  }
  // générateur pseudo-aléatoire reproductible (mulberry32)
  function rng(seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.shuffle = arr => { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
    return f;
  }
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  Object.assign(HQ, { el, fr, sig, eng, sci, sup, rng, cssVar, NBSP });

  /* ---------- Thème clair / sombre ---------- */
  function initTheme() {
    const saved = store.get('theme', null);
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    const btn = document.querySelector('.theme-btn');
    if (!btn) return;
    const isDark = () => {
      const t = document.documentElement.getAttribute('data-theme');
      return t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
    };
    const label = () => { btn.textContent = isDark() ? '☀︎ Clair' : '☾ Sombre'; };
    label();
    btn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      store.set('theme', next);
      label();
      document.dispatchEvent(new CustomEvent('themechange'));
    });
  }

  /* ---------- Sommaire automatique ---------- */
  function slugify(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
  }
  function initToc() {
    const toc = document.querySelector('.toc');
    const content = document.querySelector('.content');
    if (!toc || !content) return;
    const heads = Array.from(content.querySelectorAll('h2, h3')).filter(h => !h.closest('.exo') && !h.closest('.widget') && !h.closest('.drill'));
    if (!heads.length) return;
    const ul = document.createElement('ul');
    const used = new Set();
    heads.forEach(h => {
      if (!h.id) {
        const base = slugify(h.textContent) || 'section'; let id = base; let k = 2;
        while (used.has(id) || document.getElementById(id)) id = base + '-' + (k++);
        h.id = id;
      }
      used.add(h.id);
      const li = document.createElement('li');
      li.className = h.tagName === 'H3' ? 'lvl3' : 'lvl2';
      const a = document.createElement('a');
      a.href = '#' + h.id; a.textContent = h.textContent.trim();
      li.appendChild(a); ul.appendChild(li);
    });
    const title = document.createElement('div'); title.className = 'toc-title'; title.textContent = 'Sommaire';
    toc.innerHTML = ''; toc.appendChild(title); toc.appendChild(ul);
    const links = Array.from(ul.querySelectorAll('a'));
    const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    if (!('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          links.forEach(l => l.classList.remove('active'));
          const a = map.get(en.target.id); if (a) a.classList.add('active');
        }
      });
    }, { rootMargin: '-70px 0px -70% 0px', threshold: 0 });
    heads.forEach(h => { if (map.has(h.id)) obs.observe(h); });
  }

  /* ---------- Quiz tirés de la banque : <section class="quiz" data-bank="sujet"> ---------- */
  function buildBankQuizzes() {
    if (!HQ.bank) return;
    document.querySelectorAll('.quiz[data-bank]').forEach(quiz => {
      const topic = quiz.dataset.bank;
      const list = HQ.bank.filter(q => q.t === topic && q.quiz);
      if (!quiz.dataset.quizId) quiz.dataset.quizId = 'q-' + topic;
      if (!quiz.querySelector('h2')) quiz.appendChild(el('h2', {}, 'Quiz rapide'));
      quiz.appendChild(el('p', { class: 'small' }, `${list.length} questions à choix de réponses sur ce sujet, dans le style du test. Le meilleur score est gardé dans ce navigateur. D'autres questions t'attendent dans les tests pratiques.`));
      list.forEach(item => {
        const order = item.c.map((_, i) => i).sort(() => Math.random() - 0.5);
        const q = el('div', { class: 'q', 'data-answer': order.indexOf(item.a) });
        q.appendChild(el('p', { class: 'q-text', html: item.q }));
        if (item.fig) { try { q.appendChild(el('div', { class: 'd-fig' }, [item.fig().node])); } catch (e) { console.error(e); } }
        const ul = el('ul', { class: 'choices' });
        order.forEach(i => ul.appendChild(el('li', { html: item.c[i] })));
        q.appendChild(ul);
        q.appendChild(el('div', { class: 'explain', html: item.e }));
        quiz.appendChild(q);
      });
    });
  }

  /* ---------- Moteur de quiz (questions .q dans une .quiz) ---------- */
  function initQuiz() {
    document.querySelectorAll('.quiz[data-quiz-id]').forEach(quiz => {
      const id = quiz.dataset.quizId;
      const qs = Array.from(quiz.querySelectorAll('.q'));
      if (!qs.length) return;
      const letters = 'abcdefgh';
      let score = 0, answered = 0;
      const footer = quiz.querySelector('.quiz-footer') || quiz.appendChild(document.createElement('div'));
      footer.className = 'quiz-footer';
      const scoreEl = el('span', { class: 'score' });
      const bestEl = el('span', { class: 'best' });
      const resetBtn = el('button', { class: 'btn secondary', type: 'button' }, 'Recommencer le quiz');
      footer.append(scoreEl, bestEl, resetBtn);
      const renderScore = () => {
        scoreEl.textContent = `Score : ${score} / ${qs.length}` + (answered < qs.length ? ` (${answered} répondue${answered > 1 ? 's' : ''})` : '');
        const best = store.get('quiz:' + id, null);
        bestEl.textContent = best === null ? '' : `Meilleur score enregistré : ${best.score} / ${best.total}`;
      };
      qs.forEach((q, qi) => {
        const correct = parseInt(q.dataset.answer, 10);
        const text = q.querySelector('.q-text');
        if (text && !text.querySelector('.q-num')) text.prepend(el('span', { class: 'q-num' }, (qi + 1) + '.'));
        Array.from(q.querySelectorAll('.choices li')).forEach((li, i) => {
          const btn = el('button', { type: 'button', class: 'choice-btn', html: `<span class="letter">${letters[i]})</span><span class="txt">${li.innerHTML}</span>` });
          li.innerHTML = ''; li.appendChild(btn);
          btn.addEventListener('click', () => {
            if (q.classList.contains('answered')) return;
            q.classList.add('answered'); answered++;
            const buttons = q.querySelectorAll('.choice-btn');
            buttons.forEach(b => { b.disabled = true; });
            if (i === correct) { btn.classList.add('correct'); score++; }
            else { btn.classList.add('wrong'); buttons[correct].classList.add('correct'); }
            if (answered === qs.length) {
              const best = store.get('quiz:' + id, null);
              if (!best || score > best.score) store.set('quiz:' + id, { score, total: qs.length, date: Date.now() });
            }
            renderScore();
          });
        });
      });
      resetBtn.addEventListener('click', () => {
        score = 0; answered = 0;
        qs.forEach(q => {
          q.classList.remove('answered');
          q.querySelectorAll('.choice-btn').forEach(b => { b.disabled = false; b.classList.remove('correct', 'wrong'); });
        });
        renderScore();
        quiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      renderScore();
    });
  }

  /* ---------- Exercices à développement : case « Fait » + barre de progression ---------- */
  function initExercises() {
    const exos = Array.from(document.querySelectorAll('.exo[data-exo-id]'));
    if (!exos.length) return;
    const state = store.get('exo', {});
    const bars = Array.from(document.querySelectorAll('.exo-tools[data-scope]'));
    function refreshBars() {
      bars.forEach(tool => {
        const scope = document.getElementById(tool.dataset.scope);
        const list = scope ? Array.from(scope.querySelectorAll('.exo[data-exo-id]')) : exos;
        const done = list.filter(e => state[e.dataset.exoId]).length;
        const bar = tool.querySelector('.progress-bar > span');
        const label = tool.querySelector('.progress-label');
        if (bar) bar.style.width = (list.length ? 100 * done / list.length : 0) + '%';
        if (label) label.textContent = `${done} / ${list.length} problèmes cochés`;
      });
    }
    exos.forEach(exo => {
      const id = exo.dataset.exoId;
      const label = el('label', { class: 'done', html: '<input type="checkbox"> Fait' });
      (exo.querySelector('header') || exo).appendChild(label);
      const cb = label.querySelector('input');
      cb.checked = !!state[id];
      exo.classList.toggle('is-done', cb.checked);
      cb.addEventListener('change', () => {
        state[id] = cb.checked; store.set('exo', state);
        exo.classList.toggle('is-done', cb.checked);
        refreshBars();
      });
    });
    bars.forEach(tool => {
      const scope = document.getElementById(tool.dataset.scope) || document;
      const open = tool.querySelector('[data-action="open-all"]');
      const close = tool.querySelector('[data-action="close-all"]');
      if (open) open.addEventListener('click', () => scope.querySelectorAll('details.sol').forEach(d => { d.open = true; }));
      if (close) close.addEventListener('click', () => scope.querySelectorAll('details').forEach(d => { d.open = false; }));
    });
    refreshBars();
  }

  /* ---------- Progression sur l'accueil ---------- */
  function initHome() {
    document.querySelectorAll('[data-quiz-progress]').forEach(node => {
      const best = store.get('quiz:q-' + node.dataset.quizProgress, null);
      node.textContent = best ? `Quiz : ${best.score} / ${best.total}` : 'Quiz : pas encore fait';
      if (best && best.score / best.total >= 0.7) node.classList.add('ok');
    });
    document.querySelectorAll('[data-tests-progress]').forEach(node => {
      const hist = store.get('tests', []);
      if (!hist.length) { node.textContent = 'Aucun test fait pour le moment'; return; }
      const best = Math.max.apply(null, hist.map(h => h.pct));
      const last = hist[hist.length - 1];
      node.textContent = `${hist.length} test${hist.length > 1 ? 's' : ''} fait${hist.length > 1 ? 's' : ''} | dernier : ${last.pct} % | meilleur : ${best} %`;
      if (best >= 50) node.classList.add('ok');
    });
    document.querySelectorAll('[data-drill-progress]').forEach(node => {
      const st = store.get('drill', {});
      let n = 0, ok = 0;
      Object.values(st).forEach(s => { n += s.n || 0; ok += s.ok || 0; });
      node.textContent = n ? `${n} exercices générés faits | ${Math.round(100 * ok / n)} % de bonnes réponses` : 'Aucun exercice fait pour le moment';
    });
  }

  /* ---------- Rendu des formules (KaTeX auto-render) ---------- */
  function renderMath(root) {
    if (typeof renderMathInElement !== 'function') return;
    renderMathInElement(root || document.body, {
      delimiters: [
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false,
      strict: 'ignore',
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option', 'svg']
    });
  }
  HQ.renderMath = renderMath;

  /* ---------- Figures et démos ---------- */
  function initFigs(root) {
    (root || document).querySelectorAll('figure[data-fig]').forEach(fig => {
      if (fig.dataset.init) return;
      const fn = HQ.figs[fig.dataset.fig];
      if (!fn) { console.error('Figure inconnue : ' + fig.dataset.fig); return; }
      fig.dataset.init = '1';
      try {
        const out = fn(fig);
        const node = out && out.node ? out.node : out;
        if (node instanceof Node) {
          const wrap = el('div', { class: 'svg-wrap' }, [node]);
          fig.insertBefore(wrap, fig.firstChild);
        }
      } catch (e) { console.error('Figure ' + fig.dataset.fig + ' : ' + e.message, e); }
    });
  }
  function initWidgets(root) {
    (root || document).querySelectorAll('.widget[data-widget]').forEach(c => {
      if (c.dataset.init) return;
      const fn = HQ.widgets[c.dataset.widget];
      if (!fn) { console.error('Démo inconnue : ' + c.dataset.widget); return; }
      c.dataset.init = '1';
      try { fn(c); } catch (e) { c.appendChild(el('p', { class: 'w-note' }, 'Erreur de la démo : ' + e.message)); console.error(e); }
    });
  }
  HQ.initFigs = initFigs; HQ.initWidgets = initWidgets;

  /* ---------- Démarrage ---------- */
  let started = false;
  function start() {
    if (started) return; started = true;
    (HQ.hooks || []).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });   // pages Exercices et Tests
    initTheme(); buildBankQuizzes(); initToc(); initQuiz(); initExercises(); initHome();
    initFigs(); initWidgets();
    renderMath();
    document.dispatchEvent(new CustomEvent('hq:ready'));
  }
  // Les scripts sont chargés avec « defer » : on attend DOMContentLoaded pour que les fichiers suivants
  // (draw.js, bank.js, figures de la page) aient eu le temps d'enregistrer leurs fonctions.
  if (document.readyState === 'complete') start();
  else { document.addEventListener('DOMContentLoaded', start); window.addEventListener('load', start); }
})();
