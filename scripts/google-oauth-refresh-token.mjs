import http from "node:http";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const port = Number(process.env.GOOGLE_OAUTH_PORT || 8787);
const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
const scope = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before running this script.");
  console.error("Example:");
  console.error("GOOGLE_CLIENT_ID='...' GOOGLE_CLIENT_SECRET='...' npm run gmail:token");
  process.exit(1);
}

function exchangeCode(code) {
  return fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, redirectUri);

  if (url.pathname !== "/oauth2callback") {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const error = url.searchParams.get("error");
  if (error) {
    response.writeHead(400, { "Content-Type": "text/plain" });
    response.end(`Google returned an error: ${error}`);
    server.close();
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    response.writeHead(400, { "Content-Type": "text/plain" });
    response.end("Missing authorization code.");
    server.close();
    return;
  }

  try {
    const tokenResponse = await exchangeCode(code);
    const tokenJson = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(JSON.stringify(tokenJson, null, 2));
    }

    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<h1>WVCS School Hub Gmail authorization complete.</h1><p>You can close this tab.</p>");

    console.log("");
    console.log("Add this value to Supabase Edge Function secrets:");
    console.log("");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokenJson.refresh_token || "(No refresh token returned. Re-run with prompt=consent.)"}`);
    console.log("");
    console.log("Also set:");
    console.log(`GOOGLE_CLIENT_ID=${clientId}`);
    console.log("GOOGLE_CLIENT_SECRET=<your client secret>");
    console.log("GMAIL_SENDER_EMAIL=<the Gmail account you authorized>");
    console.log("");
  } catch (tokenError) {
    response.writeHead(500, { "Content-Type": "text/plain" });
    response.end("Token exchange failed. Check the terminal.");
    console.error(tokenError.message);
  } finally {
    server.close();
  }
});

server.listen(port, "127.0.0.1", () => {
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  console.log("Open this URL in your browser and authorize the Gmail account:");
  console.log("");
  console.log(authUrl.toString());
  console.log("");
  console.log(`Waiting for Google to redirect to ${redirectUri} ...`);
});
