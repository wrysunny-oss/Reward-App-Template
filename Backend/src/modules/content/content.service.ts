import {createHash} from 'node:crypto';
import type {Request} from 'express';
import {prisma} from '../../lib/prisma.js';
import {AppError} from '../../lib/http.js';
import type {DramaListQuery, PlaybackValidationInput} from './content.schema.js';
import {env} from '../../config.js';
import {getPangleCategories, getPangleDramas} from './pangle-content.client.js';

/** 将数据库短剧转换成 APP 的稳定数据结构，避免页面依赖 Prisma 关系字段。 */
function dramaDto<T extends {
  id: bigint;
  provider: string;
  externalId: string | null;
  externalEpisodeCount: number;
  title: string;
  description: string | null;
  coverUrl: string;
  category: string;
  tags: unknown;
  createdAt: Date;
}>(item: T, episodeCount = 0) {
  return {
    ...item,
    id: item.id.toString(),
    externalId: item.externalId || item.id.toString(),
    provider: item.provider === 'PANGLE' ? 'PANGLE' as const : 'LOCAL' as const,
    tags: Array.isArray(item.tags) ? item.tags : [],
    totalEpisodes: item.provider === 'PANGLE' ? item.externalEpisodeCount : episodeCount,
  };
}

/**
 * 穿山甲素材先同步为本地轻量快照，再把本地 Drama 主键返回给 APP。
 * 收藏、详情和观看历史使用本地主键，原生播放器使用 externalId，二者不再混用。
 */
export async function listDramas(query: DramaListQuery, uid = 1) {
  // 平台列表接口不支持标题关键词；搜索时查询已经同步的本地快照，避免只过滤当前页。
  if (env.PANGLE_CONTENT_SERVER_KEY && !query.keyword) {
    const result = await getPangleDramas({
      page: query.page,
      pageSize: query.pageSize,
      categoryId: query.categoryId,
      uid,
    });
    const materials = (result.list || []).filter((item) =>
      !query.keyword || item.title.includes(query.keyword),
    );
    const snapshots = await Promise.all(materials.map((item) => prisma.drama.upsert({
      where: {provider_externalId: {provider: 'PANGLE', externalId: String(item.shortplay_id)}},
      create: {
        provider: 'PANGLE',
        externalId: String(item.shortplay_id),
        externalEpisodeCount: item.total,
        title: item.title,
        description: item.desc || null,
        coverUrl: item.cover_image,
        category: item.category_name || '短剧',
        tags: [item.status === 0 ? '已完结' : '连载中'],
        status: 'PUBLISHED',
        sort: item.favorite_count || 0,
        createdAt: new Date(item.create_time * 1000),
      },
      update: {
        externalEpisodeCount: item.total,
        title: item.title,
        description: item.desc || null,
        coverUrl: item.cover_image,
        category: item.category_name || '短剧',
        tags: [item.status === 0 ? '已完结' : '连载中'],
        status: 'PUBLISHED',
        sort: item.favorite_count || 0,
      },
    })));
    return {
      list: snapshots.map((item) => dramaDto(item)),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      hasMore: result.has_more,
      provider: 'PANGLE' as const,
    };
  }

  const {page, pageSize, category, keyword} = query;
  const where = {
    status: 'PUBLISHED' as const,
    ...(category ? {category} : {}),
    ...(keyword ? {OR: [{title: {contains: keyword}}, {description: {contains: keyword}}, {category: {contains: keyword}}]} : {}),
  };
  const [list, total] = await prisma.$transaction([
    prisma.drama.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{sort: 'desc'}, {createdAt: 'desc'}],
      include: {_count: {select: {episodes: true}}},
    }),
    prisma.drama.count({where}),
  ]);
  return {
    list: list.map((item) => dramaDto(item, item._count.episodes)),
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  };
}

