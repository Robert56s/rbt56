/* ELE2307 - logique commune : navigation, table des matières, quiz, suivi de progression, rendu KaTeX */
(function () {
  'use strict';

  const LS_PREFIX = 'ele2307:';
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(LS_PREFIX + key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ }
    }
  };
  window.ELE = window.ELE || {};
  window.ELE.store = store;

  /* ---------- Thème clair / sombre ---------- */
  function initTheme() {
    const saved = store.get('theme', null);
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    const btn = document.querySelector('.theme-btn');
    if (!btn) return;
    const label = () => {
      const t = document.documentElement.getAttribute('data-theme');
      const dark = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
      btn.textContent = dark ? '☀︎ Clair' : '☾ Sombre';
    };
    label();
    btn.addEventListener('click', () => {
      const t = document.documentElement.getAttribute('data-theme');
      const dark = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      store.set('theme', next);
      label();
      document.dispatchEvent(new CustomEvent('themechange'));
    });
  }

  /* ---------- Navigation active ---------- */
  function initNav() {
    const here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.site-header nav a').forEach(a => {
      const target = a.getAttribute('href');
      if (target === here) a.classList.add('active');
    });
  }

  /* ---------- Table des matières automatique ---------- */
  function slugify(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
  }
  function initToc() {
    const toc = document.querySelector('.toc');
    const content = document.querySelector('.content');
    if (!toc || !content) return;
    const heads = content.querySelectorAll('h2, h3');
    if (!heads.length) return;
    const ul = document.createElement('ul');
    const used = new Set();
    heads.forEach(h => {
      if (h.closest('.exo') || h.closest('.widget')) return;
      if (!h.id) {
        let id = slugify(h.textContent); let k = 2;
        while (used.has(id) || document.getElementById(id)) id = slugify(h.textContent) + '-' + (k++);
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

    // surlignage de la section visible
    const links = Array.from(ul.querySelectorAll('a'));
    const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
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

  /* ---------- Quiz ---------- */
  function initQuiz() {
    document.querySelectorAll('.quiz[data-quiz-id]').forEach(quiz => {
      const id = quiz.dataset.quizId;
      const qs = Array.from(quiz.querySelectorAll('.q'));
      const letters = 'abcdefgh';
      let score = 0, answered = 0;
      const footer = quiz.querySelector('.quiz-footer') || quiz.appendChild(document.createElement('div'));
      footer.className = 'quiz-footer';
      const scoreEl = document.createElement('span'); scoreEl.className = 'score';
      const bestEl = document.createElement('span'); bestEl.className = 'best';
      const resetBtn = document.createElement('button'); resetBtn.className = 'btn secondary'; resetBtn.textContent = 'Recommencer le quiz';
      footer.append(scoreEl, bestEl, resetBtn);

      const renderScore = () => {
        scoreEl.textContent = `Score : ${score} / ${qs.length}` + (answered < qs.length ? ` (${answered} répondue${answered > 1 ? 's' : ''})` : '');
        const best = store.get('quiz:' + id, null);
        bestEl.textContent = best === null ? '' : `Meilleur score enregistré : ${best.score} / ${best.total}`;
      };

      qs.forEach((q, qi) => {
        const correct = parseInt(q.dataset.answer, 10);
        const text = q.querySelector('.q-text');
        if (text && !text.querySelector('.q-num')) {
          const n = document.createElement('span'); n.className = 'q-num'; n.textContent = (qi + 1) + '.';
          text.prepend(n);
        }
        const items = Array.from(q.querySelectorAll('.choices li'));
        items.forEach((li, i) => {
          const btn = document.createElement('button');
          btn.type = 'button'; btn.className = 'choice-btn';
          btn.innerHTML = `<span class="letter">${letters[i]})</span><span class="txt">${li.innerHTML}</span>`;
          li.innerHTML = ''; li.appendChild(btn);
          btn.addEventListener('click', () => {
            if (q.classList.contains('answered')) return;
            q.classList.add('answered');
            answered++;
            const buttons = q.querySelectorAll('.choice-btn');
            buttons.forEach(b => b.disabled = true);
            if (i === correct) { btn.classList.add('correct'); score++; }
            else { btn.classList.add('wrong'); buttons[correct].classList.add('correct'); }
            renderScore();
            if (answered === qs.length) {
              const best = store.get('quiz:' + id, null);
              if (!best || score > best.score) store.set('quiz:' + id, { score, total: qs.length, date: Date.now() });
              renderScore();
            }
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

  /* ---------- Exercices : case « Fait » + barre de progression ---------- */
  function initExercises() {
    const exos = Array.from(document.querySelectorAll('.exo[data-exo-id]'));
    if (!exos.length) return;
    const page = location.pathname.split('/').pop() || 'index.html';
    const key = 'exo:' + page;
    const state = store.get(key, {});
    const bars = Array.from(document.querySelectorAll('.exo-tools[data-scope]'));

    function refreshBars() {
      bars.forEach(tool => {
        const scope = document.getElementById(tool.dataset.scope);
        const list = scope ? Array.from(scope.querySelectorAll('.exo[data-exo-id]')) : exos;
        const done = list.filter(e => state[e.dataset.exoId]).length;
        const bar = tool.querySelector('.progress-bar > span');
        const label = tool.querySelector('.progress-label');
        if (bar) bar.style.width = (list.length ? 100 * done / list.length : 0) + '%';
        if (label) label.textContent = `${done} / ${list.length} exercices cochés`;
      });
    }
    exos.forEach(exo => {
      const id = exo.dataset.exoId;
      let label = exo.querySelector('label.done');
      if (!label) {
        label = document.createElement('label'); label.className = 'done';
        label.innerHTML = '<input type="checkbox"> Fait';
        const header = exo.querySelector('header') || exo;
        header.appendChild(label);
      }
      const cb = label.querySelector('input');
      cb.checked = !!state[id];
      exo.classList.toggle('is-done', cb.checked);
      cb.addEventListener('change', () => {
        state[id] = cb.checked; store.set(key, state);
        exo.classList.toggle('is-done', cb.checked);
        refreshBars();
      });
    });
    bars.forEach(tool => {
      const btnOpen = tool.querySelector('[data-action="open-all"]');
      const btnClose = tool.querySelector('[data-action="close-all"]');
      const scope = document.getElementById(tool.dataset.scope) || document;
      if (btnOpen) btnOpen.addEventListener('click', () => scope.querySelectorAll('details.sol').forEach(d => d.open = true));
      if (btnClose) btnClose.addEventListener('click', () => scope.querySelectorAll('details').forEach(d => d.open = false));
    });
    refreshBars();
  }

  /* ---------- Progression sur la page d'accueil ---------- */
  function initHomeProgress() {
    document.querySelectorAll('[data-progress-for]').forEach(el => {
      const page = el.dataset.progressFor;           // ex. cours1.html
      const quizId = el.dataset.quizId;              // ex. c1
      const best = store.get('quiz:' + quizId, null);
      const exo = store.get('exo:' + page, {});
      const done = Object.values(exo).filter(Boolean).length;
      const total = parseInt(el.dataset.exoTotal || '0', 10);
      const parts = [];
      parts.push(best ? `Quiz : ${best.score}/${best.total}` : 'Quiz : pas encore fait');
      parts.push(total ? `Exercices cochés : ${done}/${total}` : `Exercices cochés : ${done}`);
      el.textContent = parts.join(' - ');
    });
  }

  /* ---------- Rendu des formules (KaTeX auto-render) ---------- */
  function renderMath() {
    if (typeof renderMathInElement !== 'function') return;
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false,
      strict: 'ignore',
      macros: { '\\mean': '\\overline{#1}' }
    });
  }
  window.ELE.renderMath = renderMath;

  /* ---------- Démarrage ---------- */
  function start() {
    initTheme(); initNav(); initToc(); initQuiz(); initExercises(); initHomeProgress();
    renderMath();
    document.dispatchEvent(new CustomEvent('ele:ready'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
