# TRADE BARR Terminal Hub - Setup & Deployment

A static website (HTML/CSS/JS) backed by **Supabase** (Auth, Postgres with Row Level Security, Realtime, Storage).
Roles, membership, signals, notifications and access codes are all enforced **in the database**, not in the browser.

```
index.html            login / create account / renew        dashboard.html   the app (role-aware)
config.js             YOUR Supabase URL + anon key          core.js          session gate, role system, route guard
supabase/migrations/  001..004 SQL (run in order)           signal.js        Entry Tracker (admin/owner) on the shared signals table
tools/                legacy code converter, VAPID key generator                signals-view.js  Signals page (everyone, read-only)
us30.js               Live Chart (US30)                     winrate.js       provider list + per-provider stats
profile-view.js       Profile, redeem, owner code manager   notifications.js bell + realtime
sw.js + manifest.webmanifest + icons/   service worker + installable app   push.js   enable/disable push on a device
supabase/functions/send-push/            Edge Function that sends the pushes
tests/                the test suites that were run          legacy/          old unused modules (not loaded)
```

## 1. Create the Supabase project
1. https://supabase.com -> New project.
2. **Authentication -> Providers -> Email**: keep Email enabled and turn **"Confirm email" OFF** (users sign in with a username; the app creates an internal e-mail alias for each account).
3. **Authentication -> Policies/Settings**: set *Minimum password length* to 8 or more. Recommended: enable CAPTCHA / rate limits (Authentication -> Attack protection).
4. **Do not create users by hand in the dashboard.** Accounts are created by the site's Create Account form; a database trigger validates the access code and username and rolls the signup back if they are invalid.

## 2. Apply the database migrations (in order)
Supabase Dashboard -> **SQL Editor** -> paste and run each file:

| File | What it does |
|---|---|
| `001_schema.sql` | tables: profiles, access_codes, owner/admin/free whitelists, signals, signal_history, notifications |
| `002_functions.sql` | signup trigger, role/expiry logic, signal triggers (history + notifications), all RPCs |
| `003_security_realtime_storage.sql` | grants, RLS policies, Realtime publication, `avatars` storage bucket + policies |
| `004_bootstrap_staff_codes.sql` | **generates your 3 OWNER (`...OW`) and 10 ADMIN (`...AD`) codes** and shows them in the result grid |
| `005_push_subscriptions.sql` | phone push: device subscriptions table + RPCs (run when you set up push, section 8) |

Copy the codes from migration 004's result **immediately** into a password manager. They are random and exist only in your database.
Re-running a migration is safe. Nothing in these files deletes existing data.

## 3. Configure the website
Edit `config.js`: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Project Settings -> API -> *anon public*). The anon key is public by design. **Never** put the `service_role` key anywhere in the site.
Optional in `config.js`: `TELEGRAM` and `DISCORD_WEBHOOK_URL` (Entry Tracker broadcasts; blank = disabled), `US30_SYMBOL`, `POLL_MS`.

## 4. Become the OWNER
Open the site -> **Create Account** -> choose your username (e.g. `Coach EyssiFX`), a strong password and one of the **OW** codes. That account is the OWNER.
* The old hard-coded `admin` login no longer exists anywhere in the source. That password was readable by every visitor, so treat it as compromised and do not reuse it.
* Give each admin one `...AD` code; they sign up with it (each code works once). A code that merely *ends* in AD/OW/FR but is not in the whitelist is rejected.

## 5. Access codes
* **Owner -> Profile -> Access Code Management**: generate paid codes (1 day / 7 days / 1 month / 3 months / 1 year / lifetime) and free-member codes (`...FR`), see which are redeemed and by whom, disable unused ones.
* **Existing codes from the old site**: run, on your own computer, `python3 tools/legacy_codes_to_sql.py /path/to/OLD/index.html > legacy_codes.sql`, review it, run it once in the SQL editor, then delete the file. The old site remembered "used" codes only inside each member's browser, so that cannot be recovered: existing members re-create their account once with their original code (same duration rules as before).

## 6. Deploy
Any static host works (Netlify, Vercel, Cloudflare Pages, GitHub Pages, Supabase Storage, Spck run). Use **HTTPS**. No build step. Upload the project files (the `tests/`, `supabase/`, `tools/` and `legacy/` folders do not need to be served).

## 7. Things to do right away
* **Revoke the Telegram bot token** that used to be hard-coded in the old `signal.js` (create a new one with @BotFather). If you still want Entry Tracker broadcasts, put the new token in `config.js` - or, better, move sending into a Supabase Edge Function, because anything in `config.js` is visible to visitors.
* Delete any leftover copies of the old `index.html` (it contained all member codes and the owner password).
* Optional: enable Supabase **Realtime** logs to confirm events; the app falls back to polling every `POLL_MS` if Realtime is unavailable.

