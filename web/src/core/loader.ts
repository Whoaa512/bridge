import type { BridgeSpec } from "./types";

export async function loadSpec(): Promise<BridgeSpec> {
  const res = await fetch("/api/spec");
  if (!res.ok) {
    throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data) throw new Error("Empty response from scanner");
  return data as BridgeSpec;
}
