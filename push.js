/* TRADE BARR - phone/desktop push notifications (Web Push + service worker).
   The browser gives us a private subscription; we store it through an RPC; a Supabase Edge Function sends the push
   whenever the database creates a notification row for that user. */
(function () {
    'use strict';
    const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    const key = () => (window.CONFIG && CONFIG.VAPID_PUBLIC_KEY) || '';
    const u8 = b64 => { const p = '='.repeat((4 - b64.length % 4) % 4), s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
    const PREVIEW = /(^|\.)spck\.io$/i.test(location.hostname);      // Spck's run link is a virtual server: it cannot serve a service worker
    const FLAG = () => 'tb_push_on_' + (TB.uid || '');
    let reg = null;

    async function getReg() {
        if (reg) return reg;
        reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; return reg;
    }
    async function save(sub) {
        const j = sub.toJSON();
        const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent.slice(0, 200) });
        if (error) throw error;
    }
    async function state() {
        if (PREVIEW) return { s: 'preview' };
        if (!supported()) return { s: 'unsupported' };
        if (isIOS && !standalone()) return { s: 'ios-install' };
        if (!key()) return { s: 'not-configured' };
        if (Notification.permission === 'denied') return { s: 'denied' };
        try { const r = await getReg(); const sub = await r.pushManager.getSubscription();
            return { s: sub && Notification.permission === 'granted' ? 'on' : 'off', sub }; }
        catch (e) { reg = null;
            if (/404|bad HTTP response|Not ?Found|Failed to fetch|script/i.test(e.message)) return { s: 'no-sw' };
            if (/SecurityError|insecure/i.test(e.message)) return { s: 'insecure' };
            return { s: 'error', msg: e.message }; }
    }
    async function enable() {
        if (PREVIEW) throw new Error('Phone alerts need the site on its own HTTPS address (see the note above).');
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for this site in your browser settings.' : 'Permission was not granted.');
        const r = await getReg(); let sub = await r.pushManager.getSubscription();
        const opts = { userVisibleOnly: true, applicationServerKey: u8(key()) };
        try { sub = sub || await r.pushManager.subscribe(opts); }
        catch (e) { if (sub) await sub.unsubscribe(); sub = await r.pushManager.subscribe(opts); }     // VAPID key changed -> resubscribe
        await save(sub); localStorage.setItem(FLAG(), '1'); paint(); return sub;
    }
    async function disable() {
        const r = await getReg(), sub = await r.pushManager.getSubscription();
        if (sub) { await supabase.rpc('remove_push_subscription', { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
        localStorage.removeItem(FLAG()); paint();
    }
    async function test() {
        const r = await getReg();
        await r.showNotification('TRADE BARR test', { body: 'If you can read this, phone notifications work on this device.', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'tb-test' });
    }
    TB.push = { state, enable, disable, test };

    const LABEL = { on: ['ON', 'ok'], off: ['OFF', 'dim'], denied: ['BLOCKED', 'bad'], unsupported: ['NOT SUPPORTED', 'dim'], 'ios-install': ['INSTALL FIRST', 'dim'], 'not-configured': ['NOT SET UP', 'dim'], error: ['ERROR', 'bad'], preview: ['HOST NEEDED', 'dim'], 'no-sw': ['SETUP NEEDED', 'dim'], insecure: ['HTTPS NEEDED', 'dim'] };
    const HINT = {
        on: 'This device will get an alert for every new signal and status update, even when the site is closed.',
        off: 'Get an alert on this device for every new signal and status update - even when the site is closed.',
        denied: 'Notifications are blocked for this site. Open your browser menu -> Site settings -> Notifications and allow this site, then come back.',
        unsupported: 'This browser does not support push notifications. Use Chrome, Edge or Firefox on Android/desktop, or Safari on iPhone with the app added to the Home Screen.',
        'ios-install': 'On iPhone/iPad: tap Share -> "Add to Home Screen", open TRADE BARR from the new icon, then enable notifications here.',
        'not-configured': 'Push is not configured on this site yet (the owner needs to add the VAPID key - see README).',
        error: 'Could not start push notifications on this browser.',
        preview: 'Phone alerts cannot run inside the Spck preview (run.spck.io) because that link is a virtual server. Publish the site on a normal HTTPS host (GitHub Pages, Netlify, Cloudflare Pages, Vercel), open it there, and enable alerts here. Everything else works in the preview.',
        'no-sw': 'The file sw.js was not found next to dashboard.html on this website. Upload sw.js, manifest.webmanifest and the icons folder into the same folder as dashboard.html, then reload this page.',
        insecure: 'Push needs a secure (https) address. Open the site through its https:// link.'
    };
    async function paint() {
        const st = await state(), [lab, cls] = LABEL[st.s] || LABEL.error;
        const card = document.getElementById('pf-push-card');
        if (card) {
            card.innerHTML = `<h3>Phone Notifications <span class="pf-state ${cls}">${lab}</span></h3><p>${TB.esc((HINT[st.s] || HINT.error) + (st.s === 'error' && st.msg ? ' (' + st.msg + ')' : ''))}</p>
              <div class="pf-row">${st.s === 'off' ? '<button type="button" class="pf-btn primary" id="pf-push-on"><i class="fas fa-bell"></i> Enable notifications</button>' : ''}
              ${st.s === 'on' ? '<button type="button" class="pf-btn" id="pf-push-test"><i class="fas fa-paper-plane"></i> Send test</button><button type="button" class="pf-btn danger" id="pf-push-off"><i class="fas fa-bell-slash"></i> Turn off</button>' : ''}</div><div class="pf-msg" id="pf-push-msg"></div>`;
            const m = (t, ok) => { const e = document.getElementById('pf-push-msg'); if (e) { e.textContent = t; e.className = 'pf-msg ' + (ok ? 'ok' : 'bad'); } };
            const on = document.getElementById('pf-push-on'), off = document.getElementById('pf-push-off'), ts = document.getElementById('pf-push-test');
            if (on) on.addEventListener('click', async () => { on.disabled = true; try { await enable(); TB.toast('Phone notifications enabled', 'success'); } catch (e) { on.disabled = false; m(e.message || TB.err(e)); } });
            if (off) off.addEventListener('click', async () => { try { await disable(); TB.toast('Phone notifications turned off', 'info'); } catch (e) { m(TB.err(e)); } });
            if (ts) ts.addEventListener('click', async () => { try { await test(); m('Test sent - check your notification shade.', true); } catch (e) { m(e.message); } });
        }
        const bar = document.getElementById('np-push');
        if (bar) {
            bar.hidden = st.s !== 'off';
            if (st.s === 'off') { bar.innerHTML = '<i class="fas fa-mobile-screen"></i><span>Get alerts on your phone even when the site is closed</span><button type="button" id="np-push-on">Enable</button>';
                document.getElementById('np-push-on').addEventListener('click', async e => { e.stopPropagation(); try { await enable(); TB.toast('Phone notifications enabled', 'success'); } catch (x) { TB.toast(x.message || TB.err(x), 'error'); } }); }
        }
    }
    TB.pushPaintCard = paint;

    document.addEventListener('DOMContentLoaded', async () => {
        paint();
        TB.onLogout && TB.onLogout(async () => { try { const s = await state(); if (s.sub) await supabase.rpc('remove_push_subscription', { p_endpoint: s.sub.endpoint }); localStorage.removeItem(FLAG()); } catch (e) {} });
        if (PREVIEW || !supported() || !key()) return;
        try {   // keep this device linked to the account that is logged in on it right now
            const s = await state();
            if (s.s === 'on') await save(s.sub);
            else if (s.s === 'off' && Notification.permission === 'granted' && localStorage.getItem(FLAG())) { await enable(); }
        } catch (e) { console.warn('push sync:', e.message); }
        navigator.serviceWorker.addEventListener('message', e => {
            const d = e.data || {};
            if (d.type === 'open-signal' && d.signal_id) TB.openSignal(d.signal_id);
            if (d.type === 'push-received' && TB.reloadNotifications) TB.reloadNotifications();
        });
    });
})();
