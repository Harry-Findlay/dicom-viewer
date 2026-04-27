import { contextBridge, ipcRenderer } from 'electron'

// Expose a typed API surface to the renderer process
contextBridge.exposeInMainWorld('electron', {
  // File dialogs
  openDicomFiles: () => ipcRenderer.invoke('dialog:open-dicom'),
  openDicomDir: () => ipcRenderer.invoke('dialog:open-dicomdir'),
  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),

  // File system
  readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
  listDicomFiles: (dirPath: string) => ipcRenderer.invoke('fs:list-dicom', dirPath),

  // Export
  saveImage: (opts: { dataUrl: string; format: string; defaultName: string }) =>
    ipcRenderer.invoke('export:save-image', opts),

  // Menu events from main process -> renderer
  onMenuEvent: (event: string, callback: () => void) => {
    ipcRenderer.on(event, () => callback())
    return () => ipcRenderer.removeAllListeners(event)
  },
})

// TypeScript types for window.electron
export type ElectronAPI = {
  openDicomFiles: () => Promise<string[] | null>
  openDicomDir: () => Promise<string | null>
  openFolder: () => Promise<string | null>
  readFile: (filePath: string) => Promise<Buffer>
  listDicomFiles: (dirPath: string) => Promise<string[]>
  saveImage: (opts: { dataUrl: string; format: string; defaultName: string }) => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>
  onMenuEvent: (event: string, callback: () => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
