# WVCS Hub Student Directory Roster Import

The Student Directory now uses Supabase as the Hub source of truth.

The Google Sheet was used only as a temporary import source. The live Hub roster is stored in:

`public.student_directory`

## Current Status

- The `student_directory` table exists in Supabase.
- Row-level security allows only Hub admins to read or manage the roster.
- The Admin Student Directory reads and writes Supabase directly.
- The initial active roster was imported from the `Students` tab of `WVCS Student Roster & CSV Manager`.

## Imported Sheet Columns

The import used:

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

Supabase generates the permanent `student_id`.

## Reimport Notes

For a future one-time import, export the Google Sheet `Students` tab as CSV to `/tmp`, then run:

```bash
node scripts/build-student-directory-import-sql.mjs /tmp/wvcs-students.csv /tmp/wvcs-students-import.sql
npx supabase db query --linked -f /tmp/wvcs-students-import.sql
```

Do not commit exported roster CSVs or generated import SQL files.
