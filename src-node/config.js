import fs from "node:fs";
import path from "node:path";
import { parseBool } from "./utils.js";

const DEFAULT_CONFIG = {
  headed: false,
  hold_open_ms: 0,
  session: "amw",
  profile: "main",
  profile_dir: "./profiles",
  binary: "agent-browser",
  store_dir: "./data"
};

export function loadConfig(cwd = process.cwd()) {
  const configPath = path.join(cwd, "amw.config.json");
  let fileConfig = {};
  if (fs.existsSync(configPath)) {
    fileConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }

  const envConfig = {
    headed: process.env.AMW_HEADED !== undefined
      ? parseBool(process.env.AMW_HEADED)
      : undefined,
    hold_open_ms: process.env.AMW_HOLD_OPEN_MS !== undefined
      ? Number(process.env.AMW_HOLD_OPEN_MS)
      : undefined,
    session: process.env.AMW_SESSION,
    profile: process.env.AMW_PROFILE,
    profile_dir: process.env.AMW_PROFILE_DIR,
    binary: process.env.AMW_BINARY,
    store_dir: process.env.AMW_STORE_DIR
  };

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...Object.fromEntries(
      Object.entries(envConfig).filter(([, value]) => value !== undefined && value !== null && value !== "")
    ),
    _config_path: configPath
  };
}

export function resolveBoolOption(rawValue, fallbackValue) {
  if (rawValue === undefined || rawValue === null) return Boolean(fallbackValue);
  return parseBool(rawValue);
}

export function resolveStringOption(rawValue, fallbackValue, hardDefault = "") {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    if (fallbackValue === undefined || fallbackValue === null || fallbackValue === "") {
      return hardDefault;
    }
    return String(fallbackValue);
  }
  return String(rawValue);
}

export function resolveNumberOption(rawValue, fallbackValue, hardDefault = 0) {
  const pick = rawValue === undefined || rawValue === null || rawValue === ""
    ? (fallbackValue ?? hardDefault)
    : rawValue;
  const value = Number(pick);
  return Number.isFinite(value) ? value : hardDefault;
}
