import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useRoute} from '@react-navigation/native';
import {appApi} from '../../api/app';
import {AppIcon} from '../../components/AppIcon';
import {useAppToast} from '../../components/AppToast';
import {AppButton, AppCard, EmptyState, SkeletonBlock} from '../../components/DesignSystem';
import {Screen} from '../../components/Screen';
import {openDramaWithAd, syncDramaFavoriteToSdk} from '../../native/drama-playback';
import {colors, radii, spacing, typography} from '../../theme';
import type {Drama} from '../../types/api';

export function PlayerScreen() {
  const route = useRoute<any>();
  const toast = useAppToast();
  const dramaId = String(route.params.dramaId);
  const [drama, setDrama] = useState<Drama>();
  const [favorite, setFavorite] = useState(false);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [detail, favorites] = await Promise.all([appApi.drama(dramaId), appApi.favorites()]);
      setDrama(detail); setFavorite(favorites.some(item => String(item.dramaId) === dramaId));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '短剧不存在'); }
  }, [dramaId]);
  useEffect(() => { load().catch(() => undefined); }, [load]);

  const play = async (episodeIndex = 0) => {
    if (!drama || opening) return;
    setOpening(true);
    try { await openDramaWithAd(drama.externalId || drama.id, episodeIndex); }
    catch (requestError) { toast.show(requestError instanceof Error ? requestError.message : '播放器暂不可用', 'error'); }
    finally { setOpening(false); }
  };
  const toggleFavorite = async () => {
    if (!drama || favoriteBusy) return;
    setFavoriteBusy(true);
    try {
      if (favorite) await appApi.removeFavorite(drama.id); else await appApi.addFavorite(drama.id);
      syncDramaFavoriteToSdk(drama.externalId || drama.id, 0, !favorite).catch(() => undefined);
      setFavorite(value => !value); toast.show(favorite ? '已取消收藏' : '已加入收藏', 'success');
    } catch (requestError) { toast.show(requestError instanceof Error ? requestError.message : '操作失败', 'error'); }
    finally { setFavoriteBusy(false); }
  };
  const episodes = useMemo(() => Array.from({length: Math.min(drama?.totalEpisodes ?? 0, 30)}, (_, index) => index + 1), [drama?.totalEpisodes]);

  return <Screen>{!drama && !error ? <View style={styles.loading}><SkeletonBlock style={styles.coverSkeleton} /><SkeletonBlock style={styles.titleSkeleton} /><SkeletonBlock style={styles.metaSkeleton} /></View> : error ? <EmptyState title="短剧加载失败" description={error} action="重新加载" onAction={load} /> : drama ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    <View style={styles.coverWrap}><Image source={{uri: drama.coverUrl}} style={styles.cover} /><View style={styles.coverShade} /><Pressable onPress={() => play()} style={({pressed}) => [styles.centerPlay, pressed && styles.pressed]}><AppIcon name="play" color="#1B1609" size={26} filled /></Pressable><View style={styles.episodeBadge}><Text style={styles.episodeText}>全 {drama.totalEpisodes} 集</Text></View></View>
    <View style={styles.titleRow}><View style={styles.titleBody}><Text style={styles.title}>{drama.title}</Text><Text style={styles.meta}>{drama.category || '短剧'} · 正在热播</Text></View><Pressable disabled={favoriteBusy} onPress={toggleFavorite} style={[styles.favorite, favorite && styles.favoriteActive]}><AppIcon name="heart" color={favorite ? colors.primary : colors.muted} size={21} filled={favorite} /></Pressable></View>
    <View style={styles.tags}>{drama.tags?.map(item => <View key={item} style={styles.tag}><Text style={styles.tagText}>{item}</Text></View>)}</View>
    {drama.description ? <Text style={styles.description}>{drama.description}</Text> : null}
    {episodes.length ? <View style={styles.episodeSection}><Text style={styles.sectionTitle}>选集</Text><Text style={styles.episodeHint}>共 {drama.totalEpisodes} 集</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.episodeList}>{episodes.map(number => <Pressable key={number} onPress={() => play(number - 1)} style={({pressed}) => [styles.episodeItem, pressed && styles.pressed]}><Text style={styles.episodeNumber}>{number}</Text></Pressable>)}</ScrollView>{drama.totalEpisodes > 30 ? <Text style={styles.moreTip}>更多剧集请进入原生播放器查看</Text> : null}</View> : null}
    <AppButton title={drama.provider === 'PANGLE' ? '进入原生短剧播放器' : '开始播放'} icon="play" loading={opening} onPress={() => play()} style={styles.playButton} />
    <AppCard style={styles.notice}><AppIcon name="info" color={colors.muted} size={17} /><Text style={styles.noticeText}>播放进度与收藏会同步到账号。穿山甲内容由原生 SDK 播放器承载。</Text></AppCard>
  </ScrollView> : null}</Screen>;
}

const styles = StyleSheet.create({
  loading: {paddingTop: spacing.lg}, coverSkeleton: {height: 430, borderRadius: radii.xl}, titleSkeleton: {width: '58%', height: 28, marginTop: spacing.xl}, metaSkeleton: {width: '35%', height: 18, marginTop: spacing.md}, content: {paddingTop: spacing.lg, paddingBottom: spacing.xxl}, coverWrap: {height: 430, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.surfaceAlt}, cover: {width: '100%', height: '100%', resizeMode: 'cover'}, coverShade: {...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,8,14,0.16)'}, centerPlay: {position: 'absolute', left: '50%', top: '50%', marginLeft: -31, marginTop: -31, width: 62, height: 62, borderRadius: 31, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center'}, episodeBadge: {position: 'absolute', right: spacing.md, bottom: spacing.md, borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.overlay}, episodeText: {color: colors.text, ...typography.caption, fontWeight: '600'}, titleRow: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl}, titleBody: {flex: 1}, title: {color: colors.text, ...typography.title}, meta: {color: colors.muted, ...typography.body, marginTop: spacing.xs}, favorite: {width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center'}, favoriteActive: {backgroundColor: colors.primarySoft, borderColor: colors.primary}, tags: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg}, tag: {borderRadius: radii.sm, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.md, paddingVertical: spacing.sm}, tagText: {color: colors.primary, ...typography.caption, fontWeight: '600'}, description: {color: colors.muted, ...typography.body, lineHeight: 25, marginTop: spacing.lg}, episodeSection: {marginTop: spacing.xl}, sectionTitle: {color: colors.text, ...typography.section}, episodeHint: {position: 'absolute', right: 0, top: 3, color: colors.muted, ...typography.caption}, episodeList: {gap: spacing.sm, paddingVertical: spacing.md}, episodeItem: {width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center'}, episodeNumber: {color: colors.text, ...typography.label}, moreTip: {color: colors.subtle, ...typography.caption}, playButton: {marginTop: spacing.xl}, notice: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md}, noticeText: {color: colors.muted, ...typography.caption, flex: 1}, pressed: {opacity: 0.72, transform: [{scale: 0.96}]},
});
