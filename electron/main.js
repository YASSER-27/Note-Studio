const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { exec } = require('child_process');
const os = require('os');
const archiver = require('archiver'); // npm install archiver

let mainWindow;
let currentProjectPath = "";
let clipboard = { type: null, path: null };
let autoSaveInterval = null;
let autoSaveEnabled = true;
let backupFolder = path.join(app.getPath('userData'), 'backups');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#1e1e1e',
    icon: path.join(__dirname, app.isPackaged ? '../assets/icon.png' : 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html')).catch((err) => {
       mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
       console.error("Failed to load path:", err);
    });
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  setupAppMenu();
  initAutoSave();
  ensureBackupFolder();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    const args = process.argv;
    if (args.length > 1) {
      const folderPath = args[args.length - 1];
      if (folderPath && folderPath.length > 3 && !folderPath.endsWith('.exe')) {
        handleOpenFolderFromArgs(folderPath);
      }
    }
  });

  mainWindow.on('close', () => {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
  });
}

async function ensureBackupFolder() {
  try {
    if (!fsSync.existsSync(backupFolder)) {
      await fs.mkdir(backupFolder, { recursive: true });
    }
  } catch (err) {
    console.error('Error creating backup folder:', err);
  }
}

function initAutoSave() {
  if (autoSaveEnabled) {
    autoSaveInterval = setInterval(async () => {
      if (currentProjectPath) {
        await createBackup(currentProjectPath);
      }
    }, 5 * 60 * 1000); // كل 5 دقائق
  }
}

async function createBackup(projectPath) {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const projectName = path.basename(projectPath);
    const backupName = `${projectName}_${timestamp}`;
    const backupPath = path.join(backupFolder, backupName);
    
    await fs.cp(projectPath, backupPath, { recursive: true });
    console.log('Backup created:', backupPath);
    
    // حذف النسخ الاحتياطية القديمة (أكثر من 10)
    await cleanOldBackups();
  } catch (err) {
    console.error('Backup error:', err);
  }
}

async function cleanOldBackups() {
  try {
    const backups = await fs.readdir(backupFolder);
    if (backups.length > 10) {
      backups.sort().slice(0, backups.length - 10).forEach(async (backup) => {
        await fs.rm(path.join(backupFolder, backup), { recursive: true, force: true });
      });
    }
  } catch (err) {
    console.error('Error cleaning backups:', err);
  }
}

function setupAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+Shift+N', click: () => mainWindow.webContents.send('new-project-trigger') },
        { label: 'New File', accelerator: 'Alt+A', click: () => mainWindow.webContents.send('new-file-trigger') },
        { label: 'New Tab', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('new-blank-tab') },
        { label: 'Open Folder', accelerator: 'CmdOrCtrl+O', click: () => handleOpenFolder() },
        { label: 'Load Project', accelerator: 'CmdOrCtrl+L', click: () => handleLoadProject() },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('save-trigger') },
        { label: 'Save As', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow.webContents.send('save-as-trigger') },
        { type: 'separator' },
        { label: 'Export as ZIP', accelerator: 'CmdOrCtrl+E', click: () => handleExportProject() },
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
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: () => mainWindow.webContents.send('copy-file-trigger') },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', click: () => mainWindow.webContents.send('paste-file-trigger') },
        { label: 'Delete', accelerator: 'Delete', click: () => mainWindow.webContents.send('delete-file-trigger') },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll' },
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: () => mainWindow.webContents.send('next-tab') },
        { label: 'Prev Tab', accelerator: 'Ctrl+Shift+Tab', click: () => mainWindow.webContents.send('prev-tab') },
        { type: 'separator' },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => mainWindow.webContents.send('toggle-sidebar') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Terminal',
      submenu: [
        { label: 'Open Terminal Here', accelerator: 'Alt+R', click: () => ipcMain.emit('open-terminal-trigger') }
      ]
    },
    {
      label: 'Recovery',
      submenu: [
        { label: 'Auto-Save Settings', click: () => toggleAutoSave() },
        { label: 'Restore Backup', click: () => handleRestoreBackup() },
        { type: 'separator' },
        { label: 'View All Backups', click: () => shell.openPath(backupFolder) }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function toggleAutoSave() {
  autoSaveEnabled = !autoSaveEnabled;
  if (autoSaveEnabled) {
    initAutoSave();
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Auto-Save',
      message: 'Auto-Save is now ENABLED (every 5 minutes)'
    });
  } else {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Auto-Save',
      message: 'Auto-Save is now DISABLED'
    });
  }
}

