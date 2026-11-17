// Storage Key
const LEGACY_KEY = 'supreme_fx_signals_v1';   // old browser-only store (one-time import below)

// --- DISCORD WEBHOOK SETUP ---
const DISCORD_WEBHOOK_URL = (window.CONFIG && CONFIG.DISCORD_WEBHOOK_URL) || '';

async function sendToDiscord(message) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
    } catch (error) { 
        console.error("Discord error:", error); 
    }
}

// --- TELEGRAM BROADCAST FUNCTION ---
async function sendSignalToTelegram(signalData) {
    const tg = (window.CONFIG && CONFIG.TELEGRAM) || {};
    const BOT_TOKEN = tg.BOT_TOKEN, CHAT_ID = tg.CHAT_ID, TOPIC_ID = tg.TOPIC_ID;
    if (!BOT_TOKEN || !CHAT_ID) return;   // Telegram not configured in config.js

    let message = `🔥 <b>TRADE BARR LIVE SIGNAL</b> 🔥\n\n`;
    if (signalData.provider_username) message += `<b>Provider:</b> ${signalData.provider_username}\n`;
    message += `<b>Pair:</b> ${signalData.pair}\n`;
    message += `<b>Direction:</b> ${signalData.direction}\n`;
    message += `<b>Entry Area:</b> <code>${signalData.entry}</code>\n`;
    message += `<b>Stop Loss (SL):</b> <code>${signalData.sl}</code>\n\n`;
    
    message += `🎯 <b>TP1:</b> <code>${signalData.tp1}</code>\n`;
    if (signalData.tp2) message += `🎯 <b>TP2:</b> <code>${signalData.tp2}</code>\n`;
    if (signalData.tp3) message += `🎯 <b>TP3:</b> <code>${signalData.tp3}</code>\n`;
    if (signalData.tp4) message += `🎯 <b>TP4:</b> <code>${signalData.tp4}</code>\n`;
    if (signalData.tp5) message += `🎯 <b>TP5:</b> <code>${signalData.tp5}</code>\n`
    if (signalData.tp6) message += `🎯 <b>TP6:</b> <code>${signalData.tp6}</code>\n`
    if (signalData.tp7) message += `🎯 <b>TP7:</b> <code>${signalData.tp7}</code>\n`
    if (signalData.tp8) message += `🎯 <b>TP8:</b> <code>${signalData.tp8}</code>\n`
    
    message += `\n📊 <b>Est. R:R:</b> 1:${signalData.rr}`;

    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                ...(TOPIC_ID ? { message_thread_id: TOPIC_ID } : {}),
                text: message,
                parse_mode: 'HTML'
            })
        });

        const resData = await response.json();
        if (resData.ok) {
            console.log("✈️ Signal successfully sent to Telegram Topic!");
        } else {
            console.error("Telegram API Error:", resData.description);
        }
    } catch (error) {
        console.error("Failed to connect to Telegram API:", error);
    }
}
// --- TELEGRAM STATUS UPDATE FUNCTION ---
async function sendStatusUpdateToTelegram(textMessage) {
    const tg = (window.CONFIG && CONFIG.TELEGRAM) || {};
    const BOT_TOKEN = tg.BOT_TOKEN, CHAT_ID = tg.CHAT_ID, TOPIC_ID = tg.TOPIC_ID;
    if (!BOT_TOKEN || !CHAT_ID) return;   // Telegram not configured in config.js

    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST'
            ,headers:{ 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                ...(TOPIC_ID ? { message_thread_id: TOPIC_ID } : {}),
                text: `<b>TRADE BARR UPDATE:</b>\n${textMessage}`,
                parse_mode: 'HTML'
            })
        });
    } catch (error) {
        console.error("Telegram Status Update Error:", error);
    }
}

