function cleanString(value = "") {
  return String(value || "").trim();
}

function compactIsbn(value = "") {
  return cleanString(value).replace(/[\s-]+/g, "").toUpperCase();
}

function isbn10CheckDigit(body) {
  const sum = body.split("").reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  const check = (11 - remainder) % 11;
  return check === 10 ? "X" : String(check);
}

function isbn13CheckDigit(body) {
  const sum = body.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

export function validateIsbn10(value = "") {
  const isbn = compactIsbn(value);
  return /^\d{9}[\dX]$/.test(isbn) && isbn10CheckDigit(isbn.slice(0, 9)) === isbn[9];
}

export function validateIsbn13(value = "") {
  const isbn = compactIsbn(value);
  return /^\d{13}$/.test(isbn) && isbn13CheckDigit(isbn.slice(0, 12)) === isbn[12];
}

export function isbn10ToIsbn13(value = "") {
  const isbn10 = compactIsbn(value);
  if (!validateIsbn10(isbn10)) return "";
  const body = `978${isbn10.slice(0, 9)}`;
  return `${body}${isbn13CheckDigit(body)}`;
}

export function normalizeIsbn(value = "") {
  const isbn = compactIsbn(value);
  if (validateIsbn13(isbn)) return { isbn, isbn13: isbn, isbn10: "", valid: true, type: "ISBN-13" };
  if (validateIsbn10(isbn)) return { isbn, isbn10: isbn, isbn13: isbn10ToIsbn13(isbn), valid: true, type: "ISBN-10" };
  return { isbn, isbn10: "", isbn13: "", valid: false, type: "" };
}
