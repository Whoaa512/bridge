import { describe, test, expect } from "bun:test";
import { filterWorkspaceProjects } from "./filter-utils";
import type { Project } from "../../core/types";
import type { SessionInfo } from "../../agent/ws-types";

function makeProject(overrides: Partial<Project> & { id: string; name: string }): Project {
  return {
    path: `/code/${overrides.name}`,
    kind: "git_repo",
    classification: "personal",
    classificationSource: "manual",
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

function makeSession(id: string, projectId: string): SessionInfo {
  return { id, cwd: "/tmp", projectId, model: "test", state: "idle" };
}

const projects: Project[] = [
  makeProject({ id: "a", name: "Alpha", prs: [{ number: 1, title: "fix" } as any] }),
  makeProject({ id: "b", name: "Beta", activity: { staleDays: 20 } as any }),
  makeProject({ id: "c", name: "Charlie" }),
  makeProject({ id: "d", name: "Delta", prs: [{ number: 2, title: "feat" } as any], activity: { staleDays: 30 } as any }),
];

const sessionMap = new Map<string, SessionInfo[]>([
  ["c", [makeSession("s1", "c")]],
]);

describe("filterWorkspaceProjects", () => {
  test("all filter returns everything", () => {
    const result = filterWorkspaceProjects(projects, "all", "", sessionMap);
    expect(result).toHaveLength(4);
  });

  test("has_prs filter", () => {
    const result = filterWorkspaceProjects(projects, "has_prs", "", sessionMap);
    expect(result.map((p) => p.id)).toEqual(["a", "d"]);
  });

  test("active_agents filter", () => {
    const result = filterWorkspaceProjects(projects, "active_agents", "", sessionMap);
    expect(result.map((p) => p.id)).toEqual(["c"]);
  });

  test("stale filter (staleDays > 14)", () => {
    const result = filterWorkspaceProjects(projects, "stale", "", sessionMap);
    expect(result.map((p) => p.id)).toEqual(["b", "d"]);
  });

  test("search query filters by name", () => {
    const result = filterWorkspaceProjects(projects, "all", "al", sessionMap);
    expect(result.map((p) => p.id)).toEqual(["a"]);
  });

  test("search is case-insensitive", () => {
    const result = filterWorkspaceProjects(projects, "all", "BETA", sessionMap);
    expect(result.map((p) => p.id)).toEqual(["b"]);
  });

  test("search + filter combined (AND logic)", () => {
    const result = filterWorkspaceProjects(projects, "has_prs", "del", sessionMap);
    expect(result.map((p) => p.id)).toEqual(["d"]);
  });

  test("search with no matches returns empty", () => {
    const result = filterWorkspaceProjects(projects, "all", "zzz", sessionMap);
    expect(result).toHaveLength(0);
  });

  test("search trims whitespace", () => {
    const result = filterWorkspaceProjects(projects, "all", "  alpha  ", sessionMap);
    expect(result.map((p) => p.id)).toEqual(["a"]);
  });
});
