# TRADE BARR upgrade - what was built, what was tested, what is left

## Implemented (all six upgrades, one connected system)
1. **Live Chart (US30)** - own nav item, own view, own DOM ids, own TradingView symbol (`FOREXCOM:DJI`, configurable), own 2-dp precision, own US30 analysis prompt, a 10,000-100,000 price sanity check (a gold/BTC/EURUSD price is rejected; out-of-range AI levels show `--`), US30 added to the Entry Tracker pair list (1 pip = 1 point). XAUUSD/BTC/EURUSD are unchanged and independent.
2. **Signals + roles** - Owner / Admin / Client / Free from the database. Codes: 3 owner (`..OW`) and 10 admin (`..AD`) whitelist rows (hard-capped by triggers), free (`..FR`) whitelist, paid codes (limited/lifetime). Being in the whitelist is required: a code that only *ends* in OW/AD/FR gets nothing. Permission matrix enforced in the UI **and** by RLS/RPCs. Entry Tracker (admin/owner) and the client Signals page read the same `signals` rows; provider = authenticated user (set by trigger, not typed); clients are read-only; status/closed are the only editable columns after publishing (entry/SL/TP immutable); owner has oversight of all signals.
3. **Profile** - avatar upload/change/remove (preview, type + 2 MB validation, Supabase Storage), username change (live availability, case-insensitive uniqueness, shows on signals while `provider_id` keeps history), password change (verifies current password), masked password field with eye (never reveals a password), membership panel with live days/hours/minutes, Contact Support -> https://t.me/eyssi20, free-member upgrade card and code redemption, owner-only Access Code Management.
4. **Winrate & History** - provider list (owner first, then admins) for everyone; click a provider for the existing stats/curve/log, fed by that provider's real signals. Winrate = wins / (wins + losses) (unchanged). One row per signal, counted once by its current outcome; breakeven/cancelled/open shown separately.
5. **Notifications** - database triggers create one deduplicated row per eligible account on every new signal and every real status/close change; bell, unread badge, panel, mark read / mark all, timestamps, click -> opens the signal. Realtime subscription with automatic polling fallback.
6. **Free members** - FR codes, restricted navigation/pages, upgrade card (-> https://t.me/eyssi20), redeem a paid code on the **same account** (nothing is recreated; navigation unlocks without logging out).
Membership expiry is computed live by the database (no cron). Expired clients drop to free-tier access with a renew banner. Owner/admin never expire.

## Tests actually run
* **128 database checks, all passing** (real PostgreSQL 16): signup/role detection incl. non-whitelisted OW/AD/FR codes, no orphan accounts on failed signup, whitelist caps, single-use codes, race on one code, anon lockdown, role-escalation attempts, code tables unreachable even for the owner, owner-only RPCs, RLS on signals/profiles/notifications, immutability, provider spoofing, notification fan-out/dedupe/text, history, once-only stats, expiry + renewal stacking, staff never expiring, free->client on the same account, username/avatar rules, legacy import silence, storage policy installation.
* **153 browser checks, all passing** (headless Chromium, real `supabase-js`, real PostgREST + database): four separate accounts (owner, admin, paid client, free member) - signup through the UI, exact navigation per role, URL/hash and DevTools bypass attempts, direct API abuse, publish a signal and watch the bell update on other users' screens without refresh, notification text, click-through to the signal, TP1/SL updates, duplicate-free counts, winrate list/detail matching the database, avatar upload/remove (valid, corrupt, GIF, >2 MB), username/password changes and re-login, free->paid upgrade, automatic expiry and renewal, US30 symbol/validation/rendering, legacy import, phone/tablet portrait + landscape layouts with no horizontal overflow, zero JavaScript errors.
Final regression numbers: DB 128/128, browser 153/153.

## Bugs found and fixed while testing (in the original code too)
* The Supabase client could never initialise with the real CDN bundle (`const supabase` collided with the library's global).
* `const CONFIG` is not on `window`, so the intended config checks silently failed.
* Stop-loss pips were always 0 (`signal.s1` instead of `signal.sl`) and EURUSD pips were always 0 (multiplier 0.1 instead of 10000). **Behaviour change:** net-pips totals for old data will now differ. Win/loss counting and the winrate formula are unchanged.
* The BTC/EURUSD sections showed under the dashboard on load (fixed earlier); the Entry Tracker **Closed** button only sent a Telegram message and never saved anything - it now saves a `closed` flag (status/outcome untouched, so a TP-hit win stays a win).

## Not verified / limits - please read
* **Supabase Realtime (websocket) was not exercised** - there is no Realtime server in my test rig. The polling fallback was tested; the websocket path uses the standard `postgres_changes` API and the publication is configured in migration 003. Please verify once on your project.
* **Supabase Auth and Storage were simulated** (my stand-in mimics the endpoints the app calls); the **database, RLS, triggers and RPCs are real**. Storage bucket rules (2 MB, png/jpeg/webp, own-folder writes) are asserted by the SQL tests and mirrored in the stand-in, not tested against Supabase Storage itself.
* **Static pages cannot be "backend-protected".** Live Charts, Tips & Tricks, Fundamental Analysis and Trading Course are static HTML/TradingView widgets, so they are gated by the server-verified role in the browser (nav, URL hash and DevTools reveal attempts are blocked and were tested), but their content is technically shipped in the page. Everything that is *data* (signals, notifications, codes, profiles, memberships) is enforced in Postgres. To truly protect tips/lessons, store them in a table with a paid-only RLS policy - I can do that next.
* `check_signup_code` tells an anonymous visitor whether a code exists/used (needed for friendly errors). Codes are 12 random hex characters; enable Supabase rate limits/CAPTCHA to make guessing impractical.
* PnL Tracker data still lives in the browser (localStorage), now keyed by your user id so it survives username changes and free->paid upgrades - it does not sync across devices.
* Fundamental Analysis and Trading Course were **kept** (paid members only) although they are not in your navigation list, because the chart AI sync depends on the Gemini key entered in Fundamental Analysis. Remove their nav links if you prefer.
* Existing browser-only accounts/codes cannot be migrated (the old system stored passwords in plaintext in each browser): members re-create their account once with their original code - see README section 5. Old browser-stored Entry Tracker history can be imported once by the signal provider from the Entry Tracker banner.
* Telegram/Discord broadcasting works only if you place new credentials in `config.js` (the old token was removed from source and must be revoked).

---
# Update v2 - UI fixes + push notifications

## UI fixes (from your screenshots)
* **Profile dead space**: cards now flow into balanced columns (no empty holes beside short cards); the avatar block is compact (picture beside name + buttons); the global `input { margin-bottom: 1rem }` rule that created gaps under every field is neutralised inside the app panels.
* **Access Code Management form**: dropdown, quantity, label and Generate button are all exactly 46 px high on one row (stacked cleanly on phones); table has proper column spacing and scrolls inside its card.
* **Popups**: the "pop-up" problem was a dialog-width rule that also hit the small corner toasts (forcing them off-screen on phones and clipped in landscape). Fixed. Notifications now use a dedicated responsive toast (wraps text, safe-area aware, tap to open the signal, max 3 stacked, never covers the bell) and the bell panel is anchored inside the viewport on phone, landscape and tablet.

## Push notifications (phone / tablet / desktop, app closed)
* `sw.js` service worker + `manifest.webmanifest` + icons (installable app; required for iPhone), `push.js` (Enable/Disable/Send test, bell prompt, Profile card, per-device sync, unlink on logout), migration `005_push_subscriptions.sql`, Edge Function `supabase/functions/send-push`, key generator `tools/vapid-keygen.html`. Setup: README section 8.
* Flow: database creates a notification row -> Database Webhook -> `send-push` -> encrypted Web Push to each registered device of that user -> phone notification -> tap opens that signal. A focused open app shows the in-app toast instead (no duplicate). Dead devices are removed automatically; the max is 10 devices per user.

## Tests actually run for v2 (all passing)
DB 140/140 - full browser regression 153/153 - layout + toast/panel placement 53/53 (phone/tablet, portrait/landscape, desktop) - device push 22/22 - real Edge Function 25/25 - VAPID key tool validated.

## What v2 could NOT verify
* **Delivery through Google's real push service to a physical phone.** The function was run for real (Deno) and shown to send correctly encrypted, VAPID-signed messages that a subscription's keys decrypt; the browser side was tested with a stubbed `PushManager` (real FCM needs a real device + internet). Please do the "Try it" step in README section 8 on your phone.
* **The Supabase Database Webhook itself** (it needs a hosted Supabase). Everything on either side of it is tested.
* The Edge Function ran on local Deno 2.9, not Supabase's hosted runtime. Headless Chromium does not keep displayed system notifications, so notification display was verified by capturing the exact `showNotification` call; the physical lock-screen appearance is device-dependent.
* iPhone/iPad only receive push for an installed Home Screen app (iOS 16.4+): the app shows those instructions instead of a broken button.

---
# Update v3 - preview-host safety
* Spck's run link (`run.spck.io`) is a virtual preview server: it cannot serve a service worker file (`sw.js` -> 404) and a PWA manifest there can confuse it. The app now detects that domain, **does not add the manifest, never touches service workers there**, and the Profile card shows a clear **HOST NEEDED** explanation instead of a red ERROR. On a real host with `sw.js` missing it shows **SETUP NEEDED** and says what to upload.
* App scripts are cache-busted (`?v=3`) so phones drop stale copies.
* Tests (all passing): DB 140, full browser regression 153, layout + toast 53, device push 22, Edge Function 25, host cases 10.
* Not reproducible here: the exact Spck behaviour (no Spck in my test setup). The plain-text page you saw is the host serving the page without a web-page content type; the file content in your screenshot is correct and complete. If it happens on a real host, tell me the host and address.
