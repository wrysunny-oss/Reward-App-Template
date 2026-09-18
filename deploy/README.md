# 富商剧场生产部署

目标环境：Alibaba Cloud Linux 3，Nginx 由服务器面板管理，Docker Compose 运行 Backend 与 MySQL 8.4。

本文只保留日常部署命令速查。首次部署、证书、Nginx、备份和验收说明参见 [完整生产部署指南](../生产部署操作指南.md)，异常处理参见 [线上故障排查手册](../docs/线上故障排查手册.md)。

## 1. 服务器目录

```bash
mkdir -p /opt/hanle/certs /data/hanle/mysql /data/hanle/uploads /data/hanle/backups
```

将项目上传到 `/opt/hanle/app`，并准备配置：

```bash
cd /opt/hanle/app/deploy
cp .env.example .env
cp backend.env.example backend.env
chmod 600 .env backend.env
```

把三个支付宝证书上传到 `/opt/hanle/certs`。私钥仅写入 `backend.env`，不要上传到代码仓库。

编辑 `backend.env` 时必须补齐以下生产配置，不能保留 `replace_with_...` 或 `SMS_XXXXXXXXX`：

- JWT、提现数据密钥及穿山甲回调/验签密钥
- 支付宝 App ID、应用私钥、三个证书路径和已审核的转账场景
- 阿里云 RAM AccessKey、可用短信签名和验证码模板
- `APP_BRAND_NAME=富商剧场`
- `ADMIN_ACCESS_TOKEN_EXPIRES_IN=24h`
- `REFRESH_TOKEN_EXPIRES_IN=30d`

穿山甲服务端激励回调地址配置为：

```text
https://api.nantongjiangnan.cn/api/v1/webhooks/pangle/reward
```

## 2. 启动数据库并迁移

```bash
cd /opt/hanle/app/deploy
docker compose --env-file .env -f docker-compose.production.yml up -d mysql
docker compose --env-file .env -f docker-compose.production.yml --profile tools run --rm migrate
docker compose --env-file .env -f docker-compose.production.yml up -d backend
docker compose --env-file .env -f docker-compose.production.yml ps
curl http://127.0.0.1:3000/ready
curl https://api.nantongjiangnan.cn/ready
```

每次发布 Backend 时都先执行迁移，再重建服务：

```bash
docker compose --env-file .env -f docker-compose.production.yml build backend migrate
docker compose --env-file .env -f docker-compose.production.yml --profile tools run --rm migrate
docker compose --env-file .env -f docker-compose.production.yml up -d backend
```

## 3. 构建并发布 Admin

在开发电脑的 `Admin` 目录执行：

```bash
pnpm --filter @vben/web-naive run build
```

将 `Admin/apps/web-naive/dist/` 中的文件上传到：

```text
/www/wwwroot/admin.nantongjiangnan.cn
```

在面板创建两个 HTTPS 站点，将 `nginx/*.location.conf` 的内容加入对应站点。API 站点反向代理本机 `3000`，Admin 站点直接提供静态文件。

发布后打开 `https://admin.nantongjiangnan.cn`，确认登录、数据看板、奖励配置和弹窗滚动均正常。

## 4. APP 正式包

完整流程参见 [APP 版本发布指南](../docs/APP版本发布指南.md)。每次发布必须先递增 `versionCode`。

正式包必须明确指定 HTTPS API：

```powershell
cd MobileReactNative/android
.\gradlew.bat bundleRelease -PAPP_ENV=production -PAPP_API_ORIGIN=https://api.nantongjiangnan.cn
```

生成文件位于 `MobileReactNative/android/app/build/outputs/bundle/release/app-release.aab`。正式打包前确认 `app.json.displayName` 与穿山甲 `ad-config.ts.sdkAppName` 分别符合应用商店和穿山甲后台配置。

## 5. 上线后核验

1. 新账号能收到阿里云注册验证码并完成注册。
2. 福利中心激励与短剧解锁激励共用每日收益次数。
3. 达到每日上限后不再发金币，但完整观看短剧广告仍可解锁。
4. 支付宝先用一笔最小提现档位验证打款和查单，不要直接批量全量打款。
5. 检查穿山甲回调日志、广告收益记录、金币流水与用户余额是否一致。

## 6. 数据库维护

MySQL 只绑定 `127.0.0.1:3306`。本地管理数据库时通过 SSH 隧道连接，不要在安全组开放 3306。

生产数据库必须配置每日逻辑备份，并将备份复制到服务器之外。Docker 数据目录持久化不等于备份。
