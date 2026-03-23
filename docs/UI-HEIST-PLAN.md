# Bridge Sessions UI Heist Plan

> Steal t3code's polish. Keep our simplicity. Ship in 5 phases.

**Total estimate**: ~1,200 LOC across 5 phases, 1 new dependency (`diff`)

---

## 0. Design Foundations

### Design Tokens

Before touching any component, extract a shared tokens file AND do an upfront migration pass on all session components. Every existing component uses hardcoded hex colors scattered across inline styles. This is the foundation everything else builds on.

**New file**: `web/src/ui/tokens.ts`

```ts
export const colors = {
  bg:          "#0d1117",
  bgRaised:    "#161b22",
  bgOverlay:   "#21262d",
  border:      "#30363d",
  borderLight: "#21262d",

  text:        "#c9d1d9",
  textMuted:   "#8b949e",
  textFaint:   "#484f58",
  textLink:    "#58a6ff",

  accent:      "#1f6feb",
  accentHover: "#388bfd",
  success:     "#3fb950",
  warning:     "#d29922",
  error:       "#f85149",
  purple:      "#d2a8ff",

  userBubble:  "#1f6feb",
  streaming:   "#58a6ff",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const font = {
  mono: "'SF Mono', 'Fira Code', monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  sizeXs: 10,
  sizeSm: 11,
  sizeMd: 12,
  sizeLg: 13,
  sizeXl: 14,
  sizeTitle: 16,
} as const;

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
} as const;
```

**Upfront migration**: Replace all hardcoded hex values in session components with token references:
- `MessageBubble.tsx`, `ChatArea.tsx`, `Composer.tsx`, `ToolCallBlock.tsx`, `ExtensionDialog.tsx`, `SessionSidebar.tsx`, `SessionsView.tsx`

**Note**: `web/src/canvas/colors.ts` already has some of these for the canvas layer. Tokens is for React components only — canvas keeps its own color constants (different rendering context).

### Inline Styles Convention (Unchanged)

We keep inline styles per the existing pattern:
```ts
const styles: Record<string, React.CSSProperties> = { ... };
```
Tokens make this consistent without adding CSS-in-JS complexity.

---

## 1. Phase 1: Message Timeline Polish

> This is 60% of the perceived polish gap. Users stare at the message timeline. Fix it first.

### 1a. Work Log Grouping (~200 LOC)

**The problem**: Every tool call renders as a separate collapsible `ToolCallBlock`. A typical turn has 5-15 tool calls. The timeline is noisy.

**Our approach**: Pure function that groups consecutive tool calls by name pattern on the existing `ToolCallInfo[]` array:

```ts
// web/src/views/sessions/work-log.ts
interface WorkLogGroup {
  key: string;           // "read" | "edit" | "bash" | "search" | "other"
  label: string;         // "Read 3 files"
  tools: ToolCallInfo[];
  allComplete: boolean;
  hasErrors: boolean;
}

function deriveWorkLog(toolCalls: ToolCallInfo[]): WorkLogGroup[]
```

