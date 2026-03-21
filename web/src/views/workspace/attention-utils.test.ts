import { describe, test, expect } from "bun:test";
import { computeAttentionItems } from "./attention-utils";
import type { Project } from "../../core/types";
import type { SessionInfo } from "../../agent/ws-types";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "test",
    path: "/test",
    name: "test",
    kind: "git_repo",
    classification: "personal",
    classificationSource: "default",
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

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: "s1",
    cwd: "/test",
    projectId: "test",
    model: "claude",
    state: "idle",
    ...overrides,
  };
}

describe("computeAttentionItems", () => {
  test("empty projects returns empty", () => {
    expect(computeAttentionItems([])).toEqual([]);
  });

  test("clean projects returns empty", () => {
    const items = computeAttentionItems([makeProject()]);
    expect(items).toEqual([]);
  });

  test("failing CI", () => {
    const projects = [
      makeProject({ ci: { status: "failing", url: null, updatedAt: "" } }),
      makeProject({ id: "p2", ci: { status: "failed", url: null, updatedAt: "" } }),
      makeProject({ id: "p3", ci: { status: "passing", url: null, updatedAt: "" } }),
    ];
    const items = computeAttentionItems(projects);
    const ci = items.find((i) => i.filter === "failing_ci");
    expect(ci).toBeDefined();
    expect(ci!.message).toBe("2 projects with failing CI");
    expect(ci!.severity).toBe("urgent");
  });

  test("PRs needing review includes both changes_requested and review_required", () => {
    const projects = [
      makeProject({
        prs: [
          { number: 1, title: "a", state: "open", reviewStatus: "changes_requested", url: "" },
          { number: 2, title: "b", state: "open", reviewStatus: "review_required", url: "" },
          { number: 3, title: "c", state: "closed", reviewStatus: "review_required", url: "" },
        ],
      }),
    ];
    const items = computeAttentionItems(projects);
    const pr = items.find((i) => i.filter === "has_prs");
    expect(pr).toBeDefined();
    expect(pr!.message).toBe("2 PRs need review");
    expect(pr!.severity).toBe("warning");
  });

  test("uncommitted changes", () => {
    const projects = [
      makeProject({ git: { branch: "main", branches: [], uncommitted: 3, ahead: 0, behind: 0, stashCount: 0, lastCommit: "", remoteUrl: null } }),
    ];
    const items = computeAttentionItems(projects);
    const uc = items.find((i) => i.filter === "uncommitted");
    expect(uc).toBeDefined();
    expect(uc!.message).toBe("1 project with uncommitted changes");
    expect(uc!.severity).toBe("warning");
  });

  test("behind remote", () => {
    const projects = [
      makeProject({ git: { branch: "main", branches: [], uncommitted: 0, ahead: 0, behind: 5, stashCount: 0, lastCommit: "", remoteUrl: null } }),
    ];
    const items = computeAttentionItems(projects);
    const br = items.find((i) => i.filter === "behind_remote");
    expect(br).toBeDefined();
    expect(br!.message).toBe("1 project behind remote");
    expect(br!.severity).toBe("warning");
  });

  test("stale projects", () => {
    const projects = [
      makeProject({ activity: { lastTouch: "", commitsThisWeek: 0, staleDays: 30 } }),
      makeProject({ id: "p2", activity: { lastTouch: "", commitsThisWeek: 0, staleDays: 5 } }),
    ];
    const items = computeAttentionItems(projects);
    const st = items.find((i) => i.filter === "stale");
    expect(st).toBeDefined();
    expect(st!.message).toBe("1 stale project");
    expect(st!.severity).toBe("info");
  });

  test("streaming sessions", () => {
    const sessions = new Map<string, SessionInfo>([
      ["s1", makeSession({ state: "streaming" })],
      ["s2", makeSession({ id: "s2", state: "streaming" })],
      ["s3", makeSession({ id: "s3", state: "idle" })],
    ]);
    const items = computeAttentionItems([], sessions);
    const ag = items.find((i) => i.filter === "active_agents");
    expect(ag).toBeDefined();
    expect(ag!.message).toBe("2 agents actively streaming");
    expect(ag!.severity).toBe("info");
  });

  test("no streaming sessions omits agent item", () => {
    const sessions = new Map<string, SessionInfo>([
      ["s1", makeSession({ state: "idle" })],
    ]);
    const items = computeAttentionItems([], sessions);
    expect(items.find((i) => i.filter === "active_agents")).toBeUndefined();
  });

  test("multiple item types together", () => {
    const projects = [
      makeProject({
        ci: { status: "failed", url: null, updatedAt: "" },
        git: { branch: "main", branches: [], uncommitted: 2, ahead: 0, behind: 3, stashCount: 0, lastCommit: "", remoteUrl: null },
        prs: [{ number: 1, title: "a", state: "open", reviewStatus: "review_required", url: "" }],
        activity: { lastTouch: "", commitsThisWeek: 0, staleDays: 20 },
      }),
    ];
    const sessions = new Map<string, SessionInfo>([
      ["s1", makeSession({ state: "streaming" })],
    ]);
    const items = computeAttentionItems(projects, sessions);
    expect(items.length).toBe(6);
    expect(items[0].severity).toBe("urgent");
    expect(items[0].filter).toBe("failing_ci");
  });
});
