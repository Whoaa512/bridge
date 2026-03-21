import type { Project } from "../../core/types";
import type { SessionInfo } from "../../agent/ws-types";
import type { WorkspaceFilter } from "./filter-utils";

export type AttentionSeverity = "info" | "warning" | "urgent";

export interface AttentionItem {
  message: string;
  severity: AttentionSeverity;
  filter?: WorkspaceFilter;
}

export function computeAttentionItems(projects: Project[], sessions?: Map<string, SessionInfo>): AttentionItem[] {
  const items: AttentionItem[] = [];

  const failingCI = projects.filter((p) => p.ci?.status === "failing" || p.ci?.status === "failed").length;
  if (failingCI > 0) {
    items.push({
      message: `${failingCI} project${failingCI > 1 ? "s" : ""} with failing CI`,
      severity: "urgent",
      filter: "failing_ci",
    });
  }

  const reviewPRs = projects.reduce((count, p) => {
    return count + p.prs.filter((pr) => pr.state === "open" && (pr.reviewStatus === "changes_requested" || pr.reviewStatus === "review_required")).length;
  }, 0);
  if (reviewPRs > 0) {
    items.push({
      message: `${reviewPRs} PR${reviewPRs > 1 ? "s" : ""} need review`,
      severity: "warning",
      filter: "has_prs",
    });
  }

  const uncommitted = projects.filter((p) => p.git && p.git.uncommitted > 0).length;
  if (uncommitted > 0) {
    items.push({
      message: `${uncommitted} project${uncommitted > 1 ? "s" : ""} with uncommitted changes`,
      severity: "warning",
      filter: "uncommitted",
    });
  }

  const behind = projects.filter((p) => p.git && p.git.behind > 0).length;
  if (behind > 0) {
    items.push({
      message: `${behind} project${behind > 1 ? "s" : ""} behind remote`,
      severity: "warning",
      filter: "behind_remote",
    });
  }

  const stale = projects.filter((p) => p.activity && p.activity.staleDays > 14).length;
  if (stale > 0) {
    items.push({
      message: `${stale} stale project${stale > 1 ? "s" : ""}`,
      severity: "info",
      filter: "stale",
    });
  }

  if (sessions) {
    const streaming = Array.from(sessions.values()).filter((s) => s.state === "streaming").length;
    if (streaming > 0) {
      items.push({
        message: `${streaming} agent${streaming > 1 ? "s" : ""} actively streaming`,
        severity: "info",
        filter: "active_agents",
      });
    }
  }

  return items;
}
