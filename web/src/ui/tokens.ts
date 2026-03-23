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
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24,
} as const;

export const font = {
  mono: "'SF Mono', 'Fira Code', monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  sizeXs: 10, sizeSm: 11, sizeMd: 12, sizeLg: 13, sizeXl: 14, sizeTitle: 16,
} as const;

export const radius = {
  sm: 4, md: 6, lg: 8, xl: 12,
} as const;
