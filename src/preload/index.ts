import { contextBridge, ipcRenderer } from 'electron'
import type { ServerProcess, KillResult } from '../shared/types'
import { IPC } from '../shared/types'

const api = {
  scanProcesses: (): Promise<ServerProcess[]> => ipcRenderer.invoke(IPC.SCAN),

  killProcess: (pid: number): Promise<KillResult> => ipcRenderer.invoke(IPC.KILL, pid),

  openInBrowser: (port: number): void => ipcRenderer.send(IPC.OPEN_BROWSER, port),
}

contextBridge.exposeInMainWorld('electronAPI', api)

// Expose type for renderer TypeScript
export type ElectronAPI = typeof api
