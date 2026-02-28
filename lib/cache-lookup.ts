import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import type { ResearchState } from "@/lib/types";

const CACHE_DIR = join(process.cwd(), "lib", "demo-cache");

/**
 * Normalizes a string for cache key comparison.
 * Lowercases, strips punctuation, and collapses whitespace.
 * "Riverside Company", "riverside company", and "Riverside" all normalize
 * to forms that match "riverside-company.json".
 */
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

/**
 * Looks up a cached ResearchState for the given query.
 * Matching priority:
 *   1. Exact normalized match       "riverside company" → "riverside-company.json" ✓
 *   2. Cache key starts with query  "riverside" → "riverside company"              ✓
 *   3. Query starts with cache key  "riverside company inc" → "riverside company"  ✓
 *
 * Returns the parsed ResearchState, or null if no cache file matches.
 */
export function findCachedState(query: string): ResearchState | null {
  if (!existsSync(CACHE_DIR)) return null;

  let files: string[];
  try {
    files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return null;
  }
  if (files.length === 0) return null;

  const normalizedQuery = normalize(query);

  const entries = files.map((f) => ({
    file: f,
    key: normalize(filenameToKey(f)),
  }));

  // 1. Exact match
  let match = entries.find((e) => e.key === normalizedQuery);

  // 2. Cache key starts with query ("riverside" → "riverside company")
  if (!match) {
    match = entries.find((e) => e.key.startsWith(normalizedQuery));
  }

  // 3. Query starts with cache key ("riverside company inc" → "riverside company")
  if (!match) {
    match = entries.find((e) => normalizedQuery.startsWith(e.key));
  }

  if (!match) return null;

  try {
    const raw = readFileSync(join(CACHE_DIR, match.file), "utf-8");
    return JSON.parse(raw) as ResearchState;
  } catch {
    return null;
  }
}
