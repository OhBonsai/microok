# microok 迁移计划：fork opencode 构建笔记 Agent（路线 A）

日期：2026-07-26
基线：opencode `dev` 分支（fork 时记录实际 commit 于 docs/UPSTREAM.md），版本 1.18.5

## 0. 决策记录（为什么是这个方案）

- **产品**：Obsidian 式笔记 agent，基于知识学习框架。桌面应用优先。
- **路线 A（源码引擎）**：引擎 `packages/opencode` 留在 fork 内，沿用 desktop 现有 sidecar 模式（predev 编译 → utilityProcess）。
  - 换取：引擎内部可改、UI↔引擎零版本漂移、启动零改造。
  - 代价：引擎冻结在 1.18.5，上游更新靠 merge/cherry-pick（模型元数据运行时从 models.dev 拉取，冻结影响有限）。
  - 路线 B（二进制 sidecar，保留集可再减 6 包）保留为后续可选减法，A→B 是机械操作。
- **前端**：接受 SolidJS（放弃 React），换取整套现成 agent 对话 UI（流式渲染/工具调用/权限确认）。
- **保留集**（desktop 传递闭包，18 包）：
  `desktop, app, ui, session-ui, core, schema, sdk(js), llm, plugin, protocol, server, opencode, tui, codemode, script, http-recorder, effect-drizzle-sqlite, effect-sqlite-node`
  - `tui` 因引擎 package.json 依赖而保留，摘除推迟到 Phase 4。
  - `@opencode-ai/client` 不在闭包内（app 用 vendor tgz），可删。

## 1. 阶段划分

原则：**先跑起来 → 再长功能 → 最后做深清理**。减法只删叶子；对保留包"只加文件、少改文件"。

### Phase 0 — 仓库初始化（保留完整历史）

microok 现状：空 git 仓库，origin=git@github.com:OhBonsai/microok.git，分支 master 无提交。

```bash
cd /Users/wp/w/agentscode/microok
git remote add upstream /Users/wp/w/agentscode/opencode   # 本地路径加速首次 fetch
git fetch upstream dev
git checkout -b main upstream/dev
git remote set-url upstream https://github.com/anomalyco/opencode  # 之后从 GitHub 跟上游
git branch -D master 2>/dev/null || true
```

- 新建 `docs/UPSTREAM.md`：记录基线 commit、版本 1.18.5、merge 策略（默认不 merge，按需 cherry-pick）。
- 提交本计划文档 + UPSTREAM.md，push `main` 到 origin。

**验收**：`git log` 可见完整上游历史；origin/main 已推送。

### Phase 1 — 减法（删 24 项，当天完成）

**删除 workspace 包**（闭包外全部）：

```
packages/cli  packages/client  packages/console/  packages/enterprise
packages/function  packages/httpapi-codegen  packages/sdk-next  packages/slack
packages/stats/  packages/storybook  packages/web
```

**删除非 workspace 杂项**：

```
packages/docs（无 package.json 的文档站）  packages/desktop-electron（空壳残留）
packages/util（空壳）  packages/containers（CI 镜像）  packages/identity（品牌图，删前 grep 引用）
infra/  sdks/  specs/  github/（上游 CI）  perf/  artifacts/  install/  nix/ flake.nix flake.lock
sst.config.ts  sst-env.d.ts  script/（根级脚本目录，仅服务被删的 root scripts）
README.<lang>.md 全部翻译版  screenshot-uk.png  STATS.md
```

**根 package.json 修改**：

