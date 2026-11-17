/* ============================================================================
   TRADE BARR - core: session gate, role system, navigation guard, shared helpers.
   Nothing in the app runs until the SERVER has confirmed who the user is.
   The role shown here is only a mirror of what the database returned from my_access();
   every real restriction is enforced again by Postgres (RLS + RPC checks).
   ============================================================================ */
(function () {
    'use strict';
    const APP_SCRIPTS = ['app.js', 'chart.js', 'us30.js', 'signal.js', 'signals-view.js', 'news.js', 'winrate.js',
                         'pnl.js', 'course.js', 'profile-view.js', 'notifications.js', 'push.js', 'ui.js'];

    // feature -> tiers allowed (mirrors the permission matrix; DB enforces the data-level parts)
    const MATRIX = {
        dashboard: ['free', 'client', 'admin', 'owner'], pnl: ['free', 'client', 'admin', 'owner'],
        signals:   ['free', 'client', 'admin', 'owner'], history: ['free', 'client', 'admin', 'owner'],
        profile:   ['free', 'client', 'admin', 'owner'],
        charts:    ['client', 'admin', 'owner'], paid: ['client', 'admin', 'owner'],
        tracker:   ['admin', 'owner'], createSignals: ['admin', 'owner'], updateSignals: ['admin', 'owner'],
        manageCodes: ['owner']
    };
    // restricted sections (so a forced class/inline-style change cannot reveal them)
    const GUARDED = { 'view-chart-analysis': 'charts', 'btc-chart': 'charts', 'eurusd-chart': 'charts', 'view-us30-chart': 'charts',
                      'view-signal': 'tracker', 'view-tips': 'paid', 'view-fundamentals': 'paid', 'course-section': 'paid' };

    const TB = window.TB = { access: null, uid: null, skew: 0, _h: {} };
    TB.on = (e, fn) => ((TB._h[e] = TB._h[e] || []).push(fn));
    TB.emit = (e, d) => (TB._h[e] || []).forEach(fn => { try { fn(d); } catch (x) { console.error(x); } });
    TB.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    TB.can = f => !!TB.access && (MATRIX[f] || []).includes(TB.access.tier);
    TB.isStaff = () => TB.access && ['admin', 'owner'].includes(TB.access.tier);
    TB.now = () => Date.now() + TB.skew;
    const MSG = {
        CODE_INVALID: 'That access code is not valid.', CODE_USED: 'This access code has already been used.',
        CODE_DISABLED: 'This access code has been disabled.', CODE_STAFF_SIGNUP_ONLY: 'This code can only be used when creating a new account.',
        CODE_FREE_NOT_UPGRADE: 'This is a free-member code. Enter a paid access code to upgrade.', STAFF_NO_CODE: 'Staff accounts do not need access codes.',
        ALREADY_LIFETIME: 'Your account already has lifetime access.', USERNAME_TAKEN: 'That username is already taken.',
        USERNAME_INVALID: 'Usernames are 3-24 characters: letters, numbers, spaces, dot, underscore or hyphen.',
        FORBIDDEN: 'You do not have permission to do that.', NOT_AUTHENTICATED: 'Please log in again.',
        AVATAR_PATH_INVALID: 'Invalid image path.'
    };
    TB.err = e => { const m = (e && (e.message || e.error_description || String(e))) || 'Something went wrong.';
        const k = Object.keys(MSG).find(c => m.includes(c)); return k ? MSG[k] : (/permission denied|row-level security/i.test(m) ? MSG.FORBIDDEN : m); };

    TB.toast = (title, icon = 'info') => { if (window.Swal) Swal.fire({ toast: true, position: 'top-end', icon, title, showConfirmButton: false, timer: 3200, timerProgressBar: true, background: '#0C0C0E', color: '#fff' }); };
    TB.go = target => { const l = document.querySelector(`.sidebar-nav .nav-link[data-target="${target}"]`); if (l) l.click(); };
    TB.avatarUrl = (path, v) => path ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + encodeURIComponent(v || '') : null;
    TB.avatar = (name, path, v, size = 40) => {
        const u = TB.avatarUrl(path, v), ini = TB.esc((name || '?').trim().slice(0, 2).toUpperCase());
        const base = `width:${size}px;height:${size}px;border-radius:50%;flex:0 0 ${size}px;`;
        return u ? `<img src="${TB.esc(u)}" alt="" style="${base}object-fit:cover;border:1px solid rgba(225,29,46,.5);">`
                 : `<span style="${base}display:inline-grid;place-items:center;background:linear-gradient(135deg,#FF3B47,#B3121F);color:#fff;font-weight:700;font-size:${Math.round(size * .38)}px;">${ini}</span>`;
    };
    TB.roleLabel = a => ({ owner: 'OWNER', admin: 'ADMIN' }[a.role] || (a.status === 'expired' ? 'EXPIRED' : a.role === 'client' ? 'CLIENT' : 'FREE MEMBER'));
    TB.remaining = a => {            // {text, ms} for limited memberships
        if (!a.expires_at || a.membership_type !== 'limited') return null;
        const ms = new Date(a.expires_at).getTime() - TB.now(); if (ms <= 0) return { ms: 0, text: 'Expired' };
        const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
        return { ms, text: `${d} Days, ${h} Hours, ${m} Minutes` };
    };

    async function fetchAccess() {
        const { data, error } = await supabase.rpc('my_access');
        if (error) throw error; if (!data) return null;
        TB.skew = new Date(data.server_now).getTime() - Date.now(); return data;
    }
    TB.refresh = async function () {
        try {
            const a = await fetchAccess(); if (!a) return TB.logout();
            const was = TB.access, changed = !was || ['tier', 'status', 'username', 'avatar_path', 'avatar_updated_at', 'expires_at', 'membership_type'].some(k => was[k] !== a[k]);
            TB.access = a; if (changed) { applyAccess(); TB.emit('access', a); }
        } catch (e) { console.warn('access refresh failed', e.message); }
        return TB.access;
    };
    TB.onLogout = fn => (TB._bl = TB._bl || []).push(fn);
    TB.logout = async function () { TB._leaving = true; for (const f of (TB._bl || [])) { try { await f(); } catch (e) {} } try { await supabase.auth.signOut(); } catch (e) {} localStorage.removeItem('current_user'); location.replace('index.html'); };
    window.logoutUser = TB.logout;

    function applyAccess() {
        const a = TB.access; if (!a) return;
        document.querySelectorAll('.sidebar-nav .nav-link[data-feature]').forEach(l => l.classList.toggle('tb-hidden', !TB.can(l.dataset.feature)));
        let card = document.getElementById('sidebar-user');
        if (!card) { card = document.createElement('a'); card.id = 'sidebar-user'; card.href = '#'; card.className = 'sidebar-user';
            card.addEventListener('click', e => { e.preventDefault(); TB.go('profile'); });
            const lo = document.querySelector('.sidebar-logout'); lo.parentNode.insertBefore(card, lo); }
        card.innerHTML = `${TB.avatar(a.username, a.avatar_path, a.avatar_updated_at, 38)}<span class="su-text"><strong>${TB.esc(a.username)}</strong><small class="role-${a.role}${a.status === 'expired' ? ' role-expired' : ''}">${TB.roleLabel(a)}</small></span>`;
        let ban = document.getElementById('tb-expired-banner');
        if (a.status === 'expired') {
            if (!ban) { ban = document.createElement('div'); ban.id = 'tb-expired-banner'; ban.className = 'tb-banner';
                ban.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Your paid membership has expired. Paid features are locked. <a href="#" id="tb-renew-link">Renew with a new access code</a>';
                document.querySelector('.main-content').prepend(ban); ban.querySelector('a').addEventListener('click', e => { e.preventDefault(); TB.go('profile'); }); }
        } else if (ban) ban.remove();
        enforce();
    }
    function visible(el) { return el.classList.contains('active') || (el.style.display && el.style.display !== 'none') || (getComputedStyle(el).display !== 'none'); }
    function enforce() {
        let bounced = false;
        Object.entries(GUARDED).forEach(([id, feat]) => {
            const el = document.getElementById(id); if (!el || TB.can(feat)) return;
            if (visible(el)) { el.classList.remove('active'); el.style.display = 'none'; bounced = true; }
        });
        if (bounced) { TB.toast('That page is not available for your account.', 'warning'); TB.go('dashboard'); }
    }

    function bootError(msg) {
        document.documentElement.classList.remove('tb-booting');
        document.body.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;background:#050505;color:#fff;font-family:Inter,sans-serif;padding:2rem;text-align:center"><div><h2 style="color:#FF3B47">Cannot start TRADE BARR</h2><p style="color:#A1A1AA;max-width:460px">${TB.esc(msg)}</p><a href="index.html" style="color:#FF3B47">Back to login</a></div></div>`;
    }
    function loadScripts(i = 0) {
        return new Promise(res => { if (i >= APP_SCRIPTS.length) return res();
            const s = document.createElement('script'); s.src = APP_SCRIPTS[i] + '?v=3'; s.async = false;
            s.onload = () => loadScripts(i + 1).then(res); s.onerror = () => { console.error('failed to load', APP_SCRIPTS[i]); loadScripts(i + 1).then(res); };
            document.body.appendChild(s); });
    }

    async function boot() {
        if (!supabase || /YOUR_SUPABASE/.test(CONFIG.SUPABASE_URL)) return bootError('Supabase is not configured. Edit config.js with your project URL and anon key (see README).');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return location.replace('index.html');
        let access; try { access = await fetchAccess(); } catch (e) { return bootError('Could not verify your account: ' + e.message); }
        if (!access) { await supabase.auth.signOut(); return location.replace('index.html'); }
        TB.access = access; TB.uid = access.id; TB.session = session;
        // PnL records are keyed by the stable user id (survives username changes / free->paid upgrade); migrate legacy username key once.
        localStorage.setItem('current_user', access.id);
        ['supreme_pnl_records_'].forEach(p => { const old = localStorage.getItem(p + access.username), nu = p + access.id; if (old && !localStorage.getItem(nu)) localStorage.setItem(nu, old); });
        applyAccess();
        await loadScripts();
        document.dispatchEvent(new Event('DOMContentLoaded'));      // app scripts registered after the real event; run them now
        // route guard (capture phase = runs BEFORE any navigation handler)
        document.querySelector('.sidebar-nav').addEventListener('click', e => {
            const l = e.target.closest('.nav-link[data-feature]'); if (!l) return;
            if (!TB.can(l.dataset.feature)) { e.preventDefault(); e.stopImmediatePropagation(); TB.toast('That page is not available for your account.', 'warning'); TB.go('dashboard'); return; }
            history.replaceState(null, '', '#' + l.dataset.target);
        }, true);
        new MutationObserver(enforce).observe(document.querySelector('.main-content'), { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
        const h = location.hash.slice(1);                                   // deep link / manual URL: allowed pages only
        if (h) { const l = document.querySelector(`.sidebar-nav .nav-link[data-target="${CSS.escape(h)}"]`);
                 if (l && TB.can(l.dataset.feature)) l.click(); else if (l) { history.replaceState(null, '', location.pathname); TB.toast('That page is not available for your account.', 'warning'); } }
        const sg = new URLSearchParams(location.search).get('signal');         // opened from a push notification
        if (sg) { history.replaceState(null, '', location.pathname + '#signals'); TB.go('signals'); TB.openSignal(sg); }
        enforce();
        document.documentElement.classList.remove('tb-booting');
        // keep role / membership live: poll, on focus, and the instant a limited membership hits its end time
        setInterval(TB.refresh, 30000); window.addEventListener('focus', TB.refresh);
        setInterval(() => { const r = TB.remaining(TB.access); if (r && r.ms <= 0 && TB.access.status !== 'expired') TB.refresh(); TB.emit('tick'); }, 1000);
        supabase.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && !TB._leaving) location.replace('index.html'); });
        TB.emit('ready', TB.access);
    }
    // Realtime subscription with automatic polling fallback (works even if Realtime is disabled on the project)
    TB.live = function (table, cb, filter) {
        let subscribed = false, deb = null; const fire = () => { clearTimeout(deb); deb = setTimeout(cb, 250); };
        try { supabase.channel('tb-' + table + '-' + Math.random().toString(36).slice(2))
            .on('postgres_changes', Object.assign({ event: '*', schema: 'public', table }, filter ? { filter } : {}), fire)
            .subscribe(st => { subscribed = st === 'SUBSCRIBED'; }); } catch (e) { console.warn('realtime unavailable:', e.message); }
        setInterval(() => { if (!subscribed && document.visibilityState === 'visible') cb(); }, (window.CONFIG && CONFIG.POLL_MS) || 30000);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cb(); });
    };

    TB.ready = new Promise(r => TB.on('ready', r));
    document.addEventListener('DOMContentLoaded', () => { if (!TB._started) { TB._started = true; boot().catch(e => bootError(e.message)); } }, { once: true });
})();
