/**
 * 断句模式 (chunk mode) — browser half.
 *
 * Adds a 断句 toggle to the composer tool row. While enabled, a finalized
 * plain-text assistant reply is replayed sentence by sentence (split on
 * 。！？；!?;… plus language-aware handling of ".", and newlines) instead of
 * appearing all at once, mimicking a human sending a message per sentence.
 *
 * Two playback styles:
 *  - inline (default): sentences fade in one after another inside the same
 *    message block;
 *  - bubbles: the message is rebuilt as one rounded bubble per sentence
 *    (WeChat-style).
 *
 * Interval and style are configurable through a small popover next to the
 * toggle (persisted in localStorage). Messages containing code blocks,
 * images, links or tables are left untouched.
 *
 * Failure policy: every DOM/runtime wiring failure is logged, never thrown —
 * the web shell fails the whole boot when a plugin apply throws.
 *
 * @module dsh-chunk-mode/client
 */

import { createElement as h, useState, useEffect, useRef } from 'react'

/** localStorage key for the whole config. */
const CONFIG_KEY = 'dsh-chunk-mode:config'
/** Legacy single-switch key (v0.1.0) kept for migration. */
const LEGACY_KEY = 'dsh-chunk-mode:enabled'
/** The attribute the assistant content root carries while streaming. */
const STREAMING_ATTR = 'data-streaming'
/** Style tag identity. */
const CSS_ID = '@dsh-external/dsh-client-ui-chunk-mode/style'

/** Default configuration. */
const DEFAULTS = { enabled: false, interval: 380, bubbles: false, maxChars: 0 }

// ---------------------------------------------------------------------------
// config (module-level mirror so the non-React engine reads live state)
// ---------------------------------------------------------------------------

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return { ...DEFAULTS, ...parsed }
    }
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy !== null) return { ...DEFAULTS, enabled: legacy === '1' }
  } catch {
    /* storage unavailable — fall through to defaults */
  }
  return { ...DEFAULTS }
}

function saveConfig(cfg) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
  } catch {
    /* storage unavailable — in-memory state only */
  }
}

/** Live config for the playback engine. */
let config = loadConfig()
function getConfig() {
  return config
}

// ---------------------------------------------------------------------------
// style
// ---------------------------------------------------------------------------

const STYLE_TEXT = `
.dshcm-wrap{position:relative;display:inline-flex;align-items:center}
.dshcm-toggle{
  display:inline-flex;align-items:center;gap:5px;
  height:26px;padding:0 10px;border-radius:999px;
  font-size:12px;line-height:1;white-space:nowrap;
  color:var(--dsw-alias-label-secondary, #888);
  background:transparent;border:1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.35));
  cursor:pointer;user-select:none;font-family:inherit;
}
.dshcm-toggle:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))}
.dshcm-toggle:focus-visible{outline:1.5px solid var(--dsw-alias-button-info-fill, #4f8cff);outline-offset:2px}
.dshcm-toggle.dshcm-on{
  color:var(--dsw-alias-button-info-fill, #4f8cff);
  border-color:currentColor;
  background:color-mix(in srgb, var(--dsw-alias-button-info-fill, #4f8cff) 12%, transparent);
}
.dshcm-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.55;flex:none}
.dshcm-gear{
  width:20px;height:26px;display:inline-flex;align-items:center;justify-content:center;
  border:none;background:transparent;color:var(--dsw-alias-label-secondary, #888);
  cursor:pointer;font-size:9px;padding:0 2px;font-family:inherit;
}
.dshcm-gear:hover{color:var(--dsw-alias-label-primary, #222)}
.dshcm-pop{
  position:absolute;top:calc(100% + 6px);left:0;z-index:60;
  min-width:230px;background:var(--dsw-alias-bg-base, #fff);
  border:1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.35));
  border-radius:10px;padding:10px 12px;
  box-shadow:0 8px 24px rgba(0,0,0,.18);
  display:flex;flex-direction:column;gap:9px;
}
.dshcm-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-primary, #222);cursor:default}
.dshcm-row input[type=range]{flex:1;min-width:0}
.dshcm-ms{min-width:44px;text-align:right;color:var(--dsw-alias-label-secondary, #888);font-variant-numeric:tabular-nums}
.dshcm-hint{font-size:11px;color:var(--dsw-alias-label-tertiary, #999);line-height:1.5}
.dshcm-sentence{margin:2px 0;white-space:pre-wrap;overflow-wrap:anywhere;animation:dshcm-fade .28s ease-out}
.dshcm-bubbles{display:flex;flex-direction:column;gap:4px;min-width:0}
.dshcm-bubble{
  background:color-mix(in srgb, var(--dsw-alias-label-primary, #222) 7%, transparent);
  border-radius:12px;padding:8px 12px;margin:2px 0;
  white-space:pre-wrap;overflow-wrap:anywhere;animation:dshcm-fade .28s ease-out;
}
@keyframes dshcm-fade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dshcm-sentence,.dshcm-bubble{animation:none}}
`

