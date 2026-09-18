export type PublicAndroidVersion = {
  versionName: string;
  versionCode: number;
  downloadUrl: string;
  releaseNotes: string;
} | null;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderReleaseNotes(notes: string | undefined) {
  if (!notes?.trim()) return "";
  return `<section class="release-notes" aria-labelledby="release-title">
    <div class="section-heading"><span class="section-icon">✓</span><h2 id="release-title">本次更新</h2></div>
    <div class="notes">${escapeHtml(notes.trim())}</div>
  </section>`;
}

function renderInviteCode(inviteCode: string | undefined) {
  if (!inviteCode) return "";
  return `<section class="invite-card" aria-label="好友邀请码">
    <div><div class="invite-label">好友邀请码</div><div class="invite-code">${escapeHtml(inviteCode)}</div></div>
    <div class="invite-tip">注册时填写<br />双方均可获得奖励</div>
  </section>`;
}

/**
 * 服务端直出的 APP 下载页，不依赖管理前端构建产物。
 * 下载地址始终读取后台当前已全量发布的 Android 版本；邀请码为可选展示项。
 */
export function renderDownloadPage(input: {
  brandName: string;
  inviteCode?: string;
  release: PublicAndroidVersion;
}) {
  const brandName = escapeHtml(input.brandName);
  const downloadUrl = input.release && /^https:\/\//i.test(input.release.downloadUrl)
    ? escapeHtml(input.release.downloadUrl)
    : "";
  const versionText = input.release
    ? `Android ${escapeHtml(input.release.versionName)} · 版本号 ${input.release.versionCode}`
    : "正式版本准备中";
  const downloadAction = downloadUrl
    ? `<a class="download-button" href="${downloadUrl}" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" /></svg>
        立即下载 Android 版
      </a>`
    : `<span class="download-button disabled">暂未开放下载</span>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#0b1020" />
  <meta name="description" content="下载${brandName} Android 客户端，随时随地体验精彩内容。" />
  <title>${brandName} - 官方下载</title>
  <style>
    :root { color-scheme: dark; font-family: Inter,system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
    * { box-sizing: border-box; }
    html { min-width: 320px; background: #080b13; }
    body { margin: 0; min-height: 100vh; color: #f7f4eb; background: radial-gradient(circle at 16% 8%,rgba(231,184,74,.16),transparent 30rem),radial-gradient(circle at 88% 30%,rgba(67,90,160,.16),transparent 28rem),linear-gradient(145deg,#0d1220 0%,#080b13 55%,#0d1019 100%); }
    body::before { content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .24; background-image: linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px); background-size: 36px 36px; mask-image: linear-gradient(to bottom,black,transparent 80%); }
    .page { position: relative; width: min(1120px,100%); min-height: 100vh; margin: 0 auto; padding: max(24px,env(safe-area-inset-top)) 28px max(30px,env(safe-area-inset-bottom)); display: flex; flex-direction: column; }
    header { display: flex; align-items: center; gap: 12px; font-size: 17px; font-weight: 750; letter-spacing: .03em; }
    .brand-mark { width: 42px; height: 42px; flex: none; filter: drop-shadow(0 8px 20px rgba(231,184,74,.2)); }
    main { flex: 1; display: grid; grid-template-columns: minmax(0,1.08fr) minmax(320px,.72fr); gap: clamp(36px,8vw,108px); align-items: center; padding: 64px 3% 72px; }
    .eyebrow { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 18px; color: #e7b84a; font-size: 13px; font-weight: 750; letter-spacing: .12em; }
    .eyebrow::before { content: ""; width: 26px; height: 1px; background: currentColor; }
    h1 { max-width: 650px; margin: 0; font-size: clamp(42px,6vw,76px); line-height: 1.08; letter-spacing: -.045em; }
    h1 span { color: #e7b84a; }
    .lead { max-width: 590px; margin: 24px 0 30px; color: #aeb5c5; font-size: clamp(17px,2vw,20px); line-height: 1.85; }
    .features { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .features li { padding: 9px 13px; border: 1px solid #252c3c; border-radius: 999px; color: #c8ceda; background: rgba(18,24,37,.72); font-size: 13px; }
    .download-card { position: relative; padding: 30px; overflow: hidden; border: 1px solid rgba(231,184,74,.22); border-radius: 28px; background: linear-gradient(155deg,rgba(27,33,46,.98),rgba(15,19,29,.98)); box-shadow: 0 32px 90px rgba(0,0,0,.4); }
    .download-card::after { content: ""; position: absolute; width: 180px; height: 180px; top: -95px; right: -75px; border-radius: 50%; background: rgba(231,184,74,.1); filter: blur(2px); }
    .card-title { margin: 0 0 8px; font-size: 22px; }
    .version { margin: 0 0 24px; color: #8f98aa; font-size: 13px; }
    .invite-card { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 0 0 22px; padding: 18px 19px; border: 1px solid rgba(231,184,74,.25); border-radius: 18px; background: rgba(231,184,74,.075); }
    .invite-label { margin-bottom: 5px; color: #c7b781; font-size: 12px; }
    .invite-code { color: #f0c861; font-size: 28px; font-weight: 850; letter-spacing: .12em; word-break: break-all; }
    .invite-tip { flex: none; color: #979dab; font-size: 11px; line-height: 1.6; text-align: right; }
    .download-button { position: relative; z-index: 1; width: 100%; min-height: 54px; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 14px 18px; border-radius: 16px; color: #17130a; background: linear-gradient(135deg,#f4d474,#dba638); box-shadow: 0 14px 30px rgba(219,166,56,.2); font-size: 16px; font-weight: 850; text-decoration: none; transition: transform .18s ease,box-shadow .18s ease; }
    .download-button:hover { transform: translateY(-2px); box-shadow: 0 18px 38px rgba(219,166,56,.28); }
    .download-button svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .download-button.disabled { color: #747c8c; background: #282e39; box-shadow: none; }
    .browser-tip { margin: 15px 0 0; color: #737b8b; font-size: 12px; line-height: 1.65; text-align: center; }
    .release-notes { margin-top: 20px; padding-top: 20px; border-top: 1px solid #292f3d; }
    .section-heading { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; }
    .section-heading h2 { margin: 0; font-size: 14px; }
    .section-icon { width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; color: #11151d; background: #e7b84a; font-size: 11px; font-weight: 900; }
    .notes { max-height: 118px; overflow: auto; color: #9ca4b4; font-size: 13px; line-height: 1.75; white-space: pre-wrap; }
    footer { padding-top: 20px; border-top: 1px solid rgba(255,255,255,.06); color: #626a79; font-size: 12px; text-align: center; }
    @media (max-width: 760px) { .page { padding-inline: 20px; } main { grid-template-columns: 1fr; gap: 38px; padding: 54px 0 48px; } .hero { text-align: center; } .eyebrow { justify-content: center; } .lead { margin-inline: auto; } .features { justify-content: center; } .download-card { width: min(100%,460px); margin: 0 auto; padding: 24px; } }
    @media (max-width: 390px) { h1 { font-size: 38px; } .invite-card { align-items: flex-start; flex-direction: column; } .invite-tip { text-align: left; } }
    @media (prefers-reduced-motion: reduce) { .download-button { transition: none; } }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <svg class="brand-mark" viewBox="0 0 64 64" role="img" aria-label="${brandName}"><circle cx="32" cy="32" r="31" fill="#fff" /><circle cx="32" cy="32" r="24.5" fill="#fff" stroke="#e7b84a" stroke-width="5" /><rect x="19" y="23.5" width="26" height="17" rx="5.5" fill="#e7b84a" /><path d="M29 27.5 38.5 32 29 36.5Z" fill="#11182a" /></svg>
      <span>${brandName}</span>
    </header>
    <main>
      <section class="hero">
        <div class="eyebrow">官方 Android 客户端</div>
        <h1>精彩内容，<br /><span>随时体验</span></h1>
        <p class="lead">内容持续更新，奖励任务清晰可见。下载 ${brandName}，开启下一段体验。</p>
        <ul class="features" aria-label="产品特点"><li>丰富内容</li><li>持续更新</li><li>奖励任务</li><li>安全下载</li></ul>
      </section>
      <aside class="download-card">
        <h2 class="card-title">下载 ${brandName}</h2>
        <p class="version">${versionText}</p>
        ${renderInviteCode(input.inviteCode)}
        ${downloadAction}
        <p class="browser-tip">如在微信内无法下载，请点击右上角并选择“在浏览器打开”</p>
        ${renderReleaseNotes(input.release?.releaseNotes)}
      </aside>
    </main>
    <footer>© ${new Date().getFullYear()} ${brandName} · 官方下载</footer>
  </div>
</body>
</html>`;
}

/** 保留旧导出，确保历史邀请码链接和测试继续兼容。 */
export function renderInvitePage(input: {
  brandName: string;
  inviteCode: string;
  release: PublicAndroidVersion;
}) {
  return renderDownloadPage(input);
}
