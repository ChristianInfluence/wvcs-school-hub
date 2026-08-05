const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function compactIsbn(value = "") {
  return String(value || "").trim().replace(/[\s-]+/g, "").toUpperCase();
}

function isbn10CheckDigit(body: string) {
  const sum = body.split("").reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  const check = (11 - remainder) % 11;
  return check === 10 ? "X" : String(check);
}

function isbn13CheckDigit(body: string) {
  const sum = body.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

function validateIsbn10(value = "") {
  const isbn = compactIsbn(value);
  return /^\d{9}[\dX]$/.test(isbn) && isbn10CheckDigit(isbn.slice(0, 9)) === isbn[9];
}

function validateIsbn13(value = "") {
  const isbn = compactIsbn(value);
  return /^\d{13}$/.test(isbn) && isbn13CheckDigit(isbn.slice(0, 12)) === isbn[12];
}

function isbn10ToIsbn13(value = "") {
  const isbn10 = compactIsbn(value);
  if (!validateIsbn10(isbn10)) return "";
  const body = `978${isbn10.slice(0, 9)}`;
  return `${body}${isbn13CheckDigit(body)}`;
}

function normalizeIsbn(value = "") {
  const isbn = compactIsbn(value);
  if (validateIsbn13(isbn)) return { isbn, isbn13: isbn, isbn10: "", valid: true };
  if (validateIsbn10(isbn)) return { isbn, isbn10: isbn, isbn13: isbn10ToIsbn13(isbn), valid: true };
  return { isbn, isbn10: "", isbn13: "", valid: false };
}

async function fetchJson(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Provider returned ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function openLibraryLookup(normalized: ReturnType<typeof normalizeIsbn>) {
  const lookupIsbn = normalized.isbn13 || normalized.isbn;
  const book = await fetchJson(`https://openlibrary.org/isbn/${encodeURIComponent(lookupIsbn)}.json`);
  if (!book) return null;

  const authorNames: string[] = [];
  const authorKeys = Array.isArray(book.authors) ? book.authors.map((author: Record<string, string>) => author.key).filter(Boolean).slice(0, 5) : [];
  await Promise.all(authorKeys.map(async (key: string) => {
    try {
      const author = await fetchJson(`https://openlibrary.org${key}.json`, 4000);
      if (author?.name) authorNames.push(author.name);
    } catch {
      // Author details are helpful but not required for a successful book lookup.
    }
  }));

  const publishDate = String(book.publish_date || "");
  const publishYear = publishDate.match(/\d{4}/)?.[0] || "";
  const coverId = Array.isArray(book.covers) ? book.covers[0] : null;
  const coverImageUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : `https://covers.openlibrary.org/isbn/${lookupIsbn}-L.jpg`;

  return {
    title: book.title || "",
    subtitle: book.subtitle || "",
    authors: authorNames,
    publisher: Array.isArray(book.publishers) ? book.publishers[0] || "" : "",
    edition: book.edition_name || "",
    publicationYear: publishYear,
    isbn10: normalized.isbn10,
    isbn13: normalized.isbn13,
    description: typeof book.description === "string" ? book.description : book.description?.value || "",
    coverImageUrl,
    materialType: "Textbook",
    reusable: true,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const normalized = normalizeIsbn(body.isbn || "");
    if (!normalized.valid) return jsonResponse({ error: "Enter a valid ISBN-10 or ISBN-13." }, 400);

    const metadata = await openLibraryLookup(normalized);
    if (!metadata) {
      return jsonResponse({
        metadata: null,
        normalized,
        message: "No metadata was found for that ISBN. You can enter the curriculum manually.",
      });
    }

    return jsonResponse({ metadata, normalized, provider: "open-library" });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "The ISBN provider timed out. Try again or enter the resource manually."
      : error instanceof Error
        ? error.message
        : "ISBN lookup failed.";
    return jsonResponse({ error: message }, 500);
  }
});
