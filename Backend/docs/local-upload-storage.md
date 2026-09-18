# 本地图片存储与备份

项目不依赖对象存储或 CDN。头像、运营图片和富文本图片统一由后端保存在 `UPLOAD_DIRECTORY`，并通过 `/uploads/*` 对外访问。

## 生产配置

建议将上传目录放在独立、持久化的数据盘，不要放进每次发布都会被覆盖的程序目录。例如：

```env
UPLOAD_DIRECTORY=D:/hanle-data/uploads
UPLOAD_MAX_IMAGE_MB=5
```

Linux 可使用 `/var/lib/hanle-theater/uploads`。运行后端的系统账户必须拥有该目录的读取、创建和删除权限。

目录结构如下：

```text
uploads/
  avatars/
  operations/
```

旧版本直接保存在 `uploads/` 根目录的图片仍可正常访问，不需要立即迁移。

## 备份要求

数据库备份和上传目录必须来自同一时间点。只备份数据库会保留图片地址但丢失文件；只备份图片则无法还原运营内容与引用关系。

Windows 可在后端停止写入后执行：

```powershell
robocopy D:\hanle-data\uploads E:\backup\hanle-uploads /MIR
```

Linux 可执行：

```bash
rsync -a --delete /var/lib/hanle-theater/uploads/ /backup/hanle-uploads/
```

恢复时先恢复数据库，再将图片目录恢复到 `UPLOAD_DIRECTORY` 指向的位置，最后启动后端并抽查头像、首页运营位和富文本图片。

## 上传安全

- 只接收 JPEG、PNG、WebP、GIF。
- 默认单图最大 5 MB，可在 1 至 20 MB 之间配置。
- 服务端检查真实文件签名，不信任客户端文件扩展名。
- 新文件按头像和运营资源分目录，并使用随机文件名。
- 数据库写入失败时自动删除刚写入的文件；头像替换成功后清理旧的本地头像。
- 删除函数只允许操作配置的上传根目录，外链和越界路径不会被删除。
