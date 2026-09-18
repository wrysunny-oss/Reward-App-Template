import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

export const SHORT_DRAMA_RUNTIME_CONFIG_KEY = "content.short_drama.runtime_config";
const LEGACY_AD_RUNTIME_CONFIG_KEY = "ads.runtime_config";

export const shortDramaRuntimeConfigSchema = z.object({
  unlockMode: z.enum(["COMMON", "SPECIFIC"]),
  freeEpisodes: z.number().int().min(0).max(1000),
  unlockEpisodes: z.number().int().min(1).max(10),
  continuousUnlock: z.boolean(),
  hideRewardDialog: z.boolean(),
  hideCellularToast: z.boolean(),
  hideLikeButton: z.boolean(),
  hideFavorButton: z.boolean(),
  hideDoubleClick: z.boolean(),
  hideLongClickSpeed: z.boolean(),
  infiniteScrollEnabled: z.boolean(),
});

export type ShortDramaRuntimeConfig = z.infer<typeof shortDramaRuntimeConfigSchema>;

export const defaultShortDramaRuntimeConfig: ShortDramaRuntimeConfig = {
  unlockMode: "SPECIFIC",
  freeEpisodes: 10,
  unlockEpisodes: 10,
  continuousUnlock: false,
  hideRewardDialog: false,
  hideCellularToast: false,
  hideLikeButton: false,
  hideFavorButton: false,
  hideDoubleClick: false,
  hideLongClickSpeed: false,
  infiniteScrollEnabled: true,
};

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Read the content-owned config first, then fall back to the legacy ads.drama payload during migration. */
export async function getShortDramaRuntimeConfig() {
  const configs = await prisma.systemConfig.findMany({
    where: { key: { in: [SHORT_DRAMA_RUNTIME_CONFIG_KEY, LEGACY_AD_RUNTIME_CONFIG_KEY] } },
  });
  const current = objectValue(configs.find((item) => item.key === SHORT_DRAMA_RUNTIME_CONFIG_KEY)?.value);
  const legacyAds = objectValue(configs.find((item) => item.key === LEGACY_AD_RUNTIME_CONFIG_KEY)?.value);
  const legacy = objectValue(legacyAds?.drama);
  const parsed = shortDramaRuntimeConfigSchema.safeParse({
    ...defaultShortDramaRuntimeConfig,
    ...(current ?? legacy ?? {}),
  });
  return parsed.success ? parsed.data : defaultShortDramaRuntimeConfig;
}
