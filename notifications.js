/* TRADE BARR - notification bell. Rows are created by DATABASE triggers on real signal events;
   this file only reads them (own rows, enforced by RLS), marks them read, and reacts in real time. */
(function () {
    'use strict';
    let items = [], unread = 0, known = new Set(), first = true, open = false;
    const bell = document.createElement('div'); bell.id = 'tb-bell-wrap';
    bell.innerHTML = `<button type="button" id="tb-bell" aria-label="Notifications" aria-haspopup="true" aria-expanded="false"><i class="fas fa-bell"></i><span id="tb-bell-badge" hidden>0</span></button>
        <div id="tb-notif-panel" role="dialog" aria-label="Notifications" hidden>
          <div class="np-head"><strong>Notifications</strong><button type="button" id="np-readall">Mark all as read</button></div>
          <div id="np-push" hidden></div><div id="np-list"></div></div>`;
    document.body.appendChild(bell);
    const $ = id => document.getElementById(id);
    const ago = iso => { const s = Math.max(1, (Date.now() - new Date(iso)) / 1000 | 0); if (s < 60) return 'just now'; if (s < 3600) return (s / 60 | 0) + 'm ago'; if (s < 86400) return (s / 3600 | 0) + 'h ago'; return (s / 86400 | 0) + 'd ago'; };

    function paint() {
        const b = $('tb-bell-badge'); b.hidden = unread < 1; b.textContent = unread > 99 ? '99+' : unread;
        $('tb-bell').classList.toggle('has-unread', unread > 0);
        $('np-list').innerHTML = items.length ? items.map(n => {
            const lines = String(n.body).split('\n'); const kind = n.kind === 'new_signal' ? 'fa-bolt' : 'fa-rotate';
            return `<button type="button" class="np-item${n.read_at ? '' : ' unread'}" data-id="${n.id}" data-sig="${n.signal_id || ''}">
                <i class="fas ${kind}"></i><span class="np-body"><b>${TB.esc(n.title)}</b>${lines.map(l => `<span>${TB.esc(l)}</span>`).join('')}
                <small title="${TB.esc(new Date(n.created_at).toLocaleString())}">${ago(n.created_at)}</small></span>${n.read_at ? '' : '<em class="np-dot"></em>'}</button>`; }).join('')
            : '<p class="np-empty"><i class="fas fa-bell-slash"></i><br>No notifications yet.<br><small>New signals and status updates appear here instantly.</small></p>';
    }
    async function load() {
        const [list, cnt] = await Promise.all([
            supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30),
            supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)]);
        if (list.error) return console.warn('notifications:', list.error.message);
        const fresh = list.data.filter(n => !known.has(n.id));
        items = list.data; unread = cnt.count || 0; list.data.forEach(n => known.add(n.id));
        if (!first) fresh.filter(n => !n.read_at).slice(0, 3).forEach(TB.notify);
        first = false; paint();
    }
    TB.reloadNotifications = load;
    function toggle(v) { open = v === undefined ? !open : v; $('tb-notif-panel').hidden = !open; $('tb-bell').setAttribute('aria-expanded', open); if (open) { paint(); } }
    $('tb-bell').addEventListener('click', e => { e.stopPropagation(); toggle(); });
    document.addEventListener('click', e => { if (open && !e.target.closest('#tb-bell-wrap')) toggle(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(false); });
    $('np-readall').addEventListener('click', async () => { await supabase.rpc('mark_all_notifications_read'); await load(); });
    $('np-list').addEventListener('click', async e => {
        const it = e.target.closest('.np-item'); if (!it) return;
        if (it.classList.contains('unread')) { await supabase.rpc('mark_notification_read', { p_id: it.dataset.id }); load(); }
        toggle(false);
        if (it.dataset.sig) TB.openSignal(it.dataset.sig);
    });
    // Responsive in-app toast (replaces the generic popup for notifications): wraps text, respects safe areas, never wider than the screen
    const stack = document.createElement('div'); stack.id = 'tb-toasts'; stack.setAttribute('aria-live', 'polite'); document.body.appendChild(stack);
    TB.notify = n => {
        const lines = String(n.body).split('\n').filter(Boolean), el = document.createElement('div'); el.className = 'tb-toast'; el.setAttribute('role', 'status'); el.tabIndex = 0;
        el.innerHTML = `<i class="fas ${n.kind === 'new_signal' ? 'fa-bolt' : 'fa-rotate'}"></i><span class="tt-body"><b>${TB.esc(n.title)}</b><span>${TB.esc(lines.slice(0, 2).join(' · '))}</span></span><button type="button" class="tt-x" aria-label="Dismiss">&times;</button>`;
        const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
        el.addEventListener('click', e => { if (e.target.closest('.tt-x')) return kill(); if (n.signal_id) TB.openSignal(n.signal_id); kill(); });
        stack.appendChild(el); while (stack.children.length > 3) stack.firstChild.remove();
        setTimeout(kill, 8000);
    };
    TB.openSignal = id => { TB._focusSignal = id; TB.go('signals'); TB.emit('focus-signal', id); };

    document.addEventListener('DOMContentLoaded', () => {
        load(); TB.live('notifications', load, 'user_id=eq.' + TB.uid);
        setInterval(paint, 60000);                                   // keep "5m ago" fresh
    });
})();
