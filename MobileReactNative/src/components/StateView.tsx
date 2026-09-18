import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme';
import {EmptyState} from './DesignSystem';
import {BrandLoader} from './BrandLoader';

/** 统一加载和接口错误状态，错误场景可直接提供重试操作。 */
export function StateView({
  loading,
  error,
  onRetry,
}: {
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  if (!loading && error) {
    return (
      <EmptyState
        icon="info"
        title="内容暂时没有加载出来"
        description={error}
        action={onRetry ? '重新加载' : undefined}
        onAction={onRetry}
      />
    );
  }
  return (
    <View style={styles.box}>
      {loading ? <BrandLoader compact label="正在加载" /> : <Text style={styles.text}>暂无数据</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {padding: 40, alignItems: 'center'},
  text: {color: colors.muted},
});
