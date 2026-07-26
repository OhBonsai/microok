# 上游基线

- 上游仓库：https://github.com/anomalyco/opencode
- fork 基线：`7534d23551f665e65080809975b4ca5c7d63807b`（upstream/dev，2026-07-27 fetch）
- 基线版本：1.18.5
- 克隆方式：blobless partial clone（`--filter=blob:none`），完整 commit 历史保留，可 merge/cherry-pick

## 同步策略

- 默认不同步上游。
- 需要某个修复时优先 `git cherry-pick` 单个 commit。
- 引擎大版本升级作为独立事件评估（届时重新权衡切换二进制 sidecar 路线）。

## Divergence 台账

见 `docs/DIVERGENCE.md`：所有对上游既有文件的修改都须登记，merge 时作为冲突地图。
