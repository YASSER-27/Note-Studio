const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;
let currentProjectPath = ""; 

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#1e1e1e',
    // تصحيح المسار ليعمل في التطوير وبعد البناء
    icon: path.join(__dirname, app.isPackaged ? '../assets/icon.png' : 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false
  });

  // التحكم في تحميل الواجهة: من السيرفر أو من ملفات dist المبنيه
  if (app.isPackaged) {
    // في نسخة الـ exe، غالباً يكون المسار هكذا (بدون ..)
    // لأن Vite يضع الملفات في مجلد dist بجانب الـ main.js
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html')).catch((err) => {
       // حل بديل إذا فشل التحميل الأول (حسب إعدادات الـ builder لديك)
       mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
       console.error("Failed to load path:", err);
    });
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  setupAppMenu();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // فتح المجلد من المعاملات (Arguments)
    const args = process.argv;
    if (args.length > 1) {
      const folderPath = args[args.length - 1];
      if (folderPath && folderPath.length > 3 && !folderPath.endsWith('.exe')) {
        handleOpenFolderFromArgs(folderPath);
      }
    }
  });
}

function setupAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { 
          label: 'New File', 
          accelerator: 'Alt+C', 
          click: () => mainWindow.webContents.send('new-file-trigger') 
        },
        { label: 'New Tab', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('new-blank-tab') },
        { label: 'Open Folder', accelerator: 'CmdOrCtrl+O', click: () => handleOpenFolder() },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('save-trigger') },
        { label: 'Save As', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow.webContents.send('save-as-trigger') },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => mainWindow.webContents.send('close-tab') },
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Select All', role: 'selectAll' },
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: () => mainWindow.webContents.send('next-tab') },
        { label: 'Prev Tab', accelerator: 'Ctrl+Shift+Tab', click: () => mainWindow.webContents.send('prev-tab') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// --- وظائف المجلدات والملفات ---

async function fetchDirectory(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let results = [];
    for (const entry of entries) {
      if (['node_modules', '.git', 'dist', '.DS_Store'].includes(entry.name)) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push({
          name: entry.name,
          path: fullPath,
          isDirectory: true,
          children: await fetchDirectory(fullPath)
        });
      } else {
        results.push({ name: entry.name, path: fullPath, isDirectory: false });
      }
    }
    return results.sort((a, b) => b.isDirectory - a.isDirectory);
  } catch (err) { return []; }
}

async function refreshFileTree() {
  if (currentProjectPath) {
    const files = await fetchDirectory(currentProjectPath);
    mainWindow.webContents.send('folder-opened', { path: currentProjectPath, files });
  }
}

async function handleOpenFolderFromArgs(folderPath) {
  if (mainWindow) {
    currentProjectPath = folderPath;
    const files = await fetchDirectory(folderPath);
    mainWindow.webContents.send('folder-opened', { path: folderPath, files });
  }
}

async function handleOpenFolder() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (canceled) return;
  currentProjectPath = filePaths[0];
  const files = await fetchDirectory(filePaths[0]);
  mainWindow.webContents.send('folder-opened', { path: filePaths[0], files });
}

// --- IPC Handlers ---

ipcMain.handle('open-folder-at-path', async (e, dirPath) => {
  try {
    const files = await fetchDirectory(dirPath);
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 2. معالج فتح مجلد جديد (عبر الحوار)
ipcMain.handle('open-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  
  if (canceled) return null;
  
  currentProjectPath = filePaths[0];
  const files = await fetchDirectory(currentProjectPath);
  return { path: currentProjectPath, files };
});

// 3. قراءة ملف
ipcMain.handle('read-file', async (e, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (err) { 
    return { success: false, error: err.message }; 
  }
});

ipcMain.handle('delete-item', async (e, itemPath) => {
  try {
    const fsSync = require('fs');
    if (fsSync.existsSync(itemPath)) {
      fsSync.rmSync(itemPath, { recursive: true, force: true });
      await refreshFileTree(); // تحديث القائمة فوراً
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('save-file', async (e, { filePath, content }) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) { return { success: false }; }
});

ipcMain.handle('save-file-as', async (event, content) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save File',
    defaultPath: path.join(app.getPath('documents'), 'Untitled.txt')
  });
  if (canceled || !filePath) return { success: false };
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true, path: filePath, name: path.basename(filePath) };
  } catch (err) { return { success: false }; }
});

// --- Window Controls ---
ipcMain.on('minimize-window', () => mainWindow.minimize());
ipcMain.on('maximize-window', () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('close-window', () => mainWindow.close());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });