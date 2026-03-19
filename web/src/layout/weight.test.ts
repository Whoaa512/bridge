import { test, expect, describe } from "bun:test";
import { computeWeight } from "./weight";
import type { Project } from "../core/types";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "test",
    path: "/tmp/test",
    name: "test",
    kind: "git_repo",
    classification: "personal",
    classificationSource: "auto",
    languages: [],
    git: null,
    ci: null,
    prs: [],
    tasks: [],
    size: null,
    activity: null,
    subprojects: [],
    priority: null,
    flags: [],
    errors: [],
    ...overrides,
  };
}

describe("computeWeight", () => {
  test("all-null size uses fallback values, returns >= 100", () => {
    const w = computeWeight(makeProject());
    expect(w).toBeGreaterThanOrEqual(100);
    const expected = 100 * 0.6 + 10 * 20 * 0.25 + 0 * 50 * 0.15;
    expect(w).toBe(Math.max(expected, 100));
  });

  test("real size data matches formula", () => {
    const project = makeProject({
      size: { loc: 5000, files: 120, deps: 30 },
    });
    const w = computeWeight(project);
    const expected = 5000 * 0.6 + 120 * 20 * 0.25 + 30 * 50 * 0.15;
    expect(w).toBe(expected);
  });

  test("result is always >= 100", () => {
    const tiny = makeProject({
      size: { loc: 1, files: 1, deps: 0 },
    });
    expect(computeWeight(tiny)).toBeGreaterThanOrEqual(100);
  });

  test("very large project weight scales correctly", () => {
    const big = makeProject({
      size: { loc: 100000, files: 2000, deps: 500 },
    });
    const w = computeWeight(big);
    const expected = 100000 * 0.6 + 2000 * 20 * 0.25 + 500 * 50 * 0.15;
    expect(w).toBe(expected);
  });
});
