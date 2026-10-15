# 深入说明

README 只讲三件事：**干什么 / 为什么 / 怎么用**。这里放细节。

- [为什么必须做成一个插件](#为什么必须做成一个插件)
- [它贡献了哪 5 行](#它贡献了哪-5-行)
- [压缩是怎么触发的（源码级）](#压缩是怎么触发的源码级)
- [手动登记到 profile（方式 B）](#手动登记到-profile方式-b)
- [分享给别人 / 别人的 DSH 版本不同](#分享给别人--别人的-dsh-版本不同)
- [升级 DSH 之后](#升级-dsh-之后)
- [兼容性说明](#兼容性说明)
- [目录结构与开发工具](#目录结构与开发工具)
- [上游与许可](#上游与许可)

## 为什么必须做成一个插件

想改这个数值，会依次撞到四件事：

1. **宿主平面那一行是被关掉的。** `@deepseek-ai/dsh-web-app` 在 bundle 补丁里把宿主平面的
   `compaction-basic`、`command-compact`、`tool-result-pruner` 全部 `disabled: true`——按
   "host-plane ownership after presets" 的架构，压缩后端交给每个会话的预设去挂载。
2. **真正跑会话的是预设里的独立实例。** `dsh-web-app/presets/{standard,cordis,ptc}.patch.yml` 里各有一个
   `compaction` 组，`isolate: { compaction: true }`，其中的 `compaction-basic` **没有写 config** → 用默认 0.8。
   所以在 profile 补丁里改宿主平面那一行，对实际会话**没有任何影响**。
3. **补丁是按行 id 整行替换的。** 没有"只改预设里某个嵌套值"的写法；要动预设内部，只能把整份预设声明重述一遍——
   本仓库的 `cordis.patch.yml` 就是这么来的（由脚本生成）。
4. **做成插件才有开关。** 插件的开关语义 = 它的 bundle 层在不在 profile 的 `dsh.profile.bundles` 里，
   所以"关掉那张卡片"真的会退回出厂行为，而不是留一堆没人管的配置。

## 它贡献了哪 5 行

| 行 id | 作用 |
| --- | --- |
| `auto-compact` | 插件自身的宿主行，启动时把生效阈值打进日志 |
| `compaction-basic` | 启用**宿主平面**压缩引擎，`thresholdRatio: 0.5` |
| `preset-standard` | standard 预设整份重述，内部 `compaction-basic` 阈值 0.5 |
| `preset-cordis` | cordis 预设整份重述，同上 |
| `preset-ptc` | ptc 预设整份重述，同上 |

`minimal` 预设不含压缩引擎，因此不涉及。

## 压缩是怎么触发的（源码级）

来自 `@deepseek-ai/dsh-compaction-basic`（[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)）：

- **触发时机**：`agent/pre-step` —— 每个 AI 步骤开始前量一次上下文；调用 `compactIfNeeded(agent, "pressure")`。
  一个步骤**内部**的增长它看不到（这正是痛点根源）。
- **阈值换算**：

  ```
  thresholdTokens = floor(min(contextWindow × thresholdRatio,
                              contextWindow − 预留输出 − headroomTokens))
  ```

  256K 窗口（`contextWindow = 262144`）时：0.5 ⇒ **131072 token**；出厂 0.8 会被 headroom 折算到约 188k（≈72%）。
- **低于阈值**：直接 `return null`，什么都不做。
- **超过阈值**：先让工具结果剪枝器剪一轮并重新测量；仍超才选一段可压缩区间做总结压缩；压完仍超会按
  `compactionRetries` 重试。
- **上下文溢出兜底**：模型返回 `CONTEXT_WINDOW_EXCEEDED` 时，`agent/request-error` 会触发一次
  `"context-overflow"` 压缩并重试（`maxOverflowRetries`）——这是救援，不是预防。
- **同一个引擎也服务手动 `/compact`**（`compactNow`，要求 agent 空闲，否则报 `busy`）。

## 手动登记到 profile（方式 B）

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

> ⚠️ `bundles` 的顺序就是层序。本插件必须排在 `@deepseek-ai/dsh-web-app` **之后**，
> 否则它覆盖 `compaction-basic` 的那一行会被 web-app 的 `disabled: true` 盖掉。

> ⚠️ 不要用 PowerShell 的 `Set-Content` / `ConvertTo-Json` 写这个 JSON：本机实测会带 BOM，
> 而 DSH 的 JSON 读取是严格的，会直接报 `Unexpected token` 并拒绝加载 profile。用 Node 写，或写完回读校验。

## 分享给别人 / 别人的 DSH 版本不同

这个包没有构建步骤（`lib/`、`locale/`、`cordis.patch.yml` 都已提交，`npm test` 零依赖），
所以别人拿到仓库后有两条路：

1. **仓库地址直装**：「插件 → + 添加插件」填 `github:youchai2016/dsh-plugin-auto-compact`。
   安装器会先做一次 GitHub 连通性检查（默认 5 秒超时）。
   注意：对话框里的"改用国内镜像"只切换 **npm 安装源**（`registry.npmmirror.com`），**对 git 地址无效**。
2. **克隆 + 本地路径**（任何网络都能用）：`git clone` 后把**绝对路径**填进「+ 添加插件」。

发布到 npm 之后最简形态是直接填包名 `dsh-plugin-auto-compact`，并把安装源切到中国大陆镜像。

**装之前先做一次兼容性自检**（预设声明是整份拷贝，与 DSH 版本强耦合）：

```bash
npm test            # 零依赖结构自检（8 项）
npm run regen       # 从"对方本机"的 DSH 重新生成预设覆盖（自动定位 presets）
npm run preflight   # 用"对方本机"的 loader 组合 profile，确认插件的层赢了
# 三条都过，再重启 DSH
```

`regen` 找不到对应预设行时会直接报错并指出文件名，不会静默写出错配置；若上游预设改了名，
同步 `tools/regen-preset-overrides.mjs` 顶部的 `PRESETS` 列表即可。

## 升级 DSH 之后

```bash
npm run regen      # 从本机 DSH 重新生成
npm test           # 结构没跑偏
npm run preflight  # 组合结果仍然是 0.5
# 重启 DSH
```

`regen` 需要能读到 `@deepseek-ai/dsh-web-app/presets`（自动搜索，或用 `--presets-dir <dir>` /
`$DSH_PRESETS_DIR` 指定）以及 `yaml` 包（本仓库 devDependency）。

## 兼容性说明

- 本插件**刻意不声明** `@deepseek-ai/*` 的 `peerDependencies`。DSH 会用 `evaluatePluginCompatibility`
  拿声明比对运行时版本，不一致就拒绝加载（除非在 profile 的 `compatibility.json` 里逐版本豁免）。
  不声明 = 永不被门禁拦；代价是版本漂移只能靠 `npm run preflight` 发现。
- 开发基准：DSH `0.2.0-rc.2`（patch 层格式、预设行 id、`compaction-basic` 配置字段均以此为准）。

## 目录结构与开发工具

```
dsh-plugin-auto-compact/
├─ cordis.patch.yml               # 生成物：插件贡献的 5 行（勿手改）
├─ lib/index.js                   # 宿主半：只负责报到，压缩逻辑是 DSH 内置的
├─ locale/{en,zh}.json            # 「插件」页卡片的标题与描述
├─ assets/icon.svg                # 卡片图标
├─ tools/regen-preset-overrides.mjs  # 重新生成预设覆盖（--check 只校验不写）
├─ tools/preflight.mjs            # 用 DSH 自己的 loader 组合 profile
├─ tests/patch-shape.test.mjs     # 零依赖结构测试（8 项）
└─ .github/workflows/ci.yml       # CI：npm test
```

`preflight` 会自动从 `$DSH_HOME/profiles/*/node_modules` 等位置找 `@deepseek-ai/dsh-app-boot`；
找不到时用 `--app-boot <path>` / `--profile <dir>` 指定。

## 上游与许可

MIT，见 [LICENSE](../LICENSE)。

`cordis.patch.yml` 中 `preset-standard` / `preset-cordis` / `preset-ptc` 三段**整份复制**自
`@deepseek-ai/dsh-web-app` 的 `presets/*.patch.yml`（MIT，© DeepSeek）。之所以复制而不是引用，
是因为补丁只能整行替换；升级 DSH 后请用 `npm run regen` 重新同步。
