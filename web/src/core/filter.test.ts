import { describe, expect, it } from "bun:test";
import { filterProjects, DEFAULT_FILTER } from "./filter";
import type { Project } from "./types";

function stub(overrides: Partial<Project> & Pick<Project, "id" | "kind">): Project {
  return {
    path: `/code/${overrides.id}`,
    name: overrides.id,
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

const projects: Project[] = [
  stub({ id: "mono", kind: "git_repo" }),
  stub({ id: "mono/pkg-a", kind: "monorepo_child" }),
  stub({ id: "mono/pkg-b", kind: "monorepo_child" }),
  stub({ id: "standalone", kind: "git_repo" }),
  stub({ id: "config-dir", kind: "directory" }),
];

describe("filterProjects", () => {
  it("filters out monorepo_child by default", () => {
    const result = filterProjects(projects, DEFAULT_FILTER);
    expect(result.map((p) => p.id)).toEqual(["mono", "standalone", "config-dir"]);
  });

  it("keeps all when showMonorepoChildren is true", () => {
    const result = filterProjects(projects, { showMonorepoChildren: true });
    expect(result).toEqual(projects);
  });

  it("returns empty for empty input", () => {
    expect(filterProjects([], DEFAULT_FILTER)).toEqual([]);
    expect(filterProjects([], { showMonorepoChildren: true })).toEqual([]);
  });

  it("only git_repo and directory kinds pass through when collapsed", () => {
    const result = filterProjects(projects, DEFAULT_FILTER);
    const kinds = new Set(result.map((p) => p.kind));
    expect(kinds.has("monorepo_child")).toBe(false);
    expect(kinds.has("git_repo")).toBe(true);
    expect(kinds.has("directory")).toBe(true);
  });
});
