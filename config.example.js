// ============================================================================
// TRADE BARR - public client configuration
// Copy values from: Supabase Dashboard -> Project Settings -> API
// The anon key is PUBLIC by design (Row Level Security protects the data).
// NEVER put the service_role key, passwords, or access codes in this file.
// ============================================================================
var CONFIG = {
    SUPABASE_URL: 'YOUR_SUPABASE_PROJECT_URL',
    SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',

    SUPPORT_TELEGRAM_URL: 'https://t.me/eyssi20',   // Contact Support + "Get your access code"
    US30_SYMBOL: 'FOREXCOM:DJI',                    // TradingView symbol for the Dow Jones (US30) chart
    VAPID_PUBLIC_KEY: '',                           // Web Push public key (generate with tools/vapid-keygen.html) - see README section 8
    POLL_MS: 30000,                                 // fallback refresh interval if Realtime is unavailable

    // Optional broadcast channels used by the Entry Tracker. Leave blank to disable.
    // (These were previously hard-coded in signal.js. Anything placed here is visible to
    //  every visitor - prefer a Supabase Edge Function for production.)
    TELEGRAM: { BOT_TOKEN: '', CHAT_ID: '', TOPIC_ID: null },
    DISCORD_WEBHOOK_URL: ''
};
