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
    // 内联 SVG 图标（currentColor 着色，flex 居中精确，替代文字字符）
    var ICON_PATHS = {
      // 加号（dock 新建按钮）
      plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      // chevron：向下 = 地址栏展开（可折叠），向上 = 已折叠（可展开）
      fold: '<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      unfold: '<path d="M18 15l-6-6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      // 最小化：横线
      minimize: '<path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      // 关闭：X
      close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      // 放大 / 缩小：放大镜 + 加/减号
      zoom_in: '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      zoom_out: '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M21 21l-4.35-4.35M8 11h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    }
    function sbIcon(name) {
      var span = document.createElement('span')
      span.className = 'sbr-ico'
      span.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">' + (ICON_PATHS[name] || '') + '</svg>'
      return span
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
    return { sbEl: sbEl, sbCss: sbCss, sbIcon: sbIcon, clampWindow: clampWindow }
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
      var defW = opts.w || 400
      var defH = opts.h || 500
      // 默认位置：靠右侧垂直居中，避开右侧图标栏（图标栏宽约 46 + 12 间距）。
      // x/y 缺失（新建窗口）或非有限数时使用默认，避免 position() 输出
      // 'undefinedpx' 无效定位导致窗口落到视口外。
      var defX = Math.max(0, Math.round(window.innerWidth - defW - 58))
      var defY = Math.max(0, Math.round((window.innerHeight - defH) / 2))
      var state = {
        id: makeId(),
        url: opts.url || '',
        x: isFinite(opts.x) ? opts.x : defX,
        y: isFinite(opts.y) ? opts.y : defY,
        w: defW, h: defH,
        // 内容缩放倍率（1 = 100%），范围 0.5 ~ 2
        zoom: Math.max(0.5, Math.min(2, isFinite(opts.zoom) ? opts.zoom : 1)),
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
      // 内容缩放控制：iframe 内容按 state.zoom 缩放（0.5x ~ 2x）
      var btnZoomOut = SB.util.sbEl('button', 'sbr-bar-btn', barBtns)
      btnZoomOut.appendChild(SB.util.sbIcon('zoom_out'))
      btnZoomOut.title = '缩小内容'
      btnZoomOut.addEventListener('click', function () {
        state.zoom = Math.max(0.5, Math.round((state.zoom - 0.1) * 10) / 10)
        applyZoom()
        SB.manager.save()
      })
      var btnZoomIn = SB.util.sbEl('button', 'sbr-bar-btn', barBtns)
      btnZoomIn.appendChild(SB.util.sbIcon('zoom_in'))
      btnZoomIn.title = '放大内容'
      btnZoomIn.addEventListener('click', function () {
        state.zoom = Math.min(2, Math.round((state.zoom + 0.1) * 10) / 10)
        applyZoom()
        SB.manager.save()
      })
      var btnHide = SB.util.sbEl('button', 'sbr-bar-btn', barBtns)
      var hideIcon = SB.util.sbIcon(state.addrHidden ? 'unfold' : 'fold')
      btnHide.appendChild(hideIcon)
      btnHide.title = state.addrHidden ? '展开地址栏' : '折叠地址栏'
      btnHide.addEventListener('click', function () {
        state.addrHidden = !state.addrHidden
        el.classList.toggle('sbr-addr-hidden', state.addrHidden)
        btnHide.innerHTML = ''
        btnHide.appendChild(SB.util.sbIcon(state.addrHidden ? 'unfold' : 'fold'))
        btnHide.title = state.addrHidden ? '展开地址栏' : '折叠地址栏'
        SB.manager.save()
      })
      var btnMin = SB.util.sbEl('button', 'sbr-bar-btn', barBtns)
      btnMin.appendChild(SB.util.sbIcon('minimize'))
      btnMin.title = '最小化'
      btnMin.addEventListener('click', function () { win.setMinimized(true) })
      var btnClose = SB.util.sbEl('button', 'sbr-bar-btn sbr-close', barBtns)
      btnClose.appendChild(SB.util.sbIcon('close'))
      btnClose.title = '关闭'
      btnClose.addEventListener('click', function () { SB.manager.closeWin(win) })

      var body = SB.util.sbEl('div', 'sbr-body', el)
      var frame = SB.util.sbEl('iframe', 'sbr-frame', body)
      frame.setAttribute('allow', 'clipboard-write; clipboard-read; fullscreen; autoplay')
      var overlay = SB.util.sbEl('div', 'sbr-overlay', body)
      var ovText = SB.util.sbEl('div', '', overlay, '')
      function showOverlay(msg) {
        ovText.textContent = msg
        overlay.classList.add('sbr-show')
      }

      // —— 内容缩放：iframe 布局视口 = 容器 / zoom，再 scale(zoom) 填满容器。
      // 容器 overflow:hidden 裁剪，效果等同浏览器内容缩放（放大文字/图片）。
      function applyZoom() {
        var z = state.zoom
        var cw = body.clientWidth || 1
        var ch = body.clientHeight || 1
        frame.style.width = Math.round(cw / z) + 'px'
        frame.style.height = Math.round(ch / z) + 'px'
        frame.style.transform = 'scale(' + z + ')'
        frame.style.transformOrigin = '0 0'
      }
      // 窗口被拖拽缩放时 body 尺寸变化，自动跟随重算
      var bodyObserver = new ResizeObserver(function () { applyZoom() })
      bodyObserver.observe(body)

      // —— 缩放句柄（Task 4 挂拖拽逻辑）——
      ;['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(function (dir) {
        SB.util.sbEl('div', 'sbr-' + dir, el)
      })

      // —— 拖拽：按住标题栏空白区（非地址栏/按钮）移动窗口 ——
      var dragStart = null
      function isInteractive(target) {
        return !!(target && (target === addr || target.closest('.sbr-bar-btns')))
      }
      bar.addEventListener('pointerdown', function (ev) {
        if (isInteractive(ev.target)) return
        dragStart = { px: ev.clientX, py: ev.clientY, sx: state.x, sy: state.y }
        bar.setPointerCapture(ev.pointerId)
        bar.classList.add('sbr-dragging')
        win.focus()
        ev.preventDefault()
      })
      bar.addEventListener('pointermove', function (ev) {
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
        bar.classList.remove('sbr-dragging')
        SB.manager.save()
      }
      bar.addEventListener('pointerup', endDrag)
      bar.addEventListener('pointercancel', endDrag)

      // —— 缩放：8 个方向句柄 ——
      // handles 表用「边方向」字母：w=左边缘、e=右边缘、n=上边缘、s=下边缘。
      // 与下方分支检查（indexOf('w'/'e'/'n'/'s')）一一对应；此前误用 x/y/w/h 属性
      // 字母导致方向错乱（如 se 只触发左边缘反向缩放、高度不动），此处为修复根因。
      var handles = {
        nw: ['w', 'n'], n: ['n'], ne: ['e', 'n'],
        e: ['e'], se: ['e', 's'], s: ['s'], sw: ['w', 's'], w: ['w'],
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
        try { bodyObserver.disconnect() } catch (err) {}
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

      // iframe 加载失败提示（load 事件仍会触发，用跨域访问检测不可行）
      frame.addEventListener('error', function () {
        showOverlay('该站点不允许内嵌或加载失败。')
      })
      // 空白窗口提示
      if (!state.url) {
        showOverlay('在上方输入网址，回车加载。')
      }

      position()
      if (state.addrHidden) el.classList.add('sbr-addr-hidden')
      document.body.appendChild(el)
      if (state.minimized) el.style.display = 'none'
      applyZoom() // 初始按 state.zoom 缩放内容
      // 空白新窗口：自动聚焦地址栏（必须在挂载到 DOM 之后，否则 focus 是空操作）
      if (!state.url && !state.minimized) addr.focus()

      return win
    }

    return { create: create, normalizeUrl: normalizeUrl }
  })()

  // —— SB.dock：右侧居中图标栏（可上下拖动，窗口图标用网页 favicon）——
  SB.dock = (function () {
    var rootEl = null
    var plusBtn = null
    var listEl = null
    // 默认图标：内联 SVG 浏览器小图标（未加载网页 / 无 favicon 时使用）
    var DEFAULT_ICON = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect x="3" y="6" width="26" height="20" rx="3" fill="none" stroke="%23c9c9d6" stroke-width="2"/>' +
      '<circle cx="8" cy="11.5" r="1.6" fill="%23c9c9d6"/>' +
      '<circle cx="13" cy="11.5" r="1.6" fill="%23c9c9d6"/>' +
      '<circle cx="18" cy="11.5" r="1.6" fill="%23c9c9d6"/>' +
      '<path d="M6 17h20v2H6zM6 21h13v2H6z" fill="%23c9c9d6"/></svg>'
    )

    // 由窗口 URL 取 favicon 地址（https://host/favicon.ico）；无 URL 返回空串
    function faviconUrl(url) {
      try {
        var u = new URL(url)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
        return u.protocol + '//' + u.hostname + '/favicon.ico'
      } catch (err) { return '' }
    }

    function init() {
      rootEl = SB.util.sbEl('div', 'sbr-dock')
      plusBtn = SB.util.sbEl('button', 'sbr-dock-btn', rootEl)
      plusBtn.appendChild(SB.util.sbIcon('plus'))
      plusBtn.title = '新建子浏览器'
      plusBtn.addEventListener('click', function () {
        SB.manager.newWindow()
      })
      SB.util.sbEl('div', 'sbr-dock-sep', rootEl)
      listEl = SB.util.sbEl('div', 'sbr-dock-list', rootEl)
      document.body.appendChild(rootEl)
      // 恢复上次拖动的垂直位置（如有）
      SB.manager.dockY(function (y) {
        if (typeof y === 'number') setTop(y)
      })
      // —— 上下拖动图标栏（按住非按钮/图标区域）——
      var dStart = null
      rootEl.addEventListener('pointerdown', function (ev) {
        if (ev.target.closest('.sbr-dock-btn, .sbr-dock-ico')) return
        dStart = { py: ev.clientY, sy: rootEl.getBoundingClientRect().top }
        rootEl.setPointerCapture(ev.pointerId)
        rootEl.classList.add('sbr-dragging')
        ev.preventDefault()
      })
      rootEl.addEventListener('pointermove', function (ev) {
        if (!dStart) return
        var ny = dStart.sy + (ev.clientY - dStart.py)
        setTop(ny)
      })
      function endDockDrag(ev) {
        if (!dStart) return
        dStart = null
        rootEl.classList.remove('sbr-dragging')
        SB.manager.saveDockY(rootEl.getBoundingClientRect().top)
      }
      rootEl.addEventListener('pointerup', endDockDrag)
      rootEl.addEventListener('pointercancel', endDockDrag)
    }

    // 设置图标栏 top 并约束在视口内（垂直拖拽：不改变宽度，仅改 top）
    function setTop(y) {
      var maxY = Math.max(0, window.innerHeight - rootEl.offsetHeight)
      var top = Math.max(0, Math.min(y, maxY))
      rootEl.style.top = top + 'px'
      rootEl.style.transform = 'none'
    }

    function refresh() {
      // 清空重建图标列表
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild)
      var wins = SB.manager.windows()
      wins.forEach(function (win) {
        var ico = SB.util.sbEl('div', 'sbr-dock-ico', listEl)
        ico.title = win.url() || '空白'
        // favicon 图标（居中显示）；无 URL 或加载失败回退默认图标
        var img = SB.util.sbEl('img', 'sbr-dock-fav', ico)
        var fav = faviconUrl(win.url())
        img.src = fav || DEFAULT_ICON
        if (fav) {
          img.addEventListener('error', function () {
            img.src = DEFAULT_ICON
          })
        }
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
        // —— 右侧图标栏（深色主题，与 DSH 一致；可上下拖动）——
        '.sbr-dock{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:9998;display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 6px;border-radius:10px 0 0 10px;background:rgba(21,21,23,.85);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:-2px 0 8px rgba(0,0,0,.3);user-select:none;-webkit-user-select:none;cursor:grab;touch-action:none;transition:background .15s ease}',
        '.sbr-dock.sbr-dragging{cursor:grabbing}',
        '.sbr-dock-btn{width:34px;height:34px;border:0;border-radius:8px;background:rgba(255,255,255,.12);color:#f9fafb;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s ease;flex:0 0 auto}',
        '.sbr-dock-btn:hover{background:rgba(255,255,255,.22)}',
        '.sbr-dock-sep{width:20px;height:1px;background:rgba(255,255,255,.18);margin:2px 0;flex:0 0 auto}',
        '.sbr-dock-list{display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;flex:1 1 auto}',
        '.sbr-dock-ico{width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.10);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s ease;overflow:hidden;flex:0 0 auto}',
        '.sbr-dock-ico.sbr-active{background:rgba(64,156,255,.45)}',
        '.sbr-dock-ico:hover{background:rgba(255,255,255,.20)}',
        '.sbr-dock-fav{width:22px;height:22px;object-fit:contain;display:block;pointer-events:none;-webkit-user-drag:none}',
        // —— 浏览器窗口（深色主题，与 DSH 一致）——
        '.sbr-win{position:fixed;z-index:9990;min-width:240px;min-height:180px;display:flex;flex-direction:column;border-radius:10px;background:#151517;border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 30px rgba(0,0,0,.5);overflow:hidden;font-family:inherit}',
        '.sbr-win.sbr-top{z-index:9997}',
        '.sbr-bar{flex:0 0 auto;height:38px;display:flex;align-items:center;gap:6px;padding:0 8px;background:rgba(255,255,255,.06);cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none;position:relative;z-index:2}',
        '.sbr-bar.sbr-dragging{cursor:grabbing}',
        '.sbr-bar-dots{display:flex;gap:4px;padding:0 2px;pointer-events:none}',
        '.sbr-dot{width:10px;height:10px;border-radius:50%}',
        '.sbr-dot-1{background:#ff5f57}.sbr-dot-2{background:#febc2e}.sbr-dot-3{background:#28c840}',
        '.sbr-addr{flex:1 1 auto;min-width:60px;height:24px;border:0;border-radius:6px;padding:0 8px;background:rgba(0,0,0,.28);color:#f9fafb;font-size:12px;outline:none;box-sizing:border-box}',
        '.sbr-addr.sbr-err{border:1px solid #ff5f57}',
        // 折叠地址栏：用 visibility 隐藏而非 display:none，保留 flex 占位，
        // 右侧按钮区位置不随之移动（问题：display:none 会让按钮左移）
        '.sbr-win.sbr-addr-hidden .sbr-addr{visibility:hidden}',
        '.sbr-bar-btns{display:flex;gap:4px;flex:0 0 auto;align-items:center}',
        '.sbr-bar-btn{width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:#cfcfe0;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s ease;padding:0}',
        '.sbr-bar-btn:hover{background:rgba(255,255,255,.14)}',
        '.sbr-bar-btn.sbr-close:hover{background:#ff5f57;color:#fff}',
        '.sbr-ico{display:inline-flex;align-items:center;justify-content:center;pointer-events:none}',
        '.sbr-ico svg{display:block;width:14px;height:14px}',
        '.sbr-body{flex:1 1 auto;position:relative;background:#151517;overflow:hidden}',
        '.sbr-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#151517}',
        '.sbr-overlay{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:10px;background:#151517;color:#e8e8f0;font-size:14px;text-align:center;padding:20px;box-sizing:border-box}',
        '.sbr-overlay.sbr-show{display:flex}',
        // 缩放句柄（位于窗口内部边缘，避免被 .sbr-win 的 overflow:hidden 裁剪；
        // z-index:1 低于标题栏的 2，保证标题栏按钮/圆点可点）
        '.sbr-nw,.sbr-n,.sbr-ne,.sbr-e,.sbr-se,.sbr-s,.sbr-sw,.sbr-w{position:absolute;z-index:1}',
        '.sbr-nw{top:0;left:0;width:12px;height:12px;cursor:nwse-resize}.sbr-n{top:0;left:12px;right:12px;height:6px;cursor:ns-resize}.sbr-ne{top:0;right:0;width:12px;height:12px;cursor:nesw-resize}',
        '.sbr-e{top:12px;right:0;bottom:12px;width:6px;cursor:ew-resize}.sbr-se{bottom:0;right:0;width:12px;height:12px;cursor:nwse-resize}.sbr-s{bottom:0;left:12px;right:12px;height:6px;cursor:ns-resize}',
        '.sbr-sw{bottom:0;left:0;width:12px;height:12px;cursor:nesw-resize}.sbr-w{top:12px;left:0;bottom:12px;width:6px;cursor:ew-resize}'
      ].join('\n'))
      restore()          // 先恢复（含 dockY），再初始化图标栏
      dock.init()
      refresh()
      // Esc 全局显隐切换（类似 Win+D）：存在可见窗口 → 全部隐藏；
      // 全部已隐藏 → 全部恢复显示。图标栏保留。
      document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape') return
        var anyVisible = wins.some(function (w) { return !w.minimized() })
        wins.forEach(function (w) {
          if (anyVisible) w.setMinimized(true)
          else w.show()
        })
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
    var dockY = null
    function getDockY(cb) { cb(dockY) }
    function setDockY(v) { dockY = v }
    function saveNow() {
      try {
        var data = { v: 1, dockY: dockY, windows: wins.map(function (w) {
          var s = w.state
          return { id: s.id, url: s.url, x: s.x, y: s.y, w: s.w, h: s.h, zoom: s.zoom, minimized: s.minimized, addrHidden: s.addrHidden }
        }) }
        localStorage.setItem(SB.STORAGE_KEY, JSON.stringify(data))
      } catch (err) {}
    }
    function save() {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(saveNow, 300)
    }
    function saveDockY(y) { dockY = y; saveNow() }

    // —— 恢复：读取 localStorage 重建窗口（容错，最多 SB.MAX_WINDOWS 个）——
    function restore() {
      var list = []
      try {
        var raw = localStorage.getItem(SB.STORAGE_KEY)
        if (raw) {
          var data = JSON.parse(raw)
          if (data && Array.isArray(data.windows)) list = data.windows
          if (data && typeof data.dockY === 'number') dockY = data.dockY
        }
      } catch (err) {}
      list.slice(0, SB.MAX_WINDOWS).forEach(function (rec) {
        if (!rec || typeof rec !== 'object') return
        var win = SB.window.create({
          url: typeof rec.url === 'string' ? rec.url : '',
          x: Number(rec.x), y: Number(rec.y),
          w: Number(rec.w), h: Number(rec.h),
          zoom: Number(rec.zoom),
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
      dockY: getDockY, setDockY: setDockY, saveDockY: saveDockY,
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
