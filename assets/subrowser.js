(function () {
  if (window.__dshSubrowser) return
  window.__dshSubrowser = true

  var SB = window.SB = {}
  SB.v = '0.1.0'
  SB.STORAGE_KEY = 'dsh-subrowser:v1'
  SB.MAX_WINDOWS = 8
  SB.MIN_W = 240
  SB.MIN_H = 180

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
    return { sbEl: sbEl, sbCss: sbCss, clampWindow: clampWindow }
  })()

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
      // 空白新窗口：自动聚焦地址栏（必须在挂载到 DOM 之后，否则 focus 是空操作）
      if (!state.url && !state.minimized) addr.focus()

      return win
    }

    return { create: create, normalizeUrl: normalizeUrl }
  })()

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

  // —— SB.manager：窗口生命周期（Task 3 起实现窗口创建）——
  SB.manager = (function () {
    var wins = []
    var dock = SB.dock
    var saveTimer = null

    function windows() { return wins.slice() }
    function refresh() { dock.refresh() }

    function init() {
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
      dock.init()
      restore()
      refresh()
      // Esc 一键全部最小化（iframe 聚焦时跨域无法监听，天然不冲突）
      document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape') return
        wins.forEach(function (w) { if (!w.minimized()) w.setMinimized(true) })
      })
    }

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

    // —— 持久化：防抖 300ms 写 localStorage ——
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

    // —— 恢复：读取 localStorage 重建窗口（容错，最多 SB.MAX_WINDOWS 个）——
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
          minimized: false, // 设计文档 6.2：刷新一律显示
          addrHidden: !!rec.addrHidden,
        })
        wins.push(win)
      })
    }

    return {
      init: init, windows: windows, refresh: refresh,
      newWindow: newWindow, toggleWin: toggleWin, closeWin: closeWin,
      save: save, restore: restore,
    }
  })()

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
