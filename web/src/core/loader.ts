import type { BridgeSpec, Project } from "./types";

export let currentSpec: BridgeSpec | null = null;

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function loadSpec(): Promise<BridgeSpec> {
  const spec = await fetchJSON<BridgeSpec>("/api/spec");
  currentSpec = spec;
  return spec;
}

export async function loadProjects(): Promise<Project[]> {
  return fetchJSON<Project[]>("/api/projects");
}
