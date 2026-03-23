# Bridge Sessions UI Heist Plan

> Steal t3code's polish. Keep our simplicity. Ship in 5 phases.

**Total estimate**: ~1,360 LOC across 5 phases, 1 new dependency (react-syntax-highlighter)

---

## 0. Design Foundations

### Design Tokens

Before touching any component, extract a shared tokens file. Every existing component uses hardcoded hex colors scattered across inline styles. This is the foundation everything else builds on.

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

**Migration pattern**: Don't refactor all existing components at once. Each phase uses tokens in new/modified code. Existing components get migrated as they're touched.

**Note**: `web/src/canvas/colors.ts` already has some of these for the canvas layer. Tokens is for React components only — canvas keeps its own color constants (different rendering context).

### Inline Styles Convention (Unchanged)

We keep inline styles per the existing pattern:
```ts
const styles: Record<string, React.CSSProperties> = { ... };
```
Tokens make this consistent without adding CSS-in-JS complexity.

---

## 1. Phase 1: Message Timeline Polish (Week 1-2)

> This is 60% of the perceived polish gap. Users stare at the message timeline. Fix it first.

### 1a. Work Log Grouping (~200 LOC)

**The problem**: Every tool call renders as a separate collapsible `ToolCallBlock`. A typical turn has 5-15 tool calls. The timeline is noisy.

**t3code reference**: `apps/web/src/session-logic.ts` has `WorkLogEntry`, `deriveTimelineEntries()`, and a collapse system using `collapseKey` + `DerivedWorkLogEntry`. Their `MessagesTimeline.tsx` (912 LOC) renders collapsed groups with `MAX_VISIBLE_WORK_LOG_ENTRIES = 6`.

