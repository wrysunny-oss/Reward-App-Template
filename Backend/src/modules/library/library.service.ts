import type {Request} from 'express';
import { prisma } from "../../lib/prisma.js";
import {AppError} from '../../lib/http.js';
import type {SdkLibrarySyncInput} from './library.schema.js';

export async function listFavorites(userId: bigint) {
  const items = await prisma.favorite.findMany({
    where: { userId },
    include: { drama: true },
    orderBy: { createdAt: "desc" },
  });
  return items.map((item) => ({
    ...item,
    id: `${item.userId}:${item.dramaId}`,
    drama: {
      ...item.drama,
      externalId: item.drama.externalId || item.drama.id.toString(),
      provider: item.drama.provider,
      totalEpisodes: item.drama.provider === "PANGLE" ? item.drama.externalEpisodeCount : 0,
    },
  }));
}

/** upsert 让重复收藏请求保持幂等，移动端断网重试不会产生重复记录。 */
export function addFavorite(userId: bigint, dramaId: bigint) {
  return prisma.favorite.upsert({
    where: { userId_dramaId: { userId, dramaId } },
    create: { userId, dramaId },
    update: {},
  });
}

/** deleteMany 在记录已经不存在时也会成功，取消收藏同样具备幂等性。 */
export function removeFavorite(userId: bigint, dramaId: bigint) {
  return prisma.favorite.deleteMany({ where: { userId, dramaId } });
}

