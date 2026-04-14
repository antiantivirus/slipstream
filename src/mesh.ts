import Peer, { type DataConnection, type MediaConnection } from 'peerjs'

export type MeshRole = 'broadcaster' | 'listener'

export interface MeshEvents {
  onPeerConnected: (peerId: string) => void
  onPeerDisconnected: (peerId: string) => void
  onStream: (stream: MediaStream) => void
  onError: (err: Error) => void
  onReady: (peerId: string) => void
}

interface PeerState {
  data: DataConnection | null
  media: MediaConnection | null
}

/**
 * Simple mesh network — all peers connect to each other directly.
 * The broadcaster streams audio to every connected listener.
 */
export class RadioMesh {
  private peer: Peer
  private peers = new Map<string, PeerState>()
  private localStream: MediaStream | null = null
  private role: MeshRole

  constructor(
    role: MeshRole,
    private events: MeshEvents,
    peerId?: string,
  ) {
    this.role = role
    this.peer = peerId ? new Peer(peerId) : new Peer()

    this.peer.on('open', (id) => {
      events.onReady(id)
    })

    this.peer.on('error', (err) => {
      events.onError(err)
    })

    // Incoming media call (listener receives this from broadcaster)
    this.peer.on('call', (call) => {
      call.answer()
      call.on('stream', (stream) => {
        this.events.onStream(stream)
      })
      call.on('close', () => {
        this.events.onPeerDisconnected(call.peer)
      })
    })

    // Incoming data connection
    this.peer.on('connection', (conn) => {
      this.registerPeer(conn.peer, conn, null)
      conn.on('close', () => {
        this.peers.delete(conn.peer)
        this.events.onPeerDisconnected(conn.peer)
      })
      if (this.role === 'broadcaster' && this.localStream) {
        this.callPeer(conn.peer)
      }
    })
  }

  get id(): string | null {
    return this.peer.id ?? null
  }

  get connectedPeers(): string[] {
    return [...this.peers.keys()]
  }

  /** Broadcaster: start capturing audio and stream to all connected peers */
  async startBroadcast(): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    // Call any peers that connected before broadcast started
    for (const id of this.peers.keys()) {
      this.callPeer(id)
    }
    return this.localStream
  }

  /** Listener: connect to a broadcaster (or any peer) by their peer ID */
  connectToPeer(remotePeerId: string): void {
    if (this.peers.has(remotePeerId)) return

    const conn = this.peer.connect(remotePeerId, { reliable: true })

    conn.on('open', () => {
      this.registerPeer(remotePeerId, conn, null)

      // If broadcaster, immediately call this new peer with the stream
      if (this.role === 'broadcaster' && this.localStream) {
        this.callPeer(remotePeerId)
      }
    })

    conn.on('close', () => {
      this.peers.delete(remotePeerId)
      this.events.onPeerDisconnected(remotePeerId)
    })
  }

  private callPeer(remotePeerId: string): void {
    if (!this.localStream) return
    const call = this.peer.call(remotePeerId, this.localStream)
    const state = this.peers.get(remotePeerId)
    if (state) state.media = call
  }

  private registerPeer(id: string, data: DataConnection, media: MediaConnection | null): void {
    this.peers.set(id, { data, media })
    this.events.onPeerConnected(id)
  }

  destroy(): void {
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.peer.destroy()
    this.peers.clear()
  }
}
