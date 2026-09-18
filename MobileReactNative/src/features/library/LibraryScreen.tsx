import React, {useCallback, useState} from 'react';
import {FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect, useRoute} from '@react-navigation/native';
import {appApi} from '../../api/app';
import {AppIcon} from '../../components/AppIcon';
import {EmptyState, SkeletonBlock} from '../../components/DesignSystem';
import {PlaybackErrorDialog} from '../../components/PlaybackErrorDialog';
import {useAppToast} from '../../components/AppToast';
import {openDramaWithAd, syncDramaFavoriteToSdk} from '../../native/drama-playback';
import {Screen} from '../../components/Screen';
import {colors, radii, spacing, typography} from '../../theme';
import type {Favorite, WatchHistory} from '../../types/api';

function formatWatchDuration(positionSeconds = 0) {
  if (positionSeconds < 60) return `${positionSeconds} 秒`;
  const minutes = Math.floor(positionSeconds / 60);
  const seconds = positionSeconds % 60;
  return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
}

export function LibraryScreen() {
  const toast = useAppToast();
  const route = useRoute<any>();
  const mode = route.params?.mode as 'favorites' | 'history';
  const [items, setItems] = useState<Array<Favorite | WatchHistory>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playError, setPlayError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(mode === 'favorites' ? await appApi.favorites() : await appApi.history()); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '内容加载失败'); }
    finally { setLoading(false); }
  }, [mode]);
  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  const play = async (item: Favorite | WatchHistory) => {
    const history = item as WatchHistory;
    const episodeIndex = mode === 'history' ? Math.max(0, (history.episode?.episodeNo ?? 1) - 1) : undefined;
    try {
      await openDramaWithAd(item.drama.externalId || item.drama.id, episodeIndex);
    } catch (reason) {
      setPlayError(reason instanceof Error ? reason.message : '播放器启动失败');
    }
  };

  const remove = async (item: Favorite | WatchHistory) => {
    if (mode !== 'favorites') return play(item);
    try { await appApi.removeFavorite(item.dramaId); syncDramaFavoriteToSdk(item.drama.externalId || item.drama.id, 0, false).catch(() => undefined); setItems(current => current.filter(value => value.id !== item.id)); toast.show('已取消收藏', 'success'); }
    catch (requestError) { toast.show(requestError instanceof Error ? requestError.message : '请稍后重试', 'error'); }
  };

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>{mode === 'favorites' ? '我的收藏' : '观看历史'}</Text><Text style={styles.subtitle}>{mode === 'favorites' ? '收藏喜欢的故事，随时继续观看' : '最近观看进度将自动保留'}</Text></View>}
        ListEmptyComponent={loading ? <><SkeletonBlock style={styles.skeleton} /><SkeletonBlock style={styles.skeleton} /></> : <EmptyState title={error ? '内容加载失败' : mode === 'favorites' ? '还没有收藏短剧' : '还没有观看记录'} description={error || (mode === 'favorites' ? '遇到喜欢的短剧时，点击收藏即可保存' : '开始观看后，播放进度会出现在这里')} action={error ? '重新加载' : undefined} onAction={error ? load : undefined} icon={mode === 'favorites' ? 'heart' : 'history'} />}
        renderItem={({item}) => {
          const drama = item.drama; const history = item as WatchHistory;
          return <Pressable onPress={() => play(item).catch(() => undefined)} style={({pressed}) => [styles.row, pressed && styles.pressed]}><Image source={{uri: drama.coverUrl}} style={styles.cover} /><View style={styles.body}><Text style={styles.itemTitle} numberOfLines={1}>{drama.title}</Text><Text style={styles.meta}>{mode === 'history' ? `看到第 ${history.episode?.episodeNo ?? 1} 集 · 已观看 ${formatWatchDuration(history.positionSeconds)}` : `全 ${drama.totalEpisodes} 集 · ${drama.category || '短剧'}`}</Text><View style={styles.continueRow}><AppIcon name="play" color={colors.primary} size={13} /><Text style={styles.continueText}>{mode === 'history' ? '继续观看' : '立即观看'}</Text></View></View><Pressable hitSlop={10} onPress={(event) => {event.stopPropagation(); remove(item).catch(() => undefined);}} style={({pressed}) => pressed && styles.pressed}><Text style={styles.action}>{mode === 'favorites' ? '取消' : '播放'}</Text></Pressable></Pressable>;
        }}
      />
      <PlaybackErrorDialog message={playError} onClose={() => setPlayError('')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: spacing.xxl}, header: {paddingTop: spacing.lg, paddingBottom: spacing.xl}, title: {color: colors.text, ...typography.title}, subtitle: {color: colors.muted, ...typography.body, marginTop: spacing.xs}, row: {minHeight: 140, flexDirection: 'row', alignItems: 'center', padding: spacing.md, marginBottom: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface}, cover: {width: 78, height: 110, borderRadius: radii.md, backgroundColor: colors.surfaceAlt}, body: {flex: 1, paddingHorizontal: spacing.md}, itemTitle: {color: colors.text, ...typography.body, fontWeight: '600'}, meta: {color: colors.muted, ...typography.caption, marginTop: spacing.sm}, continueRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md}, continueText: {color: colors.primary, ...typography.caption, fontWeight: '600'}, action: {color: colors.muted, ...typography.label}, skeleton: {height: 140, marginBottom: spacing.md}, pressed: {opacity: 0.68, transform: [{scale: 0.99}]},
});
