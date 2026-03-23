# Bridge Sessions UI Polish Plan

> Steal the UX essence of t3code's polished chat experience. Keep inline styles, zustand, Go backend, pi RPC.

## Guiding Principles

1. **Work from the inside out**: Fix the message timeline first (what users stare at), then composer, then sidebar, then chrome. Each phase ships independently.
2. **Adapt patterns, don't port code**: t3code's MessagesTimeline.tsx is 912 lines of Effect-TS + tanstack/react-virtual + Tailwind. We want the _behavior_, not the machinery.
3. **Pi events are the source of truth**: t3code has an `OrchestrationThreadActivity` abstraction layer. We don't need that — pi RPC events (`agent_start`, `turn_start/end`, `tool_execution_*`, `message_update`) already give us everything. The trick is deriving better UI state from them.
4. **No new deps unless essential**: react-markdown stays, maybe add `react-syntax-highlighter` for code blocks. No tanstack/virtual, no lucide, no radix, no dnd-kit.

## What Makes t3code Feel Polished (The Actual List)

After reading their code, the "polish" comes from a surprisingly short list:

1. **Work log grouping** — Tool calls are collapsed into a compact "work log" line like `✓ Read 3 files · Edited 2 files` instead of showing every tool call inline. This is the #1 UX win.
2. **Elapsed time per turn** — "12.4s" after each assistant response. Simple but gives a sense of pace.
3. **Scroll-to-bottom pill** — Floating button when you've scrolled up. Trivial to build.
4. **Error banner** — Dismissible red banner at top of chat for session errors.
5. **Copy button on messages** — Hover to reveal copy icon on assistant messages.
6. **Better markdown** — Syntax-highlighted code blocks, proper link handling.
7. **Session topic/title** — Derived from first user message, shown in sidebar + header.
8. **Pending approval UI** — Inline panel above composer when agent needs permission.
9. **Diff stats** — "+3 -1" labels on tool calls that modify files.

Things to explicitly **skip** (complexity demons):
- Virtualized timeline (tanstack/react-virtual) — Bridge won't have 1000-message threads
- DnD sidebar reordering — nice but not worth dnd-kit
- Proposed plan cards / plan sidebar — pi doesn't have a plan mode protocol
- Terminal drawer — out of scope
- Provider/model picker in composer — pi's model is set at session start
- Image attachments — pi RPC doesn't support them
- Branch toolbar / git actions — out of scope
- Diff panel with @pierre/diffs — big dependency, defer to later phase
- `@mentions` / `/commands` in composer — defer

---

## Phase 5: Message Timeline Polish

**Goal**: Messages look and feel professional. Work log grouping, elapsed time, copy, better markdown.

**Dependencies**: None (builds on existing ChatArea + MessageBubble)

### 5a: Work Log Grouping (~200 LOC)

**What**: Instead of showing each tool call as a separate collapsible block inline, group consecutive tool calls into a single collapsed "work log" summary line.

**t3code pattern**: `deriveWorkLogEntries()` in session-logic.ts collapses tool lifecycle events. MessagesTimeline renders them as compact rows with icons.

**Our approach**: Pure function `deriveWorkLog(toolCalls: ToolCallInfo[])` that takes an assistant message's tool calls and returns:
```ts
interface WorkLogGroup {
  summary: string;     // "Read 3 files · Edited 2 files · Ran 1 command"
  tools: ToolCallInfo[];
  isComplete: boolean;
}
```

Categorize by tool name patterns:
- `read`/`Read` → "Read N files"
- `edit`/`Edit`/`write`/`Write` → "Edited N files"
- `bash`/`Bash` → "Ran N commands"
- `search`/`Search`/`rg`/`find` → "Searched N times"
- Other → "Used N tools"

Render as a single collapsible row: `▸ ✓ Read 3 files · Edited 2 files (4.2s)`. Click to expand all tool calls.

**Files**:
- New: `web/src/views/sessions/work-log.ts` — pure derivation logic
- New: `web/src/views/sessions/work-log.test.ts`
- Modify: `web/src/views/sessions/MessageBubble.tsx` — replace inline tool call list with WorkLogGroup
- New: `web/src/views/sessions/WorkLogBlock.tsx` — collapsed summary + expandable detail

