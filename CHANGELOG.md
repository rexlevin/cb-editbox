# Changelog

本文件记录项目的所有版本变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [0.0.6] - 2026-10-29

### feat | 新功能 / Features

新增编辑器缩略图（minimap），默认关闭，可通过「视图 > 显示缩略图」开关启用
缩略图随语言加载自动对齐代码着色，宽度收窄为 60px，并在打开时自动避让查找面板

Add an editor minimap (off by default, toggled via View > Show Minimap)
Minimap picks up syntax colors once the language loads, uses a 60px width and avoids overlapping the search panel

### fix | 问题修复 / Bug Fixes

文件监听在系统句柄耗尽（EMFILE）时自动降级为轮询，避免会话恢复因监听失败而中断

Fall back to polling when the file watcher hits the handle limit (EMFILE), so session restore no longer breaks

## [0.0.5] - 2026-10-23

### feat | 新功能 / Features

新增「文件 > 最近打开」菜单，最多保留 10 条记录，支持清除
新增 Tab 宽度设置（2 / 4 / 8）与空格 ↔ Tab 缩进转换命令
新增空白符与换行符显示开关
新增外部删除检测：文件在磁盘上被删除时提示保留缓冲区或关闭标签页
新增状态栏编码手动切换（UTF-8 / UTF-8 BOM / UTF-16 / GB18030 / Big5 等），切换后按新编码重写文件
设置界面快捷键条目补齐编辑器内置键位（行/块注释、移动行、多光标、删除行）
新增 Dockerfile、Properties files、TOML 语法高亮

Add a Recent Files submenu (up to 10 entries) with a clear action
Add a tab width setting (2 / 4 / 8) and spaces/tabs indentation conversion commands
Add whitespace and line-ending visibility toggles
Detect external deletion and offer to keep the buffer or close the tab
Add manual encoding switching from the status bar (UTF-8 / UTF-8 BOM / UTF-16 / GB18030 / Big5, etc.), rewriting the file in the new encoding
Register built-in editor keybindings in the Settings shortcuts list (line/block comment, move line, multi-cursor, delete line)
Add syntax highlighting for Dockerfile, Properties files and TOML

### chore | 维护 / Maintenance

版本号更新至 0.0.5

Bump version to 0.0.5

## [0.0.4] - 2026-10-20

### feat | 新功能 / Features

新增 Alt+Z 快捷键，用于切换自动换行开关
语言菜单按首字母分组展示
新增"切换自动换行"快捷键条目并在设置界面展示

Add the Alt+Z shortcut to toggle word wrap
Group the Language menu entries by first letter
Register the "Toggle Word Wrap" entry in the Settings shortcuts list

### build | 构建 / Build

更新 .canbox-app 配置，新增 category 字段为 utility

Update the .canbox-app config with a new category field set to utility

## [0.0.3] - 2026-09-29

### feat | 新功能 / Features

重构查找/替换面板：改为浮动停靠于编辑器右上角，不再挤压编辑区
查找/替换面板按钮全面图标化，补充悬浮提示并支持中英文
新增状态栏界面缩放比例实时显示，缩放变化即时跟随（含设置窗口滑杆、菜单与 Ctrl+滚轮）
状态栏新增当前文档语言显示，按文件名自动识别并与手动切换语言联动

Refactor the find/replace panel into a floating panel pinned to the editor's top-right, no longer squeezing the editing area
Iconify the find/replace panel buttons with hover tooltips and Chinese/English support
Show the interface zoom level live in the status bar, updating on every zoom change (Settings slider, menu and Ctrl+wheel)
Show the current document language in the status bar, auto-detected from the file name and synced with manual language switching

### style | 样式 / Styling

调整查找面板的尺寸与布局，优化显示效果

Adjust the find panel size and layout for a better appearance

### docs | 文档 / Documentation

更新中英文 README，新增界面截图章节并说明截图存放目录

Update the English and Chinese READMEs with a screenshots section and the screenshot directory

