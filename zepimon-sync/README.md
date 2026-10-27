# Zepimon watch sync

Watch → Zepp Side Service → Supabase → Zepimon mobile. The watch remains paired with Zepp. The mobile app uses Supabase email codes to sign in; it never asks for a Zepp password. One upload link is supported per account.

## Project setup

1. In your Supabase project's **SQL Editor**, run `schema.sql`. It creates private tables and explicitly granted RPC functions. Do not expose the `zepimon_private` schema through the Data API. The SQL can be rerun without deleting records; rerun it after updating to add the phone-to-watch plan (`plans` table, `zepimon_set_plan`, `zepimon_get_plan`) and phone adventures (`phone_runs` table, `zepimon_add_phone_runs`, `zepimon_get_phone_runs`).
2. Keep the Email auth provider enabled. In **Authentication → Email Templates → Magic Link**, include `<p>Your Zepimon sign-in code: {{ .Token }}</p>` in the email body. The app verifies this code without opening a browser. Keep signups enabled for first-time accounts.
3. Supabase's default email service sends only to project team addresses and has low delivery limits. For other users, configure custom SMTP in Authentication. See [email delivery](https://supabase.com/docs/guides/auth/auth-smtp) and [email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless).
4. Set the **public** client settings for both apps (PowerShell, repo root):

   ```powershell
   $env:SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co'
   $env:SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YOUR_KEY'
   node zepimon-sync/configure.mjs
   ```

   This writes public settings to both apps, so they are also included in EAS builds. It accepts a publishable key or a legacy **anon** key and rejects secret/service-role keys. It never requires a database password. Rebuild both apps after changing projects.

5. Build the watch app (`npm run build` or `npm run preview` inside `hatdog-app`) and Android app (`npm run build:apk` inside `zepimon-mobile`). Update the existing installations to keep their local data.

## Link your watch

1. Open **Sync** in Zepimon mobile, request an email code and sign in.
2. Tap **Create linking code**. Long-press the code to copy it. It expires after ten minutes and works once.
3. In Zepp, open your watch's **Zepimon settings → Sync to Zepimon mobile**. Paste the code and tap **Link account**.
4. Open Zepimon on the connected watch. In Zepp, tap **Sync from watch**. Wait for the cloud upload confirmation.
5. Return to Zepimon mobile and tap **Sync now**. Further watch snapshots upload when the Side Service runs. The phone app downloads when opened and every minute while visible.

Saving/finishing an adventure already sends a snapshot to Zepp. An offline watch sends its stored progress when reopened while connected. A failed cloud upload keeps the latest received snapshot in Zepp; the next service start, watch snapshot, or **Retry upload** (shown on the Trainer Card while newer progress is waiting) retries it. Neither Zepp nor the phone app is guaranteed to keep running when the operating system suspends it. This is journal sync, not a live workout stream.

**Disconnect watch** in the mobile app revokes its upload credential and any pending code. Creating a replacement code leaves the old link active until the new code is claimed. **Change account** in Zepp (Manage account) claims a new code while the current link keeps working until it succeeds. **Remove account** in Zepp (confirmed once) removes that phone's upload credential; use Disconnect watch in mobile to revoke it server-side. Signing out keeps downloaded journal data on the phone. An account-bound journal cannot silently merge with a different account.

## Data retained

- The cloud stores the latest watch snapshot, normal/shiny Dex records, current adventure, latest completed adventure per family, and watch personal bests. It retains previously seen Dex species if a watch reset omits them.
- Older/equal capture timestamps cannot replace newer cloud data. A watch more than five minutes ahead of server time must have its clock corrected before uploading.
- The phone uses the existing import validator and deduplication, so repeat downloads do not double-count missions or runs. Earlier completed runs already retained on the phone stay there.
- Arcade scores, buddy choice, full phone-only run history and earned phone badges are **not backed up** by this first sync version. Old runs overwritten on the watch before any sync cannot be recovered. Uninstalling/clearing mobile storage still removes phone-only data.
- The phone never writes the watch's journal directly. It shares a small **plan**: the egg chosen in Zepimon mobile and whether the phone is recording an adventure. The watch's title screen offers that egg and warns before recording while the phone is; the plan is fetched by the Zepp service when the watch's title screen opens. An older plan cannot replace a newer one, and a fresh phone gets its plan back with its next sync. A fresh phone can download the latest cloud watch snapshot after sign-in.
- The phone and the watch share **one adventure in progress** (`adventures`, one row per account) through `zepimon_share_adventure(adventure)` (signed in) and `zepimon_watch_share_adventure(upload_token, adventure)`; `zepimon_pull` and `zepimon_get_plan` return it. Each share says which device records it (`device`, since `deviceAt`) and its distance as of `at`. The cloud keeps a newer adventure (or replaces an ended one), a takeover (a newer `deviceAt` for the same adventure), or progress from the device that still records it, and answers every share with the adventure as it stands, so a device that was taken over learns to stop. An ended adventure stays ended. Rerun `schema.sql` to add the table and functions.
- The phone also shares the **adventures it recorded** (`phone_runs`, without routes) through `zepimon_add_phone_runs`: up to 50 per call, sharing one again changes nothing, invalid ones are skipped, and the newest 500 per account are kept. The watch's Zepp service reads them with `zepimon_get_phone_runs(upload_token, after)`, oldest first by arrival (`seq`), 30 at a time, and the watch adds them to its own journal. Rerun `schema.sql` to add the table and both functions.

## Security and verification

Supabase Auth owns sign-in and session refresh. Native sessions are held in SecureStore/Keychain, split into small entries with an atomic manifest. The watch-side service receives only a random upload credential; it can upload journals, read the plan and the phone's adventures, and share the adventure in progress, but it cannot download a journal, write phone adventures or manage the user's account. Pairing codes and upload credentials are stored as hashes in the database. Private table access is denied to `anon` and `authenticated`; narrowly scoped RPCs check either `auth.uid()` or the upload token.

`npm ci && npm test` in this directory runs the migration against PGlite/Postgres, including role isolation, malformed payloads, stale writes, single-use/expired links, token replacement, and revocation. Watch tests cover retry/queue behavior; mobile tests cover import safety and session persistence. These checks do not replace testing email delivery and Bluetooth on an actual phone/watch.

The optional Windows/Chrome UI check is `node zepimon-sync/tests/mobile-smoke.mjs` from the repository root, with the exported mobile web app served on `127.0.0.1:8093`. It uses an isolated browser and mocked auth/cloud responses; it does not send emails or alter real accounts.

References: [Zepp architecture](https://docs.zepp.com/docs/guides/architecture/arc/), [Supabase function permissions](https://supabase.com/docs/guides/database/functions), [Supabase React Native auth](https://supabase.com/docs/guides/auth/quickstarts/react-native).
