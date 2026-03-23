import type { ToolCallInfo } from "../../store";

export interface WorkLogGroup {
  key: string;
  label: string;
  tools: ToolCallInfo[];
  allComplete: boolean;
  hasErrors: boolean;
}

type Category = { key: string; singular: string; plural: string };

const categories: [RegExp, Category][] = [
  [/^(read)$/i, { key: "read", singular: "Read 1 file", plural: "Read {n} files" }],
  [/^(edit|write)$/i, { key: "edit", singular: "Edited 1 file", plural: "Edited {n} files" }],
  [/^(bash)$/i, { key: "bash", singular: "Ran 1 command", plural: "Ran {n} commands" }],
  [/^(search|rg|find|fd)$/i, { key: "search", singular: "Searched once", plural: "Searched {n} times" }],
  [/^(todo)$/i, { key: "todo", singular: "Updated todos", plural: "Updated todos" }],
  [/^(question|questionnaire)$/i, { key: "ask", singular: "Asked 1 question", plural: "Asked {n} questions" }],
  [/^(subagent)$/i, { key: "subagent", singular: "Spawned 1 agent", plural: "Spawned {n} agents" }],
];

const otherCategory: Category = { key: "other", singular: "Used 1 tool", plural: "Used {n} tools" };

function categorize(name: string): Category {
  for (const [pattern, cat] of categories) {
    if (pattern.test(name)) return cat;
  }
  return otherCategory;
}

function makeLabel(cat: Category, count: number): string {
  if (count === 1) return cat.singular;
  return cat.plural.replace("{n}", String(count));
}

export function deriveWorkLog(toolCalls: ToolCallInfo[]): WorkLogGroup[] {
  if (toolCalls.length === 0) return [];

  const groups: WorkLogGroup[] = [];
  let current: { cat: Category; tools: ToolCallInfo[] } | null = null;

  for (const tc of toolCalls) {
    const cat = categorize(tc.name);
    if (current && current.cat.key === cat.key) {
      current.tools.push(tc);
    } else {
      if (current) {
        groups.push(finalize(current.cat, current.tools));
      }
      current = { cat, tools: [tc] };
    }
  }
  if (current) {
    groups.push(finalize(current.cat, current.tools));
  }

  return groups;
}

function finalize(cat: Category, tools: ToolCallInfo[]): WorkLogGroup {
  return {
    key: `${cat.key}-${tools[0].id}`,
    label: makeLabel(cat, tools.length),
    tools,
    allComplete: tools.every((t) => t.result !== undefined),
    hasErrors: tools.some((t) => t.isError === true),
  };
}
