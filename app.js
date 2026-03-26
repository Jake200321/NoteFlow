/* ============================================================
   NoteFlow — Renderer (app.js)
   ============================================================ */

// ── State ──────────────────────────────────────────────────
const S = {
  pages: [],
  currentId: null,
  settings: { theme: 'light' },
  slashBlockId: null,
  slashIdx: 0,
  saveTimer: null,
};

// ── Helpers ────────────────────────────────────────────────
const uid  = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const esc  = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const now  = () => new Date().toISOString();
const fmt  = iso => new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

function schedSave() {
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(persist, 600);
}
async function persist() {
  if (window.electronAPI)
    await window.electronAPI.saveData({ pages: S.pages, settings: S.settings, currentId: S.currentId });
}

// ── Block catalog (for slash menu) ────────────────────────
const BTYPES = [
  { type:'paragraph', label:'Text',         icon:'¶',   desc:'Plain text' },
  { type:'heading1',  label:'Heading 1',    icon:'H1',  desc:'Large heading' },
  { type:'heading2',  label:'Heading 2',    icon:'H2',  desc:'Medium heading' },
  { type:'heading3',  label:'Heading 3',    icon:'H3',  desc:'Small heading' },
  { type:'todo',      label:'To-do',        icon:'☑',   desc:'Checklist item' },
  { type:'bullet',    label:'Bullet list',  icon:'•',   desc:'Unordered list' },
  { type:'numbered',  label:'Numbered list',icon:'1.',  desc:'Ordered list' },
  { type:'quote',     label:'Quote',        icon:'"',   desc:'Block quote or callout' },
  { type:'callout',   label:'Callout',      icon:'💡',  desc:'Highlighted info box' },
  { type:'code',      label:'Code',         icon:'</>',  desc:'Monospace code block' },
  { type:'image',     label:'Image',        icon:'🖼',  desc:'Upload or embed an image' },
  { type:'divider',   label:'Divider',      icon:'—',   desc:'Horizontal rule' },
];

// ── Page helpers ───────────────────────────────────────────
function mkPage(title='') {
  return {
    id: uid(), title, icon: '📄',
    blocks: [mkBlock('paragraph')],
    tags: [], pinned: false,
    createdAt: now(), updatedAt: now(),
  };
}
function mkBlock(type='paragraph', content='') {
  return { id: uid(), type, content, checked: false, imageUrl: '', imageCaption: '' };
}
function getPage(id) { return S.pages.find(p => p.id === id); }
const curPage = () => getPage(S.currentId);

// ── Numbered list helper ───────────────────────────────────
function numOf(blocks, idx) {
  let n = 0;
  for (let i = 0; i <= idx; i++) {
    if (blocks[i].type === 'numbered') n++;
    else n = 0;
  }
  return n;
}

// ── Rendering: sidebar ────────────────────────────────────
function renderSidebar(q='') {
  const ql = q.toLowerCase();
  const pages = q
    ? S.pages.filter(p =>
        p.title.toLowerCase().includes(ql) ||
        p.blocks.some(b => b.content && b.content.toLowerCase().includes(ql)) ||
        p.tags.some(t => t.includes(ql))
      )
    : S.pages;

  const pinned  = pages.filter(p => p.pinned);
  const regular = pages.filter(p => !p.pinned);

  // Pinned section (always flat)
  const pinnedSec = document.getElementById('pinnedSection');
  pinnedSec.style.display = pinned.length ? 'block' : 'none';
  document.getElementById('pinnedList').innerHTML = pinned.map(p => pageItem(p)).join('');

  // Main pages section
  const listEl = document.getElementById('pagesList');
  if (S.settings.sidebarView === 'folders') {
    renderFolders(listEl, regular);
  } else {
    listEl.innerHTML = regular.map(p => pageItem(p)).join('');
  }

  // Update view toggle button states
  document.getElementById('viewFlat')?.classList.toggle('active', S.settings.sidebarView !== 'folders');
  document.getElementById('viewFolders')?.classList.toggle('active', S.settings.sidebarView === 'folders');

  attachPageItemEvents();
}

function pageItem(p, indented=false) {
  const a = p.id === S.currentId ? 'active' : '';
  const i = indented ? 'indented' : '';
  return `
    <div class="page-item ${a} ${i}" data-id="${p.id}" draggable="true">
      <span class="page-item-icon">${p.icon}</span>
      <span class="page-item-title">${esc(p.title||'Untitled')}</span>
      ${p.pinned ? '<span class="page-item-pin">📌</span>' : ''}
    </div>`;
}

// Deterministic color per tag name
const TAG_COLORS = [
  '#7c3aed','#2563eb','#059669','#d97706','#dc2626',
  '#7c3aed','#0891b2','#65a30d','#9333ea','#db2777',
];
function tagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

