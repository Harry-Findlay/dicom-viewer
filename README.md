# DICOM Viewer

A professional, GPU-accelerated DICOM viewer built with Electron, React, and Cornerstone3D.

## Features

- **DICOM / DICOMDIR** file support — open individual `.dcm` files, DICOMDIR indexes, or whole folders
- **GPU-accelerated rendering** — WebGL 2.0 via Cornerstone3D with SharedArrayBuffer pixel transfer
- **Slice viewer** — horizontal filmstrip at the bottom; scroll wheel to navigate
- **Tools**: Pan · Zoom · Window/Level · Length · Angle · Probe · Ellipse ROI · Rectangle ROI · Arrow Annotation · Magnify · Crosshairs
- **W/L presets** — Abdomen, Brain, Bone, Lung, Mediastinum, Liver
- **Export** — save current frame as PNG, JPEG (quality control), or TIFF (LZW compressed)
- **Metadata panel** — all key DICOM tags, pixel spacing, slice thickness
- **Series panel** — multi-series support, switch between series in one study
- **Viewport overlay** — patient info, modality, W/L, slice position

## Requirements

- Node.js ≥ 18
- npm ≥ 9

## Setup

```bash
cd dicom-viewer
npm install
```

## Development

```bash
npm run dev
```

This starts Vite on port 5173 and launches Electron in dev mode.

## Build

### Build for current platform

```bash
npm run dist
```

### Build for Windows

```bash
npm run dist:win
```

### Build for macOS

```bash
npm run dist:mac
```

Releases are output to `./release/`.

## GPU Acceleration

The app enables the following Chromium GPU flags at startup:

- `--enable-gpu-rasterization`
- `--enable-zero-copy`
- `--ignore-gpu-blacklist`
- `--enable-accelerated-video-decode`
- `SharedArrayBuffer` feature (required by Cornerstone3D for pixel data transfer)

Cornerstone3D uses WebGL 2.0 for all rendering. On systems with discrete GPUs, rendering is fully GPU-accelerated. On integrated graphics, it falls back gracefully to software rendering.

## Architecture

```
src/
  main/         Electron main process (Node.js)
    index.ts    Window creation, GPU flags, IPC handlers, file I/O, export
  preload/
    index.ts    Secure IPC bridge (contextBridge)
  renderer/     React app (runs in Chromium)
    App.tsx
    components/ UI components
    store/      Zustand state
    utils/      DICOM parsing, Cornerstone init
    styles/     CSS modules
```

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open files | Ctrl/Cmd + O |
| Open DICOMDIR | Ctrl/Cmd + Shift + O |
| Export frame | Ctrl/Cmd + E |
| Scroll slices | Mouse wheel |
| Pan | Middle-click drag |
| Zoom | Right-click drag |
| Window/Level | Left-click drag (default tool) |

## Notes

- `sharp` is used in the main process for TIFF export with LZW compression
- DICOM web workers handle image decoding off the main thread
- The renderer runs with `webSecurity: false` to allow `wadouri:file://` image IDs
- SharedArrayBuffer requires COOP/COEP headers (set in Vite dev server config)
