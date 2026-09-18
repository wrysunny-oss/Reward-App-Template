import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../../config.js";

type DramaUnlockIntent = {
  version: 1;
  purpose: "DRAMA_UNLOCK";
  userId: string;
  dramaId: string;
  episodeIndex: number;
  expiresAt: number;
  nonce: string;
};

function sign(payload: string) {
  return createHmac("sha256", env.PANGLE_CALLBACK_SECRET).update(payload).digest("base64url");
}

export function createDramaUnlockIntent(userId: bigint, dramaId: string, episodeIndex: number) {
  const intent: DramaUnlockIntent = {
    version: 1,
    purpose: "DRAMA_UNLOCK",
    userId: userId.toString(),
    dramaId,
    episodeIndex,
    expiresAt: Date.now() + 15 * 60_000,
    nonce: randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(intent)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyDramaUnlockIntent(token: string, userId: bigint) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const intent = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DramaUnlockIntent;
    if (intent.version !== 1 || intent.purpose !== "DRAMA_UNLOCK" || intent.userId !== userId.toString() || intent.expiresAt < Date.now()) return null;
    if (!/^\d+$/.test(intent.dramaId) || !Number.isInteger(intent.episodeIndex) || intent.episodeIndex < 1) return null;
    return intent;
  } catch {
    return null;
  }
}
