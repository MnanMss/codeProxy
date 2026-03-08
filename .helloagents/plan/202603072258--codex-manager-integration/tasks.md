# Codex-Manager 集成：Wave 3 前端任务看板

<!-- LIVE_STATUS_BEGIN -->
状态: completed | 进度: 8/8 (100%) | 更新: 2026-03-08
当前: Task 13 补充完成 - 登录轮询 5 分钟超时控制、刷新后自动重载列表/详情、批量刷新结果可视化已全部实现并通过测试
修复记录: 登录轮询超时静默问题已修复 - loginTimedOut 状态现参与面板渲染，超时后 codex-login-status-panel 仍可见并显示"超时"文案
<!-- LIVE_STATUS_END -->

## 范围

- 覆盖 `codeProxy` 的 Codex-Manager 集成 Wave 3：Task 11 数据层、Task 12 路由/导航骨架、Task 13 动作流与额度 UX、Task 14 验证与规则收口。
- 当前收口状态：Task 11-13 已完成，Task 14B 已确认 `bun run lint` / `bun run test` / `bun run build` / `bun run e2e --grep "Codex Manager core loop"` 全部通过。
- 当前子步 14C 仅收口 `README.md`、`AGENTS.md` 与本任务文件的联动一致性，不修改 `src/**`、E2E、测试或 plan 文件。

## Todolist（执行中会持续更新）

- [x] 1. 11A：创建 `.helloagents/plan/202603072258--codex-manager-integration/tasks.md`，写入 LIVE_STATUS 与会话范围
- [x] 2. 11B：扩展 `codeProxy` 的 API client、domain types、barrel export，并补 `src/modules/codex-manager/__tests__/api-client.test.ts`
- [x] 3. 11C-1：创建 `src/modules/codex-manager/model.ts`，定义纯状态模型与纯函数
- [x] 4. 11C-2：创建 `src/modules/codex-manager/useCodexManagerData.ts`，补齐资源状态与 query/selection hook 边界
- [x] 5. 11C-3：创建 `src/modules/codex-manager/index.ts` 与 `src/modules/codex-manager/__tests__/useCodexManagerData.test.tsx`
- [x] 6. Task 12：新增 Codex-Manager 路由、导航入口与账号/额度页骨架（独立于现有 `/quota`）
- [x] 7. Task 13：完成账号动作流、relay 启停、登录轮询、单个/批量 refresh 与运行时纳管可视化（页面接线、动作 hook 与测试已完成）
- [x] 8. Task 14：完成 lint / Vitest / build / e2e / 文档联动 / 提交收口（自动化验证与文档联动已完成；git 提交因用户未要求而未执行）

## 记录

- 当前计划目录：`.helloagents/plan/202603072258--codex-manager-integration/`
- 当前任务文件：`.helloagents/plan/202603072258--codex-manager-integration/tasks.md`
- 11B 已新增：`src/lib/http/apis/codex-manager.ts`、`src/modules/codex-manager/__tests__/api-client.test.ts`，并在 `src/lib/http/apis.ts` 暴露 `codexManagerApi`。
- 11C-1 已新增：`src/modules/codex-manager/model.ts`。
- 11C-1 当前模型：定义 `CodexManagerTab`、`CodexManagerQueryState`、`CodexManagerSelectionState`、`CodexManagerViewState`，并提供 tab/query/selection 的纯归一化与构造函数。
- 11C-2 已新增：`src/modules/codex-manager/useCodexManagerData.ts`。
- 11C-2 hook 暴露：`state`（含 `activeTab` / `accountsQuery` / `usageQuery` / `selection`）、`resources`（`accountsList` / `accountDetail` / `usageList` / `accountUsage`）、`actions`（query/selection 更新与四类 load 方法）。
- 11C-3 已新增：`src/modules/codex-manager/index.ts`、`src/modules/codex-manager/__tests__/useCodexManagerData.test.tsx`。
- 11C-3 barrel 导出：`useCodexManagerData`、`UseCodexManagerDataResult`，以及页面层会直接消费的核心 model 类型/纯函数。
- 11C-3 当前验证状态：`bun run test -- src/modules/codex-manager/__tests__/api-client.test.ts src/modules/codex-manager/__tests__/useCodexManagerData.test.tsx` 通过；`bun run lint` 无 error（存在既有 warning）。
- 12 已完成：`AppShell` 已接入 `/codex-manager` 导航入口，`CodexManagerPage.tsx` 作为独立页面承载账号与额度 tab，并提供稳定 `data-testid`。
- 13 已完成：`src/modules/codex-manager/useCodexManagerActions.ts`、`src/modules/codex-manager/__tests__/useCodexManagerActions.test.tsx` 与 `src/modules/codex-manager/__tests__/page-action-flow.test.tsx` 已覆盖登录开始、状态轮询、完成登录、导入、删除、relay 启停、单个刷新与选中批量刷新。
- 14B 已确认：`bun run lint`、`bun run test`、`bun run build`、`bun run e2e --grep "Codex Manager core loop"` 全部通过，其中 E2E 为 4 passed。
- 14C 已完成：`codeProxy/README.md`、`codeProxy/AGENTS.md` 与当前 `tasks.md` 已对齐 `/v0/management/codex-manager/*`、`src/modules/codex-manager/` 与现有测试命令表述。
- Task 13 补充完成（2026-03-08）：
  - 登录轮询新增 5 分钟总超时控制（`LOGIN_POLLING_TIMEOUT_MS = 5 * 60 * 1000`），超时后自动停止轮询
  - 单个刷新成功后立即重载列表，若当前有选中账号且匹配则同时重载详情和用量
  - 批量刷新成功后立即重载列表，若当前选中的账号在批量刷新列表中则同时重载详情和用量
  - 批量刷新结果可视化：展示成功/失败数量统计，逐项列出结果，失败项显示 `accountId` + `reason`
  - 新增测试覆盖：`refresh one action reloads account list`、`batch refresh action reloads account list`、`batch refresh result is rendered with success/failure items`
  - 验证：`bun run lint` 通过（0 errors），`bun run test` 62 tests passed