Category mapping (derived from pi's actual tool names):
| Pi tool name pattern | Group key | Label template |
|---|---|---|
| `read`, `Read` | read | "Read N files" |
| `edit`, `Edit`, `write`, `Write` | edit | "Edited N files" |
| `bash`, `Bash` | bash | "Ran N commands" |
| `search`, `Search`, `rg`, `find`, `fd` | search | "Searched N times" |
| `todo` | todo | "Updated todos" |
| `question`, `questionnaire` | ask | "Asked N questions" |
| Everything else | other | "Used N tools" |

Render: Single collapsed row `▸ ✓ Read 3 files · Edited 2 files (4.2s)`. Click expands to show all `ToolCallBlock`s within the group.

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/work-log.ts` | **New** — pure derivation + category map | ~80 |
| `web/src/views/sessions/work-log.test.ts` | **New** — test grouping logic | ~50 |
| `web/src/views/sessions/WorkLogBlock.tsx` | **New** — collapsed summary + expand toggle | ~50 |
| `web/src/views/sessions/MessageBubble.tsx` | **Modify** — replace inline toolCalls.map with WorkLogBlock | ~20 |

**Acceptance criteria**:
- [ ] Consecutive tool calls of the same category collapse into one line
- [ ] Collapsed line shows icon, summary text, count, completion status
- [ ] Click expands to show individual ToolCallBlocks
- [ ] Running tools show spinner in collapsed view
- [ ] Errors surface in collapsed view (red indicator)
- [ ] Falls back to individual ToolCallBlocks if only 1 tool call

### 1b. Turn Duration + Completion Dividers (~80 LOC)

**The problem**: No sense of pace. Can't tell where one turn ends and the next begins.

**Our approach**: Add `startedAt`/`completedAt` timestamps to `ChatMessage` in store. Set them from pi events in `main.tsx`. Render divider + duration between turns.

```ts
// Timestamp flow in main.tsx handlePiEventInner:
// agent_start → set startedAt on new assistant message
// agent_end → set completedAt on last assistant message
```

**Duration formatter**:
```ts
// web/src/views/sessions/format-duration.ts
function formatDuration(ms: number): string
// <1s: "500ms", <10s: "3.2s", <60s: "23s", else: "2m 14s"
```

**Turn divider**: Thin line with elapsed time badge between assistant end and next user message. Only shows after a completed turn (not mid-stream).

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/format-duration.ts` | **New** | ~15 |
| `web/src/views/sessions/format-duration.test.ts` | **New** | ~25 |
| `web/src/store.ts` | **Modify** — add `startedAt`/`completedAt` to ChatMessage | ~5 |
| `web/src/main.tsx` | **Modify** — set timestamps in event handler | ~10 |
| `web/src/views/sessions/MessageBubble.tsx` | **Modify** — render elapsed time | ~10 |
| `web/src/views/sessions/ChatArea.tsx` | **Modify** — render turn dividers between messages | ~15 |

**Acceptance criteria**:
- [ ] Each completed assistant message shows "12.4s" in muted text
- [ ] Thin divider line appears between completed turns
- [ ] No duration shown on streaming messages (just shows while streaming)
- [ ] Duration only appears after `agent_end` fires

### 1c. Scroll-to-Bottom Pill (~50 LOC)

**The problem**: User scrolls up to read earlier context → new messages arrive → no indication there's new content below.

**Our approach**: ChatArea already has `isNearBottom` ref. Promote to state, render floating pill.

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/ChatArea.tsx` | **Modify** — add pill state + floating button | ~50 |

**Acceptance criteria**:
- [ ] Pill appears when user scrolls >80px from bottom
- [ ] Pill disappears on click (scrolls to bottom) or when user manually scrolls to bottom
- [ ] Pill shows "↓ New messages" when messages arrive while scrolled up
- [ ] Pill is positioned bottom-center of the messages area

### 1d. Better Code Blocks — CSS Only (~60 LOC)

**The problem**: Code blocks are unstyled `<pre>` tags. No language label, no copy button.

**Our approach**: Custom `code` component passed to `<Markdown>` in MessageBubble. No syntax highlighting dependency — just clean styling:
- Fenced blocks: dark background, language label in top-right, copy button on hover
- Inline code: styled mono span with subtle background

Syntax highlighting can be added later (react-syntax-highlighter or shiki) if missed. For a personal tool where code blocks are glanced at, styling > highlighting.

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/MarkdownCode.tsx` | **New** — code block + inline code components | ~50 |
| `web/src/views/sessions/MessageBubble.tsx` | **Modify** — pass components prop to `<Markdown>` | ~10 |

**Acceptance criteria**:
- [ ] Fenced code blocks have dark bg, border, mono font
- [ ] Language label shown in corner of code block (if specified in fence)
- [ ] Copy button on hover for code blocks
- [ ] Inline code has mono font + subtle background
- [ ] No layout shift

### Phase 1 Totals

| Metric | Value |
|---|---|
| New files | 5 (work-log.ts, work-log.test.ts, WorkLogBlock.tsx, format-duration.ts, format-duration.test.ts, MarkdownCode.tsx) |
| Modified files | 4 (MessageBubble.tsx, ChatArea.tsx, store.ts, main.tsx) |
| Estimated LOC | ~390 |
| New deps | None |
| Backend changes | None |

---

## 2. Phase 2: Session Status + Error Handling

> Session lifecycle polish. Know what state you're in. See when things break.

### 2a. Session Phase Indicator (~60 LOC)

**The problem**: The header just shows "idle" / "streaming" / "compacting" as text. No visual hierarchy.

**Our approach**: Replace text badge with a styled indicator:
- **Idle/Ready**: gray dot
- **Streaming/Running**: blue pulsing dot + "Working…" text
- **Compacting**: yellow pulsing dot + "Compacting…"
- **Error**: red dot (when session has error)

Also: show the project name in the header (we have `session.projectId` → look up project name from spec).

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/ChatArea.tsx` | **Modify** — enhanced header with phase indicator + project name | ~40 |
| `web/src/views/sessions/SessionsView.tsx` | **Modify** — pass project name to ChatArea | ~10 |
| `web/src/store.ts` | **Modify** — add `sessionErrors: Map<string, string>` | ~10 |

**Acceptance criteria**:
- [ ] Colored dot replaces text state badge
- [ ] Dot pulses when streaming/compacting
- [ ] Project name shows in header (e.g. "bridge / claude-sonnet-4")
- [ ] Error state shows red dot

### 2b. Error Banner (~50 LOC)

**The problem**: Session errors (process crash, RPC failure) are only logged to console.

**Our approach**: Track session errors in store. Render dismissible red banner at top of chat area.

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/ErrorBanner.tsx` | **New** — dismissible red banner | ~35 |
| `web/src/views/sessions/ChatArea.tsx` | **Modify** — render ErrorBanner above messages | ~10 |
| `web/src/main.tsx` | **Modify** — populate sessionErrors from session_error/session_exit events | ~5 |

**Acceptance criteria**:
- [ ] Session errors show as red banner at top of chat
- [ ] Banner is dismissible (X button)
- [ ] Process crash (session_exit with non-zero code) shows "Session ended unexpectedly"
- [ ] Banner clears when starting a new turn

### 2c. Composer Polish (~30 LOC)

Small tweaks:
- Auto-focus textarea when switching sessions
- Show model name in placeholder: "Send to claude-sonnet-4…"
- Bump max textarea height from 200px → 300px
- Subtle blue left-border glow on textarea when session is streaming

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/Composer.tsx` | **Modify** | ~30 |

### Phase 2 Totals

| Metric | Value |
|---|---|
| New files | 1 (ErrorBanner.tsx) |
| Modified files | 4 (ChatArea.tsx, SessionsView.tsx, store.ts, main.tsx, Composer.tsx) |
| Estimated LOC | ~140 |
| New deps | None |
| Backend changes | None |

---

## 3. Phase 3: Sidebar + Keyboard Shortcuts

> These compound daily. Status dots let you glance. Shortcuts let you flow.

### 3a. Session Row Enhancement (~80 LOC)

**The problem**: Session rows show model name + state text. No topic, no relative time, no visual hierarchy.

**Our approach**:
- **Session topic**: Derive from first user message, truncated to 35 chars. Store in `sessionTopics: Map<string, string>`.
- **Session row shows**: topic (or "New session"), relative time since last activity, colored status dot (not text)
- **Active session**: left accent bar (2px blue border-left)
- **Streaming sessions**: pulsing dot animation

The topic derivation happens in `main.tsx` when we process user messages — check if it's the first user message for that session, extract first line, truncate.

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/SessionSidebar.tsx` | **Modify** — enhance SessionRow with topic, time, dot | ~50 |
| `web/src/store.ts` | **Modify** — add sessionTopics map + setter | ~15 |
| `web/src/main.tsx` | **Modify** — derive topic from first user message | ~15 |

**Acceptance criteria**:
- [ ] Session row shows topic instead of model name
- [ ] Relative time updates ("2m ago", "1h ago")
- [ ] Colored dot replaces state text
- [ ] Active session has left accent border
- [ ] Streaming dot pulses

### 3b. Session Context Menu (~40 LOC)

**The problem**: No way to manage sessions from sidebar (destroy, clear).

**Our approach**: Right-click context menu on session rows using existing `ContextMenu` component:
- Destroy session
- Clear messages
- Copy session ID

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/SessionSidebar.tsx` | **Modify** — add session-level context menu | ~40 |

**Acceptance criteria**:
- [ ] Right-click session row shows context menu
- [ ] "Destroy" sends session_destroy command
- [ ] "Clear messages" clears the message list

### 3c. Show More/Less for Long Project Lists (~30 LOC)

**The problem**: If many projects are focused, the sidebar is a long scroll.

**Our approach**: If >8 projects, show first 8 + "Show N more" toggle. Pinned projects always show.

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/SessionSidebar.tsx` | **Modify** | ~30 |

### 3d. Keyboard Shortcuts (~80 LOC)

**Key bindings**:
| Shortcut | Action |
|---|---|
| `⌘N` | New session in active/first project |
| `⌘[` / `⌘]` | Previous/next session |
| `⌘W` | Destroy active session |
| `Esc` (global) | Abort streaming session (already works) |
| `/` | Focus composer (when not in textarea) |

**Our approach**: Global keydown handler in `SessionsView.tsx`. Uses existing command helpers from `agent/commands.ts`. Hardcoded defaults only — no configurability.

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/SessionsView.tsx` | **Modify** — expand keyboard handler | ~60 |
| `web/src/views/sessions/Composer.tsx` | **Modify** — expose focus ref for `/` shortcut | ~10 |
| `web/src/store.ts` | **Modify** — add helper to get prev/next session ID | ~10 |

**Acceptance criteria**:
- [ ] All shortcuts work as documented
- [ ] Shortcuts don't fire when typing in textarea/input
- [ ] `⌘N` auto-selects the new session
- [ ] `⌘W` selects next session after destroy

### Phase 3 Totals

| Metric | Value |
|---|---|
| New files | 0 |
| Modified files | 4 (SessionSidebar.tsx, SessionsView.tsx, Composer.tsx, store.ts, main.tsx) |
| Estimated LOC | ~230 |
| New deps | None |
| Backend changes | None |

---

## 4. Phase 4: Diff Preview

> Nice to have, not blocking daily use. But file changes are the primary output of agent sessions.

### 4a. Diff Stats on Tool Calls (~60 LOC)

**The problem**: Edit/write tool calls show raw args but no summary of what changed.

**Our approach**: Parse the `args` JSON of edit/write tool calls to extract `oldText`/`newText`. Count line differences. Show inline badge on ToolCallBlock header.

```ts
// web/src/views/sessions/diff-stats.ts
interface DiffStat { additions: number; deletions: number; }
function parseDiffStat(toolName: string, argsJson: string): DiffStat | null
```

For `edit` tool: `oldText` lines vs `newText` lines. For `write` tool: all lines are additions. For `bash`/`read`: null (no diff).

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/diff-stats.ts` | **New** — parse tool args for diff stats | ~30 |
| `web/src/views/sessions/diff-stats.test.ts` | **New** | ~20 |
| `web/src/views/sessions/ToolCallBlock.tsx` | **Modify** — show diff stat badge on header | ~10 |

**Acceptance criteria**:
- [ ] Edit tool calls show `+3 / -1` badge
- [ ] Write tool calls show `+N` (all additions)
- [ ] Badge only appears when stats are non-zero
- [ ] Works with the tool args format pi actually emits

### 4b. Simple Inline Diff View (~150 LOC, 1 new dep)

**The problem**: To see what an edit did, you have to expand the tool call and mentally diff oldText/newText.

**Our approach**: When you expand an edit tool call, show a unified diff view. Uses `diff` npm package (~2KB gzipped) for reliable line-level diffing. Colored `<pre>` with green lines (additions) and red lines (deletions).

**New dep**: `diff` — battle-tested, tiny, no transitive deps.

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/SimpleDiff.tsx` | **New** — unified diff renderer | ~80 |
| `web/src/views/sessions/simple-diff.ts` | **New** — wrapper around `diff` package | ~30 |
| `web/src/views/sessions/simple-diff.test.ts` | **New** | ~30 |
| `web/src/views/sessions/ToolCallBlock.tsx` | **Modify** — toggle diff view for edit tools | ~10 |

**Acceptance criteria**:
- [ ] Edit tool calls have a "Show diff" toggle
- [ ] Diff view shows additions in green, deletions in red
- [ ] Line numbers on both sides
- [ ] File path shown at top of diff
- [ ] Falls back to raw text display if diff can't be computed
- [ ] No layout jump when toggling

### Phase 4 Totals

| Metric | Value |
|---|---|
| New files | 5 (diff-stats.ts, diff-stats.test.ts, SimpleDiff.tsx, simple-diff.ts, simple-diff.test.ts) |
| Modified files | 1 (ToolCallBlock.tsx) |
| Estimated LOC | ~210 |
| New deps | `diff` (~2KB) |
| Backend changes | None |

---

## 5. Phase 5: Message Copy + Working Indicator

> Final polish. Small wins that add up.

### 5a. Message Copy Button (~40 LOC)

**Our approach**: Hover state on assistant message → show copy icon in top-right. Uses `navigator.clipboard.writeText()`. Show "✓" for 2s after copy.

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/MessageBubble.tsx` | **Modify** — add hover + copy button | ~40 |

### 5b. Working/Thinking Indicator (~30 LOC)

**The problem**: "Thinking…" italic text is too subtle.

**Our approach**: Replace with animated 3-dot indicator (`· · ·` that pulses). Add thin animated bar at top of ChatArea when session is streaming.

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/MessageBubble.tsx` | **Modify** — animated thinking dots | ~15 |
| `web/src/views/sessions/ChatArea.tsx` | **Modify** — thin progress bar at top | ~15 |

### 5c. Session Title in Sidebar Header (~30 LOC)

**What**: When a session is active, show its topic in the chat area header as the primary text (instead of just model name).

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/ChatArea.tsx` | **Modify** | ~30 |

### Phase 5 Totals

| Metric | Value |
|---|---|
| New files | 0 |
| Modified files | 2 (MessageBubble.tsx, ChatArea.tsx) |
| Estimated LOC | ~100 |
| New deps | None |
| Backend changes | None |

---

## Architecture Decisions

### A1. Pi Events → Timeline Entries (The Translation Layer)

**Decision**: We do NOT build an activity abstraction layer. We derive everything from the existing `ChatMessage` + `ToolCallInfo` model in the zustand store.

**Why**: Our event flow is already simple:

```
pi process → JSON lines → Go server → WebSocket → main.tsx handlePiEvent → store
```

The store already has:
- `ChatMessage` with `toolCalls: ToolCallInfo[]` — this is our "activity" for work log grouping
- `isStreaming` flag on messages — this is our turn lifecycle
- `startedAt`/`completedAt` timestamps (added in Phase 1b) — this is our duration

Our tool calls live ON the assistant message. This is simpler than t3code's interleaved activity model and good enough.

**Risk**: If pi later adds events that don't map to messages (e.g., background file watchers, extension notifications), we'd need to reconsider.

### A2. Extension UI — Modal for All Interactive Requests

**Decision**: Keep the existing ExtensionDialog modal for all interactive `extension_ui_request` types (`select`, `confirm`, `input`, `notify`). No inline approval panel.

**Why**: 
- The `question` and `questionnaire` tools surface as `select` extension_ui_requests — the modal handles these well
- We don't use tool approval flows (pi's `confirm` for tool execution)
- The modal works for all cases without needing fragile title-based heuristics to route between inline vs modal
- If we want inline treatment later, it's a straightforward refactor (the store shape supports it)

