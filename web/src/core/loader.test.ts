import { test, expect, describe, beforeEach, mock } from "bun:test";
import { loadSpec } from "./loader";

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

describe("loadSpec", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  test("returns typed spec on success", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(mockSpec), { status: 200 }));
    const spec = await loadSpec();
    expect(spec.version).toBe("1");
    expect(spec.machine.hostname).toBe("test");
  });

  test("throws on fetch error (non-200)", async () => {
    mockFetch.mockResolvedValue(new Response("Not Found", { status: 404, statusText: "Not Found" }));
    expect(loadSpec()).rejects.toThrow("Failed to fetch spec: 404 Not Found");
  });

  test("throws on network error", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));
    expect(loadSpec()).rejects.toThrow("Network failure");
  });

  test("throws on empty/null response", async () => {
    mockFetch.mockResolvedValue(new Response("null", { status: 200 }));
    expect(loadSpec()).rejects.toThrow("Empty response from scanner");
  });
});
