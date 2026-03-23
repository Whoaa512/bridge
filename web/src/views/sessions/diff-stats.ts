import { diffLines } from "diff";

export interface DiffStat {
  additions: number;
  deletions: number;
}

export function parseDiffStat(
  toolName: string,
  argsJson: string,
): DiffStat | null {
  const name = toolName.toLowerCase();

  if (name === "edit") {
    return parseEditStat(argsJson);
  }
  if (name === "write") {
    return parseWriteStat(argsJson);
  }
  return null;
}

function parseEditStat(argsJson: string): DiffStat | null {
  try {
    const args = JSON.parse(argsJson);
    if (typeof args.oldText !== "string" || typeof args.newText !== "string") {
      return null;
    }
    const changes = diffLines(args.oldText, args.newText);
    let additions = 0;
    let deletions = 0;
    for (const c of changes) {
      const lines = countLines(c.value);
      if (c.added) additions += lines;
      else if (c.removed) deletions += lines;
    }
    return { additions, deletions };
  } catch {
    return null;
  }
}

function parseWriteStat(argsJson: string): DiffStat | null {
  try {
    const args = JSON.parse(argsJson);
    if (typeof args.content !== "string") return null;
    return { additions: countLines(args.content), deletions: 0 };
  } catch {
    return null;
  }
}

function countLines(s: string): number {
  if (s === "") return 0;
  const lines = s.split("\n");
  if (lines[lines.length - 1] === "") return lines.length - 1;
  return lines.length;
}
