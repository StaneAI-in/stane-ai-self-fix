(function () {
  'use strict';

  // Everything is stored only in this browser. Nothing is sent anywhere.
  var STORAGE_KEY = 'stane-selffix-v1';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var el = {
    summary: document.getElementById('summary'),
    notice: document.getElementById('notice'),
    monthTitle: document.getElementById('monthTitle'),
    grid: document.getElementById('grid'),
    prev: document.getElementById('prev'),
    next: document.getElementById('next'),
    goToday: document.getElementById('goToday'),
    dayTitle: document.getElementById('dayTitle'),
    crossBtn: document.getElementById('crossBtn'),
    crossHint: document.getElementById('crossHint'),
    addForm: document.getElementById('addForm'),
    taskInput: document.getElementById('taskInput'),
    taskList: document.getElementById('taskList'),
    empty: document.getElementById('empty')
  };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function keyOf(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function todayKey() {
    var t = new Date();
    return keyOf(t.getFullYear(), t.getMonth(), t.getDate());
  }
  function parseKey(key) {
    var p = key.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function load() {
    var data = { tasks: {}, crossed: {} };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.tasks && typeof parsed.tasks === 'object') data.tasks = parsed.tasks;
          if (parsed.crossed && typeof parsed.crossed === 'object') data.crossed = parsed.crossed;
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

  function showNotice(msg) {
    el.notice.textContent = msg;
    el.notice.hidden = false;
  }

  var state = load();
  var today = todayKey();
  var selected = today;
  var now = new Date();
  var viewYear = now.getFullYear();
  var viewMonth = now.getMonth();

  function tasksFor(key) { return state.tasks[key] || []; }

  function renderCalendar() {
    el.monthTitle.textContent = MONTHS[viewMonth] + ' ' + viewYear;
    el.grid.textContent = '';

    var firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var crossedCount = 0;

    for (var b = 0; b < firstWeekday; b++) {
      var blank = document.createElement('div');
      blank.className = 'cell blank';
      el.grid.appendChild(blank);
    }

    for (var d = 1; d <= daysInMonth; d++) {
      var key = keyOf(viewYear, viewMonth, d);
      var list = tasksFor(key);
      var doneCount = list.filter(function (t) { return t.done; }).length;
      var crossed = !!state.crossed[key];
      if (crossed) crossedCount++;

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
      if (list.length) {
        count.textContent = doneCount + '/' + list.length;
        if (doneCount === list.length) count.classList.add('all-done');
      }
      cell.appendChild(count);

      var label = d + ' ' + MONTHS[viewMonth] + ' ' + viewYear;
      if (list.length) label += ', ' + doneCount + ' of ' + list.length + ' tasks done';
      if (crossed) label += ', crossed off';
      cell.setAttribute('aria-label', label);

      el.grid.appendChild(cell);
    }

    el.summary.textContent = crossedCount + ' of ' + daysInMonth + ' days crossed off in ' + MONTHS[viewMonth];
  }

  function renderDay() {
    var date = parseKey(selected);
    el.dayTitle.textContent = DAYS[date.getDay()] + ', ' + date.getDate() + ' ' +
      MONTHS[date.getMonth()] + ' ' + date.getFullYear();

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

    var list = tasksFor(selected);
    el.taskList.textContent = '';
    list.forEach(function (task) {
      var li = document.createElement('li');
      if (task.done) li.className = 'done';

      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!task.done;
      box.dataset.id = task.id;
      box.setAttribute('aria-label', 'Mark done: ' + task.text);

      var text = document.createElement('span');
      text.className = 'text';
      text.textContent = task.text;

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.dataset.id = task.id;
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete task: ' + task.text);

      li.appendChild(box);
      li.appendChild(text);
      li.appendChild(del);
      el.taskList.appendChild(li);
    });
    el.empty.hidden = list.length > 0;
  }

  function render() {
    renderCalendar();
    renderDay();
  }

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

  el.addForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = el.taskInput.value.trim();
    if (!text) return;
    if (!state.tasks[selected]) state.tasks[selected] = [];
    state.tasks[selected].push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text: text,
      done: false
    });
    el.taskInput.value = '';
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
    var id = del.dataset.id;
    var remaining = tasksFor(selected).filter(function (t) { return t.id !== id; });
    if (remaining.length) state.tasks[selected] = remaining;
    else delete state.tasks[selected];
    save();
    render();
  });

  // If the page stays open past midnight, move "today" forward.
  setInterval(function () {
    var current = todayKey();
    if (current !== today) {
      today = current;
      render();
    }
  }, 60000);

  render();
})();