### A3. No Backend Changes for Diff

**Decision**: Skip backend changes entirely. Compute diffs client-side from tool call args (`oldText`/`newText`) using the `diff` npm package.

**Why**: The edit tool args already contain both texts. A backend `git diff` would show cumulative changes across a turn but costs a new Go endpoint + subprocess per request. Not worth it. The `diff` package is ~2KB and battle-tested.

### A4. No Virtualization

**Decision**: Don't virtualize the message list.

**Why**: Bridge sessions are short-lived agent runs, not 1000-message chat histories. If a session has >100 messages, something is wrong with the task decomposition, not the UI.

**Cost of being wrong**: Adding `@tanstack/react-virtual` is ~100 LOC. The existing scroll structure is already virtualizer-friendly.

### A5. CSS-Only Code Blocks (No Syntax Highlighting Dep)

**Decision**: Style code blocks with dark background, mono font, border, language label, and copy button. No syntax highlighting library.

**Why**:
- This is a personal tool where code blocks are glanced at, not studied
- Saves ~30KB+ of bundle (react-syntax-highlighter/PrismLight) or ~300KB+ (shiki/WASM)
- Copy button and language label provide the actual utility
- Can add `react-syntax-highlighter` or `shiki` later if missed — the `MarkdownCode.tsx` component is the right seam

