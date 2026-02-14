import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Inline the function for testing (same logic as in index.ts)
interface NormalizeResult {
  text: string;
  invalidEscapeFound: boolean;
}

function normalizeUnicodeEscapes(input: string): NormalizeResult {
  let invalidEscapeFound = false;

  // First pass: handle surrogate pairs
  let result = input.replace(
    /\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})/g,
    (_match, hex1: string, hex2: string) => {
      const cp1 = parseInt(hex1, 16);
      const cp2 = parseInt(hex2, 16);
      const codePoint = ((cp1 - 0xD800) * 0x400) + (cp2 - 0xDC00) + 0x10000;
      return String.fromCodePoint(codePoint);
    }
  );

  // Second pass: handle regular BMP escapes
  result = result.replace(
    /\\u([0-9a-fA-F]{4})/g,
    (_match, hex: string) => {
      const cp = parseInt(hex, 16);
      if (cp === 0) { invalidEscapeFound = true; return ""; }
      if (cp >= 0xD800 && cp <= 0xDFFF) { invalidEscapeFound = true; return _match; }
      return String.fromCharCode(cp);
    }
  );

  if (/\\u(?![0-9a-fA-F]{4})/.test(result)) {
    invalidEscapeFound = true;
  }

  return { text: result, invalidEscapeFound };
}

Deno.test("normalizes Russian escaped text", () => {
  const input = "\\u044d\\u043b\\u0435\\u043c";
  const { text, invalidEscapeFound } = normalizeUnicodeEscapes(input);
  assertEquals(text, "\u044d\u043b\u0435\u043c"); // "элем"
  assertEquals(invalidEscapeFound, false);
});

Deno.test("normalizes surrogate pair emoji", () => {
  const input = "\\uD83D\\uDE00";
  const { text, invalidEscapeFound } = normalizeUnicodeEscapes(input);
  assertEquals(text, "\uD83D\uDE00"); // 😀
  assertEquals(invalidEscapeFound, false);
});

Deno.test("handles invalid escape gracefully", () => {
  const input = "test \\u12G4 and \\u123 end";
  const { text, invalidEscapeFound } = normalizeUnicodeEscapes(input);
  // Should not crash, invalid sequences flagged
  assertEquals(invalidEscapeFound, true);
  // The text should still contain the invalid sequences
  assertEquals(text.includes("end"), true);
});

Deno.test("does not modify normal text", () => {
  const input = "Hello world\nNew line\ttab";
  const { text, invalidEscapeFound } = normalizeUnicodeEscapes(input);
  assertEquals(text, input);
  assertEquals(invalidEscapeFound, false);
});

Deno.test("strips null character escape", () => {
  const input = "before\\u0000after";
  const { text, invalidEscapeFound } = normalizeUnicodeEscapes(input);
  assertEquals(text, "beforeafter");
  assertEquals(invalidEscapeFound, true);
});

Deno.test("normalizes Armenian text", () => {
  const input = "\\u0540\\u0578\\u0564\\u057E\\u0561\\u056E";
  const { text } = normalizeUnicodeEscapes(input);
  assertEquals(text, "\u0540\u0578\u0564\u057E\u0561\u056E");
});