function renderFolders(container, pages) {
  // Build tag → pages map
  const tagMap = new Map();   // tag → [page, ...]
  const untagged = [];

  pages.forEach(p => {
    if (!p.tags.length) {
      untagged.push(p);
    } else {
      p.tags.forEach(tag => {
        if (!tagMap.has(tag)) tagMap.set(tag, []);
        tagMap.get(tag).push(p);
      });
    }
  });

  const tags = [...tagMap.keys()].sort();
  const collapsed = S.settings.collapsedFolders || [];
  const isCollapsed = tag => collapsed.includes(tag);

  let html = '';

  // Tag folders
  tags.forEach(tag => {
    const tagPages = tagMap.get(tag);
    const col   = isCollapsed(tag);
    const color = tagColor(tag);
    html += `
      <div class="folder ${col ? 'collapsed' : ''}" data-folder="${esc(tag)}">
        <div class="folder-header" data-folder="${esc(tag)}">
          <span class="folder-chevron">▾</span>
          <span class="folder-tag-dot" style="background:${color}"></span>
          <span class="folder-name" style="color:${color}">${esc(tag)}</span>
          <span class="folder-count">${tagPages.length}</span>
        </div>
        <div class="folder-pages">
          ${tagPages.map(p => pageItem(p, true)).join('')}
        </div>
      </div>`;
  });

  // Untagged folder
  if (untagged.length) {
    const col = isCollapsed('__untagged__');
    html += `
      <div class="folder ${col ? 'collapsed' : ''}" data-folder="__untagged__">
        <div class="folder-header" data-folder="__untagged__">
          <span class="folder-chevron">▾</span>
          <span class="folder-tag-dot untagged"></span>
          <span class="folder-name" style="color:var(--text-secondary)">Untagged</span>
          <span class="folder-count">${untagged.length}</span>
        </div>
        <div class="folder-pages">
          ${untagged.map(p => pageItem(p, true)).join('')}
        </div>
      </div>`;
  }

  container.innerHTML = html;

  // Folder collapse/expand
  container.querySelectorAll('.folder-header').forEach(hdr => {
    hdr.addEventListener('click', e => {
      if (e.target.closest('.page-item')) return;
      const tag = hdr.dataset.folder;
      const folder = hdr.closest('.folder');
      const cols = S.settings.collapsedFolders || [];
      if (folder.classList.contains('collapsed')) {
        folder.classList.remove('collapsed');
        S.settings.collapsedFolders = cols.filter(t => t !== tag);
      } else {
        folder.classList.add('collapsed');
        if (!cols.includes(tag)) S.settings.collapsedFolders = [...cols, tag];
      }
      schedSave();
    });

    // Drag-over a folder header → highlight it as drop target
    hdr.addEventListener('dragover', e => {
      e.preventDefault();
      hdr.classList.add('folder-drop-over');
    });
    hdr.addEventListener('dragleave', () => hdr.classList.remove('folder-drop-over'));
    hdr.addEventListener('drop', e => {
      e.preventDefault();
      hdr.classList.remove('folder-drop-over');
      const pageId = e.dataTransfer.getData('pageId');
      const tag    = hdr.dataset.folder;
      if (!pageId || tag === '__untagged__') return;
      const p = getPage(pageId);
      if (p && !p.tags.includes(tag)) {
        p.tags.push(tag);
        touch(p); schedSave();
        renderSidebar(document.getElementById('searchInput').value);
        // Refresh tag chips if this page is open
        if (p.id === S.currentId) renderTags(p);
      }
    });
  });
}

function attachPageItemEvents() {
  document.querySelectorAll('.page-item').forEach(el => {
    el.addEventListener('click',    ()  => openPage(el.dataset.id));
    el.addEventListener('dblclick', e   => { e.stopPropagation(); startRename(el.dataset.id); });
    // Make page items draggable into folders
    el.addEventListener('dragstart', e  => e.dataTransfer.setData('pageId', el.dataset.id));
  });
}

// ── Rendering: editor ─────────────────────────────────────
function openPage(id) {
  S.currentId = id;
  const page = curPage();
  if (!page) return;
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('editor').style.display  = 'flex';
  renderEditor(page);
  renderSidebar(document.getElementById('searchInput').value);
  schedSave();
}

function renderEditor(page) {
  document.getElementById('pageEmojiBtn').textContent = page.icon;
  document.getElementById('pageTitle').innerHTML = esc(page.title);
  document.getElementById('pageDate').textContent = `Last edited ${fmt(page.updatedAt)}`;
  document.getElementById('pinBtn').classList.toggle('active', page.pinned);
  renderTags(page);
  renderBlocks(page);
}

function renderTags(page) {
  const chips = document.getElementById('tagChips');
  chips.innerHTML = page.tags.map(t => `
    <span class="tag-chip">${esc(t)}
      <button class="tag-remove" data-tag="${esc(t)}">×</button>
    </span>`).join('');
  chips.querySelectorAll('.tag-remove').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); removeTag(b.dataset.tag); }));
}

function renderBlocks(page) {
  const c = document.getElementById('blocksContainer');
  c.innerHTML = '';
  page.blocks.forEach((b, i) => c.appendChild(buildBlockEl(b, page, i)));
}

function buildBlockEl(block, page, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'block-wrap';
  wrap.dataset.blockId = block.id;

  // Side actions
  const actions = document.createElement('div');
  actions.className = 'block-actions';
  actions.innerHTML = `
    <button class="block-action-btn drag-handle" title="Drag to reorder">⠿</button>
    <button class="block-action-btn add-btn"     title="Add block below">+</button>`;
  wrap.appendChild(actions);
  actions.querySelector('.add-btn').addEventListener('click', () => insertAfter(page, block.id, 'paragraph', true));

  // Content
  const content = buildContent(block, page, idx);
  wrap.appendChild(content);

  // Drag handle: click → block type picker, drag → reorder
  const handle = actions.querySelector('.drag-handle');
  handle.addEventListener('click', e => showBlkTypeMenu(e, block, page));
  handle.draggable = true;
  handle.addEventListener('dragstart', e => {
    e.dataTransfer.setData('bId', block.id);
    wrap.classList.add('dragging');
  });
  handle.addEventListener('dragend', () => wrap.classList.remove('dragging'));
  wrap.addEventListener('dragover',  e => { e.preventDefault(); wrap.classList.add('drag-over'); });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('drag-over'));
  wrap.addEventListener('drop', e => {
    e.preventDefault();
    wrap.classList.remove('drag-over');
    const from = e.dataTransfer.getData('bId');
    if (from && from !== block.id) moveBlockBefore(page, from, block.id);
  });
  return wrap;
}

