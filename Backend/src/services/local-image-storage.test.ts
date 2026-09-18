import assert from "node:assert/strict";
import test from "node:test";
import { detectImageExtension } from "./local-image-storage.js";

test("detectImageExtension identifies supported image signatures", () => {
  assert.equal(detectImageExtension(Buffer.from([0xff, 0xd8, 0xff, 0x00])), "jpeg");
  assert.equal(
    detectImageExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "png",
  );
  assert.equal(detectImageExtension(Buffer.from("GIF89a", "ascii")), "gif");
  assert.equal(detectImageExtension(Buffer.from("RIFF0000WEBP", "ascii")), "webp");
});

test("detectImageExtension rejects content disguised as an image", () => {
  assert.equal(detectImageExtension(Buffer.from("<script>alert(1)</script>")), null);
  assert.equal(detectImageExtension(Buffer.alloc(0)), null);
});
