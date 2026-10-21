/* INF1010 - logique commune : navigation, sommaire, coloration du code, quiz, suivi de progression */
(function () {
  'use strict';

  const LS_PREFIX = 'inf1010:';
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(LS_PREFIX + key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ }
    }
  };
  window.INF = window.INF || {};
  window.INF.store = store;

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

  /* ---------- Coloration syntaxique (C++ et Python, sans dépendance) ---------- */
  const CPP_KW = new Set(('alignas alignof and auto bool break case catch char class const constexpr const_cast continue default delete do double ' +
    'dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not nullptr ' +
    'operator override final private protected public reinterpret_cast return short signed sizeof static static_assert static_cast struct switch ' +
    'template this throw true try typedef typeid typename union unsigned using virtual void volatile while concept requires wchar_t').split(' '));
  const CPP_TY = new Set(('std string vector list map set multimap multiset unordered_map unordered_set deque array pair tuple shared_ptr unique_ptr weak_ptr ' +
    'ostream istream iostream fstream ifstream ofstream stringstream ostringstream istringstream cout cin cerr endl size_t make_shared make_unique move swap ' +
    'function exception runtime_error logic_error out_of_range invalid_argument bad_cast bad_alloc optional INFINITY numeric_limits dynamic_pointer_cast ' +
    'static_pointer_cast back_inserter ostream_iterator istream_iterator iterator const_iterator reverse_iterator greater less plus minus multiplies ' +
    'initializer_list int64_t uint64_t int32_t uint32_t ptrdiff_t').split(' '));
  const PY_KW = new Set(('def class return if elif else for while in not and or import from as None True False pass break continue lambda try except ' +
    'finally raise with is del global nonlocal yield assert async await').split(' '));
  const PY_BI = new Set(('print len range str int float list dict set tuple self super __init__ __str__ __repr__ __eq__ __lt__ __add__ __len__ ' +
    'isinstance type open enumerate zip sorted map filter sum min max abs round input append pop insert remove sort keys values items format join split').split(' '));

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function tokenize(src, lang) {
    const out = []; // [text, class]
    const re = lang === 'py'
      ? /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(#[^\n]*)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b[A-Za-z_]\w*\b)/g
      : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(^[ \t]*#[^\n]*)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFuUlL]*\b)|(\b[A-Za-z_]\w*\b)/gm;
    let last = 0, m;
    while ((m = re.exec(src)) !== null) {
      if (m.index > last) out.push([src.slice(last, m.index), '']);
      let cls = '';
      if (lang === 'py') {
        if (m[1] !== undefined) cls = 'tk-str';
        else if (m[2] !== undefined) cls = 'tk-cm';
        else if (m[3] !== undefined) cls = 'tk-num';
        else if (m[4] !== undefined) cls = PY_KW.has(m[4]) ? 'tk-kw' : (PY_BI.has(m[4]) ? 'tk-ty' : (/^[A-Z]/.test(m[4]) ? 'tk-cls' : ''));
      } else {
        if (m[1] !== undefined) cls = 'tk-cm';
        else if (m[2] !== undefined) cls = 'tk-str';
        else if (m[3] !== undefined) cls = 'tk-pp';
        else if (m[4] !== undefined) cls = 'tk-num';
        else if (m[5] !== undefined) cls = CPP_KW.has(m[5]) ? 'tk-kw' : (CPP_TY.has(m[5]) ? 'tk-ty' : (/^[A-Z][a-zA-Z]/.test(m[5]) ? 'tk-cls' : ''));
      }
      out.push([m[0], cls]);
      last = m.index + m[0].length;
    }
    if (last < src.length) out.push([src.slice(last), '']);
    return out;
  }

  function dedent(text) {
    let lines = text.replace(/\r\n?/g, '\n').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    let min = Infinity;
    lines.forEach(l => { if (l.trim()) { const n = l.match(/^[ \t]*/)[0].length; if (n < min) min = n; } });
    if (!isFinite(min)) min = 0;
    return lines.map(l => l.slice(min)).join('\n');
  }

  // Produit le HTML des lignes (span.cl) à partir d'une source
  function highlight(src, lang) {
    const tokens = lang === 'txt' ? [[src, '']] : tokenize(src, lang);
    const lines = [['']]; // tableau de fragments HTML par ligne
    tokens.forEach(([text, cls]) => {
      const parts = text.split('\n');
      parts.forEach((p, i) => {
        if (i > 0) lines.push(['']);
        if (p) lines[lines.length - 1].push(cls ? `<span class="${cls}">${esc(p)}</span>` : esc(p));
      });
    });
    return lines.map((frags, i) => `<span class="cl" data-n="${i + 1}">${frags.join('')}</span>`).join('');
  }
  window.INF.highlight = highlight;
  window.INF.dedent = dedent;

  // Remplace <script type="text/cpp|text/py|text/plain"> par des blocs colorés (sauf ceux portant data-role, lus par les démos)
  function renderCode(root) {
    (root || document).querySelectorAll('script[type="text/cpp"], script[type="text/py"], script[type="text/plain"]').forEach(s => {
      if (s.dataset.role) return;
      const lang = s.type === 'text/cpp' ? 'cpp' : (s.type === 'text/py' ? 'py' : 'txt');
      const src = dedent(s.textContent);
      const pre = document.createElement('pre');
      if (lang === 'txt') {
        pre.className = 'console';
        if (s.dataset.title) pre.dataset.title = s.dataset.title;
        pre.textContent = src;
      } else {
        pre.className = 'code';
        if (s.hasAttribute('data-lines')) pre.setAttribute('data-lines', '');
        const code = document.createElement('code');
        code.innerHTML = highlight(src, lang);
        pre.appendChild(code);
      }
      let node = pre;
      if (lang !== 'txt' && s.dataset.title) {
        const fig = document.createElement('figure'); fig.className = 'code-fig';
        const cap = document.createElement('figcaption'); cap.textContent = s.dataset.title;
        fig.append(cap, pre); node = fig;
      }
      s.replaceWith(node);
    });
  }
  window.INF.renderCode = renderCode;

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
        const items = Array.from(q.querySelectorAll('.choices > li'));
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
      const page = el.dataset.progressFor;
      const quizId = el.dataset.quizId;
      const best = quizId ? store.get('quiz:' + quizId, null) : null;
      const exo = store.get('exo:' + page, {});
      const done = Object.values(exo).filter(Boolean).length;
      const total = parseInt(el.dataset.exoTotal || '0', 10);
      const parts = [];
      if (quizId) parts.push(best ? `Quiz : ${best.score}/${best.total}` : 'Quiz : pas encore fait');
      parts.push(total ? `Exercices cochés : ${done}/${total}` : `Exercices cochés : ${done}`);
      el.textContent = parts.join(' - ');
    });
  }

  /* ---------- Dates (accueil) : marque les échéances passées / imminentes ---------- */
  function initTimeline() {
    const now = new Date();
    document.querySelectorAll('.timeline li[data-date]').forEach(li => {
      const d = new Date(li.dataset.date + 'T23:59:00');
      const diff = (d - now) / 86400000;
      if (diff < 0) li.classList.add('past');
      else if (diff < 7) li.classList.add('soon');
    });
  }

  /* ---------- Démarrage ---------- */
  function start() {
    initTheme(); initNav(); renderCode(); initToc(); initQuiz(); initExercises(); initHomeProgress(); initTimeline();
    window.INF.ready = true;
    document.dispatchEvent(new CustomEvent('inf:ready'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
