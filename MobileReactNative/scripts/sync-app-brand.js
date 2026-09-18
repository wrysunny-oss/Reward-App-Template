const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));
const displayName = String(manifest.displayName || '').trim();

if (!displayName) throw new Error('app.json 缺少 displayName');

const replacements = [
  {
    file: path.join(projectRoot, 'ios', 'HuanyueTheater', 'Info.plist'),
    pattern: /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
    replacement: `$1${displayName}$2`,
  },
  {
    file: path.join(projectRoot, 'ios', 'HuanyueTheater', 'LaunchScreen.storyboard'),
    pattern: /(id="GJd-Yh-RWb"[^>]*|<label[^>]*id="GJd-Yh-RWb"[^>]*)/,
    replacement: match => match.replace(/text="[^"]*"/, `text="${displayName}"`),
  },
];

for (const item of replacements) {
  const source = fs.readFileSync(item.file, 'utf8');
  if (!item.pattern.test(source)) throw new Error(`无法同步品牌名称：${item.file}`);
  fs.writeFileSync(item.file, source.replace(item.pattern, item.replacement), 'utf8');
}

console.log(`已同步 APP 原生品牌名称：${displayName}`);
