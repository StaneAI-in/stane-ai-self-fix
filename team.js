(function () {
  'use strict';

  // Shared team space for two people: tasks either person assigns to the other,
  // an ideas board and a shared expense tracker. Used by index.html (admin) and
  // team.html (partner). Data lives in team.json in a separate private repo, so the
  // partner's token never reaches the admin's personal data.
  var user = window.STANE_USER;
  var ROLE = user ? user.role : (document.body.dataset.role === 'member' ? 'member' : 'admin');
  var OTHER = ROLE === 'admin' ? 'member' : 'admin';
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
    expForm: $('tmExpForm'), expAmount: $('tmExpAmount'), expWhat: $('tmExpWhat'), expDate: $('tmExpDate'),
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
    projList: $('tmProjList'), projEmpty: $('tmProjEmpty'), projCount: $('tmProjCount')
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
    'projects', 'impl', 'remarks', 'vault', 'vaultMeta', 'stamps'];
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
  var SEED_STAMP = 5;       // projects
  var IMPL_SEED_STAMP = 3;  // implementation ideas
  var GH = 'https://github.com/StaneAI-in/';
  // id -> [type tag, repo link, live link]
  var DEFAULT_LINKS = {
    'seed-stane-ai': ['Desktop app', GH + 'staneai-model-arena', ''],
    'seed-staneai': ['Website', GH + 'StaneAi-website', 'https://staneai.in'],
    'seed-report-generator': ['Web app', '', ''],
    'seed-lead-hunter': ['Web app', GH + 'StaneAi-Lead_hunter', ''],
    'seed-self-fix': ['Web app', GH + 'stane-ai-self-fix', 'https://staneai-in.github.io/stane-ai-self-fix/']
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
    p: 'projects', im: 'impl', r: 'remarks', v: 'vault', vm: 'vaultMeta' };
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
  var ideaFilter = 'all';
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
      el.ideaHead[who].textContent = nameOf(who) + (who === ROLE ? ' (you)' : '');
      var ids = Object.keys(state.ideas).filter(function (id) {
        var idea = state.ideas[id];
        return idea.by === who && (ideaFilter === 'all' || idea.cat === ideaFilter);
      }).sort(function (a, b) { return state.ideas[b].created - state.ideas[a].created; });
      var list = el.ideas[who];
      list.textContent = '';
      ids.forEach(function (id) {
        var idea = state.ideas[id];
        var li = document.createElement('li');
        li.dataset.id = id;
        if (isDue(idea) && idea.by === ROLE) li.className = 'due';
        if (IDEA_CATS[idea.cat]) {
          var cat = document.createElement('span');
          cat.className = 'idea-cat ' + idea.cat;
          cat.textContent = IDEA_CATS[idea.cat];
          li.appendChild(cat);
        }
        var text = document.createElement('p');
        text.className = 'idea-text';
        text.textContent = idea.text;
        li.appendChild(text);

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
  }

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
  function owedToPayer(x) {
    if (x.split === 'payer') return 0;
    if (x.split === 'other' || x.split === 'settle') return x.amount;
    return Math.round(x.amount / 2);
  }
  function splitLabel(x) {
    var other = x.paidBy === 'admin' ? 'member' : 'admin';
    if (x.split === 'payer') return 'Only for ' + nameOf(x.paidBy);
    if (x.split === 'other') return 'Fully for ' + nameOf(other);
    if (x.split === 'settle') return 'Paid back to ' + nameOf(other);
    return 'Split equally';
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
      el.expSplit.options[1].textContent = 'Only for ' + nameOf(payer) + ' (personal)';
      var payee = nameOf(payer === 'admin' ? 'member' : 'admin');
      el.expSplit.options[2].textContent = 'Fully for ' + payee;
      el.expSplit.options[3].textContent = 'Paying back money owed to ' + payee;
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
    var monthIds = ids.filter(function (id) { return (state.expenses[id].date || '').slice(0, 7) === expView; })
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
    Object.keys(state.shared).forEach(function (id) { groups[statusOf(id)].push(id); });
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
  function renderProjects() {
    if (!el.projList) return;
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
      h.textContent = p.name;
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
      card.appendChild(detailsBlock(pid, p));

      var sub = document.createElement('h3');
      sub.textContent = 'New implementations';
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
            : 'Added by ' + nameOf(it.by) + ' · ' + shortStamp(it.created);
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
        empty.textContent = 'Nothing added yet.';
        card.appendChild(empty);
      }

      var form = document.createElement('form');
      form.className = 'add impl-form';
      form.autocomplete = 'off';
      form.appendChild(draftInput('im:' + pid, 'What new can be added?', 'New implementation for ' + p.name, 300));
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
    renderTasks(); renderBoard(); renderIdeas(); renderExpenses(); renderProjects(); renderCreds(); renderNames();
    if (focusKey) {
      var again = document.querySelector('[data-draft="' + focusKey + '"]');
      if (again && again !== document.activeElement) {
        again.focus();
        var n = again.value.length;
        again.setSelectionRange(n, n);
      }
    }
  }

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
          save();
          render();
        });
      });
    }
  });

  document.querySelectorAll('.idea-filter button[data-cat]').forEach(function (b) {
    b.addEventListener('click', function () { ideaFilter = b.dataset.cat; renderIdeas(); });
  });

  /* ---------------- events: expenses ---------------- */
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
    el.expForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var amount = Math.round(parseFloat(el.expAmount.value) * 100);
      var what = el.expWhat.value.trim();
      var date = el.expDate.value;
      if (!(amount > 0)) { setExpMsg('Enter an amount above zero.', 'error'); return; }
      if (!what) { setExpMsg('Write what it was for.', 'error'); return; }
      if (!date) { setExpMsg('Choose a date.', 'error'); return; }
      var split = el.expSplit.value;
      var id = newId();
      state.expenses[id] = {
        amount: amount, what: what, date: date,
        paidBy: el.expPaidBy.value === 'member' ? 'member' : 'admin',
        split: split === 'payer' || split === 'other' || split === 'settle' ? split : 'half',
        by: ROLE, created: Date.now()
      };
      stamp('x:' + id);
      el.expAmount.value = '';
      el.expWhat.value = '';
      expView = date.slice(0, 7);
      save();
      render();
      setExpMsg('Added.', 'ok');
      el.expAmount.focus();
    });
    el.expList.addEventListener('click', function (e) {
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
})();