/** Inject the plugin stylesheet once. */
function ensureStyle() {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-plugin-css="' + CSS_ID + '"]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@dsh-external/dsh-client-ui-chunk-mode'
  tag.dataset.pluginCss = CSS_ID
  tag.textContent = STYLE_TEXT
  document.head.appendChild(tag)
}

// ---------------------------------------------------------------------------
// toggle component (rendered into conversation.input.left)
// ---------------------------------------------------------------------------

/** Composer tool-row toggle + settings popover. */
function ChunkModeToggle() {
  const [cfg, setCfg] = useState(() => loadConfig())
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // Mirror the config into the module-level engine state.
  useEffect(() => {
    config = cfg
  }, [cfg])

  // Close the popover on outside click.
  useEffect(() => {
    if (!open) return
    const onDoc = (event) => {
      if (wrapRef.current !== null && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const update = (patch) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    saveConfig(next)
    if (patch.enabled === false) finishAllPlayback()
  }

  return h(
    'span',
    { ref: wrapRef, className: 'dshcm-wrap' },
    h(
      'button',
      {
        type: 'button',
        className: 'dshcm-toggle' + (cfg.enabled ? ' dshcm-on' : ''),
        title: cfg.enabled
          ? '断句模式：已开启（' + cfg.interval + 'ms/句' + (cfg.bubbles ? ' · 独立气泡' : '') + '）'
          : '断句模式：已关闭，回复整段显示',
        'aria-pressed': cfg.enabled,
        onClick: () => update({ enabled: !cfg.enabled }),
      },
      h('span', { className: 'dshcm-dot' }),
      '断句',
    ),
    h(
      'button',
      {
        type: 'button',
        className: 'dshcm-gear',
        title: '断句设置',
        'aria-label': '断句设置',
        onClick: (event) => {
          event.stopPropagation()
          setOpen(!open)
        },
      },
      '▾',
    ),
    open &&
      h(
        'div',
        { className: 'dshcm-pop', onClick: (event) => event.stopPropagation() },
        h(
          'label',
          { className: 'dshcm-row' },
          '句间隔',
          h('input', {
            type: 'range',
            min: 100,
            max: 1000,
            step: 50,
            value: cfg.interval,
            onChange: (event) => update({ interval: Number(event.target.value) }),
          }),
          h('span', { className: 'dshcm-ms' }, cfg.interval + 'ms'),
        ),
        h(
          'label',
          { className: 'dshcm-row' },
          '最大断句长度',
          h('input', {
            type: 'range',
            min: 0,
            max: 2000,
            step: 50,
            value: cfg.maxChars,
            title: '0 = 不限制，所有纯文本都断句；设为上限后，超过该长度的回复整段显示',
            onChange: (event) => update({ maxChars: Number(event.target.value) }),
          }),
          h('span', { className: 'dshcm-ms' }, cfg.maxChars === 0 ? '不限制' : cfg.maxChars + '字'),
        ),
        h(
          'label',
          { className: 'dshcm-row' },
          h('input', {
            type: 'checkbox',
            checked: cfg.bubbles,
            onChange: (event) => update({ bubbles: event.target.checked }),
          }),
          '拆成独立气泡（微信式）',
        ),
        h(
          'div',
          { className: 'dshcm-hint' },
          '开启后回复按句拆开，每句一个气泡，逐条浮现。超过「最大断句长度」的回复（如工具说明、长报告）整段显示。',
        ),
      ),
  )
}

// ---------------------------------------------------------------------------
// sentence splitting (language-aware)
// ---------------------------------------------------------------------------

/** Characters that always end a sentence (kept with the sentence). */
const HARD_BOUNDARY = new Set(['。', '！', '？', '；', '!', '?', ';', '…', '⋯'])
/** Closing quotes/parens glued to the preceding ending punctuation. */
const TRAILER = /[」』"'）)]/

/**
 * Split text into sentences.
 *
 * - CJK and Latin sentence punctuation (。！？；!?;…) always cut.
 * - A Latin "." cuts only when followed by whitespace/end/quote, so decimals
 *   (3.14) and abbreviations (e.g. when followed by a word) survive.
 * - Newlines cut (paragraph boundaries).
 */
function splitSentences(text) {
  const out = []
  let buf = ''
  let i = 0
  const n = text.length
  const flush = () => {
    const s = buf.trim()
    if (s !== '') out.push(s)
    buf = ''
  }
  while (i < n) {
    const ch = text[i]
    buf += ch
    const isEnd = HARD_BOUNDARY.has(ch) || (ch === '.' && isLatinDotEnd(text, i))
    if (isEnd) {
      // Glue trailing closing quotes/brackets to the sentence.
      while (i + 1 < n && TRAILER.test(text[i + 1])) {
        buf += text[i + 1]
        i += 1
      }
      flush()
    } else if (ch === '\n') {
      flush()
    }
    i += 1
  }
  flush()
  return out
}

/** A Latin dot is a sentence end only when not part of a number/word run. */
function isLatinDotEnd(text, i) {
  const next = text[i + 1]
  if (next === undefined) return true
  if (/\s/.test(next)) return true
  if (TRAILER.test(next)) return true
  return false
}

// ---------------------------------------------------------------------------
// playback engine
// ---------------------------------------------------------------------------

/** Elements already handed to the engine (avoid re-processing on re-render). */
const seen = new WeakSet()
/** Live playback records: state -> { host, originalHTML, timers, done }. */
const playing = new Map()

/** Cancel every live playback and restore the original rendered content. */
function finishAllPlayback() {
  for (const state of playing.values()) {
    if (state.done) continue
    state.done = true
    for (const t of state.timers) clearTimeout(t)
    state.timers = []
    if (state.host && state.originalHTML !== '') state.host.innerHTML = state.originalHTML
  }
  playing.clear()
}

/**
 * Replay one settled plain-text assistant element.
 * @param el - the assistant content root (the element that carried data-streaming).
 */
function handleAssistant(el) {
  const cfg = getConfig()
  if (!cfg.enabled) return
  if (seen.has(el)) return
  if (!el.isConnected) return
  seen.add(el)

  // Skip anything but plain prose: code blocks, images, links, tables keep
  // their native rendering.
  if (el.querySelector('pre, code, img, a, table') !== null) return

  const body = el.firstElementChild ?? el
  const text = body.innerText ?? ''

  // Optional length cap: when maxChars > 0, blocks longer than it stay whole
  // (useful to spare tool-call narration / reports). Default 0 = unlimited:
  // every plain-text reply is split, including long summaries.
  if (cfg.maxChars > 0 && text.length > cfg.maxChars) return

  const sentences = splitSentences(text)
  if (sentences.length < 2) return

  try {
    if (cfg.bubbles) playBubbles(el, sentences, cfg.interval)
    else playInline(body, sentences, cfg.interval)
  } catch (error) {
    console.error('[dsh-chunk-mode] playback failed:', error)
    // Restore whatever we may have clobbered.
    finishAllPlayback()
  }
}

/** Inline style: sentences fade in one after another inside the same block. */
function playInline(body, sentences, interval) {
  const originalHTML = body.innerHTML
  body.textContent = ''
  const timers = []
  const state = { host: body, originalHTML, timers, done: false }
  playing.set(body, state)
  sentences.forEach((s, i) => {
    timers.push(
      setTimeout(() => {
        if (state.done) return
        const node = document.createElement('div')
        node.className = 'dshcm-sentence'
        node.textContent = s
        body.appendChild(node)
      }, i * interval),
    )
  })
  timers.push(
    setTimeout(() => {
      if (state.done) return
      state.done = true
      playing.delete(body)
    }, sentences.length * interval),
  )
}

/** Bubble style: one rounded bubble per sentence (WeChat-like). */
function playBubbles(el, sentences, interval) {
  const originalHTML = el.innerHTML
  const rootClass = typeof el.className === 'string' ? el.className : ''
  const container = document.createElement('div')
  container.className = rootClass + ' dshcm-bubbles'
  el.textContent = ''
  el.appendChild(container)

  const timers = []
  const state = { host: el, originalHTML, timers, done: false }
  playing.set(el, state)

  sentences.forEach((s, i) => {
    timers.push(
      setTimeout(() => {
        if (state.done) return
        const bubble = document.createElement('div')
        bubble.className = 'dshcm-bubble'
        bubble.textContent = s
        container.appendChild(bubble)
      }, i * interval),
    )
  })
  timers.push(
    setTimeout(() => {
      if (state.done) return
      state.done = true
      playing.delete(el)
    }, sentences.length * interval),
  )
}

/** Defer handling until React has settled the final DOM for the message. */
function scheduleHandle(el) {
  setTimeout(() => {
    if (!el.isConnected) return
    if (!getConfig().enabled) return
    handleAssistant(el)
  }, 80)
}

/** MutationObserver callback: watch streaming-end transitions. */
function onMutation(mutations) {
  if (!getConfig().enabled) return
  for (const m of mutations) {
    if (m.type === 'attributes' && m.attributeName === STREAMING_ATTR) {
      const el = m.target
      if (el.nodeType === 1 && !el.hasAttribute(STREAMING_ATTR) && el.isConnected) {
        scheduleHandle(el)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// plugin entry
// ---------------------------------------------------------------------------

/** Required services: the slot registry (client-runtime). */
export const inject = ['slots']

/** Apply the browser half. */
export function apply(ctx) {
  ctx.effect(() => {
    ensureStyle()
    const disposers = []

    disposers.push(
      ctx.slots.register(
        {
          name: 'conversation.input.left',
          id: 'dsh-chunk-mode-toggle',
          order: 90,
          label: '断句',
        },
        ChunkModeToggle,
      ),
    )

    let observer = null
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(onMutation)
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [STREAMING_ATTR],
      })
    }

    return () => {
      observer?.disconnect()
      finishAllPlayback()
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-chunk-mode: wiring')
}
