import assert from 'node:assert/strict';
import test from 'node:test';
import {feedbackHandleSchema, reportHandleSchema} from './safety.schema.js';

test('反馈处理中允许暂不回复，解决时必须给出用户可见回复', () => {
  assert.equal(feedbackHandleSchema.safeParse({status:'PROCESSING'}).success,true);
  assert.equal(feedbackHandleSchema.safeParse({status:'RESOLVED',reply:'  '}).success,false);
  assert.equal(feedbackHandleSchema.safeParse({status:'RESOLVED',reply:'问题已经修复'}).success,true);
});

test('举报完成判定时必须给出用户可见说明', () => {
  assert.equal(reportHandleSchema.safeParse({status:'PROCESSING'}).success,true);
  assert.equal(reportHandleSchema.safeParse({status:'INVALID',remark:''}).success,false);
  assert.equal(reportHandleSchema.safeParse({status:'VALID',remark:'已核实并完成处置'}).success,true);
});
