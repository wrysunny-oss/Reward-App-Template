import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {appApi} from '../../api/app';
import {AppIcon} from '../../components/AppIcon';
import {BrandLoader} from '../../components/BrandLoader';
import {EmptyState, SkeletonBlock} from '../../components/DesignSystem';
import {PlaybackErrorDialog} from '../../components/PlaybackErrorDialog';
import {openDramaWithAd} from '../../native/drama-playback';
import {Screen} from '../../components/Screen';
import {colors, radii, spacing, typography} from '../../theme';
import type {Drama} from '../../types/api';

const FALLBACK_HOT = ['都市', '甜宠', '逆袭', '悬疑'];
const HISTORY_KEY = 'hly_search_history_v1';
const PAGE_SIZE = 12;

function readHistory(value: string | null) {
  try { const parsed = value ? JSON.parse(value) : []; return Array.isArray(parsed) ? parsed.map(String).slice(0, 8) : []; }
  catch { return []; }
}

export function SearchScreen() {
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hot, setHot] = useState(FALLBACK_HOT);
  const [recommended, setRecommended] = useState<Drama[]>([]);
  const [result, setResult] = useState<Drama[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [playError, setPlayError] = useState('');

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(HISTORY_KEY), appApi.dramaCategories(), appApi.dramas({pageSize: 6})]).then(([stored, categories, dramas]) => {
      setHistory(readHistory(stored));
      const names = categories.map(item => item.name).filter(Boolean).slice(0, 8);
      if (names.length) setHot(names);
      setRecommended(dramas.list ?? []);
    }).catch(() => AsyncStorage.getItem(HISTORY_KEY).then(value => setHistory(readHistory(value))).catch(() => undefined));
  }, []);

  const search = useCallback(async (text = query, targetPage = 1) => {
    const value = text.trim();
    if (!value || (targetPage === 1 ? loading : loadingMore)) return;
    if (targetPage === 1) {setQuery(value); setActiveQuery(value); setSearched(true); setLoading(true); setError('');}
    else setLoadingMore(true);
    if (targetPage === 1) {
      const next = [value, ...history.filter(item => item !== value)].slice(0, 8);
      setHistory(next); AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => undefined);
    }
    try {
      const response = await appApi.dramas({keyword: value, page: targetPage, pageSize: PAGE_SIZE});
      setResult(current => targetPage === 1 ? response.list ?? [] : [...current, ...(response.list ?? []).filter(item => !current.some(existing => existing.id === item.id))]);
      setPage(targetPage); setHasMore(Boolean(response.hasMore));
    } catch (requestError) {
      if (targetPage === 1) setResult([]);
      setError(requestError instanceof Error ? requestError.message : '搜索失败，请稍后重试');
    } finally {setLoading(false); setLoadingMore(false); setRefreshing(false);}
  }, [history, loading, loadingMore, query]);

  const clearHistory = () => {setHistory([]); AsyncStorage.removeItem(HISTORY_KEY).catch(() => undefined);};
  const resetSearch = (text: string) => {setQuery(text); if (!text.trim()) {setActiveQuery(''); setSearched(false); setResult([]); setError(''); setHasMore(false);}};
  const play = async (item: Drama) => {try {await openDramaWithAd(item.externalId || item.id);} catch (reason) {setPlayError(reason instanceof Error ? reason.message : '播放器启动失败');}};
  const refresh = () => {setRefreshing(true); return search(activeQuery, 1);};
  const suggestions = useMemo(() => recommended.filter(item => !result.some(found => found.id === item.id)).slice(0, 4), [recommended, result]);

  const header = <View>
    <View style={styles.searchBar}><AppIcon name="search" color={colors.muted} size={19} /><TextInput autoFocus style={styles.input} value={query} onChangeText={resetSearch} placeholder="搜索剧名、简介或分类" placeholderTextColor={colors.subtle} returnKeyType="search" onSubmitEditing={() => search(query, 1).catch(() => undefined)} /><Pressable disabled={loading} onPress={() => search(query, 1).catch(() => undefined)}><Text style={styles.searchAction}>{loading ? '搜索中' : '搜索'}</Text></Pressable></View>
    {!searched ? <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>热门搜索</Text><Text style={styles.sectionHint}>来自当前内容分类</Text></View><View style={styles.tags}>{hot.map(item => <Pressable key={item} style={styles.tag} onPress={() => search(item, 1).catch(() => undefined)}><AppIcon name="flame" color={colors.primary} size={14} /><Text style={styles.tagText}>{item}</Text></Pressable>)}</View>{history.length ? <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>搜索历史</Text><Pressable onPress={clearHistory}><Text style={styles.clear}>清除</Text></Pressable></View><View style={styles.tags}>{history.map(item => <Pressable key={item} style={styles.tag} onPress={() => search(item, 1).catch(() => undefined)}><Text style={styles.tagText}>{item}</Text></Pressable>)}</View></> : null}</> : <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>搜索结果</Text>{!loading && !error ? <Text style={styles.count}>{result.length}{hasMore ? '+' : ''} 部</Text> : null}</View>}
  </View>;

  return <Screen>
    <FlatList data={searched && !loading ? result : []} keyExtractor={item => item.id} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" ListHeaderComponent={header} refreshControl={searched ? <RefreshControl refreshing={refreshing} onRefresh={() => refresh().catch(() => undefined)} tintColor={colors.primary} colors={[colors.primary]} /> : undefined} onEndReached={() => {if (hasMore && !loadingMore) search(activeQuery, page + 1).catch(() => undefined);}} onEndReachedThreshold={0.35}
      renderItem={({item}) => <DramaResult item={item} onPress={() => play(item).catch(() => undefined)} />}
      ListEmptyComponent={!searched ? null : loading ? <><SkeletonBlock style={styles.skeleton} /><SkeletonBlock style={styles.skeleton} /><SkeletonBlock style={styles.skeleton} /></> : error ? <EmptyState title="搜索失败" description={error} action="重新搜索" onAction={() => search(activeQuery || query, 1).catch(() => undefined)} icon="search" /> : <View><EmptyState title="没有找到相关短剧" description="尝试缩短关键词，或从下面的推荐内容中选择" icon="search" />{suggestions.length ? <><Text style={styles.recommendTitle}>你可能喜欢</Text>{suggestions.map(item => <DramaResult key={item.id} item={item} onPress={() => play(item).catch(() => undefined)} />)}</> : null}</View>}
      ListFooterComponent={loadingMore ? <BrandLoader compact label="正在加载更多" /> : searched && result.length > 0 && !hasMore ? <Text style={styles.end}>已显示全部结果</Text> : null} />
    <PlaybackErrorDialog message={playError} onClose={() => setPlayError('')} />
  </Screen>;
}