function buildContent(block, page, idx) {
  const div = document.createElement('div');
  div.className = `block block-${block.type}`;
  div.dataset.blockId = block.id;

  if (['paragraph','heading1','heading2','heading3','bullet','numbered','quote','code'].includes(block.type)) {
    div.contentEditable = 'true';
    div.spellcheck = block.type !== 'code';
    div.innerHTML = block.content;
    div.dataset.placeholder = placeholder(block.type);
    if (block.type === 'numbered') div.dataset.num = numOf(page.blocks, idx);
    attachTextEvents(div, block, page);

  } else if (block.type === 'todo') {
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'todo-checkbox'; cb.checked = block.checked;
    const tx = document.createElement('div');
    tx.contentEditable = 'true'; tx.className = 'todo-text'; tx.spellcheck = true;
    tx.innerHTML = block.content; tx.dataset.placeholder = 'To-do…';
    tx.classList.toggle('done', block.checked);
    cb.addEventListener('change', () => {
      block.checked = cb.checked;
      tx.classList.toggle('done', block.checked);
      touch(page); schedSave();
    });
    attachTextEvents(tx, block, page);
    div.appendChild(cb); div.appendChild(tx);

  } else if (block.type === 'callout') {
    div.innerHTML = `<span class="callout-icon">💡</span>`;
    const tx = document.createElement('div');
    tx.className = 'callout-text'; tx.contentEditable = 'true'; tx.spellcheck = true;
    tx.innerHTML = block.content; tx.dataset.placeholder = 'Write a callout…';
    tx.addEventListener('input', () => { block.content = tx.innerHTML; touch(page); schedSave(); });
    tx.addEventListener('keydown', e => handleKey(e, tx, block, page));
    tx.addEventListener('mouseup', handleSel); tx.addEventListener('keyup', handleSel);
    div.appendChild(tx);

  } else if (block.type === 'image') {
    if (block.imageUrl) {
      const img = document.createElement('img');
      img.src = block.imageUrl; img.alt = block.imageCaption || '';
      div.appendChild(img);
      const cap = document.createElement('div');
      cap.className = 'image-caption'; cap.contentEditable = 'true';
      cap.dataset.placeholder = 'Add a caption…'; cap.textContent = block.imageCaption;
      cap.addEventListener('input', () => { block.imageCaption = cap.textContent; touch(page); schedSave(); });
      div.appendChild(cap);
      const rb = document.createElement('button');
      rb.className = 'img-replace-btn'; rb.textContent = 'Replace image';
      rb.addEventListener('click', () => doUpload(block, page, div));
      div.appendChild(rb);
      // Right-click context menu
      img.addEventListener('contextmenu', e => showImgCtxMenu(e, block, page));
    } else {
      const area = document.createElement('div');
      area.className = 'image-upload-area';
      area.innerHTML = `<div class="upload-icon">🖼</div>
        <div class="upload-label">Click to upload an image</div>
        <div class="upload-hint">PNG, JPG, GIF, WebP, SVG supported</div>`;
      area.addEventListener('click', () => doUpload(block, page, div));
      area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
      area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
      area.addEventListener('drop', e => {
        e.preventDefault(); area.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = ev => { block.imageUrl = ev.target.result; touch(page); schedSave(); rerenderBlock(block, page); };
          reader.readAsDataURL(file);
        }
      });
      div.appendChild(area);
    }

  } else if (block.type === 'divider') {
    div.innerHTML = '<hr>';
    div.style.padding = '6px 0'; div.style.cursor = 'default';
    div.style.background = 'transparent';
    div.removeAttribute('contenteditable');
  }
  return div;
}

function placeholder(type) {
  return {
    paragraph: "Type '/' for commands…",
    heading1:  'Heading 1',
    heading2:  'Heading 2',
    heading3:  'Heading 3',
    bullet:    'List item…',
    numbered:  'List item…',
    quote:     'Enter a quote…',
    code:      '// Write some code…',
  }[type] || '';
}

function touch(page) { page.updatedAt = now(); }

// ── Undo / Redo ───────────────────────────────────────────
const MAX_HISTORY = 100;
const _hist = {}; // pageId → { undo: [], redo: [] }
let   _textSnapTimer = null;

function _getHist(pageId) {
  if (!_hist[pageId]) _hist[pageId] = { undo: [], redo: [] };
  return _hist[pageId];
}

// Call BEFORE any structural mutation on a page
function pushHistory(page) {
  clearTimeout(_textSnapTimer);
  const h = _getHist(page.id);
  h.undo.push(JSON.stringify(page.blocks));
  if (h.undo.length > MAX_HISTORY) h.undo.shift();
  h.redo = [];
}

// Debounced snapshot for text input (groups rapid keystrokes)
function schedTextSnapshot(page) {
  clearTimeout(_textSnapTimer);
  _textSnapTimer = setTimeout(() => pushHistory(page), 800);
}

function undoPage() {
  const page = S.pages.find(p => p.id === S.currentId);
  if (!page) return;
  const h = _getHist(page.id);
  if (!h.undo.length) return;
  h.redo.push(JSON.stringify(page.blocks));
  page.blocks = JSON.parse(h.undo.pop());
  touch(page); schedSave();
  rerenderBlocks(page);
}

function redoPage() {
  const page = S.pages.find(p => p.id === S.currentId);
  if (!page) return;
  const h = _getHist(page.id);
  if (!h.redo.length) return;
  h.undo.push(JSON.stringify(page.blocks));
  page.blocks = JSON.parse(h.redo.pop());
  touch(page); schedSave();
  rerenderBlocks(page);
}

// ── Text block events ─────────────────────────────────────
function attachTextEvents(el, block, page) {
  el.addEventListener('input', () => {
    block.content = el.innerHTML;
    touch(page); schedSave();
    schedTextSnapshot(page);
    checkSlash(el, block, page);
  });
  el.addEventListener('keydown', e => handleKey(e, el, block, page));
  el.addEventListener('mouseup', handleSel);
  el.addEventListener('keyup',   handleSel);
}

function checkSlash(el, block, page) {
  const text = el.textContent;
  if (text === '/') {
    showSlash(el, block, page, '');
  } else if (text.startsWith('/') && S.slashBlockId === block.id) {
    refreshSlash(text.slice(1), el, block, page);
  } else if (S.slashBlockId) {
    hideSlash();
  }
}

