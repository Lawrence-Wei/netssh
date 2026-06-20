// Brand-aware host icon picker. Falls back to a role-based generic icon when no
// brand match exists. Prefers real logo images from assets/icons/ over hand-drawn SVGs.

import type { ReactNode } from "react";
import type { Host } from "../config/types";
import { Icon } from "./Icons";

import zspaceImg from "../assets/icons/zspace-logo.png";
import luckfoxImg from "../assets/icons/luckfox.png";
import istoreosImg from "../assets/icons/istoreos-openwrt.svg";
import almaLinuxImg from "../assets/icons/dashboard-icons/alma-linux.svg";
import appleImg from "../assets/icons/dashboard-icons/apple.svg";
import asusImg from "../assets/icons/dashboard-icons/asus.svg";
import centosImg from "../assets/icons/dashboard-icons/centos.svg";
import ciscoImg from "../assets/icons/dashboard-icons/cisco.svg";
import debianLinuxImg from "../assets/icons/dashboard-icons/debian-linux.svg";
import huaweiImg from "../assets/icons/dashboard-icons/huawei.svg";
import microsoftWindowsImg from "../assets/icons/dashboard-icons/microsoft-windows.svg";
import openwrtImg from "../assets/icons/dashboard-icons/openwrt.svg";
import proxmoxImg from "../assets/icons/dashboard-icons/proxmox.svg";
import qnapImg from "../assets/icons/dashboard-icons/qnap.svg";
import raspberryPiImg from "../assets/icons/dashboard-icons/raspberry-pi.svg";
import rockyLinuxImg from "../assets/icons/dashboard-icons/rocky-linux.svg";
import synologyImg from "../assets/icons/dashboard-icons/synology.svg";
import truenasImg from "../assets/icons/dashboard-icons/truenas.svg";
import linuxImg from "../assets/icons/dashboard-icons/tux.svg";
import ubuntuImg from "../assets/icons/dashboard-icons/ubuntu-linux.svg";
import windows11Img from "../assets/icons/dashboard-icons/windows-11.webp";

interface BrandRule {
  id: string;
  test: RegExp;
  icon: ReactNode;
  label: string;
}

const BRAND_RULES: BrandRule[] = [
  {
    id: "zabbix",
    test: /\bzabbix\b|\bzbx\b/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none" aria-label="Zabbix">
        <rect x="1.2" y="1.2" width="11.6" height="11.6" rx="2.2" fill="#D40000" />
        <path d="M4 4h6L4.3 10H10" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    label: "Zabbix",
  },
  {
    id: "zspace",
    test: /zspace|z-space|zima|nance/i,
    icon: <img src={zspaceImg} alt="ZSpace" className="brand-img" />,
    label: "ZSpace",
  },
  {
    id: "luckfox",
    test: /luckfox|picokvm|pico[-_ ]?kvm|luckfox[-_ ]?(pico|lyra|aura|lume)/i,
    icon: <img src={luckfoxImg} alt="Luckfox" className="brand-img" />,
    label: "Luckfox",
  },
  {
    id: "windows11",
    test: /windows[\s-]?11|win[\s-]?11|win11|w11/i,
    icon: <img src={windows11Img} alt="Windows 11" className="brand-img" />,
    label: "Windows 11",
  },
  {
    id: "windows",
    test: /windows|win10|win[\s-]?10|microsoft/i,
    icon: <img src={microsoftWindowsImg} alt="Windows" className="brand-img" />,
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
    test: /huawei|hw[-_]?|vrp|usg|s5700|s6700|s7700|s9700|s12700/i,
    icon: <img src={huaweiImg} alt="Huawei" className="brand-img" />,
    label: "Huawei Switch",
  },
  {
    id: "macos",
    test: /^macbook|imac|macmini|apple|osx|macos|mac[-_]?/i,
    icon: <img src={appleImg} alt="macOS" className="brand-img" />,
    label: "macOS",
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
    test: /asus|asuswrt|rog\b|tuf\b|aimesh|rt[-_ ]?a[ctx]|gt[-_ ]?a[ctx]/i,
    icon: <img src={asusImg} alt="ASUS" className="brand-img" />,
    label: "ASUS Router",
  },
  {
    id: "ubuntu",
    test: /ubuntu|mint|elementary/i,
    icon: <img src={ubuntuImg} alt="Ubuntu" className="brand-img" />,
    label: "Ubuntu",
  },
  {
    id: "debian",
    test: /debian/i,
    icon: <img src={debianLinuxImg} alt="Debian" className="brand-img" />,
    label: "Debian",
  },
  {
    id: "centos",
    test: /centos/i,
    icon: <img src={centosImg} alt="CentOS" className="brand-img" />,
    label: "CentOS",
  },
  {
    id: "rocky",
    test: /rocky/i,
    icon: <img src={rockyLinuxImg} alt="Rocky Linux" className="brand-img" />,
    label: "Rocky Linux",
  },
  {
    id: "alma",
    test: /alma/i,
    icon: <img src={almaLinuxImg} alt="AlmaLinux" className="brand-img" />,
    label: "AlmaLinux",
  },
  {
    id: "tsinghua-linux",
    test: /tsinghua|tuna|kylin|uos\b|ulinux/i,
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
    icon: <img src={linuxImg} alt="Linux" className="brand-img" />,
    label: "Linux",
  },
  {
    id: "cisco",
    test: /cisco|catalyst|ios[-_]?xe|nx[-_]?os/i,
    icon: <img src={ciscoImg} alt="Cisco" className="brand-img" />,
    label: "Cisco Switch",
  },
  {
    id: "h3c",
    test: /\bh3c\b|comware/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none" aria-label="H3C">
        <rect x="0.5" y="0.5" width="13" height="13" rx="2" fill="#E60012" />
        <text x="7" y="10.2" fontFamily="Arial,Helvetica,sans-serif" fontSize="6.2" fontWeight="900" fill="#fff" textAnchor="middle" letterSpacing="-0.3">H3C</text>
      </svg>
    ),
    label: "H3C",
  },
  {
    id: "istoreos",
    test: /istoreos|istore[\s-]?os|\bistore\b|\b(sh|wx|wuxi|shanghai)[-_]?gw(?:[-_]\w+)?\b/i,
    icon: <img src={istoreosImg} alt="iStoreOS" className="brand-img" />,
    label: "iStoreOS",
  },
  {
    id: "openwrt",
    test: /openwrt|lede|immortalwrt|friendlywrt/i,
    icon: <img src={openwrtImg} alt="OpenWrt" className="brand-img" />,
    label: "OpenWrt",
  },
  {
    id: "proxmox",
    test: /proxmox|pve\b/i,
    icon: <img src={proxmoxImg} alt="Proxmox" className="brand-img" />,
    label: "Proxmox",
  },
  {
    id: "raspberry",
    test: /\bpi\b|raspberry|rpi|raspi/i,
    icon: <img src={raspberryPiImg} alt="Raspberry Pi" className="brand-img" />,
    label: "Raspberry Pi",
  },
  {
    id: "synology",
    test: /synology|dsm/i,
    icon: <img src={synologyImg} alt="Synology" className="brand-img" />,
    label: "Synology",
  },
  {
    id: "qnap",
    test: /qnap/i,
    icon: <img src={qnapImg} alt="QNAP" className="brand-img" />,
    label: "QNAP",
  },
  {
    id: "truenas",
    test: /truenas|freenas/i,
    icon: <img src={truenasImg} alt="TrueNAS" className="brand-img" />,
    label: "TrueNAS",
  },
  {
    id: "router",
    test: /\b(router|gateway)\b|\bgw\b|\b(pr|sh|wx|wuxi|shanghai)[-_]?gw(?:[-_]\w+)?\b/i,
    icon: Icon.router,
    label: "Router / Gateway",
  },
  {
    id: "nas",
    test: /nas|storage|openmediavault|unraid|xigmanas/i,
    icon: (
      <svg viewBox="0 0 14 14" fill="none">
        <rect x="2" y="2" width="10" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
        <path d="M5 5h4M5 7h4M5 9h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    ),
    label: "NAS / Storage",
  },
  {
    id: "server",
    test: /\b(server|srv)\b/i,
    icon: Icon.server,
    label: "Server",
  },
];

