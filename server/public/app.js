const API = '/api';
const state = {
  token: localStorage.getItem('qf_token') || null,
  user: null,
  view: 'home', // home | solution | dashboard
  currentSolution: null,
  currentProblemText: '',
  authModal: null, // 'login' | 'signup' | null
  loading: false,
};

const root = document.getElementById('app');

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function showToast(message, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function loadUser() {
  if (!state.token) return;
  try {
    const { user } = await api('/me');
    state.user = user;
  } catch {
    state.token = null;
    localStorage.removeItem('qf_token');
  }
}

function loginSuccess(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('qf_token', token);
  state.authModal = null;
  render();
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('qf_token');
  state.view = 'home';
  render();
}

// ---------- Render ----------

function render() {
  root.innerHTML = `
    ${topbar()}
    <div class="shell">
      ${state.view === 'dashboard' ? dashboardView() : homeView()}
    </div>
    ${state.authModal ? authModal() : ''}
  `;
  attachEvents();
}

function topbar() {
  return `
  <div class="shell">
    <div class="topbar">
      <div class="brand"><span class="dot"></span> QuickFixr</div>
      <div class="nav-actions">
        ${state.user ? `
          <button class="btn btn-text" data-action="go-home">New problem</button>
          <button class="btn btn-ghost" data-action="go-dashboard">My problems</button>
          <button class="btn btn-text" data-action="logout">Log out</button>
        ` : `
          <button class="btn btn-text" data-action="open-login">Log in</button>
          <button class="btn btn-primary" data-action="open-signup">Sign up</button>
        `}
      </div>
    </div>
  </div>`;
}

function homeView() {
  return `
    <div class="hero">
      <div class="eyebrow">// pc &amp; phone diagnostics</div>
      <h1 class="headline">Describe it. Fix it.</h1>
      <p class="subhead">Tell us what's wrong with your PC or phone in plain English — get a clear, step-by-step fix in seconds.</p>
    </div>

    <div class="console ${state.loading ? 'scanning' : ''}">
      <div class="console-header">
        <span class="chip r"></span><span class="chip y"></span><span class="chip g"></span>
        <span style="margin-left:6px">diagnose.sh</span>
      </div>
      <div class="console-body">
        <div class="prompt-row">
          <span class="caret">&gt;</span>
          <textarea id="problem-input" placeholder="e.g. My laptop won't turn on, the power light flickers once and then nothing happens...">${state.currentProblemText}</textarea>
        </div>
      </div>
      <div class="console-footer">
        <span class="hint">${state.loading ? 'running diagnosis...' : 'press enter or click run'}</span>
        <button class="btn btn-primary" data-action="diagnose" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Running...' : 'Run diagnosis'}</button>
      </div>
    </div>

    ${state.currentSolution ? solutionView() : ''}
  `;
}

function riskLabel(risk) {
  if (risk === 'advanced') return '<span class="risk-tag risk-advanced">Advanced</span>';
  if (risk === 'moderate') return '<span class="risk-tag risk-moderate">Caution</span>';
  return '<span class="risk-tag risk-none"></span>';
}

function solutionView() {
  const s = state.currentSolution;
  return `
    <div class="solution">
      <div class="diagnosis-card">
        <span class="icon">◆</span>
        <div>${escapeHtml(s.diagnosis)}</div>
      </div>
      <div class="steps">
        ${s.steps.map((step, i) => `
          <div class="step">
            <span class="step-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="step-text">${escapeHtml(step.text)}</span>
            ${riskLabel(step.risk)}
          </div>
        `).join('')}
      </div>
      <div class="solution-actions">
        <button class="btn btn-primary" data-action="save-problem">Save this problem</button>
        <button class="btn btn-ghost" data-action="go-home-clear">Ask something else</button>
      </div>
    </div>
  `;
}

function dashboardView() {
  return `
    <div class="dash-header">
      <h2>Your saved problems</h2>
      <button class="btn btn-ghost" data-action="go-home">+ New problem</button>
    </div>
    ${!state.user?.is_premium ? `
      <div class="premium-banner">
        <div>
          <div class="title">Unlock Premium</div>
          <div class="desc">Unlimited saved problems, deeper diagnostics, and priority answers.</div>
        </div>
        <button class="btn btn-primary" data-action="upgrade">Upgrade</button>
      </div>
    ` : ''}
    <div id="problem-list" class="problem-list">
      <div class="empty-state"><div class="big">⋯</div>Loading your problems...</div>
    </div>
  `;
}

function authModal() {
  const isSignup = state.authModal === 'signup';
  return `
    <div class="overlay" data-action="close-modal-bg">
      <div class="modal" onclick="event.stopPropagation()">
        <h2>${isSignup ? 'Create your account' : 'Welcome back'}</h2>
        <div class="modal-sub">${isSignup ? 'Save problems and unlock premium features.' : 'Log in to see your saved problems.'}</div>
        <div id="modal-error-slot"></div>
        <form id="auth-form">
          ${isSignup ? `<div class="field"><label>Name</label><input type="text" name="name" placeholder="Your name"></div>` : ''}
          <div class="field"><label>Email</label><input type="email" name="email" required placeholder="you@example.com"></div>
          <div class="field"><label>Password</label><input type="password" name="password" required placeholder="••••••••" minlength="6"></div>
          <button type="submit" class="btn btn-primary">${isSignup ? 'Sign up' : 'Log in'}</button>
        </form>
        <div class="divider">or</div>
        <button class="google-btn" data-action="google-signin">Continue with Google</button>
        <div class="modal-switch">
          ${isSignup ? `Already have an account? <button data-action="switch-login">Log in</button>`
                     : `Don't have an account? <button data-action="switch-signup">Sign up</button>`}
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Events ----------

function attachEvents() {
  root.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', handleAction);
  });

  const textarea = document.getElementById('problem-input');
  if (textarea) {
    textarea.addEventListener('input', e => { state.currentProblemText = e.target.value; });
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        runDiagnosis();
      }
    });
  }

  const form = document.getElementById('auth-form');
  if (form) form.addEventListener('submit', handleAuthSubmit);

  if (state.view === 'dashboard') loadProblems();
}

