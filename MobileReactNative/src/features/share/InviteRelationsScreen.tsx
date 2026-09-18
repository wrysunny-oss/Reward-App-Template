import React, {useCallback, useEffect, useRef, useState} from 'react';
import {FlatList, RefreshControl, StyleSheet, Text, View} from 'react-native';
import {appApi} from '../../api/app';
import {AppButton, AppCard, AppListRow, EmptyState, SkeletonBlock} from '../../components/DesignSystem';
import {Screen} from '../../components/Screen';
import type {InviteRelationMember, InviteRelations} from '../../types/api';
import {colors, spacing, typography} from '../../theme';

const PAGE_SIZE = 20;
type Child = InviteRelationMember & {registeredAt: string; level: 'DIRECT' | 'INDIRECT'};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function InviteRelationsScreen() {
  const requestVersion = useRef(0);
  const [data, setData] = useState<InviteRelations>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (page = 1) => {
    const version = ++requestVersion.current;
    setError('');
    if (page === 1) {
      setLoading(true);
    }
    else setLoadingMore(true);
    try {
      const result = await appApi.inviteRelations(page, PAGE_SIZE);
      if (version !== requestVersion.current) return;
      setData(current => page === 1 ? result : {
        ...result,
        parent: current?.parent ?? result.parent,
        children: {
          ...result.children,
          list: [...(current?.children.list ?? []), ...result.children.list],
        },
      });
    } catch (requestError) {
      if (version !== requestVersion.current) return;
      const message = requestError instanceof Error ? requestError.message : '邀请关系加载失败';
      if (page === 1) setError(message);
      else setError(`下一页加载失败：${message}`);
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
    return () => { requestVersion.current += 1; };
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    load(1).catch(() => undefined);
  };

  if (loading && !data) {
    return (
      <Screen style={styles.loadingScreen}>
        <SkeletonBlock style={styles.parentSkeleton} />
        <SkeletonBlock style={styles.rowSkeleton} />
        <SkeletonBlock style={styles.rowSkeleton} />
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen style={styles.centered}>
        <EmptyState title="邀请关系加载失败" description={error} action="重新加载" onAction={() => load(1)} icon="users" />
      </Screen>
    );
  }

  const parent = data?.parent;
  const children: Child[] = data?.children.list ?? [];
  const total = data?.children.total ?? 0;
  const header = (
    <View>
      <Text style={styles.intro}>这里只展示你的直属上级，以及你发展的直推和间推用户。</Text>
      <Text style={styles.sectionTitle}>我的上级</Text>
      <AppCard style={styles.parentCard}>
        {parent ? (
          <AppListRow
            icon="user"
            title={parent.nickname || '平台用户'}
            subtitle={`账号 ${parent.userNo} · ${parent.phone}`}
            value={`绑定于 ${formatDate(parent.boundAt)}`}
          />
        ) : (
          <View style={styles.noParent}>
            <Text style={styles.noParentTitle}>暂无上级</Text>
            <Text style={styles.noParentDescription}>你的账号当前没有绑定邀请人</Text>
          </View>
        )}
      </AppCard>
      <View style={styles.childrenHeading}>
        <View>
          <Text style={styles.sectionTitle}>我的团队</Text>
          <Text style={styles.teamBreakdown}>直推 {data?.children.directTotal ?? 0} 人 · 间推 {data?.children.indirectTotal ?? 0} 人</Text>
        </View>
        <Text style={styles.total}>共 {total} 人</Text>
      </View>
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={children}
        keyExtractor={item => item.userNo}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={header}
        renderItem={({item, index}) => {
          const startsSection = index === 0 || children[index - 1]?.level !== item.level;
          const sectionTotal = item.level === 'DIRECT' ? data?.children.directTotal : data?.children.indirectTotal;
          return (
            <View>
              {startsSection ? (
                <View style={styles.relationHeading}>
                  <Text style={styles.relationTitle}>{item.level === 'DIRECT' ? '我的直推' : '我的间推'}</Text>
                  <Text style={styles.total}>{sectionTotal ?? 0} 人</Text>
                </View>
              ) : null}
              <AppCard style={[styles.childCard, !startsSection && styles.childCardSpaced]}>
                <AppListRow
                  icon={item.level === 'DIRECT' ? 'user-plus' : 'users'}
                  title={item.nickname || '平台用户'}
                  subtitle={`账号 ${item.userNo} · ${item.phone}`}
                  value={formatDate(item.registeredAt)}
                />
              </AppCard>
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState title="暂无直推或间推" description="好友通过你的邀请码完成注册后，会显示在这里" icon="user-plus" />}
        ListFooterComponent={data?.children.hasMore ? (
          <View style={styles.footer}>
            {error ? <Text style={styles.pageError}>{error}</Text> : null}
            <Text style={styles.range}>已显示 {children.length}/{total} 人</Text>
            <AppButton
              title="加载更多"
              variant="secondary"
              loading={loadingMore}
              disabled={loadingMore}
              onPress={() => load((data.children.page ?? 1) + 1)}
              style={styles.loadMore}
            />
          </View>
        ) : children.length ? <Text style={styles.end}>已显示全部直推和间推</Text> : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingTop: spacing.lg, paddingBottom: spacing.xxl},
  loadingScreen: {paddingTop: spacing.lg, gap: spacing.md},
  centered: {justifyContent: 'center'},
  parentSkeleton: {height: 110},
  rowSkeleton: {height: 82},
  intro: {color: colors.muted, ...typography.body, marginBottom: spacing.xl},
  sectionTitle: {color: colors.text, ...typography.section},
  parentCard: {marginTop: spacing.md, paddingVertical: spacing.xs},
  noParent: {paddingVertical: spacing.lg, alignItems: 'center'},
  noParentTitle: {color: colors.text, ...typography.body, fontWeight: '600'},
  noParentDescription: {color: colors.muted, ...typography.caption, marginTop: spacing.xs},
  childrenHeading: {marginTop: spacing.xl, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center'},
  teamBreakdown: {color: colors.muted, ...typography.caption, marginTop: spacing.xs},
  total: {color: colors.muted, ...typography.caption, marginLeft: 'auto'},
  relationHeading: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm},
  relationTitle: {color: colors.text, ...typography.label},
  childCard: {paddingVertical: spacing.xs},
  childCardSpaced: {marginTop: spacing.sm},
  footer: {alignItems: 'center', paddingVertical: spacing.xl},
  pageError: {color: colors.danger, ...typography.caption, textAlign: 'center', marginBottom: spacing.sm},
  range: {color: colors.muted, ...typography.caption},
  loadMore: {minWidth: 136, marginTop: spacing.sm},
  end: {color: colors.subtle, ...typography.caption, textAlign: 'center', paddingVertical: spacing.xl},
});
