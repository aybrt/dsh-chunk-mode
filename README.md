# dsh-chunk-mode · 断句模式

> DSH Web GUI 插件：AI 回复按标点切句、逐句浮现，营造更自然的对话体验。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-Plugin-4f8cff.svg)](#安装)

聊天时 AI 一整段话砸过来，像念稿子；断句模式让回复按句逐条浮现，像真人一条一条发消息。

## 效果

- 输入栏工具行新增「断句」开关 + 「▾」设置，一键启停，状态本地持久化。
- 开启后，助手回复里的**纯文本消息**按句切分，逐条浮现：
  - **句间隔可调**：设置浮层里 100–1000ms 滑块（默认 380ms）。
  - **最大断句长度**：可选上限；默认 **不限制**，所有纯文本回复（包括长总结、
    工具说明）都按句逐条浮现。设上限后，超过该长度的回复整段显示。
  - **两种播放风格**：
    - 默认：句子在同一消息块内逐句淡入；
    - 独立气泡：拆成多个圆角气泡（微信式），逐条弹出。
- 含代码块 / 图片 / 链接 / 表格的消息保持原样，不做切分（避免破坏渲染）。
- 关闭开关时，正在播放的消息立即恢复完整内容。

## 安装

```sh
# 把插件放进任意目录（示例：~/.dsh/plugin-src/dsh-chunk-mode），然后：
dsh plugin --profile web add link:/绝对/路径/dsh-chunk-mode

# 重启 dsh web，输入栏左侧出现「断句」按钮
```

> 也可以 `dsh plugin --profile web add github:aybrt/dsh-chunk-mode`。

## 工作原理

纯浏览器端插件，不改 host、不动会话记录：

- **开关**：注册进 `conversation.input.left` slot（输入栏工具行）。
- **逐句播放**：MutationObserver 监听 assistant 消息根元素的
  `data-streaming` 属性（ui-conversation 的稳定契约）——流式结束后，
  对纯文本消息按句切分，逐句重建。

### 切句规则

- 句末标点：`。！？；!?;…`（中日英通用）直接切分。
- 英文句点 `.` 仅在后面跟空白/结尾/引号时切分，因此 `3.14`、`v1.2`
  这类数字/版本号不会被误切；`e.g.` 这类缩写后接空格仍会切开（已知折中）。
- 结尾引号/括号（`」』"'）)`）归入前一句。
- 换行按段落边界切分。

## 结构

```
dsh-chunk-mode/
├── src/client.js      # 浏览器半源码（ESM，人类可读）
├── lib/client.js      # 浏览器半构建产物（__ModuleLoader__ 格式，勿手改）
├── lib/index.js       # host 半（空实现，占位）
├── build-patch.cjs    # 构建脚本：src/client.js → lib/client.js
├── verify-build.cjs   # 校验脚本：模拟 ModuleLoader 验证产物导出
├── cordis.patch.yml   # 把 ui-dsh-chunk-mode 行插入 web profile 名册
└── package.json       # dsh.bundle + dsh.client 声明
```

## 开发

> ⚠️ DSH web 端**不做构建**：浏览器执行的必须是 `__ModuleLoader__.load`
> 格式的 bundle，裸 ESM 源码 serve 出去会报
> "loaded without registering ... via ModuleLoader.load"。

改完 `src/client.js` 后：

```sh
node build-patch.cjs   # 生成 lib/client.js
node verify-build.cjs  # 模拟 ModuleLoader 校验产物（PASS 才能提交）
```

`src/client.js` 与 `lib/client.js` **都要提交**。

## License

[MIT](LICENSE)
