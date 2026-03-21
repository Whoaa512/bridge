import { describe, test, expect } from "bun:test";
import { filterWorkspaceProjects, sortWorkspaceProjects, isPillFilter, filterLabel } from "./filter-utils";
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

describe("sortWorkspaceProjects", () => {
  const sortProjects: Project[] = [
    makeProject({ id: "s1", name: "Zulu", activity: { staleDays: 2, lastTouch: "2025-01-10T00:00:00Z" } as any }),
    makeProject({ id: "s2", name: "Alpha", activity: { staleDays: 0, lastTouch: "2025-01-15T00:00:00Z" } as any }),
    makeProject({ id: "s3", name: "Mike", activity: null }),
    makeProject({ id: "s4", name: "Bravo", activity: { staleDays: 20, lastTouch: "2024-12-01T00:00:00Z" } as any }),
    makeProject({
      id: "s5", name: "Charlie",
      activity: { staleDays: 1, lastTouch: "2025-01-12T00:00:00Z" } as any,
      git: { branch: "main", branches: [], uncommitted: 3, ahead: 0, behind: 0, stashCount: 0, lastCommit: "", remoteUrl: null } as any,
    }),
    makeProject({
      id: "s6", name: "Delta",
      activity: { staleDays: 30, lastTouch: "2024-11-01T00:00:00Z" } as any,
      git: { branch: "main", branches: [], uncommitted: 7, ahead: 0, behind: 0, stashCount: 0, lastCommit: "", remoteUrl: null } as any,
    }),
  ];

  test("activity sort: non-stale by lastTouch desc, then stale, no-activity last within group", () => {
    const result = sortWorkspaceProjects(sortProjects, "activity");
    expect(result.map((p) => p.id)).toEqual(["s2", "s5", "s1", "s3", "s4", "s6"]);
  });

  test("name sort: non-stale alphabetical, then stale alphabetical", () => {
    const result = sortWorkspaceProjects(sortProjects, "name");
    expect(result.map((p) => p.id)).toEqual(["s2", "s5", "s3", "s1", "s4", "s6"]);
  });

  test("uncommitted sort: uncommitted first (within non-stale), then rest by activity, stale last", () => {
    const result = sortWorkspaceProjects(sortProjects, "uncommitted");
    expect(result.map((p) => p.id)).toEqual(["s5", "s2", "s1", "s3", "s6", "s4"]);
  });

  test("stale projects always sort after non-stale", () => {
    for (const sort of ["activity", "name", "uncommitted"] as const) {
      const result = sortWorkspaceProjects(sortProjects, sort);
      const staleIdx = result.findIndex((p) => (p.activity?.staleDays ?? 0) > 14);
      const nonStaleAfterStale = result.slice(staleIdx).some((p) => (p.activity?.staleDays ?? 0) <= 14);
      expect(nonStaleAfterStale).toBe(false);
    }
  });

  test("projects without activity sort to bottom of non-stale group in activity sort", () => {
    const result = sortWorkspaceProjects(sortProjects, "activity");
    const noActivity = result.find((p) => p.id === "s3")!;
    const lastNonStale = result.filter((p) => (p.activity?.staleDays ?? 0) <= 14).pop()!;
    expect(noActivity.id).toBe(lastNonStale.id);
  });
});