**What to skip**: t3code's `collapseKey` + `itemType` matching, activity ordering, tool lifecycle state machine. We just group by tool call array on the message.

### 5b: Elapsed Time Per Turn (~60 LOC)

**What**: Show duration next to each assistant message like "12.4s" in muted text.

**t3code pattern**: `computeMessageDurationStart()` pairs user→assistant messages, `formatElapsed()` renders duration.

**Our approach**: Add `startedAt?: number` and `completedAt?: number` to `ChatMessage`. Set `startedAt` on `agent_start`, `completedAt` on `agent_end`. Render inline:

```tsx
{!message.isStreaming && message.startedAt && message.completedAt && (
  <span style={styles.elapsed}>{formatDuration(message.completedAt - message.startedAt)}</span>
)}
```

**Files**:
- Modify: `web/src/store.ts` — add `startedAt`/`completedAt` to `ChatMessage`
- Modify: `web/src/main.tsx` — set timestamps in `handlePiEventInner`
- Modify: `web/src/views/sessions/MessageBubble.tsx` — render elapsed time
- New: `web/src/views/sessions/format-duration.ts` — `formatDuration(ms)` → "1.2s", "1m 3s"
- New: `web/src/views/sessions/format-duration.test.ts`

### 5c: Message Copy Button (~50 LOC)

**What**: Hover over assistant message → copy icon appears in top-right corner.

**t3code pattern**: `MessageCopyButton.tsx` — 20 lines, uses a clipboard hook.

**Our approach**: Add a `useState` hover + clipboard write in MessageBubble. Show "✓ Copied" for 2s after click.

**Files**:
- Modify: `web/src/views/sessions/MessageBubble.tsx` — add hover state + copy button

### 5d: Better Markdown Rendering (~100 LOC)

**What**: Syntax-highlighted code blocks, proper inline code styling, link handling.

**Dep**: Add `react-syntax-highlighter` (or use `rehype-highlight` plugin for react-markdown).

**t3code pattern**: `ChatMarkdown.tsx` uses a custom markdown renderer. We just need better code block rendering.

**Our approach**: Custom `code` component for react-markdown that:
- Inline code: styled mono span with background
- Fenced code blocks: syntax highlighting with a dark theme, copy button, language label

**Files**:
- New: `web/src/views/sessions/MarkdownCode.tsx` — custom code block component
- Modify: `web/src/views/sessions/MessageBubble.tsx` — pass custom components to `<Markdown>`
- `bun add react-syntax-highlighter @types/react-syntax-highlighter` (or `rehype-highlight`)

### Phase 5 Total: ~410 LOC new/modified, 1 new dep

---

## Phase 6: Chat Area Chrome

**Goal**: Header with context, scroll-to-bottom pill, error banners, working indicator.

**Dependencies**: Phase 5 (messages look good first)

### 6a: Scroll-to-Bottom Pill (~60 LOC)

**What**: Floating "↓ Scroll to bottom" button that appears when user has scrolled up.

**t3code pattern**: `showScrollToBottom` state + `isScrollContainerNearBottom()` in ChatView.tsx.

**Our approach**: ChatArea already tracks `isNearBottom`. Add a state for pill visibility:
```tsx
const [showScrollPill, setShowScrollPill] = useState(false);
// In handleScroll:
setShowScrollPill(!isNearBottom);
```

Render a fixed-position pill at bottom-center of messages area.

**Files**:
- Modify: `web/src/views/sessions/ChatArea.tsx` — add pill state + render

### 6b: Session Header Enhancement (~80 LOC)

**What**: Show project name, model, session state, and session topic in the header.

**t3code pattern**: `ChatHeader.tsx` shows thread title, project name badge, diff toggle.

**Our approach**: Derive session topic from first user message. Show: `project-name / topic | model | state-badge`. Add to store.

**Files**:
- Modify: `web/src/store.ts` — add `topic?: string` to `ChatMessage` or derive in a selector
- Modify: `web/src/views/sessions/ChatArea.tsx` — enhance header section
- Modify: `web/src/main.tsx` — derive topic from first user message

