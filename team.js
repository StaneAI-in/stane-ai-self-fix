(function () {
  'use strict';

  // Shared team space for two people: tasks either person assigns to the other,
  // an ideas board and a shared expense tracker. Used by index.html (admin) and
  // team.html (partner). Data lives in team.json in a separate private repo, so the
  // partner's token never reaches the admin's personal data.
  var user = window.STANE_USER;
  var ROLE = user ? user.role : (document.body.dataset.role === 'member' ? 'member' : 'admin');
  var OTHER = ROLE === 'admin' ? 'member' : 'admin';
  // Divyanshu's view leaves out Mohit's own ideas, his own team tasks and the expenses he added.
  function hiddenFromMe(by) { return ROLE === 'admin' && by === 'member'; }
  var LOCAL_KEY = 'stane-team-v1';
  var TOKEN_KEY = 'stane-team-sync';
  var PERSONAL_SYNC_KEY = 'stane-selffix-sync';
  var API = 'https://api.github.com/repos/StaneAI-in/stane-ai-team-data/contents/team.json';
  var DEFAULT_NAMES = { admin: 'Divyanshu', member: 'Mohit' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  function $(id) { return document.getElementById(id); }
  var el = {
    chip: $('tmChip'), status: $('tmStatus'), form: $('tmForm'), token: $('tmToken'),
    syncNow: $('tmSyncNow'), syncOff: $('tmSyncOff'), tokenHint: $('tmTokenHint'),
    mine: $('tmMineList'), mineEmpty: $('tmMineEmpty'), mineDone: $('tmMineDoneList'), mineDoneEmpty: $('tmMineDoneEmpty'),
    sent: $('tmSentList'), sentEmpty: $('tmSentEmpty'), sentDone: $('tmSentDoneList'), sentDoneEmpty: $('tmSentDoneEmpty'),
    minePending: $('tmMinePending'), sentPending: $('tmSentPending'), hello: $('tmHello'),
    assignHead: $('tmAssignHead'), sentHead: $('tmSentHead'),
    assignForm: $('tmAssignForm'), assignText: $('tmAssignText'), assignDue: $('tmAssignDue'),
    assignTime: $('tmAssignTime'), assignNote: $('tmAssignNote'),
    namesForm: $('tmNamesForm'), nameAdmin: $('tmNameAdmin'), nameMember: $('tmNameMember'), namesMsg: $('tmNamesMsg'),
    ideas: { admin: $('tmIdeasAdmin'), member: $('tmIdeasMember') },
    ideaHead: { admin: $('tmIdeaHeadAdmin'), member: $('tmIdeaHeadMember') },
    ideaEmpty: { admin: $('tmIdeaEmptyAdmin'), member: $('tmIdeaEmptyMember') },
    ideaForm: { admin: $('tmIdeaFormAdmin'), member: $('tmIdeaFormMember') },
    ideaInput: { admin: $('tmIdeaInputAdmin'), member: $('tmIdeaInputMember') },
    ideaCat: { admin: $('tmIdeaCatAdmin'), member: $('tmIdeaCatMember') },
    ideaRemind: { admin: $('tmIdeaRemindAdmin'), member: $('tmIdeaRemindMember') },
    expForm: $('tmExpForm'), expAmount: $('tmExpAmount'), expWhat: $('tmExpWhat'), expDate: $('tmExpDate'), expFile: $('tmExpFile'),
    expPaidBy: $('tmExpPaidBy'), expSplit: $('tmExpSplit'), expMsg: $('tmExpMsg'),
    expBalance: $('tmExpBalance'), expBalanceSub: $('tmExpBalanceSub'), expMonth: $('tmExpMonth'),
    expMonthTitle: $('tmExpMonthTitle'), expPrev: $('tmExpPrev'), expNext: $('tmExpNext'),
    expTotal: $('tmExpTotal'), expPaidAdmin: $('tmExpPaidAdmin'), expPaidMember: $('tmExpPaidMember'),
    expPaidAdminLabel: $('tmExpPaidAdminLabel'), expPaidMemberLabel: $('tmExpPaidMemberLabel'),
    expList: $('tmExpList'), expEmpty: $('tmExpEmpty'),
    boardForm: $('tmBoardForm'), boardText: $('tmBoardText'), boardOwner: $('tmBoardOwner'), boardDue: $('tmBoardDue'),
    board: { todo: $('tmBoardTodo'), doing: $('tmBoardDoing'), done: $('tmBoardDone') },
    boardCount: { todo: $('tmBoardTodoCount'), doing: $('tmBoardDoingCount'), done: $('tmBoardDoneCount') },
    boardEmpty: { todo: $('tmBoardTodoEmpty'), doing: $('tmBoardDoingEmpty'), done: $('tmBoardDoneEmpty') },
    projForm: $('tmProjForm'), projName: $('tmProjName'), projNote: $('tmProjNote'),
    projList: $('tmProjList'), projEmpty: $('tmProjEmpty'), projCount: $('tmProjCount'),
    projView: $('tmProjView'), projHint: $('tmProjHint')
  };
  if (!el.mine) return;

  /* ---------------- helpers ---------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayKey() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function formatTime(t) {
    if (!t) return '';
    var p = t.split(':'), h = Number(p[0]);
    return (h % 12 || 12) + ':' + p[1] + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  function shortKey(key) {
    var p = key.split('-');
    return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1];
  }
  function shortStamp(ms) {
    var d = new Date(ms);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + formatTime(pad(d.getHours()) + ':' + pad(d.getMinutes()));
  }
  // Amounts are stored in paise (whole numbers) so totals never drift.
  function money(paise) {
    var r = Math.abs(paise) / 100;
    return '₹' + r.toLocaleString('en-IN', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function nameOf(who) { return state.names[who] || DEFAULT_NAMES[who]; }
  function armOrRun(btn, run) {
    if (btn.classList.contains('armed')) { run(); return; }
    btn.classList.add('armed');
    var original = btn.textContent;
    btn.textContent = 'Delete?';
    setTimeout(function () {
      if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = original; }
    }, 3000);
  }
  // Tasks made before two-way assigning existed were always admin -> partner.
  function fromOf(t) { return t.from || 'admin'; }
  function toOf(t) { return t.to || 'member'; }

  /* ---------------- state ---------------- */
  var PARTS = ['names', 'tasks', 'done', 'ideas', 'expenses', 'shared', 'sharedStatus',
    'projects', 'impl', 'remarks', 'vault', 'vaultMeta', 'links', 'docs', 'planSteps', 'planNotes', 'apiKeys', 'prompts', 'repos', 'employees', 'instaRefs', 'stamps'];
  function normalize(p) {
    var s = {};
    PARTS.forEach(function (k) { s[k] = isObj(p) && isObj(p[k]) ? p[k] : {}; });
    return s;
  }
  function load() {
    try { var raw = localStorage.getItem(LOCAL_KEY); if (raw) return normalize(JSON.parse(raw)); } catch (e) { /* start empty */ }
    return normalize(null);
  }
  var state = load();
  function saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ } }
  function stamp(key) { state.stamps[key] = Date.now(); }
  function save() { saveLocal(); scheduleSync(); }

  // Starting list of projects. Seeded with a tiny stamp, so any real change (an edit
  // or a delete) made on any device always wins over the seed. Raise SEED_STAMP when
  // the seed text changes, so untouched seeds pick up the new text.
  var SEED_STAMP = 6;       // projects
  var IMPL_SEED_STAMP = 3;  // implementation ideas
  var GH = 'https://github.com/StaneAI-in/';
  // id -> [type tag, repo link, live link]
  var DEFAULT_LINKS = {
    'seed-stane-ai': ['Desktop app', GH + 'staneai-model-arena', ''],
    'seed-staneai': ['Website', GH + 'StaneAi-website', 'https://staneai.in'],
    'seed-report-generator': ['Web app', '', ''],
    'seed-lead-hunter': ['Web app', GH + 'StaneAi-Lead_hunter', ''],
    'seed-self-fix': ['Web app', GH + 'stane-ai-self-fix', 'https://team.staneai.in/']
  };
  var DEFAULT_PROJECTS = [
    ['seed-stane-ai', 'Stane-AI',
      'StaneAI Model Arena (desktop app): a local Windows desktop AI chat app (Python + PySide6). The interface is built; ' +
      'connecting AI providers (Ollama, Gemini, OpenRouter) is the next step.'],
    ['seed-staneai', 'StaneAi',
      'The StaneAI company website: a responsive dark-theme landing page in plain HTML, CSS and JavaScript, ' +
      'with service pages and a blog.'],
    ['seed-report-generator', 'Stane AI REPORT_GENRATOR',
      'AI report generator (FastAPI): several connected AIs and APIs gather raw material on a topic, then a ' +
      'final AI writes a fixed-format report with summary, key findings, sentiment, trends and hashtags, exported as PDF.'],
    ['seed-lead-hunter', 'StaneAI-Lead-Hunter',
      'Finds freelance and contract software-development leads every few hours from free sources (job boards, ' +
      'Hacker News, alert emails, web search), has AI qualify them, and shows them in a dashboard to review and pitch.'],
    ['seed-self-fix', 'Stane AI SELF-FIX',
      'This app: personal calendar, daily tasks, streaks and English practice, plus the shared team space ' +
      'for tasks, ideas, expenses and projects.']
  ];
  // Starting implementation ideas for each seeded project (same stamp rule as above).
  var DEFAULT_IMPL = {
    'seed-stane-ai': [
      'Connect Ollama so local models can answer (Step 2 in the README)',
      'Add Google Gemini and OpenRouter as providers',
      'Arena mode: send one prompt to 2-3 models side by side and pick the best answer',
      'Save chat history locally (SQLite) with search',
      'Export a chat to Markdown or PDF'
    ],
    'seed-staneai': [
      'Replace the placeholder social links with the real profiles',
      'Working contact form that sends enquiries to email',
      'Portfolio / case studies page for finished apps',
      'Publish regular blog posts for SEO',
      'Run a Lighthouse audit and self-host the fonts for speed'
    ],
    'seed-report-generator': [
      'Save past reports with a history page and search',
      'Show which source each key finding came from',
      'Add charts for sentiment and trends in the PDF',
      'Schedule a weekly report on a saved topic',
      'Share a report by link or email'
    ],
    'seed-lead-hunter': [
      'Auto-draft a pitch for each qualified lead',
      'Instant phone alert (Telegram) for high-score leads',
      'Pipeline stages (new, pitched, replied, won) with win-rate stats',
      'Detect the same lead posted on several sources',
      'Weekly report of which sources bring the best leads'
    ],
    'seed-self-fix': [
      'Browser / phone reminders for tasks that are due',
      'Weekly summary of streaks, finished tasks and expenses',
      ['Progress bar on each project from its implementation statuses', 'done'],
      'Install on the phone as an app (PWA) with offline use',
      'Monthly expense chart'
    ]
  };
  function seedProjects() {
    var changed = false;
    DEFAULT_PROJECTS.forEach(function (p, i) {
      var key = 'p:' + p[0];
      if ((Number(state.stamps[key]) || 0) >= SEED_STAMP) return;
      var l = DEFAULT_LINKS[p[0]] || ['', '', ''];
      state.projects[p[0]] = { name: p[1], note: p[2], tag: l[0], repo: l[1], live: l[2], by: 'admin', created: i + 1 };
      state.stamps[key] = SEED_STAMP;
      changed = true;
    });
    Object.keys(DEFAULT_IMPL).forEach(function (pid) {
      if (!state.projects[pid]) return; // project was deleted
      DEFAULT_IMPL[pid].forEach(function (item, i) {
        var text = Array.isArray(item) ? item[0] : item, status = Array.isArray(item) ? item[1] : 'todo';
        var id = 'seed-im-' + pid.slice(5) + '-' + (i + 1), key = 'im:' + id;
        if ((Number(state.stamps[key]) || 0) >= IMPL_SEED_STAMP) return;
        state.impl[id] = { project: pid, text: text, status: status, by: 'admin', created: i + 1 };
        state.stamps[key] = IMPL_SEED_STAMP;
        changed = true;
      });
    });
    if (changed) saveLocal();
  }
  seedProjects();

  /* ---------------- merge (one atom per item, newest change wins) ---------------- */
  var PREFIX = { n: 'names', t: 'tasks', d: 'done', i: 'ideas', x: 'expenses', s: 'shared', ss: 'sharedStatus',
    p: 'projects', im: 'impl', r: 'remarks', v: 'vault', vm: 'vaultMeta', lk: 'links', dc: 'docs', ps: 'planSteps', pn: 'planNotes', ak: 'apiKeys', pm: 'prompts', gh: 'repos', em: 'employees', ig: 'instaRefs' };
  function atoms(s) {
    var m = {};
    Object.keys(PREFIX).forEach(function (p) {
      var part = s[PREFIX[p]];
      Object.keys(part).forEach(function (id) { if (part[id]) m[p + ':' + id] = part[id]; });
    });
    return m;
  }
  function build(m, stamps) {
    var s = normalize(null);
    Object.keys(m).sort().forEach(function (key) {
      var v = m[key];
      if (v === undefined || v === null) return;
      var i = key.indexOf(':'), part = PREFIX[key.slice(0, i)];
      if (part) s[part][key.slice(i + 1)] = v;
    });
    Object.keys(s.done).forEach(function (id) { if (!s.tasks[id]) delete s.done[id]; });
    Object.keys(s.sharedStatus).forEach(function (id) { if (!s.shared[id]) delete s.sharedStatus[id]; });
    Object.keys(s.impl).forEach(function (id) { if (!s.projects[s.impl[id].project]) delete s.impl[id]; });
    Object.keys(s.planSteps).forEach(function (id) { if (!s.ideas[s.planSteps[id].idea]) delete s.planSteps[id]; });
    Object.keys(s.planNotes).forEach(function (id) { if (!s.ideas[id]) delete s.planNotes[id]; });
    Object.keys(s.remarks).forEach(function (id) {
      var on = s.remarks[id].on;
      if (!s.tasks[on] && !s.shared[on]) delete s.remarks[id];
    });
    Object.keys(stamps).sort().forEach(function (k) { s.stamps[k] = stamps[k]; });
    return s;
  }
  function merge(local, remote) {
    var la = atoms(local), ra = atoms(remote), ls = local.stamps, rs = remote.stamps;
    var keys = {}, out = {}, st = {};
    [la, ra, ls, rs].forEach(function (o) { Object.keys(o).forEach(function (k) { keys[k] = true; }); });
    Object.keys(keys).forEach(function (k) {
      var a = Number(ls[k]) || 0, b = Number(rs[k]) || 0;
      if (b > a) { out[k] = ra[k]; st[k] = b; }
      else if (a > b) { out[k] = la[k]; st[k] = a; }
      else { out[k] = la[k] !== undefined ? la[k] : ra[k]; if (a) st[k] = a; }
    });
    return build(out, st);
  }
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  function canon(s) { return stable(build(atoms(s), s.stamps)); }

  /* ---------------- render: tasks ---------------- */
  function taskRow(id, t, doneAt, mine) {
    var li = document.createElement('li');
    li.className = 'team-task' + (doneAt ? ' done' : '');
    li.dataset.id = id;

    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!doneAt;
    box.setAttribute('aria-label', 'Mark done: ' + t.text);
    li.appendChild(box);

    var body = document.createElement('div');
    body.className = 'team-body';
    var text = document.createElement('span');
    text.className = 'text';
    text.textContent = t.text;
    body.appendChild(text);

    var meta = document.createElement('div');
    meta.className = 'team-meta';
    if (t.due) {
      var due = document.createElement('span');
      var overdue = !doneAt && t.due < todayKey();
      due.className = 'time-chip' + (overdue ? ' overdue' : '');
      due.textContent = (overdue ? 'Overdue · ' : 'Due ') + shortKey(t.due) + (t.time ? ', ' + formatTime(t.time) : '');
      meta.appendChild(due);
    } else if (t.time) {
      var tm = document.createElement('span');
      tm.className = 'time-chip';
      tm.textContent = formatTime(t.time);
      meta.appendChild(tm);
    }
    var info = document.createElement('span');
    info.textContent = (mine ? 'From ' + nameOf(fromOf(t)) + ' · ' : 'To ' + nameOf(toOf(t)) + ' · ') +
      (doneAt ? 'Done ' + shortStamp(doneAt) : 'Assigned ' + shortStamp(t.created));
    meta.appendChild(info);
    body.appendChild(meta);

    if (t.note) {
      var note = document.createElement('p');
      note.className = 'team-note';
      note.textContent = t.note;
      body.appendChild(note);
    }
    body.appendChild(remarksBlock(id));
    li.appendChild(body);

    if (fromOf(t) === ROLE || ROLE === 'admin') {
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Delete task: ' + t.text);
      li.appendChild(del);
    }
    return li;
  }

  function fillList(list, empty, ids, isDone, mine) {
    if (!list) return;
    list.textContent = '';
    ids.forEach(function (id) { list.appendChild(taskRow(id, state.tasks[id], isDone ? state.done[id] : 0, mine)); });
    if (empty) empty.hidden = ids.length > 0;
  }

  function renderTasks() {
    function byDue(a, b) {
      var x = state.tasks[a], y = state.tasks[b];
      var dx = (x.due || '9999') + (x.time || '99'), dy = (y.due || '9999') + (y.time || '99');
      return dx < dy ? -1 : dx > dy ? 1 : x.created - y.created;
    }
    function byDone(a, b) { return state.done[b] - state.done[a]; }
    var ids = Object.keys(state.tasks);
    var toMe = ids.filter(function (id) { return toOf(state.tasks[id]) === ROLE; });
    var byMe = ids.filter(function (id) { return fromOf(state.tasks[id]) === ROLE && toOf(state.tasks[id]) !== ROLE; });
    function open(id) { return !state.done[id]; }
    function closed(id) { return !!state.done[id]; }

    var minePending = toMe.filter(open).sort(byDue);
    var sentPending = byMe.filter(open).sort(byDue);
    fillList(el.mine, el.mineEmpty, minePending, false, true);
    fillList(el.mineDone, el.mineDoneEmpty, toMe.filter(closed).sort(byDone), true, true);
    fillList(el.sent, el.sentEmpty, sentPending, false, false);
    fillList(el.sentDone, el.sentDoneEmpty, byMe.filter(closed).sort(byDone), true, false);

    if (el.minePending) el.minePending.textContent = minePending.length;
    if (el.sentPending) el.sentPending.textContent = sentPending.length;
    if (el.assignHead) el.assignHead.textContent = 'Assign a task to ' + nameOf(OTHER);
    if (el.sentHead) el.sentHead.textContent = 'Assigned by you to ' + nameOf(OTHER);
  }

  /* ---------------- render: ideas ---------------- */
  var IDEA_CATS = { startup: 'Startup idea', app: 'App idea' };
  var ideaFilter = 'startup';
  var editingRemind = {};
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  // Reminders are kept as local "YYYY-MM-DDTHH:MM" strings (what <input type="datetime-local"> gives).
  function localStamp(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function remindLabel(r) { return shortKey(r.slice(0, 10)) + ', ' + formatTime(r.slice(11, 16)); }
  function isDue(idea) { return !!(idea.remind && !idea.reminded && idea.remind <= localStamp(new Date())); }

  function renderIdeas() {
    var filterBtns = document.querySelectorAll('.idea-filter button[data-cat]');
    filterBtns.forEach(function (b) {
      var on = b.dataset.cat === ideaFilter;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    ['admin', 'member'].forEach(function (who) {
      if (!el.ideas[who]) return;
      var ownCol = el.ideas[who].closest('.idea-col');
      if (ownCol) ownCol.hidden = hiddenFromMe(who);
      if (hiddenFromMe(who)) return;
      el.ideaHead[who].textContent = nameOf(who) + (who === ROLE ? ' (you)' : '');
      var ids = Object.keys(state.ideas).filter(function (id) {
        var idea = state.ideas[id];
        return idea.by === who && catOf(idea) === ideaFilter;
      }).sort(function (a, b) { return state.ideas[b].created - state.ideas[a].created; });
      var list = el.ideas[who];
      list.textContent = '';
      ids.forEach(function (id) {
        var idea = state.ideas[id];
        var li = document.createElement('li');
        li.dataset.id = id;
        if (isDue(idea) && idea.by === ROLE) li.className = 'due';
        var cat = document.createElement('span');
        cat.className = 'idea-cat ' + catOf(idea);
        cat.textContent = IDEA_CATS[catOf(idea)];
        li.appendChild(cat);
        var text = document.createElement('p');
        text.className = 'idea-text';
        text.textContent = idea.text;
        li.appendChild(text);

        var pc = planCounts(id);
        var openRow = document.createElement('div');
        openRow.className = 'idea-open-row';
        var ob = document.createElement('button');
        ob.type = 'button';
        ob.className = 'primary-btn idea-open';
        ob.textContent = pc.total ? 'Open plan' : 'Open & plan';
        openRow.appendChild(ob);
        if (pc.total) {
          var pchip = document.createElement('span');
          pchip.className = 'plan-chip';
          pchip.textContent = pc.done + '/' + pc.total + ' steps done';
          openRow.appendChild(pchip);
        }
        li.appendChild(openRow);

        var foot = document.createElement('div');
        foot.className = 'idea-foot';
        var when = document.createElement('span');
        when.textContent = shortStamp(idea.created);
        foot.appendChild(when);
        var tools = document.createElement('span');
        tools.className = 'idea-tools';
        if (idea.remind) {
          var chip = document.createElement('span');
          chip.className = 'time-chip remind-chip' + (isDue(idea) ? ' overdue' : idea.reminded ? ' past' : '');
          chip.textContent = '⏰ ' + remindLabel(idea.remind);
          tools.appendChild(chip);
        }
        if (who === ROLE) {
          var rb = document.createElement('button');
          rb.type = 'button';
          rb.className = 'mini-btn remind-edit';
          rb.textContent = idea.remind ? 'Change reminder' : 'Set reminder';
          tools.appendChild(rb);
        }
        if (who === ROLE || ROLE === 'admin') {
          var del = document.createElement('button');
          del.type = 'button';
          del.className = 'del';
          del.textContent = '✕';
          del.setAttribute('aria-label', 'Delete idea');
          tools.appendChild(del);
        }
        foot.appendChild(tools);
        li.appendChild(foot);

        if (who === ROLE && editingRemind[id]) {
          var form = document.createElement('form');
          form.className = 'remind-form';
          var input = document.createElement('input');
          input.type = 'datetime-local';
          input.required = true;
          input.setAttribute('aria-label', 'Reminder date and time');
          input.value = idea.remind || '';
          form.appendChild(input);
          var saveBtn = document.createElement('button');
          saveBtn.type = 'submit';
          saveBtn.className = 'mini-btn';
          saveBtn.textContent = 'Save';
          form.appendChild(saveBtn);
          if (idea.remind) {
            var clear = document.createElement('button');
            clear.type = 'button';
            clear.className = 'mini-btn remind-clear';
            clear.textContent = 'Remove';
            form.appendChild(clear);
          }
          li.appendChild(form);
        }
        list.appendChild(li);
      });
      el.ideaEmpty[who].hidden = ids.length > 0;
      if (el.ideaForm[who]) el.ideaForm[who].hidden = who !== ROLE;
      var col = el.ideas[who].closest('.idea-col');
      if (col) col.classList.toggle('mine', who === ROLE);
    });
    renderReminders();
    renderPlan();
  }

  /* ---------------- idea plan: open an idea and plan how to build it ---------------- */
  var openIdeaId = '';
  var planBox = null;
  function catOf(idea) { return idea.cat === 'app' ? 'app' : 'startup'; }   // ideas made before types existed count as startup ideas
  function planStepIds(ideaId) {
    return Object.keys(state.planSteps).filter(function (id) { return state.planSteps[id].idea === ideaId; })
      .sort(function (a, b) { return state.planSteps[a].created - state.planSteps[b].created; });
  }
  function planCounts(ideaId) {
    var ids = planStepIds(ideaId), done = 0;
    ids.forEach(function (id) { if (state.planSteps[id].done) done++; });
    return { total: ids.length, done: done };
  }
  function dropPlan(ideaId) {
    planStepIds(ideaId).forEach(function (sid) { delete state.planSteps[sid]; stamp('ps:' + sid); });
    if (state.planNotes[ideaId]) { delete state.planNotes[ideaId]; stamp('pn:' + ideaId); }
  }
  function closePlan() {
    openIdeaId = '';
    if (planBox) planBox.hidden = true;
    document.documentElement.classList.remove('modal-open');
  }
  function openPlan(id) {
    openIdeaId = id;
    renderPlan();
    var first = planBox && planBox.querySelector('[data-draft="ps:' + id + '"]');
    if (first) first.focus();
  }
  function renderPlan() {
    var idea = openIdeaId && state.ideas[openIdeaId];
    if (!idea) { if (openIdeaId) closePlan(); return; }
    var id = openIdeaId;
    if (!planBox) {
      planBox = document.createElement('div');
      planBox.className = 'plan-shade';
      planBox.addEventListener('click', onPlanClick);
      planBox.addEventListener('change', onPlanChange);
      planBox.addEventListener('submit', onPlanSubmit);
      document.body.appendChild(planBox);
    }
    planBox.textContent = '';
    planBox.hidden = false;
    document.documentElement.classList.add('modal-open');

    var card = document.createElement('section');
    card.className = 'card plan-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Plan for this idea');

    var top = document.createElement('div');
    top.className = 'plan-top';
    var cat = document.createElement('span');
    cat.className = 'idea-cat ' + catOf(idea);
    cat.textContent = IDEA_CATS[catOf(idea)];
    top.appendChild(cat);
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'del plan-close';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Close');
    top.appendChild(x);
    card.appendChild(top);

    var h = document.createElement('h2');
    h.className = 'plan-title';
    h.textContent = idea.text;
    card.appendChild(h);
    var meta = document.createElement('p');
    meta.className = 'hint';
    meta.textContent = 'Idea by ' + nameOf(idea.by) + ' · ' + shortStamp(idea.created);
    card.appendChild(meta);

    var c = planCounts(id);
    var pct = c.total ? Math.round(c.done / c.total * 100) : 0;
    var bar = document.createElement('div');
    bar.className = 'progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(pct));
    var fill = document.createElement('div');
    fill.className = 'progress-bar';
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    card.appendChild(bar);
    var pt = document.createElement('p');
    pt.className = 'progress-text';
    pt.textContent = c.total ? pct + '% · ' + c.done + ' of ' + c.total + ' steps done' : 'No steps yet. Break the idea into steps below.';
    card.appendChild(pt);

    var h3 = document.createElement('h3');
    h3.textContent = 'Plan to build it';
    card.appendChild(h3);
    var ids = planStepIds(id);
    if (ids.length) {
      var ul = document.createElement('ul');
      ul.className = 'tasks plan-steps';
      ids.forEach(function (sid, i) {
        var st = state.planSteps[sid];
        var li = document.createElement('li');
        li.className = st.done ? 'done' : '';
        li.dataset.sid = sid;
        var box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = !!st.done;
        box.setAttribute('aria-label', 'Step done: ' + st.text);
        li.appendChild(box);
        var num = document.createElement('span');
        num.className = 'plan-num';
        num.textContent = (i + 1) + '.';
        li.appendChild(num);
        var t = document.createElement('span');
        t.className = 'text';
        t.textContent = st.text;
        li.appendChild(t);
        li.appendChild(delButton('plan-step-del', 'Delete step: ' + st.text));
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }
    var add = document.createElement('form');
    add.className = 'add plan-add';
    add.autocomplete = 'off';
    add.appendChild(draftInput('ps:' + id, 'Next step, e.g. Talk to 10 possible customers', 'New plan step', 200));
    var ab = document.createElement('button');
    ab.type = 'submit';
    ab.textContent = 'Add step';
    add.appendChild(ab);
    card.appendChild(add);

    var h3b = document.createElement('h3');
    h3b.textContent = 'Plan notes';
    card.appendChild(h3b);
    var note = state.planNotes[id];
    var nf = document.createElement('form');
    nf.className = 'plan-note-form';
    var ta = document.createElement('textarea');
    ta.rows = 5;
    ta.maxLength = 5000;
    ta.placeholder = 'Target users, features, tech stack, budget, timeline, how it makes money…';
    ta.setAttribute('aria-label', 'Plan notes');
    ta.dataset.draft = 'pn:' + id;
    ta.value = drafts['pn:' + id] !== undefined ? drafts['pn:' + id] : (note ? note.text : '');
    nf.appendChild(ta);
    var row = document.createElement('div');
    row.className = 'form-row';
    var sb = document.createElement('button');
    sb.type = 'submit';
    sb.className = 'primary-btn';
    sb.textContent = 'Save notes';
    row.appendChild(sb);
    if (note && note.at) {
      var saved = document.createElement('span');
      saved.className = 'hint';
      saved.textContent = 'Last saved by ' + nameOf(note.by) + ' · ' + shortStamp(note.at);
      row.appendChild(saved);
    }
    nf.appendChild(row);
    card.appendChild(nf);

    planBox.appendChild(card);
  }
  function onPlanClick(e) {
    if (e.target === planBox || e.target.closest('.plan-close')) { closePlan(); return; }
    var del = e.target.closest('.plan-step-del');
    if (!del) return;
    var sid = del.closest('li').dataset.sid;
    armOrRun(del, function () {
      delete state.planSteps[sid];
      stamp('ps:' + sid);
      save();
      render();
    });
  }
  function onPlanChange(e) {
    if (e.target.type !== 'checkbox') return;
    var sid = e.target.closest('li').dataset.sid, st = state.planSteps[sid];
    if (!st) return;
    var next = {};
    Object.keys(st).forEach(function (k) { next[k] = st[k]; });
    next.done = e.target.checked ? Date.now() : 0;
    next.doneBy = ROLE;
    state.planSteps[sid] = next;
    stamp('ps:' + sid);
    save();
    render();
  }
  function onPlanSubmit(e) {
    e.preventDefault();
    var id = openIdeaId;
    if (!id || !state.ideas[id]) return;
    if (e.target.classList.contains('plan-add')) {
      var input = e.target.querySelector('input');
      var text = input.value.trim();
      if (!text) return;
      var sid = newId();
      state.planSteps[sid] = { idea: id, text: text, done: 0, by: ROLE, created: Date.now() };
      stamp('ps:' + sid);
      delete drafts['ps:' + id];
      input.value = '';
      save();
      render();
      var again = planBox.querySelector('[data-draft="ps:' + id + '"]');
      if (again) again.focus();
    } else if (e.target.classList.contains('plan-note-form')) {
      state.planNotes[id] = { text: e.target.querySelector('textarea').value.trim(), by: ROLE, at: Date.now() };
      stamp('pn:' + id);
      delete drafts['pn:' + id];
      save();
      render();
    }
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openIdeaId) closePlan(); });

  /* ---------------- reminders: popup + browser notification ---------------- */
  var notified = {};   // reminders already sent as a browser notification in this visit
  var pop = null;
  function ideasTabButton() { return document.querySelector('[aria-controls="tabIdeas"]'); }
  function dueIds() {
    return Object.keys(state.ideas).filter(function (id) {
      var idea = state.ideas[id];
      return idea.by === ROLE && isDue(idea);
    }).sort(function (a, b) { return state.ideas[a].remind < state.ideas[b].remind ? -1 : 1; });
  }
  function askNotifyPermission() {
    try {
      if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
    } catch (e) { /* not supported */ }
  }
  function renderReminders() {
    var ids = dueIds();
    var tab = ideasTabButton();
    if (tab) {
      var badge = tab.querySelector('.tab-badge');
      if (ids.length) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'tab-badge'; tab.appendChild(badge); }
        badge.textContent = ids.length;
      } else if (badge) badge.remove();
    }
    if (!ids.length) { if (pop) pop.hidden = true; return; }
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'remind-pop';
      pop.setAttribute('role', 'alertdialog');
      pop.setAttribute('aria-label', 'Idea reminders');
      document.body.appendChild(pop);
      pop.addEventListener('click', onPopClick);
    }
    pop.textContent = '';
    var h = document.createElement('h2');
    h.textContent = ids.length === 1 ? 'Reminder' : ids.length + ' reminders';
    pop.appendChild(h);
    var ul = document.createElement('ul');
    ids.forEach(function (id) {
      var idea = state.ideas[id];
      var li = document.createElement('li');
      li.dataset.id = id;
      if (IDEA_CATS[idea.cat]) {
        var cat = document.createElement('span');
        cat.className = 'idea-cat ' + idea.cat;
        cat.textContent = IDEA_CATS[idea.cat];
        li.appendChild(cat);
      }
      var t = document.createElement('p');
      t.className = 'idea-text';
      t.textContent = idea.text;
      li.appendChild(t);
      var row = document.createElement('div');
      row.className = 'form-row';
      var done = document.createElement('button');
      done.type = 'button';
      done.className = 'primary-btn pop-done';
      done.textContent = 'Done';
      var snooze = document.createElement('button');
      snooze.type = 'button';
      snooze.className = 'ghost-btn pop-snooze';
      snooze.textContent = 'Remind in 1 hour';
      row.appendChild(done);
      row.appendChild(snooze);
      li.appendChild(row);
      ul.appendChild(li);

      if (!notified[id]) {
        notified[id] = true;
        try {
          if (window.Notification && Notification.permission === 'granted') {
            new Notification((IDEA_CATS[idea.cat] || 'Idea') + ' reminder', { body: idea.text.slice(0, 180), tag: 'idea-' + id });
          }
        } catch (e) { /* some phones only allow notifications from an installed app */ }
      }
    });
    pop.appendChild(ul);
    pop.hidden = false;
  }
  function updateIdea(id, changes) {
    var idea = state.ideas[id];
    if (!idea) return;
    var next = {};
    Object.keys(idea).forEach(function (k) { next[k] = idea[k]; });
    Object.keys(changes).forEach(function (k) { next[k] = changes[k]; });
    state.ideas[id] = next;
    stamp('i:' + id);
    save();
    render();
  }
  function onPopClick(e) {
    var li = e.target.closest('li');
    if (!li) return;
    var id = li.dataset.id;
    if (e.target.closest('.pop-done')) updateIdea(id, { reminded: true });
    else if (e.target.closest('.pop-snooze')) {
      delete notified[id];
      updateIdea(id, { remind: localStamp(new Date(Date.now() + 60 * 60 * 1000)), reminded: false });
    }
  }
  setInterval(renderReminders, 30000);

  /* ---------------- render: expenses ---------------- */
  // How much of an expense the payer covered for the other person.
  // Partners decided: Divyanshu (admin) carries 60%, Mohit (member) 40%.
  var PARTNER_SHARE = { admin: 60, member: 40 };
  var SPLITS = ['half', 'partners', 'payer', 'other', 'settle'];
  function owedToPayer(x) {
    if (x.split === 'payer') return 0;
    if (x.split === 'other' || x.split === 'settle') return x.amount;
    if (x.split === 'partners') {
      var other = x.paidBy === 'admin' ? 'member' : 'admin';
      return Math.round(x.amount * PARTNER_SHARE[other] / 100);
    }
    return Math.round(x.amount / 2);
  }
  function splitLabel(x) {
    var other = x.paidBy === 'admin' ? 'member' : 'admin';
    if (x.split === 'payer') return 'Only for ' + nameOf(x.paidBy);
    if (x.split === 'other') return 'Fully for ' + nameOf(other);
    if (x.split === 'settle') return 'Paid back to ' + nameOf(other);
    if (x.split === 'partners') return 'Partners decided (' + nameOf('admin') + ' ' + PARTNER_SHARE.admin + '% · ' +
      nameOf('member') + ' ' + PARTNER_SHARE.member + '%)';
    return 'Split equally';
  }
  // Each person's share of an expense, in paise (sums exactly to the amount).
  function sharesOf(x) {
    var payer = x.paidBy, other = payer === 'admin' ? 'member' : 'admin';
    var s = {};
    s[other] = x.split === 'settle' ? 0 : owedToPayer(x);
    s[payer] = x.split === 'settle' ? 0 : x.amount - s[other];
    return s;
  }

  /* ----- downloadable receipt (PNG) for one expense ----- */
  var receiptLogo = null;
  function loadReceiptLogo() {
    if (receiptLogo) return receiptLogo;
    receiptLogo = new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = 'logo-icon.png';
    });
    return receiptLogo;
  }
  function longDate(key) {
    var p = String(key || '').split('-');
    if (p.length !== 3) return key || '';
    return Number(p[2]) + ' ' + LONG_MONTHS[Number(p[1]) - 1] + ' ' + p[0];
  }
  function receiptNo(id, x) {
    return 'STN-' + String(x.date || '').replace(/-/g, '') + '-' + String(id).slice(-5).toUpperCase();
  }
  function receiptRows(id, x) {
    var rows = [
      ['Receipt no.', receiptNo(id, x)],
      ['Date', longDate(x.date)],
      ['What for', x.what],
      ['Paid by', nameOf(x.paidBy)],
      ['How it is split', splitLabel(x)]
    ];
    if (x.split !== 'settle') {
      var s = sharesOf(x);
      rows.push([nameOf('admin') + "'s share", money(s.admin)]);
      rows.push([nameOf('member') + "'s share", money(s.member)]);
    }
    rows.push(['Added by', nameOf(x.by) + (x.created ? ' · ' + shortStamp(x.created) : '')]);
    return rows;
  }
  function wrapLines(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }
  function downloadReceipt(id, format) {
    var x = state.expenses[id];
    if (!x) return;
    loadReceiptLogo().then(function (logo) {
      var W = 800, pad = 56, scale = 2, font = '"Instrument Sans", system-ui, sans-serif';
      var rows = receiptRows(id, x);
      var cv = document.createElement('canvas');
      var ctx = cv.getContext('2d');
      ctx.font = '500 22px ' + font;
      var valW = W - pad * 2 - 230;
      var wrapped = rows.map(function (r) { return wrapLines(ctx, r[1], valW); });
      var bodyH = wrapped.reduce(function (h, l) { return h + l.length * 30 + 22; }, 0);
      var H = 300 + bodyH + 120;
      cv.width = W * scale; cv.height = H * scale;
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#4f46e5'; ctx.fillRect(0, 0, W, 8);
      var y = 56;
      if (logo) ctx.drawImage(logo, pad, y, 52, 52);
      ctx.fillStyle = '#111827'; ctx.textBaseline = 'middle';
      ctx.font = '700 28px ' + font;
      ctx.fillText('Stane AI', pad + (logo ? 68 : 0), y + 18);
      ctx.font = '400 18px ' + font; ctx.fillStyle = '#6b7280';
      ctx.fillText(x.split === 'settle' ? 'Repayment receipt' : 'Expense receipt', pad + (logo ? 68 : 0), y + 44);
      ctx.textAlign = 'right'; ctx.font = '700 34px ' + font; ctx.fillStyle = '#111827';
      ctx.fillText(money(x.amount), W - pad, y + 26);
      ctx.textAlign = 'left';
      y = 160;
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
      y += 36;
      ctx.textBaseline = 'alphabetic';
      rows.forEach(function (r, i) {
        ctx.font = '400 20px ' + font; ctx.fillStyle = '#6b7280';
        ctx.fillText(r[0], pad, y);
        ctx.font = '500 22px ' + font; ctx.fillStyle = '#111827';
        wrapped[i].forEach(function (line, j) { ctx.fillText(line, pad + 230, y + j * 30); });
        y += wrapped[i].length * 30 + 22;
      });
      y += 10;
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
      y += 44;
      ctx.font = '700 24px ' + font; ctx.fillStyle = '#111827';
      ctx.fillText('Total', pad, y);
      ctx.textAlign = 'right'; ctx.fillText(money(x.amount), W - pad, y); ctx.textAlign = 'left';
      ctx.font = '400 15px ' + font; ctx.fillStyle = '#9ca3af';
      ctx.fillText('Generated ' + shortStamp(Date.now()) + ' from the Stane AI team app.', pad, H - 36);
      var name = 'Receipt-' + receiptNo(id, x);
      if (format === 'pdf') {
        cv.toBlob(function (jpg) {
          if (!jpg) return;
          jpg.arrayBuffer().then(function (buf) {
            saveBlob(name + '.pdf', jpegToPdf(new Uint8Array(buf), cv.width, cv.height, W, H));
          });
        }, 'image/jpeg', 0.95);
      } else {
        cv.toBlob(function (blob) { if (blob) saveBlob(name + '.png', blob); }, 'image/png');
      }
    });
  }
  function saveBlob(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  // A one-page PDF holding a JPEG image (pxW x pxH pixels) drawn at ptW x ptH points.
  // Hand-built so no PDF library is needed; JPEG goes in as-is via DCTDecode.
  function jpegToPdf(jpg, pxW, pxH, ptW, ptH) {
    var enc = function (s) {
      var b = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
      return b;
    };
    var draw = 'q ' + ptW + ' 0 0 ' + ptH + ' 0 0 cm /Im0 Do Q';
    var objs = [
      ['<< /Type /Catalog /Pages 2 0 R >>'],
      ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
      ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + ptW + ' ' + ptH + '] ' +
        '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'],
      ['<< /Type /XObject /Subtype /Image /Width ' + pxW + ' /Height ' + pxH +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n', jpg, '\nendstream'],
      ['<< /Length ' + draw.length + ' >>\nstream\n' + draw + '\nendstream']
    ];
    var parts = [enc('%PDF-1.4\n')], offset = 9, offsets = [];
    objs.forEach(function (o, i) {
      offsets.push(offset);
      var chunk = [enc((i + 1) + ' 0 obj\n')];
      o.forEach(function (p) { chunk.push(typeof p === 'string' ? enc(p) : p); });
      chunk.push(enc('\nendobj\n'));
      chunk.forEach(function (c) { parts.push(c); offset += c.length; });
    });
    var xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' +
      offsets.map(function (n) { return ('000000000' + n).slice(-10) + ' 00000 n \n'; }).join('') +
      'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + offset + '\n%%EOF\n';
    parts.push(enc(xref));
    return new Blob(parts, { type: 'application/pdf' });
  }

  var expView = todayKey().slice(0, 7);

  function renderExpenses() {
    if (!el.expList) return;
    if (el.expPaidBy) {
      el.expPaidBy.options[0].textContent = nameOf('admin') + (ROLE === 'admin' ? ' (you)' : '');
      el.expPaidBy.options[1].textContent = nameOf('member') + (ROLE === 'member' ? ' (you)' : '');
    }
    if (el.expSplit) {
      var payer = el.expPaidBy ? el.expPaidBy.value : ROLE;
      var opt = function (v) { return el.expSplit.querySelector('option[value="' + v + '"]') || {}; };
      opt('partners').textContent = 'Partners decided (' + nameOf('admin') + ' ' + PARTNER_SHARE.admin + '% · ' +
        nameOf('member') + ' ' + PARTNER_SHARE.member + '%)';
      opt('payer').textContent = 'Only for ' + nameOf(payer) + ' (personal)';
      var payee = nameOf(payer === 'admin' ? 'member' : 'admin');
      opt('other').textContent = 'Fully for ' + payee;
      opt('settle').textContent = 'Paying back money owed to ' + payee;
    }

    var ids = Object.keys(state.expenses);
    // All-time balance: positive means the partner owes the admin.
    var net = 0;
    ids.forEach(function (id) {
      var x = state.expenses[id];
      var o = owedToPayer(x);
      net += x.paidBy === 'admin' ? o : -o;
    });
    if (!net) {
      el.expBalance.textContent = 'All settled';
      el.expBalanceSub.textContent = 'Nobody owes anything right now.';
    } else {
      var debtor = net > 0 ? 'member' : 'admin', creditor = net > 0 ? 'admin' : 'member';
      el.expBalance.textContent = (debtor === ROLE ? 'You owe ' : nameOf(debtor) + ' owes ') +
        (creditor === ROLE ? 'you ' : nameOf(creditor) + ' ') + money(net);
      el.expBalanceSub.textContent = 'When the money is returned, add it with "Paying back".';
    }

    var p = expView.split('-');
    el.expMonthTitle.textContent = LONG_MONTHS[Number(p[1]) - 1] + ' ' + p[0];
    var monthIds = ids.filter(function (id) { return (state.expenses[id].date || '').slice(0, 7) === expView && !hiddenFromMe(state.expenses[id].by); })
      .sort(function (a, b) {
        var x = state.expenses[a], y = state.expenses[b];
        return x.date < y.date ? 1 : x.date > y.date ? -1 : y.created - x.created;
      });
    var total = 0, paid = { admin: 0, member: 0 };
    monthIds.forEach(function (id) {
      var x = state.expenses[id];
      if (x.split === 'settle') return; // repayments are not spending
      total += x.amount;
      paid[x.paidBy] += x.amount;
    });
    el.expTotal.textContent = money(total);
    el.expPaidAdmin.textContent = money(paid.admin);
    el.expPaidMember.textContent = money(paid.member);
    el.expPaidAdminLabel.textContent = 'paid by ' + nameOf('admin');
    el.expPaidMemberLabel.textContent = 'paid by ' + nameOf('member');

    el.expList.textContent = '';
    monthIds.forEach(function (id) {
      var x = state.expenses[id];
      var li = document.createElement('li');
      li.dataset.id = id;
      var body = document.createElement('div');
      body.className = 'team-body';
      var what = document.createElement('span');
      what.className = 'text';
      what.textContent = x.what;
      var meta = document.createElement('div');
      meta.className = 'team-meta';
      meta.textContent = shortKey(x.date) + ' · Paid by ' + nameOf(x.paidBy) + ' · ' + splitLabel(x);
      body.appendChild(what);
      body.appendChild(meta);
      var amt = document.createElement('span');
      amt.className = 'exp-amount ' + x.paidBy;
      amt.textContent = money(x.amount);
      li.appendChild(body);
      li.appendChild(amt);
      if (x.receipt && x.receipt.path) {
        // An uploaded bill replaces the generated receipt.
        var isPdf = /pdf/i.test(x.receipt.mime || '') || /\.pdf$/i.test(x.receipt.name || '');
        li.appendChild(miniBtn('exp-bill', isPdf ? 'Bill PDF' : 'Bill image', id, 'Download uploaded bill: ' + x.what));
      } else {
        var pdfBtn = miniBtn('exp-receipt', 'PDF', id, 'Download receipt as PDF: ' + x.what);
        pdfBtn.dataset.format = 'pdf';
        var pngBtn = miniBtn('exp-receipt', 'PNG', id, 'Download receipt as image: ' + x.what);
        pngBtn.dataset.format = 'png';
        li.appendChild(pdfBtn);
        li.appendChild(pngBtn);
      }
      if (x.by === ROLE || ROLE === 'admin') {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'del';
        del.textContent = '✕';
        del.setAttribute('aria-label', 'Delete expense: ' + x.what);
        li.appendChild(del);
      }
      el.expList.appendChild(li);
    });
    el.expEmpty.hidden = monthIds.length > 0;
  }

  function renderNames() {
    if (el.hello) el.hello.textContent = 'Hi ' + nameOf(ROLE) + '. Your tasks, ideas and shared expenses.';
    var active = document.activeElement;
    if (el.nameAdmin && active !== el.nameAdmin) el.nameAdmin.value = state.names.admin || '';
    if (el.nameMember && active !== el.nameMember) el.nameMember.value = state.names.member || '';
  }

  /* ---------------- render: team task board (both add, both change status) ---------------- */
  var STATUSES = [['todo', 'To do'], ['doing', 'In progress'], ['done', 'Done']];
  function statusOf(id) {
    var st = state.sharedStatus[id];
    return st && (st.status === 'doing' || st.status === 'done') ? st.status : 'todo';
  }
  function statusLabel(key) { return STATUSES.filter(function (p) { return p[0] === key; })[0][1]; }
  function ownerLabel(o) { return o === 'admin' || o === 'member' ? nameOf(o) : 'Both'; }

  function renderBoard() {
    if (!el.board.todo) return;
    if (el.boardOwner) {
      el.boardOwner.options[1].textContent = nameOf('admin') + (ROLE === 'admin' ? ' (you)' : '');
      el.boardOwner.options[2].textContent = nameOf('member') + (ROLE === 'member' ? ' (you)' : '');
    }
    var groups = { todo: [], doing: [], done: [] };
    Object.keys(state.shared).forEach(function (id) {
      var t = state.shared[id];
      if (hiddenFromMe(t.by) && t.owner === 'member') return;
      groups[statusOf(id)].push(id);
    });
    STATUSES.forEach(function (pair) {
      var key = pair[0], ids = groups[key], list = el.board[key];
      ids.sort(function (a, b) {
        if (key === 'done') return (state.sharedStatus[b].at || 0) - (state.sharedStatus[a].at || 0);
        var x = state.shared[a], y = state.shared[b];
        var dx = x.due || '9999', dy = y.due || '9999';
        return dx < dy ? -1 : dx > dy ? 1 : x.created - y.created;
      });
      list.textContent = '';
      ids.forEach(function (id) {
        var t = state.shared[id], st = state.sharedStatus[id];
        var li = document.createElement('li');
        li.className = 'board-item ' + key;
        li.dataset.id = id;

        var text = document.createElement('p');
        text.className = 'board-text';
        text.textContent = t.text;
        li.appendChild(text);

        var meta = document.createElement('div');
        meta.className = 'team-meta';
        var who = document.createElement('span');
        who.className = 'owner-chip ' + (t.owner || 'both');
        who.textContent = ownerLabel(t.owner);
        meta.appendChild(who);
        if (t.due) {
          var due = document.createElement('span');
          var overdue = key !== 'done' && t.due < todayKey();
          due.className = 'time-chip' + (overdue ? ' overdue' : '');
          due.textContent = (overdue ? 'Overdue · ' : 'Due ') + shortKey(t.due);
          meta.appendChild(due);
        }
        var info = document.createElement('span');
        info.textContent = st && st.by
          ? nameOf(st.by) + ' marked ' + statusLabel(key) + ' · ' + shortStamp(st.at)
          : 'Added by ' + nameOf(t.by) + ' · ' + shortStamp(t.created);
        meta.appendChild(info);
        li.appendChild(meta);

        var row = document.createElement('div');
        row.className = 'board-actions';
        var sel = document.createElement('select');
        sel.className = 'status-select';
        sel.setAttribute('aria-label', 'Status of: ' + t.text);
        STATUSES.forEach(function (p) {
          var o = document.createElement('option');
          o.value = p[0];
          o.textContent = p[1];
          if (p[0] === key) o.selected = true;
          sel.appendChild(o);
        });
        row.appendChild(sel);
        if (t.by === ROLE || ROLE === 'admin') {
          var del = document.createElement('button');
          del.type = 'button';
          del.className = 'del';
          del.textContent = '✕';
          del.setAttribute('aria-label', 'Delete: ' + t.text);
          row.appendChild(del);
        }
        li.appendChild(row);
        li.appendChild(remarksBlock(id));
        list.appendChild(li);
      });
      if (el.boardCount[key]) el.boardCount[key].textContent = ids.length;
      if (el.boardEmpty[key]) el.boardEmpty[key].hidden = ids.length > 0;
    });
  }

  /* ---------------- remarks (on assigned tasks and team tasks) ---------------- */
  var openRemarks = {};   // which remark threads are expanded on this screen
  var drafts = {};        // half-typed text in inputs that are rebuilt on every render
  function draftInput(key, placeholder, label, maxlength) {
    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = maxlength;
    input.placeholder = placeholder;
    input.setAttribute('aria-label', label);
    input.dataset.draft = key;
    input.value = drafts[key] || '';
    return input;
  }
  function remarkIds(on) {
    return Object.keys(state.remarks).filter(function (id) { return state.remarks[id].on === on; })
      .sort(function (a, b) { return state.remarks[a].created - state.remarks[b].created; });
  }
  function remarksBlock(on) {
    var ids = remarkIds(on), open = !!openRemarks[on];
    var wrap = document.createElement('div');
    wrap.className = 'remarks';
    wrap.dataset.on = on;

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'remark-toggle';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide remarks' : ids.length ? 'Remarks (' + ids.length + ')' : 'Add remark';
    wrap.appendChild(toggle);
    if (!open) return wrap;

    if (ids.length) {
      var list = document.createElement('ul');
      list.className = 'remark-list';
      ids.forEach(function (id) {
        var r = state.remarks[id];
        var li = document.createElement('li');
        li.dataset.rid = id;
        var head = document.createElement('div');
        head.className = 'remark-head';
        var who = document.createElement('strong');
        who.className = 'remark-by ' + r.by;
        who.textContent = nameOf(r.by);
        var when = document.createElement('span');
        when.textContent = shortStamp(r.created);
        head.appendChild(who);
        head.appendChild(when);
        if (r.by === ROLE || ROLE === 'admin') {
          var del = document.createElement('button');
          del.type = 'button';
          del.className = 'del remark-del';
          del.textContent = '✕';
          del.setAttribute('aria-label', 'Delete remark');
          head.appendChild(del);
        }
        var text = document.createElement('p');
        text.className = 'remark-text';
        text.textContent = r.text;
        li.appendChild(head);
        li.appendChild(text);
        list.appendChild(li);
      });
      wrap.appendChild(list);
    }

    var form = document.createElement('form');
    form.className = 'remark-form';
    form.autocomplete = 'off';
    form.appendChild(draftInput('r:' + on, 'Write a remark…', 'New remark', 500));
    var send = document.createElement('button');
    send.type = 'submit';
    send.textContent = 'Add';
    form.appendChild(send);
    wrap.appendChild(form);
    return wrap;
  }
  function dropRemarks(on) {
    remarkIds(on).forEach(function (rid) { delete state.remarks[rid]; stamp('r:' + rid); });
  }

  /* ---------------- render: projects + new implementations ---------------- */
  function implStatus(it) { return it.status === 'doing' || it.status === 'done' ? it.status : 'todo'; }
  function delButton(cls, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'del ' + cls;
    b.textContent = '✕';
    b.setAttribute('aria-label', label);
    return b;
  }
  var editingDesc = {};   // projects whose details are being edited on this screen
  var DETAIL_FIELDS = ['note', 'tag', 'repo', 'live'];
  // Links come from synced data, so only plain web links are ever turned into <a href>.
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try {
      var x = new URL(u);
      return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
    } catch (e) { return ''; }
  }
  function clearDetailDrafts(pid) {
    DETAIL_FIELDS.forEach(function (f) { delete drafts['pd:' + pid + ':' + f]; });
  }
  function detailField(pid, p, field, labelText, tagName, placeholder, maxlength) {
    var label = document.createElement('label');
    label.textContent = labelText;
    var input = document.createElement(tagName);
    if (tagName === 'textarea') input.rows = 3; else input.type = 'text';
    input.name = field;
    input.maxLength = maxlength;
    input.placeholder = placeholder;
    var key = 'pd:' + pid + ':' + field;
    input.dataset.draft = key;
    input.value = drafts[key] !== undefined ? drafts[key] : (p[field] || '');
    label.appendChild(input);
    return label;
  }
  function linkChip(url, text) {
    var a = document.createElement('a');
    a.className = 'project-link';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = text + ' ↗';
    return a;
  }
  function detailsBlock(pid, p) {
    var wrap = document.createElement('div');
    wrap.className = 'project-desc';
    if (editingDesc[pid]) {
      var form = document.createElement('form');
      form.className = 'desc-form video-form';
      form.autocomplete = 'off';
      form.appendChild(detailField(pid, p, 'note', 'Description', 'textarea', 'What is this project about?', 1000));
      form.appendChild(detailField(pid, p, 'tag', 'Type', 'input', 'e.g. Desktop app, Web app, Website', 30));
      form.appendChild(detailField(pid, p, 'repo', 'Repository link', 'input', 'https://github.com/…', 300));
      form.appendChild(detailField(pid, p, 'live', 'Live link', 'input', 'https://…', 300));
      var row = document.createElement('div');
      row.className = 'form-row';
      var saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'primary-btn';
      saveBtn.textContent = 'Save';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'ghost-btn desc-cancel';
      cancel.textContent = 'Cancel';
      row.appendChild(saveBtn);
      row.appendChild(cancel);
      form.appendChild(row);
      wrap.appendChild(form);
      return wrap;
    }
    var text = document.createElement('p');
    text.className = p.note ? 'desc-text' : 'desc-text empty-desc';
    text.textContent = p.note || 'No description yet.';
    wrap.appendChild(text);

    var links = document.createElement('div');
    links.className = 'project-links';
    var repo = safeUrl(p.repo), live = safeUrl(p.live);
    if (repo) links.appendChild(linkChip(repo, 'Repo'));
    if (live) links.appendChild(linkChip(live, 'Live'));
    if (!live && /desktop/i.test(p.tag || '')) {
      var desk = document.createElement('span');
      desk.className = 'project-link muted';
      desk.textContent = 'Runs on the desktop, no live link';
      links.appendChild(desk);
    }
    if (links.childNodes.length) wrap.appendChild(links);

    // Progress: done implementations out of all of them; "in progress" counts half.
    var items = Object.keys(state.impl).filter(function (id) { return state.impl[id].project === pid; });
    var done = 0, doing = 0;
    items.forEach(function (id) {
      var st = implStatus(state.impl[id]);
      if (st === 'done') done++; else if (st === 'doing') doing++;
    });
    var pct = items.length ? Math.round(((done + doing / 2) / items.length) * 100) : 0;
    var bar = document.createElement('div');
    bar.className = 'progress project-progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(pct));
    bar.setAttribute('aria-label', 'Progress of ' + p.name);
    var fill = document.createElement('div');
    fill.className = 'progress-bar';
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    wrap.appendChild(bar);
    var ptext = document.createElement('p');
    ptext.className = 'progress-text';
    ptext.textContent = items.length
      ? pct + '% · ' + done + ' of ' + items.length + ' done' + (doing ? ', ' + doing + ' in progress' : '')
      : 'No implementations yet';
    wrap.appendChild(ptext);

    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'remark-toggle desc-edit';
    edit.textContent = 'Edit details';
    wrap.appendChild(edit);
    return wrap;
  }
  // Projects has two parts: "list" (name + direct links + details) and "tasks" (tasks under each project).
  var PROJ_VIEW_KEY = 'stane-proj-view';
  var projView = 'list';
  try { if (localStorage.getItem(PROJ_VIEW_KEY) === 'tasks') projView = 'tasks'; } catch (e) { /* default */ }
  function projectUrl(p) { return safeUrl(p.live) || safeUrl(p.repo); }
  function renderProjects() {
    if (!el.projList) return;
    var tasksView = projView === 'tasks';
    if (el.projView) el.projView.querySelectorAll('button').forEach(function (b) {
      var on = b.dataset.view === projView;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if ($('tmProjAddCard')) $('tmProjAddCard').hidden = tasksView;
    el.projList.classList.toggle('proj-tasks-view', tasksView);
    var ids = Object.keys(state.projects).sort(function (a, b) {
      return (state.projects[a].created || 0) - (state.projects[b].created || 0);
    });
    if (el.projCount) el.projCount.textContent = ids.length;
    el.projList.textContent = '';
    var order = { todo: 0, doing: 1, done: 2 };
    ids.forEach(function (pid) {
      var p = state.projects[pid];
      var card = document.createElement('section');
      card.className = 'card project-card';
      card.dataset.id = pid;

      var implIds = Object.keys(state.impl).filter(function (id) { return state.impl[id].project === pid; });
      var openCount = implIds.filter(function (id) { return implStatus(state.impl[id]) !== 'done'; }).length;

      var head = document.createElement('div');
      head.className = 'card-head';
      var h = document.createElement('h2');
      var direct = projectUrl(p);
      if (direct && !tasksView) {
        var nameLink = document.createElement('a');
        nameLink.className = 'project-name-link';
        nameLink.href = direct;
        nameLink.target = '_blank';
        nameLink.rel = 'noopener noreferrer';
        nameLink.textContent = p.name;
        nameLink.title = 'Open ' + direct;
        h.appendChild(nameLink);
      } else h.textContent = p.name;
      if (p.tag) {
        var tag = document.createElement('span');
        tag.className = 'project-tag' + (/desktop/i.test(p.tag) ? ' desktop' : '');
        tag.textContent = p.tag;
        h.appendChild(tag);
      }
      head.appendChild(h);
      var right = document.createElement('div');
      right.className = 'project-head-right';
      var pill = document.createElement('span');
      pill.className = 'count-pill';
      var strong = document.createElement('strong');
      strong.textContent = openCount;
      pill.appendChild(strong);
      pill.appendChild(document.createTextNode(' open'));
      right.appendChild(pill);
      if (p.by === ROLE || ROLE === 'admin') right.appendChild(delButton('project-del', 'Delete project: ' + p.name));
      head.appendChild(right);
      card.appendChild(head);
      if (!tasksView) {
        card.appendChild(detailsBlock(pid, p));
        el.projList.appendChild(card);
        return;
      }

      var sub = document.createElement('h3');
      sub.textContent = 'Tasks';
      card.appendChild(sub);

      implIds.sort(function (a, b) {
        var x = state.impl[a], y = state.impl[b];
        return order[implStatus(x)] - order[implStatus(y)] || x.created - y.created;
      });
      if (implIds.length) {
        var list = document.createElement('ul');
        list.className = 'board-list impl-list';
        implIds.forEach(function (iid) {
          var it = state.impl[iid], key = implStatus(it);
          var li = document.createElement('li');
          li.className = 'board-item ' + key;
          li.dataset.iid = iid;
          var text = document.createElement('p');
          text.className = 'board-text';
          text.textContent = it.text;
          li.appendChild(text);
          var meta = document.createElement('div');
          meta.className = 'team-meta';
          meta.textContent = it.statusBy
            ? nameOf(it.statusBy) + ' marked ' + statusLabel(key) + ' · ' + shortStamp(it.statusAt)
            : it.created < 1e10 ? 'Starter idea' : 'Added by ' + nameOf(it.by) + ' · ' + shortStamp(it.created);
          li.appendChild(meta);
          var row = document.createElement('div');
          row.className = 'board-actions';
          var sel = document.createElement('select');
          sel.className = 'status-select impl-status';
          sel.setAttribute('aria-label', 'Status of: ' + it.text);
          STATUSES.forEach(function (s) {
            var o = document.createElement('option');
            o.value = s[0];
            o.textContent = s[1];
            if (s[0] === key) o.selected = true;
            sel.appendChild(o);
          });
          row.appendChild(sel);
          if (it.by === ROLE || ROLE === 'admin') row.appendChild(delButton('impl-del', 'Delete: ' + it.text));
          li.appendChild(row);
          list.appendChild(li);
        });
        card.appendChild(list);
      } else {
        var empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'No tasks yet.';
        card.appendChild(empty);
      }

      var form = document.createElement('form');
      form.className = 'add impl-form';
      form.autocomplete = 'off';
      form.appendChild(draftInput('im:' + pid, 'Add a task for ' + p.name, 'New task for ' + p.name, 300));
      var add = document.createElement('button');
      add.type = 'submit';
      add.textContent = 'Add';
      form.appendChild(add);
      card.appendChild(form);

      el.projList.appendChild(card);
    });
    if (el.projEmpty) el.projEmpty.hidden = ids.length > 0;
  }

  function render() {
    // Lists are rebuilt from scratch, so keep the cursor in a dynamic input that was being typed in.
    var act = document.activeElement;
    var focusKey = act && act.dataset ? act.dataset.draft : '';
    renderTasks(); renderBoard(); renderIdeas(); renderExpenses(); renderProjects(); renderCreds(); renderLinks(); renderDocs(); renderKeys(); renderCollections(); renderNames(); renderTaskPopup(); setupFormPops();
    if (focusKey) {
      var again = document.querySelector('[data-draft="' + focusKey + '"]');
      if (again && again !== document.activeElement) {
        again.focus();
        var n = again.value.length;
        again.setSelectionRange(n, n);
      }
    }
  }

  /* ---------------- API keys (shared, plain text) ---------------- */
  // Free API keys kept in the open, shared by both people through the team data file.
  var MASK_KEY = 'stane-apikeys-mask';
  var ak = {
    form: $('akForm'), head: $('akFormHead'), name: $('akName'), key: $('akKey'), env: $('akEnv'),
    project: $('akProject'), projectList: $('akProjectList'), link: $('akLink'), limit: $('akLimit'),
    expiry: $('akExpiry'), note: $('akNote'), save: $('akSave'), cancel: $('akCancel'), msg: $('akMsg'),
    count: $('akCount'), search: $('akSearch'), filter: $('akFilter'), mask: $('akMask'),
    copyEnv: $('akCopyEnv'), toolMsg: $('akToolMsg'), list: $('akList'), empty: $('akEmpty'),
    owner: $('akOwner'), bulkOwner: $('akBulkOwner'), ownerFilter: $('akOwnerFilter')
  };
  var akEditing = '';
  var akMasked = false;
  try { akMasked = localStorage.getItem(MASK_KEY) === '1'; } catch (e) { akMasked = false; }

  // "Google Maps" -> "GOOGLE_MAPS_API_KEY"
  function envNameOf(k) {
    if (k.env) return k.env;
    var base = String(k.name || 'KEY').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'KEY';
    if (/^[0-9]/.test(base)) base = '_' + base;
    if (/_KEY$/.test(base)) return base;
    return /(^|_)API$/.test(base) ? base + '_KEY' : base + '_API_KEY';
  }
  // "groq = gsk_…" or "Groq: gsk_…" per line -> [{ name: 'Groq', key: 'gsk_…' }]
  function parseKeyLines(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var m = /^\s*([^=:]+?)\s*[=:]\s*(\S.*?)\s*$/.exec(line);
      if (!m) return;
      var name = m[1].replace(/\s+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      out.push({ name: name.slice(0, 80), key: m[2].slice(0, 4000) });
    });
    return out;
  }
  function maskKey(v) {
    v = String(v || '');
    return v.length <= 8 ? '••••••••' : v.slice(0, 4) + '••••••••' + v.slice(-4);
  }
  function akDate(key) { var p = key.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
  // Whole days from today to an expiry date (negative once it has passed).
  function daysUntil(dateKey) {
    return Math.round((akDate(dateKey) - akDate(todayKey())) / 86400000);
  }
  function setAkMsg(node, text, kind) {
    if (!node) return;
    node.textContent = text;
    node.className = 'form-msg' + (kind ? ' ' + kind : '');
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var t = document.createElement('textarea');
      t.value = text;
      t.setAttribute('readonly', '');
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(t);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }
  function flash(btn, text) {
    var original = btn.dataset.label || btn.textContent;
    btn.dataset.label = original;
    btn.textContent = text;
    setTimeout(function () { if (btn.isConnected) btn.textContent = original; }, 1500);
  }

  function visibleKeyIds() {
    var q = ak.search ? ak.search.value.trim().toLowerCase() : '';
    var f = ak.filter ? ak.filter.value : '';
    var who = ak.ownerFilter ? ak.ownerFilter.value : '';
    return Object.keys(state.apiKeys).filter(function (id) {
      var k = state.apiKeys[id];
      if (f === '__none') { if (k.project) return false; }
      else if (f && k.project !== f) return false;
      if (who && ownerOf(k) !== who) return false;
      if (!q) return true;
      return [k.name, k.project, k.note, k.env, k.limit].join(' ').toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) {
      return String(state.apiKeys[a].name).localeCompare(String(state.apiKeys[b].name)) ||
        (state.apiKeys[a].created || 0) - (state.apiKeys[b].created || 0);
    });
  }

  function akButton(cls, text, id, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini-btn ' + cls;
    b.textContent = text;
    b.dataset.id = id;
    if (label) b.setAttribute('aria-label', label);
    return b;
  }

  function renderKeys() {
    if (!ak.list) return;
    var all = Object.keys(state.apiKeys);
    ak.count.textContent = all.length;
    ak.mask.textContent = akMasked ? 'Show keys' : 'Hide keys';
    ak.mask.setAttribute('aria-pressed', String(akMasked));

    // Project choices for the filter and the form's suggestions.
    var projects = {};
    all.forEach(function (id) { if (state.apiKeys[id].project) projects[state.apiKeys[id].project] = true; });
    var names = Object.keys(projects).sort(function (a, b) { return a.localeCompare(b); });
    if (document.activeElement !== ak.filter) {
      var chosen = ak.filter.value;
      ak.filter.textContent = '';
      [['', 'All projects']].concat(names.map(function (n) { return [n, n]; }), [['__none', 'No project']])
        .forEach(function (p) {
          var o = document.createElement('option');
          o.value = p[0];
          o.textContent = p[1];
          ak.filter.appendChild(o);
        });
      ak.filter.value = chosen && (chosen === '__none' || projects[chosen]) ? chosen : '';
    }
    ak.projectList.textContent = '';
    names.forEach(function (n) { var o = document.createElement('option'); o.value = n; ak.projectList.appendChild(o); });

    var ids = visibleKeyIds();
    ak.list.textContent = '';
    ak.empty.hidden = ids.length > 0;
    ak.empty.textContent = all.length ? 'No keys match this search.' : 'No API keys saved yet.';
    ak.copyEnv.disabled = ids.length === 0;

    ids.forEach(function (id) {
      var k = state.apiKeys[id];
      var li = document.createElement('li');
      li.className = 'row-item';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'row-open';
      b.dataset.open = id;
      var chips = [pill(nameOf(ownerOf(k)) + "'s", 'ak-owner ' + ownerOf(k))];
      if (k.project) chips.push(pill(k.project));
      var ex = expiryChip(k);
      if (ex) chips.push(ex);
      rowText(b, k.name, envNameOf(k), chips);
      li.appendChild(b);
      ak.list.appendChild(li);
    });
  }
  function expiryChip(k) {
    if (!k.expiry) return null;
    var left = daysUntil(k.expiry);
    if (left > 30) return null;
    return pill(left < 0 ? 'Expired' : left === 0 ? 'Expires today' : 'Expires in ' + left + ' day' + (left === 1 ? '' : 's'),
      'ak-expiry' + (left < 0 ? ' gone' : ' soon'));
  }
  function keyDetail(card, id) {
    var k = state.apiKeys[id];
    if (!k) return false;
    var chips = [pill(nameOf(ownerOf(k)) + "'s key", 'ak-owner ' + ownerOf(k))];
    if (k.project) chips.push(pill(k.project));
    var ex = expiryChip(k);
    if (ex) chips.push(ex);
    detailHead(card, k.name, envNameOf(k), chips);
    var val = document.createElement('code');
    val.className = 'cred-val ak-val detail-key';
    val.textContent = akMasked ? maskKey(k.key) : k.key;
    card.appendChild(val);
    var dl = document.createElement('dl');
    dl.className = 'emp-dl';
    detailRow(dl, 'Free limit', k.limit);
    detailRow(dl, 'Expires', k.expiry ? shortKey(k.expiry) + ' ' + k.expiry.slice(0, 4) : '');
    detailRow(dl, 'Notes', k.note);
    if (dl.children.length) card.appendChild(dl);
    var meta = byLine(k);
    if (meta) card.appendChild(para('ak-meta detail-meta', meta));
    var buttons = [akButton('ak-copy primary-mini', 'Copy key', id), akButton('ak-copy-env', 'Copy .env line', id)];
    if (k.link && /^https?:\/\//i.test(k.link)) {
      var a = document.createElement('a');
      a.className = 'mini-btn';
      a.href = k.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Open dashboard';
      buttons.push(a);
    }
    buttons.push(akButton('ak-edit', 'Edit', id), akButton('ak-del', 'Delete', id));
    detailActions(card, buttons);
  }
  function openKey(id) {
    openDetail(function (card) { return keyDetail(card, id); }, onKeyButton);
  }
  function onKeyButton(btn) {
    var id = btn.dataset.id, k = state.apiKeys[id];
    if (!k) return;
    if (btn.classList.contains('ak-copy') || btn.classList.contains('ak-copy-env')) {
      copyWithFlash(btn, btn.classList.contains('ak-copy') ? k.key : envNameOf(k) + '=' + k.key);
    } else if (btn.classList.contains('ak-edit')) {
      closeDetail();
      startKeyEdit(id);
    } else if (btn.classList.contains('ak-del')) {
      armOrRun(btn, function () {
        closeDetail();
        delete state.apiKeys[id];
        stamp('ak:' + id);
        if (akEditing === id) resetKeyForm();
        save();
        renderKeys();
      });
    }
  }

  // Adds keys, skipping any whose value is already saved. Used by "Paste many" and by the
  // one-time move of keys that were saved in Divyanshu's personal data before sharing.
  function addKeys(rows) {
    var have = {}, added = 0, skipped = 0, now = Date.now();
    Object.keys(state.apiKeys).forEach(function (id) { have[state.apiKeys[id].key] = true; });
    rows.forEach(function (r, i) {
      if (!r || !r.key || !r.name) return;
      if (have[r.key]) { skipped++; return; }
      have[r.key] = true;
      var id = newId() + i;
      state.apiKeys[id] = {
        owner: r.owner === 'member' || r.owner === 'admin' ? r.owner : ownerOf(r),
        name: r.name, key: r.key, env: r.env || '', project: r.project || '', link: r.link || '',
        limit: r.limit || '', expiry: r.expiry || '', note: r.note || '',
        by: r.by || ROLE, created: r.created || now + i, updated: now
      };
      stamp('ak:' + id);
      added++;
    });
    if (added) save();
    renderKeys();
    return { added: added, skipped: skipped };
  }
  window.STANE_TEAM_ADD_KEYS = function (rows) { addKeys(rows); };

  // Whose key it is. Keys saved before this existed belong to whoever added them.
  function ownerOf(k) { return k.owner === 'member' || k.owner === 'admin' ? k.owner : k.by === 'member' ? 'member' : 'admin'; }
  // Owner choices show the current names and start on the person signed in.
  function fillOwnerSelects() {
    [ak.owner, ak.bulkOwner].forEach(function (sel) {
      if (!sel) return;
      sel.options[0].textContent = nameOf('admin') + (ROLE === 'admin' ? ' (you)' : '');
      sel.options[1].textContent = nameOf('member') + (ROLE === 'member' ? ' (you)' : '');
      if (!akEditing || sel !== ak.owner) sel.value = ROLE;
    });
    if (ak.ownerFilter) {
      ak.ownerFilter.options[1].textContent = nameOf('admin') + "'s keys";
      ak.ownerFilter.options[2].textContent = nameOf('member') + "'s keys";
    }
  }

  function resetKeyForm() {
    akEditing = '';
    ak.form.reset();
    fillOwnerSelects();
    ak.head.textContent = 'Add an API key';
    ak.save.textContent = 'Save key';
    ak.cancel.hidden = true;
  }

  function startKeyEdit(id) {
    var k = state.apiKeys[id];
    if (!k) return;
    akEditing = id;
    ak.name.value = k.name || '';
    ak.key.value = k.key || '';
    ak.env.value = k.env || '';
    ak.project.value = k.project || '';
    if (ak.owner) ak.owner.value = ownerOf(k);
    ak.link.value = k.link || '';
    ak.limit.value = k.limit || '';
    ak.expiry.value = k.expiry || '';
    ak.note.value = k.note || '';
    ak.head.textContent = 'Edit: ' + k.name;
    ak.save.textContent = 'Save changes';
    ak.cancel.hidden = false;
    setAkMsg(ak.msg, '', '');
    renderKeys();
    openFormFor(ak.form);
  }

  if (ak.form) {
    ak.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = ak.name.value.trim(), key = ak.key.value.trim();
      if (!name || !key) { setAkMsg(ak.msg, 'Add a name and the key.', 'error'); return; }
      var link = ak.link.value.trim();
      if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
      var env = ak.env.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      var dupe = Object.keys(state.apiKeys).filter(function (id) {
        return id !== akEditing && state.apiKeys[id].key === key;
      })[0];
      if (dupe) { setAkMsg(ak.msg, 'This key is already saved as "' + state.apiKeys[dupe].name + '".', 'error'); return; }
      var id = akEditing || newId();
      var old = state.apiKeys[id];
      state.apiKeys[id] = {
        owner: ak.owner && ak.owner.value === 'member' ? 'member' : 'admin',
        name: name, key: key, env: env, project: ak.project.value.trim(), link: link,
        limit: ak.limit.value.trim(), expiry: ak.expiry.value || '', note: ak.note.value.trim(),
        by: old && old.by ? old.by : ROLE, created: old ? old.created : Date.now(), updated: Date.now()
      };
      stamp('ak:' + id);
      save();
      var wasEdit = !!akEditing;
      resetKeyForm();
      renderKeys();
      setAkMsg(ak.msg, wasEdit ? 'Changes saved.' : 'Key saved.', 'ok');
    });
    var bulkForm = $('akBulkForm'), bulkText = $('akBulkText'), bulkMsg = $('akBulkMsg');
    if (bulkForm) {
      bulkForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var rows = parseKeyLines(bulkText.value);
        if (!rows.length) { setAkMsg(bulkMsg, 'No "name = key" lines found.', 'error'); return; }
        var bulkWho = ak.bulkOwner && ak.bulkOwner.value === 'member' ? 'member' : 'admin';
        rows.forEach(function (r) { r.owner = bulkWho; });
        var res = addKeys(rows);
        var added = res.added, skipped = res.skipped;
        if (added) bulkText.value = '';
        setAkMsg(bulkMsg, 'Added ' + added + ' key' + (added === 1 ? '' : 's') +
          (skipped ? ', skipped ' + skipped + ' already saved' : '') + '.', added ? 'ok' : 'error');
      });
    }
    ak.cancel.addEventListener('click', function () { resetKeyForm(); setAkMsg(ak.msg, '', ''); renderKeys(); });
    ak.search.addEventListener('input', renderKeys);
    ak.filter.addEventListener('change', renderKeys);
    if (ak.ownerFilter) ak.ownerFilter.addEventListener('change', renderKeys);
    fillOwnerSelects();
    ak.mask.addEventListener('click', function () {
      akMasked = !akMasked;
      try { localStorage.setItem(MASK_KEY, akMasked ? '1' : '0'); } catch (err) { /* this visit only */ }
      renderKeys();
    });
    ak.copyEnv.addEventListener('click', function () {
      var ids = visibleKeyIds();
      if (!ids.length) return;
      var text = ids.map(function (id) { var k = state.apiKeys[id]; return envNameOf(k) + '=' + k.key; }).join('\n') + '\n';
      copyText(text).then(function () {
        setAkMsg(ak.toolMsg, 'Copied ' + ids.length + ' key' + (ids.length === 1 ? '' : 's') + ' as .env lines.', 'ok');
      }, function () { setAkMsg(ak.toolMsg, 'Copy was blocked by the browser.', 'error'); });
    });
    ak.list.addEventListener('click', function (e) {
      var open = e.target.closest('.row-open');
      if (open) openKey(open.dataset.open);
    });
  }

  if (typeof window.STANE_MOVE_PERSONAL_KEYS === 'function') window.STANE_MOVE_PERSONAL_KEYS();

  /* ---------------- Prompts, GitHub repos, Employees (shared, both can edit) ---------------- */
  // Every list works the same way: an "Add" button opens the form in a popup, the list
  // shows only names, and clicking a name opens its details in a second popup.
  function textOf(v) { return String(v == null ? '' : v); }
  function pill(text, cls) {
    var s = document.createElement('span');
    s.className = 'count-pill' + (cls ? ' ' + cls : '');
    s.textContent = text;
    return s;
  }
  function miniBtn(cls, text, id, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini-btn ' + cls;
    b.textContent = text;
    if (id) b.dataset.id = id;
    if (label) b.setAttribute('aria-label', label);
    return b;
  }
  function byLine(item) {
    var parts = [];
    if (item.by) parts.push('Added by ' + nameOf(item.by));
    if (item.updated) parts.push('Updated ' + shortStamp(item.updated));
    return parts.join(' · ');
  }
  function para(cls, text) {
    var p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    return p;
  }
  function fillGroupFilter(sel, allText, groups) {
    if (!sel || document.activeElement === sel) return;
    var chosen = sel.value;
    sel.textContent = '';
    [['', allText]].concat(groups.map(function (g) { return [g, g]; })).forEach(function (p) {
      var o = document.createElement('option');
      o.value = p[0];
      o.textContent = p[1];
      sel.appendChild(o);
    });
    sel.value = groups.indexOf(chosen) !== -1 ? chosen : '';
  }
  function fillDatalist(dl, groups) {
    if (!dl) return;
    dl.textContent = '';
    groups.forEach(function (g) { var o = document.createElement('option'); o.value = g; dl.appendChild(o); });
  }
  function groupsOf(part, key) {
    var g = {};
    Object.keys(state[part]).forEach(function (id) { var v = textOf(state[part][id][key]).trim(); if (v) g[v] = true; });
    return Object.keys(g).sort(function (a, b) { return a.localeCompare(b); });
  }
  function hay(item, keys) { return keys.map(function (k) { return textOf(item[k]); }).join(' ').toLowerCase(); }
  function copyWithFlash(btn, text) {
    copyText(text).then(function () { flash(btn, 'Copied'); }, function () { flash(btn, 'Blocked'); });
  }

  /* ----- popups: one for details, one per add form ----- */
  var shades = [];
  function makeShade(cls) {
    var box = document.createElement('div');
    box.className = 'plan-shade ' + (cls || '');
    box.hidden = true;
    document.body.appendChild(box);
    shades.push(box);
    return box;
  }
  function syncModalClass() {
    // Any open popup (these, the idea plan, the tasks popup) keeps the page from scrolling.
    var anyOpen = !!document.querySelector('.plan-shade:not([hidden])');
    document.documentElement.classList.toggle('modal-open', anyOpen);
  }
  function closeButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pop-close';
    b.setAttribute('aria-label', 'Close');
    b.textContent = '✕';
    return b;
  }

  // Details popup. render(card) fills it and returns false if the item no longer exists.
  var detail = { box: null, render: null, onClick: null };
  function openDetail(render, onClick) {
    detail.render = render;
    detail.onClick = onClick;
    drawDetail(true);
  }
  function closeDetail() {
    detail.render = null;
    if (detail.box) { detail.box.hidden = true; detail.box.textContent = ''; }
    syncModalClass();
  }
  function drawDetail(focus) {
    if (!detail.render) return;
    if (!detail.box) {
      detail.box = makeShade('detail-shade');
      detail.box.addEventListener('click', function (e) {
        if (e.target === detail.box || e.target.closest('.pop-close')) { closeDetail(); return; }
        var btn = e.target.closest('button');
        if (btn && detail.onClick) detail.onClick(btn, e);
      });
    }
    var card = document.createElement('section');
    card.className = 'card plan-card detail-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    var x = closeButton();
    card.appendChild(x);
    if (detail.render(card) === false) { closeDetail(); return; }
    var heading = card.querySelector('h2');
    if (heading) { heading.id = 'detailTitle'; card.setAttribute('aria-labelledby', 'detailTitle'); }
    detail.box.textContent = '';
    detail.box.appendChild(card);
    detail.box.hidden = false;
    syncModalClass();
    if (focus) x.focus();
  }
  function detailHead(card, title, sub, chips) {
    var top = document.createElement('div');
    top.className = 'detail-top';
    var h = document.createElement('h2');
    h.className = 'detail-title';
    h.textContent = title;
    top.appendChild(h);
    if (sub) top.appendChild(para('detail-sub', sub));
    if (chips && chips.length) {
      var row = document.createElement('div');
      row.className = 'detail-chips';
      chips.forEach(function (c) { row.appendChild(c); });
      top.appendChild(row);
    }
    card.appendChild(top);
  }
  function detailActions(card, buttons) {
    var row = document.createElement('div');
    row.className = 'detail-actions';
    buttons.forEach(function (b) { if (b) row.appendChild(b); });
    card.appendChild(row);
  }

  // Add-form popups. Moves an existing form (or its whole card) into a popup and puts an
  // "Add" button in the list's header. The popup closes itself after a successful save.
  var formPops = [];
  function popForm(cfg) {
    var form = $(cfg.form);
    if (!form || form.dataset.popped) return;
    form.dataset.popped = '1';
    var tab = form.closest('main');
    var section = form.closest('section');
    var moveWhole = cfg.whole && section;
    var box = makeShade('form-shade');
    var card;
    if (moveWhole) {
      card = section;
      card.classList.add('plan-card', 'form-card');
    } else {
      card = document.createElement('section');
      card.className = 'card plan-card form-card';
      var h = document.createElement('h2');
      h.textContent = cfg.title;
      card.appendChild(h);
      (cfg.extra || []).forEach(function (id) { var n = $(id); if (n) card.appendChild(n); });
      card.insertBefore(form, card.children[1] || null);
    }
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.insertBefore(closeButton(), card.firstChild);
    box.appendChild(card);
    // When only one block is left on the page, centre it as a single column.
    if (moveWhole && tab) {
      var left = [].filter.call(tab.children, function (c) {
        return c.matches('section, .col') && (c.matches('section') || c.querySelector('section'));
      });
      if (left.length === 1) tab.classList.add('one-col');
    }

    var pop = { form: form, box: box, pending: false };
    formPops.push(pop);
    function close() {
      if (box.hidden) return;
      box.hidden = true;
      syncModalClass();
      // Leaving in the middle of an edit cancels it, so the next "Add" starts empty.
      var cancel = card.querySelector('[id$="Cancel"]');
      if (cancel && !cancel.hidden) cancel.click();
    }
    pop.open = function () {
      card.querySelectorAll('.form-msg').forEach(function (m) { m.textContent = ''; });
      box.hidden = false;
      syncModalClass();
      var first = card.querySelector('input:not([type=hidden]):not([type=file]), textarea, select');
      if (first) setTimeout(function () { first.focus(); }, 30);
    };
    pop.close = close;
    box.addEventListener('click', function (e) {
      if (e.target === box || e.target.closest('.pop-close')) close();
    });
    card.addEventListener('submit', function () {
      pop.pending = true;
      // Forms without a status line count as saved once their handler has emptied them.
      setTimeout(function () {
        var req = form.querySelector('[required]') || form.querySelector('textarea, input[type=text]');
        if (pop.pending && req && !req.value && !card.querySelector('.form-msg.error:not(:empty)')) {
          pop.pending = false;
          close();
        }
      }, 150);
    }, true);
    new MutationObserver(function () {
      if (!pop.pending) return;
      var ok = [].some.call(card.querySelectorAll('.form-msg'), function (m) {
        return m.classList.contains('ok') && m.textContent.trim();
      });
      if (ok) { pop.pending = false; setTimeout(close, 450); }
    }).observe(card, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });

    var host = typeof cfg.host === 'function' ? cfg.host() : document.querySelector(cfg.host);
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'primary-btn add-open';
    add.textContent = '+ ' + cfg.label;
    add.addEventListener('click', pop.open);
    if (!host) return;
    if (cfg.place === 'before') {
      var bar = document.createElement('div');
      bar.className = 'page-actions';
      bar.appendChild(add);
      host.parentNode.insertBefore(bar, host);
    } else if (cfg.place === 'after') host.parentNode.insertBefore(add, host.nextSibling);
    else host.appendChild(add);
  }
  function openFormFor(form) {
    for (var i = 0; i < formPops.length; i++) if (formPops[i].form === form) { formPops[i].open(); return true; }
    return false;
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = formPops.filter(function (p) { return !p.box.hidden; })[0];
    if (open) { open.close(); return; }
    if (detail.render) closeDetail();
  });

  /* ----- list engine ----- */
  // cfg: part, prefix, ids, fields, required, titles, read(values, old, id), matches(item, q, f), sort(a, b),
  // row(id, item) -> element for the list, detail(card, id, item), onDetail(btn, id, item),
  // group(item) -> group name (optional), groupOrder(names) (optional), groupTools(name, ids) (optional).
  function makeList(cfg) {
    var f = {};
    Object.keys(cfg.ids).forEach(function (k) { f[k] = $(cfg.ids[k]); });
    var inputs = {};
    Object.keys(cfg.fields).forEach(function (id) { inputs[cfg.fields[id]] = $(id); });
    var editing = '';
    var list = {};

    function ids() {
      var q = f.search ? f.search.value.trim().toLowerCase() : '';
      var fv = f.filter ? f.filter.value : '';
      return Object.keys(state[cfg.part]).filter(function (id) {
        return cfg.matches(state[cfg.part][id], q, fv);
      }).sort(function (a, b) { return cfg.sort(state[cfg.part][a], state[cfg.part][b]); });
    }
    function rowItem(id) {
      var li = document.createElement('li');
      li.className = 'row-item';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'row-open';
      b.dataset.open = id;
      cfg.row(b, id, state[cfg.part][id]);
      li.appendChild(b);
      return li;
    }
    list.render = function () {
      if (!f.list) return;
      if (cfg.renderExtra) cfg.renderExtra(f);
      var shown = ids();
      f.list.textContent = '';
      if (cfg.group) {
        var groups = {};
        shown.forEach(function (id) { var g = cfg.group(state[cfg.part][id]); (groups[g] = groups[g] || []).push(id); });
        var names = cfg.groupOrder ? cfg.groupOrder(Object.keys(groups)) : Object.keys(groups).sort();
        names.forEach(function (g) {
          var sec = document.createElement('li');
          sec.className = 'row-group';
          var head = document.createElement('div');
          head.className = 'row-group-head';
          var h = document.createElement('h3');
          h.textContent = g;
          head.appendChild(h);
          head.appendChild(pill(String(groups[g].length)));
          if (cfg.groupTools) cfg.groupTools(g, groups[g]).forEach(function (t) { head.appendChild(t); });
          sec.appendChild(head);
          var ul = document.createElement('ul');
          ul.className = 'row-list';
          groups[g].forEach(function (id) { ul.appendChild(rowItem(id)); });
          sec.appendChild(ul);
          f.list.appendChild(sec);
        });
      } else {
        shown.forEach(function (id) { f.list.appendChild(rowItem(id)); });
      }
      var total = Object.keys(state[cfg.part]).length;
      if (f.count) f.count.textContent = cfg.count ? cfg.count() : total;
      f.empty.hidden = shown.length > 0;
      f.empty.textContent = total ? 'Nothing matches this search.' : cfg.emptyText;
    };
    function reset() {
      editing = '';
      f.form.reset();
      f.head.textContent = cfg.titles.add;
      f.save.textContent = cfg.titles.save;
      f.cancel.hidden = true;
    }
    list.open = function (id) {
      openDetail(function (card) {
        var item = state[cfg.part][id];
        if (!item) return false;
        cfg.detail(card, id, item);
        var meta = byLine(item);
        if (meta) card.appendChild(para('ak-meta detail-meta', meta));
        detailActions(card, (cfg.detailButtons ? cfg.detailButtons(id, item) : []).concat([
          miniBtn('row-edit', 'Edit', id), miniBtn('row-del', 'Delete', id)]));
      }, function (btn) {
        var item = state[cfg.part][id];
        if (!item) return;
        if (btn.classList.contains('row-edit')) { closeDetail(); list.edit(id); }
        else if (btn.classList.contains('row-del')) armOrRun(btn, function () { closeDetail(); list.remove(id); });
        else if (cfg.onDetail) cfg.onDetail(btn, id, item);
      });
    };
    list.edit = function (id) {
      var item = state[cfg.part][id];
      if (!item) return;
      editing = id;
      Object.keys(inputs).forEach(function (k) { if (inputs[k]) inputs[k].value = textOf(item[k]); });
      f.head.textContent = cfg.titles.edit(item);
      f.save.textContent = 'Save changes';
      f.cancel.hidden = false;
      setAkMsg(f.msg, '', '');
      openFormFor(f.form);
    };
    list.remove = function (id) {
      delete state[cfg.part][id];
      stamp(cfg.prefix + ':' + id);
      if (editing === id) reset();
      save();
      list.render();
    };
    if (!f.form) return list;

    f.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var values = {};
      Object.keys(inputs).forEach(function (k) { values[k] = inputs[k] ? inputs[k].value.trim() : ''; });
      var missing = cfg.required.filter(function (k) { return !values[k]; });
      if (missing.length) { setAkMsg(f.msg, 'Fill in the required fields.', 'error'); return; }
      var id = editing || newId();
      var old = state[cfg.part][id];
      var item = cfg.read(values, old, id);
      if (typeof item === 'string') { setAkMsg(f.msg, item, 'error'); return; }
      item.by = old && old.by ? old.by : ROLE;
      item.created = old ? old.created : Date.now();
      item.updated = Date.now();
      state[cfg.part][id] = item;
      stamp(cfg.prefix + ':' + id);
      save();
      var wasEdit = !!editing;
      reset();
      list.render();
      setAkMsg(f.msg, wasEdit ? 'Changes saved.' : 'Saved.', 'ok');
    });
    f.cancel.addEventListener('click', function () { reset(); setAkMsg(f.msg, '', ''); });
    if (f.search) f.search.addEventListener('input', list.render);
    if (f.filter) f.filter.addEventListener('change', list.render);
    f.list.addEventListener('click', function (e) {
      var open = e.target.closest('.row-open');
      if (open) { list.open(open.dataset.open); return; }
      var tool = e.target.closest('button');
      if (tool && cfg.onGroupTool) cfg.onGroupTool(tool);
    });
    return list;
  }
  function rowText(b, title, sub, chips) {
    var t = document.createElement('span');
    t.className = 'row-title';
    t.textContent = title;
    b.appendChild(t);
    if (sub) { var s = document.createElement('span'); s.className = 'row-sub'; s.textContent = sub; b.appendChild(s); }
    (chips || []).forEach(function (c) { b.appendChild(c); });
    var arrow = document.createElement('span');
    arrow.className = 'row-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '›';
    b.appendChild(arrow);
  }

  /* ----- Prompts ----- */
  var prompts = makeList({
    part: 'prompts', prefix: 'pm', emptyText: 'No prompts saved yet. Use "+ Add prompt".',
    ids: { form: 'pmForm', head: 'pmHead', save: 'pmSave', cancel: 'pmCancel', msg: 'pmMsg', list: 'pmList',
      empty: 'pmEmpty', count: 'pmCount', search: 'pmSearch', filter: 'pmFilter' },
    fields: { pmTitle: 'title', pmText: 'text', pmGroup: 'group', pmNote: 'note', pmSource: 'source' },
    required: ['title', 'text'],
    titles: { add: 'Add a prompt', save: 'Save prompt', edit: function (p) { return 'Edit: ' + p.title; } },
    read: function (v) {
      var p = { title: v.title, text: v.text, group: v.group, note: v.note };
      if (v.source) p.source = v.source;
      return p;
    },
    matches: function (p, q, f) {
      if (f && pmCat(p) !== f) return false;
      return !q || hay(p, ['title', 'text', 'group', 'note', 'source']).indexOf(q) !== -1;
    },
    // Numeric order, so "2 …" comes before "10 …" and template sets read 01 -> 20.
    sort: function (a, b) { return textOf(a.title).localeCompare(textOf(b.title), undefined, { numeric: true }); },
    group: pmCat,
    groupOrder: function (names) {
      return names.sort(function (a, b) { return a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b); });
    },
    // Whole category as one output: every prompt in order, joined into one text / one .md file.
    groupTools: function (g, ids) {
      var copy = miniBtn('pm-copy-cat', 'Copy all', '', 'Copy all ' + g + ' prompts as one text');
      var dl = miniBtn('pm-dl-cat', 'Download all .md', '', 'Download all ' + g + ' prompts as one file');
      copy.dataset.ids = dl.dataset.ids = ids.join(',');
      dl.dataset.cat = g;
      return [copy, dl];
    },
    onGroupTool: function (btn) {
      var ids = (btn.dataset.ids || '').split(',').filter(function (id) { return state.prompts[id]; });
      if (!ids.length) return;
      var text = joinPrompts(ids.map(function (id) { return state.prompts[id]; }));
      if (btn.classList.contains('pm-copy-cat')) copyWithFlash(btn, text);
      else if (btn.classList.contains('pm-dl-cat')) downloadText(mdFileName(btn.dataset.cat), text);
    },
    renderExtra: function (f) {
      var g = groupsOf('prompts', 'group');
      var shown = g.slice();
      if (Object.keys(state.prompts).some(function (id) { return !textOf(state.prompts[id].group).trim(); })) shown.push('Other');
      fillGroupFilter(f.filter, 'All categories', shown);
      fillDatalist($('pmGroupList'), g);
    },
    row: function (b, id, p) { rowText(b, p.title, '', []); },
    detail: function (card, id, p) {
      detailHead(card, p.title, p.source ? 'Source: ' + p.source : '', [pill(pmCat(p))]);
      var pre = document.createElement('pre');
      pre.className = 'pm-text open';
      pre.textContent = p.text;
      card.appendChild(pre);
      if (p.note) card.appendChild(para('ak-note', p.note));
    },
    detailButtons: function (id) {
      return [miniBtn('pm-copy primary-mini', 'Copy prompt', id), miniBtn('pm-download', 'Download .md', id)];
    },
    onDetail: function (btn, id, p) {
      if (btn.classList.contains('pm-copy')) copyWithFlash(btn, p.text);
      else if (btn.classList.contains('pm-download')) downloadText(mdFileName(p.title), p.text);
    }
  });
  function pmCat(p) { return textOf(p.group).trim() || 'Other'; }
  // Several prompts as one text, each ending with exactly one blank line before the next.
  function joinPrompts(list) {
    return list.map(function (p) { return textOf(p.text).replace(/\s+$/, ''); }).join('\n\n') + '\n';
  }
  // "My prompt: v2!" -> "My-prompt-v2.md"
  function mdFileName(title) {
    var base = textOf(title).trim().replace(/[\\/:*?"<>|#%&{}$!'`@+=]+/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '').slice(0, 80);
    return (base || 'prompt') + '.md';
  }
  // Title for an uploaded file: its first "# Heading", else the file name without the extension.
  function mdTitle(text, fileName) {
    var h = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/m.exec(textOf(text).split(/\r?\n/).slice(0, 20).join('\n'));
    if (h) return h[1].slice(0, 120);
    return textOf(fileName).replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 120);
  }
  function downloadText(name, text) {
    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  if ($('pmFile')) {
    $('pmFile').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      if (file.size > 100000) { setAkMsg($('pmMsg'), 'That file is too big (100 KB max).', 'error'); this.value = ''; return; }
      file.text().then(function (text) {
        $('pmText').value = text;
        if (!$('pmTitle').value.trim()) $('pmTitle').value = mdTitle(text, file.name);
        $('pmSource').value = file.name;
        setAkMsg($('pmMsg'), 'Loaded ' + file.name + '. Check it and press Save.', '');
      }, function () { setAkMsg($('pmMsg'), 'Could not read that file.', 'error'); });
    });
    // A hidden field keeps its value through form.reset(), so clear it by hand.
    $('pmForm').addEventListener('reset', function () { $('pmSource').value = ''; });
  }

  /* ----- GitHub repos ----- */
  // Suggested categories for repos that make Claude more capable; any other name works too.
  var REPO_CATS = ['Web design', 'Frontend', 'Backend', 'Security', 'Claude skills & plugins', 'AI agents & MCP',
    'Prompts', 'Automation', 'Testing', 'DevOps', 'Data & ML', 'Mobile', 'Other'];
  // "https://github.com/owner/repo(.git)(/…)" or "owner/repo" -> { url, path } (path = "owner/repo").
  function parseRepo(input) {
    var s = textOf(input).trim().replace(/\.git$/i, '').replace(/\/+$/, '');
    var m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/i.exec(s) ||
      /^git@github\.com:([\w.-]+)\/([\w.-]+)$/i.exec(s) ||
      /^([\w.-]+)\/([\w.-]+)$/.exec(s);
    if (m) return { url: 'https://github.com/' + m[1] + '/' + m[2], path: m[1] + '/' + m[2] };
    var u = safeUrl(s);
    return u ? { url: u, path: '' } : null;
  }
  function repoCat(r) { return textOf(r.group).trim() || 'Other'; }
  // Known categories first in their usual order, then any others A–Z, "Other" last.
  function orderCats(names) {
    return names.slice().sort(function (a, b) {
      var ia = REPO_CATS.indexOf(a), ib = REPO_CATS.indexOf(b);
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    });
  }
  var repos = makeList({
    part: 'repos', prefix: 'gh', emptyText: 'No repositories saved yet. Use "+ Add repo".',
    ids: { form: 'ghForm', head: 'ghHead', save: 'ghSave', cancel: 'ghCancel', msg: 'ghMsg', list: 'ghList',
      empty: 'ghEmpty', count: 'ghCount', search: 'ghSearch', filter: 'ghFilter' },
    fields: { ghUrl: 'url', ghName: 'name', ghNote: 'note', ghGroup: 'group', ghBranch: 'branch', ghVis: 'vis' },
    required: ['url'],
    titles: { add: 'Add a repository', save: 'Save repo', edit: function (r) { return 'Edit: ' + r.name; } },
    read: function (v, old, id) {
      var r = parseRepo(v.url);
      if (!r) return 'That does not look like a GitHub link.';
      var dupe = Object.keys(state.repos).filter(function (x) { return x !== id && state.repos[x].url === r.url; })[0];
      if (dupe) return 'This repo is already saved as "' + state.repos[dupe].name + '".';
      return { url: r.url, path: r.path, name: v.name || (r.path ? r.path.split('/')[1] : r.url),
        note: v.note, group: v.group, branch: v.branch, vis: v.vis === 'public' ? 'public' : 'private' };
    },
    matches: function (r, q, f) {
      if (f && repoCat(r) !== f) return false;
      return !q || hay(r, ['name', 'path', 'url', 'note', 'group']).indexOf(q) !== -1;
    },
    sort: function (a, b) { return textOf(a.name).localeCompare(textOf(b.name)); },
    group: repoCat,
    groupOrder: orderCats,
    groupTools: function (g, ids) {
      var all = miniBtn('gh-copy-cat', 'Copy all links', '', 'Copy all ' + g + ' repo links');
      all.dataset.cat = g;
      all.dataset.ids = ids.join(',');
      var clone = miniBtn('gh-clone-cat', 'Copy git clone', '', 'Copy git clone for all ' + g + ' repos');
      clone.dataset.ids = ids.join(',');
      return [all, clone];
    },
    onGroupTool: function (btn) {
      var ids = (btn.dataset.ids || '').split(',').filter(function (id) { return state.repos[id]; });
      if (!ids.length) return;
      var lines = ids.map(function (id) {
        var r = state.repos[id];
        return btn.classList.contains('gh-clone-cat') ? (r.path ? 'git clone ' + r.url + '.git' : '') : r.url;
      }).filter(Boolean);
      if (lines.length) copyWithFlash(btn, lines.join('\n') + '\n');
    },
    renderExtra: function (f) {
      var used = groupsOf('repos', 'group');
      fillGroupFilter(f.filter, 'All categories', orderCats(used.concat(Object.keys(state.repos).some(function (id) {
        return !textOf(state.repos[id].group).trim();
      }) && used.indexOf('Other') === -1 ? ['Other'] : [])));
      var suggest = REPO_CATS.slice();
      used.forEach(function (g) { if (suggest.indexOf(g) === -1) suggest.push(g); });
      fillDatalist($('ghGroupList'), suggest);
    },
    row: function (b, id, r) {
      rowText(b, r.name, r.path || r.url.replace(/^https?:\/\//, ''), r.vis === 'public' ? [pill('Public', 'gh-vis public')] : []);
    },
    detail: function (card, id, r) {
      detailHead(card, r.name, r.path || r.url, [pill(repoCat(r)), pill(r.vis === 'public' ? 'Public' : 'Private', 'gh-vis ' + (r.vis === 'public' ? 'public' : 'private'))]);
      var dl = document.createElement('dl');
      dl.className = 'emp-dl';
      detailRow(dl, 'Link', r.url, r.url, true);
      detailRow(dl, 'Main branch', r.branch);
      detailRow(dl, 'What it is', r.note);
      card.appendChild(dl);
    },
    detailButtons: function (id, r) {
      var b = [miniBtn('gh-copy primary-mini', 'Copy link', id)];
      if (r.path) b.push(miniBtn('gh-clone', 'Copy git clone', id));
      return b;
    },
    onDetail: function (btn, id, r) {
      if (btn.classList.contains('gh-copy')) copyWithFlash(btn, r.url);
      else if (btn.classList.contains('gh-clone')) copyWithFlash(btn, 'git clone ' + r.url + '.git');
    }
  });

  /* ----- Employees ----- */
  // Each social field takes either a username/handle or a full link; this turns it into a link.
  var SOCIALS = [
    ['gmail', 'Gmail'], ['insta', 'Instagram'], ['linkedin', 'LinkedIn'], ['x', 'X'],
    ['facebook', 'Facebook'], ['reddit', 'Reddit']];
  function socialLink(kind, value) {
    var v = textOf(value).trim();
    if (!v) return '';
    if (kind === 'gmail') return 'mailto:' + (v.indexOf('@') === -1 ? v + '@gmail.com' : v);
    if (/^https?:\/\//i.test(v) || /^(www\.)?[\w-]+\.(com|in)\//i.test(v)) return safeUrl(v);
    var h = v.replace(/^@/, '').replace(/^u\//i, '').replace(/\s+/g, '');
    var base = { insta: 'https://instagram.com/', linkedin: 'https://linkedin.com/in/', x: 'https://x.com/',
      facebook: 'https://facebook.com/', reddit: 'https://reddit.com/user/' }[kind];
    return base ? base + encodeURIComponent(h) : '';
  }
  function socialLabel(kind, value) {
    var v = textOf(value).trim();
    if (kind === 'gmail') return v.indexOf('@') === -1 ? v + '@gmail.com' : v;
    if (/^https?:\/\//i.test(v)) return v.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
    return v.charAt(0) === '@' || kind === 'reddit' || kind === 'linkedin' ? v : '@' + v;
  }
  function initials(name) {
    var p = textOf(name).trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  function detailRow(dl, label, value, href, external) {
    if (!value) return;
    var dt = document.createElement('dt');
    dt.textContent = label;
    var dd = document.createElement('dd');
    if (href) {
      var a = document.createElement('a');
      a.href = href;
      a.textContent = value;
      if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      dd.appendChild(a);
    } else dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  // Fields from the earlier, longer employee form, still shown if they were filled in.
  var OLD_EMP_FIELDS = [['role', 'Role'], ['phone', 'Phone'], ['email', 'Email'], ['team', 'Team'], ['joined', 'Joined'],
    ['salary', 'Salary'], ['skills', 'Skills'], ['address', 'Address'], ['emergency', 'Emergency contact'], ['note', 'Notes']];
  var employees = makeList({
    part: 'employees', prefix: 'em', emptyText: 'No employees added yet. Use "+ Add employee".',
    ids: { form: 'emForm', head: 'emHead', save: 'emSave', cancel: 'emCancel', msg: 'emMsg', list: 'emList',
      empty: 'emEmpty', count: 'emCount', search: 'emSearch' },
    fields: { emName: 'name', emGmail: 'gmail', emInsta: 'insta', emLinkedin: 'linkedin', emX: 'x',
      emFacebook: 'facebook', emReddit: 'reddit' },
    required: ['name'],
    titles: { add: 'Add an employee', save: 'Save employee', edit: function (e) { return 'Edit: ' + e.name; } },
    read: function (v, old) {
      var e = {};
      // Keep any details from the older form so nothing is lost on edit.
      if (old) OLD_EMP_FIELDS.forEach(function (p) { if (old[p[0]]) e[p[0]] = old[p[0]]; });
      Object.keys(v).forEach(function (k) { e[k] = v[k]; });
      if (e.gmail && /\s/.test(e.gmail)) return 'The Gmail id cannot have spaces.';
      return e;
    },
    matches: function (e, q) {
      return !q || hay(e, ['name', 'gmail', 'insta', 'linkedin', 'x', 'facebook', 'reddit', 'role']).indexOf(q) !== -1;
    },
    sort: function (a, b) { return textOf(a.name).localeCompare(textOf(b.name)); },
    row: function (b, id, e) {
      var av = document.createElement('span');
      av.className = 'emp-avatar';
      av.textContent = initials(e.name);
      b.classList.add('emp-row');
      b.appendChild(av);
      rowText(b, e.name, '', []);
    },
    detail: function (card, id, e) {
      var who = document.createElement('div');
      who.className = 'emp-who';
      var av = document.createElement('span');
      av.className = 'emp-avatar big';
      av.textContent = initials(e.name);
      who.appendChild(av);
      var h = document.createElement('h2');
      h.className = 'detail-title';
      h.textContent = e.name;
      who.appendChild(h);
      card.appendChild(who);
      var links = document.createElement('div');
      links.className = 'social-list';
      SOCIALS.forEach(function (s) {
        var href = socialLink(s[0], e[s[0]]);
        if (!href) return;
        var a = document.createElement('a');
        a.className = 'social-link ' + s[0];
        a.href = href;
        if (s[0] !== 'gmail') { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        var k = document.createElement('span');
        k.className = 'social-kind';
        k.textContent = s[1];
        var val = document.createElement('span');
        val.className = 'social-val';
        val.textContent = socialLabel(s[0], e[s[0]]);
        a.appendChild(k);
        a.appendChild(val);
        links.appendChild(a);
      });
      if (links.children.length) card.appendChild(links);
      else card.appendChild(para('empty', 'No Gmail or social links yet. Use Edit to add them.'));
      var dl = document.createElement('dl');
      dl.className = 'emp-dl';
      OLD_EMP_FIELDS.forEach(function (p) { detailRow(dl, p[1], e[p[0]]); });
      if (dl.children.length) card.appendChild(dl);
    },
    detailButtons: function (id, e) {
      var g = e.gmail ? socialLabel('gmail', e.gmail) : '';
      if (!g) return [];
      var b = miniBtn('emp-copy', 'Copy Gmail', id);
      b.dataset.value = g;
      return [b];
    },
    onDetail: function (btn) { if (btn.classList.contains('emp-copy')) copyWithFlash(btn, btn.dataset.value); }
  });

  /* ----- Instagram reference content ----- */
  // Only a link and a category. Categories are picked from a list; "+ New category…" adds one,
  // and every category already used shows up in the list from then on.
  var IG_CATS = ['Reels ideas', 'Hooks', 'Editing style', 'Carousel posts', 'Captions', 'Covers & thumbnails',
    'Trending audio', 'AI & tech', 'Product & app promo', 'Talking head', 'Memes & fun', 'Ads', 'Other'];
  var IG_NEW = '__new__';
  // Accepts instagram.com / instagr.am links (with or without https://) and drops tracking like ?igsh=.
  // Returns { url, kind, code } or null when it is not an Instagram link.
  function parseInsta(input) {
    var s = textOf(input).trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (!/^(www\.|m\.)?(instagram\.com|instagr\.am)$/i.test(u.hostname)) return null;
    var parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    var kinds = { reel: 'Reel', reels: 'Reel', p: 'Post', tv: 'Video', stories: 'Story' };
    // "/username/reel/CODE" is the same reel as "/reel/CODE".
    var at = parts.length > 2 && kinds[parts[1]] ? 1 : 0;
    if (kinds[parts[at]] && parts[at + 1]) {
      var k = kinds[parts[at]];
      if (k === 'Story') return { url: 'https://www.instagram.com/' + parts.join('/') + '/', kind: k, code: '@' + parts[at + 1] };
      var seg = k === 'Reel' ? 'reel' : parts[at];
      return { url: 'https://www.instagram.com/' + seg + '/' + parts[at + 1] + '/', kind: k, code: parts[at + 1] };
    }
    return { url: 'https://www.instagram.com/' + parts[0] + '/', kind: 'Profile', code: '@' + parts[0] };
  }
  function igCat(r) { return textOf(r.group).trim() || 'Other'; }
  function igOrder(names) {
    return names.slice().sort(function (a, b) {
      var ia = IG_CATS.indexOf(a), ib = IG_CATS.indexOf(b);
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    });
  }
  function igFillSelect() {
    var sel = $('igGroup');
    if (!sel || document.activeElement === sel) return;
    var chosen = sel.value;
    var all = IG_CATS.slice();
    groupsOf('instaRefs', 'group').forEach(function (g) { if (all.indexOf(g) === -1) all.push(g); });
    sel.textContent = '';
    igOrder(all).concat([IG_NEW]).forEach(function (g) {
      var o = document.createElement('option');
      o.value = g;
      o.textContent = g === IG_NEW ? '+ New category…' : g;
      sel.appendChild(o);
    });
    if (chosen && all.concat([IG_NEW]).indexOf(chosen) !== -1) sel.value = chosen;
    igShowNew();
  }
  function igShowNew() {
    var sel = $('igGroup'), wrap = $('igNewWrap'), input = $('igNew');
    if (!sel || !wrap || !input) return;
    var on = sel.value === IG_NEW;
    wrap.hidden = !on;
    input.required = on;
    if (!on) input.value = '';
  }
  var instaRefs = makeList({
    part: 'instaRefs', prefix: 'ig', emptyText: 'No Instagram links saved yet. Use "+ Add link".',
    ids: { form: 'igForm', head: 'igHead', save: 'igSave', cancel: 'igCancel', msg: 'igMsg', list: 'igList',
      empty: 'igEmpty', count: 'igCount', search: 'igSearch', filter: 'igFilter' },
    fields: { igUrl: 'url', igGroup: 'group', igNew: 'newGroup' },
    required: ['url'],
    titles: { add: 'Add Instagram reference', save: 'Save link', edit: function (r) { return 'Edit: ' + r.kind + ' ' + r.code; } },
    read: function (v, old, id) {
      var r = parseInsta(v.url);
      if (!r) return 'Paste an Instagram link (instagram.com/…).';
      var group = v.group === IG_NEW ? v.newGroup.replace(/\s+/g, ' ').slice(0, 40) : v.group;
      if (!group) return 'Type a name for the new category.';
      var dupe = Object.keys(state.instaRefs).filter(function (x) { return x !== id && state.instaRefs[x].url === r.url; })[0];
      if (dupe) return 'This link is already saved under "' + igCat(state.instaRefs[dupe]) + '".';
      return { url: r.url, kind: r.kind, code: r.code, group: group };
    },
    matches: function (r, q, f) {
      if (f && igCat(r) !== f) return false;
      return !q || hay(r, ['url', 'kind', 'code', 'group']).indexOf(q) !== -1;
    },
    // Newest first inside each category.
    sort: function (a, b) { return (b.created || 0) - (a.created || 0); },
    group: igCat,
    groupOrder: igOrder,
    groupTools: function (g, ids) {
      var all = miniBtn('ig-copy-cat', 'Copy all links', '', 'Copy all ' + g + ' links');
      all.dataset.ids = ids.join(',');
      return [all];
    },
    onGroupTool: function (btn) {
      var ids = (btn.dataset.ids || '').split(',').filter(function (id) { return state.instaRefs[id]; });
      if (ids.length) copyWithFlash(btn, ids.map(function (id) { return state.instaRefs[id].url; }).join('\n') + '\n');
    },
    renderExtra: function (f) {
      var used = Object.keys(state.instaRefs).map(function (id) { return igCat(state.instaRefs[id]); })
        .filter(function (g, i, a) { return a.indexOf(g) === i; });
      fillGroupFilter(f.filter, 'All categories', igOrder(used));
      igFillSelect();
    },
    row: function (b, id, r) { rowText(b, r.kind + ' · ' + r.code, '', []); },
    detail: function (card, id, r) {
      detailHead(card, r.kind + ' · ' + r.code, '', [pill(igCat(r))]);
      var dl = document.createElement('dl');
      dl.className = 'emp-dl';
      detailRow(dl, 'Link', r.url.replace(/^https:\/\/www\./, ''), r.url, true);
      card.appendChild(dl);
    },
    detailButtons: function (id) {
      return [miniBtn('ig-open primary-mini', 'Open on Instagram', id), miniBtn('ig-copy', 'Copy link', id)];
    },
    onDetail: function (btn, id, r) {
      if (btn.classList.contains('ig-open')) window.open(r.url, '_blank', 'noopener');
      else if (btn.classList.contains('ig-copy')) copyWithFlash(btn, r.url);
    }
  });
  if ($('igGroup')) {
    $('igGroup').addEventListener('change', function () { igShowNew(); if (!$('igNewWrap').hidden) $('igNew').focus(); });
    // A save or "Cancel edit" resets the form; hide the new-category box again.
    $('igForm').addEventListener('reset', function () { setTimeout(igShowNew, 0); });
  }

  function renderCollections() {
    prompts.render();
    repos.render();
    employees.render();
    instaRefs.render();
    drawDetail(false);
  }

  // Every list tab: "+ Add" button in the list header opens the form in a popup.
  var formPopsReady = false;
  function setupFormPops() {
    if (formPopsReady) return;
    formPopsReady = true;
    function headOf(tab) { return function () { var h = document.querySelector('#' + tab + ' .card-head'); return h; }; }
    function headNear(formId) {
      return function () {
        var list = $(formId.replace('Form', 'List'));
        var sec = list && list.closest('section');
        return sec && sec.querySelector('.card-head');
      };
    }
    popForm({ form: 'akForm', tab: 'tabKeys', whole: true, host: headOf('tabKeys'), label: 'Add API key' });
    popForm({ form: 'pmForm', tab: 'tabPrompts', whole: true, host: headOf('tabPrompts'), label: 'Add prompt' });
    popForm({ form: 'ghForm', tab: 'tabRepos', whole: true, host: headOf('tabRepos'), label: 'Add repo' });
    popForm({ form: 'emForm', tab: 'tabEmployees', whole: true, host: headOf('tabEmployees'), label: 'Add employee' });
    popForm({ form: 'igForm', tab: 'tabInsta', whole: true, host: headOf('tabInsta'), label: 'Add link' });
    popForm({ form: 'tmDocForm', tab: 'tabDocs', whole: true, host: headOf('tabDocs'), label: 'Add document' });
    popForm({ form: 'tmLinkForm', tab: 'tabLinks', title: 'Add a link', extra: ['tmLinkMsg'], host: headOf('tabLinks'), label: 'Add link' });
    popForm({ form: 'mmDocForm', tab: 'tabPartnerDocs', title: 'Add to Mohit Mummy Docs', host: headNear('mmDocForm'), label: 'Add' });
    popForm({ form: 'dmDocForm', tab: 'tabPartnerDocs', title: 'Add to Divyu Mummy Docs', host: headNear('dmDocForm'), label: 'Add' });
    popForm({ form: 'tmAssignForm', tab: 'tabTasks', whole: true, label: 'Assign task',
      host: function () { var l = $('tmMineList'); return l && l.closest('section').querySelector('.card-head'); } });
    popForm({ form: 'tmBoardForm', tab: 'tabBoard', whole: true, label: 'Add team task',
      host: function () { return document.querySelector('#tabBoard .board'); }, place: 'before' });
    popForm({ form: 'tmProjForm', tab: 'tabProjects', title: 'Add a project', label: 'Add project',
      host: function () { var c = $('tmProjAddCard'); return c && c.querySelector('.card-head'); } });
    var ideaWho = ROLE === 'admin' ? 'Admin' : 'Member';
    popForm({ form: 'tmIdeaForm' + ideaWho, tab: 'tabIdeas', title: 'Add an idea', label: 'Add idea',
      host: function () { return $('tmIdeaHead' + ideaWho); }, place: 'after' });
    popForm({ form: 'tmExpForm', tab: 'tabExpenses', whole: true, label: 'Add expense',
      host: function () { return document.querySelector('#tabExpenses .balance-card'); } });
  }

  /* ---------------- "Your tasks" popup when the site opens ---------------- */
  // Shows the signed-in person their pending assigned tasks once per browser session,
  // right after the first sync (or after a few seconds if sync is slow or off).
  var POPUP_KEY = 'stane-tasks-popup';
  var popup = { box: null, shown: false, open: false, timer: null };
  try { popup.shown = sessionStorage.getItem(POPUP_KEY) === '1'; } catch (e) { popup.shown = false; }

  function pendingForMe() {
    return Object.keys(state.tasks).filter(function (id) {
      return toOf(state.tasks[id]) === ROLE && !state.done[id];
    }).sort(function (a, b) {
      var x = state.tasks[a], y = state.tasks[b];
      var dx = (x.due || '9999') + (x.time || '99'), dy = (y.due || '9999') + (y.time || '99');
      return dx < dy ? -1 : dx > dy ? 1 : x.created - y.created;
    });
  }
  // "overdue" | "today" | "soon" (next 2 days) | "" for one task's due date.
  function dueKind(t, today) {
    if (!t.due) return '';
    if (t.due < today) return 'overdue';
    if (t.due === today) return 'today';
    var d = new Date(Number(t.due.slice(0, 4)), Number(t.due.slice(5, 7)) - 1, Number(t.due.slice(8, 10)));
    var n = new Date(); n.setHours(0, 0, 0, 0);
    return (d - n) / 86400000 <= 2 ? 'soon' : '';
  }
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  function maybeShowTaskPopup() {
    clearTimeout(popup.timer);
    if (popup.shown || !user) return;
    popup.shown = true;
    try { sessionStorage.setItem(POPUP_KEY, '1'); } catch (e) { /* once per page load then */ }
    if (pendingForMe().length) { popup.open = true; renderTaskPopup(); }
  }
  function closeTaskPopup() {
    popup.open = false;
    if (popup.box) { popup.box.hidden = true; popup.box.textContent = ''; }
    document.documentElement.classList.remove('modal-open');
  }
  function openAssignedTab() {
    var btn = document.querySelector('[data-tab="tabTasks"]') || $('tabBtnTeam');
    if (btn) btn.click();
  }
  function renderTaskPopup() {
    if (!popup.open) return;
    var ids = pendingForMe();
    if (!popup.box) {
      popup.box = document.createElement('div');
      popup.box.className = 'plan-shade task-pop-shade';
      popup.box.addEventListener('click', function (e) {
        if (e.target === popup.box || e.target.closest('.task-pop-later')) { closeTaskPopup(); return; }
        if (e.target.closest('.task-pop-open')) { closeTaskPopup(); openAssignedTab(); return; }
      });
      popup.box.addEventListener('change', function (e) {
        var box = e.target.closest('input[type=checkbox][data-id]');
        if (!box || !state.tasks[box.dataset.id]) return;
        if (box.checked) state.done[box.dataset.id] = Date.now();
        else delete state.done[box.dataset.id];
        stamp('d:' + box.dataset.id);
        save();
        render();
      });
      document.body.appendChild(popup.box);
    }
    var keepFocus = document.activeElement && popup.box.contains(document.activeElement);
    popup.box.textContent = '';
    popup.box.hidden = false;
    document.documentElement.classList.add('modal-open');

    var today = todayKey();
    var overdue = ids.filter(function (id) { return dueKind(state.tasks[id], today) === 'overdue'; }).length;
    var dueToday = ids.filter(function (id) { return dueKind(state.tasks[id], today) === 'today'; }).length;

    var card = document.createElement('section');
    card.className = 'card plan-card task-pop';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'taskPopTitle');

    var top = document.createElement('div');
    top.className = 'task-pop-top';
    var hello = document.createElement('p');
    hello.className = 'task-pop-hello';
    hello.textContent = greeting() + ', ' + nameOf(ROLE);
    var h = document.createElement('h2');
    h.id = 'taskPopTitle';
    h.className = 'task-pop-title';
    h.textContent = ids.length
      ? ids.length + ' task' + (ids.length === 1 ? '' : 's') + ' waiting for you'
      : 'All done. Nothing pending.';
    top.appendChild(hello);
    top.appendChild(h);
    if (overdue || dueToday) {
      var chips = document.createElement('div');
      chips.className = 'task-pop-chips';
      if (overdue) chips.appendChild(pill(overdue + ' overdue', 'task-pop-chip overdue'));
      if (dueToday) chips.appendChild(pill(dueToday + ' due today', 'task-pop-chip today'));
      top.appendChild(chips);
    }
    card.appendChild(top);

    if (ids.length) {
      var ul = document.createElement('ul');
      ul.className = 'task-pop-list';
      ids.forEach(function (id) {
        var t = state.tasks[id], kind = dueKind(t, today);
        var li = document.createElement('li');
        li.className = 'task-pop-item' + (kind ? ' ' + kind : '');
        var label = document.createElement('label');
        var box = document.createElement('input');
        box.type = 'checkbox';
        box.dataset.id = id;
        box.setAttribute('aria-label', 'Mark done: ' + t.text);
        var body = document.createElement('span');
        body.className = 'task-pop-body';
        var text = document.createElement('span');
        text.className = 'task-pop-text';
        text.textContent = t.text;
        var meta = document.createElement('span');
        meta.className = 'task-pop-meta';
        var at = t.time ? ', ' + formatTime(t.time) : '';
        var when = !t.due ? (t.time ? formatTime(t.time) : 'No due date')
          : kind === 'overdue' ? 'Overdue · ' + shortKey(t.due) + at
          : kind === 'today' ? 'Due today' + at
          : 'Due ' + shortKey(t.due) + at;
        meta.textContent = when + ' · From ' + nameOf(fromOf(t));
        body.appendChild(text);
        body.appendChild(meta);
        label.appendChild(box);
        label.appendChild(body);
        li.appendChild(label);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    var row = document.createElement('div');
    row.className = 'task-pop-actions';
    var later = document.createElement('button');
    later.type = 'button';
    later.className = 'ghost-btn task-pop-later';
    later.textContent = ids.length ? 'Later' : 'Close';
    var go = document.createElement('button');
    go.type = 'button';
    go.className = 'primary-btn task-pop-open';
    go.textContent = 'Open Assigned';
    row.appendChild(later);
    row.appendChild(go);
    card.appendChild(row);
    popup.box.appendChild(card);
    if (!keepFocus) go.focus();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && popup.open) closeTaskPopup(); });
  popup.timer = setTimeout(maybeShowTaskPopup, 4000);

  /* ---------------- sync ---------------- */
  var sync = { token: '', personal: false, busy: false, again: false, timer: null };
  function readToken() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    sync.token = saved.token || '';
    sync.personal = false;
    // The admin can reuse the personal sync token if it also has access to the team repo.
    if (!sync.token && !saved.off && ROLE === 'admin') {
      try {
        sync.token = (JSON.parse(localStorage.getItem(PERSONAL_SYNC_KEY) || '{}').token) || '';
        sync.personal = !!sync.token;
      } catch (e) { sync.token = ''; }
    }
  }
  readToken();

  function setStatus(kind, text) {
    if (el.chip) {
      el.chip.textContent = kind === 'off' ? 'Not connected' : kind === 'busy' ? 'Syncing…' : kind === 'ok' ? 'Synced' : 'Sync problem';
      el.chip.className = 'sync-chip ' + kind;
    }
    if (el.status) { el.status.textContent = text; el.status.className = 'sync-status ' + kind; }
    if (el.syncNow) el.syncNow.hidden = !sync.token;
    if (el.syncOff) el.syncOff.hidden = !sync.token;
    if (el.tokenHint) {
      el.tokenHint.textContent = sync.personal
        ? 'Using your personal sync token. It must also have access to the stane-ai-team-data repository.'
        : '';
    }
  }

  function b64encode(text) {
    var bytes = new TextEncoder().encode(text), bin = '';
    for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(b64.replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function ghFetch(method, body, raw) {
    return fetch(API, {
      method: method,
      cache: 'no-store',
      headers: {
        'Accept': raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'Authorization': 'Bearer ' + sync.token
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }
  function syncError(status) {
    if (status === 401) return new Error('GitHub rejected the token. It may be wrong or expired. Paste a new one.');
    if (status === 403) return new Error('GitHub refused access. The token needs "Contents: Read and write" on stane-ai-team-data.');
    if (status === 404) return new Error('The token cannot reach the team repository stane-ai-team-data. Check its repository access.');
    return new Error('GitHub returned an error (' + status + '). It will be tried again.');
  }

  async function syncOnce() {
    var res = await ghFetch('GET');
    var remote = null, sha;
    if (res.status === 200) {
      var info = await res.json();
      sha = info.sha;
      var text;
      if (info.content) text = b64decode(info.content);
      else {
        var rawRes = await ghFetch('GET', null, true);
        if (!rawRes.ok) throw syncError(rawRes.status);
        text = await rawRes.text();
      }
      try { remote = normalize(JSON.parse(text)); }
      catch (e) { throw new Error('The team data file is damaged and could not be read.'); }
    } else if (res.status !== 404) {
      throw syncError(res.status);
    }

    var merged = remote ? merge(state, remote) : build(atoms(state), state.stamps);
    var mergedCanon = stable(merged);
    if (mergedCanon !== canon(state)) { state = merged; saveLocal(); render(); }
    if (remote && canon(remote) === mergedCanon) return true;

    var body = { message: 'Team sync', content: b64encode(JSON.stringify(merged)) };
    if (sha) body.sha = sha;
    var put = await ghFetch('PUT', body);
    if (put.ok) return true;
    if (put.status === 409 || put.status === 422) return false; // someone else saved first; merge again
    if (put.status === 404 && !sha) {
      throw new Error('The team repository stane-ai-team-data was not found, or the token cannot write to it.');
    }
    throw syncError(put.status);
  }

  async function syncNow() {
    if (!sync.token) { setStatus('off', 'Sync is not switched on yet. Changes stay on this device until it is.'); return; }
    if (sync.busy) { sync.again = true; return; }
    sync.busy = true;
    setStatus('busy', 'Syncing…');
    try {
      var ok = false;
      for (var i = 0; i < 4 && !ok; i++) ok = await syncOnce();
      if (!ok) throw new Error('Both of you were saving at the same time. It will be tried again.');
      var t = new Date();
      setStatus('ok', 'Synced at ' + formatTime(pad(t.getHours()) + ':' + pad(t.getMinutes())) + '.');
      maybeShowTaskPopup();
    } catch (e) {
      setStatus('error', e instanceof TypeError ? 'Could not reach GitHub. Check the internet connection; it will be tried again.' : e.message);
    }
    sync.busy = false;
    if (sync.again) { sync.again = false; scheduleSync(); }
  }
  function scheduleSync() {
    if (!sync.token) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(syncNow, 1200);
  }

  if (el.form) {
    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var token = el.token.value.trim();
      if (!token) return;
      el.token.value = '';
      try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: token })); } catch (err) { /* kept for this visit only */ }
      sync.token = token;
      sync.personal = false;
      syncNow();
    });
  }
  if (el.syncNow) el.syncNow.addEventListener('click', syncNow);
  if (el.syncOff) {
    el.syncOff.addEventListener('click', function () {
      try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ off: true })); } catch (err) { /* nothing to keep */ }
      sync.token = '';
      sync.personal = false;
      clearTimeout(sync.timer);
      setStatus('off', 'Not connected on this device.');
    });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', syncNow);
  setInterval(function () { if (document.visibilityState === 'visible') syncNow(); }, 60000);

  /* ---------------- events: tasks ---------------- */
  function onTaskToggle(e) {
    if (e.target.type !== 'checkbox') return;
    var id = e.target.closest('li').dataset.id;
    if (e.target.checked) state.done[id] = Date.now();
    else delete state.done[id];
    stamp('d:' + id);
    save();
    render();
  }
  function onTaskClick(e) {
    if (e.target.closest('.remarks')) return;
    var del = e.target.closest('.del');
    if (!del) return;
    var id = del.closest('li').dataset.id;
    var t = state.tasks[id];
    if (!t || (fromOf(t) !== ROLE && ROLE !== 'admin')) return;
    armOrRun(del, function () {
      delete state.tasks[id];
      delete state.done[id];
      stamp('t:' + id);
      stamp('d:' + id);
      dropRemarks(id);
      save();
      render();
    });
  }
  [el.mine, el.mineDone, el.sent, el.sentDone].forEach(function (list) {
    if (!list) return;
    list.addEventListener('change', onTaskToggle);
    list.addEventListener('click', onTaskClick);
  });

  if (el.assignForm) {
    el.assignForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = el.assignText.value.trim();
      if (!text) return;
      var id = newId();
      state.tasks[id] = {
        text: text,
        due: el.assignDue.value || '',
        time: el.assignTime.value || '',
        note: el.assignNote.value.trim(),
        from: ROLE,
        to: OTHER,
        created: Date.now()
      };
      stamp('t:' + id);
      el.assignText.value = '';
      el.assignTime.value = '';
      el.assignNote.value = '';
      save();
      render();
      el.assignText.focus();
    });
  }

  if (el.namesForm) {
    el.namesForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var inputs = { admin: el.nameAdmin, member: el.nameMember };
      Object.keys(inputs).forEach(function (who) {
        var input = inputs[who];
        if (!input || (ROLE !== 'admin' && who !== ROLE)) return;
        var v = input.value.trim().slice(0, 40);
        if (v === (state.names[who] || '')) return;
        if (v) state.names[who] = v; else delete state.names[who];
        stamp('n:' + who);
      });
      save();
      render();
      if (el.namesMsg) { el.namesMsg.textContent = 'Saved.'; el.namesMsg.className = 'form-msg ok'; }
    });
  }

  /* ---------------- events: ideas ---------------- */
  ['admin', 'member'].forEach(function (who) {
    var form = el.ideaForm[who];
    if (form && who === ROLE) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = el.ideaInput[who].value.trim();
        if (!text) return;
        var id = newId();
        var catSel = el.ideaCat[who], remIn = el.ideaRemind[who];
        var idea = { by: ROLE, text: text, created: Date.now() };
        if (catSel && IDEA_CATS[catSel.value]) idea.cat = catSel.value;
        ideaFilter = idea.cat || 'startup';
        if (remIn && remIn.value) { idea.remind = remIn.value; askNotifyPermission(); }
        state.ideas[id] = idea;
        stamp('i:' + id);
        el.ideaInput[who].value = '';
        if (remIn) remIn.value = '';
        save();
        render();
        el.ideaInput[who].focus();
      });
      el.ideaInput[who].addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
      });
    }
    if (el.ideas[who]) {
      el.ideas[who].addEventListener('submit', function (e) {
        var form = e.target;
        if (!form.classList.contains('remind-form')) return;
        e.preventDefault();
        var rid = form.closest('li').dataset.id;
        var value = form.querySelector('input').value;
        if (!value || !state.ideas[rid] || state.ideas[rid].by !== ROLE) return;
        delete editingRemind[rid];
        delete notified[rid];
        askNotifyPermission();
        updateIdea(rid, { remind: value, reminded: false });
      });
      el.ideas[who].addEventListener('click', function (e) {
        var rli = e.target.closest('li');
        if (rli && e.target.closest('.idea-open')) { openPlan(rli.dataset.id); return; }
        if (rli && e.target.closest('.remind-edit')) {
          editingRemind[rli.dataset.id] = !editingRemind[rli.dataset.id];
          render();
          var inp = el.ideas[who].querySelector('li[data-id="' + rli.dataset.id + '"] .remind-form input');
          if (inp) inp.focus();
          return;
        }
        if (rli && e.target.closest('.remind-clear')) {
          delete editingRemind[rli.dataset.id];
          updateIdea(rli.dataset.id, { remind: '', reminded: false });
          return;
        }
        var del = e.target.closest('.del');
        if (!del) return;
        var id = del.closest('li').dataset.id;
        var idea = state.ideas[id];
        if (!idea || (idea.by !== ROLE && ROLE !== 'admin')) return;
        armOrRun(del, function () {
          delete state.ideas[id];
          stamp('i:' + id);
          dropPlan(id);
          save();
          render();
        });
      });
    }
  });

  document.querySelectorAll('.idea-filter button[data-cat]').forEach(function (b) {
    b.addEventListener('click', function () {
      ideaFilter = b.dataset.cat;
      ['admin', 'member'].forEach(function (w) { if (el.ideaCat[w]) el.ideaCat[w].value = ideaFilter; });
      renderIdeas();
    });
  });

  /* ---------------- events: expenses ---------------- */
  var BILL_TYPE = /^(application\/pdf|image\/(png|jpeg|webp))$/i;
  var BILL_EXT = /\.(pdf|png|jpe?g|webp)$/i;
  async function downloadBill(btn) {
    var x = state.expenses[btn.dataset.id];
    if (!x || !x.receipt) return;
    var label = btn.textContent;
    if (!sync.token) { btn.textContent = 'Sign in first'; return; }
    btn.disabled = true;
    btn.textContent = 'Downloading…';
    try {
      var res = await filesFetch(x.receipt.path, { raw: true });
      if (!res.ok) throw new Error(res.status);
      var blob = await res.blob();
      if (x.receipt.mime) blob = new Blob([blob], { type: x.receipt.mime });
      saveBlob(x.receipt.name || 'bill', blob);
      btn.textContent = label;
    } catch (err) {
      btn.textContent = 'Failed, try again';
    }
    btn.disabled = false;
  }
  // Remove a file from the private data repo; if this fails the file just stays there.
  async function removeStoredFile(path, message) {
    if (!sync.token) return;
    try {
      var info = await filesFetch(path);
      if (info.ok) {
        var j = await info.json();
        await filesFetch(path, { method: 'DELETE', body: { message: message, sha: j.sha } });
      }
    } catch (err) { /* ignore */ }
  }
  function setExpMsg(text, kind) {
    if (!el.expMsg) return;
    el.expMsg.textContent = text;
    el.expMsg.className = 'form-msg' + (kind ? ' ' + kind : '');
  }
  function shiftExpMonth(delta) {
    var p = expView.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1 + delta, 1);
    expView = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    renderExpenses();
  }
  if (el.expForm) {
    el.expPaidBy.value = ROLE;
    el.expDate.value = todayKey();
    el.expDate.max = todayKey();
    el.expPaidBy.addEventListener('change', renderExpenses);
    el.expPrev.addEventListener('click', function () { shiftExpMonth(-1); });
    el.expNext.addEventListener('click', function () { shiftExpMonth(1); });
    el.expForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var amount = Math.round(parseFloat(el.expAmount.value) * 100);
      var what = el.expWhat.value.trim();
      var date = el.expDate.value;
      if (!(amount > 0)) { setExpMsg('Enter an amount above zero.', 'error'); return; }
      if (!what) { setExpMsg('Write what it was for.', 'error'); return; }
      if (!date) { setExpMsg('Choose a date.', 'error'); return; }
      var split = el.expSplit.value;
      var id = newId();
      var file = el.expFile && el.expFile.files && el.expFile.files[0];
      var receipt = null;
      if (file) {
        if (!BILL_TYPE.test(file.type || '') && !BILL_EXT.test(file.name)) { setExpMsg('The bill must be a PDF or an image (PNG, JPG, WEBP).', 'error'); return; }
        if (file.size > DOC_MAX) { setExpMsg('The bill can be up to 10 MB.', 'error'); return; }
        if (!sync.token) { setExpMsg('Sign in with sync turned on to upload a bill.', 'error'); return; }
        var safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'bill';
        var path = 'receipts/' + id + '/' + safeName;
        var btn = el.expForm.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;
        setExpMsg('Uploading bill…');
        try {
          var res = await filesFetch(path, { method: 'PUT', body: { message: 'Add expense bill', content: await readAsBase64(file) } });
          if (!res.ok) throw new Error(res.status === 413 || res.status === 422 ? 'GitHub refused the file (too big or not allowed).' : 'Upload failed (' + res.status + ').');
        } catch (err) {
          if (btn) btn.disabled = false;
          setExpMsg(err instanceof TypeError ? 'Could not reach GitHub. Check the internet connection.' : err.message, 'error');
          return;
        }
        if (btn) btn.disabled = false;
        receipt = { path: path, name: file.name.slice(0, 120), size: file.size, mime: file.type || '' };
      }
      state.expenses[id] = {
        amount: amount, what: what, date: date,
        paidBy: el.expPaidBy.value === 'member' ? 'member' : 'admin',
        split: SPLITS.indexOf(split) !== -1 ? split : 'half',
        by: ROLE, created: Date.now()
      };
      if (receipt) state.expenses[id].receipt = receipt;
      stamp('x:' + id);
      el.expAmount.value = '';
      el.expWhat.value = '';
      if (el.expFile) el.expFile.value = '';
      expView = date.slice(0, 7);
      save();
      render();
      setExpMsg('Added.', 'ok');
      el.expAmount.focus();
    });
    el.expList.addEventListener('click', function (e) {
      var rc = e.target.closest('.exp-receipt');
      if (rc) { downloadReceipt(rc.dataset.id, rc.dataset.format); return; }
      var bill = e.target.closest('.exp-bill');
      if (bill) { downloadBill(bill); return; }
      var del = e.target.closest('.del');
      if (!del) return;
      var id = del.closest('li').dataset.id;
      var x = state.expenses[id];
      if (!x || (x.by !== ROLE && ROLE !== 'admin')) return;
      armOrRun(del, function () {
        delete state.expenses[id];
        stamp('x:' + id);
        save();
        render();
        if (x.receipt && x.receipt.path) removeStoredFile(x.receipt.path, 'Delete expense bill');
      });
    });
  }

  /* ---------------- events: team task board ---------------- */
  if (el.boardForm) {
    el.boardDue.min = todayKey();
    el.boardForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = el.boardText.value.trim();
      if (!text) return;
      var owner = el.boardOwner.value;
      var id = newId();
      state.shared[id] = {
        text: text,
        owner: owner === 'admin' || owner === 'member' ? owner : 'both',
        due: el.boardDue.value || '',
        by: ROLE,
        created: Date.now()
      };
      stamp('s:' + id);
      el.boardText.value = '';
      el.boardDue.value = '';
      save();
      render();
      el.boardText.focus();
    });
    ['todo', 'doing', 'done'].forEach(function (key) {
      var list = el.board[key];
      list.addEventListener('change', function (e) {
        if (!e.target.classList.contains('status-select')) return;
        var id = e.target.closest('li').dataset.id;
        if (!state.shared[id]) return;
        state.sharedStatus[id] = { status: e.target.value, by: ROLE, at: Date.now() };
        stamp('ss:' + id);
        save();
        render();
      });
      list.addEventListener('click', function (e) {
        if (e.target.closest('.remarks')) return;
        var del = e.target.closest('.del');
        if (!del) return;
        var id = del.closest('li').dataset.id;
        var t = state.shared[id];
        if (!t || (t.by !== ROLE && ROLE !== 'admin')) return;
        armOrRun(del, function () {
          delete state.shared[id];
          delete state.sharedStatus[id];
          stamp('s:' + id);
          stamp('ss:' + id);
          dropRemarks(id);
          save();
          render();
        });
      });
    });
  }

  /* ---------------- events: remarks ---------------- */
  document.addEventListener('input', function (e) {
    var key = e.target.dataset && e.target.dataset.draft;
    if (key) drafts[key] = e.target.value;
  });
  document.addEventListener('click', function (e) {
    var wrap = e.target.closest('.remarks');
    if (!wrap) return;
    var on = wrap.dataset.on;
    if (e.target.closest('.remark-toggle')) {
      openRemarks[on] = !openRemarks[on];
      render();
      if (openRemarks[on]) {
        var input = document.querySelector('[data-draft="r:' + on + '"]');
        if (input) input.focus();
      }
      return;
    }
    var del = e.target.closest('.remark-del');
    if (!del) return;
    var rid = del.closest('li').dataset.rid;
    var r = state.remarks[rid];
    if (!r || (r.by !== ROLE && ROLE !== 'admin')) return;
    armOrRun(del, function () {
      delete state.remarks[rid];
      stamp('r:' + rid);
      save();
      render();
    });
  });
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.classList.contains('remark-form')) return;
    e.preventDefault();
    var on = form.closest('.remarks').dataset.on;
    var input = form.querySelector('input');
    var text = input.value.trim();
    if (!text || (!state.tasks[on] && !state.shared[on])) return;
    var id = newId();
    state.remarks[id] = { on: on, by: ROLE, text: text, created: Date.now() };
    stamp('r:' + id);
    delete drafts['r:' + on];
    input.value = '';
    save();
    render();
  });

  /* ---------------- events: projects ---------------- */
  if (el.projView) {
    el.projView.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-view]');
      if (!b) return;
      projView = b.dataset.view === 'tasks' ? 'tasks' : 'list';
      try { localStorage.setItem(PROJ_VIEW_KEY, projView); } catch (err) { /* this visit only */ }
      if (el.projHint) el.projHint.hidden = projView === 'tasks';
      renderProjects();
    });
  }
  if (el.projForm) {
    el.projForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = el.projName.value.trim();
      if (!name) return;
      var id = newId();
      state.projects[id] = { name: name, note: el.projNote.value.trim(), by: ROLE, created: Date.now() };
      stamp('p:' + id);
      el.projName.value = '';
      el.projNote.value = '';
      save();
      render();
      el.projName.focus();
    });
  }
  if (el.projList) {
    el.projList.addEventListener('submit', function (e) {
      var form = e.target;
      if (form.classList.contains('desc-form')) {
        e.preventDefault();
        var dpid = form.closest('.project-card').dataset.id;
        var proj = state.projects[dpid];
        if (!proj) return;
        var next = {};
        Object.keys(proj).forEach(function (k) { next[k] = proj[k]; });
        var f = form.elements;
        next.note = f.note.value.trim();
        next.tag = f.tag.value.trim().slice(0, 30);
        next.repo = safeUrl(f.repo.value);
        next.live = safeUrl(f.live.value);
        state.projects[dpid] = next;
        stamp('p:' + dpid);
        delete editingDesc[dpid];
        clearDetailDrafts(dpid);
        save();
        render();
        return;
      }
      if (!form.classList.contains('impl-form')) return;
      e.preventDefault();
      var pid = form.closest('.project-card').dataset.id;
      var input = form.querySelector('input');
      var text = input.value.trim();
      if (!text || !state.projects[pid]) return;
      var id = newId();
      state.impl[id] = { project: pid, text: text, status: 'todo', by: ROLE, created: Date.now() };
      stamp('im:' + id);
      delete drafts['im:' + pid];
      input.value = '';
      save();
      render();
    });
    el.projList.addEventListener('change', function (e) {
      if (!e.target.classList.contains('impl-status')) return;
      var iid = e.target.closest('li').dataset.iid;
      var it = state.impl[iid];
      if (!it) return;
      var next = {};
      Object.keys(it).forEach(function (k) { next[k] = it[k]; });
      next.status = e.target.value === 'doing' || e.target.value === 'done' ? e.target.value : 'todo';
      next.statusBy = ROLE;
      next.statusAt = Date.now();
      state.impl[iid] = next;
      stamp('im:' + iid);
      save();
      render();
    });
    el.projList.addEventListener('click', function (e) {
      var descBtn = e.target.closest('.desc-edit, .desc-cancel');
      if (descBtn) {
        var dpid = descBtn.closest('.project-card').dataset.id;
        clearDetailDrafts(dpid);
        if (descBtn.classList.contains('desc-edit')) editingDesc[dpid] = true;
        else delete editingDesc[dpid];
        render();
        var area = document.querySelector('[data-draft="pd:' + dpid + ':note"]');
        if (area) { area.focus(); area.setSelectionRange(area.value.length, area.value.length); }
        return;
      }
      var del = e.target.closest('.impl-del, .project-del');
      if (!del) return;
      if (del.classList.contains('impl-del')) {
        var iid = del.closest('li').dataset.iid;
        var it = state.impl[iid];
        if (!it || (it.by !== ROLE && ROLE !== 'admin')) return;
        armOrRun(del, function () {
          delete state.impl[iid];
          stamp('im:' + iid);
          save();
          render();
        });
        return;
      }
      var pid = del.closest('.project-card').dataset.id;
      var p = state.projects[pid];
      if (!p || (p.by !== ROLE && ROLE !== 'admin')) return;
      armOrRun(del, function () {
        Object.keys(state.impl).forEach(function (iid) {
          if (state.impl[iid].project === pid) { delete state.impl[iid]; stamp('im:' + iid); }
        });
        delete state.projects[pid];
        stamp('p:' + pid);
        save();
        render();
      });
    });
  }

  /* ---------------- app credentials (encrypted vault) ---------------- */
  // Every credential is encrypted in the browser (AES-GCM, key from the vault password
  // via PBKDF2) before it is saved or synced. Only the scrambled data ever leaves the
  // device; the password and the key are never stored anywhere.
  var VAULT_ITER = 600000;
  var VAULT_IDLE_MS = 15 * 60 * 1000;
  var vault = { key: null, salt: '', plain: {}, failed: {}, shown: {}, busy: false, timer: null };
  var cv = {
    stateChip: $('tmVaultState'), hint: $('tmVaultHint'), form: $('tmVaultForm'), pass: $('tmVaultPass'),
    pass2Wrap: $('tmVaultPass2Wrap'), pass2: $('tmVaultPass2'), btn: $('tmVaultBtn'), msg: $('tmVaultMsg'),
    lockRow: $('tmVaultLockRow'), lock: $('tmVaultLock'), addCard: $('tmCredAddCard'), credForm: $('tmCredForm'),
    project: $('tmCredProject'), title: $('tmCredTitle'), login: $('tmCredLogin'), secret: $('tmCredSecret'),
    note: $('tmCredNote'), credMsg: $('tmCredMsg'), list: $('tmCredList'), empty: $('tmCredEmpty'), count: $('tmCredCount')
  };
  var hasCrypto = !!(window.crypto && crypto.subtle && window.TextEncoder);

  function bytesToB64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function vaultKey(pass, saltB64, iter) {
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations: iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(key, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
  }
  async function unseal(key, box) {
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(box.iv) }, key, b64ToBytes(box.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  function vaultMeta() {
    var m = state.vaultMeta.main;
    return m && m.salt && m.check ? m : null;
  }

  function lockVault(reason) {
    vault.key = null;
    vault.salt = '';
    vault.plain = {};
    vault.failed = {};
    vault.shown = {};
    clearTimeout(vault.timer);
    if (cv.msg && reason) { cv.msg.textContent = reason; cv.msg.className = 'form-msg'; }
    renderCreds();
  }
  function touchVault() {
    if (!vault.key) return;
    clearTimeout(vault.timer);
    vault.timer = setTimeout(function () { lockVault('Locked after 15 minutes without use.'); }, VAULT_IDLE_MS);
  }
  async function decryptMissing() {
    if (!vault.key || vault.busy) return;
    var todo = Object.keys(state.vault).filter(function (id) { return !vault.plain[id] && !vault.failed[id]; });
    if (!todo.length) return;
    vault.busy = true;
    var key = vault.key;
    for (var i = 0; i < todo.length; i++) {
      var id = todo[i], item = state.vault[id];
      try { vault.plain[id] = await unseal(key, item.box); }
      catch (e) { vault.failed[id] = true; }
    }
    vault.busy = false;
    if (vault.key === key) renderCreds();
  }

  function credLine(id, label, value, field, secret) {
    var row = document.createElement('div');
    row.className = 'cred-line';
    var k = document.createElement('span');
    k.className = 'cred-key';
    k.textContent = label;
    var v = document.createElement('code');
    v.className = 'cred-val';
    v.textContent = secret && !vault.shown[id] ? '••••••••••' : value;
    row.appendChild(k);
    row.appendChild(v);
    if (secret) {
      var show = document.createElement('button');
      show.type = 'button';
      show.className = 'mini-btn cred-show';
      show.textContent = vault.shown[id] ? 'Hide' : 'Show';
      row.appendChild(show);
    }
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'mini-btn cred-copy';
    copy.dataset.field = field;
    copy.textContent = 'Copy';
    row.appendChild(copy);
    return row;
  }

  function renderCreds() {
    if (!cv || !cv.list) return;
    var meta = vaultMeta();
    if (vault.key && (!meta || meta.salt !== vault.salt)) { lockVault('The vault password was changed on another device. Unlock again.'); return; }
    var unlocked = !!vault.key;
    var ids = Object.keys(state.vault);
    cv.count.textContent = ids.length;

    cv.stateChip.textContent = unlocked ? 'Unlocked' : 'Locked';
    cv.stateChip.className = 'count-pill vault-chip ' + (unlocked ? 'open' : 'shut');
    cv.form.hidden = unlocked;
    cv.lockRow.hidden = !unlocked;
    cv.addCard.hidden = !unlocked;
    cv.pass2Wrap.hidden = !!meta;
    cv.pass2.required = !meta;
    cv.btn.textContent = meta ? 'Unlock' : 'Create vault';
    if (!hasCrypto) {
      cv.hint.textContent = 'This browser cannot encrypt here. Open the site over https (the GitHub Pages link) to use the vault.';
      cv.btn.disabled = true;
    } else if (unlocked) {
      cv.hint.textContent = 'Values are encrypted on this device before they sync. The vault locks itself after 15 minutes without use.';
    } else if (meta) {
      cv.hint.textContent = 'Enter the vault password to see or add credentials. Both of you use the same vault password.';
    } else {
      cv.hint.textContent = 'Create a vault password (8+ characters) and give it to your partner privately. ' +
        'Everything is encrypted with it before syncing, so GitHub only sees scrambled data. ' +
        'If the password is forgotten, the saved values cannot be recovered.';
    }

    // Project choices in the add form.
    if (cv.project && document.activeElement !== cv.project) {
      var chosen = cv.project.value;
      cv.project.textContent = '';
      var general = document.createElement('option');
      general.value = '';
      general.textContent = 'General (no project)';
      cv.project.appendChild(general);
      Object.keys(state.projects).sort(function (a, b) {
        return (state.projects[a].created || 0) - (state.projects[b].created || 0);
      }).forEach(function (pid) {
        var o = document.createElement('option');
        o.value = pid;
        o.textContent = state.projects[pid].name;
        cv.project.appendChild(o);
      });
      cv.project.value = chosen && state.projects[chosen] ? chosen : '';
    }

    cv.list.textContent = '';
    if (!unlocked) {
      cv.empty.hidden = false;
      cv.empty.textContent = ids.length ? 'Unlock the vault to see ' + ids.length + ' saved credential' + (ids.length === 1 ? '' : 's') + '.' : 'No credentials saved yet.';
      return;
    }
    decryptMissing();
    cv.empty.textContent = 'No credentials saved yet.';
    cv.empty.hidden = ids.length > 0;

    // Group by project, in project order; credentials of deleted projects fall under General.
    var groups = {};
    ids.forEach(function (id) {
      var pid = state.vault[id].project;
      var g = pid && state.projects[pid] ? pid : '';
      (groups[g] = groups[g] || []).push(id);
    });
    var order = Object.keys(groups).sort(function (a, b) {
      if (!a) return 1;
      if (!b) return -1;
      return (state.projects[a].created || 0) - (state.projects[b].created || 0);
    });
    order.forEach(function (g) {
      var h = document.createElement('h3');
      h.textContent = g ? state.projects[g].name : 'General';
      cv.list.appendChild(h);
      var ul = document.createElement('ul');
      ul.className = 'board-list cred-list';
      groups[g].sort(function (a, b) { return state.vault[a].created - state.vault[b].created; }).forEach(function (id) {
        var item = state.vault[id], c = vault.plain[id];
        var li = document.createElement('li');
        li.className = 'board-item cred-item';
        li.dataset.id = id;
        var head = document.createElement('div');
        head.className = 'remark-head';
        var t = document.createElement('strong');
        t.className = 'cred-title';
        t.textContent = c ? c.title : vault.failed[id] ? 'Cannot be opened with this password' : 'Opening…';
        head.appendChild(t);
        var when = document.createElement('span');
        when.textContent = nameOf(item.by) + ' · ' + shortStamp(item.created);
        head.appendChild(when);
        if (item.by === ROLE || ROLE === 'admin') head.appendChild(delButton('cred-del', 'Delete credential'));
        li.appendChild(head);
        if (c) {
          if (c.login) li.appendChild(credLine(id, 'User', c.login, 'login', false));
          li.appendChild(credLine(id, 'Secret', c.secret, 'secret', true));
          if (c.note) {
            var n = document.createElement('p');
            n.className = 'team-note';
            n.textContent = c.note;
            li.appendChild(n);
          }
        }
        ul.appendChild(li);
      });
      cv.list.appendChild(ul);
    });
  }

  function setVaultMsg(text, kind) { cv.msg.textContent = text; cv.msg.className = 'form-msg' + (kind ? ' ' + kind : ''); }
  if (cv.form) {
    cv.form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!hasCrypto) return;
      var pass = cv.pass.value;
      var meta = vaultMeta();
      if (!meta) {
        if (pass.length < 8) { setVaultMsg('Use at least 8 characters.', 'error'); return; }
        if (pass !== cv.pass2.value) { setVaultMsg('The two passwords do not match.', 'error'); return; }
      }
      cv.btn.disabled = true;
      setVaultMsg(meta ? 'Unlocking…' : 'Creating…');
      try {
        if (meta) {
          var key = await vaultKey(pass, meta.salt, meta.iter || VAULT_ITER);
          try { await unseal(key, meta.check); }
          catch (err) { setVaultMsg('Wrong password.', 'error'); cv.btn.disabled = false; return; }
          vault.key = key;
          vault.salt = meta.salt;
        } else {
          var salt = bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
          var newKey = await vaultKey(pass, salt, VAULT_ITER);
          state.vaultMeta.main = { salt: salt, iter: VAULT_ITER, check: await seal(newKey, { ok: 'stane-vault' }), by: ROLE, created: Date.now() };
          stamp('vm:main');
          save();
          vault.key = newKey;
          vault.salt = salt;
        }
        cv.pass.value = '';
        cv.pass2.value = '';
        setVaultMsg('');
        touchVault();
      } catch (err) {
        setVaultMsg('Could not open the vault in this browser.', 'error');
      }
      cv.btn.disabled = false;
      renderCreds();
    });
    cv.lock.addEventListener('click', function () { lockVault(''); });
    document.addEventListener('pointerdown', touchVault);
    document.addEventListener('keydown', touchVault);

    cv.credForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!vault.key) return;
      var title = cv.title.value.trim(), secret = cv.secret.value;
      if (!title || !secret) return;
      var data = { title: title, login: cv.login.value.trim(), secret: secret, note: cv.note.value.trim() };
      try {
        var box = await seal(vault.key, data);
        var id = newId();
        state.vault[id] = { project: cv.project.value || '', box: box, by: ROLE, created: Date.now() };
        vault.plain[id] = data;
        stamp('v:' + id);
        cv.title.value = '';
        cv.login.value = '';
        cv.secret.value = '';
        cv.note.value = '';
        save();
        renderCreds();
        cv.credMsg.textContent = 'Saved (encrypted).';
        cv.credMsg.className = 'form-msg ok';
        cv.title.focus();
      } catch (err) {
        cv.credMsg.textContent = 'Could not encrypt it. Nothing was saved.';
        cv.credMsg.className = 'form-msg error';
      }
    });

    cv.list.addEventListener('click', function (e) {
      var li = e.target.closest('li.cred-item');
      if (!li) return;
      var id = li.dataset.id, c = vault.plain[id];
      if (e.target.closest('.cred-show')) { vault.shown[id] = !vault.shown[id]; renderCreds(); return; }
      var copy = e.target.closest('.cred-copy');
      if (copy && c) {
        var value = copy.dataset.field === 'login' ? c.login : c.secret;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(value).then(function () {
            copy.textContent = 'Copied';
            setTimeout(function () { if (copy.isConnected) copy.textContent = 'Copy'; }, 1500);
          }, function () { copy.textContent = 'Failed'; });
        }
        return;
      }
      var del = e.target.closest('.cred-del');
      if (!del) return;
      var item = state.vault[id];
      if (!item || (item.by !== ROLE && ROLE !== 'admin')) return;
      armOrRun(del, function () {
        delete state.vault[id];
        delete vault.plain[id];
        stamp('v:' + id);
        save();
        renderCreds();
      });
    });
  }

  /* ---------------- company links ---------------- */
  var lk = {
    form: $('tmLinkForm'), title: $('tmLinkTitle'), url: $('tmLinkUrl'), group: $('tmLinkGroup'),
    groups: $('tmLinkGroups'), msg: $('tmLinkMsg'), list: $('tmLinkList'), empty: $('tmLinkEmpty'), count: $('tmLinkCount')
  };
  function renderLinks() {
    if (!lk || !lk.list) return;
    var ids = Object.keys(state.links);
    lk.count.textContent = ids.length;
    var groups = {};
    ids.forEach(function (id) {
      var g = (state.links[id].group || '').trim() || 'General';
      (groups[g] = groups[g] || []).push(id);
    });
    // Suggest existing groups while typing.
    lk.groups.textContent = '';
    Object.keys(groups).sort().forEach(function (g) {
      var o = document.createElement('option');
      o.value = g;
      lk.groups.appendChild(o);
    });
    lk.list.textContent = '';
    Object.keys(groups).sort(function (a, b) {
      if (a === 'General') return 1;
      if (b === 'General') return -1;
      return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
    }).forEach(function (g) {
      var sec = document.createElement('section');
      sec.className = 'card link-group';
      var h = document.createElement('h2');
      h.textContent = g;
      sec.appendChild(h);
      var ul = document.createElement('ul');
      ul.className = 'link-list';
      groups[g].sort(function (a, b) {
        return state.links[a].title.toLowerCase() < state.links[b].title.toLowerCase() ? -1 : 1;
      }).forEach(function (id) {
        var l = state.links[id], url = safeUrl(l.url);
        var li = document.createElement('li');
        li.dataset.id = id;
        var a = document.createElement(url ? 'a' : 'span');
        a.className = 'link-main';
        if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        var t = document.createElement('strong');
        t.textContent = l.title;
        var u = document.createElement('span');
        u.className = 'link-url';
        u.textContent = url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'Invalid link';
        a.appendChild(t);
        a.appendChild(u);
        li.appendChild(a);
        var copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'mini-btn link-copy';
        copy.textContent = 'Copy';
        li.appendChild(copy);
        if (l.by === ROLE || ROLE === 'admin') li.appendChild(delButton('link-del', 'Delete link: ' + l.title));
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      lk.list.appendChild(sec);
    });
    lk.empty.hidden = ids.length > 0;
  }
  if (lk.form) {
    lk.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var title = lk.title.value.trim(), url = safeUrl(lk.url.value);
      if (!title) return;
      if (!url) { lk.msg.textContent = 'Enter a valid web link.'; lk.msg.className = 'form-msg error'; return; }
      var id = newId();
      state.links[id] = { title: title.slice(0, 80), url: url, group: lk.group.value.trim().slice(0, 40), by: ROLE, created: Date.now() };
      stamp('lk:' + id);
      lk.title.value = '';
      lk.url.value = '';
      lk.msg.textContent = 'Added.';
      lk.msg.className = 'form-msg ok';
      save();
      render();
      lk.title.focus();
    });
    lk.list.addEventListener('click', function (e) {
      var li = e.target.closest('li[data-id]');
      if (!li) return;
      var id = li.dataset.id, l = state.links[id];
      if (!l) return;
      var copy = e.target.closest('.link-copy');
      if (copy) {
        if (navigator.clipboard) navigator.clipboard.writeText(l.url).then(function () {
          copy.textContent = 'Copied';
          setTimeout(function () { if (copy.isConnected) copy.textContent = 'Copy'; }, 1500);
        });
        return;
      }
      var del = e.target.closest('.link-del');
      if (!del || (l.by !== ROLE && ROLE !== 'admin')) return;
      armOrRun(del, function () {
        delete state.links[id];
        stamp('lk:' + id);
        save();
        render();
      });
    });
  }

  /* ---------------- documents (files live in the private team data repository) ---------------- */
  var DOC_MAX = 10 * 1024 * 1024;
  var FILES_API = API.replace(/team\.json$/, 'docs/');
  function fileSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }
  function readAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(file);
    });
  }
  function filesFetch(path, opts) {
    opts = opts || {};
    var headers = { 'Accept': opts.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'Authorization': 'Bearer ' + sync.token };
    return fetch(FILES_API + path, { method: opts.method || 'GET', cache: 'no-store', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  }
  // Company documents and the two partner document lists share this code; each list
  // shows only the documents saved in its own space ("company" for older documents).
  function makeDocSpace(pre, space) {
    var dc = {
      form: $(pre + 'Form'), title: $(pre + 'Title'), file: $(pre + 'File'), url: $(pre + 'Url'), note: $(pre + 'Note'),
      btn: $(pre + 'Btn'), msg: $(pre + 'Msg'), list: $(pre + 'List'), empty: $(pre + 'Empty'), count: $(pre + 'Count')
    };
    var openNotes = {};
    function inSpace(d) { return (d.space || 'company') === space; }
    function setDocMsg(text, kind) { dc.msg.textContent = text; dc.msg.className = 'form-msg' + (kind ? ' ' + kind : ''); }
    function renderDocs() {
      if (!dc || !dc.list) return;
      var ids = Object.keys(state.docs).filter(function (id) { return inSpace(state.docs[id]); }).sort(function (a, b) { return state.docs[b].created - state.docs[a].created; });
      dc.count.textContent = ids.length;
      dc.list.textContent = '';
      ids.forEach(function (id) {
        var d = state.docs[id];
        var li = document.createElement('li');
        li.className = 'board-item doc-item';
        li.dataset.id = id;
        var head = document.createElement('div');
        head.className = 'remark-head';
        var kind = document.createElement('span');
        kind.className = 'doc-kind';
        kind.textContent = d.path ? '📎 File' : d.url ? '🔗 Link' : '📝 Note';
        head.appendChild(kind);
        var meta = document.createElement('span');
        meta.textContent = nameOf(d.by) + ' · ' + shortStamp(d.created) + (d.size ? ' · ' + fileSize(d.size) : '');
        head.appendChild(meta);
        if (d.by === ROLE || ROLE === 'admin') head.appendChild(delButton('doc-del', 'Delete document: ' + d.title));
        li.appendChild(head);
        var t = document.createElement('p');
        t.className = 'board-text';
        t.textContent = d.title;
        li.appendChild(t);
        if (d.path && d.name) {
          var fn = document.createElement('span');
          fn.className = 'link-url';
          fn.textContent = d.name;
          li.appendChild(fn);
        }
        var row = document.createElement('div');
        row.className = 'doc-actions';
        if (d.path) {
          var dl = document.createElement('button');
          dl.type = 'button';
          dl.className = 'mini-btn doc-download';
          dl.textContent = 'Download';
          row.appendChild(dl);
        }
        var url = safeUrl(d.url);
        if (url) row.appendChild(linkChip(url, 'Open'));
        if (d.note) {
          var nb = document.createElement('button');
          nb.type = 'button';
          nb.className = 'mini-btn doc-note';
          nb.textContent = openNotes[id] ? 'Hide note' : 'Show note';
          row.appendChild(nb);
        }
        if (row.childNodes.length) li.appendChild(row);
        if (d.note && openNotes[id]) {
          var n = document.createElement('p');
          n.className = 'desc-text doc-note-text';
          n.textContent = d.note;
          li.appendChild(n);
        }
        dc.list.appendChild(li);
      });
      dc.empty.hidden = ids.length > 0;
    }
    if (dc.form) {
      dc.form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var title = dc.title.value.trim();
        var file = dc.file.files && dc.file.files[0];
        var url = dc.url.value.trim() ? safeUrl(dc.url.value) : '';
        var note = dc.note.value.trim();
        if (!title) return;
        if (dc.url.value.trim() && !url) { setDocMsg('That link is not valid.', 'error'); return; }
        if (!file && !url && !note) { setDocMsg('Add a file, a link or a note.', 'error'); return; }
        var id = newId();
        var doc = { title: title.slice(0, 120), url: url, note: note.slice(0, 5000), space: space, by: ROLE, created: Date.now() };
        if (file) {
          if (file.size > DOC_MAX) { setDocMsg('Files can be up to 10 MB.', 'error'); return; }
          if (!sync.token) { setDocMsg('Sign in with sync turned on to upload files.', 'error'); return; }
          var safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'file';
          var path = id + '/' + safeName;
          dc.btn.disabled = true;
          setDocMsg('Uploading…');
          try {
            var res = await filesFetch(path, { method: 'PUT', body: { message: 'Add document', content: await readAsBase64(file) } });
            if (!res.ok) throw new Error(res.status === 413 || res.status === 422 ? 'GitHub refused the file (too big or not allowed).' : 'Upload failed (' + res.status + ').');
          } catch (err) {
            dc.btn.disabled = false;
            setDocMsg(err instanceof TypeError ? 'Could not reach GitHub. Check the internet connection.' : err.message, 'error');
            return;
          }
          dc.btn.disabled = false;
          doc.path = path;
          doc.name = file.name.slice(0, 120);
          doc.size = file.size;
          doc.mime = file.type || '';
        }
        state.docs[id] = doc;
        stamp('dc:' + id);
        dc.form.reset();
        setDocMsg('Saved.', 'ok');
        save();
        renderDocs();
        render();
      });
      dc.list.addEventListener('click', async function (e) {
        var li = e.target.closest('li[data-id]');
        if (!li) return;
        var id = li.dataset.id, d = state.docs[id];
        if (!d) return;
        if (e.target.closest('.doc-note')) { openNotes[id] = !openNotes[id]; renderDocs(); return; }
        var dl = e.target.closest('.doc-download');
        if (dl) {
          if (!sync.token) { dl.textContent = 'Sign in first'; return; }
          dl.disabled = true;
          dl.textContent = 'Downloading…';
          try {
            var res = await filesFetch(d.path, { raw: true });
            if (!res.ok) throw new Error(res.status);
            var blob = await res.blob();
            if (d.mime) blob = new Blob([blob], { type: d.mime });
            var href = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = href;
            a.download = d.name || 'document';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(href); }, 30000);
            dl.textContent = 'Download';
          } catch (err) {
            dl.textContent = 'Failed, try again';
          }
          dl.disabled = false;
          return;
        }
        var del = e.target.closest('.doc-del');
        if (!del || (d.by !== ROLE && ROLE !== 'admin')) return;
        armOrRun(del, async function () {
          delete state.docs[id];
          stamp('dc:' + id);
          save();
          render();
          if (d.path && sync.token) {
            // Remove the stored file too; if this fails the file just stays in the private repo.
            try {
              var info = await filesFetch(d.path);
              if (info.ok) {
                var j = await info.json();
                await filesFetch(d.path, { method: 'DELETE', body: { message: 'Delete document', sha: j.sha } });
              }
            } catch (err) { /* ignore */ }
          }
        });
      });
    }
    return renderDocs;
  }
  var docSpaces = [makeDocSpace('tmDoc', 'company'), makeDocSpace('mmDoc', 'mohitMummy'), makeDocSpace('dmDoc', 'divyuMummy')];
  function renderDocs() { docSpaces.forEach(function (r) { r(); }); }

  if (el.assignDue) el.assignDue.min = todayKey();
  render();
  syncNow();
})();

