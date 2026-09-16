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
    return { sbEl: sbEl, sbCss: sbCss }
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
      refresh()
    }

    // 占位：Task 3 实现
    function newWindow() {}
    function toggleWin(win) {}

    return { init: init, windows: windows, refresh: refresh, newWindow: newWindow, toggleWin: toggleWin }
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
