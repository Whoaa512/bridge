import { describe, test, expect, beforeEach, mock } from "bun:test";
import { viewFromPath, pushView } from "./router";

const pushStateMock = mock(() => {});

beforeEach(() => {
  pushStateMock.mockClear();
  (globalThis as any).window = {
    location: { pathname: "/" },
    history: { pushState: pushStateMock },
  };
});

describe("viewFromPath", () => {
  test("/ maps to sessions", () => {
    expect(viewFromPath("/")).toBe("sessions");
  });

  test("/workspace maps to workspace", () => {
    expect(viewFromPath("/workspace")).toBe("workspace");
  });

  test("/colony maps to colony", () => {
    expect(viewFromPath("/colony")).toBe("colony");
  });

  test("/complexity maps to complexity", () => {
    expect(viewFromPath("/complexity")).toBe("complexity");
  });

  test("unknown path falls back to sessions", () => {
    expect(viewFromPath("/unknown")).toBe("sessions");
  });
});

describe("pushView", () => {
  test("pushes correct path", () => {
    pushView("workspace");
    expect(pushStateMock).toHaveBeenCalledWith(null, "", "/workspace");
  });

  test("does not push if already on path", () => {
    (globalThis as any).window.location.pathname = "/colony";
    pushView("colony");
    expect(pushStateMock).not.toHaveBeenCalled();
  });

  test("pushes / for sessions", () => {
    (globalThis as any).window.location.pathname = "/workspace";
    pushView("sessions");
    expect(pushStateMock).toHaveBeenCalledWith(null, "", "/");
  });

  test("pushes /complexity for complexity", () => {
    (globalThis as any).window.location.pathname = "/";
    pushView("complexity");
    expect(pushStateMock).toHaveBeenCalledWith(null, "", "/complexity");
  });
});
