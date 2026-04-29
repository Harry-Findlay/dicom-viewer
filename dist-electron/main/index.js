"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
electron_1.Menu.setApplicationMenu(null);
// ── GPU acceleration ──────────────────────────────────────────────────────────
electron_1.app.commandLine.appendSwitch('enable-gpu-rasterization');
electron_1.app.commandLine.appendSwitch('enable-zero-copy');
electron_1.app.commandLine.appendSwitch('ignore-gpu-blacklist');
electron_1.app.commandLine.appendSwitch('enable-accelerated-video-decode');
electron_1.app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
const isDev = !electron_1.app.isPackaged;
const RENDERER_URL = 'http://localhost:5173';
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#111111',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
            preload: path_1.default.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: false,
        },
        show: false,
    });
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        if (isDev)
            mainWindow.webContents.openDevTools({ mode: 'detach' });
    });
    if (isDev) {
        mainWindow.loadURL(RENDERER_URL);
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../../dist/index.html'));
    }
    // Keyboard shortcuts without a visible menu bar
    mainWindow.webContents.on('before-input-event', (_event, input) => {
        if (!mainWindow)
            return;
        const ctrl = input.control || input.meta;
        if (input.type !== 'keyDown')
            return;
        if (ctrl && !input.shift && input.key === 'o')
            mainWindow.webContents.send('menu:open-files');
        if (ctrl && input.shift && input.key === 'O')
            mainWindow.webContents.send('menu:open-dicomdir');
        if (ctrl && input.key === 'e')
            mainWindow.webContents.send('menu:export');
        if (input.key === 'F11')
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
        if (ctrl && input.shift && input.key === 'I')
            mainWindow.webContents.toggleDevTools();
    });
}
// ── IPC: open DICOM files ─────────────────────────────────────────────────────
electron_1.ipcMain.handle('dialog:open-dicom', async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: 'Open DICOM File(s)',
        filters: [
            { name: 'DICOM Files', extensions: ['dcm', 'dicom', 'ima', '*'] },
            { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? null : result.filePaths;
});
electron_1.ipcMain.handle('dialog:open-dicomdir', async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: 'Open DICOMDIR file',
        filters: [{ name: 'All Files', extensions: ['*'] }],
        properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
});
electron_1.ipcMain.handle('dialog:open-folder', async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: 'Open DICOM Folder',
        properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
});
// ── IPC: read file as buffer ──────────────────────────────────────────────────
electron_1.ipcMain.handle('fs:read-file', async (_event, filePath) => {
    return fs_1.default.readFileSync(filePath);
});
// ── IPC: list DICOM files in a directory ─────────────────────────────────────
electron_1.ipcMain.handle('fs:list-dicom', async (_event, dirPath) => {
    const DICOM_EXTENSIONS = new Set(['.dcm', '.dicom', '.ima']);
    const results = [];
    function walk(dir) {
        let entries;
        try {
            entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const full = path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            }
            else {
                const ext = path_1.default.extname(entry.name).toLowerCase();
                const nameUpper = entry.name.toUpperCase();
                if (DICOM_EXTENSIONS.has(ext) || (ext === '' && nameUpper !== 'DICOMDIR')) {
                    results.push(full);
                }
            }
        }
    }
    walk(dirPath);
    return results;
});
// ── IPC: export canvas image ──────────────────────────────────────────────────
electron_1.ipcMain.handle('export:save-image', async (_event, { dataUrl, format, defaultName }) => {
    const ext = format.toLowerCase();
    const result = await electron_1.dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    });
    if (result.canceled || !result.filePath)
        return { success: false, canceled: true };
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    try {
        let outputBuffer = buffer;
        if (ext === 'tiff' || ext === 'tif') {
            try {
                const sharp = require('sharp');
                outputBuffer = await sharp(buffer).tiff({ compression: 'lzw' }).toBuffer();
            }
            catch { }
        }
        else if (ext === 'jpg' || ext === 'jpeg') {
            try {
                const sharp = require('sharp');
                outputBuffer = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();
            }
            catch { }
        }
        fs_1.default.writeFileSync(result.filePath, outputBuffer);
        electron_1.shell.showItemInFolder(result.filePath);
        return { success: true, path: result.filePath };
    }
    catch (err) {
        return { success: false, error: String(err) };
    }
});
// ── App lifecycle ─────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('activate', () => { if (electron_1.BrowserWindow.getAllWindows().length === 0)
    createWindow(); });
electron_1.app.on('window-all-closed', () => { if (process.platform !== 'darwin')
    electron_1.app.quit(); });
