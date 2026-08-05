import assert from "node:assert/strict";
import test from "node:test";
import {
  isbn10ToIsbn13,
  normalizeIsbn,
  validateIsbn10,
  validateIsbn13,
} from "../src/lib/isbnUtils.js";

test("validates ISBN-10 check digits", () => {
  assert.equal(validateIsbn10("0-306-40615-2"), true);
  assert.equal(validateIsbn10("0306406152"), true);
  assert.equal(validateIsbn10("0306406153"), false);
});

test("validates ISBN-13 check digits", () => {
  assert.equal(validateIsbn13("978-0-306-40615-7"), true);
  assert.equal(validateIsbn13("9780306406157"), true);
  assert.equal(validateIsbn13("9780306406158"), false);
});

test("normalizes ISBN-10 and derives ISBN-13", () => {
  const normalized = normalizeIsbn("0-306-40615-2");
  assert.equal(normalized.valid, true);
  assert.equal(normalized.isbn10, "0306406152");
  assert.equal(normalized.isbn13, "9780306406157");
  assert.equal(isbn10ToIsbn13("0306406152"), "9780306406157");
});

test("normalizes ISBN-13 without numeric conversion", () => {
  const normalized = normalizeIsbn("978-0-306-40615-7");
  assert.equal(normalized.valid, true);
  assert.equal(normalized.isbn13, "9780306406157");
  assert.equal(typeof normalized.isbn13, "string");
});
