import { execSync } from 'child_process'
import type { ServerProcess } from '../shared/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 4000 }).trim()
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { killed?: boolean }
    if (e.killed) {
      // タイムアウト: パフォーマンス問題の診断に重要
      console.warn(`[process-scanner] Command timed out: ${cmd}`)
    } else if (e.code === 'ENOENT') {
      // コマンド未発見: lsof/ps が存在しない環境では致命的
      console.error(`[process-scanner] Command not found: ${cmd}`)
    }
    // lsof/ps の正常な「結果なし」は exit code 1 なのでログ不要
    return ''
  }
}

function rssToMb(rssKb: string): string {
  const kb = parseInt(rssKb, 10)
  return isNaN(kb) ? '0' : String(Math.round(kb / 1024))
}

function formatStartTime(lstart: string): string {
  const d = new Date(lstart)
  return isNaN(d.getTime())
    ? lstart
    : d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ─── Dev サーバー分類 ─────────────────────────────────────────────────────────
//   node/npm 系ツールを "dev" とみなし、それ以外（DB・システム・プロキシ等）を "other" とする

// コマンドに含まれていれば dev と判断するパターン
const DEV_CMD_PATTERNS = [
  'node', 'npm', 'npx', 'yarn', 'pnpm',
  'vite', 'webpack', 'next', 'nuxt', 'remix', 'astro',
  'nodemon', 'ts-node', 'tsx', 'esbuild', 'turbo',
  'bun', 'deno',
  'react-scripts', 'vue-cli-service', 'angular',
  'parcel', 'rollup', 'snowpack',
]

// コマンドに含まれていれば非dev と判断するパターン（DB・インフラ系）
const NON_DEV_CMD_PATTERNS = [
  // ── DB / インフラ ──────────────────────────────────────────────────────────
  /\bpostgres\b/, /\bmysqld?\b/, /\bmariadbd?\b/,
  /\bredis-server\b/, /\bmongod\b/, /\belasticsearch\b/,
  /\bnginx\b/, /\bhttpd\b/, /\bapache2?\b/,
  /\bmemcached\b/, /\bcouchdb\b/, /\bzookeeper\b/,
  /\bjava\b/, /\bruby\b/, /\bpython3?\b/, /\bphp\b/,

  // ── .app バンドル内プロセス（VS Code, Cursor, Electron アプリ等） ──────────
  // 例: /Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin)...
  //      --utility-sub-type=node.mojom.NodeService
  /\/applications\/[^/]+\.app\//,   // アプリバンドルパスからの起動
  /--utility-sub-type=node\.mojom/, // Electron 内部 Node サービス
  /--type=(?:renderer|gpu-process|utility|crashpad-handler)/,  // Electron サブプロセス

  // ── ユーザー Library / システム領域の常駐 Node ───────────────────────────
  /\/library\/application support\//,  // ~/Library/Application Support/... 常駐
]

function classifyAsDev(command: string, port: number): boolean {
  // システムポート (< 1024) は dev サーバーではない
  if (port < 1024) return false

  const cmd = command.toLowerCase()

  // 明示的に非dev なパターンは先にはじく
  if (NON_DEV_CMD_PATTERNS.some((p) => p.test(cmd))) return false

  // dev パターンにマッチすれば dev
  return DEV_CMD_PATTERNS.some((p) => cmd.includes(p))
}

function inferName(command: string): string {
  const cmd = command.toLowerCase()
  if (cmd.includes('next-server') || (cmd.includes('next') && cmd.includes('start'))) return 'next-server'
  if (cmd.includes('vite'))    return 'vite'
  if (cmd.includes('webpack')) return 'webpack'
  if (cmd.includes('turbo'))   return 'turbo'
  if (cmd.includes('nodemon')) return 'nodemon'
  if (cmd.includes('ts-node') || cmd.includes('tsx')) return 'ts-node'
  // 単語境界チェック: "abundance" などへの誤マッチを防止
  if (/\bbun\b/.test(cmd))     return 'bun'
  if (cmd.includes('esbuild')) return 'esbuild'
  if (cmd.includes('npm'))     return 'npm'
  const nodeMatch = command.match(/node\s+(?:--\S+\s+)*(\S+\.(?:js|mjs|cjs|ts))/)
  if (nodeMatch) {
    const parts = nodeMatch[1].split('/')
    return parts[parts.length - 1]
  }
  return 'node'
}

// ─── Step 1: LISTEN ソケットから pid → port マップを取得 ─────────────────────
//   lsof -nP -iTCP -sTCP:LISTEN: 軽量・高速

interface ListenEntry {
  pid: number
  port: number
  cmdName: string
}

function getLsofListeners(): ListenEntry[] {
  const out = run('lsof -nP -iTCP -sTCP:LISTEN')
  const entries: ListenEntry[] = []

  for (const line of out.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 9) continue
    const cmdName = cols[0]
    const pid = parseInt(cols[1], 10)
    const addrPort = cols[8] // "*:3000" or "127.0.0.1:5173"
    const portStr = addrPort.split(':').pop()
    if (!portStr) continue
    const port = parseInt(portStr, 10)
    if (isNaN(pid) || isNaN(port)) continue
    entries.push({ pid, port, cmdName })
  }
  return entries
}

