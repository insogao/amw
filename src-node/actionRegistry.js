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

export function createDefaultActionRegistry() {
  return new Map([
    ["open", async ({ adapter, step }) => adapter.open(step.target, step.timeout_ms)],
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
    ["copy_image", async ({ adapter, runtime, step }) => {
      const selector = String(step.params?.selector || step.target || "").trim();
      const outputPath = String(step.params?.path || step.value || "").trim();
      const clip = resolveClip(step.params);
      const wantsOriginal = Boolean(step.params?.original ?? false) || String(step.params?.mode || "").toLowerCase() === "original";
      const originalMode = wantsOriginal && Boolean(selector);
      if (!selector && !clip) {
        throw new Error("copy_image requires selector (target/params.selector) or clip (params.clip/x/y/width/height)");
      }
      const result = originalMode
        ? await adapter.copyImageOriginal({
            selector,
            path: outputPath || "",
            attr: step.params?.attr,
            timeoutMs: step.timeout_ms
          })
        : await adapter.screenshot({
            path: outputPath || `./artifacts/copied_image_${Date.now()}.png`,
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
      return { copied: true, type: "image", path: result.path };
    }],
    ["copy_image_original", async ({ adapter, runtime, step }) => {
      const selector = String(step.params?.selector || step.target || "").trim();
      if (!selector) throw new Error("copy_image_original requires selector in target or params.selector");
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
      return { copied: true, type: "image_original", path: result.path, source: result.source };
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
    ["snapshot", async ({ adapter, step }) => {
      const interactiveToken = String(
        step.params?.interactive ?? step.value ?? step.target ?? ""
      ).toLowerCase();
      const interactive = ["1", "true", "i", "interactive"].includes(interactiveToken);
      return adapter.snapshot(interactive);
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
      const outPath = String(step.target || step.value || step.params?.path || "").trim();
      if (!outPath) throw new Error("write_markdown requires output path in target/value/params.path");

      const title = String(step.params?.title || "Generated Results");
      const itemsRef = String(step.params?.items_var || "").trim();
      const dataFromVar = itemsRef ? resolveVarPath(runtime.vars, itemsRef) : undefined;
      const rawItems = dataFromVar ?? step.params?.items ?? [];
      if (!Array.isArray(rawItems)) {
        throw new Error(`write_markdown items must be array, got: ${typeof rawItems}`);
      }

      const items = rawItems.map(normalizeItem).filter((x) => x.title || x.url);
      const markdown = buildMarkdown({ title, items });
      const absolute = path.resolve(outPath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, markdown, "utf-8");
      runtime.artifacts.generated_files.push(absolute);
      return { path: absolute, items: items.length };
    }],
    ["append_markdown_section", async ({ runtime, step }) => {
      const inPath = String(step.target || step.value || step.params?.path || "").trim();
      if (!inPath) throw new Error("append_markdown_section requires path");

      const absolute = toAbsoluteFilePath(inPath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });

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

      fs.appendFileSync(absolute, lines.join("\n"), "utf-8");
      if (!runtime.artifacts.generated_files.includes(absolute)) {
        runtime.artifacts.generated_files.push(absolute);
      }
      return { path: absolute, appended: true };
    }],
    ["assert_file", async ({ step }) => {
      const inPath = String(step.target || step.value || step.params?.path || "").trim();
      if (!inPath) throw new Error("assert_file requires path");
      const absolute = toAbsoluteFilePath(inPath);
      if (!fs.existsSync(absolute)) {
        throw new Error(`File not found: ${absolute}`);
      }
      const stat = fs.statSync(absolute);
      const minBytes = Number(step.params?.min_bytes ?? 1);
      if (stat.size < minBytes) {
        throw new Error(`File size ${stat.size} < expected ${minBytes}`);
      }
      return { path: absolute, size: stat.size };
    }],
    ["assert_markdown", async ({ step }) => {
      const inPath = String(step.target || step.value || step.params?.path || "").trim();
      if (!inPath) throw new Error("assert_markdown requires input path in target/value/params.path");
      const absolute = path.resolve(inPath);
      if (!fs.existsSync(absolute)) {
        throw new Error(`Markdown file not found: ${absolute}`);
      }
      const text = fs.readFileSync(absolute, "utf-8");
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
      return { path: absolute, link_count: links.length };
    }]
  ]);
}
