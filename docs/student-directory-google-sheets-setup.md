# WVCS Hub Student Directory Google Sheets Setup

The Student Directory uses the private Google Sheet as the source of truth. The browser talks only to the WVCS Hub backend. Google credentials stay in Supabase secrets.

## Before live use

Do this order so Student-ID stays attached to the correct student row.

1. Open or create the WVCS Google Cloud project.
2. Enable **Google Sheets API**.
3. Create a dedicated service account named something like `wvcs-hub-student-roster`.
4. Create a JSON key for that service account.
5. Copy the service account email from the JSON key.
6. Share only the private roster spreadsheet with that service account email as **Editor**.
7. Keep the normal Drive sharing for the Sheet set to **Restricted**.
8. Add Supabase secrets:

```bash
npx supabase secrets set GOOGLE_SHEETS_SPREADSHEET_ID='1V18bWKWvC3Ml3Zx88Mw-FfFtcO-Ydrbg1Vf5zfW8GsQ'
npx supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL='service-account-name@project-id.iam.gserviceaccount.com'
npx supabase secrets set GOOGLE_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'
```

9. Install [student-roster-apps-script.gs](./student-roster-apps-script.gs), or merge it into the existing Apps Script while preserving the existing WVCS workflow.
10. In the Sheet, add `Student-ID` to `Students!L1`.
11. Run `WVCS Roster` → `Migrate Archive Layouts`.
12. Run `WVCS Roster` → `Ensure Student IDs`.
13. Run `WVCS Roster` → `Sort Students`.
14. Deploy the `admin-students` Supabase function.
15. Open the Hub Admin area and refresh Student Directory.
16. Add one test student in the Hub and verify the row appears in Google Sheets.
17. Edit that student directly in Google Sheets, refresh the Hub, and verify the change appears.
18. Remove the test student in the Hub and verify it moves to `Former Students` with archive fields.

## Required Sheet Layout

`Students!A:K` must remain exactly:

1. `Grade`
2. `Student-FN`
3. `Student-LN`
4. `Parent-1-FN`
5. `Parent-1-LN`
6. `EMAIL-1`
7. `Parent-1-#`
8. `Parent-2-FN`
9. `Parent-2-LN`
10. `Parent-2-#`
11. `EMAIL-2`

The Hub adds internal column `L`:

12. `Student-ID`

CSV exports should still export only columns `A:K`.

Archive sheets should use:

`A:K` original fields, `L Student-ID`, `M Archive-Date`, `N School-Year`, `O Reason`.

If `Former Students` or `Graduates` currently use the older 14-column layout, run `Migrate Archive Layouts` before Hub removals. The migration is safe to run more than once. It shifts legacy archive metadata from `L:N` to `M:O` and assigns `Student-ID` values to historical archive rows.

## Apps Script Menu

The WVCS Roster menu should include:

- Add Student from Form
- Remove Selected Student
- Sort Students
- Advance to Next School Year
- Export Active Roster CSV
- Ensure Student IDs
- Migrate Archive Layouts

`Ensure Student IDs` and `Migrate Archive Layouts` are migration/repair commands. Normal day-to-day work should continue using the familiar add, remove, sort, advance, and export commands.

## Security Notes

- Do not put the service account JSON file in the repo.
- Do not put Google keys in `.env.local` values beginning with `VITE_`.
- Do not make the spreadsheet public.
- The `admin-students` function verifies the signed-in user has `staff_access.can_use_admin` before reading or writing the Sheet.
