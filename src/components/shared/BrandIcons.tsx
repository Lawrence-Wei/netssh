// Brand-aware host icon picker. Falls back to a role-based generic icon when no
// brand match exists. Each brand is a short inline SVG glyph that respects
// currentColor so the host hue still propagates.

import type { ReactNode } from "react";
import type { Host } from "../../types";
import { Icon } from "./Icons";

interface BrandRule {
  id: string;
  test: RegExp;
  icon: ReactNode;
  label: string;
}

const BRAND_RULES: BrandRule[] = [
  {
    id: "zspace",
    test: /zspace|z-space|zima|极空间|nance/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none" aria-label="ZSpace">
        <rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="#1A73E8" stroke="#1A73E8" strokeWidth="0.5" />
        <path d="M4.2 3.8l5.6 6.4M9.8 3.8L4.2 10.2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.5 3.3v1.5h-1.2M4.5 10.7v-1.5h1.2" stroke="#fff" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    label: "ZSpace",
  },
  {
    id: "windows11",
    test: /windows[\s-]?11|win[\s-]?11|win11|w11/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <path d="M1.5 3l5-0.7v4.4H1.5V3z" fill="currentColor" />
        <path d="M7.5 2.2l5-0.7v5.2H7.5V2.2z" fill="currentColor" />
        <path d="M1.5 7.3h5v4.4l-5-0.7V7.3z" fill="currentColor" opacity="0.75" />
        <path d="M7.5 7.3h5v5.2l-5-0.7V7.3z" fill="currentColor" opacity="0.75" />
      </svg>
    ),
    label: "Windows 11",
  },
  {
    id: "windows",
    test: /windows|win10|win[\s-]?10|microsoft/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <path d="M1.5 3.6l5-0.8v4.4H1.5V3.6z" fill="currentColor" />
        <path d="M7.5 2.7l5-0.9v5.3H7.5V2.7z" fill="currentColor" />
        <path d="M1.5 7.5h5v4.4l-5-0.8V7.5z" fill="currentColor" />
        <path d="M7.5 7.5h5v5.3l-5-0.8V7.5z" fill="currentColor" />
      </svg>
    ),
    label: "Windows",
  },
  {
    id: "msos",
    test: /\bmsos\b|microsoft[\s-]?os/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="1.5" width="11" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.1" />
        <text x="2.5" y="9" fontFamily="Inter,Arial,sans-serif" fontSize="4.5" fontWeight="700" fill="currentColor">MS</text>
      </svg>
    ),
    label: "MSOS",
  },
  {
    id: "huawei",
    test: /huawei|hw[-_]?|华为|vrp|usg|s5700|s6700|s7700|s9700|s12700/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <path d="M7 1.5L3 7l4 5.5L11 7 7 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M5 7l2-2 2 2-2 2-2-2z" fill="currentColor" opacity="0.55" />
      </svg>
    ),
    label: "Huawei Switch",
  },
  {
    id: "apple",
    test: /^macbook|imac|macmini|apple|osx|macos|mac[-_]?/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <path
          d="M9.4 7.4c0-1.4 1.1-2 1.1-2-0.6-0.9-1.5-1-1.9-1-0.8-0.1-1.6 0.5-2 0.5-0.4 0-1.1-0.5-1.8-0.5-1 0-1.9 0.6-2.4 1.5-1 1.8-0.3 4.5 0.7 5.9 0.5 0.7 1.1 1.5 1.8 1.4 0.7 0 1-0.5 1.9-0.5 0.9 0 1.1 0.5 1.9 0.5 0.8 0 1.3-0.7 1.8-1.4 0.3-0.5 0.6-1.1 0.7-1.6-0.4-0.2-1.8-0.8-1.8-2.3z"
          fill="currentColor"
        />
        <path d="M8.3 3.2c0.4-0.5 0.6-1.1 0.5-1.7-0.5 0-1.2 0.4-1.5 0.8-0.3 0.4-0.6 1-0.5 1.6 0.6 0.1 1.1-0.2 1.5-0.7z" fill="currentColor" />
      </svg>
    ),
    label: "Apple",
  },
  {
    id: "ios",
    test: /\bios\b|iphone|ipad|airdrop/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <rect x="3" y="1" width="8" height="12" rx="1.6" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="7" cy="11" r="0.7" fill="currentColor" />
        <rect x="5.5" y="2.4" width="3" height="0.7" rx="0.35" fill="currentColor" opacity="0.6" />
      </svg>
    ),
    label: "iOS",
  },
  {
    id: "4k",
    test: /\b4k\b|uhd|hdmi|hdr|stb|set[-_ ]?top|tv[-_ ]?box/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="3" width="11" height="7" rx="1" stroke="currentColor" strokeWidth="1.1" />
        <path d="M4 11.5h6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <text x="3.6" y="8.2" fontFamily="Inter,Arial,sans-serif" fontSize="3.5" fontWeight="700" fill="currentColor">4K</text>
      </svg>
    ),
    label: "4K",
  },
  {
    id: "asus",
    test: /asus|华硕|rog\b|tuf\b/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="2.5" width="11" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
        <text x="2.4" y="9" fontFamily="Inter,Arial,sans-serif" fontSize="4.2" fontWeight="700" fill="currentColor">ASUS</text>
      </svg>
    ),
    label: "ASUS",
  },
  {
    id: "ubuntu",
    test: /ubuntu|mint|elementary/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none" aria-label="Ubuntu">
        <circle cx="7" cy="7" r="5.5" fill="#E95420" stroke="#E95420" strokeWidth="0.5" />
        <circle cx="7" cy="7" r="3.5" stroke="#fff" strokeWidth="0.7" />
        <circle cx="4.8" cy="5.2" r="1" fill="none" stroke="#fff" strokeWidth="0.7" />
        <circle cx="9.2" cy="5.2" r="1" fill="none" stroke="#fff" strokeWidth="0.7" />
        <circle cx="7" cy="8.8" r="1.2" fill="none" stroke="#fff" strokeWidth="0.7" />
        <path d="M4.8 5.2L7 7l2.2-1.8M7 7v1.8" stroke="#fff" strokeWidth="0.4" strokeLinecap="round" />
      </svg>
    ),
    label: "Ubuntu",
  },
  {
    id: "debian",
    test: /debian/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <path d="M8.8 4.2c-0.6-0.7-1.7-1.1-2.8-0.8-1.7 0.4-2.8 1.8-2.5 3.4 0.3 1.8 2 2.8 4.1 2.5 1.2-0.2 2-0.7 2.4-1.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M7.3 5.5c0.5 0.5 0.5 1.5-0.1 2-0.5 0.4-1.3 0.4-1.7-0.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    ),
    label: "Debian",
  },
  {
    id: "centos",
    test: /centos|rocky|alma/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.1" />
        <path d="M7 1.8v10.4M1.8 7h10.4M3.6 3.6l6.8 6.8M10.4 3.6l-6.8 6.8" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
      </svg>
    ),
    label: "CentOS / Rocky / AlmaLinux",
  },
  {
    id: "tsinghua-linux",
    test: /tsinghua|清华|tuna|kylin|uos\b|ulinux/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.1" />
        <path d="M4 5.6c1-1.4 5-1.4 6 0M4.5 8c0.8-0.8 4.2-0.8 5 0M5.4 10.2c0.5-0.3 2.7-0.3 3.2 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
    label: "Tsinghua Linux",
  },
  {
    id: "linux",
    test: /linux|tux|fedora|arch|alpine/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <ellipse cx="7" cy="9" rx="3.5" ry="3" stroke="currentColor" strokeWidth="1.1" />
        <path d="M5.6 5C5.4 3 6 1.6 7 1.6S8.6 3 8.4 5" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="6" cy="5.4" r="0.5" fill="currentColor" />
        <circle cx="8" cy="5.4" r="0.5" fill="currentColor" />
      </svg>
    ),
    label: "Linux",
  },
  {
    id: "cisco",
    test: /cisco|catalyst|ios[-_]?xe|nx[-_]?os/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
          <path d="M3 8v-2M5 9v-4M7 10v-6M9 9v-4M11 8v-2" />
        </g>
      </svg>
    ),
    label: "Cisco",
  },
  {
    id: "h3c",
    test: /\bh3c\b|comware/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="3" width="11" height="8" rx="1" stroke="currentColor" strokeWidth="1.1" />
        <text x="3" y="9" fontFamily="Inter,Arial,sans-serif" fontSize="4" fontWeight="700" fill="currentColor">H3C</text>
      </svg>
    ),
    label: "H3C",
  },
  {
    id: "istoreos",
    test: /istoreos|istore[\s-]?os|\bistore\b|\b(sh|wx|wuxi|shanghai)[-_]?gw\b/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1" />
        <path d="M4.5 4.6h5M4.5 7h5M4.5 9.4h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <circle cx="3.5" cy="4.6" r="0.35" fill="currentColor" />
        <circle cx="3.5" cy="7" r="0.35" fill="currentColor" />
        <circle cx="3.5" cy="9.4" r="0.35" fill="currentColor" />
      </svg>
    ),
    label: "iStoreOS",
  },
  {
    id: "openwrt",
    test: /openwrt|lede|immortalwrt|friendlywrt/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <path d="M2 9C2 5.7 4.2 4 7 4s5 1.7 5 5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <circle cx="7" cy="10.5" r="1" fill="currentColor" />
      </svg>
    ),
    label: "OpenWrt",
  },
  {
    id: "proxmox",
    test: /proxmox|pve\b/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="2" width="11" height="3.5" rx="0.8" stroke="currentColor" strokeWidth="1.1" />
        <rect x="1.5" y="6.5" width="11" height="3.5" rx="0.8" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="3.5" cy="3.7" r="0.5" fill="currentColor" />
        <circle cx="3.5" cy="8.2" r="0.5" fill="currentColor" />
      </svg>
    ),
    label: "Proxmox",
  },
  {
    id: "raspberry",
    test: /\bpi\b|raspberry|rpi|raspi|树莓派/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none" aria-label="Raspberry Pi">
        <circle cx="7" cy="7" r="5.5" fill="#A22846" stroke="#A22846" strokeWidth="0.3" />
        {/* Raspberry body */}
        <ellipse cx="7" cy="9" rx="4" ry="2.5" fill="#C51A4A" />
        <ellipse cx="7" cy="8.5" rx="3.5" ry="2" fill="#E81B5C" />
        {/* Surface bumps */}
        <circle cx="5.2" cy="7.2" r="0.8" fill="#C51A4A" />
        <circle cx="7" cy="6.5" r="0.9" fill="#C51A4A" />
        <circle cx="8.8" cy="7.2" r="0.8" fill="#C51A4A" />
        <circle cx="6" cy="5.8" r="0.7" fill="#C51A4A" />
        <circle cx="8" cy="5.8" r="0.7" fill="#C51A4A" />
        {/* Leaf */}
        <path d="M7 5.5C7 4 8.5 2.5 9.5 2C9 2.8 8.5 4.2 9 5.2" fill="#6ABF4B" stroke="#4A9E2F" strokeWidth="0.3" strokeLinecap="round" />
        <path d="M7.5 5.2C7.2 4 6 2.8 5.5 2.2" stroke="#6ABF4B" strokeWidth="0.8" strokeLinecap="round" />
      </svg>
    ),
    label: "Raspberry Pi",
  },
  {
    id: "synology",
    test: /synology|qnap|truenas|nas/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <rect x="2" y="2" width="10" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
        <path d="M5 5h4M5 7h4M5 9h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    ),
    label: "NAS",
  },
];

function matchBrand(text: string) {
  return BRAND_RULES.find((rule) => rule.test.test(text));
}

export function brandIcon(host: Host) {
  // Check explicit icon override first
  if (host.iconOverride) {
    const overrideBrand = BRAND_RULES.find((r) => r.id === host.iconOverride);
    if (overrideBrand) return overrideBrand.icon;
  }

  const haystack = [host.alias, host.hostname, host.role, (host.tags || []).join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const brand = matchBrand(haystack);
  if (brand) return brand.icon;

  // Role-based fallback (legacy behaviour).
  const role = (host.role || "").toLowerCase();
  if (role.includes("router") || role.includes("openwrt")) return Icon.router;
  if (role.includes("nginx") || role.includes("edge") || role.includes("app")) return Icon.cloud;
  if (role) return Icon.server;

  // Last resort: initial of the alias inside the generic chip.
  return <span className="brand-initial">{(host.alias[0] || "?").toUpperCase()}</span>;
}

export function brandLabel(host: Host): string | null {
  const haystack = [host.alias, host.hostname, host.role, (host.tags || []).join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const brand = matchBrand(haystack);
  return brand?.label || null;
}
