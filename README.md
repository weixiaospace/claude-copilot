<div align="center">

# Claude Copilot

可视化管理 Claude Code 配置的桌面应用 · A desktop client for managing Claude Code configuration

[![release](https://img.shields.io/badge/release-v0.2.3-D97757)](https://cnb.cool/weixiao.space/claude-copilot/-/releases)
[![platform](https://img.shields.io/badge/platform-macOS%20%C2%B7%20Windows-555)](#下载安装)
[![built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB)](https://tauri.app)

</div>

Claude Copilot 是一个 [Tauri 2](https://tauri.app) 桌面客户端,把 Claude Code 散落在 `~/.claude/` 里的各类配置——技能、子代理、工作流、规则、Hooks、MCP、记忆、插件、设置、用量——收进一个**以作用域(Scope)为中心**的界面。它是 [`vscode-claude-copilot`](https://github.com/weixiaospace) 扩展的精神续作,面向那些主力编辑器不是 VSCode(比如 Zed)、但仍在用 Claude Code 配置生态的开发者。

> 它**只管配置**,不内嵌聊天、不替你跑 prompt——对话交给 `claude` CLI 和 Claude Code 本身。

## 截图

> _待补_

## 功能

界面左侧是作用域侧栏,只暴露两类可导航的行:**User(我的所有项目)** 与 **Project(当前项目)**;`local` / `plugin` 层嵌套在其中显示,各行标注来源。选中一个作用域,右侧用标签页面对**同一个作用域**展示它的各项配置——任何视图都不会把 user / project 混在一起。

| 配置面 | 说明 | 作用域 |
|---|---|---|
| **Skills** | 技能,创建 / 查看 / 删除 | User · Project |
| **Agents** | 子代理 | User · Project |
| **Workflows** | 工作流 | User · Project |
| **Rules** | 规则 | User · Project |
| **Output Styles** | 输出风格,含 User 层激活态 | User · Project |
| **Hooks** | 只读的合并视图,逐行标注来源(user/plugin 或 project/local) | User · Project |
| **MCP** | MCP 服务器,直接读 JSON、写入走 `claude mcp`;支持查看/编辑、连接健康检查、`.mcp.json` 信任状态 | User · Project |
| **Memory** | 项目记忆 | 仅 Project |
| **Plugins** | 已装插件 | 仅 User |
| **Settings** | 高频字段的类型化控件 + 长尾字段的结构化编辑器 | User · Project |
| **Usage** | 用量统计 | User · Project |
| **Sessions** | 列出该项目的会话,可在终端**续接**已有会话或**新开**会话,也支持用 `happy` 命令打开终端 | 仅 Project |
| **订阅登录** | 在「接入」页面检测 Claude 订阅登录状态;未登录时打开终端执行 `claude auth login --claudeai`,已登录时可「设为用户默认」,并从 Anthropic 官方 `api/oauth/usage` 端点显示 5h/7d 等窗口额度 | — |

**Provider 凭据管理(🔑)** —— 侧栏顶部钉了一个全局入口。这是全应用**唯一**不映射 Claude Code 自身配置的地方:它是本应用自己的凭据库,支持 Anthropic / Bedrock / Vertex / Foundry 四类 profile,密钥存进**系统钥匙串**,profile 元数据存在应用自有的 `profiles.json`(v0.1 不读写 VSCode 扩展的旧 `providers.json`,互不干预)。激活一个 profile 会把对应的 `env` 写进所选作用域——项目写进 **Local** 层(密钥不进版本库),User 写进 `~/.claude/settings.json`。应用本身不存"哪个 profile 当前激活",而是在读取时用作用域里的 `env` token 去**比对**各 profile 的钥匙串密钥,反推出激活态。

其它:
- **自动更新** —— 内置更新器,新版本通过 CNB 直链推送(国内下载顺畅)。
- **多语言** —— 简体中文 / English。
- **实时刷新** —— 文件监听,外部改动 `~/.claude/` 后界面自动同步。

## 下载安装

到 [CNB Releases](https://cnb.cool/weixiao.space/claude-copilot/-/releases) 或 [GitHub Releases](https://github.com/weixiaospace/claude-copilot/releases) 下载:

| 平台 | 文件 |
|---|---|
| **macOS**(Apple Silicon) | `ClaudeCopilot_0.2.3_aarch64.dmg` |
| **Windows**(x64) | `ClaudeCopilot_0.2.3_x64-setup.exe` |

> **macOS 首次打开**:v0.1 的 mac 包尚未做 Apple 公证,首次打开会被 Gatekeeper 拦。**右键点图标 → 打开**,在弹窗里再次确认即可;或终端执行 `xattr -dr com.apple.quarantine /Applications/ClaudeCopilot.app`。装好后,后续版本会自动更新,无需重复此操作。

## 从源码构建

需要 [Node 22+](https://nodejs.org) & [pnpm](https://pnpm.io)、[Rust 工具链](https://rustup.rs),以及 [Tauri 的系统依赖](https://tauri.app/start/prerequisites/)。

```bash
pnpm install
pnpm tauri dev      # 开发模式(热重载)
pnpm tauri build    # 出包
```

## 技术栈与架构

- **Tauri 2** —— Rust 后端 + WebView 前端。
- **前端**:Preact 10 + [@preact/signals](https://preactjs.com/guide/v10/signals/) + Tailwind 4(CSS-first)+ Vite 6;UI 原语全部手写(不依赖 Radix/shadcn,见 [ADR-0002](docs/adr/0002-no-radix-handrolled-ui.md))。Markdown 经 `marked` 渲染并用 DOMPurify 消毒。
- **Rust**:Cargo workspace,`core`(纯 Rust,无 Tauri 依赖)承载所有领域逻辑与单元测试,`src-tauri` 是 Tauri 外壳与 IPC 命令。
- **类型契约**:`core` 用 [ts-rs](https://github.com/Aleph-Alpha/ts-rs) 把 Rust 结构体导出成 `src/types/*.ts`;`cargo test -p claude-copilot-core` 重新生成,CI 用 `git diff --exit-code src/types` 卡住漂移。
- **安全**:前端永远拿不到裸文件系统;所有路径访问走 Rust 命令,执行三层权限模型——静态白名单(`~/.claude/` 与已知项目目录)→ 受信派生路径(来自白名单内可信配置)→ 其余一律弹**原生 OS 权限框**(渲染进程无法自我授权)。详见 [`CLAUDE.md`](CLAUDE.md)。

文档:[`CONTEXT.md`](CONTEXT.md)(领域术语表)· [`docs/adr/`](docs/adr/)(架构决策)· [设计稿](docs/2026-06-19-claude-copilot-desktop-design.md)。

## 分发链路

公共 CI(CNB)只有 Linux runner,mac/win 包由 GitHub Actions 构建签名,再发布到 CNB Release 托管,自动更新清单走 CNB 直链:

```
打 tag → GitHub Actions 构建签名 mac+win 包 → 传 CNB Release → 生成 latest.json 推回 CNB main → 应用内更新器拉取
```

发版命令见 [`scripts/`](scripts/) 与 [`.github/workflows/release.yml`](.github/workflows/release.yml)。

## 更新日志

### v0.2.3

- **全面反馈与交互打磨**
  - 新增非阻塞 toast 提示系统，替代会打断操作的原生弹窗；操作的成功/失败、加载中状态全程可见。
  - 各面板补齐加载态（首屏不再空白）；刷新按钮按下即转圈反馈；对话框统一支持点背景 / Esc 关闭、表单非法时禁用提交、密钥输入框可显隐。
  - 市场 / 技能来源更新显示「上次更新」时间（市场读取 CLI 真实的 `lastUpdated`）。
- **性能**
  - 用量扫描移出 UI 线程（`spawn_blocking`），进入「用量」不再卡死，加载转圈正常显示。
- **MCP 大幅增强**
  - 修复 stdio 多参数命令被错误存储的问题；新增 env / headers、范围选择（项目默认写本地，密钥不进版本库）。
  - 新增服务器**详情**视图（command/args/env/headers，密钥掩码）、**编辑**、按需**连接健康检查**（✓/✗）。
  - 项目 `.mcp.json` 服务器显示**信任状态**徽章（待批准 / 已批准 / 已拒绝，只读）。
  - 列表卡片化，与其它面板统一观感。
- **资源面板统一**
  - 子代理 / 规则 / 工作流 / 输出样式合并到同一组件并卡片化，各带类型图标。
- **Hooks**
  - 卡片化 + 常见事件中文说明（如 `PreToolUse` → 工具执行前）；用户作用域不再混入插件 hooks（插件 hooks 在插件卡片里查看）。
- **设置项扩充**
  - 表单从 model + 权限列表扩展到模型 / 界面 / 会话 / 通知 / 更新 / 权限六类约 17 个字段：布尔三态（继承 / 开 / 关）、枚举下拉、默认权限模式等；改为全宽布局。安全敏感与管理员项仍走原始 JSON。

### v0.2.2

- **技能来源（Skill Source）**
  - 「技能」面板新增「来源」标签：可添加无 marketplace manifest 的技能 Git 仓库，克隆后探测其中的技能并按需安装到当前作用域。
  - 来源仓库按 URL 派生唯一嵌套目录克隆（如 `github.com/owner/repo`），显示名递进去重（repo → owner/repo → 完整路径）。
  - 已安装技能按目录内容哈希检测「可更新」；删除来源不影响已安装技能。
- **插件市场修复**
  - 修复 GUI 启动时拿不到系统 PATH 导致「未安装 CLI」的问题，统一解析 `claude` 可执行文件路径。
  - 添加市场时自动将仓库 URL 规范化为 raw `marketplace.json` 链接；可用插件改为读取各市场 manifest（兼容新版 Claude CLI）。
- **全局刷新与无闪烁重载**
  - 顶栏新增「刷新全部」按钮；文件变更后各面板原地重载数据，不再整块重挂载，tab/滚动/展开状态得以保留。
  - 所有操作类提示统一改用 Tauri 原生弹窗。

### v0.2.1

- **钥匙串访问时机与错误提示优化**
  - 「接入」页面进入时不再读取系统钥匙串，仅在切换/激活 profile 时才读取。
  - 激活 profile 时若钥匙串访问被拒绝/取消，或密钥缺失，操作会失败且不会污染 `settings.json`。
  - 错误提示改用 Tauri 原生 dialog 弹窗，并本地化常见钥匙串错误文案。
- **其他**
  - Claude 订阅额度仅在用户显式刷新时请求，避免进入页面自动触发 API 调用。

### v0.2.0

- **接入页面 Claude 订阅增强**
  - 未登录时打开系统终端执行 `claude auth login --claudeai`，复用 Claude Code 官方 OAuth 流程。
  - macOS 优先从系统钥匙串读取 OAuth token，回退到 `~/.claude/.credentials.json`。
  - 已登录时可「设为用户默认」，与自定义 profile 切换并列。
  - 从 Anthropic 官方 `api/oauth/usage` 端点显示 5h / 7d / 7d-sonnet 等窗口额度与重置倒计时。
- **其他**
  - 减少启动时钥匙串授权弹窗（`state.json#active_providers` 缓存 + 内存缓存）。

## License

待定。
