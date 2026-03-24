# NoteFlow

A beautiful desktop note-taking app built with Electron, inspired by Notion, Obsidian, Bear, and Craft.

## Features

- **Block-based editor** — paragraph, headings, todo lists, bullet/numbered lists, quotes, code blocks, images, dividers, callouts
- **Markdown shortcuts** — type `# `, `## `, `- `, `1. `, `[]`, `` ``` ``, `>`, `---` to instantly create blocks
- **Slash commands** — type `/` for a full block-type menu
- **Multiple pages** — create, rename, pin, and delete pages
- **Tag folders** — tag pages and group them into collapsible folders in the sidebar
- **Image uploads** — upload PNG, JPG, GIF, WebP, SVG directly into notes
- **Drag to reorder** — grab the ⠿ handle to drag blocks into a new order
- **Multi-block select** — click and drag across blocks to select, duplicate, or delete them
- **Formatting toolbar** — select text for bold, italic, underline, strikethrough, highlight
- **Dark / light mode**
- **Auto-save** — all notes saved locally to `~/Library/Application Support/NoteFlow/`

## Getting Started

```bash
npm install
npm start
```

## Build

```bash
npx electron-packager . NoteFlow --platform=darwin --arch=arm64 --out=dist --overwrite
```
