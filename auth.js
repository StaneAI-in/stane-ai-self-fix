(function () {
  'use strict';

  // Simple sign-in gate. This site is static, so this only decides which screen a person sees.
  // Only SHA-256 hashes of "email:password" are kept here, never the passwords themselves.
  // Signing in also unlocks the team sync token (team-key.js holds it encrypted with each
  // account's password), so nobody has to paste a token by hand.
  var ACCOUNTS = {
    '79f99e1ba73321a346f51de15f7547c3a67eec2d0ed89cae72bfb318a42425af': { role: 'admin', name: 'Divyanshu' },
    '7786c924e46ca216ea6c6a800bc2e104bf686c28702a64a5cbcd81636fef6429': { role: 'member', name: 'Mohit' }
  };
  var LOGIN_KEY = 'stane-login';
  var TEAM_TOKEN_KEY = 'stane-team-sync';
  var KEYS = window.STANE_TEAM_KEYS || {};
  var root = document.documentElement;
  var page = root.dataset.page === 'member' ? 'member' : 'admin';

  function storedTeamToken() {
    try { return (JSON.parse(localStorage.getItem(TEAM_TOKEN_KEY) || '{}') || {}).token || ''; } catch (e) { return ''; }
  }

  function readLogin() {
    try {
      var s = JSON.parse(localStorage.getItem(LOGIN_KEY) || 'null');
      if (s && ACCOUNTS[s.h]) return { h: s.h, email: s.email, role: ACCOUNTS[s.h].role, name: ACCOUNTS[s.h].name };
    } catch (e) { /* not signed in */ }
    return null;
  }

  var login = readLogin();
  // Sync was switched on after this device signed in: one more sign-in unlocks it.
  var needsUnlock = !!(login && KEYS[login.h] && !storedTeamToken());
  if (needsUnlock) login = null;

  if (login && page === 'admin' && login.role !== 'admin') { location.replace('team.html'); return; }
  if (login) { root.classList.remove('locked'); window.STANE_USER = login; }
  else root.classList.add('locked');

  function bytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function sha256(text) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  async function unlockToken(secret, blob) {
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
    var key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: bytes(blob.salt), iterations: blob.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(blob.iv) }, key, bytes(blob.ct));
    return new TextDecoder().decode(plain);
  }

  function signOut() {
    try { localStorage.removeItem(LOGIN_KEY); } catch (e) { /* nothing stored */ }
    location.reload();
  }

  function buildGate() {
    var gate = document.createElement('main');
    gate.id = 'loginGate';
    gate.innerHTML =
      '<form class="card login-card" autocomplete="on">' +
      '<img src="logo.svg" alt="" width="52" height="52">' +
      '<h1>Stane AI</h1>' +
      '<p class="hint"></p>' +
      '<label>Email<input type="email" name="email" autocomplete="username" required></label>' +
      '<label>Password<input type="password" name="password" autocomplete="current-password" required></label>' +
      '<button type="submit" class="primary-btn">Sign in</button>' +
      '<p class="form-msg error" role="alert"></p>' +
      '</form>';
    document.body.appendChild(gate);
    var form = gate.querySelector('form');
    var msg = gate.querySelector('.form-msg');
    var btn = gate.querySelector('button');
    gate.querySelector('.hint').textContent = needsUnlock
      ? 'Sign in once more to turn on automatic sync.'
      : 'Sign in to continue.';
    form.email.focus();
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg.textContent = '';
      var email = form.email.value.trim().toLowerCase();
      var secret = email + ':' + form.password.value;
      var h;
      try { h = await sha256(secret); }
      catch (err) { msg.textContent = 'This browser cannot sign in here. Open the site over https.'; return; }
      var acc = ACCOUNTS[h];
      if (!acc) { msg.textContent = 'Wrong email or password.'; form.password.value = ''; return; }

      btn.disabled = true;
      btn.textContent = 'Signing in…';
      if (KEYS[h]) {
        try {
          var token = await unlockToken(secret, KEYS[h]);
          localStorage.setItem(TEAM_TOKEN_KEY, JSON.stringify({ token: token }));
        } catch (err) { /* sync stays off; the Team screen says so */ }
      }
      try { localStorage.setItem(LOGIN_KEY, JSON.stringify({ h: h, email: email })); }
      catch (err) {
        msg.textContent = 'This browser is blocking storage, so sign-in cannot be kept.';
        btn.disabled = false;
        btn.textContent = 'Sign in';
        return;
      }
      if (acc.role !== 'admin' && page === 'admin') location.replace('team.html');
      else location.reload();
    });
  }

  function addUserBar() {
    var tabs = document.querySelector('.tabs');
    if (!tabs) return;
    var bar = document.createElement('span');
    bar.className = 'user-bar';
    var who = document.createElement('span');
    who.textContent = login.name;
    var out = document.createElement('button');
    out.type = 'button';
    out.className = 'ghost-btn';
    out.textContent = 'Sign out';
    out.addEventListener('click', signOut);
    bar.appendChild(who);
    bar.appendChild(out);
    tabs.appendChild(bar);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (login) addUserBar();
    else buildGate();
  });
})();
