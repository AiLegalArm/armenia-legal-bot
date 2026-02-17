// =============================================================================
// Centralized References Store
// Single source-of-truth for user-selected KB/practice references across the app.
// Uses React 18 useSyncExternalStore for zero-dependency reactivity.
// =============================================================================

import { useSyncExternalStore } from "react";

const SEPARATOR = "\n\n---\n\n";

type Listener = () => void;

let _referencesText = "";
const _listeners = new Set<Listener>();

function _emit() {
  for (const fn of _listeners) fn();
}

function _subscribe(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function _getSnapshot(): string {
  return _referencesText;
}

// ─── Public API ────────────────────────────────────────────────

export function getReferencesText(): string {
  return _referencesText;
}

export function setReferencesText(text: string): void {
  if (_referencesText !== text) {
    _referencesText = text;
    _emit();
  }
}

/** Append a single reference block using the standard separator. */
export function appendReferenceBlock(block: string): void {
  if (!block.trim()) return;
  _referencesText = _referencesText
    ? _referencesText + SEPARATOR + block
    : block;
  _emit();
}

export function clearReferences(): void {
  if (_referencesText !== "") {
    _referencesText = "";
    _emit();
  }
}

// ─── React hook ────────────────────────────────────────────────

/** Subscribe to the references store from any React component. */
export function useReferencesText(): string {
  return useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
}
