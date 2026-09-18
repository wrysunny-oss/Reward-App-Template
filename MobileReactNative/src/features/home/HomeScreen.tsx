import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {appApi} from '../../api/app';
import {AppIcon} from '../../components/AppIcon';
import {BrandMark} from '../../components/BrandMark';
import {BrandLoader, ContentLoadingOverlay} from '../../components/BrandLoader';
import {AppButton, AppCard, EmptyState, SectionHeader, SkeletonBlock} from '../../components/DesignSystem';
import {PlaybackErrorDialog} from '../../components/PlaybackErrorDialog';
import {useAppToast} from '../../components/AppToast';
import {GroMoreFeedAd} from '../../components/GroMoreFeedAd';
import {Screen} from '../../components/Screen';
import {MotionPressable} from '../../components/MotionPressable';
import {getAdRuntimeConfig} from '../../native/ad-runtime';
import {brandConfig} from '../../config/brand';
import {openDramaWithAd, syncDramaFavoriteToSdk} from '../../native/drama-playback';
import {colors, radii, spacing, typography} from '../../theme';
import type {AppBootstrap, Drama, DramaCategory, OperationSlot} from '../../types/api';

const PAGE_SIZE = 12;
const READ_ANNOUNCEMENT_IDS_KEY = 'hly_read_announcement_ids_v1';
const HOME_CACHE_KEY = 'hly_home_cache_v1';
const HERO_WIDTH = Dimensions.get('window').width - spacing.lg * 2;
type CategoryOption = {id?: number; name: string};
type HomeListItem =
  | {type: 'drama-row'; id: string; dramas: Drama[]}
  | {type: 'feed-ad'; id: string};

function buildHomeList(dramas: Drama[], categoryKey: string, insertEvery: number): HomeListItem[] {
  const result: HomeListItem[] = [];
  for (let index = 0; index < dramas.length; index += 2) {
    const row = dramas.slice(index, index + 2);
    result.push({
      type: 'drama-row',
      id: `drama-row-${row.map(item => item.id).join('-')}`,
      dramas: row,
    });
    if (insertEvery > 0 && (index + 2) % insertEvery === 0) {
      result.push({
        type: 'feed-ad',
        id: `feed-ad-${categoryKey}-${Math.floor(index / insertEvery)}`,
      });
    }
  }
  return result;
}

