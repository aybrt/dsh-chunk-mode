# dsh-chunk-mode · 断句模式

> DSH Web GUI 插件：AI 回复按标点切句、逐句浮现，营造更自然的对话体验。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-Plugin-4f8cff.svg)](#安装)

聊天时 AI 一整段话砸过来，像念稿子；断句模式让回复按句逐条浮现，像真人一条一条发消息。

## 效果

- 输入栏工具行新增「断句」开关，一键启停，状态本地持久化。
- 开启后，助手回复里的**纯文本消息**按 `。！？!?；;` 与换行切句，
  每句间隔约 380ms 逐条淡入。
- 含代码块 / 图片 / 链接 / 表格的消息保持原样，不做切分（避免破坏渲染）。
- 关闭开关时，正在播放的消息立即恢复完整内容。

## 安装

```sh
# 把插件放进任意目录（示例：~/.dsh/plugin-src/dsh-chunk-mode），然后：
dsh plugin --profile web add link:/绝对/路径/dsh-chunk-mode

# 重启 dsh web，输入栏左侧出现「断句」按钮
```

> 也可以 `dsh plugin --profile web add github:<你的用户名>/dsh-chunk-mode`。

## 工作原理

纯浏览器端插件，不改 host、不动会话记录：

- **开关**：注册进 `conversation.input.left` slot（输入栏工具行）。
- **逐句播放**：MutationObserver 监听 assistant 消息根元素的
  `data-streaming` 属性（ui-conversation 的稳定契约）——流式结束后，
  对纯文本消息按句切分，逐句淡入重建。

## 结构

```
dsh-chunk-mode/
├── lib/index.js      # host 半（空实现，占位）
├── lib/client.js     # 浏览器半：开关 + 逐句播放引擎
├── cordis.patch.yml  # 把 ui-dsh-chunk-mode 行插入 web profile 名册
└── package.json      # dsh.bundle + dsh.client 声明
```

## 后续想法

- [ ] 可配置的句间隔
- [ ] 拆成多个独立气泡（更贴近微信式对话）
- [ ] 英文/其他语言标点细化

## License

[MIT](LICENSE)
