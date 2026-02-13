# Chrome 生态配置同步设计（AI LeafyTab）

## 已确认产品决策
- 同步范围：仅在 Chrome 生态内同步。
- 冲突策略：默认用户可见选择（不做静默覆盖）。
- 数据安全：暂不做端到端加密。

## 目标
在保留现有 `chrome.storage.sync` 的前提下，新增“可感知、可控制、可恢复”的同步体验：
- 用户能看到当前同步状态。
- 用户能手动触发同步与冲突处理。
- 同步异常时有明确兜底（继续支持导入/导出）。

## 非目标
- 不引入自建后端。
- 不支持非 Chrome 浏览器。
- 不同步 API Key（继续只保存在 `chrome.storage.local`）。

## 当前基线（现状）
- 标签组、规则、模型选择等配置已经存储在 `chrome.storage.sync`。
- API Key 存储在 `chrome.storage.local`。
- 已有手动导入/导出能力。
- Account 页仍为占位信息，未体现真实同步状态。

## 信息架构与交互

### 1) Account 页升级为“同步中心”
新增模块：
- 同步状态：
  - `已连接（Chrome Sync 可用）`
  - `未连接（未登录 Chrome 或同步关闭）`
  - `受限（配额/策略受限）`
- 最近同步时间：`lastSyncedAt`
- 数据统计：标签数、规则数
- 操作按钮：
  - `立即同步`
  - `解决冲突`（仅冲突时显示）
  - `打开 Chrome 同步设置`

### 2) 冲突处理弹层（默认可见）
触发条件：检测到“本地版本”和“云端版本”均发生变化（见版本机制）。

弹层结构：
- 冲突摘要：
  - 标签变更数
  - 规则变更数
  - 最近修改时间（本地/云端）
- 处理选项：
  1. 使用本地覆盖云端
  2. 使用云端覆盖本地
  3. 合并后保存（默认推荐）
- 风险提示：
  - 覆盖操作会替换另一侧数据
- 备份入口：
  - 冲突弹窗内可一键导出当前本地配置（JSON）

## 数据模型与版本机制

### 1) 同步主数据
继续沿用现有同步字段：
- `labels`
- `domainRules`
- `defaultLabelId`
- `domainRulesEnabled`
- `allowNewLabels`
- `customPrompt`

### 2) 新增元数据（`chrome.storage.sync`）
- `syncMeta.version`：整数，自增版本号
- `syncMeta.updatedAt`：ISO 时间戳
- `syncMeta.updatedBy`：设备 ID
- `syncMeta.baseVersion`：最近一次成功对齐的版本（用于冲突识别）

### 3) 本地元数据（`chrome.storage.local`）
- `deviceId`：首次启动生成并持久化
- `lastSyncedAt`
- `pendingConflict`：冲突快照（用于打开设置页提示）

## 同步状态判定

### 1) 可用性探测
启动和设置页打开时执行：
1. 向 `storage.sync` 写入短期探测键（如 `_sync_probe`）。
2. 立即读取并删除。
3. 失败则标记为“未连接/受限”。

### 2) 状态映射
- 探测成功：`connected`
- 常见错误（quota、策略禁用）：`limited`
- 其它失败：`disconnected`

## 触发流程

### 1) 自动触发
- `chrome.storage.onChanged` 监听同步字段变化。
- 变更后 3 秒 debounce，刷新 `syncMeta`。

### 2) 手动触发
- 用户点击“立即同步”：
  - 强制写入 `syncMeta.updatedAt`，确保跨设备有可观察变更。

### 3) 冲突检测
当检测到：
- 本地 `baseVersion < remote.version`
- 且本地自 `baseVersion` 后也有改动
则设置 `pendingConflict = true`，弹出冲突处理 UI。

## 合并策略（选择“合并后保存”时）

### labels 合并
- 按 `id` 去重。
- 同 ID 冲突时保留“更新时间较新”的记录。
- 若 `defaultLabelId` 不存在，兜底到首个标签。

### domainRules 合并
- 按域名 key 合并。
- 同域冲突时按“更新时间较新”优先。
- 无法判断更新时间时进入人工选择。

### customPrompt
- 默认展示二选一（本地/云端）+ 手动编辑框。

## 失败与恢复
- 写入失败：展示可读错误并建议导出备份。
- 连续失败 N 次：提示检查 `chrome://settings/syncSetup`。
- 冲突处理前后都允许导出 JSON，降低误操作风险。

## 实施分期

### Phase 1（建议先做）
- Account 页同步状态卡片
- 可用性探测
- “立即同步”按钮
- 同步错误展示

### Phase 2
- 版本元数据（`syncMeta`）
- 冲突检测
- 冲突弹层（本地覆盖/云端覆盖/合并）

### Phase 3
- 合并细化（逐字段可视化）
- 冲突前自动备份提示
- 更完整的诊断日志

## 验收标准（DoD）
1. 用户在 Account 页可明确看到同步状态与最近同步时间。
2. 两台设备同时修改后可触发冲突提示，而非静默覆盖。
3. 用户可完成 3 种冲突处理路径（本地覆盖、云端覆盖、合并）。
4. API Key 始终不进入同步。
5. 同步失败时有可执行恢复路径（导出备份 + 同步设置引导）。
