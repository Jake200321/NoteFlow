const { app, BrowserWindow, ipcMain, dialog, Menu, MenuItem, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 860,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
    },
    backgroundColor: '#ffffff',
    show: false,
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Set spell checker to English
    mainWindow.webContents.session.setSpellCheckerLanguages(['en-US', 'en-GB']);
  });

  // Right-click context menu with spell-check suggestions
  mainWindow.webContents.on('context-menu', (event, params) => {
    // Only show spell menu when right-clicking inside editable content
    if (!params.isEditable) return;

    const menu = new Menu();

    // Spelling suggestions at the top
    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length > 0) {
        params.dictionarySuggestions.forEach(suggestion => {
          menu.append(new MenuItem({
            label: suggestion,
            click: () => mainWindow.webContents.replaceMisspelling(suggestion),
          }));
        });
      } else {
        menu.append(new MenuItem({ label: 'No suggestions', enabled: false }));
      }
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Add to Dictionary',
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Standard edit actions
    menu.append(new MenuItem({ role: 'cut',   label: 'Cut' }));
    menu.append(new MenuItem({ role: 'copy',  label: 'Copy' }));
    menu.append(new MenuItem({ role: 'paste', label: 'Paste' }));

    menu.popup({ window: mainWindow });
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('open-external', (_, url) => shell.openExternal(url));

const dataFile = path.join(app.getPath('userData'), 'noteflow-data.json');

ipcMain.handle('load-data', () => {
  try {
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }
  } catch (e) {
    console.error('load-data error:', e);
  }
  return null;
});

ipcMain.handle('save-data', (_, data) => {
  try {
    const dir = path.dirname(dataFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('save-data error:', e);
    return false;
  }
});

ipcMain.handle('upload-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'] }],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const fp = result.filePaths[0];
    const ext = path.extname(fp).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext;
    const buf = fs.readFileSync(fp);
    return `data:image/${mime};base64,${buf.toString('base64')}`;
  }
  return null;
});
