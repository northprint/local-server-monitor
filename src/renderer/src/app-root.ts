import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { ServerProcess } from '../../shared/types'

@customElement('app-root')
export class AppRoot extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100%;
      background: #F5F5F5;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        background: #111111;
      }
    }

    .title-bar {
      /* Space for macOS traffic lights (14px inset × 3 buttons + margin) */
      padding: 10px 16px 10px 80px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #FFFFFF;
      border-bottom: 1px solid #E5E5E5;
      -webkit-app-region: drag;
      min-height: 44px;
      flex-shrink: 0;
    }

    @media (prefers-color-scheme: dark) {
      .title-bar {
        background: #1A1A1A;
        border-bottom-color: #2A2A2A;
      }
    }

    .title-bar h1 {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: #0A0A0A;
      -webkit-app-region: drag;
    }

    @media (prefers-color-scheme: dark) {
      .title-bar h1 {
        color: #F0F0F0;
      }
    }

    .title-bar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      -webkit-app-region: no-drag;
    }

    .refresh-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid #E0E0E0;
      background: #FFFFFF;
      font-size: 12px;
      color: #555;
      cursor: pointer;
      transition: all 0.15s ease;
      -webkit-app-region: no-drag;
    }

    .refresh-btn:hover {
      border-color: #C0C0C0;
      color: #1A1A1A;
    }

    .refresh-btn:active {
      background: #F5F5F5;
      transform: scale(0.97);
    }

    @media (prefers-color-scheme: dark) {
      .refresh-btn {
        background: #232323;
        border-color: #383838;
        color: #A0A0A0;
      }
      .refresh-btn:hover {
        border-color: #555;
        color: #F0F0F0;
      }
    }

    .spin {
      display: inline-block;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      border-radius: 10px;
      background: #0A0A0A;
      color: #F5F5F5;
      font-size: 11px;
      font-weight: 600;
    }

    @media (prefers-color-scheme: dark) {
      .count-badge {
        background: #F0F0F0;
        color: #111111;
      }
    }

    /* セグメントコントロール（Dev のみ / すべて） */
    .filter-tabs {
      display: flex;
      background: #EBEBEB;
      border-radius: 7px;
      padding: 2px;
      gap: 0;
      -webkit-app-region: no-drag;
    }

    @media (prefers-color-scheme: dark) {
      .filter-tabs {
        background: #252525;
      }
    }

    .filter-tab {
      padding: 3px 10px;
      border-radius: 5px;
      border: none;
      background: transparent;
      font-size: 11.5px;
      font-weight: 500;
      color: #888;
      cursor: pointer;
      transition: all 0.12s ease;
      white-space: nowrap;
    }

    .filter-tab:hover {
      color: #333;
    }

    .filter-tab.active {
      background: #FFFFFF;
      color: #0A0A0A;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    @media (prefers-color-scheme: dark) {
      .filter-tab {
        color: #666;
      }
      .filter-tab:hover {
        color: #AAA;
      }
      .filter-tab.active {
        background: #333333;
        color: #F0F0F0;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
      }
    }

    .content {
      flex: 1;
      overflow: auto;
    }

    .status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 16px;
      border-top: 1px solid #E5E5E5;
      background: #FFFFFF;
      font-size: 11px;
      color: #A0A0A0;
      flex-shrink: 0;
    }

    @media (prefers-color-scheme: dark) {
      .status-bar {
        border-top-color: #2A2A2A;
        background: #1A1A1A;
        color: #555;
      }
    }

    .dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #22C55E;
      margin-right: 5px;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .error-banner {
      margin: 12px 16px;
      padding: 10px 14px;
      background: #FFF5F5;
      border: 1px solid #FED7D7;
      border-radius: 6px;
      color: #C53030;
      font-size: 12px;
    }

    @media (prefers-color-scheme: dark) {
      .error-banner {
        background: #2A1111;
        border-color: #5C2020;
        color: #FC8181;
      }
    }
  `

  @state() private processes: ServerProcess[] = []
  @state() private loading = true
  @state() private error: string | null = null
  @state() private lastUpdate = ''
  // デフォルトは Dev サーバーのみ表示
  @state() private devOnly = true

  /** 現在のフィルター設定で絞り込んだ表示用リスト */
  private get visibleProcesses(): ServerProcess[] {
    return this.devOnly ? this.processes.filter((p) => p.isDev) : this.processes
  }

  // 二重スキャン防止フラグ（ポーリングと手動Refreshの競合を防ぐ）
  private _scanning = false
  private pollTimer: ReturnType<typeof setInterval> | null = null

  // ポーリング間隔（定数化）
  private static readonly POLL_INTERVAL_MS = 15_000

  connectedCallback(): void {
    super.connectedCallback()
    this.doScan()
    this.pollTimer = setInterval(() => this.doScan(), AppRoot.POLL_INTERVAL_MS)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async doScan(): Promise<void> {
    // 二重実行防止
    if (this._scanning) return
    this._scanning = true

    // window.electronAPI ガード（preload 失敗時や開発中のブラウザプレビュー対策）
    if (!window.electronAPI) {
      this.error = 'Electron API が利用できません。アプリを再起動してください。'
      this.loading = false
      this._scanning = false
      return
    }

    this.loading = true
    this.error = null
    try {
      this.processes = await window.electronAPI.scanProcesses()
      this.lastUpdate = new Date().toLocaleTimeString('ja-JP')
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
      this._scanning = false
    }
  }

  private async handleKill(e: CustomEvent<{ pid: number }>): Promise<void> {
    const { pid } = e.detail
    const result = await window.electronAPI.killProcess(pid)
    // Kill 失敗時はエラーバナーで通知
    if (!result.success) {
      this.error = `PID ${pid} の停止に失敗: ${result.error ?? '不明なエラー'}`
    }
    await this.doScan()
  }

  private handleOpenBrowser(e: CustomEvent<{ port: number }>): void {
    window.electronAPI.openInBrowser(e.detail.port)
  }

  // Refresh ボタン: タイマーもリセットして次の自動更新タイミングを揃える
  private handleRefresh(): void {
    if (this.pollTimer !== null) clearInterval(this.pollTimer)
    this.doScan()
    this.pollTimer = setInterval(() => this.doScan(), AppRoot.POLL_INTERVAL_MS)
  }

  render() {
    return html`
      <div class="title-bar">
        <h1>Local Server Monitor</h1>
        <div class="title-bar-actions">
          <!-- Dev / All フィルタートグル -->
          <div class="filter-tabs">
            <button
              class="filter-tab ${this.devOnly ? 'active' : ''}"
              @click=${() => { this.devOnly = true }}
            >Dev</button>
            <button
              class="filter-tab ${!this.devOnly ? 'active' : ''}"
              @click=${() => { this.devOnly = false }}
            >All</button>
          </div>
          <span class="count-badge">${this.visibleProcesses.length}</span>
          <button class="refresh-btn" @click=${this.handleRefresh} ?disabled=${this.loading}>
            <span class=${this.loading ? 'spin' : ''}>↻</span>
            Refresh
          </button>
        </div>
      </div>

      <div class="content">
        ${this.error ? html`<div class="error-banner">⚠ ${this.error}</div>` : ''}
        <server-list
          .processes=${this.visibleProcesses}
          .loading=${this.loading}
          @kill-process=${this.handleKill}
          @open-browser=${this.handleOpenBrowser}
        ></server-list>
      </div>

      <div class="status-bar">
        <span>
          <span class="dot"></span>
          Auto-refresh: 15s
        </span>
        <span>Updated: ${this.lastUpdate || '—'}</span>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-root': AppRoot
  }
}
