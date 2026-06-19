import type { ReactNode } from "react";

export type IconName =
  | "min" | "max" | "close" | "x" | "plus" | "search"
  | "chevron" | "server" | "pi" | "cloud" | "router" | "pin" | "import"
  | "refresh" | "split" | "snippet" | "sftp" | "power" | "copy" | "edit" | "trash" | "tunnel"
  | "palette" | "globe" | "shell" | "key" | "terminal" | "keyboard" | "settings" | "bookmark"
  | "info" | "play" | "check" | "arrow" | "sidebarShow" | "sidebarHide";

export const Icon: Record<IconName, ReactNode> = {
  min: <svg viewBox="0 0 10 10" fill="none"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" /></svg>,
  max: <svg viewBox="0 0 10 10" fill="none"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" /></svg>,
  close: <svg viewBox="0 0 10 10" fill="none"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.1" /></svg>,
  x: <svg viewBox="0 0 10 10" fill="none"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  plus: <svg viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  search: <svg viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" /><path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,

  chevron: <svg viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  server: <svg viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2" width="11" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" /><rect x="1.5" y="8" width="11" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" /><circle cx="4" cy="4" r="0.7" fill="currentColor" /><circle cx="4" cy="10" r="0.7" fill="currentColor" /></svg>,
  pi: <svg viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><circle cx="5" cy="5" r="0.8" fill="currentColor" /><circle cx="9" cy="5" r="0.8" fill="currentColor" /><path d="M5 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>,
  cloud: <svg viewBox="0 0 14 14" fill="none"><path d="M4 9.5C2.6 9.5 1.5 8.5 1.5 7.2C1.5 6 2.4 5 3.5 5C3.6 3.6 4.8 2.5 6.3 2.5C7.6 2.5 8.7 3.3 9.1 4.5C9.3 4.5 9.5 4.5 9.7 4.5C11.2 4.5 12.5 5.7 12.5 7.2C12.5 8.5 11.4 9.5 10 9.5H4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>,
  router: <svg viewBox="0 0 14 14" fill="none"><rect x="1.5" y="7" width="11" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" /><path d="M4 7V4M7 7V2M10 7V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><circle cx="4" cy="3.5" r="0.7" fill="currentColor" /><circle cx="7" cy="1.5" r="0.7" fill="currentColor" /><circle cx="10" cy="3.5" r="0.7" fill="currentColor" /></svg>,
  pin: <svg viewBox="0 0 14 14" fill="none"><path d="M9 1L13 5L11 6L11.5 11L7 7L2 12V13H3L8 8L11.5 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  import: <svg viewBox="0 0 14 14" fill="none"><path d="M7 1V9M3.5 5.5L7 9L10.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M2 11V12.5H12V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,

  refresh: <svg viewBox="0 0 14 14" fill="none"><path d="M12 7C12 9.76 9.76 12 7 12C5.5 12 4.2 11.4 3.3 10.4M2 7C2 4.24 4.24 2 7 2C8.5 2 9.8 2.6 10.7 3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M12 1.5V3.5H10M2 12.5V10.5H4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  split: <svg viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><path d="M7 1.5V12.5" stroke="currentColor" strokeWidth="1.2" /></svg>,
  snippet: <svg viewBox="0 0 14 14" fill="none"><path d="M4.5 4L1.5 7L4.5 10M9.5 4L12.5 7L9.5 10M8 2L6 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  sftp: <svg viewBox="0 0 14 14" fill="none"><path d="M2 4C2 3.4 2.4 3 3 3H5.5L6.5 4H11C11.6 4 12 4.4 12 5V10C12 10.6 11.6 11 11 11H3C2.4 11 2 10.6 2 10V4Z" stroke="currentColor" strokeWidth="1.2" /></svg>,
  power: <svg viewBox="0 0 14 14" fill="none"><path d="M4 4C2.8 4.9 2 6.4 2 8C2 10.8 4.2 13 7 13C9.8 13 12 10.8 12 8C12 6.4 11.2 4.9 10 4M7 1V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  copy: <svg viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" /><path d="M2 9V3C2 2.4 2.4 2 3 2H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>,
  edit: <svg viewBox="0 0 14 14" fill="none"><path d="M9.5 2L12 4.5L4.5 12L1.5 12.5L2 9.5L9.5 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>,
  trash: <svg viewBox="0 0 14 14" fill="none"><path d="M2.5 4H11.5M5 4V2.5H9V4M3.5 4L4 12C4 12.5 4.5 13 5 13H9C9.5 13 10 12.5 10 12L10.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  tunnel: <svg viewBox="0 0 14 14" fill="none"><path d="M1 11C1 7 3.5 4 7 4C10.5 4 13 7 13 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><path d="M5 11V8M9 11V8M7 11V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>,

  palette: <svg viewBox="0 0 14 14" fill="none"><path d="M7 1C3.5 1 1 3.5 1 7C1 10 3 12 5.5 12C6.5 12 7 11.5 7 10.5C7 10 6.7 9.5 6.7 9C6.7 8.5 7 8 7.5 8H10C11.5 8 13 6.5 13 5C13 2.5 10.5 1 7 1Z" stroke="currentColor" strokeWidth="1.2" /><circle cx="3.5" cy="6" r="0.7" fill="currentColor" /><circle cx="5.5" cy="3.5" r="0.7" fill="currentColor" /><circle cx="9" cy="3.5" r="0.7" fill="currentColor" /><circle cx="10.5" cy="6" r="0.7" fill="currentColor" /></svg>,
  globe: <svg viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" /><path d="M1.5 7H12.5M7 1.5C9 4 9 10 7 12.5M7 1.5C5 4 5 10 7 12.5" stroke="currentColor" strokeWidth="1.2" /></svg>,
  shell: <svg viewBox="0 0 14 14" fill="none"><path d="M3 4L6 7L3 10M7 10H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  key: <svg viewBox="0 0 14 14" fill="none"><circle cx="4" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.2" /><path d="M5.8 8.2L12 2M9 5L11 7M10.5 3.5L12.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>,
  terminal: <svg viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.2" /><path d="M4 6L5.5 7L4 8M7 8.5H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  keyboard: <svg viewBox="0 0 14 14" fill="none"><rect x="1" y="3.5" width="12" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" /><path d="M3 6H3.1M5 6H5.1M7 6H7.1M9 6H9.1M11 6H11.1M3 8.5H4M10 8.5H11M5.5 8.5H8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  settings: <svg viewBox="0 0 16 16" fill="none"><path d="M6.9 3H9.1L9.45 4.6C9.82 4.74 10.16 4.94 10.47 5.18L12 4.58L13.1 6.48L11.82 7.48C11.87 7.81 11.87 8.18 11.82 8.52L13.1 9.52L12 11.42L10.47 10.82C10.16 11.06 9.82 11.26 9.45 11.4L9.1 13H6.9L6.55 11.4C6.18 11.26 5.84 11.06 5.53 10.82L4 11.42L2.9 9.52L4.18 8.52C4.13 8.18 4.13 7.81 4.18 7.48L2.9 6.48L4 4.58L5.53 5.18C5.84 4.94 6.18 4.74 6.55 4.6L6.9 3Z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.15" /></svg>,
  bookmark: <svg viewBox="0 0 14 14" fill="none"><path d="M3 1.5H11V12.5L7 9.5L3 12.5V1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>,
  info: <svg viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" /><path d="M7 6.5V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><circle cx="7" cy="4.2" r="0.7" fill="currentColor" /></svg>,
  play: <svg viewBox="0 0 14 14" fill="none"><path d="M4 2.5L11 7L4 11.5V2.5Z" fill="currentColor" /></svg>,
  check: <svg viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5L5.5 10.5L11.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  arrow: <svg viewBox="0 0 14 14" fill="none"><path d="M2 7H12M8 3L12 7L8 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  sidebarShow: <svg viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="4" height="10" rx="0.8" stroke="currentColor" strokeWidth="1.2" /><rect x="8" y="2" width="4" height="10" rx="0.8" stroke="currentColor" strokeWidth="1.2" /></svg>,
  sidebarHide: <svg viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="0.8" stroke="currentColor" strokeWidth="1.2" /><line x1="5" y1="2" x2="5" y2="12" stroke="currentColor" strokeWidth="1" /></svg>,
};
