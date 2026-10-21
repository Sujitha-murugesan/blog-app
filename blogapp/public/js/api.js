/* ==========================================================
   api.js – talks to the Express + MongoDB backend via fetch()
   Authentication uses an httpOnly cookie set by the server, so
   no token is ever stored in (or readable by) JavaScript.
   Only non-sensitive display info (name/email) is cached, and
   the cache is never treated as proof of being logged in.
   ========================================================== */
const Api = (() => {
  const BASE = '/api';
  const USER = 'bb_user';

  // localStorage can throw (blocked cookies, some private modes) – never let that break the page
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(USER)); } catch { return null; } },
    set(u) { try { localStorage.setItem(USER, JSON.stringify(u)); } catch { /* ignore */ } },
    clear() { try { localStorage.removeItem(USER); } catch { /* ignore */ } },
  };

  // Only allow redirects to our own pages (prevents open-redirect attacks)
  const safeNext = (next) => (/^[a-z0-9_-]+\.html(\?[^\s]*)?$/i.test(next || '') ? next : 'dashboard.html');

  const fail = (message, status) => Object.assign(new Error(message), { status });

  // silent: on 401, just forget the cached user (used on public pages, where we must not bounce readers to login)
  async function request(path, { method = 'GET', body, auth = false, silent = false } = {}) {
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw fail('Can’t reach the server. Check your connection and try again.', 0);
    }
    const data = await res.json().catch(() => ({}));

    if (res.status === 401 && auth) {
      store.clear();
      if (!silent) {
        const here = location.pathname.split('/').pop() + location.search;
        if (!/^(login|register)\.html/.test(here)) {
          window.location.replace(`login.html?expired=1&next=${encodeURIComponent(here || 'dashboard.html')}`);
        }
      }
      throw fail(data.message || 'Session expired. Please log in again.', 401);
    }
    if (!res.ok) {
      throw fail(data.message || (res.status >= 500 ? 'The server had a problem. Please try again in a moment.' : 'Request failed.'), res.status);
    }
    return data;
  }

  return {
    safeNext,

    /* ---- session ---- */
    currentUser: () => store.get(), // cached copy, for rendering the navbar only. NOT proof of login.
    async me() { // asks the server whether the cookie is valid (redirects to login if not)
      const data = await request('/auth/me', { auth: true });
      store.set(data.user);
      return data; // { user, stats }
    },
    // Quiet version for public pages: returns the verified user, or null (and clears a stale cache)
    async verify() {
      if (!store.get()) return null;
      try {
        const data = await request('/auth/me', { auth: true, silent: true });
        store.set(data.user);
        return data.user;
      } catch (e) {
        return e.status === 401 ? null : store.get(); // offline/server error: keep what we have
      }
    },
    async logout() {
      try { await request('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
      store.clear();
    },
    async logoutAll() { await request('/auth/logout-all', { method: 'POST', auth: true }); store.clear(); },

    /* ---- auth ---- */
    async register(payload) { const d = await request('/auth/register', { method: 'POST', body: payload }); store.set(d.user); return d.user; },
    async login(payload) { const d = await request('/auth/login', { method: 'POST', body: payload }); store.set(d.user); return d.user; },

    /* ---- profile ---- */
    async updateProfile(payload) { const d = await request('/auth/profile', { method: 'PUT', body: payload, auth: true }); store.set(d.user); return d.user; },
    changePassword(payload) { return request('/auth/password', { method: 'PUT', body: payload, auth: true }); },
    async deleteAccount(password) { await request('/auth/account', { method: 'DELETE', body: { password }, auth: true }); store.clear(); },

    /* ---- blogs ---- */
    getBlogs({ page = 1, limit = 9, search = '', category = '', sort = 'newest' } = {}) {
      const q = new URLSearchParams({ page, limit, sort });
      if (search) q.set('search', search);
      if (category) q.set('category', category);
      return request(`/blogs?${q}`);
    },
    getCategories() { return request('/blogs/categories'); },
    async getBlog(id) { return (await request(`/blogs/${encodeURIComponent(id)}`)).blog; },
    async getMyBlogs({ search = '', category = '', sort = 'newest' } = {}) {
      const q = new URLSearchParams({ sort });
      if (search) q.set('search', search);
      if (category) q.set('category', category);
      return (await request(`/blogs/mine?${q}`, { auth: true })).blogs;
    },
    async createBlog(data) { return (await request('/blogs', { method: 'POST', body: data, auth: true })).blog; },
    async updateBlog(id, data) { return (await request(`/blogs/${encodeURIComponent(id)}`, { method: 'PUT', body: data, auth: true })).blog; },
    deleteBlog(id) { return request(`/blogs/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }); },
  };
})();
