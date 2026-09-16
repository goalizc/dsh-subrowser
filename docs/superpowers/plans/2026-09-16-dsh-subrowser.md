# DSH 浮动子浏览器（dsh-subrowser）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 DSH Web 界面主聊天页实现一个可打开多个 iframe 子浏览器窗口、可拖拽缩放、右侧图标栏管理、Esc 一键最小化、localStorage 持久化的标准 DSH bundle 插件。

**Architecture:** 仿 dsh-whale-widget 插件骨架（package.json + cordis.patch.yml + lib/index.js 宿主 + assets 前端单文件）。宿主仅提供 `/dsh-subrowser/widget.js` 静态路由并按 mtime 热读，用 `tapIndex` 把脚本注入每个 index 页面。前端 `subrowser.js` 分四个命名空间模块（SB.util / SB.window / SB.dock / SB.manager），纯原生 JS，状态存 localStorage。

**Tech Stack:** Node.js（宿主，仅 node:fs / node:path / node:url）、原生浏览器 JS（无框架无依赖）、DSH bundle 插件机制（ctx.webServer.register / tapIndex）。

## Global Constraints

- 标准 DSH bundle 插件：`package.json` 必须含 `dsh.bundle.patch` 指向 `./cordis.patch.yml`，type 为 `module`，name 为 `dsh-subrowser`
- 宿主 `lib/index.js` 只做静态资源服务，不含凭据、不联网、不接入 DSH 信任栅栏
- 前端只在主聊天界面初始化：`#root` 下有 `textarea` 或 `[contenteditable="true"]`，否则不碰 DOM
- 窗口上限 8 个；最小尺寸 240×180px；窗口始终约束在视口内
- 窗口操作只有「最小化（隐藏，右侧图标重新显示）」与「关闭」，无最大化
- 状态存 localStorage key `dsh-subrowser:v1`，写入防抖 300ms，拖动/缩放结束时写
- Esc 一键全部最小化；iframe 聚焦时不拦截（跨域 iframe 天然隔离）
- 受 iframe 限制的站点：窗口内提示「该站点不允许内嵌，可点『外部打开』」，「外部打开」在当前标签页打开
- URL 回车导航自动补 `https://`；非法 URL 输入框标红提示，不导航
- 刷新页面后窗口恢复显示（所见即所得）
- 代码注释使用中文；无 emoji（除非用户要求）
- 验证以手动浏览器操作为主，不引入单元测试框架（遵循 whale-widget 模式）

---

### Task 1: 插件骨架与宿主静态路由

**Files:**
- Create: `z:\dsh-subrowser\package.json`
- Create: `z:\dsh-subrowser\cordis.patch.yml`
- Create: `z:\dsh-subrowser\lib\index.js`
- Create: `z:\dsh-subrowser\assets\subrowser.js`（本任务只放最小占位，Task 2 起填充）

**Interfaces:**
- Produces: 宿主 `default` 导出对象 `{ name, inject: ['webServer'], apply(ctx) }`；路由 `GET /dsh-subrowser/widget.js`；`tapIndex` 注入 `<script defer src="/dsh-subrowser/widget.js"></script>`。后续任务依赖：前端脚本以 IIFE 注入页面，宿主无关。

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "dsh-subrowser",
  "version": "0.1.0",
  "description": "DSH Web 界面内的浮动子浏览器：多窗口 iframe、拖拽缩放、右侧图标栏、Esc 一键最小化、localStorage 持久化",
  "keywords": ["dsh", "dsh-plugin", "deepseek-harness", "browser", "widget"],
  "type": "module",
  "main": "lib/index.js",
  "files": ["lib", "assets", "cordis.patch.yml", "README.md"],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  },
  "license": "MIT"
}
```

- [ ] **Step 2: 创建 `cordis.patch.yml`**

```yaml
# ============================================================================
# dsh-subrowser —— DSH bundle patch
# ============================================================================
# 这是插件的"挂载声明"。DSH 启动时按 bundle 层栈叠加各插件 patch，
# 本文件把子浏览器脚本注入 Web profile 的配置树。
#
# 安装方式：
#   dsh plugin --profile web add link:<本目录绝对路径>
# ============================================================================

- insert:
    - id: dsh-subrowser
      name: dsh-subrowser
