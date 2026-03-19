function getRoot(): HTMLElement {
  const el = document.getElementById("ui-root");
  if (!el) throw new Error("#ui-root not found");
  return el;
}

function injectStyle(id: string, css: string) {
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

const LOADING_ID = "bridge-loading";
const EMPTY_ID = "bridge-empty";

const STATES_CSS = `
@keyframes bridge-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
#${LOADING_ID}, #${EMPTY_ID} {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}
#${LOADING_ID} .pulse {
  animation: bridge-pulse 2s ease-in-out infinite;
  color: #8b949e;
  font-size: 16px;
}
#${EMPTY_ID} .msg {
  color: #8b949e;
  font-size: 16px;
  line-height: 1.6;
}
#${EMPTY_ID} code {
  background: #21262d;
  padding: 2px 8px;
  border-radius: 4px;
  color: #58a6ff;
  font-size: 14px;
}
`;

export function showLoading() {
  injectStyle("bridge-states-css", STATES_CSS);
  if (document.getElementById(LOADING_ID)) return;
  const div = document.createElement("div");
  div.id = LOADING_ID;
  const p = document.createElement("p");
  p.className = "pulse";
  p.textContent = "Scanning colony…";
  div.appendChild(p);
  getRoot().appendChild(div);
}

export function hideLoading() {
  document.getElementById(LOADING_ID)?.remove();
}

export function showEmpty() {
  injectStyle("bridge-states-css", STATES_CSS);
  if (document.getElementById(EMPTY_ID)) return;
  const div = document.createElement("div");
  div.id = EMPTY_ID;
  const p = document.createElement("p");
  p.className = "msg";
  p.innerHTML = 'No projects found. Run <code>bridge scan</code> to discover your colony.';
  div.appendChild(p);
  getRoot().appendChild(div);
}

export function hideEmpty() {
  document.getElementById(EMPTY_ID)?.remove();
}