// ── Markdown shortcuts ────────────────────────────────────
// Triggered on Space (or Enter for divider/code)
const MD = [
  { re: /^\*$|^-$/,              type: 'bullet'   },
  { re: /^\d+\.$/,               type: 'numbered' },
  { re: /^#{3}$/,                type: 'heading3' },
  { re: /^#{2}$/,                type: 'heading2' },
  { re: /^#$/,                   type: 'heading1' },
  { re: /^>$/,                   type: 'quote'    },
  { re: /^\[\]$|^\/\[\]$|^\[ ?\]$/, type: 'todo' },
  { re: /^```$/,                 type: 'code'     },
  { re: /^---$|^\*\*\*$/,       type: 'divider'  },
  { re: /^!!$/,                  type: 'callout'  },
];

function checkMdShortcut(e, el, block, page) {
  if (e.key !== ' ' && e.key !== 'Enter') return false;
  const text = el.textContent.trim();
  if (!text) return false;

  for (const { re, type } of MD) {
    if (!re.test(text)) continue;
    // divider/code: allow both Space and Enter; others: Space only
    if (e.key === 'Enter' && type !== 'divider' && type !== 'code') continue;

    e.preventDefault();
    block.content = '';

    if (type === 'divider') {
      block.type = 'divider';
      touch(page); schedSave();
      rerenderBlocks(page);
      insertAfter(page, block.id, 'paragraph', true);
    } else {
      block.type = type;
      if (type === 'todo') block.checked = false;
      touch(page); schedSave();
      rerenderBlocks(page);
      setTimeout(() => focusBlock(block.id), 12);
    }
    return true;
  }
  return false;
}

function handleKey(e, el, block, page) {
  // Slash menu navigation
  if (S.slashBlockId === block.id) {
    if (e.key === 'ArrowDown')  { e.preventDefault(); shiftSlash(1);  return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); shiftSlash(-1); return; }
    if (e.key === 'Enter')      { e.preventDefault(); pickSlash(el, block, page); return; }
    if (e.key === 'Escape')     { hideSlash(); return; }
  }

  // Markdown shortcuts (run before Enter/Space default handling)
  if (checkMdShortcut(e, el, block, page)) return;

  if (e.key === 'Enter' && !e.shiftKey) {
    // Regular Enter = line break within the current block
    e.preventDefault();
    document.execCommand('insertLineBreak');
    return;
  }

  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault();
    // Shift+Enter = new block below
    const nextType = ['heading1','heading2','heading3'].includes(block.type) ? 'paragraph' : block.type;
    if (['todo','bullet','numbered'].includes(block.type) && !el.textContent.trim()) {
      pushHistory(page);
      block.type = 'paragraph'; touch(page); schedSave();
      rerenderBlocks(page); focusBlock(block.id); return;
    }
    insertAfter(page, block.id, nextType, true);

  } else if (e.key === 'Backspace') {
    const sel = window.getSelection();
    const atStart = sel.rangeCount > 0 && sel.getRangeAt(0).startOffset === 0 && sel.getRangeAt(0).collapsed;
    if (atStart && el.textContent && block.type !== 'paragraph') {
      pushHistory(page);
      e.preventDefault();
      block.type = 'paragraph'; touch(page); schedSave();
      rerenderBlocks(page); focusBlock(block.id);
    }

  } else if (e.key === 'Tab' && !e.shiftKey) {
    if (['paragraph','heading1','heading2','heading3'].includes(block.type) && !el.textContent.trim()) {
      pushHistory(page);
      e.preventDefault();
      block.type = 'bullet'; touch(page); schedSave();
      rerenderBlocks(page); focusBlock(block.id);
    } else {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    }
  }

  // ⌘ shortcuts
  if (e.metaKey || e.ctrlKey) {
    if (e.key==='b') { e.preventDefault(); document.execCommand('bold'); }
    if (e.key==='i') { e.preventDefault(); document.execCommand('italic'); }
    if (e.key==='u') { e.preventDefault(); document.execCommand('underline'); }
  }
}

// ── Block operations ──────────────────────────────────────
function insertAfter(page, afterId, type, focus=false) {
  pushHistory(page);
  const idx = page.blocks.findIndex(b => b.id === afterId);
  const nb  = mkBlock(type);
  page.blocks.splice(idx + 1, 0, nb);
  touch(page); schedSave();
  rerenderBlocks(page);
  if (focus) setTimeout(() => focusBlock(nb.id), 12);
  return nb;
}

function moveBlockBefore(page, fromId, toId) {
  const bl = page.blocks;
  const fi = bl.findIndex(b => b.id === fromId);
  const ti = bl.findIndex(b => b.id === toId);
  if (fi < 0 || ti < 0) return;
  pushHistory(page);
  const [blk] = bl.splice(fi, 1);
  bl.splice(ti > fi ? ti - 1 : ti, 0, blk);
  touch(page); schedSave();
  rerenderBlocks(page);
}

function rerenderBlock(block, page) {
  const wrap = document.querySelector(`.block-wrap[data-block-id="${block.id}"]`);
  if (!wrap) return;
  const idx  = page.blocks.findIndex(b => b.id === block.id);
  const old  = wrap.querySelector('.block');
  const newC = buildContent(block, page, idx);
  if (old) wrap.replaceChild(newC, old);
}

function rerenderBlocks(page) { renderBlocks(page); }

function focusBlock(id, atEnd=false) {
  const wrap = document.querySelector(`.block-wrap[data-block-id="${id}"]`);
  if (!wrap) return;
  const el = wrap.querySelector('.todo-text') || wrap.querySelector('.callout-text') || wrap.querySelector('[contenteditable="true"]');
  if (!el) return;
  el.focus();
  const range = document.createRange();
  const sel   = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(!atEnd);
  sel.removeAllRanges(); sel.addRange(range);
}

// ── Image upload ──────────────────────────────────────────
async function doUpload(block, page, div) {
  if (!window.electronAPI) return;
  const url = await window.electronAPI.uploadImage();
  if (!url) return;
  block.imageUrl = url;
  touch(page); schedSave();
  rerenderBlock(block, page);
}

// ── Slash menu ────────────────────────────────────────────
function showSlash(el, block, page, filter) {
  S.slashBlockId = block.id; S.slashIdx = 0;
  const menu  = document.getElementById('slashMenu');
  const items = document.getElementById('slashMenuItems');
  const list  = filter
    ? BTYPES.filter(t => t.label.toLowerCase().includes(filter.toLowerCase()) || t.type.includes(filter))
    : BTYPES;

  items.innerHTML = list.map((t, i) => `
    <div class="slash-item ${i===0?'active':''}" data-type="${t.type}">
      <div class="slash-item-icon">${t.icon}</div>
      <div class="slash-item-info">
        <div class="slash-item-label">${t.label}</div>
        <div class="slash-item-desc">${t.desc}</div>
      </div>
    </div>`).join('');

  items.querySelectorAll('.slash-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
      items.querySelectorAll('.slash-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      S.slashIdx = [...items.querySelectorAll('.slash-item')].indexOf(item);
    });
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      applySlash(item.dataset.type, el, block, page);
    });
  });

  positionMenu(menu, el);
  menu.classList.add('show');
}

function refreshSlash(filter, el, block, page) {
  if (!S.slashBlockId) return;
  showSlash(el, block, page, filter);
}

function hideSlash() {
  S.slashBlockId = null;
  document.getElementById('slashMenu').classList.remove('show');
}

function shiftSlash(dir) {
  const items = [...document.querySelectorAll('.slash-item')];
  if (!items.length) return;
  items[S.slashIdx]?.classList.remove('active');
  S.slashIdx = Math.max(0, Math.min(items.length - 1, S.slashIdx + dir));
  items[S.slashIdx]?.classList.add('active');
  items[S.slashIdx]?.scrollIntoView({ block: 'nearest' });
}

function pickSlash(el, block, page) {
  const item = document.querySelectorAll('.slash-item')[S.slashIdx];
  if (item) applySlash(item.dataset.type, el, block, page);
}

function applySlash(type, el, block, page) {
  hideSlash();
  // Clear "/" from content
  el.textContent = ''; block.content = '';
  if (type === 'divider') {
    block.type = 'divider'; block.content = '';
    touch(page); schedSave();
    rerenderBlocks(page);
    insertAfter(page, block.id, 'paragraph', true);
  } else if (type === 'image') {
    block.type = 'image'; block.content = '';
    touch(page); schedSave();
    rerenderBlocks(page);
    setTimeout(() => doUpload(block, page, document.querySelector(`.block[data-block-id="${block.id}"]`)), 80);
  } else {
    block.type = type;
    if (type === 'todo') block.checked = false;
    touch(page); schedSave();
    rerenderBlocks(page);
    setTimeout(() => focusBlock(block.id), 12);
  }
}

function positionMenu(menu, el) {
  const r = el.getBoundingClientRect();
  let top = r.bottom + 6, left = r.left;
  menu.style.cssText = `top:${top}px;left:${left}px`;
  // Flip up if off-screen
  requestAnimationFrame(() => {
    const mh = menu.offsetHeight;
    if (top + mh > window.innerHeight - 12)
      menu.style.top = `${r.top - mh - 6}px`;
    if (left + 290 > window.innerWidth)
      menu.style.left = `${window.innerWidth - 300}px`;
  });
}

// ── Formatting toolbar ────────────────────────────────────
let selRange = null;

function handleSel() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) { hideToolbar(); return; }
  selRange = sel.getRangeAt(0).cloneRange();
  const r   = sel.getRangeAt(0).getBoundingClientRect();
  const tb  = document.getElementById('formatToolbar');
  tb.classList.add('show');
  const tw = tb.offsetWidth || 320;
  let left = r.left + r.width / 2 - tw / 2;
  let top  = r.top - 48;
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  if (top < 8) top = r.bottom + 8;
  tb.style.cssText = `left:${left}px;top:${top}px`;
}

function hideToolbar() { document.getElementById('formatToolbar').classList.remove('show'); }

function persistBlocks() {
  const p = curPage(); if (!p) return;
  p.blocks.forEach(b => {
    const el = document.querySelector(`.block[data-block-id="${b.id}"]`);
    if (el?.contentEditable === 'true') b.content = el.innerHTML;
    const tx = el?.querySelector?.('.todo-text, .callout-text');
    if (tx) b.content = tx.innerHTML;
  });
  touch(p); schedSave();
}

// ── Tags ──────────────────────────────────────────────────
function addTag(page, raw) {
  const tag = raw.trim().toLowerCase();
  if (tag && !page.tags.includes(tag)) {
    page.tags.push(tag); touch(page); schedSave(); renderTags(page);
  }
}
function removeTag(tag) {
  const p = curPage(); if (!p) return;
  p.tags = p.tags.filter(t => t !== tag);
  touch(p); schedSave(); renderTags(p);
}

// ── Emoji picker ──────────────────────────────────────────
const ALL_EMOJIS = [
  '📄','📝','📋','📌','🗒','🗓','📅','✅','⭐','🔖','💡','🎯','🚀','💻','🎨',
  '📊','📈','🔧','⚙️','🏠','🌟','🌈','🎵','🎮','📚','🔍','💬','✍️','🖊',
  '📐','🗂','📁','🏆','💼','🌱','🔑','🎁','❤️','🌍','⚡','🔥','💎','🎓',
  '🏋','🍎','☕','🎤','🎭','🌺','🧠','🦋','🌙','☀️','🌊','🏔','🎪','🎩',
  '🦊','🐉','🌵','🍀','🎸','🎬','🔮','🗺','⏰','🎲','🌸','🍕','🎂','🧩',
];

function buildEmojiGrid(filter='') {
  const list = filter
    ? ALL_EMOJIS.filter(e => e.includes(filter))
    : ALL_EMOJIS;
  const grid = document.getElementById('emojiGrid');
  grid.innerHTML = list.map(e =>
    `<button class="emoji-btn" data-emoji="${e}">${e}</button>`).join('');
  grid.querySelectorAll('.emoji-btn').forEach(b => {
    b.addEventListener('click', () => {
      const p = curPage(); if (!p) return;
      p.icon = b.dataset.emoji;
      document.getElementById('pageEmojiBtn').textContent = p.icon;
      touch(p); schedSave(); renderSidebar();
      closeEmojiPicker();
    });
  });
}

function openEmojiPicker(anchorEl) {
  buildEmojiGrid();
  const picker = document.getElementById('emojiPicker');
  picker.classList.add('show');
  const r = anchorEl.getBoundingClientRect();
  picker.style.cssText = `top:${r.bottom+8}px;left:${r.left}px`;
}
function closeEmojiPicker() {
  document.getElementById('emojiPicker').classList.remove('show');
  document.getElementById('emojiSearch').value = '';
}

// ── Inline rename in sidebar ──────────────────────────────
function startRename(id) {
  if (S.currentId !== id) openPage(id);
  const titleEl = document.getElementById('pageTitle');
  titleEl.focus();
  document.execCommand('selectAll');
}

// ── Global event wiring ───────────────────────────────────
function wire() {
  wireImgCtxMenu();
  wireBlkTypeMenu();

  // Global undo / redo
  document.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoPage(); }
    if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redoPage(); }
  });

  // New page
  document.getElementById('newPageBtn').addEventListener('click', newPage);
  document.getElementById('welcomeNewBtn').addEventListener('click', newPage);

  function newPage() {
    const p = mkPage('');
    S.pages.unshift(p);
    renderSidebar(); openPage(p.id);
    setTimeout(() => {
      const t = document.getElementById('pageTitle');
      t.focus(); document.execCommand('selectAll');
    }, 60);
    schedSave();
  }

  // View toggle (flat list ↔ folder groups)
  document.getElementById('viewFlat').addEventListener('click', () => {
    S.settings.sidebarView = 'flat';
    schedSave();
    renderSidebar(document.getElementById('searchInput').value);
  });
  document.getElementById('viewFolders').addEventListener('click', () => {
    S.settings.sidebarView = 'folders';
    schedSave();
    renderSidebar(document.getElementById('searchInput').value);
  });

  // Search
  const si = document.getElementById('searchInput');
  const sc = document.getElementById('searchClear');
  si.addEventListener('input', e => {
    renderSidebar(e.target.value);
    sc.classList.toggle('show', !!e.target.value);
  });
  sc.addEventListener('click', () => { si.value=''; renderSidebar(''); sc.classList.remove('show'); });

  // Theme
  document.getElementById('themeBtn').addEventListener('click', () => {
    const t = S.settings.theme === 'dark' ? 'light' : 'dark';
    S.settings.theme = t;
    document.documentElement.dataset.theme = t;
    document.getElementById('themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
    schedSave();
  });

  // Page title
  const titleEl = document.getElementById('pageTitle');
  titleEl.addEventListener('input', () => {
    const p = curPage(); if (!p) return;
    p.title = titleEl.textContent;
    touch(p); renderSidebar(); schedSave();
  });
  titleEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const p = curPage();
    if (p?.blocks?.length) focusBlock(p.blocks[0].id);
  });

  // Pin
  document.getElementById('pinBtn').addEventListener('click', () => {
    const p = curPage(); if (!p) return;
    p.pinned = !p.pinned;
    document.getElementById('pinBtn').classList.toggle('active', p.pinned);
    touch(p); renderSidebar(); schedSave();
  });

  // Delete
  document.getElementById('deleteBtn').addEventListener('click', () => {
    const p = curPage(); if (!p) return;
    if (!confirm(`Delete "${p.title||'Untitled'}"?\nThis cannot be undone.`)) return;
    S.pages = S.pages.filter(pg => pg.id !== p.id);
    if (S.pages.length) { openPage(S.pages[0].id); }
    else {
      S.currentId = null;
      document.getElementById('editor').style.display = 'none';
      document.getElementById('welcome').style.display = 'flex';
    }
    renderSidebar(); schedSave();
  });

  // Emoji picker
  document.getElementById('pageEmojiBtn').addEventListener('click', e => {
    const picker = document.getElementById('emojiPicker');
    picker.classList.contains('show') ? closeEmojiPicker() : openEmojiPicker(e.currentTarget);
  });
  document.getElementById('emojiSearch').addEventListener('input', e => buildEmojiGrid(e.target.value));

  // Add tag
  document.getElementById('addTagBtn').addEventListener('click', e => {
    const popup = document.getElementById('tagPopup');
    const input = document.getElementById('tagPopupInput');
    const r = e.currentTarget.getBoundingClientRect();
    popup.style.cssText = `display:block;top:${r.bottom+4}px;left:${r.left}px`;
    input.value = ''; input.focus();
  });
  document.getElementById('tagPopupInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const p = curPage(); if (p) addTag(p, e.target.value);
      document.getElementById('tagPopup').style.display = 'none';
    }
    if (e.key === 'Escape') document.getElementById('tagPopup').style.display = 'none';
  });

  // Footer add block
  document.getElementById('addFooterBtn').addEventListener('click', () => {
    const p = curPage(); if (!p) return;
    const last = p.blocks[p.blocks.length - 1];
    insertAfter(p, last.id, 'paragraph', true);
  });

  // Format toolbar buttons
  document.getElementById('formatToolbar').querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      const cmd    = btn.dataset.cmd;
      const val    = btn.dataset.val;
      const action = btn.dataset.action;

      if (cmd) {
        document.execCommand(cmd, false, val || null);
        persistBlocks();
      }
      if (action === 'h1' || action === 'h2') {
        const p = curPage(); if (!p) return;
        const focused = document.activeElement;
        const blockEl = focused?.closest?.('[data-block-id]');
        if (blockEl) {
          const b = p.blocks.find(bl => bl.id === blockEl.dataset.blockId);
          if (b) { b.type = action === 'h1' ? 'heading1' : 'heading2'; touch(p); schedSave(); rerenderBlocks(p); focusBlock(b.id); }
        }
      }
      if (action === 'todo') {
        const p = curPage(); if (!p) return;
        const focused = document.activeElement;
        const blockEl = focused?.closest?.('[data-block-id]');
        if (blockEl) {
          const b = p.blocks.find(bl => bl.id === blockEl.dataset.blockId);
          if (b) { b.type = 'todo'; b.checked = false; touch(p); schedSave(); rerenderBlocks(p); focusBlock(b.id); }
        }
      }
      if (action === 'normalize') {
        // Strip all inline formatting from the selection
        document.execCommand('removeFormat', false, null);
        document.execCommand('hiliteColor', false, 'transparent');
        document.execCommand('fontSize', false, '3'); // default size
        document.execCommand('foreColor', false, 'inherit');
        persistBlocks();
      }
    });
  });

  // Highlight swatches
  document.getElementById('formatToolbar').querySelectorAll('.hi-swatch').forEach(swatch => {
    swatch.addEventListener('mousedown', e => {
      e.preventDefault();
      const color = swatch.dataset.color;
      if (color === 'none') {
        document.execCommand('hiliteColor', false, 'transparent');
      } else {
        document.execCommand('hiliteColor', false, color);
      }
      persistBlocks();
    });
  });

  // Sidebar toggle
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('app').classList.add('sidebar-hidden');
  });
  document.getElementById('sidebarReveal').addEventListener('click', () => {
    document.getElementById('app').classList.remove('sidebar-hidden');
  });

  // Close overlays on outside click
  document.addEventListener('mousedown', e => {
    const slash  = document.getElementById('slashMenu');
    const emoji  = document.getElementById('emojiPicker');
    const tagPop = document.getElementById('tagPopup');
    const fmtBar = document.getElementById('formatToolbar');

    if (!slash.contains(e.target))  hideSlash();
    if (!emoji.contains(e.target) && e.target.id !== 'pageEmojiBtn') closeEmojiPicker();
    if (!tagPop.contains(e.target) && e.target.id !== 'addTagBtn')    tagPop.style.display = 'none';
    if (!fmtBar.contains(e.target)) setTimeout(() => {
      const sel = window.getSelection();
      if (!sel?.toString()) hideToolbar();
    }, 80);
  });

  // Keyboard: close slash on Escape globally
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideSlash(); closeEmojiPicker(); hideToolbar(); clearBlockSel(); }
  });
}

// ── Block selection ───────────────────────────────────────
const BS = { active: false, startId: null, endId: null };
let bsDragOriginId = null;  // block under cursor at mousedown

function getWraps() {
  return [...document.querySelectorAll('#blocksContainer .block-wrap')];
}

function getSelRange() {
  const wraps = getWraps();
  const si = wraps.findIndex(w => w.dataset.blockId === BS.startId);
  const ei = wraps.findIndex(w => w.dataset.blockId === BS.endId);
  if (si < 0 || ei < 0) return null;
  return { lo: Math.min(si, ei), hi: Math.max(si, ei), wraps };
}

function applyBlockSel() {
  const r = getSelRange();
  if (!r) return;
  r.wraps.forEach((w, i) => w.classList.toggle('block-selected', i >= r.lo && i <= r.hi));
}

function clearBlockSel() {
  BS.active = false; BS.startId = null; BS.endId = null;
  document.querySelectorAll('.block-wrap.block-selected').forEach(w => w.classList.remove('block-selected'));
  document.getElementById('editor')?.classList.remove('no-select');
  const bar = document.getElementById('blockSelBar');
  if (bar) bar.style.display = 'none';
}

function showSelBar() {
  const r = getSelRange();
  if (!r) return;
  const n = r.hi - r.lo + 1;
  document.getElementById('blockSelCount').textContent = `${n} block${n > 1 ? 's' : ''} selected`;
  document.getElementById('blockSelBar').style.display = 'flex';
}

function deleteSelBlocks() {
  const p = curPage(); if (!p) return;
  const r = getSelRange(); if (!r) return;
  pushHistory(p);
  const ids = new Set(r.wraps.slice(r.lo, r.hi + 1).map(w => w.dataset.blockId));
  const focusTarget = p.blocks[Math.max(0, r.lo - 1)]?.id;
  p.blocks = p.blocks.filter(b => !ids.has(b.id));
  if (!p.blocks.length) p.blocks = [mkBlock('paragraph')];
  touch(p); schedSave();
  clearBlockSel();
  rerenderBlocks(p);
  if (focusTarget && getPage(p.id)) setTimeout(() => focusBlock(focusTarget, true), 12);
}

function duplicateSelBlocks() {
  const p = curPage(); if (!p) return;
  const r = getSelRange(); if (!r) return;
  pushHistory(p);
  const ids = r.wraps.slice(r.lo, r.hi + 1).map(w => w.dataset.blockId);
  const clones = ids
    .map(id => p.blocks.find(b => b.id === id))
    .filter(Boolean)
    .map(b => ({ ...b, id: uid() }));
  const insertAt = p.blocks.findIndex(b => b.id === ids[ids.length - 1]) + 1;
  p.blocks.splice(insertAt, 0, ...clones);
  touch(p); schedSave();
  clearBlockSel();
  rerenderBlocks(p);
}

function wireBlockSel() {
  const container = document.getElementById('blocksContainer');

  // Record which block the mousedown started on
  document.addEventListener('mousedown', e => {
    const wrap = e.target.closest('#blocksContainer .block-wrap');
    // Don't interfere with the drag handle
    if (e.target.closest('.drag-handle')) { bsDragOriginId = null; return; }
    // Clicking on selection bar actions shouldn't clear selection
    if (e.target.closest('#blockSelBar')) return;
    bsDragOriginId = wrap ? wrap.dataset.blockId : null;
    // Clicking outside any block clears selection
    if (!wrap) clearBlockSel();
  });

  // Detect cross-block drag → activate block selection
  document.addEventListener('mousemove', e => {
    if (!e.buttons || !bsDragOriginId) return;
    const wrap = e.target.closest('#blocksContainer .block-wrap');
    if (!wrap) return;
    const hoverId = wrap.dataset.blockId;

    if (!BS.active && hoverId !== bsDragOriginId) {
      // Cross-block drag detected — switch into block selection mode
      BS.active   = true;
      BS.startId  = bsDragOriginId;
      document.getElementById('editor').classList.add('no-select');
      window.getSelection()?.removeAllRanges();
    }

    if (BS.active) {
      BS.endId = hoverId;
      applyBlockSel();
      window.getSelection()?.removeAllRanges();
    }
  });

  // Finalise selection
  document.addEventListener('mouseup', () => {
    bsDragOriginId = null;
    if (BS.active) showSelBar();
  });

  // Keyboard actions on selected blocks
  document.addEventListener('keydown', e => {
    if (!BS.active) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSelBlocks(); }
  });

  // Selection bar buttons
  document.getElementById('blockSelDelete').addEventListener('click', deleteSelBlocks);
  document.getElementById('blockSelDuplicate').addEventListener('click', duplicateSelBlocks);
  document.getElementById('blockSelClear').addEventListener('click', clearBlockSel);
}

// ── Block type picker (drag handle click) ────────────────
const BLOCK_TYPES = [
  { type: 'paragraph', icon: '¶',  label: 'Text' },
  { type: 'heading1',  icon: 'H1', label: 'Heading 1' },
  { type: 'heading2',  icon: 'H2', label: 'Heading 2' },
  { type: 'heading3',  icon: 'H3', label: 'Heading 3' },
  { type: 'todo',      icon: '☑',  label: 'To-do' },
  { type: 'bullet',    icon: '•',  label: 'Bullet list' },
  { type: 'numbered',  icon: '1.', label: 'Numbered list' },
  { type: 'quote',     icon: '"',  label: 'Quote' },
  { type: 'code',      icon: '<>', label: 'Code' },
  { type: 'callout',   icon: '💡', label: 'Callout' },
  { type: 'divider',   icon: '—',  label: 'Divider' },
  { type: 'image',     icon: '🖼', label: 'Image' },
];

let _btBlock = null, _btPage = null;

function showBlkTypeMenu(e, block, page) {
  e.stopPropagation();
  _btBlock = block; _btPage = page;

  const menu = document.getElementById('blkTypeMenu');
  menu.innerHTML = BLOCK_TYPES.map(t => `
    <button class="blk-type-item${block.type === t.type ? ' active' : ''}" data-type="${t.type}">
      <span class="blk-type-icon">${t.icon}</span>${t.label}
    </button>`).join('') +
    `<div class="blk-type-sep"></div>
     <button class="blk-type-item danger" data-type="__delete__">
       <span class="blk-type-icon">🗑</span>Delete block
     </button>`;

  menu.querySelectorAll('.blk-type-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      if (_btBlock && _btPage) {
        pushHistory(_btPage);
        if (type === '__delete__') {
          const idx = _btPage.blocks.findIndex(b => b.id === _btBlock.id);
          if (idx !== -1) { _btPage.blocks.splice(idx, 1); touch(_btPage); schedSave(); rerenderBlocks(_btPage); }
        } else if (type === 'divider') {
          _btBlock.type = 'divider'; _btBlock.content = '';
          touch(_btPage); schedSave(); rerenderBlocks(_btPage);
        } else {
          _btBlock.type = type;
          if (type === 'todo') _btBlock.checked = false;
          touch(_btPage); schedSave(); rerenderBlocks(_btPage);
          if (type !== 'image') focusBlock(_btBlock.id);
        }
      }
      hideBlkTypeMenu();
    });
  });

  menu.classList.add('visible');
  const rect = e.currentTarget.getBoundingClientRect();
  let x = rect.right + 6, y = rect.top;
  if (x + 190 > window.innerWidth)  x = rect.left - 196;
  if (y + 330 > window.innerHeight) y = window.innerHeight - 335;
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
}

function hideBlkTypeMenu() {
  document.getElementById('blkTypeMenu').classList.remove('visible');
  _btBlock = null; _btPage = null;
}

function wireBlkTypeMenu() {
  document.addEventListener('click', e => {
    if (!document.getElementById('blkTypeMenu').contains(e.target)) hideBlkTypeMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideBlkTypeMenu();
  });
}

// ── Image context menu ────────────────────────────────────
let _imgCtxBlock = null;
let _imgCtxPage  = null;

function showImgCtxMenu(e, block, page) {
  e.preventDefault();
  _imgCtxBlock = block;
  _imgCtxPage  = page;

  const menu = document.getElementById('imgCtxMenu');
  menu.classList.add('visible');

  // Position near cursor, nudge inside viewport
  const menuW = 170, menuH = 80;
  let x = e.clientX, y = e.clientY;
  if (x + menuW > window.innerWidth)  x = window.innerWidth  - menuW - 8;
  if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
}

function hideImgCtxMenu() {
  document.getElementById('imgCtxMenu').classList.remove('visible');
  _imgCtxBlock = null;
  _imgCtxPage  = null;
}

function wireImgCtxMenu() {
  // Delete image block entirely
  document.getElementById('imgCtxDelete').addEventListener('click', () => {
    if (!_imgCtxBlock || !_imgCtxPage) return;
    pushHistory(_imgCtxPage);
    const idx = _imgCtxPage.blocks.findIndex(b => b.id === _imgCtxBlock.id);
    if (idx !== -1) {
      _imgCtxPage.blocks.splice(idx, 1);
      touch(_imgCtxPage); schedSave();
      rerenderBlocks(_imgCtxPage);
    }
    hideImgCtxMenu();
  });

  // Replace image (reuse existing upload flow)
  document.getElementById('imgCtxReplace').addEventListener('click', () => {
    if (!_imgCtxBlock || !_imgCtxPage) return;
    const block = _imgCtxBlock, page = _imgCtxPage;
    hideImgCtxMenu();
    doUpload(block, page, document.querySelector(`[data-id="${block.id}"]`));
  });

  // Close on click anywhere else
  document.addEventListener('click', e => {
    if (!document.getElementById('imgCtxMenu').contains(e.target)) hideImgCtxMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideImgCtxMenu();
  });
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  let data = null;
  if (window.electronAPI) data = await window.electronAPI.loadData();

  if (data) {
    S.pages     = data.pages    || [];
    S.settings  = { theme: 'light', sidebarView: 'flat', collapsedFolders: [], ...data.settings };
    S.currentId = data.currentId || null;
  } else {
    S.settings  = { theme: 'light', sidebarView: 'flat', collapsedFolders: [] };
  }

  // Apply theme
  document.documentElement.dataset.theme = S.settings.theme;
  document.getElementById('themeBtn').textContent = S.settings.theme === 'dark' ? '☀️' : '🌙';

  wire();
  wireBlockSel();

  if (!S.pages.length) {
    document.getElementById('welcome').style.display = 'flex';
    document.getElementById('editor').style.display  = 'none';
  } else {
    const id = S.currentId && getPage(S.currentId) ? S.currentId : S.pages[0].id;
    openPage(id);
  }
  renderSidebar();
}

init();
