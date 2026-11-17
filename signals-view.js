/* TRADE BARR - SIGNALS (read-only for everyone). Same `signals` rows the providers manage in the Entry Tracker. */
(function () {
    'use strict';
    const root = () => document.getElementById('signals-root');
    let rows = [], filter = 'all', provider = 'all', loaded = false;
    const pht = iso => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso)) + ' PHT';
    const cls = r => r.outcome === 'win' ? 'win' : r.outcome === 'loss' ? 'loss' : r.outcome === 'breakeven' ? 'be' : r.outcome === 'cancelled' ? 'cancel' : r.is_closed ? 'closed' : 'active';
    const num = v => (v === null || v === undefined) ? null : Number(v);

    function card(r) {
        const tps = [1, 2, 3, 4, 5, 6, 7, 8].map(i => [i, num(r['tp' + i])]).filter(x => x[1] !== null);
        const hit = r.status.match(/^TP([1-8]) Hit$/); const hitN = hit ? +hit[1] : 0;
        return `<article class="sig-card dir-${r.direction}" id="sig-card-${r.id}" data-id="${r.id}">
          <header>
            <div class="sig-prov">${TB.avatar(r.provider_username, r.provider_avatar, r.provider_avatar_v, 38)}
              <div><small>SIGNAL PROVIDER</small><strong>${TB.esc(r.provider_username)}</strong>
              <span class="role-pill role-${r.provider_role}">${r.provider_role === 'owner' ? 'OWNER' : 'ADMIN'}</span></div></div>
            <span class="sig-status st-${cls(r)}">${TB.esc(window.__label(r))}</span>
          </header>
          <div class="sig-main"><span class="sig-pair">${TB.esc(r.pair)}</span><span class="sig-dir">${r.direction}</span></div>
          <dl class="sig-grid">
            <div class="wide"><dt>ENTRY AREA</dt><dd>${TB.esc(r.entry_area)}</dd></div>
            ${r.confirmation ? `<div class="wide"><dt>CONFIRMATION</dt><dd class="conf">${TB.esc(r.confirmation)}</dd></div>` : ''}
            <div><dt>STOP LOSS</dt><dd class="sl">${TB.esc(num(r.sl))}</dd></div>
            ${tps.map(([i, v]) => `<div><dt>TP${i}${hitN >= i ? ' ✓' : ''}</dt><dd class="tp${hitN >= i ? ' hit' : ''}">${TB.esc(v)}</dd></div>`).join('')}
          </dl>
          <footer><span><i class="far fa-clock"></i> Published ${pht(r.created_at)}</span><span><i class="fas fa-rotate"></i> Updated ${pht(r.updated_at)}</span></footer>
        </article>`;
    }
    window.__label = r => (r.status === 'Active' && r.is_closed) ? 'CLOSED' : ((r.status === 'Disregarded' ? 'CANCELLED' : r.status.toUpperCase()) + (r.is_closed ? ' · CLOSED' : ''));

    function paint() {
        const el = root(); if (!el) return;
        const provs = [...new Map(rows.map(r => [r.provider_id, r.provider_username])).entries()];
        const f = rows.filter(r => (provider === 'all' || r.provider_id === provider) &&
            (filter === 'all' || (filter === 'active' && r.outcome === 'none' && !r.is_closed) || (filter === 'win' && r.outcome === 'win') ||
             (filter === 'loss' && r.outcome === 'loss') || (filter === 'closed' && (r.is_closed || r.outcome !== 'none'))));
        el.innerHTML = `
          <div class="view-header"><h2><i class="fas fa-tower-broadcast" style="color:var(--accent);margin-right:10px;"></i>Signals</h2>
            <div class="status-indicator"><span class="pulse-dot"></span></div></div>
          <p class="sig-lead">Live trade signals published by the TRADE BARR owner and authorized admins. These are view-only; the signal provider is taken from the publishing account.</p>
          <div class="sig-filters" role="group" aria-label="Filter signals">
            ${[['all', 'All'], ['active', 'Active'], ['win', 'TP Hit'], ['loss', 'Stop Loss'], ['closed', 'Completed']].map(([k, l]) => `<button type="button" data-f="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('')}
            <select id="sig-prov-filter" aria-label="Filter by provider"><option value="all">All providers</option>${provs.map(([id, n]) => `<option value="${id}"${provider === id ? ' selected' : ''}>${TB.esc(n)}</option>`).join('')}</select>
          </div>
          <div class="sig-list">${!loaded ? '<div class="skeleton" style="height:180px;border-radius:14px"></div>'.repeat(2)
            : f.length ? f.map(card).join('') : '<div class="sig-empty"><i class="fas fa-satellite-dish"></i><p>No signals match this filter yet.</p></div>'}</div>`;
        el.querySelectorAll('.sig-filters button').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; paint(); }));
        el.querySelector('#sig-prov-filter').addEventListener('change', e => { provider = e.target.value; paint(); });
        focus();
    }
    function focus() {
        const id = TB._focusSignal; if (!id) return; const c = document.getElementById('sig-card-' + id);
        if (c) { TB._focusSignal = null; c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 2600); }
        else if (filter !== 'all' || provider !== 'all') { filter = 'all'; provider = 'all'; paint(); }
    }
    async function load() {
        const { data, error } = await supabase.from('signals_feed').select('*').order('created_at', { ascending: false }).limit(200);
        if (error) { if (root()) root().innerHTML = `<p class="sig-empty">Could not load signals: ${TB.esc(TB.err(error))}</p>`; return; }
        rows = data; loaded = true; paint();
    }
    document.addEventListener('DOMContentLoaded', () => {
        paint(); load(); TB.live('signals', load);
        TB.on('access', load);                                               // username / avatar changes show on new renders
        TB.on('focus-signal', () => setTimeout(() => { load().then(focus); }, 50));
        document.querySelector('.nav-link[data-target="signals"]').addEventListener('click', load);
    });
})();
