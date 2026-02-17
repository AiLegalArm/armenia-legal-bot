import { describe, it, expect, beforeEach } from "vitest";
import {
  getReferencesText,
  setReferencesText,
  appendReferenceBlock,
  clearReferences,
} from "./references-store";

const SEP = "\n\n---\n\n";

beforeEach(() => {
  clearReferences();
});

describe("references-store", () => {
  it("starts empty", () => {
    expect(getReferencesText()).toBe("");
  });

  it("setReferencesText replaces value", () => {
    setReferencesText("block1");
    expect(getReferencesText()).toBe("block1");
    setReferencesText("block2");
    expect(getReferencesText()).toBe("block2");
  });

  it("appendReferenceBlock appends with separator", () => {
    appendReferenceBlock("A");
    expect(getReferencesText()).toBe("A");
    appendReferenceBlock("B");
    expect(getReferencesText()).toBe("A" + SEP + "B");
    appendReferenceBlock("C");
    expect(getReferencesText()).toBe("A" + SEP + "B" + SEP + "C");
  });

  it("appendReferenceBlock ignores empty/whitespace blocks", () => {
    appendReferenceBlock("A");
    appendReferenceBlock("");
    appendReferenceBlock("   ");
    expect(getReferencesText()).toBe("A");
  });

  it("clearReferences resets to empty", () => {
    appendReferenceBlock("A");
    appendReferenceBlock("B");
    clearReferences();
    expect(getReferencesText()).toBe("");
  });

  it("clearReferences is idempotent", () => {
    clearReferences();
    clearReferences();
    expect(getReferencesText()).toBe("");
  });
});
