import React from 'react';
import {StyleSheet} from 'react-native';
import type {ComponentType} from 'react';
import {EmptyState} from '../components/DesignSystem';
import {Screen} from '../components/Screen';
import {contentType as configuredContentType} from '../config/modules';
import {HomeScreen as ShortDramaHomeScreen} from '../features/home/HomeScreen';

export type ContentType = 'none' | 'shortDrama' | 'quiz' | 'novel' | 'music';

function UnconfiguredContentHome() {
  return (
    <Screen style={styles.centered}>
      <EmptyState
        title="内容即将开放"
        description="当前版本保留账户与奖励能力，内容体验将在产品配置完成后开放。"
        icon="sparkles"
      />
    </Screen>
  );
}

const contentHomeByType: Partial<Record<ContentType, ComponentType>> = {
  shortDrama: ShortDramaHomeScreen,
};

/** 内容插件的 APP 首页注册点。新增内容类型时在这里接入，不修改通用导航。 */
export const ContentHomeScreen = contentHomeByType[configuredContentType as ContentType] ?? UnconfiguredContentHome;

const styles = StyleSheet.create({
  centered: {justifyContent: 'center'},
});
