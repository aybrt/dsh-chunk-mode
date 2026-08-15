# dsh-chunk-mode 断句模式

DSH Web GUI 浏览器端插件：AI 回复按标点切句、逐句浮现，营造更自然的对话体验。

## 功能

- 输入栏工具行新增「断句」开关按钮，一键启用/关闭（状态本地持久化）。
- 开启后，助手回复中的**纯文本消息**会按句（`。！？!?；;` 与换行）切分，
  逐句淡入显示，间隔约 380ms，像真人一条一条发消息。
- 含代码块 / 图片 / 链接 / 表格的消息保持原样，不做切分。
- 关闭开关时，正在播放的消息立即恢复完整内容。

## 安装

```sh
dsh plugin --profile web add link:C:/Users/aybrt/.dsh/plugin-src/dsh-chunk-mode
```

安装后重启 `dsh web` 生效。

## 结构

- `lib/index.js` — host 半（空实现，占位）。
- `lib/client.js` — 浏览器半：`conversation.input.left` 开关 +
  MutationObserver 监听 `data-streaming` 结束，触发逐句播放。
- `cordis.patch.yml` — 把 `ui-dsh-chunk-mode` 行插入 web profile 插件名册。
