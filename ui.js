/* Trade Barr Terminal Hub - UI layer (presentation only; no business logic) */
(function () {
    'use strict';
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('mobile-menu-btn');

    // Scrim behind the mobile drawer
    const scrim = document.createElement('div');
    scrim.className = 'nav-scrim';
    document.body.appendChild(scrim);

    function sync() {
        const open = !!(sidebar && sidebar.classList.contains('open'));
        scrim.classList.toggle('show', open);
        if (menuBtn) {
            menuBtn.setAttribute('aria-expanded', String(open));
            menuBtn.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        }
    }
    function closeDrawer() { if (sidebar) { sidebar.classList.remove('open'); sync(); } }

    if (sidebar) {
        // app.js toggles .open; mirror it to the scrim without touching that logic
        new MutationObserver(sync).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
        scrim.addEventListener('click', closeDrawer);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
        // Only app.js's own nav handler closes the drawer for some targets; guarantee it for all
        sidebar.addEventListener('click', e => { if (e.target.closest('.nav-link')) setTimeout(closeDrawer, 0); });
    }

    // Rotating / resizing: leave the drawer state clean and let embedded charts re-fit
    let t;
    function onViewportChange() {
        clearTimeout(t);
        t = setTimeout(() => {
            if (window.innerWidth > 992) closeDrawer();
            window.dispatchEvent(new Event('resize')); // TradingView / Chart.js autosize
        }, 180);
    }
    window.addEventListener('orientationchange', onViewportChange);
    const mq = window.matchMedia('(orientation: portrait)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(onViewportChange);

    // A view that was hidden at load (e.g. the XAUUSD chart) needs a resize once it is shown
    document.addEventListener('click', e => {
        if (e.target.closest('.nav-link[data-target]')) {
            setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
            const main = document.querySelector('.main-content');
            if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // Wide tables scroll inside their own container instead of the page
    function wrapTables(root) {
        (root || document).querySelectorAll('table').forEach(tb => {
            const p = tb.parentElement;
            if (!p || p.classList.contains('table-scroll') || p.classList.contains('table-wrapper') ||
                p.classList.contains('calendar-table-wrapper')) return;
            const w = document.createElement('div');
            w.className = 'table-scroll';
            p.insertBefore(w, tb);
            w.appendChild(tb);
        });
    }
    wrapTables();
    // Tables rendered later by news.js / history.js / admin.js
    let pending = false;
    new MutationObserver(() => {
        if (pending) return; pending = true;
        requestAnimationFrame(() => { pending = false; wrapTables(); });
    }).observe(document.querySelector('.main-content') || document.body, { childList: true, subtree: true });

    // Cursor spotlight on glass panels (fine pointers only; skipped for reduced motion)
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const FX = '.glass-panel, .card, .dash-community-card, .main-content [style*="background: #0C0C0E"], .main-content [style*="background: rgba(255, 255, 255, 0.02)"]';
        let raf = 0;
        document.addEventListener('pointermove', e => {
            const t = e.target.closest && e.target.closest(FX);
            if (!t) return;
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const r = t.getBoundingClientRect();
                t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
                t.style.setProperty('--my', (e.clientY - r.top) + 'px');
            });
        }, { passive: true });
    }

    sync();
})();
