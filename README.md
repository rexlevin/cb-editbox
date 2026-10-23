# EditBox

A lightweight desktop text and code editor for [Canbox](https://canbox-io.github.io/canbox-pages/), built on CodeMirror 6.

[简体中文文档](./README_zh-CN.md)

## Overview

EditBox is a fast, native-feeling editor focused on everyday text and code editing: multiple tabs, reliable encoding and line-ending handling, crash-safe unsaved-content recovery, and syntax highlighting for 30+ languages. It runs as a Canbox app and shares the Canbox runtime.

## Screenshots

### Main window

Multi-tab bar at the top, the CodeMirror editing area in the center, and a status bar at the bottom showing cursor position, encoding, line endings, document language and zoom level — the encoding and line-ending controls can be switched right from the bar.

![Main window with multiple tabs open](./public/screenshots/main.png)

### Syntax highlighting

Automatic syntax highlighting by file name, plus manual language switching from the **Language** menu.

![Syntax highlighting and the Language menu](./public/screenshots/syntax-highlight.png)

### Find & replace

In-document find and replace with match-case, whole-word and regexp options.

![Find and replace panel](./public/screenshots/find-replace.png)

### Dark theme

Light, dark and follow-system themes, with the editor theme switching automatically.

![Dark theme](./public/screenshots/theme-dark.png)

### Settings

A standalone settings window for appearance, fonts, keyboard shortcuts and about.

![Settings window](./public/screenshots/settings.png)

## Features

- **Multi-tab editing** — open many files at once; switching tabs never loses your cursor position, scroll position or in-progress edits. Tabs support a right-click context menu (close / close others / close all).
- **File operations** — new, open, save and save-as, plus drag-and-drop to open files and a recent-files list (last 10) in the File menu.
- **Syntax highlighting** — 30+ languages including JavaScript, TypeScript, Python, Go, Rust, Java, C/C++, C#, HTML, CSS, Vue, JSON, Markdown, SQL, Shell, YAML, Dockerfile, TOML and properties files, with manual language override.
- **Find and replace** — in-document search and replace.
- **Encoding support** — automatic encoding detection (including BOM), one-click encoding conversion, and a confirmation prompt when saving would lose characters.
- **Line endings** — CRLF / LF / CR statistics with mixed-ending detection and manual conversion from the status bar.
- **Auto-save backup & crash recovery** — dirty documents are backed up automatically; after an abnormal exit, unsaved content is silently restored on the next launch, with no startup prompts.
- **External change watching** — files modified on disk reload automatically when untouched, and prompt for conflict resolution when you have unsaved edits; if a file is deleted externally, you can keep the buffer or close the tab.
- **Safe close** — closing a tab or window with unsaved changes offers Save / Don't Save / Cancel.
- **Large files** — files larger than 10 MB open in a degraded read-only mode to stay responsive.
- **Display options** — word-wrap, line-number, whitespace and line-ending visibility toggles, tab width (2 / 4 / 8) with spaces-to-tabs and tabs-to-spaces conversion, adjustable interface and editor fonts, and light / dark / system themes (the editor theme follows automatically).
- **Interface zoom** — Ctrl + mouse wheel or `Ctrl + =` / `Ctrl + -` / `Ctrl + 0`; the zoom level and window size and position are remembered across restarts.
- **Internationalization** — Simplified Chinese and English.
- **Native menus** — File, Edit, Search, View, Language, Options and Help, with a standalone settings window (appearance, fonts, keyboard shortcuts, about).

## Installation

EditBox is a Canbox app and requires the [Canbox](https://canbox-io.github.io/canbox-pages/) runtime installed.

- **From the app repository**: in Canbox Manager, open **App Repository**, find EditBox in the catalog and click download; then launch it from **My Apps**.
- **Offline package**: download the canbox zip package from the [GitHub Releases](https://github.com/canbox-io/cb-editbox/releases) page, then use **Import ZIP** in Canbox Manager.

## Usage

1. Launch EditBox from Canbox Manager.
2. Create a new file (`Ctrl + N`) or open an existing one (`Ctrl + O`); you can also drag files into the window or reopen one from **File > Recent Files**.
3. Edit across tabs — each tab keeps its own undo history, cursor and scroll state.
4. Use the **Search** menu for find (`Ctrl + F`) and replace (`Ctrl + H`).
5. Check or switch encoding and line endings from the status bar; switch syntax language from the **Language** menu. Toggle whitespace, line endings, word wrap and line numbers from the **View** menu; convert indentation between spaces and tabs from the **Edit** menu.
6. Open settings with `Ctrl + ,` to change theme, zoom, fonts and to review all keyboard shortcuts.

### Keyboard shortcuts

| Shortcut                                   | Action                |
| ------------------------------------------ | --------------------- |
| `Ctrl + N`                               | New file              |
| `Ctrl + O`                               | Open file             |
| `Ctrl + S`                               | Save                  |
| `Ctrl + Shift + S`                       | Save as               |
| `Ctrl + W`                               | Close tab             |
| `Ctrl + F`                               | Find                  |
| `Ctrl + H`                               | Replace               |
| `Ctrl + Z` / `Ctrl + Y`                | Undo / Redo           |
| `Ctrl + X` / `Ctrl + C` / `Ctrl + V` | Cut / Copy / Paste    |
| `Ctrl + A`                               | Select all            |
| `Ctrl + =` / `Ctrl + -` / `Ctrl + 0` | Zoom in / out / reset |
| `Ctrl + /` | Toggle line comment |
| `Alt + A` | Toggle block comment |
| `Alt + ↑` / `Alt + ↓` | Move line up / down |
| `Ctrl + Alt + ↑` / `Ctrl + Alt + ↓` | Add cursor above / below |
| `Ctrl + Shift + K` | Delete line |
| `Ctrl + Wheel`                           | Zoom                  |
| `Ctrl + ,`                               | Settings              |
| `Ctrl + Q`                               | Exit                  |

## Development

The app runs on the Canbox runtime via `canbox-core` injection; clone the workspace projects alongside each other.

```bash
# Install dependencies
npm install

# Start the Vite dev server (renderer, port 5181)
npm run dev

# Launch Electron with the canbox-core injection
npm run start

# Production build (renderer)
npm run build

# Produce app.asar with electron-builder
npm run dist
```

### Tech stack

Electron 42 + Vue 3 (`<script setup>`) + Pinia + Vue I18n + Element Plus + Vite, with CodeMirror 6 as the editor engine, chardet for encoding detection and iconv-lite for encoding conversion.

## Canbox Platform

EditBox is built on [Canbox](https://canbox-io.github.io/canbox-pages/) — a lightweight, serverless desktop app runtime.

## License

Apache License 2.0