/** 首页内容卡片。封面负责承载色彩，文字和状态使用统一语义色。 */
function DramaCard({item, favorite, favoriteBusy, onPress, onToggleFavorite}: {item: Drama; favorite: boolean; favoriteBusy: boolean; onPress: () => void; onToggleFavorite: () => void}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={`播放${item.title}`}
      onPress={onPress}
      feedback="dramaCard"
      style={styles.card}>
      <View style={styles.coverWrap}>
        {!imageFailed ? <Image source={{uri: item.coverUrl}} style={styles.cover} onError={() => setImageFailed(true)} /> : <View style={styles.coverFallback}><AppIcon name="film" color={colors.subtle} size={30} /><Text style={styles.fallbackText}>封面加载失败</Text></View>}
        <View style={styles.coverShade} />
        <Pressable accessibilityLabel={favorite ? `取消收藏${item.title}` : `收藏${item.title}`} disabled={favoriteBusy} hitSlop={6} onPress={event => {event.stopPropagation(); onToggleFavorite();}} style={({pressed}) => [styles.favoriteButton, favorite && styles.favoriteButtonActive, pressed && styles.pressed]}><AppIcon name="heart" color={favorite ? colors.primary : '#FFFFFF'} size={18} filled={favorite} /></Pressable>
        <View style={styles.categoryBadge}><Text style={styles.categoryBadgeText}>{item.tags?.[0] || item.category || '短剧'}</Text></View>
        <View style={styles.episodeBadge}><Text style={styles.episodeBadgeText}>全 {item.totalEpisodes} 集</Text></View>
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.cardMeta} numberOfLines={1}>{item.tags?.slice(0, 2).join(' · ') || '精彩短剧'}</Text>
    </MotionPressable>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const toast = useAppToast();
  const [data, setData] = useState<Drama[]>([]);
  const [categoryList, setCategoryList] = useState<DramaCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption>({name: '全部'});
  const [bootstrap, setBootstrap] = useState<AppBootstrap>();
  const [popup, setPopup] = useState<OperationSlot>();
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [switchingCategory, setSwitchingCategory] = useState(false);
  const [error, setError] = useState('');
  const [heroIndex, setHeroIndex] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [playError, setPlayError] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteBusyIds, setFavoriteBusyIds] = useState<Set<string>>(new Set());

  const fetchDramas = useCallback(async (categoryId?: number, targetPage = 1) => {
    const result = await appApi.dramas({page: targetPage, pageSize: PAGE_SIZE, categoryId});
    setData(current => targetPage === 1 ? result.list ?? [] : [...current, ...(result.list ?? []).filter(item => !current.some(existing => existing.id === item.id))]);
    setPage(targetPage);
    setHasMore(Boolean(result.hasMore));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [categoryResult, bootstrapResult, dramaResult, storedReadIds, favorites] = await Promise.all([
        appApi.dramaCategories(),
        appApi.bootstrap(),
        appApi.dramas({page: 1, pageSize: PAGE_SIZE, categoryId: selectedCategory.id}),
        AsyncStorage.getItem(READ_ANNOUNCEMENT_IDS_KEY),
        appApi.favorites().catch(() => []),
      ]);
      setCategoryList(categoryResult);
      setBootstrap(bootstrapResult);
      setData(dramaResult.list ?? []); setPage(1); setHasMore(Boolean(dramaResult.hasMore));
      setFavoriteIds(new Set(favorites.map(item => String(item.dramaId))));
      AsyncStorage.setItem(`${HOME_CACHE_KEY}:${selectedCategory.id ?? 'all'}`, JSON.stringify({categories: categoryResult, bootstrap: bootstrapResult, dramas: dramaResult.list ?? [], hasMore: Boolean(dramaResult.hasMore), savedAt: Date.now()})).catch(() => undefined);
      let readIds = new Set<string>();
      try { readIds = new Set<string>(storedReadIds ? JSON.parse(storedReadIds).map(String) : []); } catch {}
      const announcementUnread = bootstrapResult.announcements.filter(item => !readIds.has(item.id)).length;
      setUnreadCount(announcementUnread);
      appApi.notificationUnreadCount().then(personal => setUnreadCount(personal.count + announcementUnread)).catch(() => undefined);
      const startup = bootstrapResult.slots.find(item => item.placement === 'STARTUP_POPUP');
      if (startup && !(await AsyncStorage.getItem(`startup-popup-${startup.id}`))) setPopup(startup);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '内容加载失败';
      try {
        const stored = await AsyncStorage.getItem(`${HOME_CACHE_KEY}:${selectedCategory.id ?? 'all'}`);
        const cached = stored ? JSON.parse(stored) as {categories?:DramaCategory[];bootstrap?:AppBootstrap;dramas?:Drama[];hasMore?:boolean} : undefined;
        if (!cached?.dramas?.length) throw new Error('empty cache');
        setCategoryList(cached.categories ?? []); setBootstrap(cached.bootstrap); setData(cached.dramas); setPage(1); setHasMore(Boolean(cached.hasMore));
        setError('当前网络不可用，正在显示上次缓存内容');
      } catch { setData([]); setHasMore(false); setError(message); }
    } finally {
      setLoading(false); setSwitchingCategory(false);
    }
  }, [selectedCategory.id]);

  useEffect(() => { load().catch(() => undefined); }, [load]);

  const refreshUnread = useCallback(async () => {
    if (!bootstrap) return;
    try {
      const [personal, stored] = await Promise.all([appApi.notificationUnreadCount(), AsyncStorage.getItem(READ_ANNOUNCEMENT_IDS_KEY)]);
      let readIds = new Set<string>();
      try { readIds = new Set<string>(stored ? JSON.parse(stored).map(String) : []); } catch {}
      setUnreadCount(personal.count + bootstrap.announcements.filter(item => !readIds.has(item.id)).length);
    } catch {}
  }, [bootstrap]);
  const refreshFavorites = useCallback(async () => {
    const favorites = await appApi.favorites();
    setFavoriteIds(new Set(favorites.map(item => String(item.dramaId))));
  }, []);
  useFocusEffect(useCallback(() => { refreshUnread().catch(() => undefined); refreshFavorites().catch(() => undefined); }, [refreshFavorites, refreshUnread]));

  const toggleFavorite = useCallback(async (drama: Drama) => {
    if (favoriteBusyIds.has(drama.id)) return;
    const wasFavorite = favoriteIds.has(drama.id);
    setFavoriteBusyIds(current => new Set(current).add(drama.id));
    try {
      if (wasFavorite) await appApi.removeFavorite(drama.id);
      else await appApi.addFavorite(drama.id);
      syncDramaFavoriteToSdk(drama.externalId || drama.id, 0, !wasFavorite).catch(() => undefined);
      setFavoriteIds(current => { const next = new Set(current); if (wasFavorite) next.delete(drama.id); else next.add(drama.id); return next; });
      toast.show(wasFavorite ? '已取消收藏' : '已加入我的收藏', 'success');
    } catch (requestError) {
      toast.show(requestError instanceof Error ? requestError.message : '收藏操作失败', 'error');
    } finally {
      setFavoriteBusyIds(current => { const next = new Set(current); next.delete(drama.id); return next; });
    }
  }, [favoriteBusyIds, favoriteIds, toast]);

  const categories = useMemo<CategoryOption[]>(() => {
    const options: CategoryOption[] = [
      {name: '全部'},
      ...categoryList.map(item => ({id: item.id, name: item.name})),
    ];
    return options.filter((item, index, list) => list.findIndex(other => other.id === item.id && other.name === item.name) === index).slice(0, 16);
  }, [categoryList]);

  const selectCategory = (item: CategoryOption) => {
    if (item.id === selectedCategory.id && item.name === selectedCategory.name) return;
    setSelectedCategory(item); setLoading(true); setSwitchingCategory(true); setError('');
  };

  const loadMore = async () => {
    if (!hasMore || loading || loadingMore) return;
    setLoadingMore(true);
    try { await fetchDramas(selectedCategory.id, page + 1); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '更多内容加载失败'); }
    finally { setLoadingMore(false); }
  };

  const play = useCallback(async (drama: Drama) => {
    try {
      await openDramaWithAd(drama.externalId || drama.id);
    } catch (reason) {
      setPlayError(reason instanceof Error ? reason.message : '播放器启动失败');
    }
  }, []);

  const openSlot = async (slot: OperationSlot) => {
    if (slot.targetType === 'DRAMA' && slot.targetValue) {
      const cachedDrama = data.find(item => item.id === slot.targetValue || item.externalId === slot.targetValue);
      await play(cachedDrama ?? await appApi.drama(slot.targetValue));
    }
    else if (slot.targetType === 'EXTERNAL' && slot.targetValue) await Linking.openURL(slot.targetValue);
    else if (slot.targetType === 'INTERNAL' && slot.targetValue) navigation.navigate(slot.targetValue);
  };
  const closePopup = async () => {
    if (popup) await AsyncStorage.setItem(`startup-popup-${popup.id}`, new Date().toISOString());
    setPopup(undefined);
  };

  const recommendations = bootstrap?.slots.filter(item => item.placement === 'HOME_RECOMMEND') ?? [];
  const featured = data[0];
  // 后台推荐占用大图轮播时，列表第一条无需再从“正在热播”中移除。
  const gridData = recommendations.length ? data : data.filter(item => item.id !== featured?.id);
  const adRuntime = getAdRuntimeConfig();
  const feedInterval = adRuntime.enabled && adRuntime.feed.enabled ? adRuntime.feed.insertEvery : 0;
  const homeList = buildHomeList(gridData, String(selectedCategory.id ?? 'all'), feedInterval);

  return (
    <Screen>
      <FlatList
        data={homeList}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} colors={[colors.primary]} />}
        onEndReached={() => loadMore().catch(() => undefined)}
        onEndReachedThreshold={0.35}
        ListFooterComponent={loadingMore ? <BrandLoader compact label="正在加载更多" /> : !hasMore && data.length > PAGE_SIZE ? <Text style={styles.loadingMore}>已经到底了</Text> : null}
        ListHeaderComponent={<View>
          <View style={styles.header}>
            <BrandMark size={44} style={styles.brandMark} />
            <View style={styles.headerText}><Text style={styles.title}>{brandConfig.name}</Text><Text style={styles.subtitle}>发现值得追的好故事</Text></View>
            <Pressable accessibilityLabel="打开通知中心" onPress={() => navigation.navigate('Notifications')} style={({pressed}) => [styles.circleButton, pressed && styles.pressed]}>
              <AppIcon name="bell" color={colors.text} size={20} />{unreadCount > 0 ? <View style={styles.noticeDot} /> : null}
            </Pressable>
          </View>
          <Pressable onPress={() => navigation.navigate('Search')} style={({pressed}) => [styles.search, pressed && styles.pressed]}>
            <AppIcon name="search" color={colors.muted} size={19} /><Text style={styles.searchText}>搜索剧名、简介或分类</Text>
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
            {categories.map(item => {
              const active = item.id === selectedCategory.id && item.name === selectedCategory.name;
              return <Pressable key={`${item.id ?? 'all'}-${item.name}`} onPress={() => selectCategory(item)} style={[styles.category, active && styles.categoryActive]}><Text style={[styles.categoryText, active && styles.categoryTextActive]}>{item.name}</Text></Pressable>;
            })}
          </ScrollView>
          {loading && !data.length && !recommendations.length ? <><SkeletonBlock style={styles.heroSkeleton} /><View style={styles.skeletonRow}><SkeletonBlock style={styles.cardSkeleton} /><SkeletonBlock style={styles.cardSkeleton} /></View></> : error && !data.length && !recommendations.length ? <EmptyState title="短剧内容加载失败" description={error} action="重新加载" onAction={load} /> : recommendations.length ? <View><ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.heroCarousel} onMomentumScrollEnd={event => setHeroIndex(Math.round(event.nativeEvent.contentOffset.x / HERO_WIDTH))}>{recommendations.map(item => <Pressable key={item.id} disabled={item.targetType === 'NONE'} onPress={() => openSlot(item).catch(() => undefined)} style={({pressed}) => [styles.hero, {width: HERO_WIDTH}, pressed && styles.pressed]}><Image source={{uri: item.imageUrl}} style={styles.heroImage} /><View style={styles.heroShade} /><View style={styles.heroContent}><View style={styles.featuredLabel}><AppIcon name="sparkles" color={colors.primary} size={14} /><Text style={styles.featuredText}>今日精选</Text></View><Text style={styles.heroTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.heroMeta}>{item.targetType === 'DRAMA' ? '精选短剧 · 点击查看详情' : '平台精选内容'}</Text>{item.targetType !== 'NONE' ? <View style={styles.playButton}><Text style={styles.playText}>立即查看</Text><AppIcon name="chevron-right" color="#1B1609" size={14} /></View> : null}</View></Pressable>)}</ScrollView>{recommendations.length > 1 ? <View style={styles.heroDots}>{recommendations.map((item, index) => <View key={item.id} style={[styles.heroDot, index === heroIndex && styles.heroDotActive]} />)}</View> : null}</View> : featured ? (
            <Pressable onPress={() => play(featured)} style={({pressed}) => [styles.hero, pressed && styles.pressed]}>
              <Image source={{uri: featured.coverUrl}} style={styles.heroImage} /><View style={styles.heroShade} />
              <Pressable accessibilityLabel={favoriteIds.has(featured.id) ? `取消收藏${featured.title}` : `收藏${featured.title}`} disabled={favoriteBusyIds.has(featured.id)} onPress={event => {event.stopPropagation(); toggleFavorite(featured).catch(() => undefined);}} style={({pressed}) => [styles.heroFavoriteButton, favoriteIds.has(featured.id) && styles.favoriteButtonActive, pressed && styles.pressed]}><AppIcon name="heart" color={favoriteIds.has(featured.id) ? colors.primary : '#FFFFFF'} size={20} filled={favoriteIds.has(featured.id)} /></Pressable>
              <View style={styles.heroContent}>
                <View style={styles.featuredLabel}><AppIcon name="sparkles" color={colors.primary} size={14} /><Text style={styles.featuredText}>今日精选</Text></View>
                <Text style={styles.heroTitle} numberOfLines={1}>{featured.title}</Text>
                <Text style={styles.heroMeta}>全 {featured.totalEpisodes} 集 · {featured.category || '热播短剧'}</Text>
                <View style={styles.playButton}><AppIcon name="play" color="#1B1609" size={14} filled /><Text style={styles.playText}>立即观看</Text></View>
              </View>
            </Pressable>
          ) : null}
          {!loading && data.length ? <View style={styles.sectionHeader}><SectionHeader title="正在热播" description={selectedCategory.name === '全部' ? '为你精选高热内容' : `${selectedCategory.name}分类内容`} /></View> : null}
          {error && data.length ? <Pressable onPress={() => load().catch(() => undefined)} style={styles.inlineError}><Text style={styles.inlineErrorText}>{error}，点击重试</Text></Pressable> : null}
        </View>}
        ListEmptyComponent={!loading && !error ? <EmptyState title="暂无匹配短剧" description="换一个分类看看，更多精彩内容正在更新" /> : null}
        renderItem={({item}) => {
          if (item.type === 'feed-ad') return <GroMoreFeedAd />;
          return (
            <View style={styles.row}>
              {item.dramas.map(drama => <DramaCard key={drama.id} item={drama} favorite={favoriteIds.has(drama.id)} favoriteBusy={favoriteBusyIds.has(drama.id)} onToggleFavorite={() => toggleFavorite(drama)} onPress={() => play(drama)} />)}
              {item.dramas.length === 1 ? <View style={styles.cardSpacer} /> : null}
            </View>
          );
        }}
      />
      <ContentLoadingOverlay visible={switchingCategory && loading && data.length > 0} label={`正在加载${selectedCategory.name}内容`} />
      <Modal visible={Boolean(popup)} transparent animationType="fade" onRequestClose={() => closePopup().catch(() => undefined)}>
        <View style={styles.popupBackdrop}><AppCard style={styles.popupCard} elevated>{popup ? <><Image source={{uri: popup.imageUrl}} style={styles.popupImage} /><Text style={styles.popupTitle}>{popup.title}</Text><View style={styles.popupActions}>{popup.targetType !== 'NONE' ? <AppButton title="立即查看" onPress={() => openSlot(popup).then(closePopup).catch(() => undefined)} style={styles.popupButton} /> : null}<AppButton title="稍后再说" variant="secondary" onPress={() => closePopup().catch(() => undefined)} style={styles.popupButton} /></View></> : null}</AppCard></View>
      </Modal>
      <PlaybackErrorDialog message={playError} onClose={() => setPlayError('')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: spacing.xxl}, header: {paddingTop: spacing.md, flexDirection: 'row', alignItems: 'center'},
  brandMark: {shadowColor: colors.primary, shadowOpacity: 0.18, shadowRadius: 8, elevation: 3},
  headerText: {flex: 1, marginLeft: spacing.md}, title: {color: colors.text, ...typography.title}, subtitle: {color: colors.muted, ...typography.caption, marginTop: 1},
  circleButton: {width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center'},
  noticeDot: {position: 'absolute', top: 10, right: 10, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger},
  search: {height: 50, marginTop: spacing.xl, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md}, searchText: {color: colors.muted, ...typography.body},
  categories: {gap: spacing.sm, paddingVertical: spacing.lg}, category: {height: 34, paddingHorizontal: spacing.lg, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center'}, categoryActive: {backgroundColor: colors.primarySoft, borderColor: colors.primary}, categoryText: {color: colors.muted, ...typography.label}, categoryTextActive: {color: colors.primary},
  heroCarousel: {borderRadius: radii.xl}, hero: {height: 224, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.surfaceAlt}, heroImage: {width: '100%', height: '100%', resizeMode: 'cover'}, heroShade: {...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,8,14,0.48)'}, heroContent: {position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg}, heroDots: {height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs}, heroDot: {width: 5, height: 5, borderRadius: 3, backgroundColor: colors.subtle}, heroDotActive: {width: 16, backgroundColor: colors.primary},
  featuredLabel: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs}, featuredText: {color: colors.primary, ...typography.label}, heroTitle: {color: '#FFFFFF', fontSize: 23, lineHeight: 30, fontWeight: '700', marginTop: spacing.sm}, heroMeta: {color: '#D8DCE5', ...typography.caption, marginTop: spacing.xs}, playButton: {alignSelf: 'flex-start', height: 36, marginTop: spacing.md, paddingHorizontal: spacing.md, borderRadius: 18, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: spacing.sm}, playText: {color: '#1B1609', ...typography.label, fontWeight: '700'},
  heroSkeleton: {height: 224, borderRadius: radii.xl}, skeletonRow: {flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl}, cardSkeleton: {flex: 1, aspectRatio: 0.7}, sectionHeader: {marginTop: spacing.xl, marginBottom: spacing.md}, row: {flexDirection: 'row', gap: spacing.md}, cardSpacer: {flex: 1}, card: {flex: 1, minWidth: 0, marginBottom: spacing.xl},
  coverWrap: {width: '100%', aspectRatio: 0.72, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt}, cover: {width: '100%', height: '100%', resizeMode: 'cover'}, coverFallback: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm}, fallbackText: {color: colors.subtle, ...typography.caption}, coverShade: {...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.08)'}, categoryBadge: {position: 'absolute', top: spacing.sm, left: spacing.sm, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: 'rgba(8,11,18,0.74)'}, categoryBadgeText: {color: colors.text, fontSize: 10, lineHeight: 14, fontWeight: '600'}, episodeBadge: {position: 'absolute', right: spacing.sm, bottom: spacing.sm, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: 'rgba(8,11,18,0.78)'}, episodeBadgeText: {color: '#FFFFFF', fontSize: 10, lineHeight: 14, fontWeight: '600'}, cardTitle: {color: colors.text, ...typography.body, fontWeight: '600', marginTop: spacing.sm}, cardMeta: {color: colors.muted, ...typography.caption, marginTop: 2}, pressed: {opacity: 0.78, transform: [{scale: 0.985}]},
  favoriteButton: {position: 'absolute', top: spacing.sm, right: spacing.sm, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,11,18,0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)'}, favoriteButtonActive: {backgroundColor: colors.primarySoft, borderColor: colors.primary},
  heroFavoriteButton: {position: 'absolute', zIndex: 2, top: spacing.md, right: spacing.md, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,11,18,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)'},
  loadingMore: {color: colors.muted, ...typography.caption, textAlign: 'center', paddingVertical: spacing.lg}, inlineError: {padding: spacing.md, marginBottom: spacing.md, borderRadius: radii.md, backgroundColor: colors.dangerSoft}, inlineErrorText: {color: colors.danger, ...typography.caption, textAlign: 'center'},
  popupBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl}, popupCard: {width: '100%', maxWidth: 380, padding: spacing.md}, popupImage: {width: '100%', height: 260, borderRadius: radii.lg, resizeMode: 'cover', backgroundColor: colors.surfaceAlt}, popupTitle: {color: colors.text, ...typography.section, textAlign: 'center', marginTop: spacing.lg}, popupActions: {flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg}, popupButton: {flex: 1},
});
