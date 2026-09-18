import React from 'react';
import {adConfig} from '../config/ad-config';
import {GroMoreFeedAd} from './GroMoreFeedAd';

/** 平台无关的信息流广告入口；厂商组件不得泄漏到业务页面。 */
export function AdFeed() {
  if (adConfig.provider === 'gromore') return <GroMoreFeedAd />;
  // Taku 信息流需要官方原生视图桥接；未接入时折叠广告位，不阻塞内容。
  return null;
}
