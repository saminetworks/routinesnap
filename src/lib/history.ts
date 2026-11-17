import { createStore, del, get, set } from "idb-keyval";
import type { CategorySlug } from "@/config/categories";
import type { EditableEvent } from "@/lib/ai/schema";

/**
 * Local-only scan history (Step 6, spec §2/§13).
 *
 * Saved scans live in the browser's IndexedDB only — never on the
 * server, never uploaded. Clearing browser data deletes them.
 * This module is client-only: it touches `indexedDB` through
 * idb-keyval, so import it only from client components.
 */

export interface SavedScan {
  /** Stable id, `scan-<timestamp>-<random>`. */
  id: string;
  /** ISO timestamp of when the scan was saved. */
  savedAt: string;
  /** Category the events were extracted as. */
  category: CategorySlug;
  timezone: string;
  /** Week start used to place weekly events, as yyyy-mm-dd. */
  weekStart: string;
  /** Repeat-until date, as yyyy-mm-dd. */
  repeatUntil: string;
  events: EditableEvent[];
}

const historyStore = createStore("routinesnap", "history");
const SCANS_KEY = "scans";

/** All saved scans, newest first. Returns [] when nothing is saved yet. */
export async function listSavedScans(): Promise<SavedScan[]> {
  const scans = (await get<SavedScan[]>(SCANS_KEY, historyStore)) ?? [];
  return [...scans].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Save a scan; returns the stored record. Newest scans come first. */
export async function saveScan(
  scan: Omit<SavedScan, "id" | "savedAt">,
): Promise<SavedScan> {
  const record: SavedScan = {
    ...scan,
    id: `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  };
  const scans = (await get<SavedScan[]>(SCANS_KEY, historyStore)) ?? [];
  await set(SCANS_KEY, [record, ...scans], historyStore);
  return record;
}

/** Delete one saved scan. */
export async function deleteScan(id: string): Promise<void> {
  const scans = (await get<SavedScan[]>(SCANS_KEY, historyStore)) ?? [];
  await set(
    SCANS_KEY,
    scans.filter((s) => s.id !== id),
    historyStore,
  );
}

/** Delete every saved scan. */
export async function clearHistory(): Promise<void> {
  await del(SCANS_KEY, historyStore);
}
