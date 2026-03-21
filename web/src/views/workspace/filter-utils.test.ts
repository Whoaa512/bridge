import { describe, test, expect } from "bun:test";
import { filterWorkspaceProjects, isPillFilter, filterLabel } from "./filter-utils";
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
  makeProject({ id: "e", name: "Echo", git: { branch: "main", branches: [], uncommitted: 5, ahead: 0, behind: 0, stashCount: 0, lastCommit: "", remoteUrl: null } as any }),
  makeProject({ id: "f", name: "Foxtrot", git: { branch: "main", branches: [], uncommitted: 0, ahead: 0, behind: 3, stashCount: 0, lastCommit: "", remoteUrl: null } as any }),
  makeProject({ id: "g", name: "Golf", ci: { status: "failing", url: null, updatedAt: "" } as any }),
];

const sessionMap = new Map<string, SessionInfo[]>([
  ["c", [makeSession("s1", "c")]],
]);

describe("filterWorkspaceProjects", () => {
  test("all filter returns everything", () => {
    const result = filterWorkspaceProjects(projects, "all", "", sessionMap);
    expect(result).toHaveLength(7);
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

  test("uncommitted filter", () => {
    const result = filterWorkspaceProjects(projects, "uncommitted", "", sessionMap);
    expect(result.map((p) => p.id)).toEqual(["e"]);
  });

  test("behind_remote filter", () => {
    const result = filterWorkspaceProjects(projects, "behind_remote", "", sessionMap);
    expect(result.map((p) => p.id)).toEqual(["f"]);
  });

  test("failing_ci filter", () => {
    const result = filterWorkspaceProjects(projects, "failing_ci", "", sessionMap);
    expect(result.map((p) => p.id)).toEqual(["g"]);
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

describe("isPillFilter", () => {
  test("pill filters", () => {
    expect(isPillFilter("all")).toBe(true);
    expect(isPillFilter("has_prs")).toBe(true);
    expect(isPillFilter("active_agents")).toBe(true);
    expect(isPillFilter("stale")).toBe(true);
  });

  test("non-pill filters", () => {
    expect(isPillFilter("uncommitted")).toBe(false);
    expect(isPillFilter("behind_remote")).toBe(false);
    expect(isPillFilter("failing_ci")).toBe(false);
  });
});

describe("filterLabel", () => {
  test("returns human labels", () => {
    expect(filterLabel("uncommitted")).toBe("Uncommitted");
    expect(filterLabel("behind_remote")).toBe("Behind Remote");
    expect(filterLabel("failing_ci")).toBe("Failing CI");
  });
});
