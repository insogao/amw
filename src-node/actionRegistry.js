import fs from "node:fs";
import path from "node:path";

function isLoadState(value) {
  return ["load", "domcontentloaded", "networkidle"].includes(String(value));
}

function resolveVarPath(vars, ref) {
  if (!ref || typeof ref !== "string") return undefined;
  const parts = ref.split(".");
  let cur = vars;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

function normalizeItem(item) {
  if (typeof item === "string") return { title: item, url: "" };
  const title = String(item?.title ?? item?.name ?? "").trim();
  const url = String(item?.url ?? item?.link ?? "").trim();
  return { title, url };
}

function buildMarkdown({ title, items }) {
  const header = `# ${title}\n\n`;
  const lines = items.map((item, index) => {
    if (item.url) return `${index + 1}. [${item.title || item.url}](${item.url})`;
    return `${index + 1}. ${item.title}`;
  });
  return header + lines.join("\n") + "\n";
}

function toAbsoluteFilePath(inputPath) {
  return path.resolve(String(inputPath || "").trim());
}

function setRuntimeVar(runtime, ref, value) {
  if (!ref || typeof ref !== "string") return;
  const parts = ref.split(".");
  let cur = runtime.vars;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function getRuntimeVar(runtime, ref) {
  if (!ref || typeof ref !== "string") return undefined;
  const parts = ref.split(".");
  let cur = runtime.vars;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function ensureClipboard(runtime) {
  if (!runtime.vars.__clipboard || typeof runtime.vars.__clipboard !== "object") {
    runtime.vars.__clipboard = {};
  }
  return runtime.vars.__clipboard;
}

function resolveClip(params) {
  if (!params || typeof params !== "object") return null;
  const raw = params.clip;
  if (raw && typeof raw === "object") {
    const x = Number(raw.x);
    const y = Number(raw.y);
    const width = Number(raw.width);
    const height = Number(raw.height);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height)) {
      return { x, y, width, height };
    }
  }
  const x = Number(params.x);
  const y = Number(params.y);
  const width = Number(params.width);
  const height = Number(params.height);
  if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height)) {
    return { x, y, width, height };
  }
  return null;
}

function deriveScreenshotPath(snapshotPath) {
  const raw = String(snapshotPath || "").trim();
  if (!raw) return "";
  if (/_snapshot\.json$/i.test(raw)) {
    return raw.replace(/_snapshot\.json$/i, "_screenshot.png");
  }
  if (/\.json$/i.test(raw)) {
    return raw.replace(/\.json$/i, ".png");
  }
  return `${raw}_screenshot.png`;
}

function normalizeSnapshotPath(outputPath) {
  const raw = String(outputPath || "").trim();
  if (!raw) return "";
  const ext = path.extname(raw).toLowerCase();
  if (!ext) return `${raw}.json`;
  return raw;
}

