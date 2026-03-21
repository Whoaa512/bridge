import type { View } from "./store";

const VIEW_PATHS: Record<View, string> = {
  sessions: "/",
  complexity: "/complexity",
  workspace: "/workspace",
  colony: "/colony",
};

const PATH_TO_VIEW = new Map(
  Object.entries(VIEW_PATHS).map(([v, p]) => [p, v as View]),
);

export function viewFromPath(pathname = window.location.pathname): View {
  return PATH_TO_VIEW.get(pathname) ?? "sessions";
}

export function pushView(view: View) {
  const path = VIEW_PATHS[view];
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
}
