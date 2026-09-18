import assert from "node:assert/strict";
import test from "node:test";
import { formatPublicUserAccount, presentInviteMember } from "./invite-relations.js";

test("邀请关系账号使用稳定 UID 编号", () => {
  assert.equal(formatPublicUserAccount(86n), "UID00000086");
});

test("邀请关系成员包含账号、昵称和完整手机号", () => {
  assert.deepEqual(presentInviteMember({ id: 1n, nickname: "测试用户", phone: "13912345678" }), {
    userNo: "UID00000001",
    nickname: "测试用户",
    phone: "13912345678",
  });
});
