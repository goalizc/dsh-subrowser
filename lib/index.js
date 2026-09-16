import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 包根目录：lib/index.js -> 包根。保证 bundle 可搬迁（node_modules 或本地 link 安装皆可）。
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 前端脚本：按 mtime 判断是否需要重读，避免常驻缓存导致改了不生效。
const WIDGET_FILE_CANDIDATES = [
  path.join(PACKAGE_ROOT, 'assets', 'subrowser.js'),
]
let widgetJsCache = null // { text, mtimeMs }
function loadWidgetJs() {
  for (const p of WIDGET_FILE_CANDIDATES) {
    try {
      const st = fs.statSync(p)
      if (widgetJsCache && widgetJsCache.mtimeMs === st.mtimeMs) return widgetJsCache.text
      const text = fs.readFileSync(p, 'utf8')
      widgetJsCache = { text, mtimeMs: st.mtimeMs }
      return text
    } catch (err) {}
  }
  return widgetJsCache ? widgetJsCache.text : ''
}

export default {
  name: 'dsh-subrowser',
  inject: ['webServer'],
  apply(ctx) {
    const disposers = []

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-subrowser/widget.js',
      handler: (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(loadWidgetJs())
      },
    }))

    disposers.push(ctx.webServer.tapIndex((html) => {
      if (html.indexOf('/dsh-subrowser/widget.js') !== -1) return html
      const tag = '<script defer src="/dsh-subrowser/widget.js"></script>'
      if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
      return html + tag
    }))

    ctx.effect(() => () => {
      for (const d of disposers) {
        try { d() } catch (err) {}
      }
    })
  },
}
