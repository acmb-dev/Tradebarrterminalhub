/* TRADE BARR - PROFILE. Every action goes through the database (RPCs / Auth / Storage); nothing here grants anything. */
(function () {
    'use strict';
    const $ = (id, r = document) => r.getElementById ? r.getElementById(id) : null;
    const root = () => document.getElementById('profile-root');
    const SUPPORT = () => (window.CONFIG && CONFIG.SUPPORT_TELEGRAM_URL) || 'https://t.me/eyssi20';
    const MAX_BYTES = 2 * 1024 * 1024, TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    let pendingFile = null, pendingUrl = null, pwShown = false, codes = [];
    const fmt = iso => iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not available';
    const msg = (el, text, ok) => { if (!el) return; el.textContent = text || ''; el.className = 'pf-msg ' + (text ? (ok ? 'ok' : 'bad') : ''); };

    function membership(a) {
        if (a.role === 'owner') return { m: 'OWNER', t: 'OWNER PRIVILEGES', s: 'ACTIVE' };
        if (a.role === 'admin') return { m: 'ADMIN', t: 'WHITELISTED ACCESS', s: 'ACTIVE' };
        if (a.role === 'client') {
            if (a.membership_type === 'lifetime') return { m: 'PAID MEMBER', t: 'LIFETIME', s: 'LIFETIME ACCESS' };
            return { m: 'PAID MEMBER', t: 'LIMITED', s: a.status === 'expired' ? 'EXPIRED' : 'ACTIVE' };
        }
        return { m: 'FREE MEMBER', t: 'FREE ACCESS', s: 'FREE ACCESS' };
    }
    function remainingHTML(a) {
        if (a.role !== 'client') return a.role === 'free' ? '<span class="pf-dim">No paid time on this account</span>' : '<b>No expiry</b>';
        if (a.membership_type === 'lifetime') return '<b class="pf-ok">LIFETIME ACCESS</b>';
        const r = TB.remaining(a); return r && r.ms > 0 ? `<b id="pf-remaining">${r.text}</b>` : '<b class="pf-bad" id="pf-remaining">Expired</b>';
    }
    const canRedeem = a => a.role === 'free' || (a.role === 'client' && a.membership_type !== 'lifetime');

    function render() {
        const a = TB.access, el = root(); if (!el || !a) return; const ms = membership(a);
        const preview = pendingUrl ? `<img src="${pendingUrl}" alt="Preview" class="pf-avatar-img">` : TB.avatar(a.username, a.avatar_path, a.avatar_updated_at, 104).replace('<img ', '<img class="pf-avatar-img" ').replace('<span style="', '<span class="pf-avatar-img" style="');
        el.innerHTML = `
        <div class="view-header"><h2><i class="fas fa-user-circle" style="color:var(--accent);margin-right:10px;"></i>Profile</h2></div>
        <div class="pf-grid">

          <section class="pf-card pf-account">
            <h3>Account Information</h3>
            <div class="pf-ident">
              <div class="pf-avatar">${preview}</div>
              <div class="pf-ident-text"><strong class="pf-name">${TB.esc(a.username)}</strong>
                <span class="role-pill role-${a.role}${a.status === 'expired' ? ' role-expired' : ''}">${TB.roleLabel(a)}</span>
                <div class="pf-avatar-actions">
                  <input type="file" id="pf-file" accept="image/png,image/jpeg,image/webp" hidden>
                  <button type="button" class="pf-btn" id="pf-pick"><i class="fas fa-camera"></i> ${a.avatar_path ? 'Change picture' : 'Upload picture'}</button>
                  ${pendingFile ? '<button type="button" class="pf-btn primary" id="pf-save-av"><i class="fas fa-check"></i> Save picture</button><button type="button" class="pf-btn" id="pf-cancel-av">Cancel</button>' : ''}
                  ${a.avatar_path && !pendingFile ? '<button type="button" class="pf-btn danger" id="pf-rm-av"><i class="fas fa-trash"></i> Remove</button>' : ''}
                  <small class="pf-dim">PNG, JPG or WEBP · max 2 MB</small><div id="pf-av-msg" class="pf-msg"></div>
                </div>
              </div>
            </div>
            <dl class="pf-dl">
              <div><dt>Username</dt><dd>${TB.esc(a.username)}</dd></div>
              <div><dt>Account role</dt><dd>${a.role.toUpperCase()}</dd></div>
              <div><dt>Membership type</dt><dd>${ms.m}</dd></div>
              <div><dt>Access code status</dt><dd class="${ms.s === 'EXPIRED' ? 'pf-bad' : 'pf-ok'}">${ms.s}</dd></div>
              <div><dt>Account created</dt><dd>${fmt(a.created_at)}</dd></div>
              <div><dt>Password</dt><dd class="pf-pw"><input id="pf-pw-field" type="password" value="••••••••••••" readonly aria-label="Password (hidden)">
                <button type="button" id="pf-eye" class="pf-eye" aria-label="Show or hide password status"><i class="fas fa-eye"></i></button></dd>
                <small id="pf-pw-note" class="pf-dim" hidden>Passwords are stored securely hashed by the authentication system and can never be displayed.</small></div>
            </dl>
          </section>

          <section class="pf-card">
            <h3>Membership Information</h3>
            <dl class="pf-dl one">
              <div><dt>Membership</dt><dd>${ms.m}</dd></div>
              <div><dt>Access type</dt><dd>${ms.t}</dd></div>
              <div><dt>Time remaining</dt><dd id="pf-rem-wrap">${remainingHTML(a)}</dd></div>
              ${a.role === 'client' && a.membership_type === 'limited' ? `<div><dt>Expires</dt><dd>${new Date(a.expires_at).toLocaleString()}</dd></div>` : ''}
            </dl>
            <a class="pf-btn support" href="${TB.esc(SUPPORT())}" target="_blank" rel="noopener noreferrer"><i class="fab fa-telegram"></i> Contact Support</a>
          </section>

          <section class="pf-card" id="pf-push-card"></section>

          <section class="pf-card">
            <h3>Change Username</h3>
            <label for="pf-newname">New username</label>
            <input id="pf-newname" type="text" maxlength="24" value="${TB.esc(a.username)}" autocomplete="off">
            <div id="pf-name-msg" class="pf-msg"></div>
            ${TB.isStaff() ? '<small class="pf-dim">As a signal provider, your new name will appear on your signals. Historical ownership of your past signals does not change.</small>' : ''}
            <button type="button" class="pf-btn primary" id="pf-save-name"><i class="fas fa-save"></i> Save username</button>
          </section>

          <section class="pf-card">
            <h3>Change Password</h3>
            <form id="pf-pw-form" autocomplete="off">
              <label for="pf-cur">Current password</label><input id="pf-cur" type="password" autocomplete="current-password" required>
              <label for="pf-new">New password</label><input id="pf-new" type="password" autocomplete="new-password" minlength="8" required>
              <label for="pf-new2">Confirm new password</label><input id="pf-new2" type="password" autocomplete="new-password" minlength="8" required>
              <small class="pf-dim">At least 8 characters, with letters and numbers.</small>
              <div id="pf-pw-msg" class="pf-msg"></div>
              <button type="submit" class="pf-btn primary"><i class="fas fa-key"></i> Update password</button>
            </form>
          </section>

          ${a.role === 'free' || a.status === 'expired' ? `
          <section class="pf-card pf-upgrade">
            <h3>${a.role === 'free' ? 'Upgrade Your Account' : 'Renew Your Membership'}</h3>
            <p>Want to unlock all TRADE BARR features? Upgrade to a <b>PAID MEMBERSHIP</b> and gain access to:</p>
            <ul><li><i class="fas fa-check"></i> All Live Charts (XAUUSD, BTC, EURUSD, US30)</li><li><i class="fas fa-check"></i> Signals</li><li><i class="fas fa-check"></i> Tips &amp; Tricks</li><li><i class="fas fa-check"></i> All other paid-member features</li></ul>
            <a class="pf-btn primary big" id="pf-get-code" href="${TB.esc(SUPPORT())}" target="_blank" rel="noopener noreferrer"><i class="fab fa-telegram"></i> GET YOUR ACCESS CODE</a>
          </section>` : ''}

          ${canRedeem(a) ? `
          <section class="pf-card">
            <h3>Redeem Access Code</h3>
            <p class="pf-dim" style="margin-top:0">${a.role === 'free' ? 'Enter your purchased code. Your account, username, picture and PnL records stay exactly as they are.' : 'Enter a new code to extend your membership. Time is added on top of what you have left.'}</p>
            <form id="pf-redeem-form" autocomplete="off"><input id="pf-code" type="text" placeholder="Enter access code" autocapitalize="characters" spellcheck="false" required>
              <div id="pf-code-msg" class="pf-msg"></div><button type="submit" class="pf-btn primary"><i class="fas fa-unlock"></i> Redeem code</button></form>
          </section>` : ''}

          ${TB.can('manageCodes') ? `
          <section class="pf-card pf-wide" id="pf-codes-card">
            <h3>Access Code Management <span class="role-pill role-owner">OWNER</span></h3>
            <form id="pf-gen-form" class="pf-gen">
              <select id="pf-gen-kind" aria-label="Code type"><option value="client|1D">Paid · 1 day</option><option value="client|7D">Paid · 7 days</option><option value="client|1M" selected>Paid · 1 month</option><option value="client|3M">Paid · 3 months</option><option value="client|1Y">Paid · 1 year</option><option value="client|LT">Paid · Lifetime</option><option value="free|">Free member</option></select>
              <input id="pf-gen-count" type="number" min="1" max="50" value="1" aria-label="How many codes">
              <input id="pf-gen-label" type="text" maxlength="40" placeholder="Label (optional)" aria-label="Label">
              <button type="submit" class="pf-btn primary"><i class="fas fa-plus"></i> Generate</button>
            </form>
            <div id="pf-gen-out" class="pf-gen-out" hidden></div><div id="pf-gen-msg" class="pf-msg"></div>
            <div class="pf-filter"><select id="pf-code-filter" aria-label="Filter codes"><option value="">All codes</option><option value="client">Paid</option><option value="free">Free</option><option value="admin">Admin (whitelist)</option><option value="owner">Owner (whitelist)</option></select></div>
            <div class="table-scroll"><table class="data-table pf-codes"><thead><tr><th>Code</th><th>Type</th><th>Duration</th><th>Status</th><th>Redeemed by</th><th></th></tr></thead><tbody id="pf-codes-body"><tr><td colspan="6">Loading…</td></tr></tbody></table></div>
          </section>` : ''}
        </div>`;
        wire();
        if (TB.pushPaintCard) TB.pushPaintCard();
        if (TB.can('manageCodes')) loadCodes();
    }

    function wire() {
        const a = TB.access;
        $('pf-pick').addEventListener('click', () => $('pf-file').click());
        $('pf-file').addEventListener('change', e => pick(e.target.files[0]));
        const sv = $('pf-save-av'); if (sv) sv.addEventListener('click', saveAvatar);
        const cn = $('pf-cancel-av'); if (cn) cn.addEventListener('click', () => { clearPending(); render(); });
        const rm = $('pf-rm-av'); if (rm) rm.addEventListener('click', removeAvatar);
        $('pf-eye').addEventListener('click', () => { pwShown = !pwShown; const f = $('pf-pw-field'); f.type = pwShown ? 'text' : 'password'; f.value = pwShown ? 'Stored securely (hashed)' : '••••••••••••';
            $('pf-pw-note').hidden = !pwShown; $('pf-eye').firstElementChild.className = pwShown ? 'fas fa-eye-slash' : 'fas fa-eye'; });
        // username availability (debounced)
        let t; const inp = $('pf-newname');
        inp.addEventListener('input', () => { clearTimeout(t); const v = inp.value.trim(); const m = $('pf-name-msg');
            if (v === a.username) return msg(m, '');
            t = setTimeout(async () => { const { data } = await supabase.rpc('username_available', { p_username: v });
                const same = v.toLowerCase() === TB.access.username.toLowerCase();
                msg(m, data || same ? 'Username is available.' : 'Not available (taken, or must be 3-24 chars: letters, numbers, space . _ -).', data || same); }, 350); });
        $('pf-save-name').addEventListener('click', saveName);
        $('pf-pw-form').addEventListener('submit', savePassword);
        const rf = $('pf-redeem-form'); if (rf) rf.addEventListener('submit', redeem);
        const gf = $('pf-gen-form'); if (gf) { gf.addEventListener('submit', generate); $('pf-code-filter').addEventListener('change', loadCodes); }
    }

    // ---- avatar ----
    function clearPending() { if (pendingUrl) URL.revokeObjectURL(pendingUrl); pendingFile = pendingUrl = null; }
    function pick(f) {
        if (!f) return; const m = $('pf-av-msg');
        if (!TYPES[f.type]) return msg(m, 'Only PNG, JPG or WEBP images are allowed.');
        if (f.size > MAX_BYTES) return msg(m, 'That image is larger than 2 MB.');
        const url = URL.createObjectURL(f), img = new Image();
        img.onload = () => { clearPending(); pendingFile = f; pendingUrl = url; render(); };
        img.onerror = () => { URL.revokeObjectURL(url); msg(m, 'That file is not a valid image.'); };
        img.src = url;
    }
    async function saveAvatar() {
        const a = TB.access, m = $('pf-av-msg'), f = pendingFile; if (!f) return; $('pf-save-av').disabled = true;
        const path = `${a.id}/avatar-${Date.now()}.${TYPES[f.type]}`;
        const up = await supabase.storage.from('avatars').upload(path, f, { contentType: f.type, upsert: false });
        if (up.error) { $('pf-save-av').disabled = false; return msg(m, 'Upload failed: ' + up.error.message); }
        const { error } = await supabase.rpc('set_avatar', { p_path: path });
        if (error) { await supabase.storage.from('avatars').remove([path]); $('pf-save-av').disabled = false; return msg(m, TB.err(error)); }
        await cleanupOld(a.id, path); clearPending(); await TB.refresh(); render(); TB.toast('Profile picture updated', 'success');
    }
    async function cleanupOld(uid, keep) {
        const { data } = await supabase.storage.from('avatars').list(uid); const del = (data || []).map(o => `${uid}/${o.name}`).filter(p => p !== keep);
        if (del.length) await supabase.storage.from('avatars').remove(del);
    }
    async function removeAvatar() {
        const a = TB.access; const { error } = await supabase.rpc('set_avatar', { p_path: null }); if (error) return msg($('pf-av-msg'), TB.err(error));
        await cleanupOld(a.id, null); await TB.refresh(); render(); TB.toast('Profile picture removed', 'success');
    }

    // ---- username / password / redeem ----
    async function saveName() {
        const v = $('pf-newname').value.trim(), m = $('pf-name-msg'); if (v === TB.access.username) return msg(m, 'That is already your username.');
        const { error } = await supabase.rpc('change_username', { p_new: v }); if (error) return msg(m, TB.err(error));
        await TB.refresh(); render(); TB.toast('Username updated everywhere', 'success');
    }
    async function savePassword(e) {
        e.preventDefault(); const m = $('pf-pw-msg'), cur = $('pf-cur').value, n1 = $('pf-new').value, n2 = $('pf-new2').value;
        if (n1.length < 8 || !/[A-Za-z]/.test(n1) || !/[0-9]/.test(n1)) return msg(m, 'New password needs at least 8 characters, with letters and numbers.');
        if (n1 !== n2) return msg(m, 'New passwords do not match.');
        if (n1 === cur) return msg(m, 'New password must be different from the current one.');
        const { data: { user } } = await supabase.auth.getUser();
        const chk = await supabase.auth.signInWithPassword({ email: user.email, password: cur });         // verifies the CURRENT password
        if (chk.error) return msg(m, 'Current password is incorrect.');
        const { error } = await supabase.auth.updateUser({ password: n1 }); if (error) return msg(m, error.message);
        $('pf-pw-form').reset(); msg(m, 'Password changed successfully.', true); TB.toast('Password changed', 'success');
    }
    async function redeem(e) {
        e.preventDefault(); const m = $('pf-code-msg'), code = $('pf-code').value.trim(); if (!code) return;
        const before = TB.access.role; const { data, error } = await supabase.rpc('redeem_access_code', { p_code: code }); if (error) return msg(m, TB.err(error));
        await TB.refresh();                                  // permissions + navigation update immediately, no re-login
        render(); Swal.fire({ title: before === 'free' ? 'Account upgraded!' : 'Membership extended!', icon: 'success', background: '#0C0C0E', color: '#fff', confirmButtonColor: '#E11D2E',
            html: `<p style="color:#A1A1AA">All paid features are unlocked on your existing account.</p><div class="pf-swal">${data.membership_type === 'lifetime' ? 'LIFETIME ACCESS' : 'Time remaining: ' + TB.remaining(TB.access).text}</div>` });
    }

    // ---- owner: access codes ----
    async function generate(e) {
        e.preventDefault(); const [kind, dur] = $('pf-gen-kind').value.split('|'), m = $('pf-gen-msg'), out = $('pf-gen-out');
        const { data, error } = await supabase.rpc('owner_generate_codes', { p_kind: kind, p_count: +$('pf-gen-count').value, p_duration: dur || null, p_label: $('pf-gen-label').value.trim() || null });
        if (error) return msg(m, TB.err(error));
        out.hidden = false; out.innerHTML = `<b>${data.length} new code(s)</b> <button type="button" class="pf-btn" id="pf-copy-all">Copy all</button><pre>${data.map(c => TB.esc(c.code)).join('\n')}</pre>`;
        $('pf-copy-all').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(data.map(c => c.code).join('\n')); TB.toast('Copied', 'success'); });
        msg(m, ''); loadCodes();
    }
    const durLabel = c => c.kind === 'client' ? (c.duration_days ? c.duration_days + ' day' + (c.duration_days > 1 ? 's' : '') : 'Lifetime') : '—';
    async function loadCodes() {
        const body = $('pf-codes-body'); if (!body) return; const k = $('pf-code-filter') ? $('pf-code-filter').value : '';
        const { data, error } = await supabase.rpc('owner_list_codes', { p_kind: k || null });
        if (error) { body.innerHTML = `<tr><td colspan="6">${TB.esc(TB.err(error))}</td></tr>`; return; }
        codes = data; body.innerHTML = data.length ? data.map(c => `<tr><td><code>${TB.esc(c.code)}</code></td><td>${c.kind.toUpperCase()}</td><td>${durLabel(c)}</td>
            <td>${c.redeemed_by_username ? '<span class="pf-dim">Redeemed</span>' : c.disabled ? '<span class="pf-bad">Disabled</span>' : '<span class="pf-ok">Available</span>'}</td>
            <td>${c.redeemed_by_username ? TB.esc(c.redeemed_by_username) : '—'}</td>
            <td>${!c.redeemed_by_username && !c.disabled && (c.kind === 'client' || c.kind === 'free') ? `<button type="button" class="pf-btn danger sm" data-dis="${TB.esc(c.code)}">Disable</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="6">No codes.</td></tr>';
        body.querySelectorAll('[data-dis]').forEach(b => b.addEventListener('click', async () => { const r = await supabase.rpc('owner_disable_code', { p_code: b.dataset.dis, p_disabled: true }); if (r.error) TB.toast(TB.err(r.error), 'error'); loadCodes(); }));
    }

    document.addEventListener('DOMContentLoaded', () => {
        render(); TB.on('access', () => { if (!pendingFile) render(); });
        TB.on('tick', () => { const r = $('pf-remaining'); const a = TB.access; if (r && a && a.membership_type === 'limited') { const x = TB.remaining(a); r.textContent = x.text; } });
    });
})();
