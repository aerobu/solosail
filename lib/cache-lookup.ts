import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import type { ResearchState } from "@/lib/types";
import { logger } from "@/lib/logger";

const CACHE_DIR = join(process.cwd(), "lib", "demo-cache");

interface CacheEntry {
  key: string;
  state: ResearchState;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function filenameToKey(filename: string): string {
  return filename.replace(/\.json$/, "").replace(/-/g, " ");
}

// ── Load cache at module initialization time ────────────────────────────────
// Previously this used readdirSync + readFileSync inside findCachedState(),
// which blocked the Node.js event loop on every incoming request. Loading once
// at startup is free and safe — the cache files never change at runtime.
const CACHE: CacheEntry[] = [];

if (existsSync(CACHE_DIR)) {
  try {
    const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = readFileSync(join(CACHE_DIR, file), "utf-8");
        const state = JSON.parse(raw) as ResearchState;
        CACHE.push({ key: normalize(filenameToKey(file)), state });
      } catch (err) {
        logger.warn("Failed to load cache file", { file, error: String(err) });
      }
    }
    if (CACHE.length > 0) {
      logger.info(`Demo cache loaded`, { entries: CACHE.length });
    }
  } catch (err) {
    logger.warn("Demo cache directory unreadable", { error: String(err) });
  }
}

/**
 * Looks up a pre-cached ResearchState for the given query.
 * Matching priority:
 *   1. Exact normalized match       "riverside company" → "riverside-company.json" ✓
 *   2. Cache key starts with query  "riverside" → "riverside company"              ✓
 *   3. Query starts with cache key  "riverside company inc" → "riverside company"  ✓
 *
 * Returns the cached ResearchState, or null if no match.
 */
export function findCachedState(query: string): ResearchState | null {
  if (CACHE.length === 0) return null;
  const q = normalize(query);
  return (
    CACHE.find((e) => e.key === q)?.state ??
    CACHE.find((e) => e.key.startsWith(q))?.state ??
    CACHE.find((e) => q.startsWith(e.key))?.state ??
    null
  );
}
