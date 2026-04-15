import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { RadioMesh } from './mesh.js'

type ListenerState = 'connecting' | 'reconnecting' | 'offline' | 'live' | 'failed'

const RETRY_BASE = 2000
const RETRY_MAX = 30000

@customElement('slipstream-listener')
export class SlipstreamListener extends LitElement {
  static styles = css`
    :host { display: block; }
    .panel { display: flex; flex-direction: column; gap: 0.5rem; }
  `

  @property({ type: String, attribute: 'channel-id' }) channelId = ''

  @state() private state: ListenerState = 'connecting'
  @state() private playing = false
  @state() private nowPlaying = ''

  private mesh: RadioMesh | null = null
  private audioEl: HTMLAudioElement | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryDelay = RETRY_BASE

  connectedCallback(): void {
    super.connectedCallback()
    this.audioEl = document.createElement('audio')
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.clearRetryTimer()
    this.mesh?.destroy()
    this.mesh = null
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('channelId') && this.channelId && !this.mesh) {
      this.connect()
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  private scheduleReconnect(): void {
    this.clearRetryTimer()
    this.mesh?.destroy()
    this.mesh = null
    this.playing = false
    this.state = 'reconnecting'
    this.retryTimer = setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX)
      this.connect()
    }, this.retryDelay)
  }

  private connect(): void {
    this.state = 'connecting'
    this.mesh = new RadioMesh('listener', {
      onReady: () => {
        this.mesh!.connectToPeer(this.channelId)
      },
      onPeerConnected: () => {
        this.state = 'offline'
      },
      onPeerDisconnected: () => {
        this.scheduleReconnect()
      },
      onStream: (stream) => {
        if (this.audioEl) this.audioEl.srcObject = stream
        this.retryDelay = RETRY_BASE
        this.state = 'live'
      },
      onMessage: (data) => {
        if (data && typeof data === 'object' && (data as Record<string, unknown>).type === 'nowPlaying') {
          this.nowPlaying = String((data as Record<string, unknown>).text ?? '')
        }
      },
      onError: () => {
        this.scheduleReconnect()
      },
    })
  }

  private handlePlay(): void {
    this.audioEl?.play()
    this.playing = true
  }

  private handleStop(): void {
    this.audioEl?.pause()
    this.playing = false
  }

  render() {
    const isLive = this.state === 'live'

    return html`
      <div class="panel">
        <p>${isLive ? `Live: ${this.nowPlaying || '…'}` : this.state}</p>
        <button
          @click=${this.playing ? this.handleStop : this.handlePlay}
          ?disabled=${!isLive}
        >
          ${this.playing ? 'Stop' : 'Play'}
        </button>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'slipstream-listener': SlipstreamListener
  }
}