// -----------------------------
// 1. Helper: Get Current Philippine Time (PHT)
function getPHTFormattedDate() {
    const options = {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    return new Intl.DateTimeFormat('en-US', options).format(new Date()) + ' PHT';
}

// 2. Storage Helpers
// ---- Supabase-backed store: the SAME `signals` rows feed the Signals page, Winrate & History and notifications ----
let ENTRY_CACHE = [];
function phtFromISO(iso) {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso)) + ' PHT';
}
const _n = v => (v === null || v === undefined || v === '') ? null : Number(v);
// Convert a DB row into the legacy object shape the existing templates/calculations use. Text is escaped here because
// providers type it and OTHER users render it.
function rowToSignal(r) {
    const e = window.TB ? TB.esc : (x => x);
    const conf = r.confirmation ? e(r.confirmation) : null;
    const o = { id: r.seq, uid: r.id, date: phtFromISO(r.created_at), pair: r.pair, direction: r.direction,
        entry: conf ? `${e(r.entry_area)} | CONFIRMATION: ${conf}` : e(r.entry_area), entry_area: r.entry_area, confirmation: r.confirmation,
        sl: _n(r.sl), rr: e(r.rr || '1:0.0'), status: r.status, is_closed: !!r.is_closed, outcome: r.outcome,
        provider_id: r.provider_id, provider_username: r.provider_username || '', created_at: r.created_at, updated_at: r.updated_at };
    for (let i = 1; i <= 8; i++) o['tp' + i] = _n(r['tp' + i]);
    return o;
}
window.rowToSignal = rowToSignal;
function getStoredSignals() { return ENTRY_CACHE; }
function saveSignals() { renderAll(); }
async function loadEntrySignals() {
    if (!window.TB || !TB.can('tracker')) return;
    let q = supabase.from('signals_feed').select('*').order('created_at', { ascending: false }).limit(500);
    if (TB.access.tier !== 'owner') q = q.eq('provider_id', TB.uid);          // providers see their own; the owner has oversight of all
    const { data, error } = await q;
    if (error) { console.error('Entry Tracker load failed:', error.message); return; }
    ENTRY_CACHE = data.map(rowToSignal); renderAll();
}
async function dbUpdateSignal(id, patch) {
    const { data, error } = await supabase.from('signals').update(patch).eq('seq', id).select('seq');
    if (error || !data || !data.length) { alert('Update not allowed: ' + (error ? TB.err(error) : 'you can only update your own signals.')); return false; }
    await loadEntrySignals(); return true;
}

// 3. Calculation Helpers
function calculateRR(entry, sl, tp) {
    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    if (risk === 0) return '1:0.0';
    return `1:${(reward / risk).toFixed(1)}`;
}

function calculatePips(signal) {
    const entry = parseFloat(signal.entry);
    const s1 = parseFloat(signal.sl);   // fixed: the field is `sl` (was `s1`, so stop-loss pips were always 0)
    const tp1 = parseFloat(signal.tp1);
    const isBuy = (signal.direction || '').toUpperCase() === 'BUY';

    if (isNaN(entry)) return 0;

    let diff = 0;
    const status = (signal.status || '').toUpperCase();

    if (status.includes('TP') || status.includes('TAKE PROFIT')) {
        let target = isNaN(tp1) ? entry : tp1;
        for (let i = 1; i <= 8; i++) {
            if (status.includes(`TP${i}`)) {
                const tpVal = parseFloat(signal[`tp${i}`]);
                if (!isNaN(tpVal)) target = tpVal;
            }
        }
        diff = isBuy ? (target - entry) : (entry - target);
    } else if (status.includes('EARLY TP')) {
        const matchedPrice = status.match(/@\s*([0-9.]+)/);
        const exitPrice = matchedPrice ? parseFloat(matchedPrice[1]) : entry;
        diff = isBuy ? (exitPrice - entry) : (entry - exitPrice);
    } else if (status.includes('STOP LOSS')) {
        const stopPrice = isNaN(s1) ? entry : s1;
        diff = isBuy ? (stopPrice - entry) : (entry - stopPrice);
    } else {
        return 0;
    }

    let multiplier = 1;
    if (signal.pair === 'BITCOIN' || signal.pair === 'BTCUSD' || (signal.pair && signal.pair.includes('BTC'))) {
        multiplier = 0.1;
    } else if (signal.pair === 'XAUUSD') {
        multiplier = 10;
    } else if (signal.pair === 'EURUSD') {
        multiplier = 10000;      // fixed: 1 pip = 0.0001 (0.1 rounded every EURUSD trade to 0)
    } else if (signal.pair === 'US30') {
        multiplier = 1;          // index: 1 point
    }
    
    const pips = Math.round(diff * multiplier);
    return isNaN(pips) ? 0 : pips;
}

