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
    'projects', 'impl', 'remarks', 'vault', 'vaultMeta', 'links', 'docs', 'planSteps', 'planNotes', 'apiKeys', 'prompts', 'repos', 'employees', 'stamps'];
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
    p: 'projects', im: 'impl', r: 'remarks', v: 'vault', vm: 'vaultMeta', lk: 'links', dc: 'docs', ps: 'planSteps', pn: 'planNotes', ak: 'apiKeys', pm: 'prompts', gh: 'repos', em: 'employees' };
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
    if (el.projForm) el.projForm.closest('section').hidden = tasksView;
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
    renderTasks(); renderBoard(); renderIdeas(); renderExpenses(); renderProjects(); renderCreds(); renderLinks(); renderDocs(); renderKeys(); renderCollections(); renderNames();
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
      li.className = 'board-item ak-item' + (id === akEditing ? ' editing' : '');
      li.dataset.id = id;

      var top = document.createElement('div');
      top.className = 'ak-top';
      var title = document.createElement('strong');
      title.className = 'cred-title';
      title.textContent = k.name;
      top.appendChild(title);
      var own = document.createElement('span');
      own.className = 'count-pill ak-owner ' + ownerOf(k);
      own.textContent = nameOf(ownerOf(k)) + "'s key";
      top.appendChild(own);
      if (k.project) {
        var tag = document.createElement('span');
        tag.className = 'count-pill';
        tag.textContent = k.project;
        top.appendChild(tag);
      }
      if (k.expiry) {
        var left = daysUntil(k.expiry);
        if (left <= 30) {
          var exp = document.createElement('span');
          exp.className = 'count-pill ak-expiry' + (left < 0 ? ' gone' : ' soon');
          exp.textContent = left < 0 ? 'Expired' : left === 0 ? 'Expires today' : 'Expires in ' + left + ' day' + (left === 1 ? '' : 's');
          top.appendChild(exp);
        }
      }
      li.appendChild(top);

      var row = document.createElement('div');
      row.className = 'cred-line';
      var val = document.createElement('code');
      val.className = 'cred-val ak-val';
      val.textContent = akMasked ? maskKey(k.key) : k.key;
      row.appendChild(val);
      row.appendChild(akButton('ak-copy', 'Copy', id, 'Copy key: ' + k.name));
      row.appendChild(akButton('ak-copy-env', 'Copy .env', id, 'Copy as env line: ' + k.name));
      li.appendChild(row);

      var meta = [envNameOf(k)];
      if (k.limit) meta.push('Free limit: ' + k.limit);
      if (k.expiry) meta.push('Expires ' + shortKey(k.expiry) + ' ' + k.expiry.slice(0, 4));
      if (k.by) meta.push('Added by ' + nameOf(k.by));
      if (k.updated) meta.push('Updated ' + shortStamp(k.updated));
      var m = document.createElement('p');
      m.className = 'ak-meta';
      m.textContent = meta.join(' · ');
      li.appendChild(m);

      if (k.note) {
        var n = document.createElement('p');
        n.className = 'ak-note';
        n.textContent = k.note;
        li.appendChild(n);
      }

      var actions = document.createElement('div');
      actions.className = 'ak-actions';
      if (k.link && /^https?:\/\//i.test(k.link)) {
        var a = document.createElement('a');
        a.className = 'mini-btn';
        a.href = k.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'Open dashboard';
        actions.appendChild(a);
      }
      actions.appendChild(akButton('ak-edit', 'Edit', id, 'Edit: ' + k.name));
      actions.appendChild(akButton('ak-del', 'Delete', id, 'Delete: ' + k.name));
      li.appendChild(actions);

      ak.list.appendChild(li);
    });
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
    ak.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    ak.name.focus();
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
      var btn = e.target.closest('button.mini-btn');
      if (!btn) return;
      var id = btn.dataset.id, k = state.apiKeys[id];
      if (!k) return;
      if (btn.classList.contains('ak-copy') || btn.classList.contains('ak-copy-env')) {
        var text = btn.classList.contains('ak-copy') ? k.key : envNameOf(k) + '=' + k.key;
        copyText(text).then(function () { flash(btn, 'Copied'); }, function () { flash(btn, 'Blocked'); });
      } else if (btn.classList.contains('ak-edit')) {
        startKeyEdit(id);
      } else if (btn.classList.contains('ak-del')) {
        armOrRun(btn, function () {
          delete state.apiKeys[id];
          stamp('ak:' + id);
          if (akEditing === id) resetKeyForm();
          save();
          renderKeys();
        });
      }
    });
  }

  if (typeof window.STANE_MOVE_PERSONAL_KEYS === 'function') window.STANE_MOVE_PERSONAL_KEYS();

  /* ---------------- Prompts, GitHub repos, Employees (shared, both can edit) ---------------- */
  // Each is a simple list kept in the team data file: an add/edit form, a search box,
  // a filter and a list. makeList wires up the parts they have in common.
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
    b.dataset.id = id;
    if (label) b.setAttribute('aria-label', label);
    return b;
  }
  function byLine(item) {
    var parts = [];
    if (item.by) parts.push('Added by ' + nameOf(item.by));
    if (item.updated) parts.push('Updated ' + shortStamp(item.updated));
    return parts.join(' · ');
  }
  // Fills a filter <select> with "all" plus the groups in use, keeping the current choice.
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

  // cfg: part, prefix, ids (form, head, save, cancel, msg, list, empty, count, search, filter),
  // fields { formId: itemKey }, required [itemKey], titles { add, edit(item), save, saveEdit },
  // read(values, old) -> item or error string, matches(item, q, f), sort(a, b), renderItem(id, item) -> li,
  // render extra (optional), onClick(btn, id, item) for buttons other than edit/delete.
  function makeList(cfg) {
    var f = {};
    Object.keys(cfg.ids).forEach(function (k) { f[k] = $(cfg.ids[k]); });
    var inputs = {};
    Object.keys(cfg.fields).forEach(function (id) { inputs[cfg.fields[id]] = $(id); });
    var editing = '';
    var list = { editing: function () { return editing; } };

    function ids() {
      var q = f.search ? f.search.value.trim().toLowerCase() : '';
      var fv = f.filter ? f.filter.value : '';
      return Object.keys(state[cfg.part]).filter(function (id) {
        return cfg.matches(state[cfg.part][id], q, fv);
      }).sort(function (a, b) { return cfg.sort(state[cfg.part][a], state[cfg.part][b]); });
    }
    list.render = function () {
      if (!f.list) return;
      if (cfg.renderExtra) cfg.renderExtra(f);
      var shown = ids();
      f.list.textContent = '';
      shown.forEach(function (id) {
        var li = cfg.renderItem(id, state[cfg.part][id]);
        if (id === editing) li.classList.add('editing');
        f.list.appendChild(li);
      });
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
    list.edit = function (id) {
      var item = state[cfg.part][id];
      if (!item) return;
      editing = id;
      Object.keys(inputs).forEach(function (k) { if (inputs[k]) inputs[k].value = textOf(item[k]); });
      f.head.textContent = cfg.titles.edit(item);
      f.save.textContent = 'Save changes';
      f.cancel.hidden = false;
      setAkMsg(f.msg, '', '');
      list.render();
      f.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var first = inputs[cfg.required[0]];
      if (first) first.focus();
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
      if (cfg.afterSave) cfg.afterSave(id);
    });
    f.cancel.addEventListener('click', function () { reset(); setAkMsg(f.msg, '', ''); list.render(); });
    if (f.search) f.search.addEventListener('input', list.render);
    if (f.filter) f.filter.addEventListener('change', list.render);
    f.list.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      var id = btn ? btn.dataset.id : '';
      if (btn && id && state[cfg.part][id]) {
        if (btn.classList.contains('row-edit')) { list.edit(id); return; }
        if (btn.classList.contains('row-del')) { armOrRun(btn, function () { list.remove(id); }); return; }
      }
      if (cfg.onClick) cfg.onClick(e, btn);
    });
    return list;
  }
  function rowActions(id, label) {
    var actions = document.createElement('div');
    actions.className = 'ak-actions';
    actions.appendChild(miniBtn('row-edit', 'Edit', id, 'Edit: ' + label));
    actions.appendChild(miniBtn('row-del', 'Delete', id, 'Delete: ' + label));
    return actions;
  }
  function groupsOf(part, key) {
    var g = {};
    Object.keys(state[part]).forEach(function (id) { var v = textOf(state[part][id][key]).trim(); if (v) g[v] = true; });
    return Object.keys(g).sort(function (a, b) { return a.localeCompare(b); });
  }
  function hay(item, keys) { return keys.map(function (k) { return textOf(item[k]); }).join(' ').toLowerCase(); }

  /* ----- Prompts ----- */
  var prompts = makeList({
    part: 'prompts', prefix: 'pm', emptyText: 'No prompts saved yet.',
    ids: { form: 'pmForm', head: 'pmHead', save: 'pmSave', cancel: 'pmCancel', msg: 'pmMsg', list: 'pmList',
      empty: 'pmEmpty', count: 'pmCount', search: 'pmSearch', filter: 'pmFilter' },
    fields: { pmTitle: 'title', pmText: 'text', pmGroup: 'group', pmNote: 'note' },
    required: ['title', 'text'],
    titles: { add: 'Add a prompt', save: 'Save prompt', edit: function (p) { return 'Edit: ' + p.title; } },
    read: function (v) { return { title: v.title, text: v.text, group: v.group, note: v.note }; },
    matches: function (p, q, f) {
      if (f && textOf(p.group) !== f) return false;
      return !q || hay(p, ['title', 'text', 'group', 'note']).indexOf(q) !== -1;
    },
    sort: function (a, b) { return (b.updated || 0) - (a.updated || 0); },
    renderExtra: function (f) {
      var g = groupsOf('prompts', 'group');
      fillGroupFilter(f.filter, 'All categories', g);
      fillDatalist($('pmGroupList'), g);
    },
    renderItem: function (id, p) {
      var li = document.createElement('li');
      li.className = 'board-item pm-item';
      var top = document.createElement('div');
      top.className = 'ak-top';
      var t = document.createElement('strong');
      t.className = 'cred-title';
      t.textContent = p.title;
      top.appendChild(t);
      if (p.group) top.appendChild(pill(p.group));
      li.appendChild(top);
      var body = document.createElement('pre');
      body.className = 'pm-text' + (pmOpen[id] ? ' open' : '');
      body.textContent = p.text;
      li.appendChild(body);
      if (p.note) {
        var n = document.createElement('p');
        n.className = 'ak-note';
        n.textContent = p.note;
        li.appendChild(n);
      }
      var m = document.createElement('p');
      m.className = 'ak-meta';
      m.textContent = byLine(p);
      li.appendChild(m);
      var actions = rowActions(id, p.title);
      actions.insertBefore(miniBtn('pm-more', pmOpen[id] ? 'Show less' : 'Show all', id), actions.firstChild);
      actions.insertBefore(miniBtn('pm-copy', 'Copy prompt', id, 'Copy prompt: ' + p.title), actions.firstChild);
      li.appendChild(actions);
      return li;
    },
    onClick: function (e, btn) {
      if (!btn) return;
      var p = state.prompts[btn.dataset.id];
      if (!p) return;
      if (btn.classList.contains('pm-copy')) {
        copyText(p.text).then(function () { flash(btn, 'Copied'); }, function () { flash(btn, 'Blocked'); });
      } else if (btn.classList.contains('pm-more')) {
        pmOpen[btn.dataset.id] = !pmOpen[btn.dataset.id];
        prompts.render();
      }
    }
  });
  var pmOpen = {};

  /* ----- GitHub repos ----- */
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
  var repos = makeList({
    part: 'repos', prefix: 'gh', emptyText: 'No repositories saved yet.',
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
      if (f && textOf(r.group) !== f) return false;
      return !q || hay(r, ['name', 'path', 'url', 'note', 'group']).indexOf(q) !== -1;
    },
    sort: function (a, b) { return textOf(a.name).localeCompare(textOf(b.name)); },
    renderExtra: function (f) {
      var g = groupsOf('repos', 'group');
      fillGroupFilter(f.filter, 'All projects', g);
      fillDatalist($('ghGroupList'), g);
    },
    renderItem: function (id, r) {
      var li = document.createElement('li');
      li.className = 'board-item gh-item';
      var top = document.createElement('div');
      top.className = 'ak-top';
      var a = document.createElement('a');
      a.className = 'cred-title gh-name';
      a.href = r.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = r.name;
      top.appendChild(a);
      top.appendChild(pill(r.vis === 'public' ? 'Public' : 'Private', 'gh-vis ' + (r.vis === 'public' ? 'public' : 'private')));
      if (r.group) top.appendChild(pill(r.group));
      li.appendChild(top);
      var path = document.createElement('code');
      path.className = 'cred-val gh-path';
      path.textContent = (r.path || r.url.replace(/^https?:\/\//, '')) + (r.branch ? ' · ' + r.branch : '');
      li.appendChild(path);
      if (r.note) {
        var n = document.createElement('p');
        n.className = 'ak-note';
        n.textContent = r.note;
        li.appendChild(n);
      }
      var m = document.createElement('p');
      m.className = 'ak-meta';
      m.textContent = byLine(r);
      li.appendChild(m);
      var actions = rowActions(id, r.name);
      if (r.path) actions.insertBefore(miniBtn('gh-clone', 'Copy git clone', id, 'Copy clone command: ' + r.name), actions.firstChild);
      actions.insertBefore(miniBtn('gh-copy', 'Copy link', id, 'Copy link: ' + r.name), actions.firstChild);
      li.appendChild(actions);
      return li;
    },
    onClick: function (e, btn) {
      if (!btn) return;
      var r = state.repos[btn.dataset.id];
      if (!r) return;
      var text = btn.classList.contains('gh-copy') ? r.url
        : btn.classList.contains('gh-clone') ? 'git clone ' + r.url + '.git' : '';
      if (text) copyText(text).then(function () { flash(btn, 'Copied'); }, function () { flash(btn, 'Blocked'); });
    }
  });

  /* ----- Employees ----- */
  var EMP_STATUS = { active: 'Active', leave: 'On leave', left: 'Left' };
  function empStatusOf(e) { return EMP_STATUS[e.status] ? e.status : 'active'; }
  function initials(name) {
    var p = textOf(name).trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  var empOpenId = '', empBox = null;
  var employees = makeList({
    part: 'employees', prefix: 'em', emptyText: 'No employees added yet.',
    ids: { form: 'emForm', head: 'emHead', save: 'emSave', cancel: 'emCancel', msg: 'emMsg', list: 'emList',
      empty: 'emEmpty', count: 'emCount', search: 'emSearch', filter: 'emFilter' },
    fields: { emName: 'name', emRole: 'role', emPhone: 'phone', emEmail: 'email', emTeam: 'team', emStatus: 'status',
      emJoined: 'joined', emSalary: 'salary', emSkills: 'skills', emAddress: 'address', emEmergency: 'emergency', emNote: 'note' },
    required: ['name', 'role'],
    titles: { add: 'Add an employee', save: 'Save employee', edit: function (e) { return 'Edit: ' + e.name; } },
    read: function (v) {
      var e = {};
      Object.keys(v).forEach(function (k) { e[k] = v[k]; });
      e.status = EMP_STATUS[v.status] ? v.status : 'active';
      return e;
    },
    count: function () {
      return Object.keys(state.employees).filter(function (id) { return empStatusOf(state.employees[id]) === 'active'; }).length;
    },
    matches: function (e, q, f) {
      if (f && empStatusOf(e) !== f) return false;
      return !q || hay(e, ['name', 'role', 'team', 'skills', 'phone', 'email', 'note']).indexOf(q) !== -1;
    },
    sort: function (a, b) {
      var order = { active: 0, leave: 1, left: 2 };
      return order[empStatusOf(a)] - order[empStatusOf(b)] || textOf(a.name).localeCompare(textOf(b.name));
    },
    renderExtra: function () { fillDatalist($('emTeamList'), groupsOf('employees', 'team')); },
    renderItem: function (id, e) {
      var li = document.createElement('li');
      li.className = 'emp-item ' + empStatusOf(e);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'emp-card';
      b.dataset.open = id;
      b.setAttribute('aria-label', 'Show details: ' + e.name);
      var av = document.createElement('span');
      av.className = 'emp-avatar';
      av.textContent = initials(e.name);
      var txt = document.createElement('span');
      txt.className = 'emp-txt';
      var n = document.createElement('strong');
      n.textContent = e.name;
      var r = document.createElement('span');
      r.className = 'emp-role';
      r.textContent = e.role + (e.team ? ' · ' + e.team : '');
      txt.appendChild(n);
      txt.appendChild(r);
      b.appendChild(av);
      b.appendChild(txt);
      b.appendChild(pill(EMP_STATUS[empStatusOf(e)], 'emp-status ' + empStatusOf(e)));
      li.appendChild(b);
      return li;
    },
    onClick: function (ev) {
      var card = ev.target.closest('.emp-card');
      if (card) openEmployee(card.dataset.open);
    },
    afterSave: function (id) { openEmployee(id); }
  });

  function openEmployee(id) {
    empOpenId = id;
    renderEmployee();
  }
  function closeEmployee() {
    empOpenId = '';
    if (empBox) { empBox.hidden = true; empBox.textContent = ''; }
    document.documentElement.classList.remove('modal-open');
  }
  function detailRow(dl, label, value, href) {
    if (!value) return;
    var dt = document.createElement('dt');
    dt.textContent = label;
    var dd = document.createElement('dd');
    if (href) {
      var a = document.createElement('a');
      a.href = href;
      a.textContent = value;
      dd.appendChild(a);
    } else dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  function renderEmployee() {
    var e = empOpenId && state.employees[empOpenId];
    if (!e) { if (empOpenId) closeEmployee(); return; }
    var id = empOpenId;
    if (!empBox) {
      empBox = document.createElement('div');
      empBox.className = 'plan-shade';
      empBox.addEventListener('click', function (ev) {
        if (ev.target === empBox || ev.target.closest('.emp-close')) { closeEmployee(); return; }
        var btn = ev.target.closest('button');
        if (!btn || !state.employees[empOpenId]) return;
        var cur = empOpenId;
        if (btn.classList.contains('emp-edit')) { closeEmployee(); employees.edit(cur); }
        else if (btn.classList.contains('emp-del')) armOrRun(btn, function () { closeEmployee(); employees.remove(cur); });
        else if (btn.classList.contains('emp-copy')) {
          copyText(btn.dataset.value).then(function () { flash(btn, 'Copied'); }, function () { flash(btn, 'Blocked'); });
        }
      });
      document.body.appendChild(empBox);
    }
    empBox.textContent = '';
    empBox.hidden = false;
    document.documentElement.classList.add('modal-open');

    var card = document.createElement('section');
    card.className = 'card plan-card emp-detail';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', e.name);
    var top = document.createElement('div');
    top.className = 'plan-top';
    var who = document.createElement('div');
    who.className = 'emp-who';
    var av = document.createElement('span');
    av.className = 'emp-avatar big';
    av.textContent = initials(e.name);
    var head = document.createElement('div');
    var h = document.createElement('h2');
    h.className = 'plan-title';
    h.textContent = e.name;
    var role = document.createElement('p');
    role.className = 'emp-role';
    role.textContent = e.role + (e.team ? ' · ' + e.team : '');
    head.appendChild(h);
    head.appendChild(role);
    head.appendChild(pill(EMP_STATUS[empStatusOf(e)], 'emp-status ' + empStatusOf(e)));
    who.appendChild(av);
    who.appendChild(head);
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'ghost-btn emp-close';
    close.textContent = 'Close';
    top.appendChild(who);
    top.appendChild(close);
    card.appendChild(top);

    var dl = document.createElement('dl');
    dl.className = 'emp-dl';
    detailRow(dl, 'Phone', e.phone, e.phone ? 'tel:' + e.phone.replace(/[^\d+]/g, '') : '');
    detailRow(dl, 'Email', e.email, e.email ? 'mailto:' + e.email : '');
    detailRow(dl, 'Joined', e.joined ? shortKey(e.joined) + ' ' + e.joined.slice(0, 4) : '');
    detailRow(dl, 'Salary', e.salary);
    detailRow(dl, 'Skills', e.skills);
    detailRow(dl, 'Address', e.address);
    detailRow(dl, 'Emergency contact', e.emergency);
    detailRow(dl, 'Notes', e.note);
    if (!dl.children.length) {
      var none = document.createElement('p');
      none.className = 'empty';
      none.textContent = 'No other details yet. Use Edit to add phone, email, joining date and more.';
      card.appendChild(none);
    } else card.appendChild(dl);

    var meta = document.createElement('p');
    meta.className = 'ak-meta';
    meta.textContent = byLine(e);
    card.appendChild(meta);
    var actions = document.createElement('div');
    actions.className = 'ak-actions';
    if (e.phone) { var cp = miniBtn('emp-copy', 'Copy phone', id); cp.dataset.value = e.phone; actions.appendChild(cp); }
    if (e.email) { var ce = miniBtn('emp-copy', 'Copy email', id); ce.dataset.value = e.email; actions.appendChild(ce); }
    actions.appendChild(miniBtn('emp-edit', 'Edit', id, 'Edit: ' + e.name));
    actions.appendChild(miniBtn('emp-del', 'Delete', id, 'Delete: ' + e.name));
    card.appendChild(actions);
    empBox.appendChild(card);
    close.focus();
  }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && empOpenId) closeEmployee(); });

  function renderCollections() {
    prompts.render();
    repos.render();
    employees.render();
    if (empOpenId) renderEmployee();
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
  var dc = {
    form: $('tmDocForm'), title: $('tmDocTitle'), file: $('tmDocFile'), url: $('tmDocUrl'), note: $('tmDocNote'),
    btn: $('tmDocBtn'), msg: $('tmDocMsg'), list: $('tmDocList'), empty: $('tmDocEmpty'), count: $('tmDocCount')
  };
  var openNotes = {};
  function fileSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }
  function setDocMsg(text, kind) { dc.msg.textContent = text; dc.msg.className = 'form-msg' + (kind ? ' ' + kind : ''); }
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
  function renderDocs() {
    if (!dc || !dc.list) return;
    var ids = Object.keys(state.docs).sort(function (a, b) { return state.docs[b].created - state.docs[a].created; });
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
      var doc = { title: title.slice(0, 120), url: url, note: note.slice(0, 5000), by: ROLE, created: Date.now() };
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
