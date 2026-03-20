import { describe, test, expect } from "bun:test";
import { useBridgeStore } from "./store";
import type { BridgeSpec } from "./core/types";

function makeSpec(): BridgeSpec {
  return {
    version: "1.0",
    scannedAt: new Date().toISOString(),
    machine: { hostname: "test", os: "test", uptime: 0 },
    projects: [],
    infrastructure: { ports: [], docker: [], resources: { cpuByProject: {}, memByProject: {} } },
    alerts: [],
    cycle: {
      period: "weekly",
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      summary: { commitsTotal: 0, projectsActive: 0, prsOpened: 0, prsMerged: 0, alertsNew: 0, alertsResolved: 0 },
    },
  };
}

describe("BridgeStore", () => {
  test("initial state", () => {
    const state = useBridgeStore.getState();
    expect(state.spec).toBeNull();
    expect(state.activeView).toBe("complexity");
    expect(state.wsConnected).toBe(false);
  });

  test("setSpec updates spec", () => {
    const spec = makeSpec();
    useBridgeStore.getState().setSpec(spec);
    expect(useBridgeStore.getState().spec).toBe(spec);
  });

  test("setActiveView switches view", () => {
    useBridgeStore.getState().setActiveView("workspace");
    expect(useBridgeStore.getState().activeView).toBe("workspace");

    useBridgeStore.getState().setActiveView("colony");
    expect(useBridgeStore.getState().activeView).toBe("colony");

    useBridgeStore.getState().setActiveView("sessions");
    expect(useBridgeStore.getState().activeView).toBe("sessions");

    useBridgeStore.getState().setActiveView("complexity");
    expect(useBridgeStore.getState().activeView).toBe("complexity");
  });

  test("setWsConnected toggles ws state", () => {
    useBridgeStore.getState().setWsConnected(true);
    expect(useBridgeStore.getState().wsConnected).toBe(true);

    useBridgeStore.getState().setWsConnected(false);
    expect(useBridgeStore.getState().wsConnected).toBe(false);
  });
});
