/* ============================================================================
   LIVE CHART (US30) - Dow Jones Industrial Average
   Own symbol, own price precision/validation, own DOM ids (us30-*), own analysis prompt.
   Shares nothing with XAUUSD / BTC / EURUSD except the page structure.
   ============================================================================ */
(function () {
    'use strict';
    const US30 = {
        symbol: (window.CONFIG && CONFIG.US30_SYMBOL) || 'FOREXCOM:DJI',   // CFD index feed, TradingView
        decimals: 2,                                                       // index quotes: 2 dp (e.g. 44,125.50)
        min: 10000, max: 100000,                                           // sanity range: rejects XAUUSD/BTC/EURUSD prices
        lot: '0.1'                                                         // indices trade in small lots
    };
    window.US30_CONFIG = US30;
    const $ = id => document.getElementById(id);
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    const btnHTML = '<i class="fas fa-solid fa-magnifying-glass-dollar" style="margin-right: 8px;"></i> Sync Live Chart Insight';

    function initUs30TradingView() {
        const c = $('us30-tv_chart_widget'); if (!c || typeof TradingView === 'undefined') return;
        c.innerHTML = '';
        new TradingView.widget({
            autosize: true, symbol: US30.symbol, interval: '15', timezone: 'Etc/UTC', theme: 'dark', style: '1', locale: 'en',
            enable_publishing: false, backgroundColor: '#000000', gridColor: 'rgba(255, 255, 255, 0.05)',
            hide_top_toolbar: false, hide_legend: false, save_image: false, container_id: 'us30-tv_chart_widget',
            studies: ['Volume@tv-basicstudies', 'MASimple@tv-basicstudies'],
            disabled_features: ['header_symbol_search', 'header_compare']
        });
    }
    window.initUs30TradingView = initUs30TradingView;

    function buildPrompt(price) {
        return `You are a professional index trader specializing in intraday trading of the US30 (Dow Jones Industrial Average, quoted in points). Analyze US30 using the live price ${price} as the current reference point. All prices must be US30 index levels (five digits, e.g. 44125.50) - never forex or gold levels.

Follow the exact JSON structure below with no markdown formatting or backticks:
{
  "bias": "5 words market bias determination.",
  "confidence": "5 words confidence rate.",
  "smcInstRetail": "7 sentences detailing Institutional Price Support/Resistance and Retailers Price Resistance/Support with specific prices (numbers form).",
  "smcSessions": "7 sentences analyzing Asia, London and New York session highs/lows and the US cash open (9:30 ET) with specific prices (numbers form).",
  "smcBlocksFvg": "7 sentences analyzing Order Blocks, FVGs, and Fibonacci levels with specific prices (numbers form).",
  "smcStructureAction": "7 sentences detailing Quasimodo patterns, Inducement, and price action (numbers form).",
  "supportResistance": "7 sentences detailing Key Support & Resistance with exact prices (numbers form).",
  "liquidityZones": "7 sentences detailing Liquidity Zones with exact prices (numbers form).",
  "buyLot": "0.1 - 1.0 (Based on the confidence)",
  "sellLot": "0.1 - 1.0 (Based on the confidence)",
  "buyScenario": { "condition": "3 SENTENCES Setup trigger with the Execution on 5 Minutes Time Frame (WITH SPECIFIC PRICE, numbers form).", "entry": "price", "sl": "price", "tp": "price" },
  "sellScenario": { "condition": "3 SENTENCES Setup trigger with the Execution on 5 Minutes Time Frame (WITH SPECIFIC PRICE, numbers form).", "entry": "price", "sl": "price", "tp": "price" },
  "mtfDaily": { "trend": "1-2 words", "desc": "3 brief sentence on Monthly Time Frame Support and Resistance, numbers form" },
  "mtfH4": { "trend": "1-2 words", "desc": "3 brief sentence on Daily Time Frame Support and Resistance, numbers form" },
  "mtfH1": { "trend": "1-2 words", "desc": "3 brief sentence on H4 Time Frame Support and Resistance, numbers form" }
}`;
    }

    // every returned price must look like a US30 level, otherwise it is shown as '--' instead of a wrong number
    const okPx = v => { const n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return !isNaN(n) && n >= US30.min && n <= US30.max; };
    const px = v => okPx(v) ? parseFloat(String(v).replace(/[^0-9.]/g, '')).toFixed(US30.decimals) : '--';

    function render(a) {
        set('us30-market-bias', a.bias); set('us30-confidence-score', a.confidence);
        set('us30-inst-retail', a.smcInstRetail || ''); set('us30-sessions', a.smcSessions || ''); set('us30-blocks-fvg', a.smcBlocksFvg || '');
        set('us30-structure-action', a.smcStructureAction || ''); set('us30-levels', a.supportResistance || ''); set('us30-liquidity', a.liquidityZones || '');
        [['buy', a.buyScenario, a.buyLot], ['sell', a.sellScenario, a.sellLot]].forEach(([k, s, lot]) => {
            s = s || {};
            set(`us30-${k}-setup-desc`, s.condition || ''); set(`us30-${k}-entry`, px(s.entry)); set(`us30-${k}-sl`, px(s.sl)); set(`us30-${k}-tp`, px(s.tp));
            set(`us30-${k}-lot`, /^[0-9.]+$/.test(String(lot || '').trim()) ? String(lot).trim() : US30.lot);
        });
        [['daily', a.mtfDaily], ['h4', a.mtfH4], ['h1', a.mtfH1]].forEach(([k, m]) => { if (m) { set(`us30-mtf-${k}-status`, m.trend); set(`us30-mtf-${k}-text`, m.desc); } });
    }
    window.US30_render = render;

    async function sync(btn) {
        const key = localStorage.getItem('supreme_gemini_key');
        if (!key) { alert('Please go to the Fundamental Analysis section and connect your free Google API key first.'); return; }
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i> Analyzing US30...';
        try {
            const { value } = await Swal.fire({
                title: 'Current Price (US30)', text: 'Enter the exact US30 (Dow Jones) price currently shown on your chart:', input: 'text',
                background: '#0C0C0E', color: '#ffffff', confirmButtonColor: '#E11D2E', cancelButtonColor: '#27272B', showCancelButton: true,
                inputValidator: v => { const n = parseFloat(String(v).replace(/,/g, ''));
                    if (!v || isNaN(n)) return 'Please enter a valid price number!';
                    if (n < US30.min || n > US30.max) return `That does not look like a US30 price (expected ${US30.min.toLocaleString()} - ${US30.max.toLocaleString()}). Check you are not using a gold, BTC or EURUSD price.`; }
            });
            if (!value) return;
            const price = parseFloat(String(value).replace(/,/g, '')).toFixed(US30.decimals);
            const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=' + key, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(price) }] }], generationConfig: { responseMimeType: 'application/json' } })
            });
            const raw = await res.json(); if (!res.ok) throw new Error(raw.error?.message || 'API Request Failed');
            render(JSON.parse(raw.candidates[0].content.parts[0].text));
        } catch (err) { console.error('US30 Sync Error:', err); alert('Analysis failed: ' + err.message); }
        finally { btn.innerHTML = btnHTML; }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const nav = document.querySelector('[data-target="us30-chart"]');
        if (nav) nav.addEventListener('click', initUs30TradingView);
        const b = $('us30-btn-chart-sync'); if (b) b.addEventListener('click', () => sync(b));
        [['buy', 'BUY'], ['sell', 'SELL']].forEach(([k, t]) => { const card = $(`us30-${k}-card-trigger`); if (!card) return;
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => { if (window.TB && !TB.can('tracker')) return TB.toast('Only signal providers can use the Entry Tracker.', 'info');
                if (typeof fillEntryTrackerForAsset === 'function') fillEntryTrackerForAsset('us30', 'US30', t); }); });
    });
})();
