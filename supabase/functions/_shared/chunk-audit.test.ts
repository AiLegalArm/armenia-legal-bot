/**
 * chunk-audit unit tests — pure deterministic checks
 */

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { computeMetrics } from "./chunk-audit.ts";

Deno.test("computeMetrics: empty chunks returns zero metrics", () => {
  const m = computeMetrics("doc1", "knowledge_base", "Hello world content text here.", []);
  assertEquals(m.chunk_count, 0);
  assertEquals(m.coverage_ok, false);
  assertEquals(m.boundary_violations.length, 0);
});

Deno.test("computeMetrics: single chunk full coverage", () => {
  const text = "A".repeat(200);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: text, char_start: 0, char_end: 200, chunk_hash: "abc" },
  ]);
  assertEquals(m.chunk_count, 1);
  assertEquals(m.coverage_ratio, 1);
  assertEquals(m.coverage_ok, true);
  assertEquals(m.gap_violations.length, 0);
  assertEquals(m.overlap_violations.length, 0);
  assertEquals(m.index_continuity_ok, true);
});

Deno.test("computeMetrics: detects gap between chunks", () => {
  const text = "A".repeat(300);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: "A".repeat(100), char_start: 0, char_end: 100, chunk_hash: "a1" },
    { chunk_index: 1, chunk_text: "A".repeat(100), char_start: 150, char_end: 250, chunk_hash: "a2" },
  ]);
  assertEquals(m.gap_violations.length, 1);
  assertEquals(m.gap_violations[0].gap_size, 50);
  assertEquals(m.coverage_ok, false);
});

Deno.test("computeMetrics: detects excessive overlap", () => {
  const text = "A".repeat(200);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: "A".repeat(100), char_start: 0, char_end: 100, chunk_hash: "a1" },
    { chunk_index: 1, chunk_text: "A".repeat(100), char_start: 50, char_end: 150, chunk_hash: "a2" },
  ]);
  // overlap is 50/100 = 0.50 > 0.15 threshold
  assertEquals(m.overlap_violations.length, 1);
  assertEquals(m.overlap_violations[0].overlap_ratio, 0.5);
});

Deno.test("computeMetrics: detects boundary violation (char_end > doc)", () => {
  const text = "A".repeat(100);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: "A".repeat(100), char_start: 0, char_end: 200, chunk_hash: "a1" },
  ]);
  assertEquals(m.boundary_violations.length, 1);
});

Deno.test("computeMetrics: detects missing indices", () => {
  const text = "A".repeat(300);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: "A".repeat(100), char_start: 0, char_end: 100, chunk_hash: "a1" },
    { chunk_index: 2, chunk_text: "A".repeat(100), char_start: 100, char_end: 200, chunk_hash: "a2" },
  ]);
  assertEquals(m.index_continuity_ok, false);
  assertEquals(m.missing_indices, [1]);
});

Deno.test("computeMetrics: detects duplicate hashes", () => {
  const text = "A".repeat(200);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: "A".repeat(100), char_start: 0, char_end: 100, chunk_hash: "same" },
    { chunk_index: 1, chunk_text: "A".repeat(100), char_start: 100, char_end: 200, chunk_hash: "same" },
  ]);
  assertEquals(m.duplicate_hashes.length, 1);
  assertEquals(m.duplicate_hashes[0], "same");
});

Deno.test("computeMetrics: detects empty chunks", () => {
  const text = "A".repeat(200);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: "", char_start: 0, char_end: 100, chunk_hash: "a1" },
    { chunk_index: 1, chunk_text: "A".repeat(100), char_start: 100, char_end: 200, chunk_hash: "a2" },
  ]);
  assertEquals(m.empty_chunks.length, 1);
  assertEquals(m.empty_chunks[0], 0);
});
