/* Morning checklist: pure helpers (no DOM), shared by team.js and the unit tests.
   Items:  { [itemId]: { text, by, created } }
   Checks: { [day_who_itemId]: { day, who, item, at } }  - one tick per person, per item, per day,
   so the list starts empty again every morning without anything being reset. */
(function (root) {
  'use strict';

  function checkId(day, who, item) { return day + '_' + who + '_' + item; }

  function itemIds(items) {
    return Object.keys(items || {}).filter(function (id) { return items[id]; }).sort(function (a, b) {
      return (Number(items[a].created) || 0) - (Number(items[b].created) || 0) || (a < b ? -1 : a > b ? 1 : 0);
    });
  }

  function isChecked(checks, day, who, item) { return !!(checks && checks[checkId(day, who, item)]); }

  // How many of today's items this person has ticked.
  function progress(items, checks, day, who) {
    var ids = itemIds(items);
    var done = ids.filter(function (id) { return isChecked(checks, day, who, id); }).length;
    return { done: done, total: ids.length };
  }

  function pendingFor(items, checks, day, who) {
    return itemIds(items).filter(function (id) { return !isChecked(checks, day, who, id); });
  }

  // 'YYYY-MM-DD' that is n days before day.
  function daysBefore(day, n) {
    var p = day.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) - n);
    var mm = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  // Drops ticks for items that no longer exist and ticks older than keepDays. Mutates checks.
  function prune(checks, items, today, keepDays) {
    var cutoff = daysBefore(today, keepDays);
    Object.keys(checks).forEach(function (id) {
      var v = checks[id];
      if (!v || !items[v.item] || typeof v.day !== 'string' || v.day < cutoff) delete checks[id];
    });
    return checks;
  }

  var api = { checkId: checkId, itemIds: itemIds, isChecked: isChecked, progress: progress,
    pendingFor: pendingFor, daysBefore: daysBefore, prune: prune };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.STANE_MORNING = api;
})(this);
