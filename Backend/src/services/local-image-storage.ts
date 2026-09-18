import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { env } from "../config.js";
import { AppError } from "../lib/http.js";

const IMAGE_TYPES = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

type ImageExtension = keyof typeof IMAGE_TYPES;
export type ImageDirectory = "avatars" | "operations";

export const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIRECTORY);

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_IMAGE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) =>
    callback(
      null,
      Object.values(IMAGE_TYPES).includes(
        file.mimetype as (typeof IMAGE_TYPES)[ImageExtension],
      ),
    ),
});

export function detectImageExtension(buffer: Buffer): ImageExtension | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) return "jpeg";
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) return "png";
  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))
  ) return "gif";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "webp";
  return null;
}

export interface StoredImage {
  mimeType: string;
  originalName: string;
  size: number;
  storageKey: string;
  url: string;
}

/** 以内存接收文件，确认真实图片签名后才写入本地持久化目录。 */
export async function storeImage(
  file: Express.Multer.File,
  directory: ImageDirectory,
): Promise<StoredImage> {
  const extension = detectImageExtension(file.buffer);
  if (!extension || IMAGE_TYPES[extension] !== file.mimetype) {
    throw new AppError(
      422,
      3302,
      "图片内容与文件类型不匹配，请重新选择 JPEG、PNG、WebP 或 GIF 图片",
    );
  }

  const filename = `${randomUUID()}.${extension === "jpeg" ? "jpg" : extension}`;
  const storageKey = `${directory}/${filename}`;
  const targetDirectory = path.join(uploadRoot, directory);
  const targetPath = path.join(uploadRoot, storageKey);
  await mkdir(targetDirectory, { recursive: true });
  await writeFile(targetPath, file.buffer, { flag: "wx" });

  return {
    mimeType: IMAGE_TYPES[extension],
    originalName: file.originalname,
    size: file.size,
    storageKey,
    url: `/uploads/${storageKey.replaceAll(path.sep, "/")}`,
  };
}

/** 只删除上传根目录中的服务端资源；外链和越界路径会被忽略。 */
export async function removeStoredImage(
  url: string | null | undefined,
): Promise<void> {
  if (!url?.startsWith("/uploads/")) return;
  const relativePath = url.slice("/uploads/".length).replaceAll("/", path.sep);
  const targetPath = path.resolve(uploadRoot, relativePath);
  const relativeToRoot = path.relative(uploadRoot, targetPath);
  if (
    !relativeToRoot ||
    relativeToRoot.startsWith("..") ||
    path.isAbsolute(relativeToRoot)
  ) return;
  await unlink(targetPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