```

- [ ] **Step 3: 创建 `lib/index.js`（宿主）**

```js
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
```

- [ ] **Step 4: 创建最小占位 `assets/subrowser.js`**

```js
// 占位：Task 2 起填充完整实现。
(function () {
  if (window.__dshSubrowser) return
  window.__dshSubrowser = true
})()
```

- [ ] **Step 5: 语法校验**

Run: `node --check z:\dsh-subrowser\lib\index.js && node --check z:\dsh-subrowser\assets\subrowser.js`
Expected: 无输出、exit 0

- [ ] **Step 6: 提交**

```bash
git add package.json cordis.patch.yml lib/index.js assets/subrowser.js
git commit -m "feat: 插件骨架与宿主静态路由"
```

---

### Task 2: 前端基座 — 页面自检 + CSS + 右侧图标栏

**Files:**
- Modify: `z:\dsh-subrowser\assets\subrowser.js`（整体重写为本任务+后续任务的增量）

**Interfaces:**
- Consumes: Task 1 的注入机制（脚本 IIFE 注入每个 index 页面）
- Produces: `SB.util`（`sbEl(tag, cls, parent)` 建元素、`sbCss(cssText)` 注入样式）、`SB.dock.init(root)` 创建右侧图标栏 DOM（`+` 按钮 + 窗口图标容器）、`SB.manager.init()` 入口；全局命名空间 `window.SB`。后续任务调用 `SB.dock.addWindowIcon(win)` / `SB.dock.removeWindowIcon(id)` / `SB.dock.refresh()`。

- [ ] **Step 1: 写页面自检与命名空间骨架**

```js
(function () {
  if (window.__dshSubrowser) return
  window.__dshSubrowser = true

  var SB = window.SB = {}
  SB.v = '0.1.0'
  SB.STORAGE_KEY = 'dsh-subrowser:v1'
  SB.MAX_WINDOWS = 8
  SB.MIN_W = 240
  SB.MIN_H = 180

  // —— 页面自检：只在 DSH 主聊天界面初始化 ——
  // 主聊天界面特征：composer 输入区（新版 contenteditable div，旧版 textarea）。
  function sbIsChatRoot(r) {
    return !!(r && (r.querySelector('textarea') || r.querySelector('[contenteditable="true"]')))
  }
  var sbEnabled = false
  try {
    var sbRoot = document.getElementById('root')
    if (sbIsChatRoot(sbRoot)) {
      sbEnabled = true
    } else {
      // 尚未渲染：轮询等待（主界面异步挂载），超过 5s 视为非主界面放弃
      var sbPollTries = 0
      var sbPoll = setInterval(function () {
        sbPollTries++
        if (sbIsChatRoot(document.getElementById('root'))) {
          clearInterval(sbPoll)
          sbEnabled = true
          try { SB.manager.init() } catch (err) {}
          return
        }
        if (sbPollTries >= 10) {
          clearInterval(sbPoll)
        }
      }, 500)
    }
  } catch (err) {}
  if (!sbEnabled) return
  try { SB.manager.init() } catch (err) {}
})()
```

- [ ] **Step 2: 写 `SB.util`（元素工具 + 样式注入）**

```js
  // —— SB.util：公共工具 ——
  SB.util = (function () {
    function sbEl(tag, cls, parent, text) {
      var el = document.createElement(tag)
      if (cls) el.className = cls
      if (parent) parent.appendChild(el)
      if (text !== undefined) el.textContent = text
      return el
    }
    function sbCss(cssText) {
      var style = document.createElement('style')
      style.textContent = cssText
      document.head.appendChild(style)
    }
    return { sbEl: sbEl, sbCss: sbCss }
  })()
