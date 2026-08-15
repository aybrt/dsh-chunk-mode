window.__ModuleLoader__.load({id: "@dsh-external/dsh-client-ui-chunk-mode",factory: (require) => {var module = { exports: {} };var exports = module.exports;Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
/**
 * 断句模式 (chunk mode) — browser half.
 *
 * Adds a 断句 toggle to the composer tool row. While enabled, a finalized
 * plain-text assistant reply is replayed sentence by sentence (split on
 * 。！？!?；; and newlines) instead of appearing all at once, mimicking a
 * human sending a message per sentence. Messages containing code blocks,
 * images, links or tables are left untouched.
 *
 * Failure policy: every DOM/runtime wiring failure is logged, never thrown —
 * the web shell fails the whole boot when a plugin apply throws.
 *
 * @module dsh-chunk-mode/client
 */

const { createElement: h, useState } = require('react');

/** localStorage key for the toggle state. */
const STORAGE_KEY = 'dsh-chunk-mode:enabled'
/** The attribute the assistant content root carries while streaming. */
const STREAMING_ATTR = 'data-streaming'
/** Delay between revealed sentences. */
const SENTENCE_DELAY = 380
/** Style tag identity. */
const CSS_ID = '@dsh-external/dsh-client-ui-chunk-mode/style'

// ---------------------------------------------------------------------------
// style
// ---------------------------------------------------------------------------

const STYLE_TEXT = `
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
.dshcm-sentence{margin:2px 0;white-space:pre-wrap;overflow-wrap:anywhere;animation:dshcm-fade .28s ease-out}
@keyframes dshcm-fade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dshcm-sentence{animation:none}}
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
// state helpers
// ---------------------------------------------------------------------------

function isEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// toggle component (rendered into conversation.input.left)
// ---------------------------------------------------------------------------

/** Composer tool-row toggle. */
function ChunkModeToggle() {
  const [on, setOn] = useState(() => isEnabled())
  const toggle = () => {
    const next = !on
    setOn(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* storage unavailable — keep the in-memory state */
    }
    if (!next) finishAllPlayback()
  }
  return h(
    'button',
    {
      type: 'button',
      className: 'dshcm-toggle' + (on ? ' dshcm-on' : ''),
      title: on ? '断句模式：已开启，回复将按句逐条浮现' : '断句模式：已关闭，回复整段显示',
      'aria-pressed': on,
      onClick: toggle,
    },
    h('span', { className: 'dshcm-dot' }),
    '断句',
  )
}

// ---------------------------------------------------------------------------
// sentence splitting
// ---------------------------------------------------------------------------

/** Split text on sentence-ending punctuation and newlines, keeping the endings. */
function splitSentences(text) {
  const out = []
  let buf = ''
  for (const ch of text) {
    buf += ch
    if (/[。！？!?；;]/.test(ch) || ch === '\n') {
      const s = buf.trim()
      if (s !== '') out.push(s)
      buf = ''
    }
  }
  const rest = buf.trim()
  if (rest !== '') out.push(rest)
  return out
}

// ---------------------------------------------------------------------------
// sentence-by-sentence playback engine
// ---------------------------------------------------------------------------

/** Elements already handed to the engine (avoid re-processing on re-render). */
const seen = new WeakSet()
/** Live playback records: element -> { body, originalHTML, timers, done }. */
const playing = new Map()

/** Cancel every live playback and restore the original rendered content. */
function finishAllPlayback() {
  for (const state of playing.values()) {
    if (state.done) continue
    state.done = true
    for (const t of state.timers) clearTimeout(t)
    state.timers = []
    if (state.body && state.originalHTML !== '') state.body.innerHTML = state.originalHTML
  }
  playing.clear()
}

/**
 * Replay one settled plain-text assistant element sentence by sentence.
 * @param el - the assistant content root (the element that carried data-streaming).
 */
function handleAssistant(el) {
  if (!isEnabled()) return
  if (seen.has(el)) return
  if (!el.isConnected) return
  seen.add(el)

  // Skip anything but plain prose: code blocks, images, links, tables keep
  // their native rendering.
  if (el.querySelector('pre, code, img, a, table') !== null) return

  const body = el.firstElementChild ?? el
  const text = body.innerText ?? ''
  const sentences = splitSentences(text)
  if (sentences.length < 2) return

  const originalHTML = body.innerHTML
  body.textContent = ''
  const timers = []
  const state = { body, originalHTML, timers, done: false }
  playing.set(el, state)

  sentences.forEach((s, i) => {
    timers.push(
      setTimeout(() => {
        if (state.done) return
        const node = document.createElement('div')
        node.className = 'dshcm-sentence'
        node.textContent = s
        body.appendChild(node)
      }, i * SENTENCE_DELAY),
    )
  })
  timers.push(
    setTimeout(() => {
      if (state.done) return
      state.done = true
      playing.delete(el)
    }, sentences.length * SENTENCE_DELAY),
  )
}

/** Defer handling until React has settled the final DOM for the message. */
function scheduleHandle(el) {
  setTimeout(() => {
    if (!el.isConnected) return
    if (!isEnabled()) return
    try {
      handleAssistant(el)
    } catch (error) {
      console.error('[dsh-chunk-mode] playback failed:', error)
    }
  }, 80)
}

/** MutationObserver callback: watch streaming-end transitions. */
function onMutation(mutations) {
  if (!isEnabled()) return
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
const inject = ['slots']

/** Apply the browser half. */
function apply(ctx) {
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

exports.inject = inject;
exports.apply = apply;
return module.exports;
}
});
