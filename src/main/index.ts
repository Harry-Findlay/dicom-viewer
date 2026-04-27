import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import path from 'path'
import fs from 'fs'

// ── GPU acceleration ──────────────────────────────────────────────────────────
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blacklist')
app.commandLine.appendSwitch('enable-accelerated-video-decode')
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')

const isDev = !app.isPackaged
const RENDERER_URL = 'http://localhost:5173'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111111',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
    if (isDev) mainWindow!.webContents.openDevTools({ mode: 'detach' })
  })

  if (isDev) {
    mainWindow.loadURL(RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  setupMenu()
}

function setupMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open DICOM File(s)…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-files'),
        },
        {
          label: 'Open DICOMDIR…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => mainWindow?.webContents.send('menu:open-dicomdir'),
        },
        { type: 'separator' },
        {
          label: 'Export Current Frame…',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.send('menu:export'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC: open DICOM files ─────────────────────────────────────────────────────
ipcMain.handle('dialog:open-dicom', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open DICOM File(s)',
    filters: [
      { name: 'DICOM Files', extensions: ['dcm', 'dicom', 'ima', '*'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  })
  return result.canceled ? null : result.filePaths
})

// DICOMDIR: allow selecting any file named DICOMDIR (no extension) or a folder
ipcMain.handle('dialog:open-dicomdir', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open DICOMDIR file',
    filters: [
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open DICOM Folder',
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// ── IPC: read file as buffer ──────────────────────────────────────────────────
ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
  return fs.readFileSync(filePath)
})

// ── IPC: list DICOM files in a directory ─────────────────────────────────────
ipcMain.handle('fs:list-dicom', async (_event, dirPath: string) => {
  const DICOM_EXTENSIONS = new Set(['.dcm', '.dicom', '.ima'])
  const results: string[] = []

  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch { return }

    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else {
        const ext = path.extname(entry.name).toLowerCase()
        const nameUpper = entry.name.toUpperCase()
        // Include known extensions OR extensionless files that aren't DICOMDIR
        if (DICOM_EXTENSIONS.has(ext) || (ext === '' && nameUpper !== 'DICOMDIR')) {
          results.push(full)
        }
      }
    }
  }

  walk(dirPath)
  return results
})

// ── IPC: export canvas image ──────────────────────────────────────────────────
ipcMain.handle('export:save-image', async (_event, { dataUrl, format, defaultName }: { dataUrl: string; format: string; defaultName: string }) => {
  const ext = format.toLowerCase()
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [{ name: format.toUpperCase(), extensions: [ext] }],
  })
  if (result.canceled || !result.filePath) return { success: false, canceled: true }

  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')

  try {
    let outputBuffer = buffer
    if (ext === 'tiff' || ext === 'tif') {
      try {
        const sharp = require('sharp')
        outputBuffer = await sharp(buffer).tiff({ compression: 'lzw' }).toBuffer()
      } catch {}
    } else if (ext === 'jpg' || ext === 'jpeg') {
      try {
        const sharp = require('sharp')
        outputBuffer = await sharp(buffer).jpeg({ quality: 95 }).toBuffer()
      } catch {}
    }
    fs.writeFileSync(result.filePath, outputBuffer)
    shell.showItemInFolder(result.filePath)
    return { success: true, path: result.filePath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(createWindow)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
