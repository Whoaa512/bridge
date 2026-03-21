const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;
const MONTH = 2592000;

export function relativeTime(isoDate: string, format: "verbose" | "terse" = "verbose"): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);

  if (seconds < 0 || isNaN(seconds)) return "just now";
  if (seconds < MINUTE) return "just now";

  if (format === "terse") return terseFmt(seconds);
  return verboseFmt(seconds);
}

function terseFmt(seconds: number): string {
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m ago`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h ago`;
  if (seconds < MONTH) return `${Math.floor(seconds / DAY)}d ago`;
  return `${Math.floor(seconds / MONTH)}mo ago`;
}

function verboseFmt(seconds: number): string {
  if (seconds < HOUR) {
    const m = Math.floor(seconds / MINUTE);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (seconds < DAY) {
    const h = Math.floor(seconds / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (seconds < WEEK) {
    const d = Math.floor(seconds / DAY);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  if (seconds < MONTH) {
    const w = Math.floor(seconds / WEEK);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  const mo = Math.floor(seconds / MONTH);
  return `${mo} month${mo === 1 ? "" : "s"} ago`;
}
