import { useState } from "react";
import { useBridgeStore } from "../../store";
import { sendExtensionUIResponse } from "../../agent/commands";
import type { ExtensionUIRequest } from "../../agent/types";

export default function ExtensionDialog() {
  const pending = useBridgeStore((s) => s.extensionUIRequest);
  const [inputValue, setInputValue] = useState("");

  if (!pending) return null;

  const { sessionId, request } = pending;

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
            color: request.notifyType === "error" ? "#f85149" :
                   request.notifyType === "warning" ? "#d29922" : "#c9d1d9",
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
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column" as const,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: "#c9d1d9",
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: "#c9d1d9",
    lineHeight: 1.5,
    marginBottom: 12,
  },
  list: {
    overflowY: "auto" as const,
    maxHeight: 300,
    marginBottom: 8,
  },
  option: {
    display: "block",
    width: "100%",
    padding: "8px 12px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: "#c9d1d9",
    textAlign: "left" as const,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "inherit",
    marginBottom: 2,
  },
  input: {
    padding: "8px 12px",
    border: "1px solid #30363d",
    borderRadius: 6,
    background: "#0d1117",
    color: "#c9d1d9",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    marginBottom: 12,
  },
  buttons: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
  },
  cancel: {
    padding: "8px 16px",
    border: "1px solid #30363d",
    borderRadius: 6,
    background: "transparent",
    color: "#8b949e",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  confirmBtn: {
    padding: "8px 16px",
    border: "none",
    borderRadius: 6,
    background: "#1f6feb",
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
