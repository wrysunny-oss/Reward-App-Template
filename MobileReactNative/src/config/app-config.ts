import {NativeModules, Platform} from 'react-native';

export type AppEnvironment = 'development' | 'test' | 'production';

type NativeAppConfig = {
  apiOrigin?: string;
  debug?: boolean;
  environment?: AppEnvironment;
  versionCode?: number;
  versionName?: string;
};

const nativeConfig = NativeModules.AppConfig as NativeAppConfig | undefined;
const androidDevice = Platform.constants as typeof Platform.constants & {
  Brand?: string;
  Fingerprint?: string;
  Model?: string;
};
const isAndroidEmulator = Platform.OS === 'android' && /generic|emulator|sdk_gphone/i.test(
  `${androidDevice.Brand ?? ''} ${androidDevice.Model ?? ''} ${androidDevice.Fingerprint ?? ''}`,
);
const developmentOrigin = Platform.OS === 'android'
  ? isAndroidEmulator ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000'
  : 'http://127.0.0.1:3000';
const environment = nativeConfig?.environment ?? 'development';
const nativeOrigin = nativeConfig?.apiOrigin?.replace(/\/+$/, '');

// Debug 包默认写入模拟器地址；真机开发时自动改走 adb reverse。
const apiOrigin = (
  environment === 'development' && Platform.OS === 'android' && !isAndroidEmulator && nativeOrigin === 'http://10.0.2.2:3000'
    ? developmentOrigin
    : nativeOrigin || developmentOrigin
).replace(/\/+$/, '');

if (!['development', 'test', 'production'].includes(environment)) {
  throw new Error(`APP 构建环境无效：${environment}`);
}
if (environment === 'production' && !/^https:\/\/[^/]+/i.test(apiOrigin)) {
  throw new Error('正式版 APP 必须配置有效的 HTTPS API 地址');
}

export const appConfig = Object.freeze({
  apiOrigin,
  apiBaseUrl: `${apiOrigin}/api/v1`,
  debug: nativeConfig?.debug ?? __DEV__,
  environment,
  versionCode: nativeConfig?.versionCode ?? 1,
  versionName: nativeConfig?.versionName ?? '1.0',
});

export const appVersionLabel = `${appConfig.versionName} (${appConfig.versionCode})`;
