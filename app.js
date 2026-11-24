(function () {
  'use strict';

  // Everything is stored only in this browser. Nothing is sent anywhere.
  // Tasks, streak ticks and notes live in localStorage; video files live in IndexedDB.
  var STORAGE_KEY = 'stane-selffix-v1';
  var DB_NAME = 'stane-selffix-videos';
  var DB_STORE = 'videos';
  // Optional sync: tasks, streaks and notes (never videos) are kept in one file in a private repo.
  var SYNC_KEY = 'stane-selffix-sync';
  var SYNC_API = 'https://api.github.com/repos/StaneAI-in/stane-ai-self-fix-data/contents/data.json';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function $(id) { return document.getElementById(id); }

  var el = {
    notice: $('notice'), todayLine: $('todayLine'),
    statCrossed: $('statCrossed'), statFixed: $('statFixed'), statEnglish: $('statEnglish'),
    tabBtnCalendar: $('tabBtnCalendar'), tabBtnEnglish: $('tabBtnEnglish'), tabBtnSync: $('tabBtnSync'),
    tabCalendar: $('tabCalendar'), tabEnglish: $('tabEnglish'), tabSync: $('tabSync'),
    syncChip: $('syncChip'), syncStatus: $('syncStatus'), syncForm: $('syncForm'), syncToken: $('syncToken'),
    syncNow: $('syncNow'), syncOff: $('syncOff'),
    monthTitle: $('monthTitle'), grid: $('grid'), prev: $('prev'), next: $('next'), goToday: $('goToday'),
    dayTitle: $('dayTitle'), crossBtn: $('crossBtn'), crossHint: $('crossHint'),
    progressBar: $('progressBar'), progressText: $('progressText'),
    fixedList: $('fixedList'), fixedEmpty: $('fixedEmpty'), fixedForm: $('fixedForm'),
    fixedInput: $('fixedInput'), fixedTime: $('fixedTime'),
    taskList: $('taskList'), empty: $('empty'), addForm: $('addForm'),
    taskInput: $('taskInput'), taskTime: $('taskTime'),
    focusFrom: $('focusFrom'), focusText: $('focusText'), todayStatus: $('todayStatus'),
    videoForm: $('videoForm'), videoDate: $('videoDate'), videoFile: $('videoFile'),
    videoNotes: $('videoNotes'), videoMsg: $('videoMsg'), videoSave: $('videoSave'),
    storageLine: $('storageLine'), history: $('history'), historyEmpty: $('historyEmpty')
  };

  /* ---------------- dates ---------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function keyOf(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function keyOfDate(dt) { return keyOf(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
  function todayKey() { return keyOfDate(new Date()); }
  function parseKey(key) {
    var p = key.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function addDays(key, n) {
    var d = parseKey(key);
    d.setDate(d.getDate() + n);
    return keyOfDate(d);
  }
  function longDate(key) {
    var d = parseKey(key);
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function shortDate(key) {
    var d = parseKey(key);
    return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
  }
  function formatTime(t) {
    if (!t) return '';
    var p = t.split(':');
    var h = Number(p[0]);
    var suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + p[1] + ' ' + suffix;
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------------- storage ---------------- */
  function showNotice(msg) {
    el.notice.textContent = msg;
    el.notice.hidden = false;
  }

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  function normalize(parsed) {
    var data = { tasks: {}, crossed: {}, fixed: [], fixedDone: {}, english: {}, apiKeys: {}, stamps: {} };
    if (isObj(parsed)) {
      if (isObj(parsed.tasks)) data.tasks = parsed.tasks;
      if (isObj(parsed.crossed)) data.crossed = parsed.crossed;
      if (Array.isArray(parsed.fixed)) data.fixed = parsed.fixed;
      if (isObj(parsed.fixedDone)) data.fixedDone = parsed.fixedDone;
      if (isObj(parsed.english)) data.english = parsed.english;
      if (isObj(parsed.apiKeys)) data.apiKeys = parsed.apiKeys;
      if (isObj(parsed.stamps)) data.stamps = parsed.stamps;
    }
    return data;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) {
      showNotice('Saved data could not be read in this browser. Changes may not be kept.');
    }
    return normalize(null);
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      showNotice('This browser is blocking storage, so changes will be lost when the page closes.');
    }
  }

  function save() {
    saveLocal();
    scheduleSync();
  }

  // Records when one item last changed, so two devices can be merged item by item.
  function stamp(key) { state.stamps[key] = Date.now(); }

  var dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(DB_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }
  function dbRun(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, mode);
        var req = fn(tx.objectStore(DB_STORE));
        tx.oncomplete = function () { resolve(req ? req.result : undefined); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Storage write was cancelled')); };
      });
    });
  }
  function putVideo(key, blob) { return dbRun('readwrite', function (s) { return s.put(blob, key); }); }
  function getVideo(key) { return dbRun('readonly', function (s) { return s.get(key); }); }
  function deleteVideo(key) { return dbRun('readwrite', function (s) { return s.delete(key); }); }

  /* ---------------- state ---------------- */
  var state = load();
  var today = todayKey();
  var selected = today;
  var now = new Date();
  var viewYear = now.getFullYear();
  var viewMonth = now.getMonth();
  var playingUrl = null;

  function tasksFor(key) { return state.tasks[key] || []; }
  function sortedTasks(key) {
    return tasksFor(key).slice().sort(function (a, b) {
      if (a.time && b.time) return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
      if (a.time) return -1;
      if (b.time) return 1;
      return 0;
    });
  }
  function fixedFor(key) {
    return state.fixed.filter(function (f) { return f.created <= key; }).sort(function (a, b) {
      if (a.time && b.time) return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
      if (a.time) return -1;
      if (b.time) return 1;
      return 0;
    });
  }
  function fixedIsDone(key, id) { return !!(state.fixedDone[key] && state.fixedDone[key][id]); }

  // Counts back from today. If today is not ticked yet, the streak from yesterday still stands.
  function countStreak(isDoneOn) {
    var key = today;
    if (!isDoneOn(key)) key = addDays(key, -1);
    var n = 0;
    while (isDoneOn(key)) { n++; key = addDays(key, -1); }
    return n;
  }
  function fixedStreak(id) { return countStreak(function (k) { return fixedIsDone(k, id); }); }
  function englishStreak() { return countStreak(function (k) { return !!state.english[k]; }); }

  // Done/total for one day, counting fixed tasks only for days that have already arrived.
  function dayProgress(key) {
    var list = tasksFor(key);
    var done = list.filter(function (t) { return t.done; }).length;
    var total = list.length;
    if (key <= today) {
      fixedFor(key).forEach(function (f) {
        total++;
        if (fixedIsDone(key, f.id)) done++;
      });
    }
    return { done: done, total: total };
  }

  /* ---------------- two-click delete ---------------- */
  function armOrRun(btn, run) {
    if (btn.classList.contains('armed')) { run(); return; }
    btn.classList.add('armed');
    var original = btn.textContent;
    btn.textContent = 'Delete?';
    setTimeout(function () {
      if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = original; }
    }, 3000);
  }

  /* ---------------- header ---------------- */
  function renderHeader() {
    el.todayLine.textContent = 'Today is ' + longDate(today);

    var t = parseKey(today);
    var daysInMonth = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    var crossed = 0;
    for (var d = 1; d <= daysInMonth; d++) {
      if (state.crossed[keyOf(t.getFullYear(), t.getMonth(), d)]) crossed++;
    }
    el.statCrossed.textContent = crossed;

    var best = 0;
    state.fixed.forEach(function (f) { best = Math.max(best, fixedStreak(f.id)); });
    el.statFixed.textContent = best;
    el.statEnglish.textContent = englishStreak();
  }

  /* ---------------- calendar ---------------- */
  function renderCalendar() {
    el.monthTitle.textContent = MONTHS[viewMonth] + ' ' + viewYear;
    el.grid.textContent = '';

    var firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (var b = 0; b < firstWeekday; b++) {
      var blank = document.createElement('div');
      blank.className = 'cell blank';
      el.grid.appendChild(blank);
    }

    for (var d = 1; d <= daysInMonth; d++) {
      var key = keyOf(viewYear, viewMonth, d);
      var prog = dayProgress(key);
      var crossed = !!state.crossed[key];

      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.key = key;
      if (key === today) cell.classList.add('today');
      if (key > today) cell.classList.add('future');
      if (key === selected) cell.classList.add('selected');
      if (crossed) cell.classList.add('crossed');

      var num = document.createElement('span');
      num.className = 'num';
      num.textContent = d;
      cell.appendChild(num);

      var count = document.createElement('span');
      count.className = 'count';
      if (prog.total) {
        count.textContent = prog.done + '/' + prog.total;
        if (prog.done === prog.total) count.classList.add('all-done');
      }
      cell.appendChild(count);

      var label = d + ' ' + MONTHS[viewMonth] + ' ' + viewYear;
      if (prog.total) label += ', ' + prog.done + ' of ' + prog.total + ' tasks done';
      if (crossed) label += ', crossed off';
      cell.setAttribute('aria-label', label);

      el.grid.appendChild(cell);
    }
  }

  /* ---------------- day panel ---------------- */
  function taskRow(opts) {
    var li = document.createElement('li');
    if (opts.done) li.className = 'done';

    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!opts.done;
    box.disabled = !!opts.disabled;
    box.dataset.id = opts.id;
    box.setAttribute('aria-label', 'Mark done: ' + opts.text);
    li.appendChild(box);

    if (opts.time) {
      var time = document.createElement('span');
      time.className = 'time-chip';
      time.textContent = formatTime(opts.time);
      li.appendChild(time);
    }

    var text = document.createElement('span');
    text.className = 'text';
    text.textContent = opts.text;
    li.appendChild(text);

    if (typeof opts.streak === 'number') {
      var streak = document.createElement('span');
      streak.className = 'streak-chip';
      streak.textContent = '🔥 ' + opts.streak;
      streak.title = opts.streak + ' day streak';
      streak.setAttribute('aria-label', opts.streak + ' day streak');
      li.appendChild(streak);
    }

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.dataset.id = opts.id;
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Delete: ' + opts.text);
    li.appendChild(del);

    return li;
  }

  function renderDay() {
    el.dayTitle.textContent = longDate(selected);

    var crossed = !!state.crossed[selected];
    var isFuture = selected > today;
    el.crossBtn.textContent = crossed ? 'Undo cross' : 'Cross off this day';
    el.crossBtn.disabled = isFuture && !crossed;
    if (isFuture && !crossed) {
      el.crossHint.textContent = 'This day has not arrived yet, so it cannot be crossed off.';
    } else if (crossed) {
      el.crossHint.textContent = 'This day is crossed off.';
    } else {
      el.crossHint.textContent = 'Cross it off when the day is over.';
    }

    var prog = dayProgress(selected);
    el.progressBar.style.width = prog.total ? Math.round(prog.done / prog.total * 100) + '%' : '0%';
    el.progressText.textContent = prog.total ? prog.done + ' of ' + prog.total + ' done' : 'Nothing planned yet';

    // Fixed daily tasks
    var fixed = fixedFor(selected);
    el.fixedList.textContent = '';
    fixed.forEach(function (f) {
      el.fixedList.appendChild(taskRow({
        id: f.id, text: f.text, time: f.time,
        done: fixedIsDone(selected, f.id),
        disabled: isFuture,
        streak: fixedStreak(f.id)
      }));
    });
    el.fixedEmpty.hidden = fixed.length > 0;
    if (!fixed.length) {
      el.fixedEmpty.textContent = state.fixed.length
        ? 'Your fixed tasks had not started yet on this day.'
        : 'No fixed tasks yet. Add the things you want to do every day.';
    }

    // One-off tasks for this day
    var list = sortedTasks(selected);
    el.taskList.textContent = '';
    list.forEach(function (t) {
      el.taskList.appendChild(taskRow({ id: t.id, text: t.text, time: t.time, done: t.done }));
    });
    el.empty.hidden = list.length > 0;
  }

  /* ---------------- English tab ---------------- */
  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
  function formatDuration(sec) {
    if (!sec || !isFinite(sec)) return '';
    var s = Math.round(sec);
    return Math.floor(s / 60) + ':' + pad(s % 60) + ' min';
  }

  function renderEnglish() {
    var keys = Object.keys(state.english).sort();

    // Focus card: notes from the most recent video before today.
    var from = null;
    for (var i = keys.length - 1; i >= 0; i--) {
      if (keys[i] < today && state.english[keys[i]].notes) { from = keys[i]; break; }
    }
    if (from) {
      el.focusFrom.textContent = 'From your video on ' + shortDate(from) + ':';
      el.focusText.textContent = state.english[from].notes;
    } else {
      el.focusFrom.textContent = '';
      el.focusText.textContent = 'After you upload a video and write what to improve, it will show here the next day.';
    }
    if (state.english[today]) {
      el.todayStatus.textContent = '✓ Today’s video is uploaded.';
      el.todayStatus.className = 'status ok';
    } else {
      el.todayStatus.textContent = 'Today’s video is not uploaded yet.';
      el.todayStatus.className = 'status pending';
    }

    // History, newest first
    if (playingUrl) { URL.revokeObjectURL(playingUrl); playingUrl = null; }
    el.history.textContent = '';
    keys.slice().reverse().forEach(function (key) {
      var entry = state.english[key];
      var li = document.createElement('li');
      li.dataset.key = key;

      var head = document.createElement('div');
      head.className = 'entry-head';

      var left = document.createElement('div');
      var date = document.createElement('div');
      date.className = 'entry-date';
      date.textContent = longDate(key);
      var meta = document.createElement('div');
      meta.className = 'entry-meta';
      meta.textContent = [formatDuration(entry.duration), formatSize(entry.size), entry.name]
        .filter(Boolean).join(' · ');
      left.appendChild(date);
      left.appendChild(meta);

      var actions = document.createElement('div');
      actions.className = 'entry-actions';
      var play = document.createElement('button');
      play.type = 'button';
      play.className = 'ghost-btn play';
      play.textContent = 'Play';
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'ghost-btn edit';
      edit.textContent = 'Edit notes';
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Delete video from ' + shortDate(key));
      actions.appendChild(play);
      actions.appendChild(edit);
      actions.appendChild(del);

      head.appendChild(left);
      head.appendChild(actions);
      li.appendChild(head);

      var label = document.createElement('p');
      label.className = 'entry-notes-label';
      label.textContent = 'What to improve';
      var notes = document.createElement('p');
      notes.className = 'entry-notes' + (entry.notes ? '' : ' none');
      notes.textContent = entry.notes || 'No notes written.';
      li.appendChild(label);
      li.appendChild(notes);

      el.history.appendChild(li);
    });
    el.historyEmpty.hidden = keys.length > 0;

    renderStorage();
  }

  function renderStorage() {
    if (!navigator.storage || !navigator.storage.estimate) { el.storageLine.textContent = ''; return; }
    navigator.storage.estimate().then(function (est) {
      if (!est || !est.quota) return;
      el.storageLine.textContent = 'Videos are kept only in this browser on this laptop. Using ' +
        formatSize(est.usage || 1) + ' of about ' + formatSize(est.quota) + ' available.';
    }).catch(function () { el.storageLine.textContent = ''; });
  }

  function setVideoMsg(text, kind) {
    el.videoMsg.textContent = text;
    el.videoMsg.className = 'form-msg' + (kind ? ' ' + kind : '');
  }

  function readDuration(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var v = document.createElement('video');
      var finished = false;
      function finish(value) {
        if (finished) return;
        finished = true;
        URL.revokeObjectURL(url);
        resolve(value);
      }
      v.preload = 'metadata';
      v.onloadedmetadata = function () { finish(isFinite(v.duration) ? v.duration : 0); };
      v.onerror = function () { finish(0); };
      setTimeout(function () { finish(0); }, 8000);
      v.src = url;
    });
  }

  function fillVideoFormFor(key) {
    el.videoDate.value = key;
    el.videoNotes.value = state.english[key] ? (state.english[key].notes || '') : '';
    el.videoFile.value = '';
  }

  /* ---------------- render all ---------------- */
  function render() {
    renderHeader();
    renderCalendar();
    renderDay();
    renderEnglish();
    renderKeys();
  }

  function showTab(name) {
    [['calendar', el.tabCalendar, el.tabBtnCalendar],
     ['english', el.tabEnglish, el.tabBtnEnglish],
     ['team', $('tabTeam'), $('tabBtnTeam')],
     ['board', $('tabBoard'), $('tabBtnBoard')],
     ['projects', $('tabProjects'), $('tabBtnProjects')],
     ['links', $('tabLinks'), $('tabBtnLinks')],
     ['docs', $('tabDocs'), $('tabBtnDocs')],
     ['creds', $('tabCreds'), $('tabBtnCreds')],
     ['keys', $('tabKeys'), $('tabBtnKeys')],
     ['ideas', $('tabIdeas'), $('tabBtnIdeas')],
     ['expenses', $('tabExpenses'), $('tabBtnExpenses')],
     ['sync', el.tabSync, el.tabBtnSync]].forEach(function (t) {
      var on = t[0] === name;
      t[1].hidden = !on;
      t[2].classList.toggle('active', on);
      t[2].setAttribute('aria-selected', String(on));
    });
  }

  /* ---------------- API keys (admin only, plain text, personal repo) ---------------- */
  // Free API keys kept in the open. They live in this personal data file, which only
  // Divyanshu's token can reach, so they never go into the shared team data.
  var MASK_KEY = 'stane-apikeys-mask';
  var ak = {
    form: $('akForm'), head: $('akFormHead'), name: $('akName'), key: $('akKey'), env: $('akEnv'),
    project: $('akProject'), projectList: $('akProjectList'), link: $('akLink'), limit: $('akLimit'),
    expiry: $('akExpiry'), note: $('akNote'), save: $('akSave'), cancel: $('akCancel'), msg: $('akMsg'),
    count: $('akCount'), search: $('akSearch'), filter: $('akFilter'), mask: $('akMask'),
    copyEnv: $('akCopyEnv'), toolMsg: $('akToolMsg'), list: $('akList'), empty: $('akEmpty')
  };
  var akEditing = '';
  var akMasked = false;
  try { akMasked = localStorage.getItem(MASK_KEY) === '1'; } catch (e) { akMasked = false; }

  // "Google Maps" -> "GOOGLE_MAPS_API_KEY"
  function envNameOf(k) {
    if (k.env) return k.env;
    var base = String(k.name || 'KEY').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'KEY';
    if (/^[0-9]/.test(base)) base = '_' + base;
    return /_KEY$/.test(base) ? base : base + '_API_KEY';
  }
  function maskKey(v) {
    v = String(v || '');
    return v.length <= 8 ? '••••••••' : v.slice(0, 4) + '••••••••' + v.slice(-4);
  }
  // Whole days from today to an expiry date (negative once it has passed).
  function daysUntil(dateKey) {
    return Math.round((parseKey(dateKey) - parseKey(todayKey())) / 86400000);
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
    return Object.keys(state.apiKeys).filter(function (id) {
      var k = state.apiKeys[id];
      if (f === '__none') { if (k.project) return false; }
      else if (f && k.project !== f) return false;
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
      if (k.expiry) meta.push('Expires ' + shortDate(k.expiry));
      if (k.updated) meta.push('Updated ' + shortDate(keyOfDate(new Date(k.updated))));
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

  function resetKeyForm() {
    akEditing = '';
    ak.form.reset();
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
        name: name, key: key, env: env, project: ak.project.value.trim(), link: link,
        limit: ak.limit.value.trim(), expiry: ak.expiry.value || '', note: ak.note.value.trim(),
        created: old ? old.created : Date.now(), updated: Date.now()
      };
      stamp('k:' + id);
      save();
      var wasEdit = !!akEditing;
      resetKeyForm();
      renderKeys();
      setAkMsg(ak.msg, wasEdit ? 'Changes saved.' : 'Key saved.', 'ok');
    });
    ak.cancel.addEventListener('click', function () { resetKeyForm(); setAkMsg(ak.msg, '', ''); renderKeys(); });
    ak.search.addEventListener('input', renderKeys);
    ak.filter.addEventListener('change', renderKeys);
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
          stamp('k:' + id);
          if (akEditing === id) resetKeyForm();
          save();
          renderKeys();
        });
      }
    });
  }

  /* ---------------- sync ---------------- */
  // Every changeable item becomes one "atom" with its own key, so two copies can be merged item by item.
  function atoms(s) {
    var m = {};
    Object.keys(s.crossed).forEach(function (d) { if (s.crossed[d]) m['c:' + d] = true; });
    Object.keys(s.fixedDone).forEach(function (d) {
      Object.keys(s.fixedDone[d] || {}).forEach(function (id) {
        if (s.fixedDone[d][id]) m['fd:' + d + ':' + id] = true;
      });
    });
    Object.keys(s.tasks).forEach(function (d) {
      (s.tasks[d] || []).forEach(function (t) { m['t:' + d + ':' + t.id] = t; });
    });
    s.fixed.forEach(function (f) { m['f:' + f.id] = f; });
    Object.keys(s.english).forEach(function (d) { m['e:' + d] = s.english[d]; });
    Object.keys(s.apiKeys).forEach(function (id) { m['k:' + id] = s.apiKeys[id]; });
    return m;
  }

  function build(m, stamps) {
    var s = normalize(null);
    Object.keys(m).sort().forEach(function (key) {
      var v = m[key];
      if (v === undefined || v === null) return;
      var p = key.split(':');
      if (p[0] === 'c') s.crossed[p[1]] = true;
      else if (p[0] === 'fd') { if (!s.fixedDone[p[1]]) s.fixedDone[p[1]] = {}; s.fixedDone[p[1]][p[2]] = true; }
      else if (p[0] === 't') { if (!s.tasks[p[1]]) s.tasks[p[1]] = []; s.tasks[p[1]].push(v); }
      else if (p[0] === 'f') s.fixed.push(v);
      else if (p[0] === 'e') s.english[p[1]] = v;
      else if (p[0] === 'k') s.apiKeys[p[1]] = v;
    });
    // Drop ticks that belong to a fixed task that no longer exists.
    var alive = {};
    s.fixed.forEach(function (f) { alive[f.id] = true; });
    Object.keys(s.fixedDone).forEach(function (d) {
      Object.keys(s.fixedDone[d]).forEach(function (id) { if (!alive[id]) delete s.fixedDone[d][id]; });
      if (!Object.keys(s.fixedDone[d]).length) delete s.fixedDone[d];
    });
    Object.keys(stamps).sort().forEach(function (k) { s.stamps[k] = stamps[k]; });
    return s;
  }

  // For each item, the copy that changed most recently wins (a newer delete also wins).
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

  function b64encode(text) {
    var bytes = new TextEncoder().encode(text), bin = '';
    for (var i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(b64.replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  var sync = { token: '', busy: false, again: false, timer: null };
  try { sync.token = (JSON.parse(localStorage.getItem(SYNC_KEY) || '{}').token) || ''; } catch (e) { sync.token = ''; }

  function setSyncStatus(kind, text) {
    el.syncChip.textContent = kind === 'off' ? 'Sync off' : kind === 'busy' ? 'Syncing…' : kind === 'ok' ? 'Synced' : 'Sync problem';
    el.syncChip.className = 'sync-chip ' + kind;
    el.syncStatus.textContent = text;
    el.syncStatus.className = 'sync-status ' + kind;
    el.syncNow.hidden = !sync.token;
    el.syncOff.hidden = !sync.token;
  }

  function ghFetch(method, body, raw) {
    return fetch(SYNC_API, {
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
    if (status === 403) return new Error('GitHub refused access. The token may lack "Contents: Read and write" permission.');
    if (status === 404) return new Error('The token cannot reach the data repository. Check that it has access to stane-ai-self-fix-data.');
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
      catch (e) { throw new Error('The synced data file is damaged and could not be read.'); }
    } else if (res.status !== 404) {
      throw syncError(res.status);
    }

    var merged = remote ? merge(state, remote) : build(atoms(state), state.stamps);
    var mergedCanon = stable(merged);
    if (mergedCanon !== canon(state)) {
      state = merged;
      saveLocal();
      render();
    }
    if (remote && canon(remote) === mergedCanon) return true;

    var body = { message: 'Sync data', content: b64encode(JSON.stringify(merged)) };
    if (sha) body.sha = sha;
    var put = await ghFetch('PUT', body);
    if (put.ok) return true;
    if (put.status === 409 || put.status === 422) return false; // the other device saved first; merge again
    throw syncError(put.status);
  }

  async function syncNow() {
    if (!sync.token) { setSyncStatus('off', 'Sync is off on this device. Data stays only in this browser.'); return; }
    if (sync.busy) { sync.again = true; return; }
    sync.busy = true;
    setSyncStatus('busy', 'Syncing…');
    try {
      var done = false;
      for (var i = 0; i < 4 && !done; i++) done = await syncOnce();
      if (!done) throw new Error('Both devices were saving at the same time. It will be tried again.');
      var t = new Date();
      setSyncStatus('ok', 'Synced at ' + formatTime(pad(t.getHours()) + ':' + pad(t.getMinutes())) + '. Videos are not synced.');
    } catch (e) {
      var offline = e instanceof TypeError;
      setSyncStatus('error', offline ? 'Could not reach GitHub. Check the internet connection; it will be tried again.' : e.message);
    }
    sync.busy = false;
    if (sync.again) { sync.again = false; scheduleSync(); }
  }

  function scheduleSync() {
    if (!sync.token) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(syncNow, 1500);
  }

  el.syncForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var token = el.syncToken.value.trim();
    if (!token) return;
    sync.token = token;
    el.syncToken.value = '';
    try { localStorage.setItem(SYNC_KEY, JSON.stringify({ token: token })); }
    catch (err) { showNotice('This browser is blocking storage, so the token will be forgotten when the page closes.'); }
    syncNow();
  });
  el.syncNow.addEventListener('click', syncNow);
  el.syncOff.addEventListener('click', function () {
    sync.token = '';
    clearTimeout(sync.timer);
    try { localStorage.removeItem(SYNC_KEY); } catch (err) { /* nothing to remove */ }
    setSyncStatus('off', 'Sync is off on this device. Data stays only in this browser.');
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') syncNow();
  });
  window.addEventListener('online', syncNow);
  setInterval(function () {
    if (document.visibilityState === 'visible') syncNow();
  }, 120000);

  /* ---------------- events: tabs + calendar ---------------- */
  el.tabBtnCalendar.addEventListener('click', function () { showTab('calendar'); });
  el.tabBtnEnglish.addEventListener('click', function () { showTab('english'); });
  el.tabBtnSync.addEventListener('click', function () { showTab('sync'); });
  $('tabBtnTeam').addEventListener('click', function () { showTab('team'); });
  $('tabBtnBoard').addEventListener('click', function () { showTab('board'); });
  $('tabBtnProjects').addEventListener('click', function () { showTab('projects'); });
  $('tabBtnLinks').addEventListener('click', function () { showTab('links'); });
  $('tabBtnDocs').addEventListener('click', function () { showTab('docs'); });
  $('tabBtnCreds').addEventListener('click', function () { showTab('creds'); });
  if ($('tabBtnKeys')) $('tabBtnKeys').addEventListener('click', function () { showTab('keys'); });
  $('tabBtnIdeas').addEventListener('click', function () { showTab('ideas'); });
  $('tabBtnExpenses').addEventListener('click', function () { showTab('expenses'); });

  function shiftMonth(delta) {
    viewMonth += delta;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderCalendar();
  }
  el.prev.addEventListener('click', function () { shiftMonth(-1); });
  el.next.addEventListener('click', function () { shiftMonth(1); });

  el.goToday.addEventListener('click', function () {
    var t = new Date();
    viewYear = t.getFullYear();
    viewMonth = t.getMonth();
    selected = today;
    render();
  });

  el.grid.addEventListener('click', function (e) {
    var cell = e.target.closest('.cell[data-key]');
    if (!cell) return;
    selected = cell.dataset.key;
    render();
  });

  el.crossBtn.addEventListener('click', function () {
    if (state.crossed[selected]) {
      delete state.crossed[selected];
    } else {
      if (selected > today) return;
      state.crossed[selected] = true;
    }
    stamp('c:' + selected);
    save();
    render();
  });

  /* ---------------- events: fixed tasks ---------------- */
  el.fixedForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = el.fixedInput.value.trim();
    if (!text) return;
    // A fixed task starts from the day it is added on (never later than today).
    var fixedId = newId();
    state.fixed.push({
      id: fixedId, text: text, time: el.fixedTime.value || '',
      created: selected < today ? selected : today
    });
    stamp('f:' + fixedId);
    el.fixedInput.value = '';
    el.fixedTime.value = '';
    save();
    render();
    el.fixedInput.focus();
  });

  el.fixedList.addEventListener('change', function (e) {
    if (e.target.type !== 'checkbox') return;
    if (selected > today) return;
    var id = e.target.dataset.id;
    if (e.target.checked) {
      if (!state.fixedDone[selected]) state.fixedDone[selected] = {};
      state.fixedDone[selected][id] = true;
    } else if (state.fixedDone[selected]) {
      delete state.fixedDone[selected][id];
      if (!Object.keys(state.fixedDone[selected]).length) delete state.fixedDone[selected];
    }
    stamp('fd:' + selected + ':' + id);
    save();
    render();
  });

  el.fixedList.addEventListener('click', function (e) {
    var del = e.target.closest('.del');
    if (!del) return;
    armOrRun(del, function () {
      var id = del.dataset.id;
      state.fixed = state.fixed.filter(function (f) { return f.id !== id; });
      Object.keys(state.fixedDone).forEach(function (k) {
        delete state.fixedDone[k][id];
        if (!Object.keys(state.fixedDone[k]).length) delete state.fixedDone[k];
      });
      stamp('f:' + id);
      save();
      render();
    });
  });

  /* ---------------- events: day tasks ---------------- */
  el.addForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = el.taskInput.value.trim();
    if (!text) return;
    if (!state.tasks[selected]) state.tasks[selected] = [];
    var taskId = newId();
    state.tasks[selected].push({ id: taskId, text: text, time: el.taskTime.value || '', done: false });
    stamp('t:' + selected + ':' + taskId);
    el.taskInput.value = '';
    el.taskTime.value = '';
    save();
    render();
    el.taskInput.focus();
  });

  el.taskList.addEventListener('change', function (e) {
    if (e.target.type !== 'checkbox') return;
    var id = e.target.dataset.id;
    tasksFor(selected).forEach(function (t) {
      if (t.id === id) t.done = e.target.checked;
    });
    stamp('t:' + selected + ':' + id);
    save();
    render();
  });

  el.taskList.addEventListener('click', function (e) {
    var del = e.target.closest('.del');
    if (!del) return;
    armOrRun(del, function () {
      var id = del.dataset.id;
      var remaining = tasksFor(selected).filter(function (t) { return t.id !== id; });
      if (remaining.length) state.tasks[selected] = remaining;
      else delete state.tasks[selected];
      stamp('t:' + selected + ':' + id);
      save();
      render();
    });
  });

  /* ---------------- events: English ---------------- */
  el.videoDate.addEventListener('change', function () {
    var key = el.videoDate.value;
    if (key) el.videoNotes.value = state.english[key] ? (state.english[key].notes || '') : '';
    setVideoMsg('', '');
  });

  el.videoForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var key = el.videoDate.value;
    var file = el.videoFile.files && el.videoFile.files[0];
    var notes = el.videoNotes.value.trim();

    if (!key) { setVideoMsg('Choose a date.', 'error'); return; }
    if (key > today) { setVideoMsg('You cannot add a video for a future date.', 'error'); return; }

    // Notes-only update for a day that already has a video.
    if (!file) {
      if (!state.english[key]) { setVideoMsg('Choose a video file first.', 'error'); return; }
      state.english[key].notes = notes;
      stamp('e:' + key);
      save();
      render();
      setVideoMsg('Notes saved.', 'ok');
      return;
    }

    if (file.type && file.type.indexOf('video/') !== 0) {
      setVideoMsg('That file is not a video.', 'error');
      return;
    }

    el.videoSave.disabled = true;
    setVideoMsg('Saving video…', '');
    readDuration(file).then(function (duration) {
      return putVideo(key, file).then(function () {
        state.english[key] = { notes: notes, name: file.name, size: file.size, duration: duration };
        stamp('e:' + key);
        save();
        el.videoFile.value = '';
        render();
        setVideoMsg('Video saved for ' + shortDate(key) + '.', 'ok');
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
      });
    }).catch(function () {
      setVideoMsg('The video could not be saved. The laptop may be low on free space.', 'error');
    }).then(function () {
      el.videoSave.disabled = false;
    });
  });

  el.history.addEventListener('click', function (e) {
    var li = e.target.closest('li[data-key]');
    if (!li) return;
    var key = li.dataset.key;

    if (e.target.closest('.play')) {
      var existing = li.querySelector('video');
      if (existing) { existing.play(); return; }
      getVideo(key).then(function (blob) {
        if (!blob) {
          setVideoMsg('The video for ' + shortDate(key) + ' is not on this device. Videos stay only on the device where they were uploaded.', 'error');
          return;
        }
        // Only one video is loaded at a time.
        var old = el.history.querySelector('video');
        if (old) old.remove();
        if (playingUrl) URL.revokeObjectURL(playingUrl);
        playingUrl = URL.createObjectURL(blob);
        var v = document.createElement('video');
        v.controls = true;
        v.src = playingUrl;
        li.appendChild(v);
        v.play().catch(function () {});
      }).catch(function () {
        setVideoMsg('The video could not be opened.', 'error');
      });
      return;
    }

    if (e.target.closest('.edit')) {
      fillVideoFormFor(key);
      setVideoMsg('Editing notes for ' + shortDate(key) + '. Change them and press Save.', '');
      el.videoNotes.focus();
      return;
    }

    var del = e.target.closest('.del');
    if (del) {
      armOrRun(del, function () {
        deleteVideo(key).catch(function () {}).then(function () {
          delete state.english[key];
          stamp('e:' + key);
          save();
          render();
        });
      });
    }
  });

  /* ---------------- start ---------------- */
  // If the page stays open past midnight, move "today" forward.
  setInterval(function () {
    var current = todayKey();
    if (current !== today) {
      today = current;
      el.videoDate.max = today;
      render();
    }
  }, 60000);

  el.videoDate.max = today;
  fillVideoFormFor(today);
  render();
  syncNow();
})();
