# 广告奖励共享契约说明

`reward.contract.json` 是 Backend、Admin 和 Mobile 三端之间的广告奖励接口契约。它已经关联 JSON Schema，在 VS Code 中把鼠标放到字段上即可查看中文说明。

注意：这里配置的是“字段结构和安全上限”，不是当前运营数值。用户每天允许看多少次广告、具体分成比例、看 5 次奖励多少金币等实际值，仍然在 Admin 管理后台配置。

## 常用字段

| 字段 | 含义 | 当前值代表什么 |
| --- | --- | --- |
| `milestonePeriods` | 阶梯任务支持的周期 | `DAILY` 每日重置；`LIFETIME` 永久累计 |
| `shareRateBpsMax` | 后台允许填写的分成比例最大值 | `10000` 等于 100% |
| `dailyRewardedAdLimitMax` | 后台允许设置的每日收益次数最大值 | `1000` 只是输入上限，不代表当前用户可看 1000 次 |
| `milestoneItemsMax` | 每一种阶梯任务最多档数 | `20` 表示最多配置 20 档 |
| `rewardedAdCountMax` | 单档广告任务目标次数最大值 | `1000` 表示单档不能要求超过 1000 次 |
| `inviteCountMax` | 单档邀请任务目标人数最大值 | `1000000` 是防止异常输入的安全上限 |
| `rewardCoinsMax` | 单档奖励金币最大值 | `1000000000` 是防止异常发币的安全上限 |

`configuration` 下保存的是接口字段映射。正常调整运营规则时不要修改它；只有新增、删除接口字段时才需要修改，并同时进行三端类型检查。

## 修改后的操作

在仓库根目录执行：

```bash
node scripts/generate-contracts.mjs
```

随后运行三端类型检查。生成文件需要和契约一起提交到 Git，但不要直接编辑：

- `Backend/src/contracts/reward.generated.ts`
- `Admin/apps/web-naive/src/api/generated/reward.generated.ts`
- `MobileReactNative/src/types/generated/reward.generated.ts`

三端的 `build` 或 `typecheck` 脚本也会自动运行生成器，避免契约修改后忘记同步。