```

- [ ] **Step 3: 写整体 CSS（图标栏 + 窗口 + 通用）**

```js
  SB.util.sbCss([
    // —— 右侧图标栏 ——
    '.sbr-dock{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:9998;display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 6px;border-radius:10px 0 0 10px;background:rgba(30,30,40,.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:-2px 0 8px rgba(0,0,0,.18);user-select:none;-webkit-user-select:none}',
    '.sbr-dock-btn{width:34px;height:34px;border:0;border-radius:8px;background:rgba(255,255,255,.12);color:#fff;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s ease}',
    '.sbr-dock-btn:hover{background:rgba(255,255,255,.22)}',
    '.sbr-dock-sep{width:20px;height:1px;background:rgba(255,255,255,.18);margin:2px 0}',
    '.sbr-dock-ico{width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.10);color:#fff;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s ease;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
    '.sbr-dock-ico.sbr-active{background:rgba(64,156,255,.45)}',
    '.sbr-dock-ico:hover{background:rgba(255,255,255,.20)}',
    // —— 浏览器窗口 ——
    '.sbr-win{position:fixed;z-index:9990;min-width:240px;min-height:180px;display:flex;flex-direction:column;border-radius:10px;background:#1e1e28;border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 30px rgba(0,0,0,.35);overflow:hidden;font-family:inherit}',
    '.sbr-win.sbr-top{z-index:9997}',
    '.sbr-bar{flex:0 0 auto;height:38px;display:flex;align-items:center;gap:6px;padding:0 8px;background:rgba(255,255,255,.06);cursor:default;user-select:none;-webkit-user-select:none;touch-action:none;position:relative;z-index:2}',
    '.sbr-bar-dots{display:flex;gap:4px;padding:0 2px;cursor:grab;touch-action:none}',
    '.sbr-dot{width:10px;height:10px;border-radius:50%}',
    '.sbr-dot-1{background:#ff5f57}.sbr-dot-2{background:#febc2e}.sbr-dot-3{background:#28c840}',
    '.sbr-addr{flex:1 1 auto;min-width:60px;height:24px;border:0;border-radius:6px;padding:0 8px;background:rgba(0,0,0,.28);color:#e8e8f0;font-size:12px;outline:none;box-sizing:border-box}',
    '.sbr-addr.sbr-err{border:1px solid #ff5f57}',
    '.sbr-win.sbr-addr-hidden .sbr-addr{display:none}',
    '.sbr-bar-btns{display:flex;gap:4px;flex:0 0 auto}',
    '.sbr-bar-btn{width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:#cfcfe0;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s ease}',
    '.sbr-bar-btn:hover{background:rgba(255,255,255,.14)}',
    '.sbr-bar-btn.sbr-close:hover{background:#ff5f57;color:#fff}',
    '.sbr-body{flex:1 1 auto;position:relative;background:#fff;overflow:hidden}',
    '.sbr-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}',
    '.sbr-overlay{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:10px;background:#fff;color:#333;font-size:14px;text-align:center;padding:20px;box-sizing:border-box}',
    '.sbr-overlay.sbr-show{display:flex}',
    '.sbr-overlay a{color:#1a73e8;cursor:pointer;text-decoration:underline}',
    // 缩放句柄（位于窗口内部边缘，避免被 .sbr-win 的 overflow:hidden 裁剪；
    // z-index:1 低于标题栏的 2，保证标题栏按钮/圆点可点）
    '.sbr-nw,.sbr-n,.sbr-ne,.sbr-e,.sbr-se,.sbr-s,.sbr-sw,.sbr-w{position:absolute;z-index:1}',
    '.sbr-nw{top:0;left:0;width:12px;height:12px;cursor:nwse-resize}.sbr-n{top:0;left:12px;right:12px;height:6px;cursor:ns-resize}.sbr-ne{top:0;right:0;width:12px;height:12px;cursor:nesw-resize}',
    '.sbr-e{top:12px;right:0;bottom:12px;width:6px;cursor:ew-resize}.sbr-se{bottom:0;right:0;width:12px;height:12px;cursor:nwse-resize}.sbr-s{bottom:0;left:12px;right:12px;height:6px;cursor:ns-resize}',
    '.sbr-sw{bottom:0;left:0;width:12px;height:12px;cursor:nesw-resize}.sbr-w{top:12px;left:0;bottom:12px;width:6px;cursor:ew-resize}'
  ].join('\n'))
```

- [ ] **Step 4: 写 `SB.dock`（图标栏 DOM + 点击行为占位）**

```js
  // —— SB.dock：右侧居中图标栏 ——
  SB.dock = (function () {
    var rootEl = null
    var plusBtn = null
    var listEl = null

    function init() {
      rootEl = SB.util.sbEl('div', 'sbr-dock')
      plusBtn = SB.util.sbEl('button', 'sbr-dock-btn', rootEl, '+')
      plusBtn.title = '新建子浏览器'
      plusBtn.addEventListener('click', function () {
        SB.manager.newWindow()
      })
      SB.util.sbEl('div', 'sbr-dock-sep', rootEl)
      listEl = SB.util.sbEl('div', 'sbr-dock-list', rootEl)
      listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:center'
      document.body.appendChild(rootEl)
    }

    function refresh() {
      // 清空重建图标列表
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild)
      var wins = SB.manager.windows()
      wins.forEach(function (win) {
        var ico = SB.util.sbEl('div', 'sbr-dock-ico', listEl, win.label() || '·')
        ico.title = win.url() || '空白'
        if (!win.minimized()) ico.classList.add('sbr-active')
        ico.addEventListener('click', function () {
          SB.manager.toggleWin(win)
        })
      })
    }

    return { init: init, refresh: refresh }
  })()
```

- [ ] **Step 5: 写 `SB.manager` 占位（本任务只保证 init 存在，窗口逻辑 Task 3 实现）**

```js
  // —— SB.manager：窗口生命周期（Task 3 起实现窗口创建）——
  SB.manager = (function () {
    var wins = []
    var dock = SB.dock

    function windows() { return wins.slice() }
    function refresh() { dock.refresh() }

    function init() {
      dock.init()
      refresh()
    }

    // 占位：Task 3 实现
    function newWindow() {}
    function toggleWin(win) {}

    return { init: init, windows: windows, refresh: refresh, newWindow: newWindow, toggleWin: toggleWin }
  })()
