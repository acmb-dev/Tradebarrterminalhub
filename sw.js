/* TRADE BARR service worker: receives Web Push while the site is closed and shows a phone notification.
   No caching on purpose (the app is always live data; this avoids stale-code problems). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'TRADE BARR', body: event.data ? event.data.text() : '' }; }
    event.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        // If the user is looking at the app right now, the in-app toast/bell already tells them: do not double-notify.
        const live = wins.find(c => c.visibilityState === 'visible' && c.focused);
        if (live) { live.postMessage({ type: 'push-received', data: d }); return; }
        await self.registration.showNotification(d.title || 'TRADE BARR', {
            body: d.body || '',
            icon: 'icons/icon-192.png', badge: 'badge-96.png',
            tag: d.tag || undefined, renotify: !!d.tag,
            vibrate: [120, 60, 120],
            data: { url: d.url || 'dashboard.html#signals', signal_id: d.signal_id || null }
        });
    })());
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const data = event.notification.data || {};
    event.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const open = wins.find(c => /dashboard\.html/.test(c.url));
        if (open) { await open.focus(); open.postMessage({ type: 'open-signal', signal_id: data.signal_id }); return; }
        const u = new URL('dashboard.html', self.registration.scope);
        if (data.signal_id) u.searchParams.set('signal', data.signal_id);
        u.hash = '#signals';
        await self.clients.openWindow(u.href);
    })());
});
