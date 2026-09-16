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
