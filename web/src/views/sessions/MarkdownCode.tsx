import { useState, useCallback } from "react";
import { colors, font, radius, spacing } from "../../ui/tokens";

interface CodeProps {
  className?: string;
  children?: React.ReactNode;
}

export function MarkdownCode({ className, children }: CodeProps) {
  const match = className?.match(/language-(\w+)/);
  const isBlock = !!match || (typeof children === "string" && children.includes("\n"));

  if (!isBlock) {
    return <code style={inlineStyle}>{children}</code>;
  }

  return <CodeBlock language={match?.[1]} content={String(children).replace(/\n$/, "")} />;
}

function CodeBlock({ language, content }: { language?: string; content: string }) {
  const [hover, setHover] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <div
      style={blockStyles.wrapper}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={blockStyles.topBar}>
        {language && <span style={blockStyles.lang}>{language}</span>}
        <button
          onClick={onCopy}
          style={{
            ...blockStyles.copyBtn,
            opacity: hover ? 1 : 0,
          }}
        >
          {copied ? "✓" : "Copy"}
        </button>
      </div>
      <pre style={blockStyles.pre}>
        <code>{content}</code>
      </pre>
    </div>
  );
}

const inlineStyle: React.CSSProperties = {
  fontFamily: font.mono,
  fontSize: font.sizeSm,
  background: colors.bgOverlay,
  padding: "2px 6px",
  borderRadius: radius.sm,
};

const blockStyles = {
  wrapper: {
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    overflow: "hidden" as const,
  },
  topBar: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.sm,
    padding: `${spacing.xs}px ${spacing.sm}px`,
    borderBottom: `1px solid ${colors.border}`,
  },
  lang: {
    fontSize: font.sizeXs,
    color: colors.textFaint,
    marginRight: "auto" as const,
  },
  copyBtn: {
    background: "none",
    border: "none",
    color: colors.textMuted,
    fontSize: font.sizeXs,
    cursor: "pointer" as const,
    padding: `2px ${spacing.xs}px`,
    transition: "opacity 0.15s",
  },
  pre: {
    margin: 0,
    padding: spacing.md,
    fontFamily: font.mono,
    fontSize: font.sizeSm,
    color: colors.text,
    overflowX: "auto" as const,
    lineHeight: 1.5,
  },
};
