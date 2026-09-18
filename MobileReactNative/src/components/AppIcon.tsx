import React from 'react';
import Svg, {Circle, Line, Path, Polyline, Rect} from 'react-native-svg';

export type AppIconName =
  | 'bell'
  | 'calendar-check'
  | 'check'
  | 'chevron-right'
  | 'clock'
  | 'copy'
  | 'coins'
  | 'edit'
  | 'eye'
  | 'eye-off'
  | 'film'
  | 'flame'
  | 'gift'
  | 'heart'
  | 'history'
  | 'home'
  | 'info'
  | 'lock'
  | 'megaphone'
  | 'phone'
  | 'play'
  | 'refresh'
  | 'search'
  | 'settings'
  | 'share'
  | 'shield'
  | 'sparkles'
  | 'trend'
  | 'user'
  | 'user-plus'
  | 'users'
  | 'wallet'
  | 'wifi-off';

/**
 * 项目统一线性图标。
 * 直接基于 react-native-svg 绘制，避免依赖图标包内部的 Tamagui Core，
 * 从根源上规避不同 Tamagui 版本各自持有 Theme Context 的问题。
 */
export function AppIcon({
  name,
  color = '#F5F6F8',
  size = 24,
  strokeWidth = 2,
  filled = false,
}: {
  name: AppIconName;
  color?: string;
  size?: number;
  strokeWidth?: number;
  filled?: boolean;
}) {
  const common = {
    fill: filled ? color : 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  const shape = (() => {
    switch (name) {
      case 'home':
        return <Path {...common} d="M3 11.5 12 4l9 7.5M5 10v10h14V10M9 20v-6h6v6" />;
      case 'gift':
        return (
          <>
            <Rect {...common} x="3" y="9" width="18" height="12" rx="2" />
            <Path {...common} d="M3 13h18M12 9v12M12 9H7.5a2.5 2.5 0 1 1 2.3-3.5L12 9Zm0 0h4.5a2.5 2.5 0 1 0-2.3-3.5L12 9Z" />
          </>
        );
      case 'wallet':
        return (
          <>
            <Path {...common} d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19v16H6a3 3 0 0 1-3-3V7a3 3 0 0 0 3 3h15v6h-5a3 3 0 0 1 0-6" />
            <Circle {...common} cx="16" cy="13" r=".6" />
          </>
        );
      case 'user':
        return (
          <>
            <Circle {...common} cx="12" cy="8" r="4" />
            <Path {...common} d="M4.5 21a7.5 7.5 0 0 1 15 0" />
          </>
        );
      case 'bell':
        return <Path {...common} d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />;
      case 'search':
        return (
          <>
            <Circle {...common} cx="11" cy="11" r="7" />
            <Line {...common} x1="16.2" y1="16.2" x2="21" y2="21" />
          </>
        );
      case 'play':
        return <Path {...common} d="m8 5 11 7-11 7Z" />;
      case 'flame':
        return <Path {...common} d="M12 22c4.4 0 7-3 7-7.1 0-3.1-1.8-6.4-5.2-9.9.2 3-1.7 4.4-3 5.2.2-2.7-1.3-5-2.8-6.2.2 3.7-3 6.7-3 10.9C5 19 7.7 22 12 22Z" />;
      case 'sparkles':
        return <Path {...common} d="m12 3-1.1 3.1a4 4 0 0 1-2.5 2.5L5 10l3.4 1.3a4 4 0 0 1 2.5 2.5L12 17l1.2-3.2a4 4 0 0 1 2.5-2.5L19 10l-3.3-1.4a4 4 0 0 1-2.5-2.5L12 3ZM5 3v4M3 5h4M19 17v4M17 19h4" />;
      case 'calendar-check':
        return (
          <>
            <Rect {...common} x="3" y="5" width="18" height="16" rx="2" />
            <Path {...common} d="M16 3v4M8 3v4M3 10h18m-12 5 2 2 4-4" />
          </>
        );
      case 'chevron-right':
        return <Polyline {...common} points="9 18 15 12 9 6" />;
      case 'check':
        return <Polyline {...common} points="5 12 10 17 20 7" />;
      case 'clock':
        return (
          <>
            <Circle {...common} cx="12" cy="12" r="9" />
            <Path {...common} d="M12 7v5l3 2" />
          </>
        );
      case 'coins':
        return (
          <>
            <Circle {...common} cx="9" cy="9" r="6" />
            <Path {...common} d="M7 9h4M9 7v4" />
            <Path {...common} d="M13.5 9.5A6 6 0 1 1 9.5 14" />
            <Path {...common} d="M15 14h4m-2-2v4" />
          </>
        );
      case 'megaphone':
        return <Path {...common} d="M3 11v2a2 2 0 0 0 2 2h2l3 5h3l-2-5 8-4V5L7 11H5a2 2 0 0 0-2 2m16-5h2" />;
      case 'users':
        return <Path {...common} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7" />;
      case 'user-plus':
        return <Path {...common} d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11-3v6m3-3h-6" />;
      case 'heart':
        return <Path {...common} d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />;
      case 'history':
        return <Path {...common} d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2" />;
      case 'settings':
        return <Path {...common} d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5.1-1.8 2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.6-.9L15.2 3h-4l-.4 2.4a8 8 0 0 0-1.6.9l-2.3-1-2 3.4 2 1.5A8 8 0 0 0 6.8 12c0 .6 0 1.2.2 1.8l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 1.6.9l.4 2.4h4l.4-2.4a8 8 0 0 0 1.6-.9l2.3 1 2-3.4-2-1.5c.1-.6.2-1.2.2-1.8Z" />;
      case 'shield':
        return <Path {...common} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4" />;
      case 'edit':
        return <Path {...common} d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />;
      case 'copy':
        return <Path {...common} d="M8 8h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2Zm8-3V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1" />;
      case 'share':
        return <Path {...common} d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4m4-4v14" />;
      case 'phone':
        return <Path {...common} d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />;
      case 'lock':
        return <Path {...common} d="M5 10h14v11H5Zm3 0V7a4 4 0 0 1 8 0v3" />;
      case 'eye':
        return <Path {...common} d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />;
      case 'eye-off':
        return <Path {...common} d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.4 3.2M6.6 6.6C3.5 8.4 2 12 2 12s3.5 7 10 7a10 10 0 0 0 4.1-.9" />;
      case 'film':
        return (
          <>
            <Rect {...common} x="3" y="6" width="18" height="12" rx="4" />
            <Path {...common} d="m10 9 5 3-5 3Z" />
          </>
        );
      case 'trend':
        return <Path {...common} d="m3 17 6-6 4 4 8-9m-5 0h5v5" />;
      case 'refresh':
        return <Path {...common} d="M20 11a8 8 0 0 0-14.8-4L3 10m0-5v5h5m-4 3a8 8 0 0 0 14.8 4l2.2-3m0 5v-5h-5" />;
      case 'info':
        return <Path {...common} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-11v6m0-10h.01" />;
      case 'wifi-off':
        return <Path {...common} d="m2 2 20 20M8.5 8.5A9.8 9.8 0 0 1 12 8c3.1 0 5.8 1.4 7.7 3.5M5 12.5A10 10 0 0 0 3.5 14M9 16a4.5 4.5 0 0 1 6 0m-3 4h.01M2 8.8A15 15 0 0 1 5.2 6.6M14.8 5.3A14.7 14.7 0 0 1 22 8.8" />;
      default:
        return null;
    }
  })();

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {shape}
    </Svg>
  );
}
