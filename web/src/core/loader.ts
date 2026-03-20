import type { BridgeSpec } from "./types";

const CACHE_KEY = "bridge:spec";

export function getCachedSpec(): BridgeSpec | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BridgeSpec;
  } catch {
    return null;
  }
}

export function cacheSpec(spec: BridgeSpec): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(spec));
  } catch {
    // quota exceeded or private browsing — ignore
  }
}

export async function loadSpec(onStatus?: (msg: string) => void): Promise<BridgeSpec> {
  const maxRetries = 30;
  let delay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch("/api/spec");
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (!data) throw new Error("Empty response");
      cacheSpec(data as BridgeSpec);
      return data as BridgeSpec;
    } catch (err) {
      if (attempt === 1) {
        const cached = getCachedSpec();
        if (cached) {
          onStatus?.("Using cached data while reconnecting…");
          return cached;
        }
      }
      if (attempt === maxRetries) {
        throw new Error(`Scanner unavailable after ${maxRetries} attempts: ${err}`);
      }
      onStatus?.(`Waiting for scanner… (attempt ${attempt})`);
      await sleep(delay);
      delay = Math.min(delay * 1.2, 3000);
    }
  }

  throw new Error("unreachable");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