## [0.0.2] - 2026-09-29

### feat | 新功能 / Features

新增关闭设置窗口功能，支持按 Esc 快捷键关闭
新增标签页移动功能，支持 Ctrl+Shift+PageUp / Ctrl+Shift+PageDown 前移或后移当前标签页
设置界面新增"设置界面字号"调节项，原生应用菜单支持中英文国际化
字体下拉改用虚拟滚动列表，消除切换"字体"菜单时的卡顿

Add close-settings-window via the Esc shortcut
Add tab reordering with Ctrl+Shift+PageUp / Ctrl+Shift+PageDown to move the active tab
Add a "settings font size" option and internationalized native menu labels
Switch the font dropdown to a virtualized list, eliminating the lag when switching to the Fonts pane

### fix | 问题修复 / Bug Fixes

修复设置窗口会显示原生应用菜单的问题

Fix the settings window showing the native application menu

### style | 样式 / Styling

修正原生菜单文案的助记符显示格式

Fix mnemonic display format in native menu labels

## [0.0.1] - 2026-09-26

首个版本发布，基于 CodeMirror 6 的轻量桌面文本编辑器

First release, a lightweight desktop text editor based on CodeMirror 6

多标签页编辑，标签页状态保活（切换不丢失光标、滚动与编辑内容），支持标签右键菜单（关闭 / 关闭其他 / 全部关闭）

Multi-tab editing with state kept alive across switches (cursor, scroll and content preserved), plus a tab context menu (close / close others / close all)

文件新建、打开、保存、另存为，支持文件拖拽打开

Create, open, save and save-as files, with drag-and-drop file opening

支持 JavaScript、TypeScript、Python、Go、Rust、Java、C/C++、C#、HTML、CSS、Vue、JSON、Markdown、SQL、Shell、YAML 等 30+ 种语言语法高亮，并可手动切换语言

Syntax highlighting for 30+ languages including JavaScript, TypeScript, Python, Go, Rust, Java, C/C++, C#, HTML, CSS, Vue, JSON, Markdown, SQL, Shell and YAML, with manual language override

文档内查找与替换

In-document find and replace

自动探测文件编码（含 BOM 识别），支持编码转换与有损保存二次确认

Automatic encoding detection with BOM recognition, encoding conversion and lossy-save confirmation

支持 CRLF / LF / CR 换行符统计、混行提示与状态栏手动转换

CRLF / LF / CR line ending statistics, mixed-ending detection and manual conversion from the status bar

脏文档自动去抖备份，异常退出后下次启动静默恢复未保存内容

Debounced auto-backup of dirty documents with silent recovery of unsaved content after an abnormal exit

外部文件变更监听：未编辑文档自动重载，有未保存改动时弹出冲突处理提示

External file change watching: untouched documents reload automatically, documents with unsaved edits prompt for conflict resolution

关闭标签/窗口时拦截未保存文档，提供保存 / 不保存 / 取消选择

Intercept closing tabs or windows with unsaved changes, offering save / don't-save / cancel choices

超过 10 MB 的大文件以只读降级模式打开

Open files larger than 10 MB in a degraded read-only mode

自动换行、显示行号开关，界面与编辑器字体可调，浅色 / 深色 / 跟随系统主题（编辑器主题联动）

Word-wrap and line-number toggles, adjustable interface and editor fonts, and light / dark / system themes with the editor theme synced

界面缩放（Ctrl + 滚轮 / Ctrl+= / Ctrl+- / Ctrl+0）并持久化，窗口大小与位置记忆恢复

Interface zoom (Ctrl + wheel / Ctrl+= / Ctrl+- / Ctrl+0) with persistence, and window size and position memory and restoration

中英文国际化，原生应用菜单（文件、编辑、搜索、视图、语言、选项、帮助）与独立设置窗口（界面、字体、快捷键、关于）

Chinese/English internationalization, native application menus (File, Edit, Search, View, Language, Options, Help) and a standalone settings window (appearance, fonts, keyboard shortcuts, about)
