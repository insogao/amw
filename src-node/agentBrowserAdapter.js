import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import { BrowserManager } from "agent-browser/dist/browser.js";

export class AgentBrowserError extends Error {}

function normalizeProfileName(raw) {
  const value = String(raw ?? "main").trim() || "main";
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new AgentBrowserError(
      `Invalid profile name '${value}'. Use only letters, numbers, underscore, hyphen.`
    );
  }
  return value;
}

export class AgentBrowserAdapter {
  constructor({
    binary = "agent-browser",
    session = "amw",
    headed = false,
    profile = "main",
    profileDir = "./profiles"
  } = {}) {
    this.binary = binary;
    this.session = session;
    this.headed = headed;
    this.profile = normalizeProfileName(profile);
    this.profileDir = path.resolve(String(profileDir || "./profiles"));
    this.manager = new BrowserManager();
    this.launched = false;
  }

  async #ensureLaunched() {
    if (this.launched && this.manager.isLaunched()) {
      return;
    }
    const profilePath = path.join(this.profileDir, this.profile);
    fs.mkdirSync(profilePath, { recursive: true });
    await this.manager.launch({
      id: "launch",
      action: "launch",
      headless: !this.headed,
      profile: profilePath
    });
    this.launched = true;
  }

  async open(url, timeoutMs = 60000) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    return { url: page.url() };
  }

  async click(selector, timeoutMs = 30000) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    await page.locator(selector).first().click({ timeout: timeoutMs });
    return { ok: true };
  }

  async fill(selector, text, timeoutMs = 30000) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    await page.locator(selector).first().fill(text, { timeout: timeoutMs });
    return { ok: true };
  }

  async focus(selector, timeoutMs = 30000) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    await page.locator(selector).first().focus({ timeout: timeoutMs });
    return { ok: true };
  }

  async typeText(selector, text, timeoutMs = 30000) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    await page.locator(selector).first().type(text, { timeout: timeoutMs });
    return { ok: true };
  }

  async press(key, timeoutMs = 30000) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    page.setDefaultTimeout(timeoutMs);
    await page.keyboard.press(key);
    return { ok: true };
  }

  async insertText(text, timeoutMs = 30000) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    page.setDefaultTimeout(timeoutMs);
    await page.keyboard.insertText(String(text ?? ""));
    return { ok: true };
  }

  async waitMs(valueMs) {
    await this.#ensureLaunched();
    await sleep(Math.max(0, Number(valueMs)));
    return { waited_ms: Number(valueMs) };
  }

  async waitLoad(state = "networkidle", timeoutMs = 60000) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    const waitUntil = ["load", "domcontentloaded", "networkidle"].includes(state) ? state : "networkidle";
    await page.waitForLoadState(waitUntil, { timeout: timeoutMs });
    return { ok: true };
  }

  async snapshot(interactive = false) {
    await this.#ensureLaunched();
    const snap = await this.manager.getSnapshot({ interactive });
    return { snapshot: snap.tree, refs: snap.refs };
  }

  async getUrl() {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    return String(page.url() || "");
  }

  async clickText(text, { exact = false, index = 0, timeoutMs = 30000 } = {}) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    await page.getByText(text, { exact }).nth(index).click({ timeout: timeoutMs });
    return { ok: true, text, index, exact };
  }

  async evaluate(script, arg = undefined, timeoutMs = 60000) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    page.setDefaultTimeout(timeoutMs);
    const source = String(script ?? "").trim();
    if (!source) {
      throw new Error("evaluate requires non-empty script");
    }
    return page.evaluate(
      ({ fnSource, fnArg }) => {
        const src = String(fnSource || "").trim();
        if (!src) return null;

        // Support both styles:
        // 1) function body script: "return {...};"
        // 2) function expression: "() => ({...})" / "function(arg){...}"
        if (src.startsWith("(") || src.startsWith("function") || src.includes("=>")) {
          try {
            const maybeFn = (0, eval)(src);
            if (typeof maybeFn === "function") {
              return maybeFn(fnArg);
            }
          } catch {
            // fall back to function-body mode
          }
        }

        const bodyFn = new Function("arg", src);
        return bodyFn(fnArg);
      },
      { fnSource: source, fnArg: arg }
    );
  }

  async getText(selector, timeoutMs = 30000) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    const text = await page.locator(selector).first().innerText({ timeout: timeoutMs });
    return String(text ?? "");
  }

  async getAttribute(selector, attr, timeoutMs = 30000) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    const value = await page.locator(selector).first().getAttribute(attr, { timeout: timeoutMs });
    return value == null ? "" : String(value);
  }

  async setInputFiles(selector, files, timeoutMs = 30000) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    const normalized = (Array.isArray(files) ? files : [files]).map((p) => path.resolve(String(p)));
    await page.locator(selector).first().setInputFiles(normalized, { timeout: timeoutMs });
    return { ok: true, files: normalized };
  }

  async copyImageOriginal({ selector, path: outputPath = "", attr = "src", timeoutMs = 30000 } = {}) {
    await this.#ensureLaunched();
    if (!selector) throw new Error("copyImageOriginal requires selector");
    const page = this.manager.getPage();
    page.setDefaultTimeout(timeoutMs);

    const info = await page.locator(selector).first().evaluate(
      async (el, { inputAttr }) => {
        const pickFromImage = async (img, preferredAttr) => {
          if (!img) return { src: "", data_url: "", tag: "none" };
          const preferred = String(preferredAttr || "").trim();
          let src = "";
          if (preferred) src = img.getAttribute(preferred) || "";
          if (!src) src = img.currentSrc || img.src || img.getAttribute("src") || "";
          if (!src) src = img.getAttribute("data-src") || img.getAttribute("data-original") || "";
          src = String(src || "").trim();

          if (src.startsWith("data:")) {
            return { src: "", data_url: src, tag: "img" };
          }
          if (src.startsWith("blob:")) {
            try {
              const res = await fetch(src);
              const blob = await res.blob();
              const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(String(reader.result || ""));
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              return { src: "", data_url: dataUrl, tag: "img" };
            } catch {
              return { src: "", data_url: "", tag: "img" };
            }
          }
          return { src, data_url: "", tag: "img" };
        };

        const tag = String(el.tagName || "").toLowerCase();
        if (tag === "img") {
          return pickFromImage(el, inputAttr);
        }
        if (tag === "canvas") {
          try {
            const dataUrl = el.toDataURL("image/png");
            return { src: "", data_url: dataUrl, tag: "canvas" };
          } catch {
            return { src: "", data_url: "", tag: "canvas" };
          }
        }
        const nestedImg = el.querySelector("img");
        return pickFromImage(nestedImg, inputAttr);
      },
      { inputAttr: attr }
    );

    if (!info?.src && !info?.data_url) {
      throw new Error(`No image source found for selector: ${selector}`);
    }

    const mimeToExt = (mime) => {
      const m = String(mime || "").toLowerCase();
      if (m.includes("png")) return ".png";
      if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
      if (m.includes("webp")) return ".webp";
      if (m.includes("gif")) return ".gif";
      if (m.includes("bmp")) return ".bmp";
      if (m.includes("svg")) return ".svg";
      return ".png";
    };

    const defaultPathByMime = (mime) => path.resolve(`./artifacts/copied_image_original_${Date.now()}${mimeToExt(mime)}`);
    const defaultPathByUrl = (rawUrl) => {
      try {
        const u = new URL(rawUrl);
        const base = path.basename(u.pathname || "");
        if (!base || !base.includes(".")) return path.resolve(`./artifacts/copied_image_original_${Date.now()}.png`);
        return path.resolve(`./artifacts/${base}`);
      } catch {
        return path.resolve(`./artifacts/copied_image_original_${Date.now()}.png`);
      }
    };

    if (info.data_url) {
      const dataUrl = String(info.data_url);
      const commaIdx = dataUrl.indexOf(",");
      if (commaIdx < 0) throw new Error("Invalid data URL image");
      const meta = dataUrl.slice(5, commaIdx);
      const payload = dataUrl.slice(commaIdx + 1);
      const mime = meta.split(";")[0] || "";
      const isBase64 = /;base64/i.test(meta);
      const finalPath = outputPath ? path.resolve(outputPath) : defaultPathByMime(mime);
      fs.mkdirSync(path.dirname(finalPath), { recursive: true });
      const body = isBase64
        ? Buffer.from(payload, "base64")
        : Buffer.from(decodeURIComponent(payload), "utf-8");
      fs.writeFileSync(finalPath, body);
      return { path: finalPath, source: "data_url", mime_type: mime || null, selector };
    }

    const rawSrc = String(info.src);
    const absoluteUrl = new URL(rawSrc, page.url()).toString();
    const finalPath = outputPath ? path.resolve(outputPath) : defaultPathByUrl(absoluteUrl);
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    const referer = String(page.url() || "");
    const headers = {
      referer,
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    };
    try {
      const origin = new URL(referer).origin;
      if (origin) headers.origin = origin;
    } catch {
      // ignore invalid referer URL
    }
    const requestHeaders = Object.fromEntries(
      Object.entries(headers).filter(([, value]) => value !== undefined && value !== null && value !== "")
    );
    const response = await page.request.get(absoluteUrl, {
      timeout: timeoutMs,
      headers: requestHeaders
    });
    if (!response.ok()) {
      throw new Error(`Failed to download image: ${absoluteUrl}, status=${response.status()}`);
    }
    const body = await response.body();
    fs.writeFileSync(finalPath, body);
    const responseHeaders = response.headers();
    return {
      path: finalPath,
      source: "url",
      selector,
      url: absoluteUrl,
      status: response.status(),
      mime_type: responseHeaders["content-type"] || null
    };
  }

  async screenshot({
    path: outputPath = "",
    selector = "",
    fullPage = false,
    clip = null,
    timeoutMs = 30000
  } = {}) {
    await this.#ensureLaunched();
    const page = this.manager.getPage();
    page.setDefaultTimeout(timeoutMs);
    let finalPath = outputPath ? path.resolve(outputPath) : path.resolve(`./artifacts/screenshot_${Date.now()}.png`);
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });

    if (selector) {
      await page.locator(selector).first().screenshot({ path: finalPath, timeout: timeoutMs });
    } else if (clip) {
      await page.screenshot({
        path: finalPath,
        clip: {
          x: Number(clip.x),
          y: Number(clip.y),
          width: Number(clip.width),
          height: Number(clip.height)
        },
        timeout: timeoutMs
      });
    } else {
      await page.screenshot({ path: finalPath, fullPage: Boolean(fullPage), timeout: timeoutMs });
    }
    return { path: finalPath, selector: selector || null, full_page: Boolean(fullPage), clip: clip || null };
  }

  async close() {
    if (!this.manager.isLaunched()) return { closed: false };
    await this.manager.close();
    this.launched = false;
    return { closed: true };
  }

  async executeStep(step) {
    const action = step.action;
    if (action === "open") return this.open(step.target, step.timeout_ms);
    if (action === "click") return this.click(step.target, step.timeout_ms);
    if (action === "fill") return this.fill(step.target, step.value, step.timeout_ms);
    if (action === "type") return this.typeText(step.target, step.value, step.timeout_ms);
    if (action === "press") return this.press(step.target || step.value, step.timeout_ms);
    if (action === "wait") {
      if (["load", "domcontentloaded", "networkidle"].includes(step.target)) {
        return this.waitLoad(step.target, step.timeout_ms);
      }
      const waitValue = Number(step.value || step.target || 1000);
      return this.waitMs(waitValue);
    }
    if (action === "snapshot") {
      const interactive = ["1", "true", "i", "interactive"].includes(
        String(step.target ?? "").toLowerCase()
      );
      return this.snapshot(interactive);
    }
    if (action === "get_url") return { url: await this.getUrl() };
    throw new AgentBrowserError(`Unsupported action: ${action}`);
  }
}
