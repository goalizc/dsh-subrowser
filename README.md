# dsh-subrowser

DSH（DeepSeek Harness）Web 界面内的浮动子浏览器插件。在主聊天页内打开多个可拖拽、可缩放、可最小化的 iframe 浏览器窗口，通过右侧图标栏统一管理，支持内容缩放与状态持久化。

## 特性

- **多窗口浏览**：同时最多 8 个 iframe 子浏览器窗口，独立加载任意 URL
- **拖拽与缩放**：按住标题栏任意空白处拖动窗口，8 个方向句柄调整大小（最小 240×180，自动约束在视口内）
- **右侧图标栏**：`+` 新建窗口；每个窗口一个 favicon 图标，点击切换显示/隐藏；图标栏本身可上下拖动
- **内容缩放**：标题栏提供放大/缩小按钮（0.5x–2x，步进 0.1），实时调整页面显示比例
- **地址栏**：回车导航并自动补全 `https://`；可折叠/展开（折叠时保留标题栏布局）
- **全局显隐**：按 `Esc` 一键隐藏全部窗口（类似 Win+D），再按一次恢复；恢复时保留用户手动隐藏的状态
- **主题一致**：窗口外观与 DSH 深色主题统一
- **状态持久化**：窗口位置、大小、URL、缩放倍率、地址栏折叠状态与图标栏位置保存在浏览器 localStorage，刷新后自动恢复

## 安装

### 从 GitHub 安装

```powershell
dsh plugin --profile web add github:goalizc/dsh-subrowser
```

安装完成后重启 `dsh web`，浏览器刷新（F5）页面。

### 本地开发安装（软链，改动即时生效）

```powershell
# 在插件仓库根目录执行
dsh plugin --profile web add link:.
```

软链安装后，前端脚本改动硬刷新即生效，宿主改动需重启 `dsh web`。

### 卸载

```powershell
dsh plugin --profile web remove dsh-subrowser
```

## 使用说明

插件仅在 DSH 主聊天界面初始化，不影响插件市场等其它页面。

| 操作 | 说明 |
|---|---|
| 点击 `+` | 新建浏览器窗口（默认 400×500，靠右垂直居中） |
| 拖动标题栏空白处 | 移动窗口 |
| 拖动窗口边缘/四角 | 调整大小 |
| 地址栏输入网址回车 | 加载页面（自动补 `https://`） |
| 点击缩放按钮 | 放大/缩小页面内容 |
| 点击 `—` / `✕` | 最小化 / 关闭窗口 |
| 点击右侧图标 | 切换对应窗口显示/隐藏 |
| 拖动图标栏空白处 | 上下调整图标栏位置 |
| 按 `Esc` | 全局隐藏全部窗口；再按一次恢复 |

> 部分网站通过 `X-Frame-Options` / CSP 禁止被 iframe 嵌入，此类站点在窗口内无法显示，属浏览器安全限制。

## 数据与隐私

- 插件不联网、不收集任何数据、不读写 DSH 凭据
- 窗口状态仅存于浏览器 localStorage（键 `dsh-subrowser:v1`），不经过任何服务器

## 验证

```powershell
dsh --profile web --dump-config | Select-String -Pattern "subrowser"
curl http://127.0.0.1:3080/dsh-subrowser/widget.js
```

- `--dump-config` 输出中包含 `dsh-subrowser`
- `widget.js` 返回 `200` 且内容为 JavaScript
- 浏览器刷新后右侧出现图标栏，`+` 新建窗口即可浏览

## 开发

```
├── package.json          # 插件元数据（DSH bundle 声明）
├── cordis.patch.yml      # 挂载声明
├── lib/
│   └── index.js          # 宿主侧：静态路由 /dsh-subrowser/widget.js
├── assets/
│   └── subrowser.js      # 前端本体（全部交互逻辑，单文件）
└── README.md
```

- `assets/subrowser.js` 为前端本体，改动后浏览器硬刷新（Ctrl+F5）生效
- `lib/index.js` 为宿主（仅提供静态资源路由），改动后需重启 `dsh web`

## 许可证

[MIT](LICENSE)
