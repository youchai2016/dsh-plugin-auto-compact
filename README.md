# dsh-plugin-auto-compact

> 让 DeepSeek Harness 会话的上下文占用达到 **50%** 就自动压缩。
> Auto-compact a DSH session once its context usage reaches **50%**.

[![CI](https://github.com/youchai2016/dsh-plugin-auto-compact/actions/workflows/ci.yml/badge.svg)](https://github.com/youchai2016/dsh-plugin-auto-compact/actions/workflows/ci.yml)

DSH 内置的压缩引擎出厂阈值是 80%（`DEFAULT_THRESHOLD_RATIO = 0.8`）。本插件把它统一改成 50%，并且以**一个真正的 profile bundle 插件**的形态交付：在「插件」页有一张卡片、可开关、可卸载，而不是散落在 profile 补丁里的几行配置。

---

## 为什么需要一个插件

想改这个数值，你会依次撞到四件事：

1. **宿主平面那一行是被关掉的。** `@deepseek-ai/dsh-web-app` 在 bundle 补丁里把宿主平面的 `compaction-basic`、`command-compact`、`tool-result-pruner` 全部 `disabled: true`——按 "host-plane ownership after presets" 的架构，压缩后端交给每个会话的预设去挂载。
2. **真正跑会话的是预设里的独立实例。** `dsh-web-app/presets/{standard,cordis,ptc}.patch.yml` 里各有一个 `compaction` 组，`isolate: { compaction: true }`，其中的 `compaction-basic` **没有写 config** → 用默认 0.8。所以在 profile 补丁里改宿主平面那一行，对实际会话**没有任何影响**。
3. **补丁是按行 id 整行替换的。** 没有"只改预设里某个嵌套值"的写法；要动预设内部，只能把整份预设声明重述一遍——本仓库的 [`cordis.patch.yml`](./cordis.patch.yml) 就是这么来的（由脚本生成，见下）。
4. **做成插件才有开关。** 插件的开关语义 = 它的 bundle 层在不在 profile 的 `dsh.profile.bundles` 里，所以"关掉那张卡片"真的会退回出厂行为，而不是留一堆没人管的配置。

## 它贡献了什么

| 行 id | 作用 |
| --- | --- |
| `auto-compact` | 插件自身的宿主行，启动时把生效阈值打进日志 |
| `compaction-basic` | 启用**宿主平面**压缩引擎，`thresholdRatio: 0.5` |
| `preset-standard` | standard 预设整份重述，内部 `compaction-basic` 阈值 0.5 |
| `preset-cordis` | cordis 预设整份重述，同上 |
| `preset-ptc` | ptc 预设整份重述，同上 |

`minimal` 预设不含压缩引擎，因此不涉及。

## 工作原理（对着源码）

- **触发时机**：`agent/pre-step` —— 每个 AI 步骤开始前量一次上下文；`compactIfNeeded(agent, "pressure")`。
- **阈值换算**：

  ```
  thresholdTokens = floor(min(contextWindow × thresholdRatio,
                              contextWindow − 预留输出 − headroomTokens))
  ```

  256K 窗口（`contextWindow = 262144`）时，50% ≈ **131072 token**。
- **低于阈值**：直接 `return null`，什么都不做。
- **超过阈值**：先让工具结果剪枝器剪一轮并重新测量；仍超才选一段可压缩区间做总结压缩，压完仍超会按 `compactionRetries` 重试。
- **同一个引擎也服务手动 `/compact`**（`compactNow`，要求 agent 空闲，否则报 `busy`）。

源码：`@deepseek-ai/dsh-compaction-basic` → [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

## 安装

### 方式 A：DSH 界面（推荐）

1. 「**插件** → **+ 添加插件**」→ 填本机绝对路径（例如 `C:\Users\me\Documents\dsh-plugin-auto-compact`）；
2. 安装完成后**重启 DSH**（profile 补丁不热重载，安装提示也会说明"下次启动后加载"）；
3. 重启后「插件」页 **已安装** 区出现卡片「上下文自动压缩」。

### 方式 B：手动登记到 profile

```jsonc
// <DSH_HOME>/profiles/<profile>/package.json
{
  "dependencies": {
    "dsh-plugin-auto-compact": "link:C:/path/to/dsh-plugin-auto-compact"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-plugin-auto-compact"   // 放最后：后写的层赢
      ]
    }
  }
}
```

再把包链接进 profile 的 `node_modules`（Windows：`New-Item -ItemType Junction`，或直接 `pnpm install`），然后重启。

> ⚠️ `bundles` 的顺序就是层序。本插件必须排在 `@deepseek-ai/dsh-web-app` **之后**，否则它覆盖 `compaction-basic` 的那一行会被 web-app 的 `disabled: true` 盖掉。

## 把插件分享给别人

这个包没有构建步骤（`lib/`、`locale/`、`cordis.patch.yml` 都已提交，`npm test` 零依赖），所以别人拿到仓库后有两条路：

### 1. 直接用仓库地址（网络能访问 GitHub 时最省事）

「插件 → **+ 添加插件**」→ 填 `github:youchai2016/dsh-plugin-auto-compact`（或 `https://github.com/youchai2016/dsh-plugin-auto-compact`）→ 安装 → **重启 DSH**。

安装器会先做一次 GitHub 连通性检查（默认 5 秒超时），失败会提示"无法访问 GitHub"。注意：对话框里的"改用国内镜像"只切换 **npm 安装源**（`registry.npmmirror.com`），对 git 地址无效——那种情况下走第 2 条。

### 2. 先克隆、再填本地目录（任何网络都能用）

```bash
git clone https://github.com/youchai2016/dsh-plugin-auto-compact.git
# 若 https 被重置（部分国内网络会），改用 SSH：
git clone git@github.com:youchai2016/dsh-plugin-auto-compact.git
```

然后在「+ 添加插件」里填**克隆下来的绝对路径** → 安装 → 重启；也可以按上面「方式 B」手动登记到 profile。

> 发布到 npm 之后，最简形态是直接填包名 `dsh-plugin-auto-compact`，并把安装源切到中国大陆镜像。

### 3. ⚠️ 装之前先做一次兼容性自检

`cordis.patch.yml` 里 standard / cordis / ptc 三段是**整份拷贝**自 DSH 的预设声明，因此和 DSH 版本强耦合。别人的 DSH 版本与作者不同时，先跑：

```bash
npm test          # 零依赖结构自检（8 项）
npm run regen     # 从"对方本机"的 DSH 重新生成预设覆盖（自动定位 presets）
npm run preflight # 用"对方本机"的 loader 组合 profile，确认插件的层赢了
# 三段都通过后再重启 DSH
```

`regen` 找不到对应的预设行时会直接报错并指出文件名，不会静默写出错配置；若上游预设已改名，同步 `tools/regen-preset-overrides.mjs` 顶部的 `PRESETS` 列表即可。

## 开关语义

| 操作 | 结果 |
| --- | --- |
| 卡片开关打开（默认） | 插件层生效：宿主平面启用 + 4 处阈值 0.5 |
| 卡片开关关闭 | 从 `dsh.profile.bundles` 移出本层 → 回到 DSH 出厂默认（宿主平面停用、预设 0.8） |
| 卸载 | 同上，并删掉依赖与 `node_modules` 链接 |

## 验证

```bash
npm test                 # 零依赖，裸 clone 就能跑：结构、行 id、阈值、词典、图标、宿主半可加载
npm run preflight        # 用 DSH 自己的 loader 组合 profile，确认"本插件的层赢了"（重启前即可验证）
npm run regen -- --check # 确认拷贝的预设声明是否落后于本机 DSH
```

`preflight` 会自动从 `$DSH_HOME/profiles/*/node_modules` 等位置找 `@deepseek-ai/dsh-app-boot`；找不到时用 `--app-boot <path>` / `--profile <dir>` 指定。

## 升级 DSH 之后

预设声明是**整份拷贝**进 `cordis.patch.yml` 的，所以上游改了预设内容时需要同步：

```bash
npm run regen     # 从本机 DSH 重新生成
npm test          # 结构没跑偏
npm run preflight # 组合结果仍然是 0.5
# 重启 DSH
```

`regen` 需要能读到 `@deepseek-ai/dsh-web-app/presets`（自动搜索，或用 `--presets-dir <dir>` / `$DSH_PRESETS_DIR` 指定）以及 `yaml` 包（本仓库 devDependency）。

## 兼容性说明

- 本插件**刻意不声明** `@deepseek-ai/*` 的 `peerDependencies`。DSH 会用 `evaluatePluginCompatibility` 拿声明去比对运行时版本，不一致就拒绝加载（除非在 profile 的 `compatibility.json` 里逐版本豁免）。不声明 = 永不被门禁拦；代价是版本漂移只能靠 `npm run preflight` 发现。
- 开发基准：DSH `0.2.0-rc.2`（patch 层格式、预设行 id、`compaction-basic` 配置字段均以此为准）。

## 目录结构

```
dsh-plugin-auto-compact/
├─ cordis.patch.yml               # 生成物：插件贡献的 5 行（勿手改）
├─ lib/index.js                   # 宿主半：只负责报到，压缩逻辑是 DSH 内置的
├─ locale/{en,zh}.json            # 「插件」页卡片的标题与描述
├─ assets/icon.svg                # 卡片图标
├─ tools/regen-preset-overrides.mjs
├─ tools/preflight.mjs
├─ tests/patch-shape.test.mjs
└─ .github/workflows/ci.yml
```

## 许可与上游

MIT（见 [LICENSE](./LICENSE)）。

`cordis.patch.yml` 中 `preset-standard` / `preset-cordis` / `preset-ptc` 三段**整份复制**自 `@deepseek-ai/dsh-web-app` 的 `presets/*.patch.yml`（MIT，© DeepSeek）。之所以复制而不是引用，是因为补丁只能整行替换；升级 DSH 后请用 `npm run regen` 重新同步。

---

## English

`dsh-plugin-auto-compact` turns DSH's built-in context compaction on at **50%** instead of the shipped 80% default.

It ships as a real profile bundle plugin, because a plain patch line is not enough: `@deepseek-ai/dsh-web-app` disables the host-plane compaction engine and moves compaction behind per-session agent presets, each mounting its own isolated `compaction-basic` with no config (0.8). A DSH patch replaces targeted rows wholesale, so changing one nested value inside a preset means restating the whole preset — which is exactly what the generated `cordis.patch.yml` does for `standard`, `cordis`, and `ptc`.

- **Install**: DSH → Plugins → *Add plugin* → point at this directory → restart DSH. Or register it manually in `<DSH_HOME>/profiles/<profile>/package.json` (`link:` dependency + last entry in `dsh.profile.bundles`).
- **Install for someone else**: paste `github:youchai2016/dsh-plugin-auto-compact` into *Add plugin* (needs GitHub reachable), or `git clone` the repo and paste the local absolute path — then restart. The dialog's "China mirror" option only switches the **npm registry**, not git URLs.
- **Before installing on a different DSH version**: `npm test && npm run regen && npm run preflight` (the preset declarations are copied per version), then restart.
- **Switch**: the card's toggle adds/removes this bundle layer; off returns to stock behaviour.
- **Threshold math**: `min(contextWindow × 0.5, contextWindow − reserved output − headroom)` — about 131k tokens on a 262k window.
- **Verify**: `npm test` (dependency-free), `npm run preflight` (composes the profile with DSH's own loader), `npm run regen -- --check` (are the copied preset declarations stale?).
- **After upgrading DSH**: `npm run regen && npm test && npm run preflight`, then restart.
- **License**: MIT. The preset declarations are copied from `@deepseek-ai/dsh-web-app` (MIT, © DeepSeek); regenerate them with `npm run regen`.