### 6c: Error Banner (~50 LOC)

**What**: Red dismissible banner shown when session has an error (process crash, etc).

**t3code pattern**: `ThreadErrorBanner.tsx` — simple alert component.

**Our approach**: Track `sessionError: Map<string, string>` in store. Render above messages when present. Dismiss button clears it.

**Files**:
- Modify: `web/src/store.ts` — add `sessionErrors` map
- Modify: `web/src/main.tsx` — set errors from `session_error` events
- New: `web/src/views/sessions/ErrorBanner.tsx`

### 6d: Working Indicator (~40 LOC)

**What**: Pulsing dot or animated bar when agent is actively working (not just "Thinking…" text).

**Our approach**: Replace the "Thinking…" text with a subtle 3-dot pulse animation in the message area. Add a thin blue animated bar at the very top of the chat area.

**Files**:
- Modify: `web/src/views/sessions/MessageBubble.tsx` — animated thinking indicator
- Modify: `web/src/views/sessions/ChatArea.tsx` — progress bar at top

### Phase 6 Total: ~230 LOC new/modified, 0 new deps

---

## Phase 7: Composer Upgrade

**Goal**: Better prompt editing experience, approval UI, keyboard shortcuts.

**Dependencies**: Phase 6 (error banner exists for error states)

### 7a: Pending Approval Panel (~120 LOC)

**What**: When pi requests tool approval via extension_ui_request, show an inline panel above the composer instead of (or in addition to) the modal dialog.

**t3code pattern**: `ComposerPendingApprovalPanel.tsx` + `ComposerPendingApprovalActions.tsx` — panel above composer with Approve/Decline/Always Allow buttons.

**Our approach**: Bridge already has `ExtensionDialog` for modals. For "confirm" type requests that look like tool approvals, render inline above the composer. Keep the modal for select/input/notify types.

The panel shows: tool name, what it wants to do, and Approve/Decline buttons.

**Files**:
- New: `web/src/views/sessions/ApprovalPanel.tsx`
- Modify: `web/src/views/sessions/Composer.tsx` — render ApprovalPanel above textarea when pending
- Modify: `web/src/main.tsx` — route confirm requests to inline panel vs modal

### 7b: Keyboard Shortcuts (~80 LOC)

**What**: Global keyboard shortcuts for common actions.

Key bindings:
- `Cmd+N` — new session in active project
- `Cmd+[` / `Cmd+]` — switch between sessions
- `Cmd+W` — destroy active session
- `Cmd+L` — clear messages (if pi supports it)
- `/` — focus composer (when not in textarea)

**t3code pattern**: Configurable keybindings with command palette. We skip the configurability and just hardcode sensible defaults.

**Files**:
- Modify: `web/src/views/SessionsView.tsx` — add keyboard handler
- Modify: `web/src/agent/commands.ts` — add any new command helpers

### 7c: Composer Polish (~60 LOC)

**What**: Small UX improvements to the composer.

- Show character count when message is long
- Auto-focus textarea when switching sessions
- Textarea grows more naturally (current max 200px feels short, bump to 300px)
- Show model name in composer placeholder: "Send to claude-sonnet-4…"
- Subtle border glow when streaming (indicates active session)

**Files**:
- Modify: `web/src/views/sessions/Composer.tsx`

### Phase 7 Total: ~260 LOC new/modified, 0 new deps

---

## Phase 8: Sidebar Enhancement

**Goal**: Session titles, status dots, polish.

**Dependencies**: Phase 5b (topics/timestamps exist)

### 8a: Session Row Enhancement (~100 LOC)

**What**: Show session topic (derived from first user message) instead of just model name. Show elapsed time since last activity. Status dots that pulse when streaming.

**t3code pattern**: Sidebar.tsx shows thread title with status indicators, relative time, PR status dots.

**Our approach**:
- Derive topic: first user message content, truncated to 30 chars
- Session row shows: topic (or "New session"), relative time, pulsing status dot
- Active session row gets a left-side accent bar

