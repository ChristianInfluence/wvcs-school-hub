# Gmail OAuth Setup

WVCS School Hub sends meeting calendar invites through the Supabase Edge Function `send-meeting-request`.

## 1. Create or Select a Google Cloud Project

Use the Google account that should manage the Gmail sender authorization.

1. Open Google Cloud Console.
2. Create or select a project, for example `WVCS School Hub`.
3. Enable **Gmail API** for that project.

## 2. Configure OAuth Consent

1. Go to **Google Auth Platform** or **APIs & Services > OAuth consent screen**.
2. Set the app name to `WVCS School Hub`.
3. Use a WVCS support email.
4. Add your own account as a test user if the app is in testing mode.
5. If Google shows a **Data Access**, **Scopes**, or **Scopes for Google APIs** section, add this scope:

```text
https://www.googleapis.com/auth/gmail.send
```

If you do not see a place to add scopes, continue anyway. The local token helper requests the `gmail.send` scope directly in the Google authorization URL.

## 3. Create an OAuth Client

1. Go to **Google Auth Platform > Clients** or **APIs & Services > Credentials**.
2. Create an OAuth client.
3. Application type: **Web application**.
4. Name: `WVCS School Hub Supabase Email`.
5. Add this authorized redirect URI:

```text
http://127.0.0.1:8787/oauth2callback
```

6. Copy the client ID and client secret.

## 4. Generate the Refresh Token

From this repo, run:

```bash
GOOGLE_CLIENT_ID='your-client-id' GOOGLE_CLIENT_SECRET='your-client-secret' npm run gmail:token
```

Open the printed URL, authorize the Gmail sender account, and copy the `GOOGLE_REFRESH_TOKEN` printed in the terminal.

## 5. Add Supabase Edge Function Secrets

```bash
npx supabase secrets set \
  GOOGLE_CLIENT_ID='your-client-id' \
  GOOGLE_CLIENT_SECRET='your-client-secret' \
  GOOGLE_REFRESH_TOKEN='your-refresh-token' \
  GMAIL_SENDER_EMAIL='sender@wvcs.org'
```

Then redeploy:

```bash
npx supabase functions deploy send-meeting-request
```
