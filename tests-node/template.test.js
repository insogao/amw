import test from "node:test";
import assert from "node:assert/strict";

import { renderTemplateValue } from "../src-node/template.js";

test("renderTemplateValue replaces vars and context", () => {
  const runtime = {
    vars: { query: "刘亦菲 照片", page: 2 },
    context: { site: "google.com" },
    env: {}
  };
  const raw = {
    action: "fill",
    value: "{{vars.query}}",
    note: "site={{context.site}} page={{vars.page}}"
  };
  const rendered = renderTemplateValue(raw, runtime);
  assert.equal(rendered.value, "刘亦菲 照片");
  assert.equal(rendered.note, "site=google.com page=2");
});

test("renderTemplateValue throws on missing token", () => {
  const runtime = { vars: {}, context: {}, env: {} };
  assert.throws(() => renderTemplateValue("{{vars.missing}}", runtime), /Template variable not found/);
});

