import assert from "node:assert/strict";
import test from "node:test";
import { renderDownloadPage, renderInvitePage } from "./invite-page.js";

test("download page works without an invite code", () => {
  const html = renderDownloadPage({
    brandName: "富商剧场",
    release: {
      versionName: "1.0.0",
      versionCode: 1,
      downloadUrl: "https://download.example.com/app.apk",
      releaseNotes: "首个正式版本",
    },
  });
  assert.match(html, /立即下载 Android 版/);
  assert.doesNotMatch(html, /好友邀请码/);
});

test("invite page renders the latest HTTPS download and invite code", () => {
  const html = renderInvitePage({
    brandName: "富商剧场",
    inviteCode: "ABC123",
    release: {
      versionName: "1.2.0",
      versionCode: 12,
      downloadUrl: "https://download.example.com/app.apk",
      releaseNotes: "稳定版",
    },
  });
  assert.match(html, /ABC123/);
  assert.match(html, /https:\/\/download\.example\.com\/app\.apk/);
  assert.match(html, /Android 1\.2\.0 · 版本号 12/);
  assert.match(html, /好友邀请码/);
});

test("invite page escapes text and refuses non-HTTPS download URLs", () => {
  const html = renderInvitePage({
    brandName: "<script>alert(1)</script>",
    inviteCode: "ABC123",
    release: {
      versionName: "1.0.0",
      versionCode: 1,
      downloadUrl: "javascript:alert(1)",
      releaseNotes: "<script>alert(2)</script>",
    },
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /暂未开放下载/);
});