async function handleAction(e) {
  const action = e.currentTarget.dataset.action;
  switch (action) {
    case 'open-login': state.authModal = 'login'; render(); break;
    case 'open-signup': state.authModal = 'signup'; render(); break;
    case 'switch-login': state.authModal = 'login'; render(); break;
    case 'switch-signup': state.authModal = 'signup'; render(); break;
    case 'close-modal-bg': state.authModal = null; render(); break;
    case 'logout': logout(); break;
    case 'go-home': state.view = 'home'; render(); break;
    case 'go-home-clear':
      state.currentSolution = null; state.currentProblemText = ''; state.view = 'home'; render();
      break;
    case 'go-dashboard':
      if (!state.user) { state.authModal = 'login'; render(); return; }
      state.view = 'dashboard'; render();
      break;
    case 'diagnose': runDiagnosis(); break;
    case 'save-problem': saveCurrentProblem(); break;
    case 'upgrade': doUpgrade(); break;
  }
}

async function runDiagnosis() {
  if (!state.currentProblemText.trim()) return;
  if (!state.user) { state.authModal = 'login'; render(); return; }

  state.loading = true;
  render();
  try {
    const { solution } = await api('/diagnose', {
      method: 'POST',
      body: JSON.stringify({ description: state.currentProblemText })
    });
    state.currentSolution = solution;
  } catch (err) {
    showToast(err.message, true);
  } finally {
    state.loading = false;
    render();
  }
}

async function saveCurrentProblem() {
  try {
    await api('/problems', {
      method: 'POST',
      body: JSON.stringify({
        title: state.currentProblemText.slice(0, 60),
        description: state.currentProblemText,
        solution: state.currentSolution,
        device_type: state.currentSolution.device_type
      })
    });
    showToast('Problem saved.');
  } catch (err) {
    if (err.message.includes('Upgrade')) {
      showToast(err.message, true);
    } else {
      showToast(err.message, true);
    }
  }
}

async function loadProblems() {
  const list = document.getElementById('problem-list');
  try {
    const { problems } = await api('/problems');
    if (!problems.length) {
      list.innerHTML = `<div class="empty-state"><div class="big">＋</div>No saved problems yet. Diagnose something and save it here.</div>`;
      return;
    }
    list.innerHTML = problems.map(p => `
      <div class="problem-card" data-toggle="${p.id}">
        <div class="problem-card-top">
          <h3>${escapeHtml(p.title)}</h3>
          <span class="status-pill status-${p.status}">${p.status}</span>
        </div>
        <div class="date">${new Date(p.created_at).toLocaleDateString()} · ${p.device_type || 'unknown device'}</div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="empty-state">Could not load problems.</div>`;
  }
}

async function doUpgrade() {
  try {
    await api('/upgrade', { method: 'POST' });
  } catch (err) {
    showToast(err.message, true);
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const email = formData.get('email');
  const password = formData.get('password');
  const name = formData.get('name');
  const isSignup = state.authModal === 'signup';

  const errSlot = document.getElementById('modal-error-slot');
  try {
    const { token, user } = await api(isSignup ? '/auth/signup' : '/auth/login', {
      method: 'POST',
      body: JSON.stringify(isSignup ? { email, password, name } : { email, password })
    });
    loginSuccess(token, user);
    showToast(isSignup ? 'Account created — welcome!' : 'Welcome back!');
  } catch (err) {
    errSlot.innerHTML = `<div class="modal-error">${escapeHtml(err.message)}</div>`;
  }
}

// Google sign-in stub — becomes active once GOOGLE_CLIENT_ID is configured server-side
// and the Google Identity Services script is loaded with that client ID.
document.addEventListener('click', e => {
  if (e.target.dataset.action === 'google-signin') {
    showToast('Google sign-in needs a client ID configured first — ask about setting this up.', true);
  }
});

// ---------- Init ----------

(async function init() {
  await loadUser();
  render();
})();
