import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { RadioMesh } from './mesh.js'

@customElement('slipstream-broadcaster')
export class SlipstreamBroadcaster extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: inherit;
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .room-id {
      font-size: 0.8rem;
      opacity: 0.6;
      word-break: break-all;
    }

    .peers {
      font-size: 0.85rem;
    }

    .status {
      font-size: 0.85rem;
    }
  `

  /** Optional fixed peer ID to use as the room identifier */
  @property({ type: String, attribute: 'room-id' }) roomId = ''

  @state() private peerId: string | null = null
  @state() private broadcasting = false
  @state() private peers: string[] = []
  @state() private status = 'idle'

  private mesh: RadioMesh | null = null

  connectedCallback(): void {
    super.connectedCallback()
    this.initMesh()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.mesh?.destroy()
    this.mesh = null
  }

  private initMesh(): void {
    this.status = 'connecting...'
    this.mesh = new RadioMesh('broadcaster', {
      onReady: (id) => {
        this.peerId = id
        this.status = 'ready'
      },
      onPeerConnected: (id) => {
        this.peers = [...this.peers, id]
        // If already broadcasting, call the new peer immediately
        if (this.broadcasting) {
          this.mesh?.connectToPeer(id)
        }
      },
      onPeerDisconnected: (id) => {
        this.peers = this.peers.filter((p) => p !== id)
      },
      onStream: () => { },
      onError: (err) => {
        this.status = `error: ${err.message}`
      },
    }, this.roomId || undefined)
  }

  private async handleToggle(): Promise<void> {
    if (!this.mesh) return

    if (this.broadcasting) {
      this.mesh.destroy()
      this.mesh = null
      this.broadcasting = false
      this.peers = []
      this.peerId = null
      this.initMesh()
    } else {
      try {
        this.status = 'requesting mic...'
        await this.mesh.startBroadcast()
        this.broadcasting = true
        this.status = 'live'
      } catch (err) {
        this.status = `mic error: ${(err as Error).message}`
      }
    }
  }

  render() {
    return html`
      <div class="panel">
        <button @click=${this.handleToggle} ?disabled=${this.status === 'connecting...'}>
          ${this.broadcasting ? 'Stop Broadcasting' : 'Start Broadcasting'}
        </button>
        <span class="status">Status: ${this.status}</span>
        ${this.peerId
        ? html`<span class="room-id">Room ID: ${this.peerId}</span>`
        : ''}
        <span class="peers">Listeners: ${this.peers.length}</span>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'slipstream-broadcaster': SlipstreamBroadcaster
  }
}
