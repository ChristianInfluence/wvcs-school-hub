# Planned Feature Upgrades

## Private Recess Roster Access

The recess attendance board currently supports pulling a public-read Google Sheet while the workflow is being tested.

Upgrade path:

1. Keep the roster Google Sheet private.
2. Create a Google Cloud service account.
3. Share the roster sheet with the service account email as a viewer.
4. Store the service account credentials in Supabase secrets.
5. Add a Supabase Edge Function that reads the private sheet through the Google Sheets API.
6. Update the Aide View attendance board to call the Supabase function instead of public Google CSV endpoints.

Goal: keep student roster data out of public sheet access while preserving Google Sheets as the admin-friendly roster editor.