```

- [ ] **Step 6: 浏览器验证**

Run: 安装后重启 `dsh web`，F5。Expected: 主聊天界面右侧中部出现竖排图标栏，含 `+` 按钮和分隔线；点 `+` 无报错（暂不弹窗）。非主界面（插件市场页）不出现图标栏。

安装命令（Task 6 之前如需先验证，用 link 安装）：
`dsh plugin --profile web add link:z:\dsh-subrowser`

- [ ] **Step 7: 提交**

```bash
git add assets/subrowser.js
git commit -m "feat: 前端基座与右侧图标栏"
```

---

### Task 3: 窗口创建 — 标题栏 + URL 导航 + iframe + 关闭/最小化

**Files:**
- Modify: `z:\dsh-subrowser\assets\subrowser.js`

**Interfaces:**
- Consumes: Task 2 的 `SB.util`（sbEl/sbCss）、`SB.dock.init/refresh`、`SB.manager` 骨架、CSS 类名
- Produces: `SB.window.create(opts)` 返回窗口对象（含 `el / id / url() / label() / minimized() / destroy() / setMinimized(b) / navigate(url) / focus()`）；`SB.manager.newWindow()` 真正创建窗口；`SB.manager.toggleWin(win)` 切换最小化；`SB.manager.closeWin(win)`。窗口对象字段：`state`（`{ id, url, x, y, w, h, minimized, addrHidden }`，供 Task 5 持久化）。Task 4 依赖 `win.state` 与 `win.el` 做拖拽缩放。

- [ ] **Step 1: 写 `SB.window`（创建窗口 DOM、标题栏、URL 导航、iframe、关闭/最小化）**

```js
  // —— SB.window：单个浏览器窗口 ——
  SB.window = (function () {
    var seq = 0

    function makeId() {
      seq++
      return 'w_' + Date.now().toString(36) + '_' + seq
    }

    function normalizeUrl(input) {
      var s = (input || '').trim()
      if (!s) return ''
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s
      if (/^\/\//.test(s)) return 'https:' + s
      // 不是协议开头：当作域名补 https
      return 'https://' + s
    }

    function labelOf(url) {
      try {
        var u = new URL(url)
        return u.hostname.replace(/^www\./, '')
      } catch (err) { return '' }
    }

    function create(opts) {
      opts = opts || {}
      var state = {
        id: makeId(),
        url: opts.url || '',
        x: opts.x, y: opts.y,
        w: opts.w || 720, h: opts.h || 480,
        minimized: !!opts.minimized,
        addrHidden: !!opts.addrHidden,
      }
      var win = {}

      // —— DOM ——
      var el = SB.util.sbEl('div', 'sbr-win')
      var bar = SB.util.sbEl('div', 'sbr-bar', el)
      var dots = SB.util.sbEl('div', 'sbr-bar-dots', bar)
      ;['sbr-dot-1', 'sbr-dot-2', 'sbr-dot-3'].forEach(function (c) {
        SB.util.sbEl('div', 'sbr-dot ' + c, dots)
      })
      var addr = SB.util.sbEl('input', 'sbr-addr', bar)
      addr.type = 'text'
      addr.placeholder = '输入网址，回车打开'
      addr.value = state.url
      addr.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault()
          var u = normalizeUrl(addr.value)
          if (!u) return
          if (!/^https?:\/\//i.test(u)) { addr.classList.add('sbr-err'); return }
          addr.classList.remove('sbr-err')
          addr.value = u
          win.navigate(u)
        } else if (ev.key === 'Escape') {
          addr.blur()
        }
      })
      var barBtns = SB.util.sbEl('div', 'sbr-bar-btns', bar)
      var btnHide = SB.util.sbEl('button', 'sbr-bar-btn', barBtns, '▁')
      btnHide.title = '折叠地址栏'
      btnHide.addEventListener('click', function () {
        state.addrHidden = !state.addrHidden
        el.classList.toggle('sbr-addr-hidden', state.addrHidden)
        SB.manager.save()
      })
      var btnMin = SB.util.sbEl('button', 'sbr-bar-btn', barBtns, '—')
      btnMin.title = '最小化'
      btnMin.addEventListener('click', function () { win.setMinimized(true) })
      var btnClose = SB.util.sbEl('button', 'sbr-bar-btn sbr-close', barBtns, '✕')
      btnClose.title = '关闭'
      btnClose.addEventListener('click', function () { SB.manager.closeWin(win) })

      var body = SB.util.sbEl('div', 'sbr-body', el)
      var frame = SB.util.sbEl('iframe', 'sbr-frame', body)
      frame.setAttribute('allow', 'clipboard-write; clipboard-read; fullscreen; autoplay')
      var overlay = SB.util.sbEl('div', 'sbr-overlay', body)
      var ovText = SB.util.sbEl('div', '', overlay, '')
      var ovLink = SB.util.sbEl('a', '', overlay, '外部打开')
      ovLink.addEventListener('click', function () {
        if (state.url) window.open(state.url, '_blank', 'noopener')
      })

      // —— 缩放句柄（Task 4 挂拖拽逻辑）——
      ;['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(function (dir) {
        SB.util.sbEl('div', 'sbr-' + dir, el)
      })

      // —— 方法 ——
      function position() {
        el.style.left = state.x + 'px'
        el.style.top = state.y + 'px'
        el.style.width = state.w + 'px'
        el.style.height = state.h + 'px'
      }
      win.el = el
      win.state = state
      win.id = state.id
      win.url = function () { return state.url }
      win.label = function () { return labelOf(state.url) }
      win.minimized = function () { return state.minimized }

      win.navigate = function (u) {
        state.url = u
        frame.src = u
        overlay.classList.remove('sbr-show')
        SB.manager.save()
        SB.manager.refresh()
      }
      win.show = function () {
        state.minimized = false
        el.style.display = ''
        position()
        win.focus()
        SB.manager.save()
        SB.manager.refresh()
      }
      win.setMinimized = function (b) {
        state.minimized = b
        el.style.display = b ? 'none' : ''
        if (!b) win.focus()
        SB.manager.save()
        SB.manager.refresh()
      }
      win.destroy = function () {
        if (el.parentNode) el.parentNode.removeChild(el)
        frame.src = 'about:blank'
      }
      win.focus = function () {
        var all = SB.manager.windows()
        all.forEach(function (w) { w.el.classList.remove('sbr-top') })
        el.classList.add('sbr-top')
      }
      win.focusOnFrame = function () {
        // 点击窗口内容区聚焦并置顶
        win.focus()
      }
      el.addEventListener('mousedown', function () {
        win.focus()
      }, true)

      // iframe 加载失败提示（load 事件仍会触发，用跨域访问检测不可行；
      // 简单策略：onerror + sandbox 时给用户提示入口，最终由用户外部打开兜底）
      frame.addEventListener('error', function () {
        showOverlay('该站点不允许内嵌或加载失败。')
      })
      function showOverlay(msg) {
        ovText.textContent = msg
        overlay.classList.add('sbr-show')
      }
      // 空白窗口提示
      if (!state.url) {
        showOverlay('在上方输入网址，回车加载。')
      }

      position()
      if (state.addrHidden) el.classList.add('sbr-addr-hidden')
      document.body.appendChild(el)
      if (state.minimized) el.style.display = 'none'

      return win
    }

    return { create: create, normalizeUrl: normalizeUrl }
  })()
