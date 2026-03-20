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
  test("/ maps to complexity", () => {
    expect(viewFromPath("/")).toBe("complexity");
  });

  test("/workspace maps to workspace", () => {
    expect(viewFromPath("/workspace")).toBe("workspace");
  });

  test("/colony maps to colony", () => {
    expect(viewFromPath("/colony")).toBe("colony");
  });

  test("/sessions maps to sessions", () => {
    expect(viewFromPath("/sessions")).toBe("sessions");
  });

  test("unknown path falls back to complexity", () => {
    expect(viewFromPath("/unknown")).toBe("complexity");
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

  test("pushes / for complexity", () => {
    (globalThis as any).window.location.pathname = "/workspace";
    pushView("complexity");
    expect(pushStateMock).toHaveBeenCalledWith(null, "", "/");
  });
});
