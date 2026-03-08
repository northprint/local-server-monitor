import { app, BrowserWindow, ipcMain, shell, nativeImage } from 'electron'
import { join } from 'path'
import { scanProcesses, killProcess } from './process-scanner'
import { IPC } from '../shared/types'

// アイコンパス（dev: out/main/ から 2階層上の resources/、prod: process.resourcesPath）
const resourcesPath = app.isPackaged
  ? process.resourcesPath
  : join(__dirname, '../../resources')

const appIcon = nativeImage.createFromPath(join(resourcesPath, 'icon.icns'))

// ─── Single-instance lock ────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// ─── Window ──────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 480,
    minWidth: 520,
    minHeight: 320,
    title: 'Local Server Monitor',
    icon: appIcon,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // sandbox: true がデフォルト。preload がバンドル済みのため Node.js 直接利用なし
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.SCAN, async () => {
    return await scanProcesses()
  })

  // PID バリデーション: 正の整数のみ許可
  // pid <= 0 の場合 process.kill はプロセスグループへの一括シグナルになり危険
  ipcMain.handle(IPC.KILL, (_event, pid: unknown) => {
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
      return { success: false, error: `Invalid PID: ${String(pid)}` }
    }
    return killProcess(pid)
  })

  // ポート番号バリデーション: 1〜65535 の整数のみ許可
  ipcMain.on(IPC.OPEN_BROWSER, (_event, port: unknown) => {
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
      console.warn('[main] Invalid port number for openBrowser:', port)
      return
    }
    shell.openExternal(`http://localhost:${port}`)
  })
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // macOS: 開発時はバンドルアイコンが存在しないため Dock に手動で設定
  if (process.platform === 'darwin' && !app.isPackaged && !appIcon.isEmpty()) {
    app.dock.setIcon(appIcon)
  }

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