```

- [ ] **Step 2: 实现 `SB.manager.newWindow / toggleWin / closeWin`**

```js
  // —— SB.manager：窗口生命周期 ——
  SB.manager = (function () {
    var wins = []
    var dock = SB.dock

    function windows() { return wins.slice() }
    function refresh() { dock.refresh() }

    function newWindow(opts) {
      if (wins.length >= SB.MAX_WINDOWS) {
        try { alert('子浏览器窗口数已达上限（' + SB.MAX_WINDOWS + '）') } catch (err) {}
        return null
      }
      var win = SB.window.create(opts || {})
      wins.push(win)
      win.focus()
      refresh()
      SB.manager.save()
      return win
    }

    function toggleWin(win) {
      if (win.minimized()) win.show()
      else win.setMinimized(true)
    }

    function closeWin(win) {
      var i = wins.indexOf(win)
      if (i !== -1) wins.splice(i, 1)
      win.destroy()
      refresh()
      SB.manager.save()
    }

    function init() {
      dock.init()
      refresh()
    }

    // 占位：Task 5 实现
    function save() {}

    return {
      init: init, windows: windows, refresh: refresh,
      newWindow: newWindow, toggleWin: toggleWin, closeWin: closeWin,
      save: save,
    }
  })()
```

- [ ] **Step 3: 语法校验**

Run: `node --check z:\dsh-subrowser\assets\subrowser.js`
Expected: 无输出、exit 0

- [ ] **Step 4: 浏览器验证**

- F5 后点 `+`：出现 720×480 空白窗口，右上角显示地址栏，内容区显示「在上方输入网址，回车加载。」
- 输入 `example.com` 回车：地址栏变 `https://example.com`，iframe 加载出页面；标题栏圆点后无文字，右侧图标栏出现窗口图标且点亮
- 点 `—`：窗口隐藏，图标栏图标熄灭；点图标：窗口恢复并置顶
- 点 `✕`：窗口关闭，图标消失
- 点 `▁`：地址栏折叠；再点恢复

- [ ] **Step 5: 提交**

```bash
git add assets/subrowser.js
git commit -m "feat: 窗口创建与 URL 导航"
```

---

### Task 4: 拖拽与缩放

**Files:**
- Modify: `z:\dsh-subrowser\assets\subrowser.js`

