/* INF1010 - démonstrations interactives (sans dépendance externe) */
(function () {
  'use strict';

  /* ===================== Outils ===================== */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) el.setAttribute(k, v);
    });
    children.flat().forEach(c => { if (c === null || c === undefined) return; el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return el;
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function codeBlock(src, lang) {
    const pre = h('pre', { class: 'code' });
    const code = h('code'); code.innerHTML = window.INF.highlight(window.INF.dedent(src), lang || 'cpp');
    pre.appendChild(code); return pre;
  }
  function readJSON(container, role, fallback) {
    const s = container.querySelector(`script[data-role="${role}"]`);
    if (!s) return fallback;
    try { return JSON.parse(s.textContent); } catch (e) { console.error('JSON invalide dans la démo', container, e); return fallback; }
  }
  function readText(container, role) {
    const s = container.querySelector(`[data-role="${role}"]`);
    return s ? window.INF.dedent(s.textContent) : '';
  }
  const norm = s => s.replace(/\s+/g, ' ').trim();

  /* ===================== 1. Exécution pas à pas ===================== */
  function widgetTrace(c) {
    const pre = c.querySelector('pre.code');
    const steps = readJSON(c, 'steps', []);
    if (!pre || !steps.length) return;
    pre.setAttribute('data-lines', '');
    pre.style.position = 'relative';
    const lines = Array.from(pre.querySelectorAll('.cl'));
    const consoleEl = h('pre', { class: 'console', 'data-title': 'Affichage' });
    const varsTable = h('table', { class: 'vars' });
    const note = h('div', { class: 'note' });
    const stepN = h('span', { class: 'step-n' });
    const btnPrev = h('button', { class: 'btn secondary small', type: 'button' }, '◀ Précédent');
    const btnNext = h('button', { class: 'btn small', type: 'button' }, 'Suivant ▶');
    const btnAll = h('button', { class: 'btn secondary small', type: 'button' }, 'Tout dérouler');
    const btnReset = h('button', { class: 'btn secondary small', type: 'button' }, 'Recommencer');
    const ctrl = h('div', { class: 'btn-row' }, btnPrev, btnNext, btnAll, btnReset, stepN);
    const side = h('div', { class: 'side' }, consoleEl, varsTable, note);
    const grid = h('div', { class: 'trace' });
    pre.replaceWith(grid);
    grid.append(pre, side);
    c.appendChild(ctrl);
    c.appendChild(grid);

    let i = -1;
    let prevVars = null;
    function snapshotAt(k) {
      let v = null;
      for (let j = 0; j <= k; j++) if (steps[j].vars !== undefined) v = steps[j].vars;
      return v;
    }
    function render() {
      lines.forEach(l => l.classList.remove('hl'));
      let out = [];
      for (let j = 0; j <= i; j++) {
        const p = steps[j].print;
        if (p === undefined) continue;
        out = out.concat(Array.isArray(p) ? p : [p]);
      }
      consoleEl.textContent = out.join('\n');
      if (i < 0) {
        note.innerHTML = c.dataset.intro || 'Cliquez sur « Suivant » pour exécuter la première instruction.';
        varsTable.innerHTML = '';
        stepN.textContent = `Étape 0 / ${steps.length}`;
      } else {
        const s = steps[i];
        const ls = Array.isArray(s.line) ? s.line : (s.line ? [s.line] : []);
        ls.forEach(n => { const l = lines[n - 1]; if (l) l.classList.add('hl'); });
        if (ls.length) {
          const l = lines[ls[0] - 1];
          if (l) pre.scrollTop = Math.max(0, l.offsetTop - pre.clientHeight / 2);
        }
        note.innerHTML = s.note || '';
        const vars = snapshotAt(i);
        const prev = i > 0 ? snapshotAt(i - 1) : null;
        varsTable.innerHTML = '';
        if (vars && vars.length) {
          varsTable.appendChild(h('thead', null, h('tr', null, h('th', null, 'Où'), h('th', null, 'Variable'), h('th', null, 'Valeur'))));
          const tb = h('tbody');
          vars.forEach(([where, name, val, flag]) => {
            const was = prev && prev.find(p => p[0] === where && p[1] === name);
            const tr = h('tr', { class: flag === 'gone' ? 'gone' : (!was || was[2] !== val ? 'new' : '') },
              h('td', { class: 'where' }, where), h('td', null, name), h('td', { html: val }));
            tb.appendChild(tr);
          });
          varsTable.appendChild(tb);
        }
        stepN.textContent = `Étape ${i + 1} / ${steps.length}`;
      }
      btnPrev.disabled = i < 0; btnNext.disabled = i >= steps.length - 1;
    }
    btnPrev.addEventListener('click', () => { if (i >= 0) { i--; render(); } });
    btnNext.addEventListener('click', () => { if (i < steps.length - 1) { i++; render(); } });
    btnAll.addEventListener('click', () => { i = steps.length - 1; render(); });
    btnReset.addEventListener('click', () => { i = -1; render(); });
    render();
  }

  /* ===================== 2. Devinez l'affichage ===================== */
  function widgetGuess(c) {
    c.classList.add('guess');
    const expected = readText(c, 'expected').split('\n');
    const explain = c.querySelector('[data-role="explain"]');
    if (explain) explain.classList.add('explain-box');
    const ta = h('textarea', { placeholder: 'Écrivez ici l\'affichage attendu, une ligne par ligne du programme.', rows: Math.min(12, Math.max(4, expected.length + 1)) });
    const result = h('div');
    const btnCheck = h('button', { class: 'btn small', type: 'button' }, 'Vérifier');
    const btnShow = h('button', { class: 'btn secondary small', type: 'button' }, 'Voir la réponse');
    const btnClear = h('button', { class: 'btn secondary small', type: 'button' }, 'Effacer');
    const row = h('div', { class: 'btn-row' }, btnCheck, btnShow, btnClear);
    const wrap = h('div', null, h('p', { class: 'w-note' }, 'À vous : quel est l\'affichage exact du programme ? (les espaces en trop sont ignorés)'), ta, row, result);
    if (explain) c.insertBefore(wrap, explain); else c.appendChild(wrap);
    function compare(showAll) {
      const mine = ta.value.replace(/\r/g, '').split('\n').map(s => s.trim()).filter((s, idx, arr) => s.length || idx < arr.length - 1);
      while (mine.length && !mine[mine.length - 1].length) mine.pop();
      const n = Math.max(mine.length, expected.length);
      const table = h('table', { class: 'diff' });
      table.appendChild(h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Votre réponse'), h('th', null, 'Affichage réel'))));
      const tb = h('tbody'); let ok = 0;
      for (let k = 0; k < n; k++) {
        const a = mine[k], b = expected[k];
        let cls = 'bad';
        if (a !== undefined && b !== undefined && norm(a) === norm(b)) { cls = 'ok'; ok++; }
        else if (a === undefined) cls = 'miss';
        tb.appendChild(h('tr', { class: cls }, h('td', null, k + 1), h('td', null, a === undefined ? '(rien)' : a), h('td', null, showAll ? (b === undefined ? '(rien : ligne en trop)' : b) : (cls === 'ok' ? b : '?'))));
      }
      table.appendChild(tb);
      result.innerHTML = '';
      result.appendChild(h('p', { class: 'w-note' }, showAll ? `Réponse complète affichée. Lignes justes : ${ok} / ${expected.length}.` : `Lignes justes : ${ok} / ${expected.length}. ${ok === expected.length && mine.length === expected.length ? 'Bravo, tout est juste.' : 'Les lignes en rouge diffèrent ; cliquez sur « Voir la réponse » pour comparer.'}`));
      result.appendChild(table);
      if (showAll || (ok === expected.length && mine.length === expected.length)) c.classList.add('revealed');
    }
    btnCheck.addEventListener('click', () => compare(false));
    btnShow.addEventListener('click', () => compare(true));
    btnClear.addEventListener('click', () => { ta.value = ''; result.innerHTML = ''; c.classList.remove('revealed'); });
  }

  /* ===================== 3. Liaison statique ou dynamique ===================== */
  function widgetDispatch(c) {
    const IMPL = {
      Animal: { parler: ['Animal', '"..."'], dormir: ['Animal', '"Animal dort"'] },
      Chien: { parler: ['Chien', '"Wouf"'], dormir: ['Chien', '"Chien dort"'] },
      Chiot: { parler: ['Chien', '"Wouf"'], dormir: ['Chien', '"Chien dort"'] }
    };
    const CASES = [
      { code: 'Animal a;            a.METH();', s: 'Animal', d: 'Animal' },
      { code: 'Chien c;             c.METH();', s: 'Chien', d: 'Chien' },
      { code: 'Chiot ch;            ch.METH();', s: 'Chiot', d: 'Chiot' },
      { code: 'Animal* p = new Chien;   p->METH();', s: 'Animal', d: 'Chien' },
      { code: 'Animal* p = new Animal;  p->METH();', s: 'Animal', d: 'Animal' },
      { code: 'Animal* p = new Chiot;   p->METH();', s: 'Animal', d: 'Chiot' },
      { code: 'Chien c;  Animal& r = c;   r.METH();', s: 'Animal', d: 'Chien' },
      { code: 'Chien c;  Animal a = c;    a.METH();   // copie !', s: 'Animal', d: 'Animal', slice: true },
      { code: 'shared_ptr<Animal> p = make_shared<Chien>();  p->METH();', s: 'Animal', d: 'Chien' },
      { code: 'Chien* pc = new Chien;  Animal* pa = pc;  pa->METH();', s: 'Animal', d: 'Chien' },
      { code: 'vector<Animal*> v = { new Chien, new Chiot };  v[1]->METH();', s: 'Animal', d: 'Chiot' },
      { code: 'vector<Animal> v;  v.push_back(Chien());  v[0].METH();   // copie !', s: 'Animal', d: 'Animal', slice: true }
    ];
    const selCase = h('select'); CASES.forEach((k, i) => selCase.appendChild(h('option', { value: i }, k.code.replace('METH', 'parler'))));
    const selMeth = h('select', null, h('option', { value: 'parler' }, 'parler() : virtuelle, redéfinie dans Chien'), h('option', { value: 'dormir' }, 'dormir() : NON virtuelle, redéfinie (masquée) dans Chien'));
    const verdict = h('div', { class: 'verdict' });
    c.appendChild(h('div', { class: 'controls' }, h('label', null, 'Code exécuté', selCase), h('label', null, 'Méthode appelée', selMeth)));
    c.appendChild(verdict);
    function update() {
      const k = CASES[selCase.value], m = selMeth.value;
      const virt = m === 'parler';
      const decider = virt ? k.d : k.s;
      const [cls, out] = IMPL[decider][m];
      selCase.querySelectorAll('option').forEach((o, i) => o.textContent = CASES[i].code.replace('METH', m));
      const lines = [];
      lines.push(`<div class="v-title">Affichage : ${esc(out)}  →  c'est ${esc(cls)}::${m}() qui s'exécute</div>`);
      if (virt) lines.push(`<p><strong>Liaison dynamique.</strong> ${m}() est virtuelle : la version choisie dépend du <em>type réel</em> de l'objet au moment de l'exécution (${k.d}${k.d === 'Chiot' ? ', qui hérite la version de Chien' : ''}). Le type déclaré (${k.s}) ne compte pas.</p>`);
      else lines.push(`<p><strong>Liaison statique.</strong> ${m}() n'est pas virtuelle : le compilateur choisit la version d'après le <em>type déclaré</em> (${k.s}), peu importe l'objet réellement pointé (${k.d}).</p>`);
      if (k.slice) lines.push('<p><strong>Attention au découpage (slicing)</strong> : copier un Chien dans une variable de type Animal (par valeur) ne garde que la partie Animal. L\'objet copié est un vrai Animal : même une méthode virtuelle appelle la version d\'Animal.</p>');
      verdict.className = 'verdict ' + (virt ? 'ok' : 'warn');
      verdict.innerHTML = lines.join('');
    }
    selCase.addEventListener('change', update); selMeth.addEventListener('change', update);
    update();
  }

  /* ===================== 4. Conversions ===================== */
  function widgetCast(c) {
    const CASES = [
      ['Chien* pc = new Chien;\nAnimal* pa = pc;', 'ok', 'Conversion ascendante (upcast) implicite : un Chien est un Animal. Toujours légale, aucun cast nécessaire.'],
      ['Animal* pa = new Chien;\nChien* pc = pa;', 'err', 'Erreur de compilation : la conversion descendante (downcast) n\'est jamais implicite, car le compilateur ne peut pas garantir que pa pointe un Chien.'],
      ['Animal* pa = new Chien;\nChien* pc = static_cast<Chien*>(pa);', 'ok', 'Fonctionne : pa pointe réellement un Chien. static_cast ne vérifie rien à l\'exécution, c\'est le programmeur qui garantit le type.'],
      ['Animal* pa = new Animal;\nChien* pc = static_cast<Chien*>(pa);\npc->japper();', 'ub', 'Compile sans erreur, mais comportement indéfini : l\'objet est un simple Animal, il n\'a pas la partie Chien. static_cast fait confiance aveuglément.'],
      ['Animal* pa = new Chien;\nChien* pc = dynamic_cast<Chien*>(pa);', 'ok', 'Fonctionne et retourne un pointeur valide : dynamic_cast vérifie le type réel à l\'exécution (Animal doit avoir au moins une méthode virtuelle).'],
      ['Animal* pa = new Animal;\nChien* pc = dynamic_cast<Chien*>(pa);\nif (pc == nullptr) cout << "pas un chien";', 'null', 'dynamic_cast échoue proprement : pc vaut nullptr. C\'est la façon sûre de tester le type réel. Affiche « pas un chien ».'],
      ['Chien c;\nAnimal& ra = c;\nChien& rc = dynamic_cast<Chien&>(ra);', 'ok', 'Avec une référence, dynamic_cast réussit si l\'objet est bien un Chien.'],
      ['Animal a;\nAnimal& ra = a;\nChien& rc = dynamic_cast<Chien&>(ra);', 'exc', 'Avec une référence, un échec de dynamic_cast ne peut pas retourner nullptr : il lance l\'exception std::bad_cast.'],
      ['Chien c;\nAnimal a = c;   // par valeur', 'slice', 'Compile : conversion ascendante par copie. Mais seule la partie Animal est copiée (découpage, slicing). a n\'est pas un Chien et le polymorphisme est perdu.'],
      ['Animal a;\nChien c = a;', 'err', 'Erreur de compilation : il n\'existe pas de conversion d\'Animal vers Chien, sauf si Chien définit un constructeur Chien(const Animal&).'],
      ['shared_ptr<Animal> pa = make_shared<Chien>();\nshared_ptr<Chien> pc = dynamic_pointer_cast<Chien>(pa);', 'ok', 'Version pointeurs intelligents de dynamic_cast : retourne un shared_ptr<Chien> qui partage le même objet (use_count augmente), ou un shared_ptr nul si le type ne correspond pas.'],
      ['shared_ptr<Animal> pa = make_shared<Chien>();\nshared_ptr<Chien> pc = static_pointer_cast<Chien>(pa);', 'ok', 'Équivalent de static_cast pour shared_ptr : pas de vérification, à n\'utiliser que si on est certain du type réel.'],
      ['shared_ptr<Animal> pa = make_shared<Chien>();\nChien* pc = dynamic_cast<Chien*>(pa.get());', 'ok', 'Légal : pa.get() donne le pointeur brut d\'observation. Mais ne jamais construire un nouveau shared_ptr à partir de ce pointeur brut (double destruction).'],
      ['double d = 3.7;\nint n = static_cast<int>(d);', 'ok', 'static_cast sert aussi aux conversions entre types fondamentaux : n vaut 3 (troncature), sans avertissement du compilateur.']
    ];
    const LABEL = { ok: ['ok', 'Compile et fonctionne'], err: ['bad', 'Erreur de compilation'], ub: ['bad', 'Compile, mais comportement indéfini'], null: ['warn', 'Compile ; le résultat est nullptr'], exc: ['warn', 'Compile ; lance std::bad_cast à l\'exécution'], slice: ['warn', 'Compile ; découpage (slicing)'] };
    const sel = h('select'); CASES.forEach((k, i) => sel.appendChild(h('option', { value: i }, k[0].replace(/\n/g, '  |  '))));
    const codeHolder = h('div');
    const verdict = h('div', { class: 'verdict' });
    c.appendChild(h('div', { class: 'controls' }, h('label', null, 'Conversion à tester', sel)));
    c.appendChild(codeHolder); c.appendChild(verdict);
    function update() {
      const [code, kind, why] = CASES[sel.value];
      codeHolder.innerHTML = ''; codeHolder.appendChild(codeBlock('class Animal { public: virtual ~Animal() {} /* ... */ };\nclass Chien : public Animal { public: void japper(); /* ... */ };\n\n' + code));
      verdict.className = 'verdict ' + LABEL[kind][0];
      verdict.innerHTML = `<div class="v-title">${LABEL[kind][1]}</div><p>${why}</p>`;
    }
    sel.addEventListener('change', update); update();
  }

  /* ===================== 5. Simulateur de shared_ptr ===================== */
  function widgetSharedSim(c) {
    const VARS = ['a', 'b', 'c'];
    let objs = {}, nextId = 1, vars = { a: null, b: null, c: null };
    const log = h('div', { class: 'log' });
    const stack = h('div', { class: 'zone' }); const heap = h('div', { class: 'zone' });
    const sel = h('select');
    const opts = [];
    VARS.forEach(v => {
      opts.push([`${v} = make_shared<Objet>();`, () => assign(v, create())]);
      VARS.filter(o => o !== v).forEach(o => opts.push([`${v} = ${o};   // copie du shared_ptr`, () => assign(v, vars[o])]));
      opts.push([`${v}.reset();`, () => assign(v, null)]);
      opts.push([`{ shared_ptr<Objet> tmp = ${v}; }   // copie locale détruite en sortie de bloc`, () => { if (vars[v]) { objs[vars[v]].count++; say(`tmp copie ${v} : use_count = ${objs[vars[v]].count}`); objs[vars[v]].count--; say(`fin du bloc : tmp détruit, use_count = ${objs[vars[v]].count}`); } else say('tmp est un shared_ptr nul, rien ne se passe'); }]);
    });
    opts.push(['Fin du programme : a, b, c détruits', () => { VARS.forEach(v => assign(v, null)); }]);
    opts.forEach((o, i) => sel.appendChild(h('option', { value: i }, o[0])));
    const btn = h('button', { class: 'btn small', type: 'button' }, 'Exécuter');
    const btnReset = h('button', { class: 'btn secondary small', type: 'button' }, 'Réinitialiser');
    c.appendChild(h('div', { class: 'controls' }, h('label', null, 'Instruction (a, b, c sont des shared_ptr<Objet>)', sel)));
    c.appendChild(h('div', { class: 'btn-row' }, btn, btnReset));
    c.appendChild(h('div', { class: 'mem' }, h('div', null, h('div', { class: 'zone-title' }, 'Pile : les pointeurs intelligents'), stack), h('div', null, h('div', { class: 'zone-title' }, 'Tas : les objets et leur use_count'), heap)));
    c.appendChild(log);
    function say(s) { log.textContent += s + '\n'; log.scrollTop = log.scrollHeight; }
    function create() { const id = nextId++; objs[id] = { count: 0, alive: true }; say(`new Objet n°${id} (make_shared)`); return id; }
    function assign(v, id) {
      const old = vars[v];
      if (old === id) { if (id) say(`${v} pointe déjà l'objet n°${id} : rien ne change`); else say(`${v} est déjà nul`); return; }
      vars[v] = id;
      if (id) { objs[id].count++; say(`${v} pointe l'objet n°${id} : use_count = ${objs[id].count}`); }
      if (old) { objs[old].count--; say(`${v} lâche l'objet n°${old} : use_count = ${objs[old].count}` + (objs[old].count === 0 ? '  →  ~Objet n°' + old + ' (libéré automatiquement)' : '')); if (objs[old].count === 0) objs[old].alive = false; }
      draw();
    }
    function draw() {
      stack.innerHTML = ''; heap.innerHTML = '';
      VARS.forEach(v => stack.appendChild(h('span', { class: 'cell' + (vars[v] ? '' : ' null') }, `shared_ptr ${v}`, h('span', { class: 'arrow' }, vars[v] ? '→ n°' + vars[v] : '= nullptr'))));
      Object.entries(objs).forEach(([id, o]) => heap.appendChild(h('span', { class: 'cell' + (o.alive ? '' : ' dead') }, `Objet n°${id}`, h('span', { class: 'cnt' }, 'use_count ' + o.count))));
      if (!Object.keys(objs).length) heap.appendChild(h('span', { class: 'cell null' }, 'vide'));
    }
    btn.addEventListener('click', () => { opts[sel.value][1](); draw(); });
    btnReset.addEventListener('click', () => { objs = {}; nextId = 1; vars = { a: null, b: null, c: null }; log.textContent = ''; draw(); });
    draw();
  }

  /* ===================== 6. Résolution de surcharge (données en JSON) ===================== */
  function widgetOverload(c) {
    const cases = readJSON(c, 'cases', []);
    if (!cases.length) return;
    const sel = h('select'); cases.forEach((k, i) => sel.appendChild(h('option', { value: i }, k.call)));
    const verdict = h('div', { class: 'verdict' });
    const btnAll = h('button', { class: 'btn secondary small', type: 'button' }, 'Afficher le tableau complet');
    const table = h('table'); table.style.display = 'none';
    c.appendChild(h('div', { class: 'controls' }, h('label', null, 'Appel', sel)));
    c.appendChild(verdict); c.appendChild(h('div', { class: 'btn-row' }, btnAll)); c.appendChild(table);
    function update() { const k = cases[sel.value]; verdict.className = 'verdict ' + (k.kind || 'ok'); verdict.innerHTML = `<div class="v-title">${esc(k.answer)}</div><p>${k.why}</p>`; }
    btnAll.addEventListener('click', () => {
      table.style.display = ''; table.innerHTML = '';
      table.appendChild(h('thead', null, h('tr', null, h('th', null, 'Appel'), h('th', null, 'Fonction choisie'), h('th', null, 'Pourquoi'))));
      const tb = h('tbody'); cases.forEach(k => tb.appendChild(h('tr', null, h('td', null, h('code', null, k.call)), h('td', null, k.answer), h('td', { html: k.why })))); table.appendChild(tb);
      btnAll.style.display = 'none';
    });
    sel.addEventListener('change', update); update();
  }

  /* ===================== 7. Simulateur de vector ===================== */
  function widgetVectorSim(c) {
    let v = [], cap = 0;
    const inVal = h('input', { type: 'number', value: 7 });
    const inPos = h('input', { type: 'number', value: 0, min: 0 });
    const inN = h('input', { type: 'number', value: 5, min: 0 });
    const cells = h('div', { class: 'vec' });
    const read = h('div', { class: 'readout' });
    const log = h('div', { class: 'log' });
    const ops = [
      ['v.push_back(val)', () => { grow(v.length + 1); v.push(num(inVal)); }],
      ['v.pop_back()', () => { if (!v.length) throw 'pop_back() sur un vecteur vide : comportement indéfini'; v.pop(); }],
      ['v.insert(v.begin() + pos, val)', () => { const p = num(inPos); if (p < 0 || p > v.length) throw 'pos hors de [0, size] : comportement indéfini'; grow(v.length + 1); v.splice(p, 0, num(inVal)); }],
      ['v.erase(v.begin() + pos)', () => { const p = num(inPos); if (p < 0 || p >= v.length) throw 'pos hors de [0, size[ : comportement indéfini'; v.splice(p, 1); }],
      ['v[pos] = val', () => { const p = num(inPos); if (p < 0 || p >= v.length) throw `v[${p}] : indice hors du vecteur (size = ${v.length}), comportement indéfini (aucune vérification !)`; v[p] = num(inVal); }],
      ['cout << v[pos]', () => { const p = num(inPos); if (p < 0 || p >= v.length) throw `v[${p}] : indice hors du vecteur (size = ${v.length}), comportement indéfini (aucune vérification !)`; say(`affiche ${v[p]}`); }],
      ['cout << v.at(pos)', () => { const p = num(inPos); if (p < 0 || p >= v.length) throw `v.at(${p}) lance l'exception std::out_of_range (vérification faite)`; say(`affiche ${v[p]}`); }],
      ['v.resize(n)', () => { const n = num(inN); grow(n); v = n <= v.length ? v.slice(0, n) : v.concat(Array(n - v.length).fill(0)); }],
      ['v.reserve(n)', () => { const n = num(inN); if (n > cap) cap = n; }],
      ['v.clear()', () => { v = []; }],
      ['vector<int> v(n)   // n zéros', () => { const n = num(inN); v = Array(n).fill(0); cap = n; }],
      ['v.front() / v.back()', () => { if (!v.length) throw 'front()/back() sur un vecteur vide : comportement indéfini'; say(`front() = ${v[0]}, back() = ${v[v.length - 1]}`); }],
      ['cout << v.size() << " " << v.empty()', () => { say(`size() = ${v.length}, empty() = ${v.length ? 'false' : 'true'}`); }]
    ];
    const sel = h('select'); ops.forEach((o, i) => sel.appendChild(h('option', { value: i }, o[0])));
    const btn = h('button', { class: 'btn small', type: 'button' }, 'Exécuter');
    c.appendChild(h('div', { class: 'controls' }, h('label', null, 'Opération', sel), h('label', null, 'val', inVal), h('label', null, 'pos', inPos), h('label', null, 'n', inN)));
    c.appendChild(h('div', { class: 'btn-row' }, btn));
    c.appendChild(cells); c.appendChild(read); c.appendChild(log);
    function num(inp) { return parseInt(inp.value, 10) || 0; }
    function grow(need) { if (need > cap) { const old = cap; cap = Math.max(need, cap * 2); if (old) say(`capacité dépassée : réallocation (${old} → ${cap}), copie des éléments, anciens itérateurs et pointeurs invalides`); } }
    function say(s) { log.textContent += s + '\n'; log.scrollTop = log.scrollHeight; }
    function draw() {
      cells.innerHTML = '';
      for (let i = 0; i < Math.max(cap, 1); i++) {
        const cell = h('div', { class: 'vcell' + (i < v.length ? '' : ' free') }, i < v.length ? String(v[i]) : (i < cap ? '' : ''));
        cell.appendChild(h('small', null, i < v.length ? `[${i}]` : ''));
        cells.appendChild(cell);
      }
      read.innerHTML = '';
      [['size()', v.length], ['capacity() (typique)', cap], ['empty()', v.length ? 'false' : 'true'], ['contenu', '{ ' + v.join(', ') + ' }']].forEach(([k, val]) => read.appendChild(h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, String(val)))));
    }
    btn.addEventListener('click', () => {
      const o = ops[sel.value];
      say('> ' + o[0].replace('val', inVal.value).replace('pos', inPos.value).replace(/\bn\b/, inN.value));
      try { o[1](); } catch (e) { say('   !! ' + e); }
      draw();
    });
    draw();
  }

  /* ===================== 8. Laboratoire d'algorithmes STL ===================== */
  function widgetStlLab(c) {
    const inVals = h('input', { type: 'text', value: '5 3 8 1 9 2 7 3' });
    const inX = h('input', { type: 'number', value: 4 });
    const ALGS = [
      ['sort(v.begin(), v.end());', 'Tri croissant (operator< du type)', a => a.slice().sort((p, q) => p - q)],
      ['sort(v.begin(), v.end(), greater<int>());', 'Tri décroissant avec le foncteur greater', a => a.slice().sort((p, q) => q - p)],
      ['sort(v.begin(), v.end(), [](int a, int b) { return abs(a - X) < abs(b - X); });', 'Tri avec une lambda : du plus proche de X au plus éloigné', (a, x) => a.slice().sort((p, q) => Math.abs(p - x) - Math.abs(q - x))],
      ['reverse(v.begin(), v.end());', 'Inverse l\'ordre', a => a.slice().reverse()],
      ['auto it = find(v.begin(), v.end(), X);', 'Cherche la valeur X ; retourne un itérateur (v.end() si absent)', (a, x) => { const i = a.indexOf(x); return i < 0 ? 'v.end() (absent)' : `itérateur sur v[${i}] = ${a[i]}`; }],
      ['auto it = find_if(v.begin(), v.end(), [X](int n) { return n > X; });', 'Premier élément vérifiant le prédicat n > X (lambda capturant X)', (a, x) => { const i = a.findIndex(n => n > x); return i < 0 ? 'v.end() (aucun)' : `itérateur sur v[${i}] = ${a[i]}`; }],
      ['int n = count(v.begin(), v.end(), X);', 'Nombre d\'occurrences de X', (a, x) => a.filter(n => n === x).length],
      ['int n = count_if(v.begin(), v.end(), [](int n) { return n % 2 == 0; });', 'Nombre d\'éléments pairs', a => a.filter(n => n % 2 === 0).length],
      ['int s = accumulate(v.begin(), v.end(), 0);', 'Somme (en-tête <numeric>), 0 est la valeur initiale', a => a.reduce((s, n) => s + n, 0)],
      ['transform(v.begin(), v.end(), v.begin(), [](int n) { return n * 2; });', 'Applique une fonction à chaque élément (ici sur place)', a => a.map(n => n * 2)],
      ['v.erase(remove_if(v.begin(), v.end(), [](int n) { return n % 2 == 1; }), v.end());', 'Idiome erase-remove : enlève les impairs (remove_if ne change pas la taille, erase si)', a => a.filter(n => n % 2 === 0)],
      ['auto it = min_element(v.begin(), v.end());  auto jt = max_element(v.begin(), v.end());', 'Itérateurs sur le minimum et le maximum', a => `min = ${Math.min(...a)}, max = ${Math.max(...a)}`],
      ['bool b = any_of(v.begin(), v.end(), [X](int n) { return n > X; });', 'Vrai si au moins un élément > X (all_of, none_of existent aussi)', (a, x) => a.some(n => n > x) ? 'true' : 'false'],
      ['for_each(v.begin(), v.end(), [](int n) { cout << n << " "; });', 'Applique une lambda à chaque élément (ici : affichage)', a => a.join(' ')],
      ['sort(v.begin(), v.end());  v.erase(unique(v.begin(), v.end()), v.end());', 'Supprime les doublons (unique ne retire que les doublons consécutifs : trier d\'abord)', a => Array.from(new Set(a)).sort((p, q) => p - q)],
      ['copy(v.begin(), v.end(), ostream_iterator<int>(cout, " "));', 'Copie vers le flux de sortie : affiche les éléments séparés par un espace', a => a.join(' ')],
      ['auto it = lower_bound(v.begin(), v.end(), X);   // v triée', 'Recherche dichotomique dans un vecteur trié : premier élément >= X', (a, x) => { const s = a.slice().sort((p, q) => p - q); const i = s.findIndex(n => n >= x); return `v triée = { ${s.join(', ')} } ; ` + (i < 0 ? 'v.end()' : `itérateur sur v[${i}] = ${s[i]}`); }]
    ];
    const sel = h('select'); ALGS.forEach((a, i) => sel.appendChild(h('option', { value: i }, a[0])));
    const codeHolder = h('div'); const out = h('pre', { class: 'console', 'data-title': 'Résultat' }); const desc = h('p', { class: 'w-note' });
    c.appendChild(h('div', { class: 'controls' }, h('label', null, 'Valeurs de v (entiers séparés par des espaces)', inVals), h('label', null, 'X', inX), h('label', null, 'Algorithme', sel)));
    c.appendChild(desc); c.appendChild(codeHolder); c.appendChild(out);
    function update() {
      const a = inVals.value.split(/[\s,;]+/).filter(s => s.length).map(Number).filter(n => !isNaN(n));
      const x = parseInt(inX.value, 10) || 0;
      const [code, d, fn] = ALGS[sel.value];
      desc.textContent = d;
      codeHolder.innerHTML = ''; codeHolder.appendChild(codeBlock('#include <algorithm>\n#include <numeric>\nvector<int> v = { ' + a.join(', ') + ' };\nint X = ' + x + ';\n' + code.replace(/\bX\b/g, 'X')));
      const r = fn(a, x);
      out.textContent = Array.isArray(r) ? 'v = { ' + r.join(', ') + ' }' : String(r);
    }
    [inVals, inX, sel].forEach(el => { el.addEventListener('input', update); el.addEventListener('change', update); });
    update();
  }

  /* ===================== 9. Droits d'accès et héritage ===================== */
  function widgetAccess(c) {
    const sel = h('select', null, h('option', { value: 'public' }, 'class Derivee : public Base'), h('option', { value: 'protected' }, 'class Derivee : protected Base'), h('option', { value: 'private' }, 'class Derivee : private Base'));
    const table = h('table', { class: 'access-table' });
    const note = h('p', { class: 'w-note' });
    c.appendChild(h('div', { class: 'controls' }, h('label', null, 'Mode d\'héritage', sel)));
    c.appendChild(table); c.appendChild(note);
    function level(member, mode) {
      if (member === 'private') return null;
      const order = { public: 0, protected: 1, private: 2 };
      return order[member] > order[mode] ? member : mode;
    }
    function update() {
      const mode = sel.value;
      table.innerHTML = '';
      table.appendChild(h('thead', null, h('tr', null, h('th', null, 'Membre dans Base'), h('th', null, 'Niveau vu dans Derivee'), h('th', null, 'Utilisable dans les méthodes de Derivee ?'), h('th', null, 'Utilisable depuis main() via un objet Derivee ?'), h('th', null, 'Utilisable dans une classe dérivée de Derivee ?'))));
      const tb = h('tbody');
      ['public', 'protected', 'private'].forEach(m => {
        const lv = level(m, mode);
        tb.appendChild(h('tr', null, h('td', null, h('code', null, m + ':')), h('td', null, lv ? lv : 'inaccessible (reste privé à Base)'),
          h('td', { class: lv ? 'yes' : 'no' }, lv ? 'oui' : 'non'),
          h('td', { class: lv === 'public' ? 'yes' : 'no' }, lv === 'public' ? 'oui' : 'non'),
          h('td', { class: lv && lv !== 'private' ? 'yes' : 'no' }, lv && lv !== 'private' ? 'oui' : 'non')));
      });
      table.appendChild(tb);
      note.textContent = mode === 'public' ? 'Héritage public (le cas normal du cours, relation « est un ») : les membres gardent leur niveau. Les membres privés de Base sont hérités mais inaccessibles : Derivee doit passer par les méthodes publiques ou protégées de Base.'
        : 'Héritage ' + mode + ' : tout ce qui était plus accessible que « ' + mode + ' » devient « ' + mode + ' » dans Derivee. Un objet Derivee ne peut plus être utilisé comme un Base depuis l\'extérieur (la conversion implicite vers Base* n\'est plus permise hors de la classe).';
    }
    sel.addEventListener('change', update); update();
  }

  /* ===================== 10. Copie superficielle ou profonde ===================== */
  function widgetCopySim(c) {
    let state = null;
    const stack = h('div', { class: 'zone' }); const heap = h('div', { class: 'zone' });
    const log = h('div', { class: 'log' });
    const codeHolder = h('div');
    const btns = {
      shallow: h('button', { class: 'btn small', type: 'button' }, 'Tableau b = a;  (copie par défaut)'),
      deep: h('button', { class: 'btn small', type: 'button' }, 'Tableau b = a;  (constructeur de copie profond)'),
      mod: h('button', { class: 'btn secondary small', type: 'button' }, 'a.set(0, 99);'),
      killA: h('button', { class: 'btn secondary small', type: 'button' }, 'fin de portée de a (~Tableau)'),
      killB: h('button', { class: 'btn secondary small', type: 'button' }, 'fin de portée de b (~Tableau)'),
      reset: h('button', { class: 'btn secondary small', type: 'button' }, 'Réinitialiser')
    };
    c.appendChild(h('div', { class: 'btn-row' }, btns.shallow, btns.deep, btns.mod, btns.killA, btns.killB, btns.reset));
    c.appendChild(h('div', { class: 'mem' }, h('div', null, h('div', { class: 'zone-title' }, 'Pile'), stack), h('div', null, h('div', { class: 'zone-title' }, 'Tas (new int[3])'), heap)));
    c.appendChild(log); c.appendChild(codeHolder);
    function say(s) { log.textContent += s + '\n'; log.scrollTop = log.scrollHeight; }
    function reset() {
      state = { a: { alive: true, block: 1 }, b: null, blocks: { 1: { data: [1, 2, 3], freed: 0 } }, next: 2 };
      log.textContent = ''; say('Tableau a(3);   // a.donnees_ = new int[3] {1, 2, 3}');
      draw();
    }
    function draw() {
      stack.innerHTML = ''; heap.innerHTML = '';
      ['a', 'b'].forEach(v => {
        const o = state[v];
        if (!o) stack.appendChild(h('span', { class: 'cell null' }, `${v} : (pas encore déclaré)`));
        else stack.appendChild(h('span', { class: 'cell' + (o.alive ? '' : ' dead') }, `Tableau ${v}`, h('span', { class: 'arrow' }, `donnees_ → bloc n°${o.block}`)));
      });
      Object.entries(state.blocks).forEach(([id, b]) => heap.appendChild(h('span', { class: 'cell' + (b.freed ? ' dead' : '') }, `bloc n°${id} : { ${b.data.join(', ')} }`, b.freed ? h('span', { class: 'cnt' }, b.freed > 1 ? 'libéré ' + b.freed + ' fois !' : 'libéré') : null)));
      btns.shallow.disabled = btns.deep.disabled = !!state.b;
      btns.killA.disabled = !state.a.alive; btns.killB.disabled = !state.b || !state.b.alive;
    }
    btns.shallow.addEventListener('click', () => { state.b = { alive: true, block: state.a.block }; say('Tableau b = a;   // copie membre à membre : b.donnees_ = a.donnees_ (même adresse !)'); draw(); });
    btns.deep.addEventListener('click', () => { const id = state.next++; state.blocks[id] = { data: state.blocks[state.a.block].data.slice(), freed: 0 }; state.b = { alive: true, block: id }; say(`Tableau b = a;   // constructeur de copie : b.donnees_ = new int[3], puis copie des valeurs (bloc n°${id})`); draw(); });
    btns.mod.addEventListener('click', () => { if (!state.a.alive) { say('a est détruit : accès invalide'); return; } state.blocks[state.a.block].data[0] = 99; say('a.set(0, 99);' + (state.b && state.b.block === state.a.block ? '   // b[0] vaut aussi 99 : les deux objets partagent le même bloc' : '   // b n\'est pas affecté')); draw(); });
    btns.killA.addEventListener('click', () => { const b = state.blocks[state.a.block]; b.freed++; state.a.alive = false; say('~Tableau() de a : delete[] donnees_' + (b.freed > 1 ? '   // DOUBLE LIBÉRATION : plantage probable' : '') + (state.b && state.b.alive && state.b.block === state.a.block ? '   // b pointe maintenant un bloc libéré (pointeur pendant)' : '')); draw(); });
    btns.killB.addEventListener('click', () => { const b = state.blocks[state.b.block]; b.freed++; state.b.alive = false; say('~Tableau() de b : delete[] donnees_' + (b.freed > 1 ? '   // DOUBLE LIBÉRATION : plantage probable' : '')); draw(); });
    btns.reset.addEventListener('click', reset);
    codeHolder.appendChild(codeBlock('class Tableau {\npublic:\n    Tableau(int n) : taille_(n), donnees_(new int[n]) {}\n    ~Tableau() { delete[] donnees_; }\n    // Sans constructeur de copie : le compilateur copie taille_ et donnees_ tels quels.\n    // Avec : Tableau(const Tableau& autre) : taille_(autre.taille_), donnees_(new int[autre.taille_]) {\n    //            for (int i = 0; i < taille_; ++i) donnees_[i] = autre.donnees_[i]; }\nprivate:\n    int taille_;\n    int* donnees_;\n};'));
    reset();
  }

  /* ===================== 11. Simulateur d'exceptions ===================== */
  function widgetExceptionSim(c) {
    const THROWS = [
      ['throw 42;', 'int'], ['throw string("erreur");', 'string'], ['throw runtime_error("fichier absent");', 'runtime_error'],
      ['throw out_of_range("indice");', 'out_of_range'], ['throw MonException();   // dérive de exception', 'MonException'], ['(aucun throw)', null]
    ];
    const HANDLERS = [
      ['catch (int e)', t => t === 'int'],
      ['catch (const out_of_range& e)', t => t === 'out_of_range'],
      ['catch (const runtime_error& e)', t => t === 'runtime_error'],
      ['catch (const logic_error& e)', t => t === 'out_of_range'],
      ['catch (const exception& e)', t => ['runtime_error', 'out_of_range', 'MonException'].includes(t)],
      ['catch (...)', () => true]
    ];
    const selT = h('select'); THROWS.forEach((t, i) => selT.appendChild(h('option', { value: i }, t[0])));
    const checks = HANDLERS.map(([lab]) => h('input', { type: 'checkbox', checked: '' }));
    const list = h('div', { class: 'controls' }, checks.map((cb, i) => h('label', { style: 'flex-direction: row; align-items: center; gap: .5em' }, cb, h('code', null, HANDLERS[i][0]))));
    const codeHolder = h('div'); const verdict = h('div', { class: 'verdict' });
    c.appendChild(h('div', { class: 'controls' }, h('label', null, 'Instruction dans le bloc try', selT)));
    c.appendChild(h('p', { class: 'w-note' }, 'Blocs catch présents, dans cet ordre :')); c.appendChild(list); c.appendChild(codeHolder); c.appendChild(verdict);
    function update() {
      const t = THROWS[selT.value]; const active = HANDLERS.map((hd, i) => checks[i].checked ? hd : null);
      const lines = ['try {', '    cout << "avant" << endl;', '    ' + t[0], '    cout << "apres (dans le try)" << endl;', '}'];
      active.forEach(hd => { if (hd) lines.push(hd[0] + ' { cout << "' + hd[0].replace(/catch \(|\)/g, '').replace('const ', '').replace('& e', '') + '" << endl; }'); });
      lines.push('cout << "suite du programme" << endl;');
      codeHolder.innerHTML = ''; codeHolder.appendChild(codeBlock(lines.join('\n')));
      let out = ['avant'];
      if (!t[1]) { out.push('apres (dans le try)', 'suite du programme'); verdict.className = 'verdict ok'; verdict.innerHTML = `<div class="v-title">Affichage</div><pre class="console">${esc(out.join('\n'))}</pre><p>Aucune exception : le bloc try s'exécute en entier, les catch sont ignorés.</p>`; return; }
      const idx = active.findIndex(hd => hd && hd[1](t[1]));
      if (idx < 0) { verdict.className = 'verdict bad'; verdict.innerHTML = `<div class="v-title">Affichage</div><pre class="console">${esc(out.join('\n'))}</pre><p>Aucun catch ne correspond au type ${t[1]} : l'exception remonte à l'appelant. Si personne ne l'attrape, std::terminate() arrête le programme (« apres » et « suite du programme » ne s'affichent jamais).</p>`; return; }
      const chosen = active[idx][0];
      out.push(chosen.replace(/catch \(|\)/g, '').replace('const ', '').replace('& e', ''), 'suite du programme');
      const skipped = active.slice(0, idx).filter(Boolean).map(hd => hd[0]);
      verdict.className = 'verdict ok';
      verdict.innerHTML = `<div class="v-title">Affichage</div><pre class="console">${esc(out.join('\n'))}</pre><p>Le reste du bloc try est abandonné (« apres » n'est pas affiché). Les catch sont essayés <strong>dans l'ordre</strong> : le premier dont le type correspond (type exact, ou classe de base par référence) est exécuté : <code>${esc(chosen)}</code>${skipped.length ? ', après avoir ignoré ' + skipped.map(s => '<code>' + esc(s) + '</code>').join(', ') : ''}. Puis l'exécution continue après le dernier catch.</p>` + (idx > 0 && active.slice(0, idx).some(hd => hd && hd[0].includes('exception&')) ? '' : '') + ((chosen.includes('exception&') && active.slice(idx + 1).some(hd => hd && (hd[0].includes('runtime_error') || hd[0].includes('out_of_range')))) ? '<p class="w-note">Remarque : un catch plus spécifique placé après <code>catch (const exception&amp;)</code> n\'est jamais atteint (le compilateur avertit). Mettre toujours les classes dérivées avant les classes de base.</p>' : '');
    }
    selT.addEventListener('change', update); checks.forEach(cb => cb.addEventListener('change', update)); update();
  }

  /* ===================== Enregistrement ===================== */
  const REGISTRY = window.INF.widgets = Object.assign(window.INF.widgets || {}, {
    trace: widgetTrace, 'guess-output': widgetGuess, dispatch: widgetDispatch, cast: widgetCast, 'shared-sim': widgetSharedSim,
    overload: widgetOverload, 'vector-sim': widgetVectorSim, 'stl-lab': widgetStlLab, access: widgetAccess, 'copy-sim': widgetCopySim,
    'exception-sim': widgetExceptionSim
  });
  function initAll() {
    document.querySelectorAll('.widget[data-widget]').forEach(c => {
      if (c.dataset.ready) return;
      const f = REGISTRY[c.dataset.widget];
      if (!f) return;
      c.dataset.ready = '1';
      try { f(c); } catch (e) { console.error('Démo « ' + c.dataset.widget + ' » : ', e); }
    });
  }
  if (window.INF && window.INF.ready) initAll(); else document.addEventListener('inf:ready', initAll);
})();
