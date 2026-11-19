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
  var API = 'https://api.github.com/repos/divyanshu7588/stane-ai-team-data/contents/team.json';
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
    expForm: $('tmExpForm'), expAmount: $('tmExpAmount'), expWhat: $('tmExpWhat'), expDate: $('tmExpDate'),
    expPaidBy: $('tmExpPaidBy'), expSplit: $('tmExpSplit'), expMsg: $('tmExpMsg'),
    expBalance: $('tmExpBalance'), expBalanceSub: $('tmExpBalanceSub'), expMonth: $('tmExpMonth'),
    expMonthTitle: $('tmExpMonthTitle'), expPrev: $('tmExpPrev'), expNext: $('tmExpNext'),
    expTotal: $('tmExpTotal'), expPaidAdmin: $('tmExpPaidAdmin'), expPaidMember: $('tmExpPaidMember'),
    expPaidAdminLabel: $('tmExpPaidAdminLabel'), expPaidMemberLabel: $('tmExpPaidMemberLabel'),
    expList: $('tmExpList'), expEmpty: $('tmExpEmpty')
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
  var PARTS = ['names', 'tasks', 'done', 'ideas', 'expenses', 'stamps'];
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

  /* ---------------- merge (one atom per item, newest change wins) ---------------- */
  var PREFIX = { n: 'names', t: 'tasks', d: 'done', i: 'ideas', x: 'expenses' };
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
  function renderIdeas() {
    ['admin', 'member'].forEach(function (who) {
      if (!el.ideas[who]) return;
      el.ideaHead[who].textContent = nameOf(who) + (who === ROLE ? ' (you)' : '');
      var ids = Object.keys(state.ideas).filter(function (id) { return state.ideas[id].by === who; })
        .sort(function (a, b) { return state.ideas[b].created - state.ideas[a].created; });
      var list = el.ideas[who];
      list.textContent = '';
      ids.forEach(function (id) {
        var idea = state.ideas[id];
        var li = document.createElement('li');
        li.dataset.id = id;
        var text = document.createElement('p');
        text.className = 'idea-text';
        text.textContent = idea.text;
        var foot = document.createElement('div');
        foot.className = 'idea-foot';
        var when = document.createElement('span');
        when.textContent = shortStamp(idea.created);
        foot.appendChild(when);
        if (who === ROLE || ROLE === 'admin') {
          var del = document.createElement('button');
          del.type = 'button';
          del.className = 'del';
          del.textContent = '✕';
          del.setAttribute('aria-label', 'Delete idea');
          foot.appendChild(del);
        }
        li.appendChild(text);
        li.appendChild(foot);
        list.appendChild(li);
      });
      el.ideaEmpty[who].hidden = ids.length > 0;
      if (el.ideaForm[who]) el.ideaForm[who].hidden = who !== ROLE;
    });
  }

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

  function render() { renderTasks(); renderIdeas(); renderExpenses(); renderNames(); }

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
        state.ideas[id] = { by: ROLE, text: text, created: Date.now() };
        stamp('i:' + id);
        el.ideaInput[who].value = '';
        save();
        render();
        el.ideaInput[who].focus();
      });
      el.ideaInput[who].addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
      });
    }
    if (el.ideas[who]) {
      el.ideas[who].addEventListener('click', function (e) {
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

  if (el.assignDue) el.assignDue.min = todayKey();
  render();
  syncNow();
})();