// --- SYNC AI ANALYSIS TO LIVE SIGNAL FORM (SUPPORT FOR ENTRY AREAS) ---
// UPDATE your window.syncAnalysisToLiveSignal definition to accept pairName:
window.syncAnalysisToLiveSignal = function(direction, entry, sl, masterTp, pairName = 'XAUUSD') {
    const rawEntry = String(entry).trim();
    const entryPrice = parseFloat(rawEntry.split('-')[0].trim());
    const stopLoss = parseFloat(String(sl).replace(/[^0-9.]/g, ''));
    const takeProfit = parseFloat(String(masterTp).replace(/[^0-9.]/g, ''));

    if (isNaN(entryPrice) || isNaN(stopLoss) || isNaN(takeProfit)) {
        console.warn("Sync Notice: Could not parse price numbers for calculation.", { entry, sl, masterTp });
        return;
    }

    const tpDistance = takeProfit - entryPrice;
    const tp1 = entryPrice + (tpDistance * 0.13);
    const tp2 = entryPrice + (tpDistance * 0.25);
    const tp3 = entryPrice + (tpDistance * 0.38);
    const tp4 = entryPrice + (tpDistance * 0.50);
    const tp5 = entryPrice + (tpDistance * 0.63);
    const tp6 = entryPrice + (tpDistance * 0.75);
    const tp7 = entryPrice + (tpDistance * 0.88);
    const tp8 = takeProfit;

    const setInputValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    const d1El = document.getElementById('sig-direction');
    if (d1El) d1El.value = (direction || 'BUY').toUpperCase();

    // Sets the pair dropdown to BITCOIN or XAUUSD dynamically
    const pairEl = document.getElementById('sig-pair');
    if (pairEl) pairEl.value = pairName;

    setInputValue('sig-entry', rawEntry);
    setInputValue('sig-sl', stopLoss.toFixed(2));
    setInputValue('sig-tp1', tp1.toFixed(2));
    setInputValue('sig-tp2', tp2.toFixed(2));
    setInputValue('sig-tp3', tp3.toFixed(2));
    setInputValue('sig-tp4', tp4.toFixed(2));
    setInputValue('sig-tp5', tp5.toFixed(2));
    setInputValue('sig-tp6', tp6.toFixed(2));
    setInputValue('sig-tp7', tp7.toFixed(2));
    setInputValue('sig-tp8', tp8.toFixed(2));
};

// 4. Global Broadcast Function (Called by button onclick)
window.broadcastSignal = async function() {
    if (!window.TB || !TB.can('createSignals')) { alert('Only the owner and authorized admins can publish signals.'); return; }
    const val = id => (document.getElementById(id)?.value ?? '').toString().trim();
    if (!val('sig-entry') || !val('sig-sl') || !val('sig-tp1')) { alert("Please fill in at least Entry Price, Stop Loss, and TP1."); return; }

    // AI-synced entries may carry "| CONFIRMATION: ..." inside the entry text: split it into its own field
    let entryArea = val('sig-entry'), confirmation = val('sig-confirmation');
    const m = entryArea.split(/\s*\|\s*CONFIRMATION:\s*/i);
    if (m.length > 1) { entryArea = m[0].trim(); if (!confirmation) confirmation = m.slice(1).join(' ').trim(); }
    const entryCalc = parseFloat(entryArea.split('-')[0].trim());
    const num = id => { const v = val(id); return v === '' ? null : parseFloat(v); };
    const row = { pair: val('sig-pair'), direction: val('sig-direction'), entry_area: entryArea, confirmation: confirmation || null,
        sl: num('sig-sl'), tp1: num('sig-tp1'), tp2: num('sig-tp2'), tp3: num('sig-tp3'), tp4: num('sig-tp4'), tp5: num('sig-tp5'), tp6: num('sig-tp6'), tp7: num('sig-tp7'), tp8: num('sig-tp8'), status: 'Active' };
    if (/[<>]/.test(entryArea + (confirmation || ''))) { alert('The characters < and > are not allowed in signal text.'); return; }
    row.rr = calculateRR(entryCalc, row.sl, row.tp8 || row.tp1);

    const btn = document.querySelector('#signal-form button[onclick*="broadcastSignal"], #view-signal button[onclick*="broadcastSignal"]'); if (btn) btn.disabled = true;
    // provider_id is NOT sent: the database sets it from the authenticated session
    const { data, error } = await supabase.from('signals').insert(row).select('*').single();
    if (btn) btn.disabled = false;
    if (error) { alert('Could not publish signal: ' + TB.err(error)); return; }
    await loadEntrySignals();
    const newSignal = rowToSignal({ ...data, provider_username: TB.access.username });
    TB.toast('Signal published to all members', 'success');

    sendSignalToTelegram(newSignal);                       // optional broadcast channels (config.js)
    sendToDiscord(`
**TRADE BARR**
**Provider:** ${TB.access.username}
**Pair:** ${newSignal.pair}
**Direction:** ${newSignal.direction}
**Price:** ${newSignal.entry}
**Stop Loss:** ${newSignal.sl}
${[1,2,3,4,5,6,7,8].map(i => `**Take Profit ${i}:** ${newSignal['tp'+i] || 'N/A'}`).join('\n')}

*The entry price is the area where we monitor whether the market respects the designated zone. If the market does not respect the designated area, DO NOT ENTER!*

*ALWAYS ANALYZE AND MONITOR FIRST THE SIGNAL! GOODLUCK SUPREMES! @everyone*`);

    const form = document.getElementById('signal-form'); if (form) form.reset();
};

