import type { BridgeSpec } from "./types";

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
      return data as BridgeSpec;
    } catch (err) {
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