async function handleRestoreBackup() {
  try {
    const backups = await fs.readdir(backupFolder);
    if (backups.length === 0) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        message: 'No backups found'
      });
      return;
    }

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: backups.slice(-5).reverse(), // آخر 5 نسخ
      title: 'Restore Backup',
      message: 'Select a backup to restore:'
    });

    const selectedBackup = backups.slice(-5).reverse()[response];
    const backupPath = path.join(backupFolder, selectedBackup);
    
    currentProjectPath = backupPath;
    const files = await fetchDirectory(backupPath);
    mainWindow.webContents.send('folder-opened', { path: backupPath, files });
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: 'Backup restored successfully!'
    });
  } catch (err) {
    dialog.showErrorBox('Error', 'Failed to restore backup: ' + err.message);
  }
}

async function handleExportProject() {
  if (!currentProjectPath) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      message: 'No project is currently open!'
    });
    return;
  }

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Project as ZIP',
    defaultPath: path.join(app.getPath('desktop'), path.basename(currentProjectPath) + '.zip'),
    filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
  });

  if (!filePath) return;

  try {
    const output = fsSync.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        message: `Project exported successfully!\nSize: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`
      });
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(output);
    archive.directory(currentProjectPath, false);
    await archive.finalize();
  } catch (err) {
    dialog.showErrorBox('Export Error', err.message);
  }
}

async function handleLoadProject() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
  });

  if (canceled) return;

  const zipPath = filePaths[0];
  const extractPath = path.join(app.getPath('temp'), 'note-studio-extract');

  try {
    // حذف المجلد المؤقت إن وُجد
    if (fsSync.existsSync(extractPath)) {
      fsSync.rmSync(extractPath, { recursive: true, force: true });
    }
    await fs.mkdir(extractPath, { recursive: true });

    // استخراج الملف (يحتاج مكتبة extract-zip)
    const extract = require('extract-zip');
    await extract(zipPath, { dir: extractPath });

    currentProjectPath = extractPath;
    const files = await fetchDirectory(extractPath);
    mainWindow.webContents.send('folder-opened', { path: extractPath, files });

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: 'Project loaded successfully!'
    });
  } catch (err) {
    dialog.showErrorBox('Load Error', err.message);
  }
}

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

