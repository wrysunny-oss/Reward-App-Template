import React, {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {getApiNetworkStatus, subscribeApiNetworkStatus} from '../api/network-status';
import {colors, spacing, typography} from '../theme';
import {AppIcon} from './AppIcon';

export function NetworkStatusBanner() {
  const status = useSyncExternalStore(
    subscribeApiNetworkStatus,
    getApiNetworkStatus,
    getApiNetworkStatus,
  );
  const previous = useRef(status);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    if (previous.current === 'offline' && status === 'online') {
      setRecovered(true);
      const timer = setTimeout(() => setRecovered(false), 1800);
      previous.current = status;
      return () => clearTimeout(timer);
    }
    previous.current = status;
  }, [status]);

  if (status === 'online' && !recovered) return null;
  const offline = status === 'offline';
  return (
    <SafeAreaView
      edges={['top']}
      pointerEvents="none"
      style={[styles.safe, offline ? styles.offline : styles.online]}>
      <View style={styles.content}>
        <AppIcon name={offline ? 'wifi-off' : 'check'} color={colors.text} size={15} />
        <Text style={styles.text}>{offline ? '网络连接不可用，正在等待恢复' : '网络连接已恢复'}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {left: 0, position: 'absolute', right: 0, top: 0, zIndex: 1000},
  offline: {backgroundColor: colors.danger},
  online: {backgroundColor: colors.success},
  content: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 34, paddingHorizontal: spacing.lg},
  text: {color: colors.text, ...typography.label},
});
