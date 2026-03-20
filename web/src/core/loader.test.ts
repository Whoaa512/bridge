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
