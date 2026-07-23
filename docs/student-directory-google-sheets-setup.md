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

9. Replace the Apps Script in the workbook with [student-roster-apps-script.gs](./student-roster-apps-script.gs), or merge the Student-ID portions into the existing script.
10. In the Sheet, add `Student-ID` to `Students!L1`.
11. Run the guarded `ensureStudentIds()` Apps Script function once.
12. Deploy the `admin-students` Supabase function.
13. Open the Hub Admin area and refresh Student Directory.
14. Add one test student in the Hub and verify the row appears in Google Sheets.
15. Edit that student directly in Google Sheets, refresh the Hub, and verify the change appears.
16. Remove the test student in the Hub and verify it moves to `Former Students` with archive fields.

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

## Security Notes

- Do not put the service account JSON file in the repo.
- Do not put Google keys in `.env.local` values beginning with `VITE_`.
- Do not make the spreadsheet public.
- The `admin-students` function verifies the signed-in user has `staff_access.can_use_admin` before reading or writing the Sheet.
