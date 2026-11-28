// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../morning-core.js');

const items = {
  b: { text: 'Plan the day', by: 'admin', created: 2 },
  a: { text: 'Read emails', by: 'member', created: 1 }
};

test('items are ordered by when they were added', () => {
  assert.deepEqual(M.itemIds(items), ['a', 'b']);
});

test('ticks are per person and per day', () => {
  const checks = {};
  checks[M.checkId('2026-11-28', 'admin', 'a')] = { day: '2026-11-28', who: 'admin', item: 'a', at: 1 };
  assert.equal(M.isChecked(checks, '2026-11-28', 'admin', 'a'), true);
  assert.equal(M.isChecked(checks, '2026-11-28', 'member', 'a'), false);
  // next morning it is unticked again
  assert.equal(M.isChecked(checks, '2026-11-29', 'admin', 'a'), false);
  assert.deepEqual(M.progress(items, checks, '2026-11-28', 'admin'), { done: 1, total: 2 });
  assert.deepEqual(M.progress(items, checks, '2026-11-29', 'admin'), { done: 0, total: 2 });
  assert.deepEqual(M.pendingFor(items, checks, '2026-11-28', 'admin'), ['b']);
  assert.deepEqual(M.pendingFor(items, checks, '2026-11-28', 'member'), ['a', 'b']);
});

test('no items means nothing pending', () => {
  assert.deepEqual(M.progress({}, {}, '2026-11-28', 'admin'), { done: 0, total: 0 });
  assert.deepEqual(M.pendingFor({}, {}, '2026-11-28', 'admin'), []);
});

test('daysBefore crosses month and year ends', () => {
  assert.equal(M.daysBefore('2026-12-01', 1), '2026-11-30');
  assert.equal(M.daysBefore('2027-01-03', 5), '2026-12-29');
});

test('prune drops old ticks and ticks of deleted items', () => {
  const checks = {
    keep: { day: '2026-11-28', who: 'admin', item: 'a' },
    old: { day: '2026-10-01', who: 'admin', item: 'a' },
    gone: { day: '2026-11-28', who: 'admin', item: 'zzz' },
    bad: null
  };
  M.prune(checks, items, '2026-11-28', 30);
  assert.deepEqual(Object.keys(checks), ['keep']);
});
