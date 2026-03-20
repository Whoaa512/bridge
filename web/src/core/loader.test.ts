import { test, expect, describe, beforeEach, mock } from "bun:test";
import { loadSpec, getCachedSpec, cacheSpec } from "./loader";

const mockSpec = {
  version: "1",
  scannedAt: "2025-01-01T00:00:00Z",
  machine: { hostname: "test", os: "darwin", uptime: 1000 },
  projects: [],
  infrastructure: { ports: [], docker: [], resources: { cpuByProject: {}, memByProject: {} } },
  alerts: [],
  cycle: {
    period: "weekly",
    start: "2025-01-01T00:00:00Z",
    end: "2025-01-07T00:00:00Z",
    summary: { commitsTotal: 0, projectsActive: 0, prsOpened: 0, prsMerged: 0, alertsNew: 0, alertsResolved: 0 },
  },
};

const mockFetch = mock();

const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, val: string) => { storage[key] = val; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { for (const k in storage) delete storage[k]; },
  get length() { return Object.keys(storage).length; },
  key: (i: number) => Object.keys(storage)[i] ?? null,
};

describe("loadSpec", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    globalThis.localStorage = mockLocalStorage as unknown as Storage;
    mockLocalStorage.clear();
  });

  test("returns typed spec on success", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(mockSpec), { status: 200 }));
    const spec = await loadSpec();
    expect(spec.version).toBe("1");
    expect(spec.machine.hostname).toBe("test");
  });

  test("caches spec to localStorage on success", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(mockSpec), { status: 200 }));
    await loadSpec();
    expect(storage["bridge:spec"]).toBeDefined();
    const cached = JSON.parse(storage["bridge:spec"]);
    expect(cached.version).toBe("1");
  });

  test("returns cached spec when fetch fails on first attempt", async () => {
    cacheSpec(mockSpec as any);
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const spec = await loadSpec();
    expect(spec.version).toBe("1");
    expect(spec.machine.hostname).toBe("test");
  });

  test("retries on failure then succeeds", async () => {
    let calls = 0;
    mockFetch.mockImplementation(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error("ECONNREFUSED"));
      return Promise.resolve(new Response(JSON.stringify(mockSpec), { status: 200 }));
    });
    const statuses: string[] = [];
    const spec = await loadSpec((msg) => statuses.push(msg));
    expect(spec.version).toBe("1");
    expect(calls).toBe(3);
    expect(statuses.length).toBe(2);
  });

  test("calls onStatus with attempt info", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(new Response(JSON.stringify(mockSpec), { status: 200 }));
    const statuses: string[] = [];
    await loadSpec((msg) => statuses.push(msg));
    expect(statuses[0]).toContain("attempt 1");
  });
});

describe("getCachedSpec", () => {
  beforeEach(() => {
    globalThis.localStorage = mockLocalStorage as unknown as Storage;
    mockLocalStorage.clear();
  });

  test("returns null when nothing cached", () => {
    expect(getCachedSpec()).toBeNull();
  });

  test("returns parsed spec when cached", () => {
    storage["bridge:spec"] = JSON.stringify(mockSpec);
    const cached = getCachedSpec();
    expect(cached).not.toBeNull();
    expect(cached!.version).toBe("1");
  });

  test("returns null on invalid JSON", () => {
    storage["bridge:spec"] = "not json";
    expect(getCachedSpec()).toBeNull();
  });
});