**Interfaces:**
- Consumes: Task 3 的 `win.el / win.state / win.focus()`，CSS 句柄类 `.sbr-bar-dots` 与 `.sbr-{nw,n,ne,e,se,s,sw,w}`
- Produces: 无新导出；在 `SB.window.create` 内为 dots 挂拖动、为 8 个句柄挂缩放；约束逻辑复用 `SB.util.clampWindow(state)`（新加到 SB.util）。Task 5 依赖：拖/缩放结束回调 `SB.manager.save()`。

- [ ] **Step 1: 在 `SB.util` 增加视口约束函数**

```js
    function clampWindow(state) {
      var vw = window.innerWidth
      var vh = window.innerHeight
      var w = Math.max(SB.MIN_W, Math.min(state.w, vw))
      var h = Math.max(SB.MIN_H, Math.min(state.h, vh))
      var x = Math.max(0, Math.min(state.x, vw - w))
      var y = Math.max(0, Math.min(state.y, vh - h))
      state.w = w; state.h = h; state.x = x; state.y = y
      return state
    }
```

`SB.util` 返回对象改为 `{ sbEl: sbEl, sbCss: sbCss, clampWindow: clampWindow }`。

- [ ] **Step 2: 在 `SB.window.create` 中给 `.sbr-bar-dots` 挂拖拽**

```js
      // —— 拖拽：按住标题栏圆点区移动 ——
      var dragStart = null
      dots.addEventListener('pointerdown', function (ev) {
        dragStart = { px: ev.clientX, py: ev.clientY, sx: state.x, sy: state.y }
        dots.setPointerCapture(ev.pointerId)
        dots.classList.add('sbr-dragging')
        win.focus()
        ev.preventDefault()
      })
      dots.addEventListener('pointermove', function (ev) {
        if (!dragStart) return
        var nx = dragStart.sx + (ev.clientX - dragStart.px)
        var ny = dragStart.sy + (ev.clientY - dragStart.py)
        state.x = nx; state.y = ny
        SB.util.clampWindow(state)
        el.style.left = state.x + 'px'
        el.style.top = state.y + 'px'
      })
      function endDrag(ev) {
        if (!dragStart) return
        dragStart = null
        dots.classList.remove('sbr-dragging')
        SB.manager.save()
      }
      dots.addEventListener('pointerup', endDrag)
      dots.addEventListener('pointercancel', endDrag)
```

- [ ] **Step 3: 在 `SB.window.create` 中给 8 个缩放句柄挂缩放**

```js
      // —— 缩放：8 个方向句柄 ——
      var handles = {
        nw: ['x', 'y', 'w', 'h'], n: ['y', 'h'], ne: ['y', 'h', 'w'],
        e: ['w'], se: ['w', 'h'], s: ['h'], sw: ['h', 'w'], w: ['w'],
      }
      el.querySelectorAll('[class^="sbr-"]').forEach(function (h) {
        var dir = h.className.replace('sbr-', '')
        if (!handles[dir]) return
        var rs = null
        h.addEventListener('pointerdown', function (ev) {
          rs = {
            px: ev.clientX, py: ev.clientY,
            x: state.x, y: state.y, w: state.w, h: state.h,
          }
          h.setPointerCapture(ev.pointerId)
          win.focus()
          ev.preventDefault()
          ev.stopPropagation()
        })
        h.addEventListener('pointermove', function (ev) {
          if (!rs) return
          var dx = ev.clientX - rs.px
          var dy = ev.clientY - rs.py
          var nx = rs.x, ny = rs.y, nw = rs.w, nh = rs.h
          if (handles[dir].indexOf('w') !== -1) { nw = rs.w - dx; nx = rs.x + dx }
          if (handles[dir].indexOf('e') !== -1) { nw = rs.w + dx }
          if (handles[dir].indexOf('n') !== -1) { nh = rs.h - dy; ny = rs.y + dy }
          if (handles[dir].indexOf('s') !== -1) { nh = rs.h + dy }
          if (handles[dir].indexOf('w') !== -1 && nw < SB.MIN_W) {
            nw = SB.MIN_W; nx = rs.x + rs.w - SB.MIN_W
          }
          if (handles[dir].indexOf('n') !== -1 && nh < SB.MIN_H) {
            nh = SB.MIN_H; ny = rs.y + rs.h - SB.MIN_H
          }
          state.x = nx; state.y = ny; state.w = nw; state.h = nh
          SB.util.clampWindow(state)
          el.style.left = state.x + 'px'; el.style.top = state.y + 'px'
          el.style.width = state.w + 'px'; el.style.height = state.h + 'px'
        })
        function endResize(ev) {
          if (!rs) return
          rs = null
          SB.manager.save()
        }
        h.addEventListener('pointerup', endResize)
        h.addEventListener('pointercancel', endResize)
      })
```

