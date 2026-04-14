import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { RadioMesh } from './mesh.js'

@customElement('slipstream-listener')
export class SlipstreamListener extends LitElement {
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

    .status {
      font-size: 0.85rem;
    }

    audio {
      width: 100%;
    }
  `

  /** The broadcaster's peer ID (room ID) to connect to */
  @property({ type: String, attribute: 'broadcaster-id' }) broadcasterId = ''

  @state() private connected = false
  @state() private status = 'idle'
  @state() private hasStream = false

  private mesh: RadioMesh | null = null
  private audioRef: HTMLAudioElement | null = null

  connectedCallback(): void {
    super.connectedCallback()
    this.audioRef = document.createElement('audio')
    this.audioRef.autoplay = true
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.mesh?.destroy()
    this.mesh = null
  }

  private async handleConnect(): Promise<void> {
    if (this.connected) {
      this.mesh?.destroy()
      this.mesh = null
      this.connected = false
      this.hasStream = false
      this.status = 'idle'
      return
    }

    const target = this.broadcasterId.trim()
    if (!target) {
      this.status = 'error: no broadcaster-id set'
      return
    }

    this.status = 'connecting...'
    this.mesh = new RadioMesh('listener', {
      onReady: () => {
        this.mesh!.connectToPeer(target)
      },
      onPeerConnected: () => {
        this.connected = true
        this.status = 'connected — waiting for stream...'
      },
      onPeerDisconnected: () => {
        this.connected = false
        this.hasStream = false
        this.status = 'disconnected'
      },
      onStream: (stream) => {
        if (this.audioRef) {
          this.audioRef.srcObject = stream
        }
        this.hasStream = true
        this.status = 'receiving stream'
      },
      onError: (err) => {
        this.status = `error: ${err.message}`
      },
    })
  }

  render() {
    return html`
      <div class="panel">
        <button @click=${this.handleConnect}>
          ${this.connected ? 'Disconnect' : 'Connect'}
        </button>
        <span class="status">Status: ${this.status}</span>
        ${this.hasStream && this.audioRef
        ? html`<audio .srcObject=${this.audioRef.srcObject} autoplay controls></audio>`
        : ''}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'slipstream-listener': SlipstreamListener
  }
}