// --- UPDATED STATUS HANDLER ---
window.updateSignalStatus = async function(id, newStatus) {
    let finalStatus = newStatus;

    // --- ADD THIS CLOSED HANDLER HERE ---
    if (!window.TB || !TB.can('updateSignals')) { alert('Only signal providers can update signal status.'); return; }
    if (newStatus === 'Closed') {
        const signals = getStoredSignals();
        const sig = signals.find(s => s.id === id);
        if (sig) {
            const statusText = sig.status || '';
            
            // Extract the highest TP number hit (e.g. from "TP3 Hit" or similar)
            let maxTpHit = 0;
            const match = statusText.match(/TP\s*([0-8])/i) || statusText.match(/([0-8])/);
            if (match && (statusText.includes('TP') || statusText.includes('Take Profit'))) {
                maxTpHit = parseInt(match[1]) || 0;
            }

            // Assign flames to all TPs up to the max hit level (on the right side)
            const tp1Flame = (maxTpHit >= 1) ? ' 🔥' : '';
            const tp2Flame = (maxTpHit >= 2) ? ' 🔥' : '';
            const tp3Flame = (maxTpHit >= 3) ? ' 🔥' : '';
            const tp4Flame = (maxTpHit >= 4) ? ' 🔥' : '';
            const tp5Flame = (maxTpHit >= 5) ? ' 🔥' : '';
            const tp6Flame = (maxTpHit >= 6) ? ' 🔥' : '';
            const tp7Flame = (maxTpHit >= 7) ? ' 🔥' : '';
            const tp8Flame = (maxTpHit >= 8) ? ' 🔥' : '';

            const closedMessage = `🔴 <b>TRADE BARR SIGNAL CLOSED. WAIT FOR THE NEXT SIGNAL.</b> 🔴\n\n` +
                `<b>Pair:</b> ${sig.pair}\n` +
                `<b>Direction:</b> ${sig.direction}\n` +
                `<b>Entry Area:</b> <code>${sig.entry}</code>\n` +
                `<b>Stop Loss (SL):</b> <code>${sig.sl}</code>\n\n` +
                (sig.tp1 ? `🎯<b>TP1:</b> <code>${sig.tp1}</code>${tp1Flame}\n` : '') +
                (sig.tp2 ? `🎯<b>TP2:</b> <code>${sig.tp2}</code>${tp2Flame}\n` : '') +
                (sig.tp3 ? `🎯<b>TP3:</b> <code>${sig.tp3}</code>${tp3Flame}\n` : '') +
                (sig.tp4 ? `🎯<b>TP4:</b> <code>${sig.tp4}</code>${tp4Flame}\n` : '') +
                (sig.tp5 ? `🎯<b>TP5:</b> <code>${sig.tp5}</code>${tp5Flame}\n` : '') +
                (sig.tp6 ? `🎯<b>TP6:</b> <code>${sig.tp6}</code>${tp6Flame}\n` : '') +
                (sig.tp7 ? `🎯<b>TP7:</b> <code>${sig.tp7}</code>${tp7Flame}\n` : '') +
                (sig.tp8 ? `🎯<b>TP8:</b> <code>${sig.tp8}</code>${tp8Flame}\n` : '');

            if (await dbUpdateSignal(id, { is_closed: true }) && typeof sendStatusUpdateToTelegram === 'function') {
                sendStatusUpdateToTelegram(closedMessage);
            }
        }
        return;
    }
    // ------------------------------------

    // 1. Beautiful Dark Theme Popup for Early TP[cite: 20]
    if (newStatus === 'Early Take Profit') {
        // ... rest of your existing function ...
        const { value: price } = await Swal.fire({
            title: 'Early Take Profit',
            text: 'Enter the exact close price:',
            input: 'text',
            background: '#0C0C0E', // Matches your dashboard dark background
            color: '#ffffff',
            confirmButtonColor: '#E11D2E', // SupremeFX Gold
            showCancelButton: true
        });
        
        if (!price) return; // User canceled
        finalStatus = `Early TP @ ${price.trim()}`;
    } 
    
    // 2. Beautiful Dropdown Popup for TP Hit
    else if (newStatus === 'Take Profit Hit') {
        const { value: tpLevel } = await Swal.fire({
            title: 'Take Profit Hit',
            text: 'Which TP was reached?',
            input: 'select',
            inputOptions: {
                '1': 'TP 1',
                '2': 'TP 2',
                '3': 'TP 3',
                '4': 'TP 4',
                '5': 'TP 5',
                '6': 'TP 6',
                '7': 'TP 7',
                '8': 'TP 8'
            },
            background: '#0C0C0E',
            color: '#ffffff',
            confirmButtonColor: '#E11D2E',
            showCancelButton: true
        });
        
        if (!tpLevel) return; // User canceled
        finalStatus = `TP${tpLevel} Hit`;
    }
    
    // Save to the database (RLS + triggers: history, outcome, notifications) and refresh
    const patch = { status: finalStatus }; if (finalStatus === 'Active') patch.is_closed = false;
    if (!(await dbUpdateSignal(id, patch))) return;
    const signals = getStoredSignals();
    const index = signals.findIndex(s => s.id === id);
    if (index !== -1) {
        renderLiveSignals();

// --- SEND FULL SIGNAL STATUS UPDATE TO DISCORD & TELEGRAM ---
        const sig = signals[index];

        // 1. Detect TP levels reached and assign flame emoji 🔥 to hit TPs
        const tpNum = finalStatus.includes('TP1') ? 1 :
                      finalStatus.includes('TP2') ? 2 :
                      finalStatus.includes('TP3') ? 3 :
                      finalStatus.includes('TP4') ? 4 :
                      finalStatus.includes('TP5') ? 5 :
                      finalStatus.includes('TP6') ? 6 :
                      finalStatus.includes('TP7') ? 7 :
                      finalStatus.includes('TP8') ? 8 : 0;

        const tp1Flame = tpNum >= 1 ? ' 🔥' : '';
        const tp2Flame = tpNum >= 2 ? ' 🔥' : '';
        const tp3Flame = tpNum >= 3 ? ' 🔥' : '';
        const tp4Flame = tpNum >= 4 ? ' 🔥' : '';
        const tp5Flame = tpNum >= 5 ? ' 🔥' : ''
        const tp6Flame = tpNum >= 6 ? ' 🔥' : ''
        const tp7Flame = tpNum >= 7 ? ' 🔥' : ''
        const tp8Flame = tpNum >= 8 ? ' 🔥' : ''

        // 2. Format status footer below Est. R:R for Stop Loss / Disregarded / Early TP
        let statusFooter = '';
        if (finalStatus === 'Stop Loss Hit') {
            statusFooter = '\n<b>❌ STOP LOSS HIT! WAIT FOR ANOTHER SIGNAL!</b>';
        } else if (finalStatus === 'Breakeven') {
            statusFooter = '\n<b>➖ BREAKEVEN - SIGNAL CLOSED AT ENTRY.</b>';
        } else if (finalStatus === 'Disregarded') {
            statusFooter = '\n<b>❌ THE SIGNAL IS DISREGARDED! WAIT FOR ANOTHER SIGNAL!</b>';
        } else if (finalStatus.includes('Early TP')) {
            statusFooter = `\n<b>🎯🔥 ${finalStatus}</b>`;
        }

        // 3. Construct the updated full signal layout
        const updatedSignalMessage = `🔥 <b>TRADE BARR SIGNAL UPDATE</b> 🔥\n\n` +
`<b>Pair:</b> ${sig.pair}\n` +
`<b>Direction:</b> ${sig.direction}\n` +
`<b>Entry Area:</b> <code>${sig.entry}</code>\n` +
`<b>Stop Loss (SL):</b> <code>${sig.sl}</code>\n\n` +
`🎯<b>TP1:</b> <code>${sig.tp1}</code>${tp1Flame}\n` +
`🎯<b>TP2:</b> <code>${sig.tp2}</code>${tp2Flame}\n` +
`🎯<b>TP3:</b> <code>${sig.tp3}</code>${tp3Flame}\n` +
`🎯<b>TP4:</b> <code>${sig.tp4}</code>${tp4Flame}\n` +
`🎯<b>TP5:</b> <code>${sig.tp5}</code>${tp5Flame}\n` +
`🎯<b>TP6:</b> <code>${sig.tp6}</code>${tp6Flame}\n` +
`🎯<b>TP7:</b> <code>${sig.tp7}</code>${tp7Flame}\n` +
`🎯<b>TP8:</b> <code>${sig.tp8}</code>${tp8Flame}\n\n` +
`📊 <b>Est. R:R:</b> ${sig.rr || sig.estRr || '1:1'}${statusFooter}`;

        // 4. Dispatch to connected Webhooks/APIs
        if (typeof sendToDiscord === 'function') {
            sendToDiscord(updatedSignalMessage.replace(/<[^>]*>/g, '')); // Strips HTML tags for Discord
        }
        if (typeof sendStatusUpdateToTelegram === 'function') {
            sendStatusUpdateToTelegram(updatedSignalMessage);
        }
    }
};

