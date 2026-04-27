"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose a typed API surface to the renderer process
electron_1.contextBridge.exposeInMainWorld('electron', {
    // File dialogs
    openDicomFiles: () => electron_1.ipcRenderer.invoke('dialog:open-dicom'),
    openDicomDir: () => electron_1.ipcRenderer.invoke('dialog:open-dicomdir'),
    openFolder: () => electron_1.ipcRenderer.invoke('dialog:open-folder'),
    // File system
    readFile: (filePath) => electron_1.ipcRenderer.invoke('fs:read-file', filePath),
    listDicomFiles: (dirPath) => electron_1.ipcRenderer.invoke('fs:list-dicom', dirPath),
    // Export
    saveImage: (opts) => electron_1.ipcRenderer.invoke('export:save-image', opts),
    // Menu events from main process -> renderer
    onMenuEvent: (event, callback) => {
        electron_1.ipcRenderer.on(event, () => callback());
        return () => electron_1.ipcRenderer.removeAllListeners(event);
    },
});