/* ---------------- phone menu: ☰ button + slide-in section list ---------------- */
(function () {
  'use strict';
  var nav = document.querySelector('nav.tabs');
  if (!nav) return;
  var bar = document.createElement('div');
  bar.className = 'mobile-bar';
  var menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'menu-btn';
  menu.setAttribute('aria-label', 'Open menu');
  menu.setAttribute('aria-expanded', 'false');
  menu.textContent = '☰';
  var title = document.createElement('span');
  title.className = 'mobile-title';
  bar.appendChild(menu);
  bar.appendChild(title);
  var shade = document.createElement('div');
  shade.className = 'nav-shade';
  document.body.insertBefore(bar, document.body.firstChild);
  nav.parentNode.insertBefore(shade, nav);

  function setOpen(open) {
    document.documentElement.classList.toggle('nav-open', open);
    menu.setAttribute('aria-expanded', String(open));
  }
  function updateTitle() {
    var active = nav.querySelector('.tab.active');
    if (!active) return;
    var copy = active.cloneNode(true);
    var badge = copy.querySelector('.tab-badge');
    if (badge) badge.remove();
    title.textContent = copy.textContent.trim();
  }
  menu.addEventListener('click', function () { setOpen(!document.documentElement.classList.contains('nav-open')); });
  shade.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  nav.addEventListener('click', function (e) {
    if (!e.target.closest('.tab')) return;
    setTimeout(function () { updateTitle(); setOpen(false); window.scrollTo(0, 0); }, 0);
  });
  updateTitle();

  // Wide screens: shrink the sidebar to icons only. Remembered per browser.
  var COLLAPSE_KEY = 'stane-nav-collapsed';
  var fold = document.createElement('button');
  fold.type = 'button';
  fold.className = 'collapse-btn';
  nav.insertBefore(fold, nav.firstChild);
  nav.querySelectorAll('.tab').forEach(function (t) { t.title = t.textContent.trim(); });
  function setCollapsed(on) {
    document.documentElement.classList.toggle('nav-collapsed', on);
    fold.textContent = on ? '»' : '« Hide menu';
    fold.setAttribute('aria-label', on ? 'Show the menu' : 'Hide the menu');
    try { localStorage.setItem(COLLAPSE_KEY, on ? '1' : ''); } catch (e) { /* not kept */ }
  }
  var startCollapsed = false;
  try { startCollapsed = localStorage.getItem(COLLAPSE_KEY) === '1'; } catch (e) { /* default open */ }
  setCollapsed(startCollapsed);
  fold.addEventListener('click', function () { setCollapsed(!document.documentElement.classList.contains('nav-collapsed')); });
})();