window.deleteSignal = async function(id) {
    if (!confirm('Delete this signal permanently? It will also disappear from clients and from your statistics.')) return;
    const { data, error } = await supabase.from('signals').delete().eq('seq', id).select('seq');
    if (error || !data || !data.length) { alert('Delete not allowed: ' + (error ? TB.err(error) : 'you can only delete your own signals.')); return; }
    await loadEntrySignals();
};

// 6. UI Renderers
function renderLiveSignals() {
    const container = document.getElementById('live-signals-list');
    if (!container) return;

    const signals = getStoredSignals();
    if (signals.length === 0) {
        container.innerHTML = `<p style="color: #71717A; text-align: center; padding: 2rem;">No entry yet.</p>`;
        return;
    }

    container.innerHTML = signals.map(sig => {
        const pips = calculatePips(sig);
        const dirColor = sig.direction === 'BUY' ? '#00C851' : '#FF4D5A';
            const isTPHit = sig.status.includes('TP Hit') || /TP[1-8] Hit/.test(sig.status);
    const isEarlyTP = sig.status.includes('Early TP');

        return `
        <div style="background: #0C0C0E; border: 1px solid #27272B; border-left: 4px solid ${dirColor}; border-radius: 8px; padding: 1.2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div>
                    <span style="background: rgba(255,255,255,0.1); padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; color: #E11D2E; font-weight: bold; margin-right: 8px;">${sig.pair}</span>
                    <strong style="color: ${dirColor}; font-size: 0.95rem;">${sig.direction}</strong>
                    <span style="color: #71717A; font-size: 0.75rem; margin-left: 10px;">${sig.date}</span>${sig.provider_id !== TB.uid ? `<span style="color:#FF8A92;font-size:0.72rem;margin-left:10px;">by ${TB.esc(sig.provider_username)}</span>` : ''}
                </div>
                <div style="font-family: monospace; font-weight: bold; color: ${pips >= 0 ? '#00C851' : '#FF4D5A'};">
                    Est R:R: ${sig.rr} | Profit: ${pips > 0 ? '+' : ''}${pips} Pips
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 0.8rem; margin-bottom: 12px;">
                <span>ENTRY: <strong style="color:#fff;">${sig.entry}</strong></span>
                <span>SL: <strong style="color:#FF4D5A;">${sig.sl}</strong></span>
                <span>TP1: <strong style="color:#00C851;">${sig.tp1}</strong></span>
                ${sig.tp2 ? `<span>TP2: <strong style="color:#00C851;">${sig.tp2}</strong></span>` : ''}
                ${sig.tp3 ? `<span>TP3: <strong style="color:#00C851;">${sig.tp3}</strong></span>` : ''}
                ${sig.tp4 ? `<span>TP4: <strong style="color:#00C851;">${sig.tp4}</strong></span>` : ''}
                ${sig.tp5 ? `<span>TP5: <strong style="color:#00C851;">${sig.tp5}</strong></span>` : ''}
                ${sig.tp6 ? `<span>TP6: <strong style="color:#00C851;">${sig.tp6}</strong></span>` : ''}
                ${sig.tp7 ? `<span>TP7: <strong style="color:#00C851;">${sig.tp7}</strong></span>` : ''}
                ${sig.tp8 ? `<span>TP8: <strong style="color:#00C851;">${sig.tp8}</strong></span>` : ''}
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                <span style="color: #A1A1AA; font-size: 0.75rem; margin-right: 6px;">Set Status:</span>
${['Active', 'Take Profit Hit', 'Early Take Profit', 'Stop Loss Hit', 'Breakeven', 'Closed', 'Disregarded'].map(st => {
    // 1. Check if the current button should be active
    let isBtnActive = false;
    
    // Highlight "Take Profit Hit" if the status has "TP" (like TP1 Hit) but isn't an early close
    if (st === 'Take Profit Hit' && sig.status.includes('TP') && !sig.status.includes('Early')) {
        isBtnActive = true;
    } 
    // Highlight "Early Take Profit" if the status contains our dynamic prompt string
    else if (st === 'Early Take Profit' && sig.status.includes('Early TP')) {
        isBtnActive = true;
    } 
    else if (st === 'Closed' && sig.is_closed) { isBtnActive = true; }
    // Highlight standard buttons (Active, Stop Loss, Disregarded)
    else if (sig.status === st) {
        isBtnActive = true;
    }

    // 2. Render the button with the correct gold or gray color
    return `<button onclick="updateSignalStatus(${sig.id}, '${st}')" 
        style="background: ${isBtnActive ? '#E11D2E' : '#151518'}; color: ${isBtnActive ? '#fff' : '#A1A1AA'}; border: 1px solid #34343A; padding: 4px 10px; border-radius: 4px; font-size: 0.72rem; cursor: pointer; font-weight: 600;">
        ${st}
    </button>`;
}).join('')}

                <button onclick="deleteSignal(${sig.id})" style="background: rgba(255,77,90,0.1); color: #FF4D5A; border: 1px solid rgba(255,77,90,0.3); padding: 4px 10px; border-radius: 4px; font-size: 0.72rem; cursor: pointer; margin-left: auto;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>`;
    }).join('');
}

