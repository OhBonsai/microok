# Divergence 台账

对上游（opencode）既有文件的所有修改都登记在此。merge/cherry-pick 上游时以此为冲突地图。

格式：`日期 | 文件 | 原因`

| 日期 | 文件 | 原因 |
|---|---|---|
| 2026-07-27 | package.json（根） | Phase 1 减法：name/description/repository 改 microok；workspaces、scripts、deps 收缩 |
| 2026-07-27 | packages/desktop/src/main/index.ts | Phase 2：APP_NAMES/APP_IDS/setName/appId fallback 改 MicroOK，避免与官方 desktop 共享 userData |
| 2026-07-27 | packages/desktop/src/main/constants.ts | Phase 2：UPDATER_ENABLED 钉死 false，防上游 feed 把应用更新成官方 OpenCode |
| 2026-07-27 | packages/app/src/app.tsx | Phase 3：接入 notes 路由（/:dir/notes）与命令面板入口，共 3 处小改；实现在新文件 src/pages/notes.tsx |
