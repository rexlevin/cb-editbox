# EditBox

基于 CodeMirror 6 构建的轻量桌面文本/代码编辑器，运行于 [Canbox](https://canbox-io.github.io/canbox-pages/) 平台。

[English Documentation](./README.md)

## 简介

EditBox 是一款快速、贴近原生体验的编辑器，专注日常文本与代码编辑：多标签页、可靠的编码与换行符处理、崩溃后未保存内容安全恢复，并支持 30+ 种语言的语法高亮。它作为 Canbox 应用运行，复用 Canbox 运行时环境。

## 界面截图

### 主界面

顶部为多标签栏，中间是 CodeMirror 编辑区，底部状态栏显示光标位置、编码、换行符、文档语言与缩放比例，编码与换行符可直接在状态栏切换。

![主界面：多标签编辑](./public/screenshots/main.png)

### 语法高亮

按文件名自动识别语言并高亮，也可通过「语言」菜单手动切换。

![语法高亮与语言菜单](./public/screenshots/syntax-highlight.png)

### 查找与替换

文档内查找替换，支持区分大小写、全字匹配与正则表达式。

![查找与替换面板](./public/screenshots/find-replace.png)

### 深色主题

支持浅色、深色、跟随系统三种主题，编辑器主题自动联动。

![深色主题](./public/screenshots/theme-dark.png)

### 设置窗口

独立设置窗口，可配置界面、字体，并查看全部快捷键与关于信息。

![设置窗口](./public/screenshots/settings.png)

## 功能特性

- **多标签页编辑** — 可同时打开多个文件，切换标签页不会丢失光标位置、滚动位置和正在编辑的内容；标签支持右键菜单（关闭 / 关闭其他 / 全部关闭）。
- **文件操作** — 新建、打开、保存、另存为，支持拖拽文件到窗口打开。
- **语法高亮** — 支持 JavaScript、TypeScript、Python、Go、Rust、Java、C/C++、C#、HTML、CSS、Vue、JSON、Markdown、SQL、Shell、YAML、Dockerfile、TOML、Properties 等 30+ 种语言，并可手动切换语言。
- **查找与替换** — 文档内查找和替换。
- **编码支持** — 自动探测文件编码（含 BOM 识别），可一键转换编码；当保存会导致字符丢失时弹出二次确认。
- **换行符处理** — 支持 CRLF / LF / CR 统计、混行检测，并可在状态栏手动转换。
- **自动备份与崩溃恢复** — 有改动的文档自动备份；异常退出后下次启动静默恢复未保存内容，无启动弹窗打扰。
- **外部变更监听** — 磁盘上的文件被修改时，未编辑的文档自动重载；有未保存改动时弹出冲突处理提示。
- **安全关闭** — 关闭标签或窗口时如有未保存改动，提供保存 / 不保存 / 取消选择。
- **大文件处理** — 超过 10 MB 的文件以只读降级模式打开，保证响应速度。
- **显示选项** — 可切换自动换行、显示行号，自定义界面与编辑器字体；支持浅色 / 深色 / 跟随系统主题（编辑器主题自动联动）。
- **界面缩放** — Ctrl + 鼠标滚轮或 `Ctrl + =` / `Ctrl + -` / `Ctrl + 0`；缩放比例与窗口大小、位置在重启后自动恢复。
- **国际化** — 支持简体中文和 English。
- **原生菜单** — 文件、编辑、搜索、视图、语言、选项、帮助；独立设置窗口（界面、字体、快捷键、关于）。

## 安装

EditBox 是 Canbox 应用，需要先安装 [Canbox](https://canbox-io.github.io/canbox-pages/) 运行时。

- **从应用仓库安装**：打开 Canbox 管理器的「应用仓库」，在目录中找到 EditBox 并下载，随后在「我的应用」中启动。
- **离线包安装**：在 [GitHub Releases](https://github.com/canbox-io/cb-editbox/releases) 页面下载 canbox zip 安装包，在 Canbox 管理器中使用「导入 ZIP」安装。

## 使用方法

1. 从 Canbox 管理器启动 EditBox。
2. 新建文件（`Ctrl + N`）或打开已有文件（`Ctrl + O`），也可以直接把文件拖入窗口。
3. 在多个标签页间编辑，每个标签各自保留撤销历史、光标与滚动状态。
4. 通过「搜索」菜单使用查找（`Ctrl + F`）和替换（`Ctrl + H`）。
5. 在状态栏查看或切换编码、换行符；通过「语言」菜单切换语法语言。
6. 使用 `Ctrl + ,` 打开设置，可切换主题、缩放、字体，并查看全部快捷键。

### 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + N` | 新建文件 |
| `Ctrl + O` | 打开文件 |
| `Ctrl + S` | 保存 |
| `Ctrl + Shift + S` | 另存为 |
| `Ctrl + W` | 关闭标签 |
| `Ctrl + F` | 查找 |
| `Ctrl + H` | 替换 |
| `Ctrl + Z` / `Ctrl + Y` | 撤销 / 重做 |
| `Ctrl + X` / `Ctrl + C` / `Ctrl + V` | 剪切 / 复制 / 粘贴 |
| `Ctrl + A` | 全选 |
| `Ctrl + =` / `Ctrl + -` / `Ctrl + 0` | 放大 / 缩小 / 重置缩放 |
| `Ctrl + 滚轮` | 缩放界面 |
| `Ctrl + ,` | 设置 |
| `Ctrl + Q` | 退出 |

## 开发

应用通过 `canbox-core` 注入运行于 Canbox 运行时，需将相关工作区项目放在同级目录。

```bash
# 安装依赖
npm install

# 启动 Vite 开发服务器（渲染进程，端口 5181）
npm run dev

# 以 canbox-core 注入方式启动 Electron
npm run start

# 生产构建（渲染进程）
npm run build

# 使用 electron-builder 产出 app.asar
npm run dist
```

### 技术栈

Electron 42 + Vue 3（`<script setup>`）+ Pinia + Vue I18n + Element Plus + Vite，编辑器内核为 CodeMirror 6，编码探测使用 chardet、编码转换使用 iconv-lite。

## Canbox 平台

EditBox 构建于 [Canbox](https://canbox-io.github.io/canbox-pages/) 之上 —— 一个轻量、无服务器的桌面应用运行时。

## 开源许可

Apache License 2.0