注意：Task 3 创建的句柄类名是 `sbr-nw` 等，`el.querySelectorAll('[class^="sbr-"]')` 也会匹配 `.sbr-bar`、`.sbr-addr` 等，所以用 `handles[dir]` 过滤——非句柄类不会命中 handles 表即返回。**不要改成 `[class^="sbr-"]` 之外的更广选择器，否则会选中内层 iframe 元素。**

- [ ] **Step 4: 语法校验**

Run: `node --check z:\dsh-subrowser\assets\subrowser.js`
Expected: 无输出、exit 0

- [ ] **Step 5: 浏览器验证**

- 按住窗口标题栏圆点拖动：窗口跟随移动，松开后停住
- 拖出视口边缘：窗口自动收敛回视口内
- 拖 8 个方向句柄（重点右下角）：窗口变宽/变高；缩到小于 240×180 时被钳制
- 拖动或缩放过程中窗口置顶

- [ ] **Step 6: 提交**

```bash
git add assets/subrowser.js
git commit -m "feat: 窗口拖拽与缩放"
```

---

### Task 5: 状态持久化与恢复

**Files:**
- Modify: `z:\dsh-subrowser\assets\subrowser.js`

**Interfaces:**
- Consumes: Task 3 `win.state`、Task 4 `SB.util.clampWindow`、`SB.manager.windows()`
- Produces: `SB.manager.save()`（防抖写 localStorage）、`SB.manager.restore()`（init 时读取重建）、`SB.manager.init()` 改为先 restore 再渲染图标栏。Esc 监听也放本任务（依赖 `setMinimized`）。

- [ ] **Step 1: 实现 `SB.manager.save`（防抖）+ 序列化**

```js
    var saveTimer = null
    function saveNow() {
      try {
        var data = { v: 1, windows: wins.map(function (w) {
          var s = w.state
          return { id: s.id, url: s.url, x: s.x, y: s.y, w: s.w, h: s.h, minimized: s.minimized, addrHidden: s.addrHidden }
        }) }
        localStorage.setItem(SB.STORAGE_KEY, JSON.stringify(data))
      } catch (err) {}
    }
    function save() {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(saveNow, 300)
    }
```

- [ ] **Step 2: 实现 `SB.manager.restore`（读取 + 校验 + 重建）**

```js
    function restore() {
      var list = []
      try {
        var raw = localStorage.getItem(SB.STORAGE_KEY)
        if (raw) {
          var data = JSON.parse(raw)
          if (data && Array.isArray(data.windows)) list = data.windows
        }
      } catch (err) {}
      list.slice(0, SB.MAX_WINDOWS).forEach(function (rec) {
        if (!rec || typeof rec !== 'object') return
        var win = SB.window.create({
          url: typeof rec.url === 'string' ? rec.url : '',
          x: Number(rec.x), y: Number(rec.y),
          w: Number(rec.w), h: Number(rec.h),
          // 设计文档 6.2「刷新后恢复为显示状态（所见即所得）」：不恢复 minimized，
          // 刷新一律显示。minimized 字段仅用于序列化，恢复时强制显示。
          minimized: false,
          addrHidden: !!rec.addrHidden,
        })
        wins.push(win)
      })
    }
```

- [ ] **Step 3: 更新 `init`（restore → dock → Esc 监听）**

```js
    function init() {
      restore()
      dock.init()
      refresh()
      // Esc 一键全部最小化（iframe 聚焦时跨域无法监听，天然不冲突）
      document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape') return
        wins.forEach(function (w) { if (!w.minimized()) w.setMinimized(true) })
      })
    }
```

- [ ] **Step 4: 语法校验**

Run: `node --check z:\dsh-subrowser\assets\subrowser.js`
Expected: 无输出、exit 0

- [ ] **Step 5: 浏览器验证**

- 打开 2 个窗口并导航不同 URL，调整位置大小、折叠一个地址栏，F5 刷新：窗口全部恢复（位置/大小/URL/折叠状态一致，均显示态）
- 最小化某个窗口后刷新：该窗口恢复为显示态（「所见即所得」策略——刷新一律显示）
- 打开第 9 个窗口：alert 提示已达上限
- 按 Esc：全部窗口最小化，图标栏保留；再逐个点击图标恢复

- [ ] **Step 6: 提交**

```bash
git add assets/subrowser.js
git commit -m "feat: localStorage 持久化与 Esc 一键最小化"
```

---

### Task 6: 收尾 — README + 完整验证 + 修正

**Files:**
- Create: `z:\dsh-subrowser\README.md`
- Modify: `z:\dsh-subrowser\assets\subrowser.js`（如验证发现问题）

**Interfaces:**
- Consumes: 全部先前任务产物

