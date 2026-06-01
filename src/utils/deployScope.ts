/**
 * 主机部署位置推断与标签的共享工具函数。
 * 在 Sidebar 和 HostDetail 中均有使用，提取到此模块以避免重复代码。
 */
import type { DeployScope, Host, Lang } from "../types";

/**
 * 根据主机属性推断部署位置（本地 / 云端）。
 * 优先使用显式 deployScope 字段，否则通过关键字启发式匹配。
 */
export function deployScope(host: Host): DeployScope {
  if (host.deployScope) {
    /** 将旧的 hybrid / unknown 归一化为 local */
    if (host.deployScope === "hybrid" || host.deployScope === "unknown") return "local";
    return host.deployScope;
  }
  const haystack = [host.group, host.role, host.env, host.hostname, (host.tags || []).join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/cloud|vps|aws|azure|gcp|aliyun|tencent|oracle|lightsail|linode|digitalocean/.test(haystack)) return "cloud";
  return "local";
}

/**
 * 返回部署位置的国际化标签文本。
 */
export function deployScopeLabel(scope: DeployScope, lang: Lang): string {
  /** 将旧值归一化 */
  if (scope === "hybrid" || scope === "unknown") scope = "local";
  const zh: Record<string, string> = { local: "本地", cloud: "云端" };
  const en: Record<string, string> = { local: "Local", cloud: "Cloud" };
  return lang === "zh" ? zh[scope] || "本地" : en[scope] || "Local";
}

/**
 * 根据主机名、别名、标签等推断设备类型关键词，供图标自动选择使用。
 */
export function deviceTypeFromHost(host: Host): string {
  const haystack = [host.alias, host.hostname, host.role, (host.tags || []).join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/zspace|zima|极空间|nance/i.test(haystack)) return "zspace";
  if (/raspberry|rpi|raspi|树莓派|\bpi\b/i.test(haystack)) return "raspberry";
  if (/ubuntu/i.test(haystack)) return "ubuntu";
  if (/openwrt|lede|immortalwrt/i.test(haystack)) return "openwrt";
  if (/istoreos|istore/i.test(haystack)) return "istoreos";
  if (/windows|win10|win11/i.test(haystack)) return "windows";
  if (/macbook|imac|macos|osx/i.test(haystack)) return "macos";
  if (/router|gateway|gw\b/i.test(haystack)) return "router";
  if (/nas|synology|qnap|truenas/i.test(haystack)) return "nas";
  return "auto";
}
