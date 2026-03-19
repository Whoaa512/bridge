import type { Project } from "../core/types";
import { relativeTime } from "./time";

const DRAWER_ID = "bridge-drawer";

function getRoot(): HTMLElement {
  const el = document.getElementById("ui-root");
  if (!el) throw new Error("#ui-root not found");
  return el;
}

function injectStyle() {
  if (document.getElementById("bridge-drawer-css")) return;
  const style = document.createElement("style");
  style.id = "bridge-drawer-css";
  style.textContent = `
#${DRAWER_ID} {
  position: fixed;
  top: 0;
  right: 0;
  width: 360px;
  height: 100%;
  background: #161b22;
  border-left: 1px solid #30363d;
  padding: 20px;
  z-index: 100;
  transform: translateX(100%);
  transition: transform 0.2s ease-out;
  overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  color: #c9d1d9;
}
#${DRAWER_ID}.open { transform: translateX(0); }
#${DRAWER_ID} .close-btn {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  color: #8b949e;
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
  padding: 4px;
}
#${DRAWER_ID} .close-btn:hover { color: #c9d1d9; }
#${DRAWER_ID} h2 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  padding-right: 32px;
}
#${DRAWER_ID} .badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  margin-bottom: 12px;
}
#${DRAWER_ID} .path {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 12px;
  color: #8b949e;
  word-break: break-all;
  margin-bottom: 16px;
}
#${DRAWER_ID} .section {
  margin-bottom: 16px;
}
#${DRAWER_ID} .section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #8b949e;
  margin-bottom: 8px;
}
#${DRAWER_ID} .row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 3px 0;
}
#${DRAWER_ID} .row .label { color: #8b949e; }
#${DRAWER_ID} .row .value { color: #c9d1d9; }
#${DRAWER_ID} .row .value.warn { color: #d29922; }
#${DRAWER_ID} .error-item {
  font-size: 13px;
  padding: 6px 8px;
  background: #1c1118;
  border-left: 3px solid #f85149;
  border-radius: 4px;
  margin-bottom: 6px;
}
#${DRAWER_ID} .error-item .source {
  font-size: 11px;
  color: #f85149;
  margin-bottom: 2px;
}
#${DRAWER_ID} .error-item .msg { color: #c9d1d9; }
`;
  document.head.appendChild(style);
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  public: "#2ea043",
  internal: "#58a6ff",
  personal: "#d29922",
};

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function row(label: string, value: string, warn = false): HTMLElement {
  const r = el("div", "row");
  r.appendChild(el("span", "label", label));
  const v = el("span", warn ? "value warn" : "value", value);
  r.appendChild(v);
  return r;
}

function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const s = el("div", "section");
  s.appendChild(el("div", "section-title", title));
  children.forEach((c) => s.appendChild(c));
  return s;
}

function buildDrawerContent(project: Project): DocumentFragment {
  const frag = document.createDocumentFragment();

  const closeBtn = el("button", "close-btn", "×") as HTMLButtonElement;
  closeBtn.addEventListener("click", hideDrawer);
  frag.appendChild(closeBtn);

  frag.appendChild(el("h2", undefined, project.name));

  const badge = el("span", "badge", project.classification);
  badge.style.background = CLASSIFICATION_COLORS[project.classification] ?? "#8b949e";
  frag.appendChild(badge);

  frag.appendChild(el("div", "path", project.path));

  if (project.git) {
    const g = project.git;
    const rows: HTMLElement[] = [
      row("Branch", g.branch),
      row("Uncommitted", String(g.uncommitted), g.uncommitted > 0),
      row("Ahead / Behind", `${g.ahead} / ${g.behind}`),
    ];
    if (g.stashCount > 0) {
      rows.push(row("Stashes", String(g.stashCount)));
    }
    if (g.lastCommit) {
      rows.push(row("Last commit", relativeTime(g.lastCommit)));
    }
    frag.appendChild(section("Git", ...rows));
  }

  if (project.activity) {
    const a = project.activity;
    frag.appendChild(
      section(
        "Activity",
        row("Commits this week", String(a.commitsThisWeek)),
        row("Stale days", String(a.staleDays), a.staleDays > 14),
      ),
    );
  }

  if (project.size) {
    const sz = project.size;
    frag.appendChild(
      section(
        "Size",
        row("LOC", sz.loc.toLocaleString()),
        row("Files", sz.files.toLocaleString()),
        row("Deps", String(sz.deps)),
      ),
    );
  }

  if (project.errors.length > 0) {
    const items = project.errors.map((err) => {
      const item = el("div", "error-item");
      item.appendChild(el("div", "source", err.source));
      item.appendChild(el("div", "msg", err.message));
      return item;
    });
    frag.appendChild(section("Errors", ...items));
  }

  return frag;
}

export function showDrawer(project: Project) {
  injectStyle();
  let drawer = document.getElementById(DRAWER_ID);

  if (!drawer) {
    drawer = document.createElement("div");
    drawer.id = DRAWER_ID;
    getRoot().appendChild(drawer);
    requestAnimationFrame(() => drawer!.classList.add("open"));
  } else {
    drawer.innerHTML = "";
    drawer.classList.add("open");
  }

  drawer.appendChild(buildDrawerContent(project));
}

export function hideDrawer() {
  const drawer = document.getElementById(DRAWER_ID);
  if (!drawer) return;
  drawer.classList.remove("open");
  drawer.addEventListener("transitionend", () => drawer.remove(), { once: true });
}

export function isDrawerOpen(): boolean {
  return document.getElementById(DRAWER_ID)?.classList.contains("open") ?? false;
}
