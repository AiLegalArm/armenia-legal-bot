/**
 * Tests for legal-chunker
 *
 * All Armenian text as Unicode escapes per project standards.
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chunkDocument } from "./index.ts";

// ─── FIXTURE 1: Legislation with articles ───────────────────────────
const LEGISLATION_FIXTURE =
  "\u0540\u0531\u0545\u0531\u054d\u054f\u0531\u0546\u053b \u0540\u0531\u0546\u0550\u0531\u054a\u0535\u054f\u0548\u0552\u054f\u0545\u0531\u0546\n" +
  "\u0554\u0550\u0535\u0531\u053f\u0531\u0546 \u0555\u0550\u0535\u0546\u054d\u0533\u053b\u0550\u0554\u0548\u0552\u054d\n\n" +
  "\u0540\u0578\u0564\u057e\u0561\u056e 1\u0589 \u0540\u0561\u0575\u0561\u057d\u057f\u0561\u0576\u056b " +
  "\u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0585\u0580\u0565\u0576\u057d\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568\n" +
  "1) \u054d\u0578\u0582\u0575\u0576 \u0585\u0580\u0565\u0576\u057d\u0563\u056b\u0580\u0584\u0568 \u057d\u0561\u0570\u0574\u0561\u0576\u0578\u0582\u0574 " +
  "\u0567 \u0561\u0576\u0571\u056b\u0576\u0584\u056b\n" +
  "2) \u054d\u0578\u0582\u0575\u0576 \u0585\u0580\u0565\u0576\u057d\u0563\u056b\u0580\u0584\u056b " +
  "\u0576\u057a\u0561\u057f\u0561\u056f\u0576\u0565\u0580\u0576 \u0565\u0576\n\n" +
  "\u0540\u0578\u0564\u057e\u0561\u056e 2\u0589 \u0554\u0580\u0565\u0561\u056f\u0561\u0576 " +
  "\u0585\u0580\u0565\u0576\u057d\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568\n" +
  "\u054d\u0578\u0582\u0575\u0576 \u0570\u0578\u0564\u057e\u0561\u056e\u0568 " +
  "\u057d\u0561\u0570\u0574\u0561\u0576\u0578\u0582\u0574 \u0567\n\n" +
  "\u0540\u0578\u0564\u057e\u0561\u056e 3\u0589 \u0555\u0580\u056b\u0576\u0561\u056f\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 " +
  "\u057d\u056f\u0566\u0562\u0578\u0582\u0576\u0584\u0568\n" +
  "\u0555\u0580\u0565\u0576\u0584\u056b \u057d\u056f\u0566\u0562\u0578\u0582\u0576\u0584\u056b " +
  "\u0574\u0561\u057d\u056b\u0576";

// ─── FIXTURE 2: Court decision with sections ────────────────────────
const COURT_DECISION_FIXTURE =
  "\u054e\u0543\u054c\u0531\u0532\u0535\u053f \u0534\u0531\u054f\u0531\u0550\u0531\u0546\n" +
  "\u0563\u0578\u0580\u056e \u0569\u056b\u057e: \u054f\u054f/0012/01/24\n" +
  "20 \u0570\u0578\u0582\u0576\u056b\u057d\u056b 2024 \u0569\u057e\u0561\u056f\u0561\u0576\u056b\n" +
  "\u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0563\u0578\u0580\u056e\u0578\u057e\n\n" +
  "\u0563\u0578\u0580\u056e\u056b \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580\u0568\n" +
  "\u0531\u0574\u0562\u0561\u057d\u057f\u0561\u0576\u057e\u0578\u0572\u0568 \u0574\u0565\u0572\u0561\u0564\u0580\u057e\u0565\u056c " +
  "\u0567 \u0570\u0578\u0564\u057e\u0561\u056e 391 \u0574\u0561\u057d 1 \u056f\u0565\u057f 3 " +
  "\u056d\u0561\u056d\u057f\u0574\u0561\u0576 \u0574\u0565\u057b\n\n" +
  "\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d\n" +
  "\u0534\u0561\u057f\u0561\u0580\u0561\u0576\u0568 \u0563\u057f\u0576\u0578\u0582\u0574 " +
  "\u0567 \u0578\u0580 \u057e\u0573\u057c\u0561\u056f\u0561\u0576 \u0562\u0578\u0572\u0578\u0584\u0568 " +
  "\u0570\u056b\u0574\u0576\u0561\u057e\u0578\u0580 \u0567\n\n" +
  "\u057e\u0573\u056b\u057c\u0565\u0581\n" +
  "\u0544\u0565\u0580\u056a\u0565\u056c \u057e\u0573\u057c\u0561\u056f\u0561\u0576 \u0562\u0578\u0572\u0578\u0584\u0568";

// ─── TEST: Legislation chunking ─────────────────────────────────────

Deno.test("chunkDocument: legislation splits by articles", () => {
  const result = chunkDocument({
    doc_type: "code",
    content_text: LEGISLATION_FIXTURE,
  });
  const chunks = result.chunks;
  assertEquals(result.strategy, "article");

  assert(chunks.length >= 3, `Expected >= 3 chunks, got ${chunks.length}`);
  const articleChunks = chunks.filter((c) => c.chunk_type === "article");
  assert(articleChunks.length >= 3, `Expected >= 3 article chunks, got ${articleChunks.length}`);

  for (const ac of articleChunks) {
    assertExists(ac.locator, "Article chunk must have locator");
    assertExists(ac.locator!.article, "Locator must have article number");
  }

  const preambles = chunks.filter((c) => c.chunk_type === "preamble");
  if (preambles.length > 0) {
    assertEquals(chunks[0].chunk_type, "preamble");
  }

  for (const c of chunks) {
    assert(c.char_start >= 0, "char_start must be >= 0");
    assert(c.char_end > c.char_start, "char_end must be > char_start");
    assert(c.chunk_text.length > 0, "chunk_text must not be empty");
    assertExists(c.chunk_hash, "chunk_hash must exist");
  }

  for (let i = 0; i < chunks.length; i++) {
    assertEquals(chunks[i].chunk_index, i, `Chunk index mismatch at ${i}`);
  }
});

// ─── TEST: Court decision chunking ──────────────────────────────────

Deno.test("chunkDocument: court decision splits by sections", () => {
  const result = chunkDocument({
    doc_type: "cassation_ruling",
    content_text: COURT_DECISION_FIXTURE,
  });
  const chunks = result.chunks;
  assertEquals(result.strategy, "sections");

  assert(chunks.length >= 3, `Expected >= 3 chunks, got ${chunks.length}`);

  const types = new Set(chunks.map((c) => c.chunk_type));
  assert(types.has("facts"), "Should detect facts section");
  assert(types.has("reasoning"), "Should detect reasoning section");
  assert(types.has("resolution") || types.has("operative"), "Should detect resolution/operative section");

  const sectionChunks = chunks.filter((c) => c.chunk_type !== "header");
  for (const sc of sectionChunks) {
    assertExists(sc.label, `Section chunk ${sc.chunk_index} should have label`);
  }
});

// ─── TEST: Court decision case_number extraction ────────────────────

Deno.test("chunkDocument: court decision extracts case_number", () => {
  const result = chunkDocument({
    doc_type: "cassation_ruling",
    content_text: COURT_DECISION_FIXTURE,
  });
  assertExists(result.case_number, "Should extract case_number");
  assertEquals(result.case_number, "\u054f\u054f/0012/01/24");
});

// ─── TEST: Unknown doc_type -> fixed-window ─────────────────────────

Deno.test("chunkDocument: unknown doc_type uses fixed-window", () => {
  const longText = "Lorem ipsum. ".repeat(100);
  const result = chunkDocument({
    doc_type: "other",
    content_text: longText,
  });
  const chunks = result.chunks;
  assertEquals(result.strategy, "fixed");

  assert(chunks.length >= 1, "Should produce at least 1 chunk");
  assertEquals(chunks[0].chunk_type, "full_text");
});

// ─── TEST: Empty content ────────────────────────────────────────────

Deno.test("chunkDocument: empty content returns empty result", () => {
  const result = chunkDocument({
    doc_type: "code",
    content_text: "",
  });
  assertEquals(result.chunks.length, 0);
  assertEquals(result.strategy, "fixed");
});

// ─── TEST: Chunk hashes are deterministic ───────────────────────────

Deno.test("chunkDocument: deterministic output", () => {
  const result1 = chunkDocument({
    doc_type: "code",
    content_text: LEGISLATION_FIXTURE,
  });
  const result2 = chunkDocument({
    doc_type: "code",
    content_text: LEGISLATION_FIXTURE,
  });

  assertEquals(result1.chunks.length, result2.chunks.length);
  for (let i = 0; i < result1.chunks.length; i++) {
    assertEquals(result1.chunks[i].chunk_hash, result2.chunks[i].chunk_hash);
    assertEquals(result1.chunks[i].char_start, result2.chunks[i].char_start);
    assertEquals(result1.chunks[i].char_end, result2.chunks[i].char_end);
  }
});
