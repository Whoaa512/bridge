import { diffLines } from "diff";

export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldNum?: number;
  newNum?: number;
}

export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const changes = diffLines(oldText, newText);
  const result: DiffLine[] = [];
  let oldNum = 1;
  let newNum = 1;

  for (const change of changes) {
    const lines = splitLines(change.value);

    if (change.added) {
      for (const line of lines) {
        result.push({ type: "add", content: line, newNum: newNum++ });
      }
    } else if (change.removed) {
      for (const line of lines) {
        result.push({ type: "remove", content: line, oldNum: oldNum++ });
      }
    } else {
      for (const line of lines) {
        result.push({
          type: "context",
          content: line,
          oldNum: oldNum++,
          newNum: newNum++,
        });
      }
    }
  }

  return result;
}

function splitLines(value: string): string[] {
  if (value === "") return [];
  const lines = value.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