function DramaResult({item, onPress}: {item: Drama; onPress: () => void}) {
  const [imageFailed, setImageFailed] = useState(false);
  return <Pressable onPress={onPress} style={({pressed}) => [styles.result, pressed && styles.pressed]}><View style={styles.coverWrap}>{imageFailed ? <View style={styles.coverFallback}><AppIcon name="film" color={colors.subtle} size={25} /></View> : <Image source={{uri:item.coverUrl}} style={styles.cover} onError={() => setImageFailed(true)} />}</View><View style={styles.resultBody}><Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.resultMeta}>全 {item.totalEpisodes} 集 · {item.category || '短剧'}</Text><Text style={styles.watch}>立即播放</Text></View><AppIcon name="play" color={colors.primary} size={18} /></Pressable>;
}

const styles = StyleSheet.create({
  content:{paddingTop:spacing.lg,paddingBottom:spacing.xxl},searchBar:{height:52,borderRadius:radii.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,paddingHorizontal:spacing.lg,flexDirection:'row',alignItems:'center',gap:spacing.md},input:{flex:1,color:colors.text,...typography.body,paddingVertical:0},searchAction:{color:colors.primary,...typography.label},sectionHeader:{flexDirection:'row',alignItems:'center',marginTop:spacing.xl,marginBottom:spacing.md},sectionTitle:{color:colors.text,...typography.section,flex:1},sectionHint:{color:colors.subtle,...typography.caption},clear:{color:colors.muted,...typography.label},count:{color:colors.muted,...typography.caption},tags:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},tag:{height:38,borderRadius:19,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,paddingHorizontal:spacing.md,flexDirection:'row',alignItems:'center',gap:spacing.xs},tagText:{color:colors.muted,...typography.label},result:{minHeight:124,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.divider,paddingVertical:spacing.md},coverWrap:{width:72,height:100,borderRadius:radii.md,overflow:'hidden',backgroundColor:colors.surfaceAlt},cover:{width:'100%',height:'100%'},coverFallback:{flex:1,alignItems:'center',justifyContent:'center'},resultBody:{flex:1,marginLeft:spacing.md},resultTitle:{color:colors.text,...typography.body,fontWeight:'600'},resultMeta:{color:colors.muted,...typography.caption,marginTop:spacing.sm},watch:{color:colors.primary,...typography.caption,fontWeight:'600',marginTop:spacing.md},skeleton:{height:124,marginBottom:spacing.sm},pressed:{opacity:.68},end:{color:colors.subtle,...typography.caption,textAlign:'center',paddingVertical:spacing.lg},recommendTitle:{color:colors.text,...typography.section,marginTop:spacing.xl},
});
