# 待办事项

## 「接入」页面在缓存未命中时仍可能弹一次钥匙串授权框

**状态：** 大部分已修复；残留一个冷缓存边界场景，记录在此。

**已修复（原因已消除）：**
进入「接入」页面时列出 profile 的调用，已从 `list_profiles(check_secrets: true)` 改为 `check_secrets: false`（`ConnectionsPage.tsx`）。后端该路径只读 `profiles.json` 里存储的 `has_secret` 标志来驱动「缺少凭证」徽标，**完全不触碰钥匙串**（`providers.rs::list_profiles`）。因此「为了显示徽标而探测钥匙串」这个原因已不存在。

**残留场景：**
进入页面时还会调用 `reloadActiveProfiles → list_active_profiles → derive_active`（`providers.rs`）来推断每个作用域当前激活的 profile。它有 `state.json#active_providers` 缓存做快速路径：缓存命中且签名匹配时直接返回，不读钥匙串。但在「缓存未命中或签名对不上」**且**「该作用域的 `env` 里确实配置了某个 provider」时，会逐个 `get_secret` 比对 token，从而触发一次钥匙串读取。正常使用时缓存是热的，不会弹窗；冷缓存（如首次安装、`state.json` 被清）才会出现。

**当前规避方法：**
- 缓存一旦在激活/停用时写入，后续进页面即走快速路径，不再读钥匙串。
- 未签名的 `pnpm tauri dev` 构建里，这一次读取可能分裂成 1~2 个授权提示；点一次「始终允许」即可。

**后续可优化方向：**
- 仅订阅模式 / 无 provider env 的作用域已经短路（`derive_active` 开头即返回），无需进一步处理。
- 对确实配了 provider env 的作用域，可在激活时就把激活态持久化得更完整，缩小冷缓存窗口。
- 或将「token 与哪个 profile 匹配」的推断结果也缓存进 `state.json`，进一步减少冷启动时的钥匙串比对。

**相关文件：**
- `src-tauri/src/commands/providers.rs`（`list_profiles` / `derive_active` / `list_active_profiles`）
- `src-tauri/src/secrets.rs`
- `src-tauri/src/state.rs`（`active_providers` 缓存）
- `src/components/ConnectionsPage.tsx`
- `src/lib/signals.ts`（`reloadActiveProfiles`）

## 从技能来源安装时，同名技能直接覆盖（缺少确认弹窗）

**状态：** 已知限制，已记录在此。

**问题描述：**
从「技能 → 来源」安装一个技能时，如果当前作用域已存在同名技能，`install_skill_from_source` 会直接删除旧目录并覆盖，不弹确认框。这符合「安装即最新」的预期，但用户若对已安装技能做过本地修改，会在无提示的情况下丢失。

**当前行为：**
- 已安装技能在来源列表中显示「已安装」徽标；内容有差异时显示「可更新」。
- 点击安装/更新即覆盖，无二次确认。

**后续可优化方向：**
- 当目标目录已存在时，先弹 Tauri 原生确认框（覆盖 / 取消）。
- 可进一步检测目标技能是否带有 `.claude-copilot/source.json`：无该元数据（即用户手写技能）时给更强的警告。

**相关文件：**
- `src-tauri/src/commands/skills.rs`（`install_skill_from_source`）
- `src/components/SkillsPanel.tsx`