/** 分类实时读取，避免展示已经被平台删除的分类。 */
export async function listDramaCategories(uid = 1) {
  if (!env.PANGLE_CONTENT_SERVER_KEY) return [];
  const categories = await getPangleCategories(uid);
  return categories.flatMap((parent) => parent.children?.length
    ? parent.children.map((child) => ({id: child.id, name: child.name, parent: parent.name}))
    : [{id: parent.id, name: parent.name, parent: parent.name}],
  );
}

/** 详情始终通过本地稳定主键读取，externalId 仅提供给原生播放器。 */
export async function getDrama(id: bigint) {
  const drama = await prisma.drama.findFirstOrThrow({
    where: {id, status: 'PUBLISHED'},
    include: {episodes: {where: {status: 'PUBLISHED'}, orderBy: {episodeNo: 'asc'}}},
  });
  return {...dramaDto(drama, drama.episodes.length), episodes: drama.episodes};
}

/** 保存原生播放器真实请求成功/开始播放证据；同一短剧与设备重复事件按最新状态合并。 */
export async function recordPlaybackValidation(
  userId: bigint,
  data: PlaybackValidationInput,
  request: Pick<Request, 'header'>,
) {
  const deviceIdentity = request.header('x-device-id')?.trim()
    || request.header('x-installation-id')?.trim();
  if (!deviceIdentity) throw new AppError(400, 2308, '缺少设备标识，无法记录真机播放验证');

  const drama = await prisma.drama.findFirst({
    where: {provider: 'PANGLE', externalId: data.externalId, status: 'PUBLISHED'},
    select: {id: true, externalEpisodeCount: true},
  });
  if (!drama) throw new AppError(404, 2309, '未找到对应的穿山甲短剧内容');

  const now = new Date();
  const deviceHash = createHash('sha256').update(deviceIdentity).digest('hex');
  const requestSucceededAt = data.eventType === 'REQUEST_SUCCEEDED' ? now : undefined;
  const playbackStartedAt = data.eventType === 'PLAYBACK_STARTED' ? now : undefined;
  if (drama.externalEpisodeCount > 0 && data.episodeIndex > drama.externalEpisodeCount) {
    throw new AppError(400, 2310, '播放集数超出短剧实际集数');
  }
  const validation = await prisma.$transaction(async tx => {
    const record = await tx.dramaPlaybackValidation.upsert({
      where: {dramaId_deviceHash: {dramaId: drama.id, deviceHash}},
      create: {
        dramaId: drama.id, userId, deviceHash, deviceModel: data.deviceModel, abi: data.abi,
        sdkVersion: data.sdkVersion, appVersion: request.header('x-app-version')?.slice(0, 30),
        requestSucceededAt, playbackStartedAt, lastEventAt: now,
      },
      update: {
        userId, deviceModel: data.deviceModel, abi: data.abi, sdkVersion: data.sdkVersion,
        appVersion: request.header('x-app-version')?.slice(0, 30), requestSucceededAt,
        playbackStartedAt, lastEventAt: now,
      },
    });
    if (data.eventType === 'PLAYBACK_STARTED') {
      // 穿山甲内容没有本地视频地址，创建轻量剧集索引只用于账号观看历史定位。
      const episode = await tx.episode.upsert({
        where: {dramaId_episodeNo: {dramaId: drama.id, episodeNo: data.episodeIndex}},
        create: {dramaId: drama.id, episodeNo: data.episodeIndex, title: `第 ${data.episodeIndex} 集`, videoUrl: '', status: 'PUBLISHED'},
        update: {},
      });
      await tx.watchHistory.upsert({
        where: {userId_dramaId: {userId, dramaId: drama.id}},
        create: {userId, dramaId: drama.id, episodeId: episode.id, positionSeconds: 0},
        // 重复的开播回调只更新剧集，不清空后续心跳已累计的观看时长。
        update: {episodeId: episode.id},
      });
    }
    return record;
  });
  return {
    validated: Boolean(validation.playbackStartedAt),
    requestSucceededAt: validation.requestSucceededAt,
    playbackStartedAt: validation.playbackStartedAt,
  };
}