function matchBrand(text: string) {
  return BRAND_RULES.find((rule) => rule.test.test(text));
}

function matchSemanticBrand(text: string) {
  return BRAND_RULES.find((rule) => ["zabbix", "router", "server"].includes(rule.id) && rule.test.test(text));
}

function brandRuleById(id: string) {
  const normalized = id === "apple" ? "macos" : id;
  return BRAND_RULES.find((rule) => rule.id === normalized);
}

function isGenericOsBrand(id: string) {
  return ["linux", "ubuntu", "debian", "centos", "rocky", "alma"].includes(id);
}

function isGenericOverrideBrand(id: string) {
  return ["router", "server", "nas", "proxmox"].includes(id) || isGenericOsBrand(id);
}

function isSpecificInferredBrand(id: string) {
  return !["router", "server", "nas", "linux", "ubuntu", "debian", "centos", "rocky", "alma", "proxmox"].includes(id);
}

function inferredBrandOverridesIcon(inferredId: string, overrideId: string) {
  return inferredId !== overrideId && isSpecificInferredBrand(inferredId) && isGenericOverrideBrand(overrideId);
}

function semanticBrandOverridesIcon(semanticId: string, overrideId: string) {
  if (semanticId === "zabbix") return true;
  if (semanticId === "router") return isGenericOsBrand(overrideId) || overrideId === "proxmox" || overrideId === "server";
  if (semanticId === "server") return isGenericOsBrand(overrideId);
  return false;
}

function resolvedBrand(host: Host) {
  const haystack = [host.alias, host.hostname, host.role, host.env, (host.tags || []).join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const semanticBrand = matchSemanticBrand(haystack);
  const inferredBrand = matchBrand(haystack);

  if (host.iconOverride) {
    const overrideBrand = brandRuleById(host.iconOverride);
    if (overrideBrand && inferredBrand && inferredBrandOverridesIcon(inferredBrand.id, overrideBrand.id)) {
      return inferredBrand;
    }
    if (overrideBrand && semanticBrand && semanticBrandOverridesIcon(semanticBrand.id, overrideBrand.id)) {
      return semanticBrand;
    }
    if (overrideBrand) return overrideBrand;
  }

  return inferredBrand || null;
}

export function brandIcon(host: Host) {
  const brand = resolvedBrand(host);
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
  return resolvedBrand(host)?.label || null;
}
