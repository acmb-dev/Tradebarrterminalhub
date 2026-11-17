/* TRADE BARR - Winrate & History, role-aware.
   Everyone sees ONLY the owner + admins (signal providers). No client data exists in this view:
   list_providers() and the signals table only ever contain provider activity.
   Statistics come from the recorded signal outcomes; each signal is one row, counted once. */
(function () {
    'use strict';
    let providers = [], current = null, rows = [];
    const $ = id => document.getElementById(id);

    function list() {
        const el = $('wr-providers'); if (!el) return;
        el.innerHTML = `
          <div class="view-header"><h2><i class="fas fa-trophy" style="color:var(--accent);margin-right:10px;"></i>Winrate &amp; History</h2></div>
          <p class="sig-lead">Verified performance of our signal providers, calculated from their real recorded signal outcomes.</p>
          <div class="wr-grid">${providers.length ? providers.map((p, i) => `
            <button type="button" class="wr-card" data-id="${p.id}">
              <div class="wr-top">${TB.avatar(p.username, p.avatar_path, p.avatar_updated_at, 46)}
                <div><small>${i + 1}. ${p.role === 'owner' ? 'OWNER' : 'ADMIN'}</small><strong>${TB.esc(p.username)}</strong></div>
                <span class="wr-rate">${Number(p.winrate).toFixed(1)}%</span></div>
              <div class="wr-bar"><i style="width:${Math.min(100, p.winrate)}%"></i></div>
              <div class="wr-meta"><span><b>${p.total}</b> signals</span><span class="g"><b>${p.wins}</b> wins</span><span class="r"><b>${p.losses}</b> losses</span><span><b>${p.breakeven}</b> BE</span></div>
              <span class="wr-open">View performance <i class="fas fa-arrow-right"></i></span>
            </button>`).join('') : '<div class="sig-empty"><i class="fas fa-chart-pie"></i><p>No signal providers yet.</p></div>'}</div>`;
        el.querySelectorAll('.wr-card').forEach(b => b.addEventListener('click', () => open(b.dataset.id)));
    }
    function showList() { current = null; $('wr-detail').style.display = 'none'; $('wr-providers').style.display = ''; list(); }

    async function open(id) {
        current = providers.find(p => p.id === id) || { id, username: '…', role: 'admin' };
        $('wr-providers').style.display = 'none'; $('wr-detail').style.display = '';
        await loadDetail();
    }
    async function loadDetail() {
        if (!current) return;
        const { data, error } = await supabase.from('signals_feed').select('*').eq('provider_id', current.id).order('created_at', { ascending: false }).limit(1000);
        if (error) return TB.toast(TB.err(error), 'error');
        rows = data.map(window.rowToSignal);                                 // same mapping + calculations the Entry Tracker uses
        const p = providers.find(x => x.id === current.id) || current;
        $('wr-header').innerHTML = `<button type="button" id="wr-back" class="tb-mini-btn"><i class="fas fa-arrow-left"></i> All providers</button>
          <div class="wr-who">${TB.avatar(p.username, p.avatar_path, p.avatar_updated_at, 54)}
            <div><small>${p.role === 'owner' ? 'OWNER' : 'ADMIN'} · SIGNAL PROVIDER</small><h2 style="margin:0">${TB.esc(p.username)}</h2></div></div>
          <p class="sig-lead" style="margin:.4rem 0 1.2rem">Winrate = wins ÷ (wins + losses). Breakeven and cancelled signals are shown separately and never inflate the rate.</p>`;
        $('wr-back').addEventListener('click', showList);
        window.renderWinrateAndHistory(rows);
    }
    async function loadProviders() {
        const { data, error } = await supabase.rpc('list_providers'); if (error) return console.warn('providers:', error.message);
        providers = data; if (current) loadDetail(); else list();
    }
    document.addEventListener('DOMContentLoaded', () => {
        loadProviders(); TB.live('signals', loadProviders); TB.on('access', loadProviders);
        document.querySelector('.nav-link[data-target="history"]').addEventListener('click', () => { loadProviders(); });
    });
})();
