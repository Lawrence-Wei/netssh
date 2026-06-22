/**
 * Shared helpers for host deployment scope inference and labels.
 * Used by Sidebar and HostDetail to avoid duplicate heuristics.
 */
import type { DeployScope, Host, Lang } from "../config/types";
import { t } from "./i18n";

/**
 * Infer deployment scope from host attributes.
 * Prefer explicit deployScope, then fall back to keyword heuristics.
 */
export function deployScope(host: Host): DeployScope {
  if (host.deployScope) {
    /** Normalize legacy hybrid / unknown values to local. */
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
 * Return the localized deployment scope label.
 */
export function deployScopeLabel(scope: DeployScope, lang: Lang): string {
  /** Normalize legacy values. */
  if (scope === "hybrid" || scope === "unknown") scope = "local";
  return t(scope === "cloud" ? "deploy.cloud" : "deploy.local", lang);
}

/**
 * Infer a device type keyword from host name, alias, and tags for icon selection.
 */
export function deviceTypeFromHost(host: Host): string {
  const haystack = [host.alias, host.hostname, host.role, (host.tags || []).join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/zspace|zima|nance/i.test(haystack)) return "zspace";
  if (/\bzabbix\b|\bzbx\b/i.test(haystack)) return "zabbix";
  if (/luckfox|picokvm|pico[-_ ]?kvm/i.test(haystack)) return "luckfox";
  if (/asus|asuswrt|rog[-_ ]?rapture|aimesh|rt[-_ ]?a[ctx]|gt[-_ ]?a[ctx]|tuf[-_ ]?a[ctx]/i.test(haystack)) return "asus";
  if (/huawei|hw[-_]?|vrp|usg|s5700|s6700|s7700|s9700|s12700/i.test(haystack)) return "huawei";
  if (/cisco|catalyst|ios[-_]?xe|nx[-_]?os|nexus|asa/i.test(haystack)) return "cisco";
  if (/raspberry|rpi|raspi|\bpi\b/i.test(haystack)) return "raspberry";
  if (/ubuntu/i.test(haystack)) return "ubuntu";
  if (/openwrt|lede|immortalwrt/i.test(haystack)) return "openwrt";
  if (/istoreos|istore/i.test(haystack)) return "istoreos";
  if (/windows|win10|win11/i.test(haystack)) return "windows";
  if (/macbook|imac|macos|osx/i.test(haystack)) return "macos";
  if (/router|gateway|\bgw\b|gw[-_]/i.test(haystack)) return "router";
  if (/nas|synology|qnap|truenas/i.test(haystack)) return "nas";
  return "auto";
}
