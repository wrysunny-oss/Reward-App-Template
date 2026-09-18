import assert from 'node:assert/strict';
import test from 'node:test';
import {sdkLibrarySyncSchema} from './library.schema.js';

test('SDK 资料库同步接受收藏差异和历史进度', () => {
  const result = sdkLibrarySyncSchema.safeParse({
    requestId: '4c9051da-bd0c-4ba4-9021-8ec00cbb4791',
    favoritesAdded: ['38061'],
    favoritesRemoved: ['37975'],
    histories: [{externalId: '38061', episodeIndex: 12}],
  });
  assert.equal(result.success, true);
});

test('SDK 资料库同步拒绝同一短剧同时新增和删除', () => {
  const result = sdkLibrarySyncSchema.safeParse({
    requestId: '4c9051da-bd0c-4ba4-9021-8ec00cbb4791',
    favoritesAdded: ['38061'],
    favoritesRemoved: ['38061'],
    histories: [],
  });
  assert.equal(result.success, false);
});
