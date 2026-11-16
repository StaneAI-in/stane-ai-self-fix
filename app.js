(function () {
  'use strict';

  // Everything is stored only in this browser. Nothing is sent anywhere.
  // Tasks, streak ticks and notes live in localStorage; video files live in IndexedDB.
  var STORAGE_KEY = 'stane-selffix-v1';
  var DB_NAME = 'stane-selffix-videos';
  var DB_STORE = 'videos';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function $(id) { return document.getElementById(id); }

  var el = {
    notice: $('notice'), todayLine: $('todayLine'),
    statCrossed: $('statCrossed'), statFixed: $('statFixed'), statEnglish: $('statEnglish'),
    tabBtnCalendar: $('tabBtnCalendar'), tabBtnEnglish: $('tabBtnEnglish'),
    tabCalendar: $('tabCalendar'), tabEnglish: $('tabEnglish'),
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

  function load() {
    var data = { tasks: {}, crossed: {}, fixed: [], fixedDone: {}, english: {} };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (isObj(parsed)) {
          if (isObj(parsed.tasks)) data.tasks = parsed.tasks;
          if (isObj(parsed.crossed)) data.crossed = parsed.crossed;
          if (Array.isArray(parsed.fixed)) data.fixed = parsed.fixed;
          if (isObj(parsed.fixedDone)) data.fixedDone = parsed.fixedDone;
          if (isObj(parsed.english)) data.english = parsed.english;
        }
      }
    } catch (e) {
      showNotice('Saved data could not be read in this browser. Changes may not be kept.');
    }
    return data;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      showNotice('This browser is blocking storage, so changes will be lost when the page closes.');
    }
  }

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
  }

  function showTab(name) {
    var isCal = name === 'calendar';
    el.tabCalendar.hidden = !isCal;
    el.tabEnglish.hidden = isCal;
    el.tabBtnCalendar.classList.toggle('active', isCal);
    el.tabBtnEnglish.classList.toggle('active', !isCal);
    el.tabBtnCalendar.setAttribute('aria-selected', String(isCal));
    el.tabBtnEnglish.setAttribute('aria-selected', String(!isCal));
  }

  /* ---------------- events: tabs + calendar ---------------- */
  el.tabBtnCalendar.addEventListener('click', function () { showTab('calendar'); });
  el.tabBtnEnglish.addEventListener('click', function () { showTab('english'); });

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
    save();
    render();
  });

  /* ---------------- events: fixed tasks ---------------- */
  el.fixedForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = el.fixedInput.value.trim();
    if (!text) return;
    // A fixed task starts from the day it is added on (never later than today).
    state.fixed.push({
      id: newId(), text: text, time: el.fixedTime.value || '',
      created: selected < today ? selected : today
    });
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
    state.tasks[selected].push({ id: newId(), text: text, time: el.taskTime.value || '', done: false });
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
        if (!blob) { setVideoMsg('The video file for ' + shortDate(key) + ' is missing from this browser.', 'error'); return; }
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
})();