export function createDefaultActionRegistry() {
  return new Map([
    ["open", async ({ adapter, step }) => adapter.open(step.target || step.value, step.timeout_ms)],
    ["click", async ({ adapter, step }) => adapter.click(step.target, step.timeout_ms)],
    ["click_text", async ({ adapter, step }) => {
      const text = step.value || step.target || step.params?.text || "";
      if (!text) throw new Error("click_text requires text in step.value/target/params.text");
      const exact = Boolean(step.params?.exact ?? false);
      const index = Number(step.params?.index ?? 0);
      return adapter.clickText(text, { exact, index, timeoutMs: step.timeout_ms });
    }],
    ["fill", async ({ adapter, step }) => adapter.fill(step.target, step.value, step.timeout_ms)],
    ["type", async ({ adapter, step }) => adapter.typeText(step.target, step.value, step.timeout_ms)],
    ["press", async ({ adapter, step }) => adapter.press(step.target || step.value, step.timeout_ms)],
    ["copy_text", async ({ adapter, runtime, step }) => {
      let text = "";
      if (step.target) {
        const attr = String(step.params?.attr || "").trim();
        if (attr) {
          text = await adapter.getAttribute(step.target, attr, step.timeout_ms);
        } else {
          text = await adapter.getText(step.target, step.timeout_ms);
          if (!text) {
            const inputValue = await adapter.getAttribute(step.target, "value", step.timeout_ms);
            if (inputValue) text = inputValue;
          }
        }
      } else if (step.value) {
        text = String(step.value);
      } else if (step.params?.from_var) {
        const fromVar = getRuntimeVar(runtime, String(step.params.from_var));
        text = fromVar == null ? "" : String(fromVar);
      } else {
        text = String(runtime.last_result ?? "");
      }
      const clipboard = ensureClipboard(runtime);
      clipboard.text = text;
      const saveAs = String(step.params?.save_as || "").trim();
      if (saveAs) setRuntimeVar(runtime, saveAs, text);
      return { copied: true, type: "text", chars: text.length };
    }],
    ["paste_text", async ({ adapter, runtime, step }) => {
      let text = "";
      if (step.value) {
        text = String(step.value);
      } else if (step.params?.from_var) {
        const fromVar = getRuntimeVar(runtime, String(step.params.from_var));
        text = fromVar == null ? "" : String(fromVar);
      } else {
        const clipboard = ensureClipboard(runtime);
        text = String(clipboard.text ?? "");
      }
      if (step.target) {
        await adapter.fill(step.target, text, step.timeout_ms);
      } else {
        await adapter.insertText(text, step.timeout_ms);
      }
      return { pasted: true, type: "text", chars: text.length };
    }],
    ["capture_image", async ({ adapter, runtime, step }) => {
      const selector = String(step.params?.selector || step.target || "").trim();
      const outputPath = String(step.params?.path || step.value || "").trim();
      const clip = resolveClip(step.params);
      const wantsOriginal = Boolean(step.params?.original ?? false) || String(step.params?.mode || "").toLowerCase() === "original";
      const originalMode = wantsOriginal && Boolean(selector);
      if (!selector && !clip) {
        throw new Error("capture_image requires selector (target/params.selector) or clip (params.clip/x/y/width/height)");
      }
      const result = originalMode
        ? await adapter.copyImageOriginal({
            selector,
            path: outputPath || "",
            attr: step.params?.attr,
            timeoutMs: step.timeout_ms
          })
        : await adapter.screenshot({
            path: outputPath || `./artifacts/captured_image_${Date.now()}.png`,
            selector,
            clip,
            fullPage: false,
            timeoutMs: step.timeout_ms
          });
      const clipboard = ensureClipboard(runtime);
      clipboard.image_path = result.path;
      if (result.url) clipboard.image_url = result.url;
      const saveAs = String(step.params?.save_as || "").trim();
      if (saveAs) setRuntimeVar(runtime, saveAs, result.path);
      runtime.artifacts.generated_files.push(result.path);
      return { captured: true, type: "image", path: result.path };
    }],
    ["download_image", async ({ adapter, runtime, step }) => {
      const selector = String(step.params?.selector || step.target || "").trim();
      if (/^https?:\/\//i.test(selector)) {
        throw new Error("download_image expects a page selector, not a URL. Use download_url for URL downloads.");
      }
      if (!selector) throw new Error("download_image requires selector in target or params.selector");
      const outputPath = String(step.params?.path || step.value || "").trim();
      const result = await adapter.copyImageOriginal({
        selector,
        path: outputPath || "",
        attr: step.params?.attr,
        timeoutMs: step.timeout_ms
      });
      const clipboard = ensureClipboard(runtime);
      clipboard.image_path = result.path;
      if (result.url) clipboard.image_url = result.url;
      const saveAs = String(step.params?.save_as || "").trim();
      if (saveAs) setRuntimeVar(runtime, saveAs, result.path);
      runtime.artifacts.generated_files.push(result.path);
      return { downloaded: true, type: "image_original", path: result.path, source: result.source };
    }],
    ["download_url", async ({ adapter, runtime, step }) => {
      const url = String(step.value || step.target || step.params?.url || "").trim();
      if (!url) throw new Error("download_url requires url in step.value/target/params.url");
      const outputPath = String(step.params?.path || "").trim();
      const result = await adapter.downloadFromUrl({
        url,
        path: outputPath || "",
        headers: step.params?.headers && typeof step.params.headers === "object" ? step.params.headers : {},
        timeoutMs: step.timeout_ms
      });
      const saveAs = String(step.params?.save_as || "").trim();
      if (saveAs) setRuntimeVar(runtime, saveAs, result.path);
      runtime.artifacts.generated_files.push(result.path);
      return { downloaded: true, type: "url", path: result.path, url: result.url, status: result.status };
    }],
    ["paste_image", async ({ adapter, runtime, step }) => {
      const selector = String(step.target || step.params?.selector || "").trim();
      if (!selector) throw new Error("paste_image requires file input selector");
      let imagePath = "";
      if (step.value) {
        imagePath = String(step.value);
      } else if (step.params?.from_var) {
        const fromVar = getRuntimeVar(runtime, String(step.params.from_var));
        imagePath = fromVar == null ? "" : String(fromVar);
      } else {
        const clipboard = ensureClipboard(runtime);
        imagePath = String(clipboard.image_path ?? "");
      }
      if (!imagePath) throw new Error("paste_image has no source path");
      const result = await adapter.setInputFiles(selector, imagePath, step.timeout_ms);
      return { pasted: true, type: "image", ...result };
    }],
    ["wait", async ({ adapter, step }) => {
      if (isLoadState(step.target)) {
        return adapter.waitLoad(step.target, step.timeout_ms);
      }
      const waitValue = Number(step.value || step.target || step.params?.ms || 1000);
      return adapter.waitMs(waitValue);
    }],
    ["snapshot", async ({ adapter, step, runtime }) => {
      const interactiveToken = String(
        step.params?.interactive ?? step.value ?? step.target ?? ""
      ).toLowerCase();
      const interactive = ["1", "true", "i", "interactive"].includes(interactiveToken);
      const result = await adapter.snapshot(interactive);
      const outputPath = normalizeSnapshotPath(step.params?.path);
      const defaultBundle = Boolean(outputPath);
      const bundleWithScreenshot = step.params?.bundle_with_screenshot === undefined
        ? defaultBundle
        : Boolean(step.params?.bundle_with_screenshot);
      let snapshotAbsolute = "";
      if (!outputPath) {
        if (!bundleWithScreenshot) return result;
      } else {
        snapshotAbsolute = path.resolve(outputPath);
        fs.mkdirSync(path.dirname(snapshotAbsolute), { recursive: true });
        fs.writeFileSync(
          snapshotAbsolute,
          `${JSON.stringify(
            {
              snapshot: result.snapshot,
              refs: result.refs
            },
            null,
            2
          )}\n`,
          "utf-8"
        );
        runtime.artifacts.generated_files.push(snapshotAbsolute);
      }

      if (!bundleWithScreenshot) {
        return snapshotAbsolute ? { ...result, path: snapshotAbsolute } : result;
      }

      const screenshotPathRaw = String(
        step.params?.screenshot_path ||
          deriveScreenshotPath(outputPath) ||
          `./artifacts/probes/snapshot_${Date.now()}_screenshot.png`
      ).trim();
      const screenshot = await adapter.screenshot({
        path: screenshotPathRaw,
        fullPage: true,
        timeoutMs: step.timeout_ms
      });
      runtime.artifacts.generated_files.push(screenshot.path);
      return {
        ...result,
        ...(snapshotAbsolute ? { path: snapshotAbsolute } : {}),
        screenshot_path: screenshot.path
      };
    }],
    ["screenshot", async ({ adapter, step, runtime }) => {
      const outputPath = String(step.target || step.value || step.params?.path || "").trim();
      const selector = String(step.params?.selector || "").trim();
      const fullPage = Boolean(step.params?.full_page ?? false);
      const clip = resolveClip(step.params);
      const result = await adapter.screenshot({
        path: outputPath,
        selector,
        clip,
        fullPage,
        timeoutMs: step.timeout_ms
      });
      runtime.artifacts.generated_files.push(result.path);
      return result;
    }],
    ["get_url", async ({ adapter }) => ({ url: await adapter.getUrl() })],
    ["eval_js", async ({ adapter, step }) => {
      const script = String(step.value || step.params?.script || "").trim();
      if (!script) throw new Error("eval_js requires JavaScript in step.value or params.script");
      const arg = step.params?.arg;
      return adapter.evaluate(script, arg);
    }],
    ["write_markdown", async ({ runtime, step }) => {
      const outputPath = String(step.target || step.value || step.params?.path || "").trim();
      if (!outputPath) throw new Error("write_markdown requires output path in target/value/params.path");

      const title = String(step.params?.title || "Generated Results");
      const itemsRef = String(step.params?.items_var || "").trim();
      const dataFromVar = itemsRef ? resolveVarPath(runtime.vars, itemsRef) : undefined;
      const rawItems = dataFromVar ?? step.params?.items ?? [];
      if (!Array.isArray(rawItems)) {
        throw new Error(`write_markdown items must be array, got: ${typeof rawItems}`);
      }

      const items = rawItems.map(normalizeItem).filter((x) => x.title || x.url);
      const markdown = buildMarkdown({ title, items });
      const absoluteOutputPath = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
      fs.writeFileSync(absoluteOutputPath, markdown, "utf-8");
      runtime.artifacts.generated_files.push(absoluteOutputPath);
      return { path: absoluteOutputPath, items: items.length };
    }],
    ["append_markdown_section", async ({ runtime, step }) => {
      const inputPath = String(step.target || step.value || step.params?.path || "").trim();
      if (!inputPath) throw new Error("append_markdown_section requires path");

      const absoluteInputPath = toAbsoluteFilePath(inputPath);
      fs.mkdirSync(path.dirname(absoluteInputPath), { recursive: true });

      const heading = String(step.params?.heading || "").trim();
      const content = String(step.params?.content || "").trim();
      const sourceUrl = String(step.params?.url || "").trim();
      if (!heading && !content && !sourceUrl) {
        throw new Error("append_markdown_section requires at least heading/content/url");
      }

      const lines = [];
      lines.push("");
      lines.push(`## ${heading || "Section"}`);
      if (sourceUrl) lines.push(`Source: [${sourceUrl}](${sourceUrl})`);
      lines.push("");
      if (content) lines.push(content);
      lines.push("");

      fs.appendFileSync(absoluteInputPath, lines.join("\n"), "utf-8");
      if (!runtime.artifacts.generated_files.includes(absoluteInputPath)) {
        runtime.artifacts.generated_files.push(absoluteInputPath);
      }
      return { path: absoluteInputPath, appended: true };
    }],
    ["assert_file", async ({ step }) => {
      const inputPath = String(step.target || step.value || step.params?.path || "").trim();
      if (!inputPath) throw new Error("assert_file requires path");
      const absoluteInputPath = toAbsoluteFilePath(inputPath);
      if (!fs.existsSync(absoluteInputPath)) {
        throw new Error(`File not found: ${absoluteInputPath}`);
      }
      const stat = fs.statSync(absoluteInputPath);
      const minBytes = Number(step.params?.min_bytes ?? 1);
      if (stat.size < minBytes) {
        throw new Error(`File size ${stat.size} < expected ${minBytes}`);
      }
      return { path: absoluteInputPath, size: stat.size };
    }],
    ["assert_markdown", async ({ step }) => {
      const inputPath = String(step.target || step.value || step.params?.path || "").trim();
      if (!inputPath) throw new Error("assert_markdown requires input path in target/value/params.path");
      const absoluteInputPath = path.resolve(inputPath);
      if (!fs.existsSync(absoluteInputPath)) {
        throw new Error(`Markdown file not found: ${absoluteInputPath}`);
      }
      const text = fs.readFileSync(absoluteInputPath, "utf-8");
      const links = [...text.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)];
      const minLinks = Number(step.params?.min_links ?? 1);
      if (links.length < minLinks) {
        throw new Error(`Markdown link count ${links.length} < expected ${minLinks}`);
      }
      const mustInclude = Array.isArray(step.params?.must_include) ? step.params.must_include : [];
      for (const token of mustInclude) {
        if (!text.includes(String(token))) {
          throw new Error(`Markdown missing required token: ${token}`);
        }
      }
      return { path: absoluteInputPath, link_count: links.length };
    }]
  ]);
}
