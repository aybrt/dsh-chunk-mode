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

/** Displayed plugin version (shown in the settings popover for cache checks). */
const PLUGIN_VERSION = '0.3.0'

/**
 * Default configuration.
 * - interval: fixed per-sentence delay (ms) when smartDelay is off.
 * - smartDelay: delay per sentence = sentence length × charDelayMs (Operit-style
 *   "intelligent delay" — mimics typing speed).
 * - charDelayMs: per-character delay used by smartDelay.
 * - removePunctuation: strip 。！？.!? from the end of each sentence.
 * - bubbles: rebuild the message as one rounded bubble per sentence.
 * - maxChars: optional length cap above which a reply stays whole (0 = unlimited).
 */
const DEFAULTS = {
  enabled: false,
  interval: 380,
  smartDelay: true,
  charDelayMs: 60,
  removePunctuation: false,
  bubbles: false,
  maxChars: 0,
}

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
  display:inline-flex;align-items:center;gap:6px;
  height:28px;padding:0 12px;border-radius:999px;
  font-size:12.5px;font-weight:500;line-height:1;white-space:nowrap;
  color:var(--dsw-alias-label-secondary, #777);
  background:color-mix(in srgb, var(--dsw-alias-label-primary, #222) 9%, transparent);
  border:1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.55));
  cursor:pointer;user-select:none;font-family:inherit;
}
.dshcm-toggle:hover{
  color:var(--dsw-alias-label-primary, #222);
  background:color-mix(in srgb, var(--dsw-alias-label-primary, #222) 14%, transparent);
}
.dshcm-toggle:focus-visible{outline:2px solid var(--dsw-alias-button-info-fill, #4f8cff);outline-offset:2px}
.dshcm-toggle.dshcm-on{
  color:#fff;
  background:var(--dsw-alias-button-info-fill, #4f8cff);
  border-color:var(--dsw-alias-button-info-fill, #4f8cff);
  box-shadow:0 1px 5px color-mix(in srgb, var(--dsw-alias-button-info-fill, #4f8cff) 45%, transparent);
}
.dshcm-toggle.dshcm-on:hover{background:color-mix(in srgb, var(--dsw-alias-button-info-fill, #4f8cff) 85%, #000)}
.dshcm-toggle.dshcm-on .dshcm-dot{background:#fff;opacity:.95}
.dshcm-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.6;flex:none}
.dshcm-gear{
  width:24px;height:28px;margin-left:2px;border-radius:8px;
  display:inline-flex;align-items:center;justify-content:center;
  border:1px solid transparent;background:transparent;
  color:var(--dsw-alias-label-secondary, #888);
  cursor:pointer;font-size:10px;padding:0;font-family:inherit;
}
.dshcm-gear:hover{
  color:var(--dsw-alias-label-primary, #222);
  background:color-mix(in srgb, var(--dsw-alias-label-primary, #222) 10%, transparent);
  border-color:var(--dsw-alias-border-l1, rgba(128,128,128,.4));
}
.dshcm-gear:focus-visible{outline:2px solid var(--dsw-alias-button-info-fill, #4f8cff);outline-offset:1px}
.dshcm-pop{
  position:absolute;top:calc(100% + 6px);left:0;z-index:60;
  min-width:240px;max-height:min(420px, 70vh);overflow-y:auto;
  background:var(--dsw-alias-bg-base, #fff);
  border:1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.35));
  border-radius:10px;padding:10px 12px;
  box-shadow:0 8px 24px rgba(0,0,0,.18);
  display:flex;flex-direction:column;gap:9px;
}
.dshcm-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-primary, #222);cursor:default}
.dshcm-row input[type=range]{
  -webkit-appearance:none;appearance:none;
  flex:1;min-width:0;height:18px;margin:0;padding:0;
  background:transparent;cursor:pointer;
}
.dshcm-row input[type=range]::-webkit-slider-runnable-track{
  height:4px;border-radius:2px;
  background:color-mix(in srgb, var(--dsw-alias-label-primary, #222) 25%, transparent);
}
.dshcm-row input[type=range]::-webkit-slider-thumb{
  -webkit-appearance:none;appearance:none;
  width:15px;height:15px;margin-top:-5.5px;border-radius:50%;
  background:var(--dsw-alias-button-info-fill, #4f8cff);
  border:2px solid var(--dsw-alias-bg-base, #fff);
  box-shadow:0 1px 4px rgba(0,0,0,.35);
}
.dshcm-row input[type=range]::-moz-range-track{
  height:4px;border-radius:2px;
  background:color-mix(in srgb, var(--dsw-alias-label-primary, #222) 25%, transparent);
}
.dshcm-row input[type=range]::-moz-range-thumb{
  width:13px;height:13px;border-radius:50%;
  background:var(--dsw-alias-button-info-fill, #4f8cff);
  border:2px solid var(--dsw-alias-bg-base, #fff);
  box-shadow:0 1px 4px rgba(0,0,0,.35);
}
.dshcm-row input[type=range]:focus-visible{outline:2px solid var(--dsw-alias-button-info-fill, #4f8cff);outline-offset:2px;border-radius:4px}
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
          h('input', {
            type: 'checkbox',
            checked: cfg.smartDelay,
            onChange: (event) => update({ smartDelay: event.target.checked }),
          }),
          '智能延迟（按句长计算，模拟打字）',
        ),
        h(
          'label',
          { className: 'dshcm-row' },
          '每字符毫秒',
          h('input', {
            type: 'range',
            min: 20,
            max: 200,
            step: 10,
            value: cfg.charDelayMs,
            title: '智能延迟：句间隔 = 句子字数 × 此值',
            onChange: (event) => update({ charDelayMs: Number(event.target.value) }),
          }),
          h('span', { className: 'dshcm-ms' }, cfg.charDelayMs + 'ms'),
        ),
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
            title: '关闭智能延迟时，每句的固定间隔',
            onChange: (event) => update({ interval: Number(event.target.value) }),
          }),
          h('span', { className: 'dshcm-ms' }, cfg.interval + 'ms'),
        ),
        h(
          'label',
          { className: 'dshcm-row' },
          h('input', {
            type: 'checkbox',
            checked: cfg.removePunctuation,
            onChange: (event) => update({ removePunctuation: event.target.checked }),
          }),
          '移除句末标点',
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
          '按 Operit AI waifu 模式实现：URL/邮箱/链接保护防误切，智能延迟按句长计算。dsh-chunk-mode v' + PLUGIN_VERSION,
        ),
      ),
  )
}

// ---------------------------------------------------------------------------
// sentence splitting (Operit waifu-inspired: regex split + entity protection)
// ---------------------------------------------------------------------------

/**
 * Sentence-end split positions. Ported from Operit AI's WaifuMessageProcessor:
 *  - after 。！？～ (CJK) or !? — unless a closing quote follows
 *  - after a Latin "." — unless a digit/quote/another dot follows (so 3.14,
 *    v1.2 and trailing ellipses survive)
 *  - at end-of-line dots and after ellipses
 */
const SENTENCE_SPLIT_REGEX =
  /(?<=[。！？～])(?!["'”’」』])|(?<=[!?])(?!["'”’」』])|(?<=\.)(?![.\d"'”’」』])|(?<=\.)$|(?<=\.{3})|(?<=[…](?![…]))/

/** Entities that must never be split: markdown links/images, URLs, emails, domains. */
const ENTITY_PROTECTORS = [
  /!?\[[^\]]*?\]\([^)]*?\)/g,
  /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /(?<![@\w])(?:www\.)?(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?::\d+)?(?:[/?#][A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?/g,
]
/** Characters that belong to the sentence, not to a trailing entity. */
const TRAILER_PROTECTED = new Set([
  '。', '！', '？', '!', '?', '…', '，', ',', '；', ';', '：', ':', ')', '）', ']', '】', '}', '｝', '"', "'",
])

/**
 * Replace protected entities with opaque placeholders (\u0000n\u0000) so the
 * split regex cannot cut inside URLs/emails/links. Trailing punctuation is
 * kept outside the placeholder so it still terminates the sentence.
 */
function protectEntities(text) {
  const list = []
  let out = text
  for (const re of ENTITY_PROTECTORS) {
    out = out.replace(re, (match) => {
      let body = match
      let trailer = ''
      while (body.length > 0 && TRAILER_PROTECTED.has(body[body.length - 1])) {
        trailer = body[body.length - 1] + trailer
        body = body.slice(0, -1)
      }
      if (body === '') return match
      list.push(body)
      return '\u0000' + (list.length - 1) + '\u0000' + trailer
    })
  }
  return { text: out, list }
}

/** Restore entity placeholders in one split part. */
function restoreEntities(s, list) {
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => list[Number(i)] ?? m)
}

/** Merge standalone punctuation fragments back into the previous sentence. */
function mergePunctuationOnlySegments(list) {
  const out = []
  if (list.length === 0) return out
  out.push(list[0])
  for (let i = 1; i < list.length; i++) {
    const cur = list[i].trim()
    if (cur.length > 0 && /^[。！？~～.!?…]+$/.test(cur)) {
      const prev = out[out.length - 1]
      if (prev.includes('\n') || prev.includes('\r')) out.push(cur)
      else out[out.length - 1] = prev + cur
    } else {
      out.push(list[i])
    }
  }
  return out
}

/** Strip sentence-end punctuation (Operit's remove-punctuation option). */
function stripSentenceEndPunctuation(s) {
  if (s.endsWith('...')) return s.trim()
  return s.replace(/[。！？.!?]+$/, '').trim() || s
}

/** Delay before the next sentence: length-based (typing feel) or fixed. */
function computeInterval(sentence, cfg) {
  if (cfg.smartDelay) return Math.max(120, sentence.length * cfg.charDelayMs)
  return cfg.interval
}

/**
 * Split text into sentences: protect entities → regex split → restore →
 * merge punctuation-only fragments. Optional removePunctuation strips endings.
 */
function splitSentences(text, removePunctuation) {
  const { text: protectedText, list } = protectEntities(text)
  const parts = protectedText.split(SENTENCE_SPLIT_REGEX)
  const sentences = []
  for (const raw of parts) {
    let s = restoreEntities(raw, list).trim()
    if (s === '') continue
    if (removePunctuation) s = stripSentenceEndPunctuation(s)
    if (s !== '') sentences.push(s)
  }
  return mergePunctuationOnlySegments(sentences)
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

  const sentences = splitSentences(text, cfg.removePunctuation)
  if (sentences.length < 2) return

  try {
    if (cfg.bubbles) playBubbles(el, sentences, cfg)
    else playInline(body, sentences, cfg)
  } catch (error) {
    console.error('[dsh-chunk-mode] playback failed:', error)
    // Restore whatever we may have clobbered.
    finishAllPlayback()
  }
}

/**
 * Cumulative per-sentence schedule: each sentence appears after its own
 * computed delay (smart = length × charDelayMs, else fixed interval), so the
 * playback breathes with the text like a human typing.
 * @returns {number} total schedule time in ms.
 */
function scheduleSentences(sentences, cfg, timers, emit, state) {
  let t = 0
  sentences.forEach((s, i) => {
    timers.push(
      setTimeout(() => {
        if (state.done) return
        emit(s, i)
      }, t),
    )
    t += computeInterval(s, cfg)
  })
  timers.push(
    setTimeout(() => {
      if (state.done) return
      state.done = true
      state.finish()
    }, t + 80),
  )
  return t
}

/** Inline style: sentences fade in one after another inside the same block. */
function playInline(body, sentences, cfg) {
  const originalHTML = body.innerHTML
  body.textContent = ''
  const timers = []
  const state = {
    host: body,
    originalHTML,
    timers,
    done: false,
    finish: () => playing.delete(body),
  }
  playing.set(body, state)
  scheduleSentences(sentences, cfg, timers, (s) => {
    const node = document.createElement('div')
    node.className = 'dshcm-sentence'
    node.textContent = s
    body.appendChild(node)
  }, state)
}

/** Bubble style: one rounded bubble per sentence (WeChat-like). */
function playBubbles(el, sentences, cfg) {
  const originalHTML = el.innerHTML
  const rootClass = typeof el.className === 'string' ? el.className : ''
  const container = document.createElement('div')
  container.className = rootClass + ' dshcm-bubbles'
  el.textContent = ''
  el.appendChild(container)

  const timers = []
  const state = {
    host: el,
    originalHTML,
    timers,
    done: false,
    finish: () => playing.delete(el),
  }
  playing.set(el, state)
  scheduleSentences(sentences, cfg, timers, (s) => {
    const bubble = document.createElement('div')
    bubble.className = 'dshcm-bubble'
    bubble.textContent = s
    container.appendChild(bubble)
  }, state)
}

/**
 * Handle a settled assistant element without any full-text flash.
 *
 * Streaming-end fires the instant the last token lands, while React may still
 * be finishing the settled render. So we hide the block immediately, poll for
 * the text to stabilize (React done), then replay sentence by sentence.
 * Restoring visibility before the skip checks keeps no-op paths invisible-free.
 */
function scheduleHandle(el) {
  if (!getConfig().enabled) return
  // Hide the whole block immediately — no full-text flash before the replay.
  el.style.visibility = 'hidden'
  const body = el.firstElementChild ?? el
  let last = ''
  let stable = 0
  let cancelled = false
  const restore = () => {
    cancelled = true
    el.style.visibility = ''
  }
  const step = () => {
    if (cancelled) return
    if (!el.isConnected) {
      restore()
      return
    }
    const text = body.innerText ?? ''
    if (text === last) {
      stable += 1
      if (stable >= 2) {
        restore()
        if (getConfig().enabled) handleAssistant(el)
        return
      }
    } else {
      last = text
      stable = 0
    }
    setTimeout(step, 120)
  }
  setTimeout(step, 120)
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
