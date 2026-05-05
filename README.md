# WVCS School Hub

WVCS School Hub is a modular school operations app. The first complete module is the master scheduler from the original WVCS Scheduler app.

## Modules

- Dashboard
- Scheduler
- Meeting Requests
- Forms
- Structured Recess
- Important Documents
- Admin

The meeting, forms, and admin areas are scaffolded as placeholders so they can be built out without crowding the scheduler code.

## Scheduler Subtree

The scheduler source is vendored from `ChristianInfluence/school-scheduler` as a Git subtree under `vendor/school-scheduler`. The hub-facing module at `src/modules/scheduler/SchedulerModule.jsx` imports the scheduler app from that subtree.

To pull the latest scheduler changes into this repo:

```bash
npm run scheduler:update
```

## Web Development

```bash
npm install
npm run dev
```

## Web Build

```bash
npm run build
```

The static web output is generated in `dist/`.

## Desktop Build

```bash
npm install
npx tauri build
```

## Project Structure

```text
src/
  modules/
    scheduler/
  App.jsx
vendor/
  school-scheduler/
```

Future modules should live under `src/modules/`.

## Supabase and Email Infrastructure

The first backend layer is scaffolded but remains optional until credentials are configured.

Frontend environment variables:

```bash
cp .env.example .env
```

Then set:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Supabase setup:

1. Run `supabase/schema.sql` in the Supabase SQL editor.
2. Deploy the Edge Function in `supabase/functions/send-meeting-request`.
3. Add these Edge Function secrets:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GMAIL_SENDER_EMAIL=
```

Meeting requests continue to work locally without these values. Once configured, requests are saved to Supabase and the Gmail Edge Function sends the administrator and teacher a calendar invite email.

See `docs/gmail-oauth.md` for the Google Cloud and Gmail refresh-token walkthrough.