let profitChartInstance = null;

function renderWinrateAndHistory(signalsOverride) {
    const signals = signalsOverride || getStoredSignals();
    
        const wins = signals.filter(s => {
        if (!s.status) return false;
        const stat = s.status.toLowerCase();
        return stat.includes('tp') || stat.includes('won') || stat.includes('take profit');
    });

    const losses = signals.filter(s => {
        if (!s.status) return false;
        const stat = s.status.toLowerCase();
        return stat.includes('lost') || stat.includes('stop loss');
    });

    const closedSignals = [...wins, ...losses];

    const totalClosed = closedSignals.length;
    const winrate = totalClosed > 0 ? ((wins.length / totalClosed) * 100).toFixed(1) : '0.0';
    const netPips = closedSignals.reduce((sum, s) => sum + calculatePips(s), 0);

    let avgRRVal = '1:0.0';
    if (totalClosed > 0) {
        const totalRRRatio = closedSignals.reduce((acc, s) => {
            const parts = String(s.rr).split(':');
            return acc + (parseFloat(parts[1]) || 0);
        }, 0);
        avgRRVal = `1:${(totalRRRatio / totalClosed).toFixed(1)}`;
    }

    const elWinrate = document.getElementById('stat-winrate');
    if (elWinrate) elWinrate.textContent = `${winrate}%`;

    const elWinLossCount = document.getElementById('stat-win-loss-count');
    if (elWinLossCount) elWinLossCount.textContent = `${wins.length} Wins / ${losses.length} Losses`;

    const elTotalSignals = document.getElementById('stat-total-signals');
    if (elTotalSignals) elTotalSignals.textContent = signals.length;

    const elBE = document.getElementById('stat-breakeven');
    if (elBE) elBE.textContent = `${signals.filter(s => s.outcome === 'breakeven').length} / ${signals.filter(s => s.outcome === 'cancelled').length}`;
    const elOC = document.getElementById('stat-open-closed');
    if (elOC) elOC.textContent = `${signals.filter(s => s.outcome === 'none' && !s.is_closed).length} open, ${signals.filter(s => s.is_closed).length} closed`;

    const elAvgRR = document.getElementById('stat-avg-rr');
    if (elAvgRR) elAvgRR.textContent = avgRRVal;

    const elNetProfit = document.getElementById('stat-net-profit');
    if (elNetProfit) elNetProfit.textContent = `${netPips > 0 ? '+' : ''}${netPips}`;
    if (elNetProfit) elNetProfit.style.color = netPips < 0 ? '#FF4D5A' : (netPips > 0 ? '#00C851' : '#fff');

    const execLogTable = document.getElementById('execution-log-tbody');
    if (execLogTable) {
        execLogTable.innerHTML = signals.map(sig => {
            const isWin = sig.outcome === 'win';
            const isLoss = sig.status === 'Stop Loss Hit';
            
            let statusBadge = `<span style="color: #71717A;">⚪ ${sig.status}</span>`;
            if (isWin) statusBadge = `<span style="color: #00C851; font-weight: bold;">🟢 ${sig.status}</span>`;
            if (isLoss) statusBadge = `<span style="color: #FF4D5A; font-weight: bold;">🔴 ${sig.status}</span>`;

            return `
            <tr style="border-bottom: 1px solid #27272B; font-size: 0.8rem; text-align: left;">
                <td style="padding: 10px; color: #A1A1AA;">${sig.date}</td>
                <td style="padding: 10px; font-weight: bold; color: #E11D2E;">${sig.pair}</td>
                <td style="padding: 10px; color: ${sig.direction === 'BUY' ? '#00C851' : '#FF4D5A'}; font-weight: bold;">${sig.direction}</td>
                <td style="padding: 10px; font-family: monospace;">${sig.entry}</td>
                <td style="padding: 10px; font-family: monospace; color: #FF4D5A;">${sig.sl}</td>
                <td style="padding: 10px; font-family: monospace; color: #00C851;">${sig.tp8 || sig.tp1}</td>
                <td style="padding: 10px;">${statusBadge}</td>
                <td style="padding: 10px; font-family: monospace;">${sig.rr}</td>
            </tr>`;
        }).join('');
    }

    renderProfitCurveChart(closedSignals);
}

