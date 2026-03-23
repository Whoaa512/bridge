import { useState } from "react";
import { useBridgeStore } from "../../store";
import { sendExtensionUIResponse } from "../../agent/commands";
import type { ExtensionUIRequest } from "../../agent/types";
import { colors, spacing, font, radius } from "../../ui/tokens";

export default function ExtensionDialog() {
  const pending = useBridgeStore((s) => s.extensionUIRequest);
  const [inputValue, setInputValue] = useState("");

  if (!pending) return null;

  const { sessionId, request } = pending;

  const interactive = request.method === "select" || request.method === "confirm"
    || request.method === "input" || request.method === "notify";
  if (!interactive) return null;

  function respond(value: unknown) {
    sendExtensionUIResponse(sessionId, {
      type: "extension_ui_response",
      id: request.id,
      value,
    });
    useBridgeStore.getState().setExtensionUIRequest(null);
    setInputValue("");
  }

  function dismiss() {
    useBridgeStore.getState().setExtensionUIRequest(null);
    setInputValue("");
  }

  return (
    <div style={styles.overlay} onClick={dismiss}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {renderContent(request, inputValue, setInputValue, respond, dismiss)}
      </div>
    </div>
  );
}

function renderContent(
  request: ExtensionUIRequest,
  inputValue: string,
  setInputValue: (v: string) => void,
  respond: (v: unknown) => void,
  dismiss: () => void,
) {
  switch (request.method) {
    case "select":
      return (
        <>
          <div style={styles.title}>{request.title}</div>
          <div style={styles.list}>
            {request.options.map((opt, i) => (
              <button key={i} onClick={() => respond(opt)} style={styles.option}>
                {opt}
              </button>
            ))}
          </div>
          <button onClick={dismiss} style={styles.cancel}>Cancel</button>
        </>
      );

    case "confirm":
      return (
        <>
          <div style={styles.title}>{request.title}</div>
          <div style={styles.message}>{request.message}</div>
          <div style={styles.buttons}>
            <button onClick={() => respond(false)} style={styles.cancel}>No</button>
            <button onClick={() => respond(true)} style={styles.confirmBtn}>Yes</button>
          </div>
        </>
      );

    case "input":
      return (
        <>
          <div style={styles.title}>{request.title}</div>
          <input
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") respond(inputValue);
              if (e.key === "Escape") dismiss();
            }}
            placeholder={request.placeholder ?? ""}
            style={styles.input}
          />
          <div style={styles.buttons}>
            <button onClick={dismiss} style={styles.cancel}>Cancel</button>
            <button onClick={() => respond(inputValue)} style={styles.confirmBtn}>Submit</button>
          </div>
        </>
      );

    case "notify":
      return (
        <>
          <div style={{
            ...styles.message,
            color: request.notifyType === "error" ? colors.error :
                   request.notifyType === "warning" ? colors.warning : colors.text,
          }}>
            {request.message}
          </div>
          <button onClick={dismiss} style={styles.cancel}>OK</button>
        </>
      );

    default:
      return null;
  }
}

const styles = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
  },
  dialog: {
    width: 400,
    maxHeight: "60vh",
    background: colors.bgRaised,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.xl,
    padding: spacing.lg,
    display: "flex",
    flexDirection: "column" as const,
    fontFamily: font.sans,
  },
  title: {
    fontSize: font.sizeTitle,
    fontWeight: 600,
    color: colors.text,
    marginBottom: spacing.md,
  },
  message: {
    fontSize: font.sizeXl,
    color: colors.text,
    lineHeight: 1.5,
    marginBottom: spacing.md,
  },
  list: {
    overflowY: "auto" as const,
    maxHeight: 300,
    marginBottom: spacing.sm,
  },
  option: {
    display: "block",
    width: "100%",
    padding: `${spacing.sm}px ${spacing.md}px`,
    border: "none",
    borderRadius: radius.md,
    background: "transparent",
    color: colors.text,
    textAlign: "left" as const,
    cursor: "pointer",
    fontSize: font.sizeLg,
    fontFamily: "inherit",
    marginBottom: 2,
  },
  input: {
    padding: `${spacing.sm}px ${spacing.md}px`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    background: colors.bg,
    color: colors.text,
    fontSize: font.sizeXl,
    fontFamily: "inherit",
    outline: "none",
    marginBottom: spacing.md,
  },
  buttons: {
    display: "flex",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  cancel: {
    padding: `${spacing.sm}px ${spacing.lg}px`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    background: "transparent",
    color: colors.textMuted,
    fontSize: font.sizeLg,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  confirmBtn: {
    padding: `${spacing.sm}px ${spacing.lg}px`,
    border: "none",
    borderRadius: radius.md,
    background: colors.accent,
    color: "#fff",
    fontSize: font.sizeLg,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