## Hosting: use a real HTTPS host (important for push, recommended for everything)
Spck's **Run** link (`run.spck.io`) is a *preview server*: it serves your files through its own built-in service worker. That is fine for trying the site, but:
* it **cannot serve `sw.js`**, so phone push notifications cannot work there (the Profile card says **HOST NEEDED** instead of failing);
* if a saved tab or "reload after closing the browser" shows the page as plain code text, that is the preview server, not the app: re-open it with Spck's Run button, or use a real host.

Free real hosts (all HTTPS, no build step): **Netlify**, **Cloudflare Pages**, **Vercel**, **GitHub Pages**. Easiest path from a phone: put the project in a GitHub repository (Spck can commit + push), then connect that repository to Netlify ("Add new site -> Import from Git", no build command, publish directory `/`) or enable GitHub Pages (Settings -> Pages -> deploy from the `main` branch). Every push then redeploys automatically. After deploying, open the real address, log in, and enable phone notifications there. `sw.js`, `manifest.webmanifest` and the `icons/` folder must sit in the same folder as `dashboard.html`.

## 8. Phone / tablet push notifications (works when the site is closed)
Members get a system notification on their phone for every new signal and status update, even with the app closed or the screen locked. Do this once (all steps work from a phone browser):

1. **Database** - SQL Editor -> run `supabase/migrations/005_push_subscriptions.sql`.
2. **Make the keys** - open `tools/vapid-keygen.html` in your browser (upload it to your host or open it with Spck's run button) -> **Generate keys**. It creates the keys inside your browser; nothing is uploaded. You get three values: PUBLIC key, PRIVATE key, webhook secret.
3. **Website** - paste the PUBLIC key into `config.js` as `VAPID_PUBLIC_KEY`, and redeploy the site.
4. **Edge Function** - Supabase Dashboard -> **Edge Functions** -> *Deploy a new function* -> *Via Editor*. Name it exactly `send-push`, paste the whole of `supabase/functions/send-push/index.ts`, and open the function's settings to switch **"Verify JWT" OFF** (the webhook is protected by a secret header instead). Deploy.
5. **Secrets** - Edge Functions -> **Secrets**: add
   `VAPID_PUBLIC_KEY` (public key), `VAPID_PRIVATE_KEY` (private key), `VAPID_SUBJECT` (e.g. `mailto:you@yourmail.com`), `PUSH_WEBHOOK_SECRET` (the webhook secret from step 2).
6. **Webhook** - Dashboard -> **Database -> Webhooks** (also under *Integrations*) -> *Create a new hook*: name `push-on-notification`, table `public.notifications`, event **Insert** only, type **Supabase Edge Functions** -> function `send-push`, method POST, timeout 5000, and add the HTTP header `x-webhook-secret` with the same value as `PUSH_WEBHOOK_SECRET`.
7. **Try it** - on an Android phone open the site in Chrome, log in, tap the bell -> **Enable** (or Profile -> *Phone Notifications*) -> Allow -> **Send test**. Then have an admin publish a signal while the phone's screen is off: the alert arrives, and tapping it opens that signal.
   * **iPhone/iPad** (iOS 16.4+): push only works for an installed web app. Safari -> Share -> **Add to Home Screen**, open TRADE BARR from the new icon, then enable notifications in Profile.
   * Members enable it per device; logging out unlinks that device from the account.

Troubleshooting: Edge Functions -> `send-push` -> **Logs**. `401` = the `x-webhook-secret` header differs from `PUSH_WEBHOOK_SECRET`. Nothing arrives = the member has not enabled notifications on that device, or blocked them in browser Site settings. If you ever generate a new key pair, members must tap Enable once more. The push text contains only pair, direction, status and provider name.

## How the pieces connect
`Login (Supabase Auth)` -> `my_access()` returns role/tier/expiry computed by Postgres -> navigation, page guards and buttons follow it -> every write is checked again by RLS / RPCs.
`Entry Tracker` inserts into `signals` (provider = the authenticated user, set by a trigger) -> `signals` trigger writes `signal_history` and one notification per eligible member (deduplicated) -> bell updates in real time; Signals page and Winrate & History read the **same rows**.
`Profile` changes (username, avatar, membership) are RPCs on `profiles`; every other page reads the current values, while `signals.provider_id` keeps historical ownership.
`Redeem code` -> `redeem_access_code()` (atomic, single-use) upgrades the same account; the app refreshes `my_access()` and the navigation updates without logging out.