- [ ] **Step 1: 写 `README.md`（简洁安装/使用/验证说明）**

```markdown
# dsh-subrowser — DSH 浮动子浏览器

DSH Web 界面主聊天页内的浮动子浏览器：可同时打开多个 iframe 窗口，
拖拽移动、四角/边缘缩放、URL 输入框可折叠、右侧图标栏管理窗口、
Esc 一键全部最小化，窗口状态（位置/大小/URL）保存在浏览器 localStorage，
刷新页面后自动恢复。

## 特性

- 多窗口：同时最多 8 个 iframe 子浏览器
- 拖拽缩放：标题栏圆点拖动，8 方向句柄缩放（最小 240×180，自动约束在视口内）
- 右侧图标栏：`+` 新建；每个窗口一个小图标，点击切换显示/最小化
- Esc 一键全部最小化
- 地址栏可折叠；回车自动补 `https://`
- 受限站点提示「外部打开」兜底（部分站点带 X-Frame-Options/CSP 无法内嵌）
- 状态存 localStorage（key: `dsh-subrowser:v1`），刷新后恢复

## 安装

```powershell
# 在插件目录执行（软链安装，改代码立即生效）
dsh plugin --profile web add link:z:\dsh-subrowser
# 若提示冲突，先卸载再装：
# dsh plugin --profile web remove dsh-subrowser
```

安装后重启 `dsh web`，浏览器 F5 刷新。

> 从 npm/GitHub 安装请先把 README 换成对应发布说明；本仓库为本地开发目录。

## 验证

```powershell
dsh --profile web --dump-config | Select-String -Pattern "subrowser"
curl http://127.0.0.1:3080/dsh-subrowser/widget.js
```

- `--dump-config` 能看到 `dsh-subrowser` 在 bundles 里
- `widget.js` 返回 200 JS
- 浏览器 F5：右侧出现图标栏；`+` 新建窗口可浏览；可拖拽缩放；Esc 全部最小化；刷新后恢复

## 开发

- `assets/subrowser.js` 为前端本体：改后硬刷新（Ctrl+F5）即生效
- `lib/index.js` 为宿主（仅静态路由）：改后需重启 `dsh web`
- 前端只在主聊天界面（有 composer 输入区）初始化，不影响插件市场等页面
```

- [ ] **Step 2: 完整手动验证清单**

- 安装：`dsh plugin --profile web add link:z:\dsh-subrowser`
- `dsh --profile web --dump-config` 输出含 `dsh-subrowser`
- `curl http://127.0.0.1:3080/dsh-subrowser/widget.js` → 200 JS
- F5：右侧图标栏出现；新建/多开/拖拽/缩放/折叠地址栏/最小化/关闭/Esc 全部最小化/刷新恢复 全部符合预期
- 若发现 bug：修改 `assets/subrowser.js` 后硬刷新复查，直至通过

- [ ] **Step 3: 提交**

```bash
git add README.md assets/subrowser.js
git commit -m "docs: 安装使用说明与完整验证"
```

---

## Self-Review

**1. Spec 覆盖核对：**
- 插件骨架（package.json/cordis.patch.yml/lib/index.js）→ Task 1
- 仅主聊天界面自检 → Task 2 Step 1
- 右侧居中图标栏（+ 与窗口图标）→ Task 2 Step 4
- 多窗口上限 8 → Task 3 Step 2（newWindow 校验）
- 拖拽 + 8 向缩放 + 视口约束 → Task 4
- 最小化/关闭（无最大化）→ Task 3（setMinimized/destroy）
- URL 输入框可折叠 → Task 3（btnHide + addrHidden）
- iframe + 自动补 https + 非法标红 → Task 3 Step 1
- 受限站点外部打开兜底 → Task 3 Step 1（overlay + ovLink）
- Esc 一键全部最小化 → Task 5 Step 3
- localStorage 持久化 + 防抖 + 刷新恢复显示 → Task 5
- README + 验证清单 → Task 6
- 无单元测试框架、手动浏览器验证 → Global Constraints + 各任务验证步骤

**2. Placeholder 扫描：** 无 TBD/TODO。Task 2 中 `SB.manager.newWindow/toggleWin` 标注「占位」并明确 Task 3 实现，属跨任务渐进实现（非占位符残留）。

**3. 类型/命名一致性：**
- `SB.manager.save()` 在 Task 3（btnHide 点击）即被调用 → Task 3 Step 2 已返回 `save` 占位，Task 5 实现防抖本体，无断裂
- `SB.dock.refresh()` 在 Task 2 定义并始终一致
- `win.state / win.url() / win.label() / win.minimized() / win.focus() / win.setMinimized() / win.show() / win.destroy()` 全计划一致
- CSS 句柄类 `.sbr-nw` 等与 Task 4 选择器 `[class^="sbr-"]` + handles 过滤一致