**What we adapt**: The idea of grouping tool calls into summary lines. NOT the `OrchestrationThreadActivity` abstraction, NOT the `collapseKey` system (requires activity model we don't have), NOT the virtualizer.

**Our approach**: Pure function that groups tool calls by name pattern on the existing `ToolCallInfo[]` array:

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

Category mapping (derived from pi's actual tool names in `agent/types.ts`):
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

**What to skip from t3code**: `collapseKey` system, `toDerivedWorkLogEntry()`, `OrchestrationThreadActivity` type mapping, activity ordering by `createdAt`. We don't need inter-message work log entries — our tool calls live on the message that spawned them.

**Acceptance criteria**:
- [ ] Consecutive tool calls of the same category collapse into one line
- [ ] Collapsed line shows icon, summary text, count, completion status
- [ ] Click expands to show individual ToolCallBlocks
- [ ] Running tools show spinner in collapsed view
- [ ] Errors surface in collapsed view (red indicator)
- [ ] Falls back to individual ToolCallBlocks if only 1 tool call

### 1b. Turn Duration + Completion Dividers (~80 LOC)

**The problem**: No sense of pace. Can't tell where one turn ends and the next begins.

**t3code reference**: `MessagesTimeline.logic.ts` has `computeMessageDurationStart()` which pairs user→assistant messages to compute spans. `session-logic.ts` has `formatDuration()` and `formatElapsed()`.

**What we adapt**: The duration display and the concept of turn dividers.

**Our approach**: Add `startedAt`/`completedAt` timestamps to `ChatMessage` in store. Set them from pi events in `main.tsx`. Render divider + duration between turns.

```ts
// Timestamp flow in main.tsx handlePiEventInner:
// agent_start → set startedAt on new assistant message
// agent_end → set completedAt on last assistant message
```

**Duration formatter** (adapted from t3code's `formatDuration`):
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

**t3code reference**: `ChatView.tsx` has `showScrollToBottom` state + `isScrollContainerNearBottom()`.

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

### 1d. Better Markdown / Code Blocks (~100 LOC, 1 new dep)

**The problem**: Code blocks are unstyled `<pre>` tags. No syntax highlighting, no language label, no copy button.

**t3code reference**: `ChatMarkdown.tsx` uses a custom markdown renderer. We just need code blocks.

**New dep**: `react-syntax-highlighter` + `@types/react-syntax-highlighter`. Using `PrismLight` with only the languages we need (ts, js, go, python, bash, json, yaml, diff) to keep bundle small.

**Our approach**: Custom `code` component passed to `<Markdown>` in MessageBubble:
- Inline code: styled mono span with subtle background
- Fenced blocks: syntax highlighting, language label in top-right, copy button

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/MarkdownCode.tsx` | **New** — code block + inline code components | ~80 |
| `web/src/views/sessions/MessageBubble.tsx` | **Modify** — pass components prop to `<Markdown>` | ~10 |
| `web/package.json` | **Modify** — add react-syntax-highlighter | ~2 |

**Acceptance criteria**:
- [ ] Fenced code blocks have syntax highlighting with a dark theme
- [ ] Language label shown in corner of code block (if specified)
- [ ] Copy button on hover for code blocks
- [ ] Inline code has mono font + subtle background
- [ ] No flash/layout shift when highlighting loads

### Phase 1 Totals

| Metric | Value |
|---|---|
| New files | 5 (work-log.ts, work-log.test.ts, WorkLogBlock.tsx, format-duration.ts, format-duration.test.ts, MarkdownCode.tsx) |
| Modified files | 4 (MessageBubble.tsx, ChatArea.tsx, store.ts, main.tsx) |
| Estimated LOC | ~430 |
| New deps | react-syntax-highlighter |
| Backend changes | None |

---

## 2. Phase 2: Composer + Approval UI (Week 2-3)

> Unblocks real daily use. The approval flow is a functional gap, not just polish.

### 2a. Inline Approval Panel (~120 LOC)

**The problem**: When pi needs tool approval, we show a modal dialog (ExtensionDialog.tsx). This is jarring — it blocks the entire UI. t3code shows approvals inline above the composer.

**t3code reference**:
- `ComposerPendingApprovalPanel.tsx` (31 LOC) — renders "PENDING APPROVAL" with summary text
- `ComposerPendingApprovalActions.tsx` (55 LOC) — Approve/Decline/Always Allow buttons

**The mapping challenge** (code-critic flagged this): Pi's `extension_ui_request` with `method: "confirm"` is the closest to t3code's approval flow, but it's more generic. We need to detect which confirms are "tool approvals" vs generic confirms.

**Heuristic**: If the confirm request title contains "approve", "permission", "allow", or "execute", treat it as an inline approval. Otherwise use the existing modal. This is an 80/20 bet — we can refine the heuristic later.

**Our approach**: New `ApprovalPanel` component rendered above the Composer textarea. Uses the existing `extensionUIRequest` store state but renders inline instead of as a modal.

```ts
// Detection in main.tsx onExtensionUIRequest handler:
const isApproval = request.method === "confirm" && looksLikeApproval(request.title);
if (isApproval) {
  store.setInlineApproval({ sessionId, request });
} else {
  store.setExtensionUIRequest({ sessionId, request });
}
```

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/ApprovalPanel.tsx` | **New** — inline panel with Approve/Decline buttons | ~80 |
| `web/src/store.ts` | **Modify** — add `inlineApproval` state (same shape as extensionUIRequest) | ~10 |
| `web/src/views/sessions/Composer.tsx` | **Modify** — render ApprovalPanel above textarea | ~10 |
| `web/src/main.tsx` | **Modify** — route confirm requests to inline vs modal | ~20 |

**What to skip**: t3code's "Always allow this session" / "Cancel turn" actions. Pi's confirm only supports true/false response. We can only do Approve (true) / Decline (false). If pi adds richer approval semantics later, we extend.

**Acceptance criteria**:
- [ ] Tool approval requests appear inline above composer, not as modal
- [ ] Shows what tool is requesting approval and why
- [ ] Approve/Decline buttons work (send extension_ui_response)
- [ ] Panel dismisses after response
- [ ] Non-approval confirms still use the existing modal dialog
- [ ] Keyboard: Enter to approve, Esc to decline (when panel is focused)

### 2b. Session Phase Indicator (~60 LOC)

**The problem**: The header just shows "idle" / "streaming" / "compacting" as text. No visual hierarchy.

**t3code reference**: `derivePhase()` in session-logic.ts maps session status to "disconnected" / "connecting" / "ready" / "running".

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

### 2c. Error Banner (~50 LOC)

**The problem**: Session errors (process crash, RPC failure) are only logged to console.

**t3code reference**: `ThreadErrorBanner.tsx` (35 LOC) — red dismissible alert.

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

### 2d. Composer Polish (~30 LOC)

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
| New files | 2 (ApprovalPanel.tsx, ErrorBanner.tsx) |
| Modified files | 5 (Composer.tsx, ChatArea.tsx, SessionsView.tsx, store.ts, main.tsx) |
| Estimated LOC | ~260 |
| New deps | None |
| Backend changes | None |

---

## 3. Phase 3: Sidebar + Keyboard Shortcuts (Week 3-4)

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

**t3code reference**: They have configurable keybindings + command palette. We skip configurability — hardcoded defaults only.

**Our approach**: Global keydown handler in `SessionsView.tsx`. Uses existing command helpers from `agent/commands.ts`.

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

## 4. Phase 4: Diff Preview (Week 4-5)

> Nice to have, not blocking daily use. But file changes are the primary output of agent sessions.

### 4a. Diff Stats on Tool Calls (~60 LOC)

**The problem**: Edit/write tool calls show raw args but no summary of what changed.

**t3code reference**: `DiffStatLabel.tsx` (22 LOC) — renders `+3 / -1` with colored text.

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

### 4b. Simple Inline Diff View (~200 LOC)

**The problem**: To see what an edit did, you have to expand the tool call and mentally diff oldText/newText.

**t3code reference**: `DiffPanel.tsx` + `DiffPanelShell.tsx` + `@pierre/diffs` — full side-by-side diff panel with file tree. Way too complex for us.

**Our approach**: When you expand an edit tool call, show a simple unified diff view. Colored `<pre>` with green lines (additions) and red lines (deletions). Compute diff client-side from `oldText`/`newText` in the tool args.

**No new deps** — implement a minimal line-level diff (longest common subsequence or just split-and-compare). This is NOT a full diff algorithm — it handles the simple case of `edit` tool calls where we have both texts.

If this proves too naive, we can add `diff` npm package (~2KB) later. But try without first.

**Files**:
| File | Action | LOC |
|---|---|---|
| `web/src/views/sessions/SimpleDiff.tsx` | **New** — unified diff renderer | ~100 |
| `web/src/views/sessions/simple-diff.ts` | **New** — minimal line diff algorithm | ~60 |
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
| Estimated LOC | ~260 |
| New deps | None |
| Backend changes | None |

---

## 5. Phase 5: Message Copy + Working Indicator (Week 5+)

> Final polish. These are small wins that add up.

### 5a. Message Copy Button (~40 LOC)

**t3code reference**: `MessageCopyButton.tsx` (20 LOC) — uses lucide icons + clipboard hook.

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

**Problem**: t3code derives its timeline from `OrchestrationThreadActivity[]` — a rich abstraction with `kind`, `createdAt`, `completedAt`, tool lifecycle tracking, etc. Bridge gets raw `AgentEvent` from pi over WebSocket.

**Decision**: We do NOT build an activity abstraction layer. We derive everything from the existing `ChatMessage` + `ToolCallInfo` model in the zustand store.

**Why**: Our event flow is already simple:

```
pi process → JSON lines → Go server → WebSocket → main.tsx handlePiEvent → store
```

The store already has:
- `ChatMessage` with `toolCalls: ToolCallInfo[]` — this is our "activity" for work log grouping
- `isStreaming` flag on messages — this is our turn lifecycle
- `startedAt`/`completedAt` timestamps (added in Phase 1b) — this is our duration

t3code needs the activity abstraction because they interleave tool activities between messages in the timeline. We don't — our tool calls live ON the assistant message. This is simpler and good enough.

**Risk**: If pi later adds events that don't map to messages (e.g., background file watchers, extension notifications), we'd need to reconsider. But that's a bridge we cross when we come to it.

### A2. Approval Flow Mapping

**Problem**: Pi's `extension_ui_request` with `method: "confirm"` is generic. t3code has a typed `PendingApproval` with `requestKind: "command" | "file-read" | "file-change"`.

**Decision**: Use title-based heuristic to detect approval-like confirms. Route to inline panel vs modal.

**Mapping**:
```
Pi extension_ui_request (method: "confirm") → check title heuristic → ApprovalPanel (inline)
Pi extension_ui_request (method: "select")  → ExtensionDialog (modal)
Pi extension_ui_request (method: "input")   → ExtensionDialog (modal)
Pi extension_ui_request (method: "notify")  → ExtensionDialog (modal, auto-dismiss)
```

**Why not always inline?** Select with 10 options doesn't work inline above the composer. Input fields need focus management that conflicts with the composer textarea. Modals are fine for these.

**Evolution**: If pi adds explicit `method: "approve"` or richer approval metadata, we can tighten this mapping without architectural changes.

### A3. No Backend Changes for Diff

**Problem**: Code-critic flagged that a proper diff panel would need the Go backend to compute `git diff` per turn.

**Decision**: Skip backend changes entirely. Compute diffs client-side from tool call args (`oldText`/`newText`).

**Why**: The edit tool args already contain both texts. We can diff them in the browser. A backend `git diff` would show cumulative changes across a turn (multiple edits to the same file), which is nicer but costs:
- New Go endpoint
- Git subprocess per request
- Caching layer for turn boundaries

Not worth it for Phase 4. If we ever want a full diff panel (Phase 9 from POLISH-PLAN.md), that's when we'd add backend support.

### A4. No Virtualization

**Decision**: Don't virtualize the message list. Ever (for now).

**Why**: Bridge sessions are short-lived agent runs, not 1000-message chat histories. If a session has >100 messages, something is wrong with the task decomposition, not the UI.

**Cost of being wrong**: If we're wrong, adding `@tanstack/react-virtual` is ~100 LOC of changes to ChatArea. The existing scroll + message rendering structure is already virtualizer-friendly (flat list, no interleaved layout).

### A5. One New Dependency Only

**Decision**: `react-syntax-highlighter` is the only new dep across all 5 phases.

**Why**:
- `react-markdown` already in bundle — syntax highlighting is the natural complement
- We use `PrismLight` with explicit language imports to keep bundle small (~30KB gzipped vs 200KB for full Prism)
- Everything else (diff computation, duration formatting, work log grouping) is small enough to hand-write

**Rejected alternatives**:
- `rehype-highlight` (requires hljs, heavier integration with react-markdown pipeline)
- `shiki` (better highlighting but needs WASM, complex setup)
- `lucide-react` for icons (t3code uses this — but we'd add it for 3-4 icons, not worth the dep)

---

## Summary Table

| Phase | Focus | LOC | New Files | Deps | Backend |
|---|---|---|---|---|---|
| **1** | Message Timeline | ~430 | 6 | react-syntax-highlighter | None |
| **2** | Composer + Approval | ~260 | 2 | None | None |
| **3** | Sidebar + Shortcuts | ~230 | 0 | None | None |
| **4** | Diff Preview | ~260 | 5 | None | None |
| **5** | Copy + Polish | ~100 | 0 | None | None |
| **Total** | | **~1,280** | **13** | **1** | **None** |

---

## The Cut List

Everything we're explicitly NOT doing, and why:

| Feature | Why Not |
|---|---|
| **Virtualized timeline** (`@tanstack/react-virtual`) | Sessions are <100 messages. Adds ~300 LOC + dep for no user-visible benefit. Add later if proven wrong. |
| **DnD sidebar reorder** (`dnd-kit`) | Nice for 20+ projects, but keyboard shortcuts (⌘[/]) cover session switching. Dep + 200 LOC for rare use case. |
| **@mentions autocomplete** | Pi RPC doesn't support @file references in messages. No protocol to target. |
| **`/commands` palette** | Pi's commands go through `sendCommand()`. A palette UI adds discovery but not capability. Defer. |
| **Plan sidebar** (`ProposedPlanCard`) | Pi has no plan mode protocol. t3code's plan cards come from their orchestration layer. Nothing to render. |
| **Terminal drawer** (`ThreadTerminalDrawer`) | Would need Go backend to spawn/manage terminal processes. Large scope. Out of bounds. |
| **Image attachments** (`ExpandedImagePreview`) | Pi RPC doesn't support image input. No protocol support. |
| **Branch toolbar / git actions** | Bridge scanner already tracks git state. But commit/push/branch from UI is a separate feature track. |
| **Provider/model picker in composer** | Pi model is set at session creation. Changing mid-session is possible via `set_model` command but low priority. |
| **Full diff panel** (side panel + file tree) | Requires backend git diff endpoint, file tree state management, panel layout. ~500+ LOC. Phase 4's SimpleDiff covers 80%. |
| **Configurable keybindings** | Hardcoded is fine for personal tool. Add config if Bridge is ever shared. |
| **CSS files / CSS-in-JS** | Inline styles work. Tokens file gives consistency. No build step changes needed. |
| **Icon library** (lucide, heroicons) | Would add for 5-6 icons total. Unicode characters + text suffice. |
| **Completion divider with summary** (t3code shows "Completed in 12s · 3 files changed") | Nice but requires aggregating turn-level stats we don't track yet. Just show the time divider for now. |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tool name heuristics don't match pi's actual names | Medium | Work log groups are wrong | Category map is data, not code. Easy to update. Add "other" catch-all. |
| Approval title heuristic misclassifies | Medium | Wrong UI for some confirms | Falls back to modal (existing behavior). Users see it, just in wrong spot. |
| react-syntax-highlighter bundle too large | Low | Slow initial load | Use PrismLight + explicit lang imports. Can swap to rehype-highlight if needed. |
| Client-side diff too naive for large edits | Medium | Diff view looks wrong | Falls back to raw text display. Can add `diff` npm package (~2KB) as escape hatch. |
| Phase 1a (work log) changes break existing tool call display | Low | Regression | WorkLogBlock falls back to showing individual ToolCallBlocks when only 1 tool. Easy revert. |
| Users accumulate >200 messages in a session | Low | Scroll performance degrades | `will-change: transform` on scroll container. Add virtualization as Phase 6 if this happens. |

---

## File Impact Summary

Files that get modified across multiple phases (hotspots):

| File | Phases | Total estimated changes |
|---|---|---|
| `web/src/views/sessions/MessageBubble.tsx` | 1a, 1b, 1d, 5a, 5b | ~95 LOC across phases |
| `web/src/views/sessions/ChatArea.tsx` | 1b, 1c, 2b, 2c, 5b, 5c | ~140 LOC across phases |
| `web/src/store.ts` | 1b, 2a, 2b, 3a, 3d | ~50 LOC across phases |
| `web/src/main.tsx` | 1b, 2a, 2c, 3a | ~50 LOC across phases |
| `web/src/views/sessions/Composer.tsx` | 2a, 2d, 3d | ~50 LOC across phases |
| `web/src/views/sessions/SessionSidebar.tsx` | 3a, 3b, 3c | ~120 LOC across phases |
| `web/src/views/sessions/ToolCallBlock.tsx` | 4a, 4b | ~20 LOC across phases |

**MessageBubble.tsx** is the most-touched file. Consider whether it should be split after Phase 1 (e.g., separate `AssistantMessage.tsx` and `UserMessage.tsx`). Current size is 78 LOC — likely fine up to ~200 LOC as one file.
