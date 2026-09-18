import { z } from "zod";

export const dramaIdSchema = z.object({ dramaId: z.coerce.bigint().positive() });
export const watchProgressSchema = z.object({
  episodeId: z.coerce.bigint().positive(),
  positionSeconds: z.number().int().min(0),
});

const externalDramaIdSchema = z.string().trim().regex(/^[1-9]\d{0,99}$/);
export const sdkLibrarySyncSchema = z.object({
  requestId: z.string().uuid(),
  favoritesAdded: z.array(externalDramaIdSchema).max(200).default([]),
  favoritesRemoved: z.array(externalDramaIdSchema).max(200).default([]),
  histories: z.array(z.object({
    externalId: externalDramaIdSchema,
    episodeIndex: z.number().int().min(1).max(100_000),
    watchedAt: z.coerce.date().optional(),
  })).max(200).default([]),
}).superRefine((data, context) => {
  const added = new Set(data.favoritesAdded);
  for (const externalId of data.favoritesRemoved) {
    if (added.has(externalId)) context.addIssue({code: 'custom', message: '同一短剧不能同时收藏和取消收藏'});
  }
});

export type SdkLibrarySyncInput = z.infer<typeof sdkLibrarySyncSchema>;