// ─── Step 2: 対象 PID のみ ps でバッチ取得（全スキャンなし）────────────────────

interface PsInfo {
  pid: number
  cpu: string
  rss: string
  lstart: string
  command: string
}

function getPsInfoBatch(pids: number[]): Map<number, PsInfo> {
  if (pids.length === 0) return new Map()
  const pidList = pids.join(',')
  const out = run(`ps -p ${pidList} -o pid=,pcpu=,rss=,lstart=,command=`)
  const map = new Map<number, PsInfo>()
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const tokens = line.trimStart().split(/\s+/)
    if (tokens.length < 9) continue
    const pid = parseInt(tokens[0], 10)
    if (isNaN(pid)) continue
    map.set(pid, {
      pid,
      cpu:     tokens[1],
      rss:     tokens[2],
      lstart:  tokens.slice(3, 8).join(' '),
      command: tokens.slice(8).join(' '),
    })
  }
  return map
}

// ─── Step 3: CWD をバッチで取得（N+1 解消）──────────────────────────────────
//   旧: getCwd(pid) を各PIDごとに呼び出し → lsof を N 回起動
//   新: lsof -p pid1,pid2,... で1回のみ起動

function getCwdBatch(pids: number[]): Map<number, string> {
  if (pids.length === 0) return new Map()
  const pidList = pids.join(',')
  // -a: AND 条件, -d cwd: cwd ファイルディスクリプタのみ, -Fn: ファイル名出力
  const out = run(`lsof -p ${pidList} -a -d cwd -Fn 2>/dev/null`)
  const map = new Map<number, string>()
  let currentPid = 0
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) {
      currentPid = parseInt(line.slice(1), 10)
    } else if (line.startsWith('n') && currentPid > 0) {
      map.set(currentPid, line.slice(1))
      currentPid = 0 // 1 PID につき cwd は1つ
    }
  }
  return map
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function scanProcesses(): Promise<ServerProcess[]> {
  const listeners = getLsofListeners()
  if (listeners.length === 0) return []

  // pid → 最小ポートにまとめる（同 pid が複数ポートを LISTEN する場合）
  const pidPortMap = new Map<number, { port: number; cmdName: string }>()
  for (const { pid, port, cmdName } of listeners) {
    const existing = pidPortMap.get(pid)
    if (!existing || port < existing.port) {
      pidPortMap.set(pid, { port, cmdName })
    }
  }

  const pids = [...pidPortMap.keys()]
  const psMap  = getPsInfoBatch(pids)
  const cwdMap = getCwdBatch(pids)   // ← N+1 → 1回に集約

  const results: ServerProcess[] = []
  for (const [pid, { port, cmdName }] of pidPortMap.entries()) {
    const ps = psMap.get(pid)
    const command = ps?.command ?? cmdName
    const name = inferName(command)
    results.push({
      pid,
      name,
      port,
      cwd:       cwdMap.get(pid) ?? '',
      cpu:       ps ? parseFloat(ps.cpu).toFixed(1) : '0.0',
      mem:       ps ? rssToMb(ps.rss) : '0',
      command,
      startTime: ps ? formatStartTime(ps.lstart) : '',
      isDev:     classifyAsDev(command, port),
    })
  }

  results.sort((a, b) => (a.port ?? 0) - (b.port ?? 0))
  return results
}

// ─── Kill ─────────────────────────────────────────────────────────────────────

export function killProcess(pid: number): { success: boolean; error?: string } {
  // まずプロセスの存在確認（signal 0 = 存在チェックのみ、副作用なし）
  try {
    process.kill(pid, 0)
  } catch {
    // ESRCH: プロセスが既に存在しない → Kill 不要なので成功扱い
    return { success: true }
  }

  try {
    process.kill(pid, 'SIGTERM')
    return { success: true }
  } catch (e1) {
    const err = e1 as NodeJS.ErrnoException
    // EPERM: 権限不足 → SIGKILL も同様に失敗するので早期リターン
    if (err.code === 'EPERM') {
      return { success: false, error: 'Permission denied (EPERM)' }
    }
    // ESRCH: SIGTERM 送信後にプロセスが終了 → 成功扱い
    if (err.code === 'ESRCH') {
      return { success: true }
    }
    // その他の理由: SIGKILL で強制終了を試みる
    try {
      process.kill(pid, 'SIGKILL')
      return { success: true }
    } catch (e2) {
      return { success: false, error: String(e2) }
    }
  }
}
