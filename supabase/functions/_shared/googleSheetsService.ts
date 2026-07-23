function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function textBase64Url(value: string) {
  return base64Url(new TextEncoder().encode(value));
}

function normalizePrivateKey(value: string) {
  return value.replaceAll("\\n", "\n");
}

async function importPrivateKey(pem: string) {
  const clean = normalizePrivateKey(pem)
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${textBase64Url(JSON.stringify(header))}.${textBase64Url(JSON.stringify(claim))}`;
  const key = await importPrivateKey(requiredEnv("GOOGLE_PRIVATE_KEY"));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64Url(new Uint8Array(signature))}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    console.error("Google service account token request failed", await response.text());
    throw new Error("Google Sheets authentication failed.");
  }
  const data = await response.json();
  return data.access_token;
}

function encodeRange(range: string) {
  return encodeURIComponent(range);
}

export class GoogleSheetsService {
  spreadsheetId: string;
  accessTokenPromise: Promise<string> | null;

  constructor(spreadsheetId = Deno.env.get("GOOGLE_SHEETS_SPREADSHEET_ID") || "") {
    this.spreadsheetId = spreadsheetId;
    this.accessTokenPromise = null;
    if (!this.spreadsheetId) throw new Error("Missing required secret: GOOGLE_SHEETS_SPREADSHEET_ID");
  }

  async accessToken() {
    if (!this.accessTokenPromise) this.accessTokenPromise = getAccessToken();
    return this.accessTokenPromise;
  }

  async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      console.error("Google Sheets API failed", response.status, await response.text());
      throw new Error("Google Sheets request failed.");
    }
    return response.json();
  }

  async getValues(range: string) {
    const data = await this.request(`/values/${encodeRange(range)}`);
    return data.values || [];
  }

  async updateValues(range: string, values: unknown[][]) {
    return this.request(`/values/${encodeRange(range)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ range, majorDimension: "ROWS", values }),
    });
  }

  async appendValues(range: string, values: unknown[][]) {
    return this.request(`/values/${encodeRange(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ range, majorDimension: "ROWS", values }),
    });
  }

  async clearValues(range: string) {
    return this.request(`/values/${encodeRange(range)}:clear`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async batchUpdate(requests: Record<string, unknown>[]) {
    return this.request(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }

  async metadata() {
    return this.request("?fields=sheets.properties");
  }

  async sheetIdByTitle(title: string) {
    const data = await this.metadata();
    const sheet = (data.sheets || []).find((entry: any) => entry.properties?.title === title);
    return sheet?.properties?.sheetId;
  }

  async requiredSheetId(title: string) {
    const sheetId = await this.sheetIdByTitle(title);
    if (sheetId === undefined) throw new Error(`Missing required sheet: ${title}`);
    return sheetId;
  }
}
