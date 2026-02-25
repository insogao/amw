function getByPath(obj, path) {
  if (!path) return undefined;
  const parts = String(path).split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

function resolveToken(token, runtime) {
  const trimmed = token.trim();
  if (trimmed.startsWith("vars.")) return getByPath(runtime.vars, trimmed.slice(5));
  if (trimmed.startsWith("context.")) return getByPath(runtime.context, trimmed.slice(8));
  if (trimmed.startsWith("env.")) return getByPath(runtime.env, trimmed.slice(4));
  return getByPath(runtime.vars, trimmed);
}

export function renderTemplateString(template, runtime) {
  const input = String(template);
  return input.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, token) => {
    const value = resolveToken(token, runtime);
    if (value === undefined || value === null) {
      throw new Error(`Template variable not found: ${token}`);
    }
    return String(value);
  });
}

export function renderTemplateValue(value, runtime) {
  if (typeof value === "string") return renderTemplateString(value, runtime);
  if (Array.isArray(value)) return value.map((item) => renderTemplateValue(item, runtime));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, renderTemplateValue(v, runtime)])
    );
  }
  return value;
}

