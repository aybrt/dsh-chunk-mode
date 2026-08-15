// Strict verification for the built lib/client.js: simulate the DSH
// __ModuleLoader__ environment, execute the bundle, and check its exports.
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, 'lib', 'client.js')
const code = fs.readFileSync(OUT, 'utf8')

// 1) Syntax check via the module system (parse + execute).
let loadedId = null
let loadedExports = null
global.window = {
  __ModuleLoader__: {
    load: ({ id, factory }) => {
      loadedId = id
      const fakeRequire = (mod) => {
        if (mod === 'react') {
          // Minimal stand-ins; only shape matters for load-time verification.
          return { createElement: () => {}, useState: () => [], useEffect: () => {}, useRef: () => ({}) }
        }
        throw new Error('unexpected require: ' + mod)
      }
      loadedExports = factory(fakeRequire)
    },
  },
}

// Execute the bundle in this process (it calls window.__ModuleLoader__.load).
// eslint-disable-next-line no-eval
new Function('window', code)(global.window)

// 3) Assertions.
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

check('id matches plugin id', loadedId === '@dsh-external/dsh-client-ui-chunk-mode', String(loadedId))
check('exports.inject present', Array.isArray(loadedExports?.inject), JSON.stringify(loadedExports?.inject))
check('inject includes slots', loadedExports?.inject?.includes('slots'))
check('exports.apply is function', typeof loadedExports?.apply === 'function')
check('no stray ESM syntax in bundle', !/^\s*(import|export)\s/m.test(code))

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) process.exit(1)