### A6. One New Dependency Only

**Decision**: `diff` is the only new dep across all 5 phases (~2KB gzipped, no transitive deps).

**Rejected alternatives**:
- `react-syntax-highlighter` — deferred, CSS-only code blocks suffice
- `shiki` — heavier (WASM), complex setup
- `lucide-react` — would add for 3-4 icons, not worth the dep
- `@tanstack/react-virtual` — not needed for our message counts
- `dnd-kit` — sidebar reorder is rare use case

---

## Summary Table

| Phase | Focus | LOC | New Files | Deps | Backend |
|---|---|---|---|---|---|
| **0** | Design tokens + migration | ~50 | 1 | None | None |
| **1** | Message Timeline | ~390 | 6 | None | None |
| **2** | Session Status + Errors | ~140 | 1 | None | None |
| **3** | Sidebar + Shortcuts | ~230 | 0 | None | None |
| **4** | Diff Preview | ~210 | 5 | `diff` (~2KB) | None |
| **5** | Copy + Polish | ~100 | 0 | None | None |
| **Total** | | **~1,120** | **13** | **1** | **None** |

---

## The Cut List

Everything we're explicitly NOT doing, and why:

| Feature | Why Not |
|---|---|
| **Inline approval panel** | We don't use tool approvals. Modal works fine for question/questionnaire. Add later if needed. |
| **Syntax highlighting** (react-syntax-highlighter, shiki) | CSS-only code blocks with copy button cover 80%. Dep adds 30-300KB for marginal benefit in personal tool. |
| **Virtualized timeline** (`@tanstack/react-virtual`) | Sessions are <100 messages. Adds ~300 LOC + dep for no user-visible benefit. |
| **DnD sidebar reorder** (`dnd-kit`) | Keyboard shortcuts (⌘[/]) cover session switching. Dep + 200 LOC for rare use case. |
| **@mentions autocomplete** | Pi RPC doesn't support @file references in messages. |
| **`/commands` palette** | Pi's commands go through `sendCommand()`. Palette adds discovery but not capability. |
| **Plan sidebar** | Pi has no plan mode protocol. Nothing to render. |
| **Terminal drawer** | Would need Go backend to spawn/manage terminals. Out of bounds. |
| **Image attachments** | Pi RPC doesn't support image input. |
| **Branch toolbar / git actions** | Commit/push/branch from UI is a separate feature track. |
| **Provider/model picker in composer** | Pi model is set at session creation. Low priority. |
| **Full diff panel** (side panel + file tree) | ~500+ LOC + backend git diff endpoint. Phase 4's SimpleDiff covers 80%. |
| **Configurable keybindings** | Hardcoded is fine for personal tool. |
| **CSS files / CSS-in-JS** | Inline styles work. Tokens give consistency. |
| **Icon library** (lucide, heroicons) | Unicode characters + text suffice for ~5 icons. |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tool name heuristics don't match pi's actual names | Medium | Work log groups are wrong | Category map is data, not code. Easy to update. "other" catch-all. |
| `diff` package output doesn't look good for large edits | Low | Diff view is noisy | Falls back to raw text. Can cap diff size and show "large edit" summary. |
| Phase 1a (work log) changes break existing tool call display | Low | Regression | Falls back to individual ToolCallBlocks when only 1 tool. |
| Users accumulate >200 messages in a session | Low | Scroll perf degrades | `will-change: transform` on scroll container. Add virtualization later if needed. |
| Extension UI for questionnaire doesn't surface well in modal | Low | UX feels clunky for multi-question | Modal handles select fine. Can revisit with custom questionnaire renderer if needed. |

---

## File Impact Summary

Files modified across multiple phases (hotspots):

| File | Phases | Total estimated changes |
|---|---|---|
| `web/src/views/sessions/MessageBubble.tsx` | 1a, 1b, 1d, 5a, 5b | ~95 LOC across phases |
| `web/src/views/sessions/ChatArea.tsx` | 1b, 1c, 2a, 2b, 5b, 5c | ~140 LOC across phases |
| `web/src/store.ts` | 1b, 2a, 3a, 3d | ~40 LOC across phases |
| `web/src/main.tsx` | 1b, 2b, 3a | ~30 LOC across phases |
| `web/src/views/sessions/Composer.tsx` | 2c, 3d | ~40 LOC across phases |
| `web/src/views/sessions/SessionSidebar.tsx` | 3a, 3b, 3c | ~120 LOC across phases |
| `web/src/views/sessions/ToolCallBlock.tsx` | 4a, 4b | ~20 LOC across phases |

**MessageBubble.tsx** is the most-touched file. Consider splitting after Phase 1 (e.g., separate `AssistantMessage.tsx` and `UserMessage.tsx`) if it exceeds ~200 LOC.
