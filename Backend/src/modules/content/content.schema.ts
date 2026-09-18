import { z } from "zod";

export const dramaListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  category: z.string().trim().max(50).optional(),
  keyword: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});

export const dramaIdSchema = z.object({ id: z.coerce.bigint().positive() });
export const contentImageQuerySchema = z.object({
  url: z.string().url().max(2000),
});
export const playbackValidationSchema = z.object({
  externalId: z.string().trim().regex(/^[1-9]\d{0,99}$/),
  eventType: z.enum(["REQUEST_SUCCEEDED", "PLAYBACK_STARTED"]),
  episodeIndex: z.number().int().min(1).max(100_000),
  deviceModel: z.string().trim().min(1).max(100).optional(),
  abi: z.string().trim().min(1).max(50).optional(),
  sdkVersion: z.string().trim().min(1).max(30).optional(),
});
export type PlaybackValidationInput = z.infer<typeof playbackValidationSchema>;
export type DramaListQuery = z.infer<typeof dramaListQuerySchema>;

export const adminDramaListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().max(100).optional(),
  provider: z.enum(["LOCAL", "PANGLE"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "OFFLINE"]).optional(),
});
export type AdminDramaListQuery = z.infer<typeof adminDramaListQuerySchema>;