- workspaces.packages → `["packages/*", "packages/sdk/js"]`（去掉 console/*、stats/*、slack）
- scripts 删除：`dev:console` `dev:stats` `dev:storybook` `sso` `translate:app` `upgrade-opentui` `random` `prepare`（husky 钩子一并删 .husky/）
- scripts 保留：`dev` `dev:desktop` `dev:web` `lint` `typecheck` `postinstall` `test`（守卫）
- devDependencies 删除：`sst`、`husky`、`@actions/artifact`；其余（turbo/oxlint/prettier/glob 等）保留
- catalog、patchedDependencies、trustedDependencies **全部不动**（服务保留包）

**验收（硬门槛，三条全过才算完成）**：

1. `bun install` 干净完成（无 workspace 解析错误）
2. `bun turbo typecheck` 通过
3. `bun dev:desktop` 窗口启动，能创建会话完成一轮对话

提交为单个 commit：`chore: prune non-desktop packages (fork baseline)`。

### Phase 2 — fork 安全阀（小改，但必须做）

同机与官方 OpenCode 共存 + 防"被上游收编"的最小改动，每处登记 DIVERGENCE.md：

1. **改 app 身份**：`packages/desktop/src/main/index.ts` 的 `APP_NAMES`/`APP_IDS` dev 条目改为 `MicroOK Dev` / `ai.microok.desktop.dev`。
   动机：userData 路径由 appId 派生，不改则与本机官方 desktop dev **共享数据库和状态目录**，互踩。
2. **禁用自动更新**：`setupAutoUpdater` 调用点加开关直接短路。
   动机：将来打包后 electron-updater 会按上游 feed 把应用"更新"成官方 OpenCode。dev 模式虽不触发，先拆引信。
3. **深链协议**：`opencode://` 与官方冲突，暂接受（本机开发影响小），改名列入 Phase 4。
4. Sentry（无 env 即禁用）、share（显式触发）不动。

**验收**：与官方 desktop dev 同机同时启动，数据目录互不干扰。

### Phase 3 — 笔记功能立骨（正式开发起点）

本阶段只立骨架，产品形态另做一份独立 spec（brainstorm → spec → plan）。骨架内容：

- **Vault = project directory**：复用现有项目/目录选择机制，vault 即引擎的工作目录，文件工具全部白拿。
- **方法论进数据不进代码**：仓库放 `examples/vault-template/`，含 `AGENTS.md`（知识学习框架：双链、MOC、渐进式总结等）+ `opencode.json`（notes 专用 agent、裁剪工具集）。
- **UI 加法**：`packages/app` 新增 notes route/panel（文件树 + markdown 编辑/预览 + 复用现有 session 对话面板）。新文件放 `src/pages/notes/`、`src/components/notes/`，不改既有文件除非注册路由必需。
- 自定义笔记工具（反链重建、卡片抽取等）需求出现时，用 **plugin 机制**实现，不改引擎。

**验收**：打开 vault → 三栏界面 → 对话面板让 agent 读写笔记文件成功。

### Phase 4 — 深清理（推迟到功能稳定后）

按实际使用决定，候选项：

- app 内不用的 IDE 面板（终端 ghostty-web、git 面板等）
- 引擎 package.json 摘除 `tui` 依赖
- patches/catalog 中确认无消费者的条目
- `opencode://` 协议、`oc://` scheme、渠道系统改名
- 评估 A→B（二进制 sidecar）减法

## 2. 长期纪律

- **DIVERGENCE.md 台账**：每次修改保留包的既有文件，登记 `日期 | 文件 | 原因`。merge 上游时这就是冲突地图。
- **只加文件、少改文件**：笔记功能以新文件/新目录为主，把与上游的冲突面压到最小。
- **上游同步策略**：默认不同步；需要某个修复时优先 cherry-pick 单 commit；引擎大版本升级作为独立事件评估（那时重新权衡 A→B）。
- **提交规范**：减法类、divergence 类、功能类分开 commit，不混。

## 3. 风险清单

| 风险 | 等级 | 对策 |
|---|---|---|
| 官方 desktop 与 microok 同机数据互踩 | 高 | Phase 2.1 改 appId |
| 打包后被 auto-updater 覆盖成官方版 | 高（打包后） | Phase 2.2 禁用 |
| 删包后 bun workspace 解析失败 | 中 | Phase 1 验收门槛 1 兜底，逐项回查 |
| bun patch 引用被删包报错 | 低 | patches 均服务引擎侧保留包 |
| 引擎冻结错过上游修复 | 低（自用期） | cherry-pick 通道 + models.dev 运行时元数据 |