**Files**:
- Modify: `web/src/views/sessions/SessionSidebar.tsx` — enhance SessionRow + HistoryRow
- Modify: `web/src/store.ts` — add `sessionTopics: Map<string, string>` (derived from first user message)
- Modify: `web/src/main.tsx` — derive topic on first user prompt

### 8b: Session Management (~80 LOC)

**What**: Right-click context menu on sessions with: Destroy, Clear Messages, Copy Session ID.

**Files**:
- Modify: `web/src/views/sessions/SessionSidebar.tsx` — add context menu on session rows

### Phase 8 Total: ~180 LOC new/modified, 0 new deps

---

## Phase 9: Diff Preview (Stretch Goal)

**Goal**: Basic inline diff rendering for tool calls that modify files.

**Dependencies**: Phase 5a (work log grouping exists)

### 9a: Diff Stats on Tool Calls (~80 LOC)

**What**: Show `+3 -1` labels on edit/write tool call results.

**t3code pattern**: `DiffStatLabel.tsx` — 22 lines, just renders colored +/- counts.

**Our approach**: Parse tool call results for edit/write tools. Count lines added/removed from the args/result text. Show inline badge.

**Files**:
- New: `web/src/views/sessions/DiffStatLabel.tsx`
- New: `web/src/views/sessions/diff-stats.ts` — parse edit args for line counts
- Modify: `web/src/views/sessions/ToolCallBlock.tsx` — show diff stats

### 9b: Simple Diff Viewer (~200 LOC, optional)

**What**: When clicking a file-edit tool call, show a basic unified diff view.

**No new deps** — render with `<pre>` and line-level coloring (green for additions, red for deletions). Parse the edit tool's `oldText`/`newText` args.

This is explicitly NOT the @pierre/diffs level of polish. It's a colored pre block.

**Files**:
- New: `web/src/views/sessions/SimpleDiff.tsx`
- Modify: `web/src/views/sessions/ToolCallBlock.tsx` — toggle diff view

### Phase 9 Total: ~280 LOC new/modified, 0 new deps

---

## Summary

| Phase | What | LOC | New Deps | Depends On |
|-------|------|-----|----------|------------|
| **5** | Message Timeline Polish | ~410 | react-syntax-highlighter | — |
| **6** | Chat Area Chrome | ~230 | — | 5 |
| **7** | Composer Upgrade | ~260 | — | 6 |
| **8** | Sidebar Enhancement | ~180 | — | 5b |
| **9** | Diff Preview (stretch) | ~280 | — | 5a |
| **Total** | | **~1,360** | **1 dep** | |

## Ordering Rationale

**Phase 5 first** because:
- Messages are 80% of what users look at
- Work log grouping is the single biggest UX leap (currently every tool call is a noisy block)
- Everything else builds on having good messages

**Phase 6 before 7** because:
- Scroll-to-bottom + error banners are "expected furniture" — users notice when missing
- The header context makes the chat feel professional before we touch the composer

**Phase 7 before 8** because:
- Composer improvements affect the core interaction loop
- Approval UI is a real functional gap (currently requires modal dialog)
- Sidebar is already functional, just needs polish

**Phase 9 last** because:
- It's pure additive polish
- Can be deferred indefinitely without degrading the experience
- If we ever add a real diff panel, this work gets replaced

## What We're Giving Up

- **Virtualized timeline**: If someone has a 500-message session, it'll be slow. Acceptable tradeoff — virtualization adds ~300 LOC + a dep and we can add it later if needed.
- **DnD sidebar reorder**: Nice for power users but not essential. Keyboard shortcuts for session switching cover the same need.
- **Plan sidebar**: Pi doesn't expose plan state via RPC events. If it does later, we can add this.
- **Rich diff panel**: @pierre/diffs is 5K+ LOC of dependency. SimpleDiff in Phase 9 covers 80% of the value.
- **Configurable keybindings**: Hardcoded is fine for a personal tool. Add configurability if we ever share Bridge.

## Cost of Being Wrong

Every phase is independently shippable and independently revertable. The riskiest bet is Phase 5a (work log grouping) because it changes the core message display pattern. If tool name heuristics don't work well with pi's actual tool names, we fall back to showing individual tool calls (current behavior). Reversible in one commit.