function renderProfitCurveChart(closedSignals) {
    const canvas = document.getElementById('profitCurveChart');
    if (!canvas || typeof Chart === 'undefined') return;

    let runningProfit = 0;
    const labels = ['Start'];
    const dataPoints = [0];

    [...closedSignals].reverse().forEach((sig, idx) => {
        runningProfit += calculatePips(sig);
        labels.push(`Trade ${idx + 1}`);
        dataPoints.push(runningProfit);
    });

    if (profitChartInstance) profitChartInstance.destroy();

    profitChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative Net Profit (Pips)',
                data: dataPoints,
                borderColor: '#E11D2E',
                backgroundColor: 'rgba(225,29,46, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { color: '#27272B' }, ticks: { color: '#A1A1AA' } },
                y: { grid: { color: '#27272B' }, ticks: { color: '#A1A1AA' } }
            },
            plugins: { legend: { labels: { color: '#fff' } } }
        }
    });
}

// Master Render Function (Entry Tracker only; Winrate & History is rendered per provider by winrate.js)
function renderAll() { renderLiveSignals(); }

// ---- One-time import of the old browser-only Entry Tracker history (kept, never deleted) ----
function legacyParseDate(str) {
    const m = /([A-Za-z]{3}) (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2}) (AM|PM)/.exec(str || ''); if (!m) return null;
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(m[1]); if (mon < 0) return null;
    let h = parseInt(m[4], 10) % 12 + (m[6] === 'PM' ? 12 : 0);
    return new Date(Date.UTC(+m[3], mon, +m[2], h - 8, +m[5])).toISOString();     // PHT = UTC+8
}
function showLegacyImport() {
    const note = document.getElementById('tracker-note'); if (!note || !TB.can('createSignals')) return;
    const flag = 'tb_legacy_imported_' + TB.uid; let legacy = [];
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'); } catch (e) {}
    if (!legacy.length || localStorage.getItem(flag)) { note.innerHTML = ''; return; }
    note.innerHTML = `<div class="tb-banner"><i class="fas fa-database"></i> Found <b>${legacy.length}</b> signal(s) saved in this browser by the old Entry Tracker.
        <button type="button" id="tb-import-legacy" class="tb-mini-btn">Import into my account</button>
        <small>No notifications are sent for imported history.</small></div>`;
    document.getElementById('tb-import-legacy').addEventListener('click', async () => {
        const ok = /^(Active|Stop Loss Hit|Disregarded|Breakeven|TP[1-8] Hit|Early TP @ [0-9]+(\.[0-9]+)?)$/;
        const rows = legacy.slice().reverse().filter(x => x && ok.test(x.status || '')).map(x => {
            const parts = String(x.entry).split(/\s*\|\s*CONFIRMATION:\s*/i), clean = t => String(t).replace(/[<>]/g, '');
            const r = { pair: String(x.pair).toUpperCase(), direction: String(x.direction).toUpperCase(), entry_area: clean(parts[0]).slice(0, 200),
                confirmation: parts.length > 1 ? clean(parts.slice(1).join(' ')).slice(0, 2000) : null, sl: _n(x.sl), tp1: _n(x.tp1),
                rr: String(x.rr || ''), status: x.status, imported: true };
            for (let i = 2; i <= 8; i++) r['tp' + i] = _n(x['tp' + i]);
            const d = legacyParseDate(x.date); if (d) r.created_at = d; return r; }).filter(r => r.sl !== null && r.tp1 !== null && /^[A-Z0-9]{3,12}$/.test(r.pair));
        const { error } = await supabase.from('signals').insert(rows);
        if (error) return alert('Import failed: ' + TB.err(error));
        localStorage.setItem(flag, '1'); TB.toast(`Imported ${rows.length} signal(s)`, 'success'); showLegacyImport(); loadEntrySignals();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.TB || !TB.can('tracker')) return;
    renderAll(); loadEntrySignals(); showLegacyImport();
    if (TB.live) TB.live('signals', () => loadEntrySignals());     // other providers/owner changes show up without refresh
});
