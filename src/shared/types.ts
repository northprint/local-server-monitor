export interface ServerProcess {
  pid: number
  name: string      // "next-server", "vite", "node", etc.
  port: number | null
  cwd: string
  cpu: string       // "2.1"
  mem: string       // "80" (MB)
  command: string   // full command string
  startTime: string // human-readable start time
  isDev: boolean    // 開発サーバーとして分類されるか
}

export interface KillResult {
  success: boolean
  error?: string
}

// IPC channel names (shared contract)
export const IPC = {
  SCAN: 'processes:scan',
  KILL: 'processes:kill',
  OPEN_BROWSER: 'browser:open',
} as const

// contextBridge で公開する API の型定義（preload / renderer / env.d.ts で共有）
export interface ElectronAPI {
  scanProcesses: () => Promise<ServerProcess[]>
  killProcess: (pid: number) => Promise<KillResult>
  openInBrowser: (port: number) => void
}