export async function listHistory(userId: bigint) {
  const items = await prisma.watchHistory.findMany({
    where: { userId },
    include: { drama: true, episode: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return items.map((item) => ({
    ...item,
    drama: {
      ...item.drama,
      externalId: item.drama.externalId || item.drama.id.toString(),
      provider: item.drama.provider,
      totalEpisodes: item.drama.provider === "PANGLE" ? item.drama.externalEpisodeCount : 0,
    },
  }));
}

/** 每个用户每部剧只保留最新进度，数据库复合唯一键保证并发请求不会生成两条历史。 */
export function saveProgress(userId: bigint, dramaId: bigint, episodeId: bigint, positionSeconds: number) {
  return prisma.watchHistory.upsert({
    where: { userId_dramaId: { userId, dramaId } },
    create: { userId, dramaId, episodeId, positionSeconds },
    update: { episodeId, positionSeconds },
  });
}

/**
 * 原生播放器只能提供当前集和本次前台观看秒数，使用递增值更新账号历史。
 * 同一集的迟到心跳不能把已保存时长改小；切换剧集后从新一集的时长重新开始。
 */
export async function saveSdkPlaybackProgress(
  userId: bigint,
  input: {externalId: string; episodeIndex: number; elapsedSeconds: number},
) {
  const drama = await prisma.drama.findFirst({
    where: {provider: 'PANGLE', externalId: input.externalId, status: 'PUBLISHED'},
    select: {id: true, externalEpisodeCount: true},
  });
  if (!drama) throw new AppError(404, 2405, '未找到对应的穿山甲短剧内容');
  if (drama.externalEpisodeCount > 0 && input.episodeIndex > drama.externalEpisodeCount) {
    throw new AppError(400, 2406, '播放集数超出短剧实际集数');
  }

  return prisma.$transaction(async tx => {
    const episode = await tx.episode.upsert({
      where: {dramaId_episodeNo: {dramaId: drama.id, episodeNo: input.episodeIndex}},
      create: {dramaId: drama.id, episodeNo: input.episodeIndex, title: `第 ${input.episodeIndex} 集`, videoUrl: '', status: 'PUBLISHED'},
      update: {},
    });
    const existing = await tx.watchHistory.findUnique({
      where: {userId_dramaId: {userId, dramaId: drama.id}},
      select: {episodeId: true, positionSeconds: true},
    });
    const positionSeconds = existing?.episodeId === episode.id
      ? Math.max(existing.positionSeconds, input.elapsedSeconds)
      : input.elapsedSeconds;
    return tx.watchHistory.upsert({
      where: {userId_dramaId: {userId, dramaId: drama.id}},
      create: {userId, dramaId: drama.id, episodeId: episode.id, positionSeconds},
      update: {episodeId: episode.id, positionSeconds},
    });
  });
}

async function duplicateSyncResult(userId: bigint, requestId: string) {
  const existing = await prisma.sdkLibrarySync.findUnique({where: {requestId}});
  if (!existing) return null;
  if (existing.userId !== userId) throw new AppError(409, 2404, '同步请求标识已被使用');
  return {duplicate: true, favoritesAdded: 0, favoritesRemoved: 0, historiesUpdated: 0};
}

/**
 * 只应用播放器打开前后产生的增量，不用 SDK 全量列表覆盖账号数据，避免同设备切换账号串号。
 * requestId 在事务开始时落库，网络重试只会返回幂等成功。
 */
export async function syncSdkLibrary(userId: bigint, input: SdkLibrarySyncInput, request: Pick<Request, 'header'>) {
  const deviceId = request.header('x-device-id')?.trim() || request.header('x-installation-id')?.trim();
  if (!deviceId) throw new AppError(400, 2403, '缺少设备标识，无法同步播放器资料库');
  const duplicate = await duplicateSyncResult(userId, input.requestId);
  if (duplicate) return duplicate;

  try {
    return await prisma.$transaction(async tx => {
      await tx.sdkLibrarySync.create({data: {requestId: input.requestId, userId}});
      const externalIds = [...new Set([...input.favoritesAdded, ...input.favoritesRemoved, ...input.histories.map(item => item.externalId)])];
      const dramas = externalIds.length ? await tx.drama.findMany({
        where: {provider: 'PANGLE', status: 'PUBLISHED', externalId: {in: externalIds}},
        select: {id: true, externalId: true, externalEpisodeCount: true},
      }) : [];
      const byExternalId = new Map(dramas.map(drama => [drama.externalId!, drama]));
      const addedDramaIds = input.favoritesAdded.map(id => byExternalId.get(id)?.id).filter((id): id is bigint => Boolean(id));
      const removedDramaIds = input.favoritesRemoved.map(id => byExternalId.get(id)?.id).filter((id): id is bigint => Boolean(id));
      if (addedDramaIds.length) await tx.favorite.createMany({data: addedDramaIds.map(dramaId => ({userId, dramaId})), skipDuplicates: true});
      const removed = removedDramaIds.length ? await tx.favorite.deleteMany({where: {userId, dramaId: {in: removedDramaIds}}}) : {count: 0};

      let historiesUpdated = 0;
      for (const item of input.histories) {
        const drama = byExternalId.get(item.externalId);
        if (!drama || (drama.externalEpisodeCount > 0 && item.episodeIndex > drama.externalEpisodeCount)) continue;
        const episode = await tx.episode.upsert({
          where: {dramaId_episodeNo: {dramaId: drama.id, episodeNo: item.episodeIndex}},
          create: {dramaId: drama.id, episodeNo: item.episodeIndex, title: `第 ${item.episodeIndex} 集`, videoUrl: '', status: 'PUBLISHED'},
          update: {},
        });
        await tx.watchHistory.upsert({
          where: {userId_dramaId: {userId, dramaId: drama.id}},
          create: {userId, dramaId: drama.id, episodeId: episode.id, positionSeconds: 0},
          // SDK 历史不提供播放秒数，不能覆盖真机心跳已经保存的时长。
          update: {episodeId: episode.id},
        });
        historiesUpdated += 1;
      }
      return {duplicate: false, favoritesAdded: addedDramaIds.length, favoritesRemoved: removed.count, historiesUpdated};
    }, {isolationLevel: 'Serializable'});
  } catch (error) {
    if ((error as {code?: string}).code === 'P2002') {
      const result = await duplicateSyncResult(userId, input.requestId);
      if (result) return result;
    }
    throw error;
  }
}
