# WVCS School Hub

WVCS School Hub is a modular school operations app. The first complete module is the master scheduler from the original WVCS Scheduler app.

## Modules

- Dashboard
- Scheduler
- Meeting Requests
- Forms
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
