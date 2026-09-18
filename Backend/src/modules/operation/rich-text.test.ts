import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeDocumentContent } from "./rich-text.js";

test("document rich text keeps supported markup and removes executable content", () => {
  const result = sanitizeDocumentContent(
    '<h2 onclick="bad()">标题</h2><script>alert(1)</script><a href="javascript:bad()">链接</a><img src="/uploads/a.png" onerror="bad()">',
  );

  assert.match(result, /<h2>标题<\/h2>/);
  assert.match(result, /<a rel="noopener noreferrer">链接<\/a>/);
  assert.match(result, /<img src="\/uploads\/a.png" \/>/);
  assert.doesNotMatch(result, /script|onclick|onerror|javascript:/i);
});

test("document rich text rejects visually empty markup", () => {
  assert.throws(() => sanitizeDocumentContent("<p><br></p>"));
});