ipcMain.handle('open-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  
  if (canceled) return null;
  
  currentProjectPath = filePaths[0];
  const files = await fetchDirectory(currentProjectPath);
  return { path: currentProjectPath, files };
});

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
    if (fsSync.existsSync(itemPath)) {
      fsSync.rmSync(itemPath, { recursive: true, force: true });
      await refreshFileTree();
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

ipcMain.handle('copy-file', async (e, itemPath) => {
  clipboard = { type: 'copy', path: itemPath };
  return { success: true };
});

ipcMain.handle('cut-file', async (e, itemPath) => {
  clipboard = { type: 'cut', path: itemPath };
  return { success: true };
});

ipcMain.handle('paste-file', async (e, targetDir) => {
  if (!clipboard.path) return { success: false, error: 'Nothing to paste' };
  
  try {
    const itemName = path.basename(clipboard.path);
    const newPath = path.join(targetDir, itemName);
    
    if (clipboard.type === 'copy') {
      if (fsSync.statSync(clipboard.path).isDirectory()) {
        await fs.cp(clipboard.path, newPath, { recursive: true });
      } else {
        await fs.copyFile(clipboard.path, newPath);
      }
    } else if (clipboard.type === 'cut') {
      await fs.rename(clipboard.path, newPath);
      clipboard = { type: null, path: null };
    }
    
    await refreshFileTree();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('move-file', async (e, { sourcePath, targetDir }) => {
  try {
    const fileName = path.basename(sourcePath);
    const newPath = path.join(targetDir, fileName);
    
    if (sourcePath === targetDir || newPath === sourcePath) {
      return { success: false, error: 'Cannot move to same location' };
    }
    
    if (newPath.startsWith(sourcePath + path.sep)) {
      return { success: false, error: 'Cannot move folder into itself' };
    }
    
    await fs.rename(sourcePath, newPath);
    await refreshFileTree();
    return { success: true, newPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('rename-item', async (e, { oldPath, newPath }) => {
  try {
    await fs.rename(oldPath, newPath);
    await refreshFileTree();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('check-file', async (e, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    const content = stats.isFile() ? await fs.readFile(filePath, 'utf-8') : null;
    return {
      success: true,
      info: {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
        lines: content ? content.split('\n').length : 0
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-terminal', async (e, dirPath) => {
  try {
    const platform = os.platform();
    
    if (platform === 'win32') {
      exec(`start cmd /K cd /d "${dirPath}"`);
    } else if (platform === 'darwin') {
      exec(`open -a Terminal "${dirPath}"`);
    } else {
      exec(`x-terminal-emulator --working-directory="${dirPath}"`, (err) => {
        if (err) exec(`gnome-terminal --working-directory="${dirPath}"`);
      });
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('create-project', async (e, { type, name }) => {
  const desktopPath = app.getPath('desktop');
  const projectPath = path.join(desktopPath, name);
  
  try {
    if (fsSync.existsSync(projectPath)) {
      return { success: false, error: 'Folder already exists on Desktop' };
    }
    
    await fs.mkdir(projectPath);
    
    if (type === 'python') {
      const mainCode = `# Project: ${name}\nimport os\n\ndef main():\n    print("Hello from ${name}!")\n    # Write your code here\n\nif __name__ == "__main__":\n    main()\n`;
      
      await fs.writeFile(path.join(projectPath, 'main.py'), mainCode);
      await fs.writeFile(path.join(projectPath, 'README.md'), `# ${name}\n\nPython project created with Note Studio.\n\n## Run:\n\`\`\`bash\npython main.py\n\`\`\``);
      await fs.writeFile(path.join(projectPath, 'requirements.txt'), `# Add your dependencies here\n`);
      await fs.writeFile(path.join(projectPath, '.gitignore'), `__pycache__/\nvenv/\n*.pyc\n.env\n`);
      
      currentProjectPath = projectPath;
      const files = await fetchDirectory(projectPath);
      mainWindow.webContents.send('folder-opened', { path: projectPath, files });
      
      return { success: true };
      
    } else if (type === 'electron') {
      const command = `npm create vite@latest . -- --template react`;
      
      return new Promise((resolve) => {
        exec(command, { cwd: projectPath }, async (error, stdout, stderr) => {
          if (error) {
            fsSync.rmSync(projectPath, { recursive: true, force: true });
            resolve({ 
              success: false, 
              error: "Failed to create Electron app. Ensure Node.js is installed." 
            });
            return;
          }
          
          const helpText = `# ${name}\n\nElectron + React (Vite) project created with Note Studio.\n\n## Setup:\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\``;
          await fs.writeFile(path.join(projectPath, 'NOTE_STUDIO_README.md'), helpText);
          
          currentProjectPath = projectPath;
          const files = await fetchDirectory(projectPath);
          mainWindow.webContents.send('folder-opened', { path: projectPath, files });
          
          resolve({ success: true });
        });
      });
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('create-folder', async (e, { parentPath, folderName }) => {
  try {
    const newFolderPath = path.join(parentPath, folderName);
    await fs.mkdir(newFolderPath, { recursive: true });
    await refreshFileTree();
    return { success: true, path: newFolderPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC Listeners for Menu Bar
ipcMain.on('open-folder-trigger', handleOpenFolder);
ipcMain.on('load-project-trigger', handleLoadProject);
ipcMain.on('export-project-trigger', handleExportProject);
ipcMain.on('auto-save-settings-trigger', toggleAutoSave);
ipcMain.on('restore-backup-trigger', handleRestoreBackup);
ipcMain.on('show-backups-trigger', () => shell.openPath(backupFolder));
ipcMain.on('show-shortcuts-trigger', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Keyboard Shortcuts',
    message: `
Ctrl+Shift+N - New Project
Ctrl+N - New Tab
Ctrl+O - Open Folder
Ctrl+S - Save
Ctrl+E - Export ZIP
Ctrl+L - Load Project
Alt+A - New File
Alt+R - Terminal
Ctrl+B - Toggle Sidebar
    `
  });
});

ipcMain.on('minimize-window', () => mainWindow.minimize());
ipcMain.on('maximize-window', () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('close-window', () => mainWindow.close());
// --- أضف هذا الجزء لربط أزرار المنيو بار بالواجهة ---
const forwardEvents = [
  'new-project-trigger',
  'new-file-trigger',
  'new-blank-tab',
  'toggle-sidebar',
  'next-tab',
  'prev-tab',
  'copy-file-trigger',
  'paste-file-trigger',
  'delete-file-trigger'
];

forwardEvents.forEach(event => {
  ipcMain.on(event, () => {
    if (mainWindow) mainWindow.webContents.send(event);
  });
});
ipcMain.on('open-terminal-trigger', () => {
  // هنا نقوم بتشغيل التيرمينال مباشرة من الماين بروسيس
  // نستخدم المجلد المفتوح حالياً (currentProjectPath)
  const pathTarget = currentProjectPath || os.homedir(); 
  
  const platform = os.platform();
  if (platform === 'win32') {
    exec(`start cmd /K cd /d "${pathTarget}"`);
  } else if (platform === 'darwin') {
    exec(`open -a Terminal "${pathTarget}"`);
  } else {
    exec(`gnome-terminal --working-directory="${pathTarget}"`);
  }
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });