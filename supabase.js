// Supabase client. The CDN bundle already owns a global named `supabase` (the library namespace), so we capture the
// library first and then REUSE that same global name for the client (`var` may be re-declared; `let`/`const` cannot).
var __sbLib = window.supabase;
var supabase = null;
try {
    supabase = __sbLib.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        realtime: { params: { eventsPerSecond: 5 } }
    });
} catch (err) {
    console.warn('Supabase client not initialised - check config.js:', err.message);
}
