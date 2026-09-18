import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {PlaynestNativeAd} from 'react-native-playnest-unionad';
import {colors, radii, spacing, typography} from '../theme';
import {BrandLoader} from './BrandLoader';
import {getAdRuntimeConfig} from '../native/ad-runtime';
import {reportAdEcpm, reportAdEvent} from '../native/ad-telemetry';

const AD_HEIGHT = 280;

/** 首页模板信息流广告。失败或被关闭后直接折叠，不占用内容空间。 */
export function GroMoreFeedAd() {
  const {width: windowWidth} = useWindowDimensions();
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const runtime = getAdRuntimeConfig();
  const placementId = runtime.feed.placementId;

  useEffect(() => {
    if (runtime.enabled && runtime.feed.enabled) {
      reportAdEvent({format: 'FEED', eventType: 'REQUEST', placementId});
    }
  }, [placementId, runtime.enabled, runtime.feed.enabled]);

  if (hidden || !runtime.enabled || !runtime.feed.enabled) return null;

  const width = Math.min(windowWidth - spacing.lg * 2, 420);
  return (
    <View style={styles.section}>
      <View style={styles.captionRow}>
        <Text style={styles.caption}>广告</Text>
        <Text style={styles.hint}>推广内容</Text>
      </View>
      <View style={[styles.container, {width, height: AD_HEIGHT}]}>
        {!loaded ? (
          <View pointerEvents="none" style={styles.loading}>
            <BrandLoader compact label="正在加载推荐内容" />
          </View>
        ) : null}
        <PlaynestNativeAd
          androidCodeId={placementId}
          iosCodeId={placementId}
          width={width}
          height={AD_HEIGHT}
          isMuted
          onShow={() => {
            setLoaded(true);
            reportAdEvent({format: 'FEED', eventType: 'LOADED', placementId});
            reportAdEvent({format: 'FEED', eventType: 'SHOW', placementId});
          }}
          onClick={() => reportAdEvent({format: 'FEED', eventType: 'CLICK', placementId})}
          onFail={event => {
            if (__DEV__) console.warn('[GroMore] 信息流广告失败:', event.error);
            reportAdEvent({format: 'FEED', eventType: 'FAIL', placementId, errorMessage: event.error});
            setHidden(true);
          }}
          onDislike={() => {
            reportAdEvent({format: 'FEED', eventType: 'DISLIKE', placementId});
            setHidden(true);
          }}
          onEcpm={value => reportAdEcpm('FEED', placementId, value)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {marginBottom: spacing.xl},
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  caption: {
    color: colors.primary,
    ...typography.caption,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.sm,
  },
  hint: {color: colors.subtle, ...typography.caption},
  container: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
