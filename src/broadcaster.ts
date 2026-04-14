import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { RadioMesh } from './mesh.js'

@customElement('slipstream-broadcaster')
export class SlipstreamBroadcaster extends LitElement {
  static styles = css`
    :host { display: block; }
    .panel { display: flex; flex-direction: column; gap: 0.5rem; }
    meter { width: 100%; }
    .on-air { font-weight: bold; }
    .on-air-dot {
      display: inline-block;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: red;
      margin-right: 0.4rem;
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }
  `

  @property({ type: String, attribute: 'room-id' }) roomId = ''

  @state() private peerId: string | null = null
  @state() private broadcasting = false
  @state() private peers: string[] = []
  @state() private status = 'idle'
  @state() private devices: MediaDeviceInfo[] = []
  @state() private selectedDeviceId = ''
  @state() private level = 0
  @state() private gain = 1

  private mesh: RadioMesh | null = null
  private audioContext: AudioContext | null = null
  private gainNode: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private rawStream: MediaStream | null = null
  private rafId: number | null = null

  connectedCallback(): void {
    super.connectedCallback()
    this.initMesh()
    this.loadDevices()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopAudio()
    this.mesh?.destroy()
    this.mesh = null
  }

  private async loadDevices(): Promise<void> {
    const all = await navigator.mediaDevices.enumerateDevices()
    this.devices = all.filter((d) => d.kind === 'audioinput')
    if (this.devices.length && !this.selectedDeviceId) {
      this.selectedDeviceId = this.devices[0].deviceId
    }
  }

  private initMesh(): void {
    this.status = 'connecting...'
    this.mesh = new RadioMesh('broadcaster', {
      onReady: (id) => { this.peerId = id; this.status = 'ready' },
      onPeerConnected: (id) => { this.peers = [...this.peers, id] },
      onPeerDisconnected: (id) => { this.peers = this.peers.filter((p) => p !== id) },
      onStream: () => { },
      onError: (err) => { this.status = `error: ${err.message}` },
    }, this.roomId || undefined)
  }

  private stopAudio(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rawStream?.getTracks().forEach((t) => t.stop())
    this.audioContext?.close()
    this.audioContext = null
    this.gainNode = null
    this.analyser = null
    this.rawStream = null
    this.rafId = null
    this.level = 0
  }

  private async handleToggle(): Promise<void> {
    if (!this.mesh) return

    if (this.broadcasting) {
      this.stopAudio()
      this.mesh.destroy()
      this.mesh = null
      this.broadcasting = false
      this.peers = []
      this.peerId = null
      this.initMesh()
      return
    }

    try {
      this.status = 'requesting mic...'
      const audio = this.selectedDeviceId ? { deviceId: { exact: this.selectedDeviceId } } : true
      this.rawStream = await navigator.mediaDevices.getUserMedia({ audio, video: false })

      // Re-enumerate to get real device labels now that we have permission
      await this.loadDevices()

      // Build audio graph: source → gain → analyser → destination (WebRTC)
      this.audioContext = new AudioContext()
      const source = this.audioContext.createMediaStreamSource(this.rawStream)
      this.gainNode = this.audioContext.createGain()
      this.gainNode.gain.value = this.gain
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      const destination = this.audioContext.createMediaStreamDestination()

      source.connect(this.gainNode)
      this.gainNode.connect(this.analyser)
      this.gainNode.connect(destination)

      // Start level meter
      const data = new Uint8Array(this.analyser.frequencyBinCount)
      const tick = () => {
        this.analyser!.getByteTimeDomainData(data)
        let sum = 0
        for (const v of data) { const n = v / 128 - 1; sum += n * n }
        this.level = Math.sqrt(sum / data.length)
        this.rafId = requestAnimationFrame(tick)
      }
      tick()

      this.mesh.startBroadcast(destination.stream)
      this.broadcasting = true
      this.status = 'live'
    } catch (err) {
      this.status = `mic error: ${(err as Error).message}`
    }
  }

  private handleGain(e: Event): void {
    this.gain = Number((e.target as HTMLInputElement).value)
    if (this.gainNode) this.gainNode.gain.value = this.gain
  }

  render() {
    return html`
      <div class="panel">
        <label>
          Input
          <select
            ?disabled=${this.broadcasting}
            @change=${(e: Event) => { this.selectedDeviceId = (e.target as HTMLSelectElement).value }}
          >
            ${this.devices.length
              ? this.devices.map((d, i) => html`
                  <option value=${d.deviceId} ?selected=${d.deviceId === this.selectedDeviceId}>
                    ${d.label || `Microphone ${i + 1}`}
                  </option>
                `)
              : html`<option value="">Default microphone</option>`
            }
          </select>
        </label>

        <label>
          Gain: ${this.gain.toFixed(2)}
          <input
            type="range" min="0" max="2" step="0.01"
            .value=${String(this.gain)}
            @input=${this.handleGain}
          />
        </label>

        <label>
          Level
          <meter min="0" max="1" low="0.7" high="0.85" optimum="0.4" .value=${this.level}></meter>
        </label>

        ${this.broadcasting
          ? html`<p class="on-air"><span class="on-air-dot"></span>ON AIR</p>`
          : ''}

        <button @click=${this.handleToggle} ?disabled=${this.status === 'connecting...'}>
          ${this.broadcasting ? 'Stop Broadcasting' : 'Start Broadcasting'}
        </button>

        <p>Status: ${this.status}</p>
        ${this.peerId ? html`<p>Room ID: ${this.peerId}</p>` : ''}

        <p>Listeners (${this.peers.length})</p>
        ${this.peers.length
          ? html`<ul>${this.peers.map((id) => html`<li>${id.slice(0, 8)}…</li>`)}</ul>`
          : html`<p>none connected</p>`
        }
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'slipstream-broadcaster': SlipstreamBroadcaster
  }
}
