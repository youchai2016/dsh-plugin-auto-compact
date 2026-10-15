# dsh-plugin-auto-compact

> 上下文占用到 **50%** 就自动压缩 —— DeepSeek Harness（DSH）插件。
> Auto-compact a DSH session at **50%** context usage.

[![CI](https://github.com/youchai2016/dsh-plugin-auto-compact/actions/workflows/ci.yml/badge.svg)](https://github.com/youchai2016/dsh-plugin-auto-compact/actions/workflows/ci.yml)

---

## 1. 这个插件干什么

把 DSH 的自动压缩阈值从出厂 **80%** 改成 **50%**，而且**四处一起改**：宿主平面一行 + `standard` / `cordis` / `ptc` 三个会话预设各一行（会话真正跑的是预设里 `isolate` 出来的独立实例，只改宿主那一行不起作用）。

装完「插件」页会多一张卡片「**上下文自动压缩**」，可开关、可卸载。

- 256K 窗口 ⇒ 约 **131k token** 触发压缩（出厂约 188k）
- 压缩引擎是 DSH 内置的，本插件只决定"以什么参数启用它"

## 2. 为什么需要它（痛点）

> 几个会话同时开着，其中一个**在我还没来得及压缩**的时候就跑满了 —— 窗口继续不了，只能**再开一个新窗口**。
> 可新窗口不知道旧窗口发生过什么：项目背景、试过的方案、刚跑通的命令、你上次纠正我的地方，全都没了。
> 只好把同样的上下文再交代一遍、命令再跑一遍，**重复的输入和重复的工具调用还要重新计费**。

根因：DSH 的自动压缩**只在"步骤边界"检查**（`agent/pre-step`，每个步骤开始前量一次），而一个重步骤
（批量读文件、长命令输出、大 diff）能在单步之内把余量吃光 —— 80% 的阈值常常来不及救。降到 50%，
就是永远给"一个重步骤"留出整块空间。

详细复盘与讨论 → **[Issue #1](https://github.com/youchai2016/dsh-plugin-auto-compact/issues/1)**（欢迎补充你的场景）

## 3. 怎么用

### 安装

「**插件 → + 添加插件**」→ 填下面任意一种 → 安装 → **重启 DSH**（档案补丁不热重载）：

| 填什么 | 说明 |
| --- | --- |
| `github:youchai2016/dsh-plugin-auto-compact` | 仓库地址，需要能访问 GitHub |
| 克隆下来的**绝对路径** | 任何网络都能用：`git clone https://github.com/youchai2016/dsh-plugin-auto-compact.git`（https 被重置时改用 `git clone git@github.com:youchai2016/dsh-plugin-auto-compact.git`） |

重启后「插件 → **已安装**」出现卡片即成功。**关掉卡片开关 = 回到 DSH 出厂默认（80%）**，卸载则连同依赖一起移除。

### 验证（可选，推荐）

```bash
npm test            # 8 项结构自检，零依赖，裸 clone 就能跑
npm run preflight   # 用 DSH 自己的 loader 组合 profile，确认本插件的层赢了
```

> 你的 DSH 版本和作者的不同？先跑 `npm run regen` 再 preflight，让预设覆盖从你自己本机的 DSH 重新生成。

手动登记到 profile、给别人安装、升级 DSH 之后怎么同步、兼容性说明 —— 都在 [**docs/HOW-IT-WORKS.md**](./docs/HOW-IT-WORKS.md)。

## License

MIT，见 [LICENSE](./LICENSE)。`cordis.patch.yml` 里三段预设声明整份复制自 `@deepseek-ai/dsh-web-app`（MIT，© DeepSeek）。

---

## English

- **What it does**: turns DSH's built-in context compaction on at **50%** instead of the shipped 80% — on the host plane *and* inside the `standard` / `cordis` / `ptc` presets, because a session actually runs the preset's isolated engine. A card appears on the Plugins page; switch it off to return to stock behaviour.
- **Why it exists**: DSH checks usage only at *step boundaries* (`agent/pre-step`), so one heavy step — bulk file reads, a long command output, a big diff — can fill the window before compaction fires. You then open a fresh session with no memory of the old one, re-explain everything, and pay for every repeated input and tool call again. Compacting at 50% always leaves a full heavy step of room. Full write-up: [Issue #1](https://github.com/youchai2016/dsh-plugin-auto-compact/issues/1).
- **How to use**: Plugins → *Add plugin* → `github:youchai2016/dsh-plugin-auto-compact`, or clone the repo and paste the local path → restart DSH. Verify with `npm test` / `npm run preflight`; run `npm run regen` first if your DSH version differs.
- More detail: [docs/HOW-IT-WORKS.md](./docs/HOW-IT-WORKS.md). License: MIT.
