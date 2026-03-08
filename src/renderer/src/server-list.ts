import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import type { ServerProcess } from '../../shared/types'

@customElement('server-list')
export class ServerList extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    thead {
      position: sticky;
      top: 0;
      z-index: 1;
      background: #F5F5F5;
    }

    @media (prefers-color-scheme: dark) {
      thead {
        background: #111111;
      }
    }

    th {
      padding: 8px 12px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      color: #A0A0A0;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-bottom: 1px solid #E5E5E5;
      white-space: nowrap;
      overflow: hidden;
    }

    @media (prefers-color-scheme: dark) {
      th {
        color: #555;
        border-bottom-color: #2A2A2A;
      }
    }

    /* Column widths */
    .col-name    { width: 22%; }
    .col-port    { width: 10%; }
    .col-pid     { width: 10%; }
    .col-cpu     { width: 10%; }
    .col-mem     { width: 10%; }
    .col-cwd     { width: 22%; }
    .col-actions { width: 16%; text-align: right; }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      gap: 6px;
    }

    .empty-state p {
      font-size: 13px;
      color: #B0B0B0;
      margin: 0;
    }

    .empty-state .sub {
      font-size: 11px;
      color: #CECECE;
    }

    @media (prefers-color-scheme: dark) {
      .empty-state p {
        color: #444;
      }
      .empty-state .sub {
        color: #333;
      }
    }

    .loading-row td {
      padding: 32px;
      text-align: center;
      color: #C0C0C0;
      font-size: 12px;
    }

    @media (prefers-color-scheme: dark) {
      .loading-row td {
        color: #444;
      }
    }
  `

  @property({ type: Array }) processes: ServerProcess[] = []
  @property({ type: Boolean }) loading = false

  render() {
    if (!this.loading && this.processes.length === 0) {
      return html`
        <div class="empty-state">
          <p>No servers running</p>
          <span class="sub">Start a dev server to see it here</span>
        </div>
      `
    }

    return html`
      <table>
        <thead>
          <tr>
            <th class="col-name">Name</th>
            <th class="col-port">Port</th>
            <th class="col-pid">PID</th>
            <th class="col-cpu">CPU</th>
            <th class="col-mem">Mem</th>
            <th class="col-cwd">Directory</th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this.loading && this.processes.length === 0
            ? html`
                <tr class="loading-row">
                  <td colspan="7">Scanning...</td>
                </tr>
              `
            : this.processes.map(
                (proc) => html`
                  <server-row
                    .process=${proc}
                    @kill-process=${(e: CustomEvent<{ pid: number }>) =>
                      this.dispatchEvent(new CustomEvent<{ pid: number }>('kill-process', {
                        detail: e.detail, bubbles: true, composed: true,
                      }))}
                    @open-browser=${(e: CustomEvent<{ port: number }>) =>
                      this.dispatchEvent(new CustomEvent<{ port: number }>('open-browser', {
                        detail: e.detail, bubbles: true, composed: true,
                      }))}
                  ></server-row>
                `
              )}
        </tbody>
      </table>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'server-list': ServerList
  }
}
