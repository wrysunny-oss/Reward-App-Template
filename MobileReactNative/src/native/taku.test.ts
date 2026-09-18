import {takuAdProvider} from './taku';

test('Taku provider 在官方 SDK 未接入时明确报告不可用', async () => {
  expect(takuAdProvider.name).toBe('taku');
  expect(takuAdProvider.available).toBe(false);
  await expect(takuAdProvider.initialize()).rejects.toThrow('Taku');
});
