import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { ServerProcess } from '../../shared/types'

@customElement('server-row')
export class ServerRow extends LitElement {
  static styles = css`
    :host {
      display: table-row;
    }

    :host(:hover) td {
      background: #EBEBEB;
    }

    @media (prefers-color-scheme: dark) {
      :host(:hover) td {
        background: #1A1A1A;
      }
    }

    td {
      padding: 9px 12px;
      border-bottom: 1px solid #EFEFEF;
      vertical-align: middle;
      transition: background 0.1s ease;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (prefers-color-scheme: dark) {
      td {
        border-bottom-color: #222222;
      }
    }

    /* Name cell */
    .name-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .type-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .server-name {
      font-weight: 500;
      font-size: 12.5px;
      color: #0A0A0A;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @media (prefers-color-scheme: dark) {
      .server-name {
        color: #E0E0E0;
      }
    }

    /* Port cell */
    .port {
      font-size: 12px;
      font-family: 'SF Mono', ui-monospace, 'Cascadia Code', monospace;
      font-variant-numeric: tabular-nums;
      color: #555;
    }

    .port-none {
      color: #D0D0D0;
      font-size: 12px;
    }

    @media (prefers-color-scheme: dark) {
      .port {
        color: #888;
      }
      .port-none {
        color: #333;
      }
    }

    /* Metric cells */
    .metric {
      font-size: 12px;
      font-family: 'SF Mono', ui-monospace, 'Cascadia Code', monospace;
      font-variant-numeric: tabular-nums;
      color: #666;
    }

    @media (prefers-color-scheme: dark) {
      .metric {
        color: #777;
      }
    }

    .metric-high {
      color: #EF4444;
    }

    /* CWD cell */
    .cwd {
      font-size: 11px;
      font-family: 'SF Mono', ui-monospace, 'Cascadia Code', monospace;
      color: #A0A0A0;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 0;  /* forces ellipsis in table-fixed layout */
    }

    @media (prefers-color-scheme: dark) {
      .cwd {
        color: #555;
      }
    }

    /* Actions cell */
    td.actions {
      text-align: right;
    }

    .actions-wrap {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 9px;
      border-radius: 5px;
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.12s ease;
      background: transparent;
      border: 1px solid #E0E0E0;
      color: #888;
      white-space: nowrap;
    }

    .btn-open:hover {
      color: #0A0A0A;
      border-color: #B0B0B0;
    }

    .btn-kill:hover {
      color: #EF4444;
      border-color: #EF4444;
    }

    .btn-kill:active {
      transform: scale(0.97);
    }

    .btn-kill.killing {
      opacity: 0.4;
      cursor: default;
      pointer-events: none;
    }

    @media (prefers-color-scheme: dark) {
      button {
        border-color: #333;
        color: #666;
      }
      .btn-open:hover {
        color: #F0F0F0;
        border-color: #666;
      }
      .btn-kill:hover {
        color: #EF4444;
        border-color: #EF4444;
      }
    }
  `

  @property({ type: Object }) process!: ServerProcess
  @state() private killing = false

  // 定数化（マジックナンバー回避）
  private static readonly KILL_RESET_DELAY_MS = 1_000

  private _killTimer: ReturnType<typeof setTimeout> | null = null

  disconnectedCallback(): void {
    super.disconnectedCallback()
    // コンポーネント破棄後のタイマー発火を防止（Lit警告抑制）
    if (this._killTimer !== null) {
      clearTimeout(this._killTimer)
      this._killTimer = null
    }
  }

  private getDotColor(name: string): string {
    const n = name.toLowerCase()
    if (n.includes('next'))    return '#A3A3A3'
    if (n.includes('vite'))    return '#646CFF'
    if (n.includes('webpack')) return '#75AFCC'
    if (n.includes('turbo'))   return '#EF4444'
    if (n.includes('bun'))     return '#F59E0B'
    if (n.includes('nodemon')) return '#FB923C'
    if (n.includes('npm'))     return '#CB3837'
    return '#22C55E'  // node/default
  }

  private shortCwd(cwd: string): string {
    if (!cwd) return '—'
    // Show only last 2 path segments
    const parts = cwd.replace(/\\/g, '/').split('/')
    return parts.slice(-2).join('/') || cwd
  }

  private cpuClass(cpu: string): string {
    return parseFloat(cpu) > 50 ? 'metric metric-high' : 'metric'
  }

  private handleKill(): void {
    if (this.killing) return
    this.killing = true
    this.dispatchEvent(
      new CustomEvent<{ pid: number }>('kill-process', {
        detail: { pid: this.process.pid },
        bubbles: true,
        composed: true,
      })
    )
    // 親がプロセス一覧を更新してこのコンポーネントを破棄するまでのフォールバック
    this._killTimer = setTimeout(
      () => { this.killing = false },
      ServerRow.KILL_RESET_DELAY_MS
    )
  }

  private handleOpen(): void {
    if (this.process.port === null) return
    this.dispatchEvent(
      new CustomEvent('open-browser', {
        detail: { port: this.process.port },
        bubbles: true,
        composed: true,
      })
    )
  }

  render() {
    const { name, port, pid, cpu, mem, cwd } = this.process

    return html`
      <td>
        <div class="name-cell">
          <span
            class="type-dot"
            style="background: ${this.getDotColor(name)}"
            title=${this.process.command}
          ></span>
          <span class="server-name" title=${name}>${name}</span>
        </div>
      </td>

      <td>
        ${port !== null
          ? html`<span class="port">${port}</span>`
          : html`<span class="port-none">—</span>`}
      </td>

      <td><span class="metric">${pid}</span></td>

      <td><span class=${this.cpuClass(cpu)}>${cpu}%</span></td>

      <td><span class="metric">${mem}M</span></td>

      <td>
        <span class="cwd" title=${cwd}>${this.shortCwd(cwd)}</span>
      </td>

      <td class="actions">
        <div class="actions-wrap">
          ${port !== null
            ? html`
                <button class="btn-open" @click=${this.handleOpen}>
                  Open
                </button>
              `
            : ''}
          <button
            class="btn-kill ${this.killing ? 'killing' : ''}"
            @click=${this.handleKill}
            ?disabled=${this.killing}
          >
            ${this.killing ? '...' : 'Kill'}
          </button>
        </div>
      </td>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'server-row': ServerRow
  }
}
