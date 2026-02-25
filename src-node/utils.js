import crypto from "node:crypto";

export function utcNowIso() {
  return new Date().toISOString();
}

export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenize(value) {
  return normalizeText(value).match(/[a-z0-9]+/g) ?? [];
}

export function domainFromSiteOrUrl(value) {
  let v = String(value ?? "").trim().toLowerCase();
  if (v.includes("://")) {
    v = v.split("://", 2)[1];
  }
  if (v.includes("/")) {
    v = v.split("/", 2)[0];
  }
  return v;
}

export function shortId(prefix = "") {
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  return prefix ? `${prefix}_${id}` : id;
}

export function parseBool(value) {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "").toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

