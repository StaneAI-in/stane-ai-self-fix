(function () {
  'use strict';

  // Simple sign-in gate. This site is static, so this only decides which screen a person sees;
  // the real protection for data is the GitHub token each device needs to sync.
  // Only SHA-256 hashes of "email:password" are kept here, never the passwords themselves.
  var ACCOUNTS = {
    '79f99e1ba73321a346f51de15f7547c3a67eec2d0ed89cae72bfb318a42425af': { role: 'admin', name: 'Divyanshu' },
    '7786c924e46ca216ea6c6a800bc2e104bf686c28702a64a5cbcd81636fef6429': { role: 'member', name: 'Mohit' }
  };
  var LOGIN_KEY = 'stane-login';
  var root = document.documentElement;
  var page = root.dataset.page === 'member' ? 'member' : 'admin';

  function readLogin() {
    try {
      var s = JSON.parse(localStorage.getItem(LOGIN_KEY) || 'null');
      if (s && ACCOUNTS[s.h]) return { h: s.h, email: s.email, role: ACCOUNTS[s.h].role, name: ACCOUNTS[s.h].name };
    } catch (e) { /* not signed in */ }
    return null;
  }

  var login = readLogin();
  if (login && page === 'admin' && login.role !== 'admin') { location.replace('team.html'); return; }
  if (login) { root.classList.remove('locked'); window.STANE_USER = login; }
  else root.classList.add('locked');

  async function hash(text) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
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
      '<p class="hint">Sign in to continue.</p>' +
      '<label>Email<input type="email" name="email" autocomplete="username" required></label>' +
      '<label>Password<input type="password" name="password" autocomplete="current-password" required></label>' +
      '<button type="submit" class="primary-btn">Sign in</button>' +
      '<p class="form-msg error" role="alert"></p>' +
      '</form>';
    document.body.appendChild(gate);
    var form = gate.querySelector('form');
    var msg = gate.querySelector('.form-msg');
    form.email.focus();
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = form.email.value.trim().toLowerCase();
      var h;
      try { h = await hash(email + ':' + form.password.value); }
      catch (err) { msg.textContent = 'This browser cannot sign in here. Open the site over https.'; return; }
      var acc = ACCOUNTS[h];
      if (!acc) { msg.textContent = 'Wrong email or password.'; form.password.value = ''; return; }
      try { localStorage.setItem(LOGIN_KEY, JSON.stringify({ h: h, email: email })); }
      catch (err) { msg.textContent = 'This browser is blocking storage, so sign-in cannot be kept.'; return; }
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
