/* ==========================================================
   app.js – shared UI helpers + page logic (one init per page)
   Auth: requireLogin() verifies the session with the server before
   any private page (dashboard, create/edit blog, profile) is shown.
   CRUD map:
     Create -> Pages.create()      Read   -> Pages.home(), Pages.detail(), Pages.dashboard()
     Update -> Pages.create(edit)  Delete -> Pages.dashboard(), Pages.detail()
   ========================================================== */
const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- Helpers ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// Escapes text for safe use in HTML *and* inside quoted attributes
const esc = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDateShort = (iso) => {
  const d = new Date(iso);
  const opts = d.getFullYear() === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
};
const wordCount = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();
const smoothScroll = (el) => el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

// Short preview of a post. When searching, centre it on the first match so the highlight is visible.
function excerptFor(content, q, n = 150) {
  const text = content.replace(/\s+/g, ' ').trim();
  if (text.length <= n) return text;
  let start = 0;
  if (q) {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i > n - 30) start = Math.max(0, i - 40);
  }
  const slice = text.slice(start, start + n).trim();
  return (start > 0 ? '…' : '') + slice + (start + n < text.length ? '…' : '');
}

// Wraps search matches in <mark>. Each piece is escaped separately, so searching for
// "amp", "lt" or "quot" can never match inside an HTML entity and break the markup.
function highlight(text, q) {
  text = String(text ?? '');
  if (!q) return esc(text);
  const rx = new RegExp(escapeRegex(q), 'gi');
  let out = '', last = 0, m;
  while ((m = rx.exec(text))) {
    out += esc(text.slice(last, m.index)) + `<mark>${esc(m[0])}</mark>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

let toastTimer;
function toast(message, type = '') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// Promise-based confirmation dialog (used before every destructive action)
function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Delete' } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.setAttribute('aria-labelledby', 'dlgTitle');
    dlg.innerHTML = `<h2 id="dlgTitle">${esc(title)}</h2><p>${esc(message)}</p>
      <div class="row"><button class="btn btn-outline btn-sm" data-r="0" autofocus>Cancel</button>
      <button class="btn btn-danger btn-sm" data-r="1">${esc(confirmText)}</button></div>`;
    document.body.appendChild(dlg);
    let result = false;
    dlg.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-r]');
      if (btn) { result = btn.dataset.r === '1'; return dlg.close(); }
      // Close only when the click is on the backdrop (outside the box) – not on the dialog's own padding
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
  });
}

/* ---------- Password helpers ---------- */
function passwordIssue(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 72) return 'Password must be 72 characters or fewer.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain at least one letter and one number.';
  return '';
}
function strengthMeter(input, bar, label) {
  const levels = [['', '#dde1e9'], ['Weak', '#b42318'], ['Fair', '#b86e00'], ['Good', '#137a45'], ['Strong', '#0d5c33']];
  input.addEventListener('input', () => {
    const v = input.value;
    let score = 0;
    if (v.length >= 8) score++;
    if (v.length >= 12) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/\d/.test(v) && /[A-Za-z]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    score = v ? Math.min(Math.max(score, 1), 4) : 0;
    bar.style.width = `${score * 25}%`;
    bar.style.background = levels[score][1];
    label.textContent = v ? `Password strength: ${levels[score][0]}` : '';
  });
}
function showPasswordToggle(checkbox, inputs) {
  checkbox.addEventListener('change', () => inputs.forEach((i) => (i.type = checkbox.checked ? 'text' : 'password')));
}

/* ---------- Route protection ----------
   Hides the page (body.guard) until the SERVER confirms the session is valid.
   Returns { user, stats } or null (in which case the browser is already being redirected). */
async function requireLogin() {
  const here = location.pathname.split('/').pop() + location.search;
  if (!Api.currentUser()) { window.location.replace(`login.html?next=${encodeURIComponent(here)}`); return null; }
  try {
    const data = await Api.me();
    document.body.classList.remove('guard');
    renderChrome(); // refresh navbar with the verified user
    return data;
  } catch (e) {
    if (e.status !== 401) { // not a 401 redirect -> e.g. server offline
      document.body.classList.remove('guard');
      $('main').innerHTML = `<div class="card empty"><p>${esc(e.message)}</p><button class="btn btn-outline btn-sm" type="button" id="reloadBtn">Try again</button></div>`;
      $('#reloadBtn').addEventListener('click', () => location.reload()); // (inline onclick would be blocked by the CSP)
    }
    return null;
  }
}

// Login/register pages: if the server confirms an existing session, skip ahead.
// (A stale cached user is cleared, so the form simply shows.)
async function redirectIfLoggedIn(dest = 'dashboard.html') {
  if (!Api.currentUser()) return;
  if (await Api.verify()) window.location.replace(dest);
  else renderChrome();
}

/* ---------- Navbar + footer ---------- */
const ICON_OPEN = '<svg class="ic-open" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
const ICON_CLOSE = '<svg class="ic-close" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function renderChrome() {
  const page = document.body.dataset.page;
  const user = Api.currentUser();
  const link = (href, label, key, cls = '') =>
    `<li><a href="${href}"${cls ? ` class="${cls}"` : ''}${page === key ? ' aria-current="page"' : ''}>${label}</a></li>`;

  const items = user
    ? link('index.html', 'Home', 'home') + link('dashboard.html', 'Dashboard', 'dashboard') +
      link('create-blog.html', 'Write', 'create') + link('profile.html', 'Profile', 'profile') +
      '<li><button id="logoutBtn" type="button">Log out</button></li>'
    : link('index.html', 'Home', 'home') + link('login.html', 'Log in', 'login') +
      link('register.html', 'Register', 'register', 'cta');

  if (!$('.skip')) {
    const skip = document.createElement('a');
    skip.className = 'skip'; skip.href = `${location.pathname}${location.search}#main`; skip.textContent = 'Skip to content';
    document.body.prepend(skip);
  }

  const nav = $('#navbar');
  if (nav) {
    nav.className = 'navbar';
    nav.innerHTML = `<div class="container">
      <a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span>BlogApp</a>
      <button class="menu-toggle" id="menuToggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="navLinks">${ICON_OPEN}${ICON_CLOSE}</button>
      <ul class="nav-links" id="navLinks">${items}</ul></div>`;

    const toggle = $('#menuToggle'), links = $('#navLinks');
    const setOpen = (open) => { links.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', () => setOpen(!links.classList.contains('open')));
    links.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    $('#logoutBtn')?.addEventListener('click', async () => { await Api.logout(); window.location.href = 'index.html'; });
    if (!renderChrome.bound) {            // global listeners: bind once, even if the navbar is re-rendered
      renderChrome.bound = true;
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#navLinks')?.classList.remove('open'); $('#menuToggle')?.setAttribute('aria-expanded', 'false'); } });
      document.addEventListener('click', (e) => { if (!e.target.closest('.navbar')) { $('#navLinks')?.classList.remove('open'); $('#menuToggle')?.setAttribute('aria-expanded', 'false'); } });
      matchMedia('(min-width: 761px)').addEventListener('change', () => { $('#navLinks')?.classList.remove('open'); $('#menuToggle')?.setAttribute('aria-expanded', 'false'); });
    }
  }

  const foot = $('#footer');
  if (foot) {
    foot.innerHTML = `<div class="container"><span>© ${new Date().getFullYear()} BlogApp</span>
      <nav aria-label="Footer"><a href="index.html">Home</a>${user ? '<a href="dashboard.html">Dashboard</a>' : '<a href="login.html">Log in</a><a href="register.html">Register</a>'}</nav></div>`;
  }
}

/* ---------- Shared render pieces ---------- */
const catLabel = (name, tag = 'span', extra = '') => `<${tag} class="cat" data-cat="${esc(name)}"${extra}>${esc(name)}</${tag}>`;

function postCard(b, q = '', lead = false) {
  const href = `blog.html?id=${encodeURIComponent(b.id)}`;
  return `<article class="post${lead ? ' lead' : ''}">
    ${catLabel(b.category)}
    <h3><a href="${href}"><span class="hl">${highlight(b.title, q)}</span></a></h3>
    <p class="excerpt">${highlight(excerptFor(b.content, q, lead ? 260 : 150), q)}</p>
    <div class="meta"><span class="by">${esc(b.authorName)}</span><span>${fmtDate(b.createdAt)}</span><span>${b.readTime} min read</span></div>
  </article>`;
}
const skeletons = (n = 6) => Array.from({ length: n }, () => '<div class="skeleton" aria-hidden="true"></div>').join('');

// Fill a <select> with categories from the API (keeps the first option as "All" when keepFirst)
async function fillCategorySelect(select, { keepFirst = true } = {}) {
  try {
    const { categories } = await Api.getCategories();
    const first = keepFirst ? select.options[0].outerHTML : '';
    select.innerHTML = first + categories.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
  } catch { /* keep any static options already in the HTML */ }
}

/* ---------- Pages ---------- */
const Pages = {
  /* READ (list + search + category filter + sort + pagination) */
  async home() {
    const grid = $('#blogGrid'), pager = $('#pagination'), info = $('#resultsInfo'), chips = $('#chips');
    const params = new URLSearchParams(location.search);
    const state = {
      page: Math.max(parseInt(params.get('page')) || 1, 1),
      search: params.get('q') || '',
      category: params.get('category') || '',
      sort: ['newest', 'oldest', 'title'].includes(params.get('sort')) ? params.get('sort') : 'newest',
    };
    $('#search').value = state.search;
    $('#sort').value = state.sort;

    const syncUrl = () => {
      const p = new URLSearchParams();
      if (state.search) p.set('q', state.search);
      if (state.category) p.set('category', state.category);
      if (state.sort !== 'newest') p.set('sort', state.sort);
      if (state.page > 1) p.set('page', state.page);
      history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
    };

    const renderChips = async () => {
      try {
        const { categories, total } = await Api.getCategories();
        const chip = (value, label, n) =>
          `<button class="chip" type="button" data-cat="${esc(value)}" aria-pressed="${state.category === value}">${value ? '<span class="dot"></span>' : ''}${esc(label)}<span class="n">${n}</span></button>`;
        chips.innerHTML = chip('', 'All', total) + categories.filter((c) => c.count || c.name === state.category).map((c) => chip(c.name, c.name, c.count)).join('');
      } catch { chips.innerHTML = ''; }
    };

    // Every load gets a ticket; a slower, older response can never overwrite a newer one
    let ticket = 0;
    const load = async () => {
      const mine = ++ticket;
      syncUrl();
      grid.setAttribute('aria-busy', 'true');
      grid.innerHTML = skeletons();
      const slow = setTimeout(() => { if (mine === ticket) info.textContent = 'Still loading… the server may be waking up.'; }, 5000);
      try {
        const data = await Api.getBlogs(state);
        if (mine !== ticket) return;
        if (state.page > data.pages) { state.page = data.pages; return load(); }

        const showLead = state.page === 1 && state.sort === 'newest' && !state.search && !state.category;
        grid.innerHTML = data.blogs.length
          ? data.blogs.map((b, i) => postCard(b, state.search, showLead && i === 0)).join('')
          : `<div class="empty"><h2>No posts found</h2><p>Try a different search or category.</p>${state.search || state.category ? '<button class="btn btn-outline btn-sm" data-clear>Clear filters</button>' : ''}</div>`;

        const filtered = state.search || state.category;
        info.innerHTML = `<span>${plural(data.total, 'post')}${state.category ? ` in <strong>${esc(state.category)}</strong>` : ''}${state.search ? ` matching “${esc(state.search)}”` : ''}</span>` +
          (filtered ? '<button class="linkbtn" type="button" data-clear>Clear filters</button>' : '');

        pager.innerHTML = data.pages > 1
          ? `<button class="btn btn-outline btn-sm" id="prev" ${data.page <= 1 ? 'disabled' : ''}>Previous</button>
             <span>Page ${data.page} of ${data.pages}</span>
             <button class="btn btn-outline btn-sm" id="next" ${data.page >= data.pages ? 'disabled' : ''}>Next</button>`
          : '';
      } catch (e) {
        if (mine !== ticket) return;
        grid.innerHTML = `<div class="empty"><h2>Couldn’t load posts</h2><p>${esc(e.message)}</p><button class="btn btn-outline btn-sm" data-retry>Try again</button></div>`;
        pager.innerHTML = ''; info.innerHTML = '';
      } finally {
        clearTimeout(slow);
        if (mine === ticket) grid.removeAttribute('aria-busy');
      }
    };

    const clearFilters = () => { state.search = ''; state.category = ''; state.page = 1; $('#search').value = ''; renderChips(); load(); };
    const go = (d) => { state.page += d; load(); smoothScroll($('#feed')); };

    // One set of delegated listeners (the elements inside are re-rendered on every load)
    $('#feed').addEventListener('click', (e) => {
      if (e.target.closest('[data-clear]')) return clearFilters();
      if (e.target.closest('[data-retry]')) return load();
      if (e.target.closest('#prev')) return go(-1);
      if (e.target.closest('#next')) return go(1);
      const chip = e.target.closest('.chip');
      if (chip) { state.category = chip.dataset.cat; state.page = 1; renderChips(); load(); }
    });
    $('#search').addEventListener('input', debounce(() => { state.search = $('#search').value.trim(); state.page = 1; load(); }));
    $('#sort').addEventListener('change', () => { state.sort = $('#sort').value; state.page = 1; load(); });

    renderChips();
    load();

    // Tailor the call to action to the (server-verified) session
    const cta = $('#heroCta');
    const setCta = (loggedIn) => { cta.textContent = loggedIn ? 'Write a post' : 'Start writing'; cta.href = loggedIn ? 'create-blog.html' : 'register.html'; };
    setCta(!!Api.currentUser());
    if (Api.currentUser()) Api.verify().then((u) => { setCta(!!u); if (!u) renderChrome(); });
  },

  register() {
    redirectIfLoggedIn();
    const form = $('#registerForm');
    strengthMeter(form.password, $('#strengthBar'), $('#strengthLabel'));
    showPasswordToggle($('#showPw'), [form.password, form.confirm]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, err = $('#formError'), btn = f.querySelector('button[type=submit]');
      err.textContent = '';
      const name = f.name.value.trim(), email = f.email.value.trim(), pw = f.password.value;
      if (name.length < 2) return (err.textContent = 'Please enter your name.');
      if (!email) return (err.textContent = 'Please enter your email address.');
      if (passwordIssue(pw)) return (err.textContent = passwordIssue(pw));
      if (pw !== f.confirm.value) return (err.textContent = 'Passwords do not match.');
      btn.disabled = true;
      try {
        await Api.register({ name, email, password: pw });
        toast('Account created', 'success');
        setTimeout(() => (window.location.href = 'dashboard.html'), 600);
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    });
  },

  login() {
    const params = new URLSearchParams(location.search);
    const dest = Api.safeNext(params.get('next'));
    redirectIfLoggedIn(dest);
    const notice = $('#notice');
    if (params.get('expired')) notice.textContent = 'Your session has ended. Please log in again.';
    else if (params.get('next')) notice.textContent = 'Please log in to continue.';
    notice.hidden = !notice.textContent;
    showPasswordToggle($('#showPw'), [$('#loginForm').password]);
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, err = $('#formError'), btn = f.querySelector('button[type=submit]');
      err.textContent = '';
      if (!f.email.value.trim() || !f.password.value) return (err.textContent = 'Enter your email and password.');
      btn.disabled = true;
      try {
        await Api.login({ email: f.email.value, password: f.password.value });
        window.location.href = dest;
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    });
  },

  /* READ (my posts) + DELETE */
  async dashboard() {
    const session = await requireLogin();
    if (!session) return;
    const user = session.user;
    $('#welcome').textContent = `Welcome back, ${user.name.split(' ')[0]}`;
    $('#dashProfile').innerHTML = `<div class="who"><div class="avatar sm" aria-hidden="true">${esc(initial(user.name))}</div>
      <div><strong>${esc(user.name)}</strong><div class="meta"><span>${esc(user.email)}</span></div></div></div>
      <a class="btn btn-outline btn-sm" href="profile.html">View profile</a>`;
    const list = $('#myPosts');
    await fillCategorySelect($('#dCategory'));

    let ticket = 0;
    const render = async () => {
      const mine = ++ticket;
      const q = { search: $('#dSearch').value.trim(), category: $('#dCategory').value, sort: $('#dSort').value };
      let posts;
      try { posts = await Api.getMyBlogs(q); }
      catch (e) { if (mine === ticket && Api.currentUser()) list.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return; }
      // stats always reflect ALL of my posts, even while filtering
      const all = q.search || q.category ? await Api.getMyBlogs().catch(() => posts) : posts;
      if (mine !== ticket) return; // a newer search is in flight

      $('#statPosts').textContent = all.length;
      $('#statWords').textContent = all.reduce((n, b) => n + wordCount(b.content), 0).toLocaleString();
      const latest = [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      $('#statLatest').textContent = latest ? fmtDateShort(latest.createdAt) : '–';

      list.innerHTML = posts.length
        ? posts.map((b) => `<div class="post-row">
            <div class="info"><h3>${highlight(b.title, q.search)}</h3>
              <div class="meta">${catLabel(b.category)}<span>${fmtDate(b.createdAt)}</span><span>${plural(wordCount(b.content), 'word')}</span></div></div>
            <div class="post-actions">
              <a class="btn btn-outline btn-sm" href="blog.html?id=${encodeURIComponent(b.id)}">View</a>
              <a class="btn btn-outline btn-sm" href="create-blog.html?edit=${encodeURIComponent(b.id)}">Edit</a>
              <button class="btn btn-danger-outline btn-sm" type="button" data-del="${esc(b.id)}" data-title="${esc(b.title)}">Delete</button>
            </div></div>`).join('')
        : (q.search || q.category
            ? '<div class="empty"><p>No posts match your filters.</p></div>'
            : '<div class="empty"><h2>No posts yet</h2><p>Your published posts will appear here.</p><a class="btn btn-sm" href="create-blog.html">Write your first post</a></div>');
    };

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      const ok = await confirmDialog({ title: 'Delete this post?', message: `“${btn.dataset.title}” will be permanently removed.` });
      if (!ok) return;
      try { await Api.deleteBlog(btn.dataset.del); toast('Post deleted', 'success'); render(); }
      catch (ex) { toast(ex.message, 'error'); }
    });
    $('#dSearch').addEventListener('input', debounce(render));
    $('#dCategory').addEventListener('change', render);
    $('#dSort').addEventListener('change', render);
    list.innerHTML = '<div class="loading">Loading your posts…</div>';
    render();
  },

  /* CREATE + UPDATE */
  async create() {
    if (!(await requireLogin())) return;
    const f = $('#blogForm'), content = f.content, counter = $('#charCount');
    await fillCategorySelect(f.category, { keepFirst: false });

    const editId = new URLSearchParams(location.search).get('edit');
    let existing = null;
    if (editId) {
      try {
        existing = await Api.getBlog(editId);
        if (existing.authorId !== Api.currentUser().id) throw new Error('You can only edit your own posts.');
      } catch (ex) {
        toast(ex.message, 'error');
        return setTimeout(() => (window.location.href = 'dashboard.html'), 1200);
      }
      document.title = 'Edit post | BlogApp';
      $('#pageTitle').textContent = 'Edit post';
      $('#pageSubtitle').textContent = 'Update your post and save the changes.';
      $('#submitBtn').textContent = 'Save changes';
      f.title.value = existing.title; f.category.value = existing.category; f.content.value = existing.content;
    }

    // warn about unsaved changes
    const snapshot = () => JSON.stringify([f.title.value, f.category.value, f.content.value]);
    const original = snapshot();
    let submitted = false;
    window.addEventListener('beforeunload', (e) => { if (!submitted && snapshot() !== original) { e.preventDefault(); e.returnValue = ''; } });

    const count = () => { const w = wordCount(content.value); counter.textContent = `${plural(w, 'word')} · ${Math.max(1, Math.ceil(w / 200))} min read`; };
    content.addEventListener('input', count); count();

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#formError'), btn = $('#submitBtn');
      err.textContent = '';
      const data = { title: f.title.value, category: f.category.value, content: f.content.value };
      if (data.title.trim().length < 3) return (err.textContent = 'Title must be at least 3 characters.');
      if (wordCount(data.content) < 10) return (err.textContent = 'Content must be at least 10 words.');
      btn.disabled = true;
      try {
        const blog = existing ? await Api.updateBlog(existing.id, data) : await Api.createBlog(data);
        submitted = true;
        toast(existing ? 'Changes saved' : 'Post published', 'success');
        setTimeout(() => (window.location.href = `blog.html?id=${encodeURIComponent(blog.id)}`), 700);
      } catch (ex) {
        err.textContent = ex.message; btn.disabled = false;
      }
    });
  },

  /* PROFILE: view/edit account, change password, sign out everywhere, delete account */
  async profile() {
    const session = await requireLogin();
    if (!session) return;
    let { user, stats } = session;

    const renderHead = () => {
      $('#avatar').textContent = initial(user.name);
      $('#pName').textContent = user.name;
      $('#pEmail').textContent = user.email;
      $('#pBio').textContent = user.bio || 'No bio yet.';
      $('#pMeta').innerHTML = `<span>Member since ${fmtDate(user.createdAt)}</span><span>${plural(stats.posts, 'post')}</span>` +
        (user.lastLoginAt ? `<span>Last login ${esc(new Date(user.lastLoginAt).toLocaleString())}</span>` : '');
    };
    renderHead();

    // --- edit profile
    const pf = $('#profileForm'), bioCount = $('#bioCount');
    pf.name.value = user.name; pf.bio.value = user.bio || '';
    const countBio = () => (bioCount.textContent = `${pf.bio.value.length}/200`);
    pf.bio.addEventListener('input', countBio); countBio();
    pf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#profileError'), ok = $('#profileOk'), btn = pf.querySelector('button[type=submit]');
      err.textContent = ''; ok.textContent = '';
      if (pf.name.value.trim().length < 2) return (err.textContent = 'Name must be at least 2 characters.');
      btn.disabled = true;
      try {
        user = await Api.updateProfile({ name: pf.name.value, bio: pf.bio.value });
        renderHead(); renderChrome();
        ok.textContent = 'Profile saved.';
      } catch (ex) { err.textContent = ex.message; }
      btn.disabled = false;
    });

    // --- change password
    const wf = $('#passwordForm');
    strengthMeter(wf.newPassword, $('#strengthBar'), $('#strengthLabel'));
    showPasswordToggle($('#showPw'), [wf.currentPassword, wf.newPassword, wf.confirm]);
    wf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#passwordError'), ok = $('#passwordOk'), btn = wf.querySelector('button[type=submit]');
      err.textContent = ''; ok.textContent = '';
      if (!wf.currentPassword.value) return (err.textContent = 'Enter your current password.');
      if (passwordIssue(wf.newPassword.value)) return (err.textContent = passwordIssue(wf.newPassword.value));
      if (wf.newPassword.value !== wf.confirm.value) return (err.textContent = 'New passwords do not match.');
      btn.disabled = true;
      try {
        await Api.changePassword({ currentPassword: wf.currentPassword.value, newPassword: wf.newPassword.value });
        wf.reset(); $('#strengthBar').style.width = '0'; $('#strengthLabel').textContent = '';
        ok.textContent = 'Password changed. Your other devices were signed out.';
      } catch (ex) { err.textContent = ex.message; }
      btn.disabled = false;
    });

    // --- sign out everywhere
    $('#logoutAllBtn').addEventListener('click', async () => {
      const yes = await confirmDialog({ title: 'Sign out on all devices?', message: 'Every browser where you are logged in, including this one, will need to log in again.', confirmText: 'Sign out everywhere' });
      if (!yes) return;
      try { await Api.logoutAll(); window.location.href = 'login.html'; }
      catch (ex) { toast(ex.message, 'error'); }
    });

    // --- delete account
    $('#deleteForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#deleteError'), pw = e.target.password.value;
      err.textContent = '';
      if (!pw) return (err.textContent = 'Enter your password to confirm.');
      const yes = await confirmDialog({ title: 'Delete your account?', message: `This permanently deletes your account and your ${plural(stats.posts, 'post')}. This cannot be undone.`, confirmText: 'Delete my account' });
      if (!yes) return;
      try { await Api.deleteAccount(pw); window.location.href = 'index.html'; }
      catch (ex) { err.textContent = ex.message; }
    });
  },

  /* READ (single) + DELETE */
  async detail() {
    const box = $('#article');
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { box.innerHTML = '<div class="empty"><h2>No post specified</h2><a class="btn btn-outline btn-sm" href="index.html">Back to home</a></div>'; return; }
    try {
      // Load the post and (quietly) confirm the session at the same time, so owner buttons only show for a real login
      const [b, me] = await Promise.all([Api.getBlog(id), Api.verify()]);
      if (!me && Api.currentUser() === null) renderChrome();
      document.title = `${b.title} | BlogApp`;
      const owner = me && me.id === b.authorId;
      const edited = b.updatedAt && new Date(b.updatedAt) - new Date(b.createdAt) > 60000;
      box.innerHTML = `
        ${catLabel(b.category, 'a', ` href="index.html?category=${encodeURIComponent(b.category)}"`)}
        <h1>${esc(b.title)}</h1>
        <div class="meta"><span class="by">${esc(b.authorName)}</span><span>${fmtDate(b.createdAt)}</span>${edited ? `<span>Edited ${fmtDate(b.updatedAt)}</span>` : ''}<span>${b.readTime} min read</span></div>
        <div class="body">${esc(b.content)}</div>
        <div class="actions">
          <a class="btn btn-outline btn-sm" href="index.html">All posts</a>
          ${owner ? `<a class="btn btn-sm" href="create-blog.html?edit=${encodeURIComponent(b.id)}">Edit</a>
                     <button class="btn btn-danger-outline btn-sm" type="button" id="delBtn">Delete</button>` : ''}
        </div>`;
      $('#delBtn')?.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Delete this post?', message: `“${b.title}” will be permanently removed.` });
        if (!ok) return;
        try { await Api.deleteBlog(b.id); toast('Post deleted', 'success'); setTimeout(() => (window.location.href = 'dashboard.html'), 600); }
        catch (ex) { toast(ex.message, 'error'); }
      });
    } catch (e) {
      box.innerHTML = `<div class="empty"><h2>Post not available</h2><p>${esc(e.message)}</p><a class="btn btn-outline btn-sm" href="index.html">Back to home</a></div>`;
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  renderChrome();
  Pages[document.body.dataset.page]?.();
});
