/**
 * Прямой канал между устройствами пользователя (WebRTC DataChannel) — см. docs/adr/0001.
 * Сервер нужен только чтобы договориться о соединении (сигналы идут командами `signal`
 * через /api/devices/*), дальше команды и состояние ходят напрямую за десятки миллисекунд.
 * Нет канала (строгий NAT, iOS усыпил вкладку) — вызывающий шлёт через сервер, как раньше.
 */

/** Что устройства шлют друг другу по каналу */
export type LinkMessage =
  /** Кто я и что играю (рассылается при изменении и периодически — заодно «я жив») */
  | { t: 'hello', name: string, kind: DeviceKind, state: DeviceState | null }
  | { t: 'cmd', cmd: DeviceCommand }
  /** Здесь пошёл звук (`at` — по часам сервера): остальные затихают — играет одно устройство */
  | { t: 'claim', at: number }
  /** Перенос сюда не начался: браузер заблокировал автозапуск, нужно нажать «Играть» здесь */
  | { t: 'blocked' }

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
/** Ждём сбора ICE-кандидатов не дольше — потом шлём SDP с тем, что есть (без trickle: меньше обменов через опрос) */
const GATHER_MS = 2000
/** Ответа на offer нет столько — бросаем попытку (повторим при следующей синхронизации) */
const CONNECT_TIMEOUT_MS = 20_000
/** Ни одного сообщения столько — канал считается мёртвым */
const SILENCE_MS = 20_000

interface Peer {
  pc: RTCPeerConnection
  channel: RTCDataChannel | null
  createdAt: number
  lastHeard: number
}

export interface DeviceLink {
  /** Поддерживать соединения с этими устройствами (остальные закрыть не обязаны — живые каналы держим) */
  ensure: (ids: string[]) => void
  /** Пришёл сигнал от устройства `from` (через сервер) */
  handleSignal: (from: string, data: SignalData) => void
  /** Отправить по каналу. false — канала нет, шлите через сервер. */
  send: (to: string, msg: LinkMessage) => boolean
  broadcast: (msg: LinkMessage) => void
  /** Устройства с открытым каналом */
  open: Readonly<Ref<ReadonlySet<string>>>
  /** Есть ли соединения, которые ещё договариваются (тогда опрашиваем сервер чаще) */
  pending: () => boolean
  close: () => void
}

export function createDeviceLink(opts: {
  selfId: () => string
  sendSignal: (to: string, data: SignalData) => Promise<unknown>
  onMessage: (from: string, msg: LinkMessage) => void
  /** Канал открылся — самое время представиться */
  onOpen: (id: string) => void
  /** Канал закрылся (или не открылся) — вернуться к частому опросу */
  onClose: (id: string) => void
}): DeviceLink {
  const peers = new Map<string, Peer>()
  const open = shallowRef<ReadonlySet<string>>(new Set())
  const supported = typeof RTCPeerConnection !== 'undefined'
  const pruneTimer = supported ? setInterval(prune, 5000) : undefined

  function refreshOpen() {
    const s = new Set<string>()
    for (const [id, p] of peers) if (p.channel?.readyState === 'open') s.add(id)
    const was = open.value
    open.value = s
    for (const id of was) if (!s.has(id)) opts.onClose(id)
  }

  function drop(id: string) {
    const p = peers.get(id)
    if (!p) return
    peers.delete(id)
    try {
      p.channel?.close()
      p.pc.close()
    }
    catch {}
    refreshOpen()
  }

  function wire(id: string, channel: RTCDataChannel) {
    const p = peers.get(id)
    if (!p) return
    p.channel = channel
    const opened = () => {
      p.lastHeard = Date.now()
      refreshOpen()
      opts.onOpen(id)
    }
    // У принимающей стороны канал может прийти уже открытым — тогда onopen не будет.
    if (channel.readyState === 'open') queueMicrotask(opened)
    else channel.onopen = opened
    channel.onclose = () => {
      if (peers.get(id) === p) drop(id)
    }
    channel.onmessage = (e) => {
      p.lastHeard = Date.now()
      try {
        opts.onMessage(id, JSON.parse(String(e.data)))
      }
      catch {}
    }
  }

  function create(id: string): Peer {
    drop(id)
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const p: Peer = { pc, channel: null, createdAt: Date.now(), lastHeard: Date.now() }
    peers.set(id, p)
    pc.onconnectionstatechange = () => {
      if ((pc.connectionState === 'failed' || pc.connectionState === 'closed') && peers.get(id) === p) drop(id)
    }
    pc.ondatachannel = e => wire(id, e.channel)
    return p
  }

  /** SDP после сбора кандидатов (или по таймауту — с тем, что успели собрать) */
  function gathered(pc: RTCPeerConnection): Promise<RTCSessionDescription | null> {
    return new Promise((resolve) => {
      const done = () => resolve(pc.localDescription)
      if (pc.iceGatheringState === 'complete') return done()
      const t = setTimeout(done, GATHER_MS)
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(t)
          done()
        }
      })
    })
  }

  async function connect(id: string) {
    const p = create(id)
    try {
      wire(id, p.pc.createDataChannel('connect', { ordered: true }))
      await p.pc.setLocalDescription(await p.pc.createOffer())
      const desc = await gathered(p.pc)
      if (desc && peers.get(id) === p) await opts.sendSignal(id, { kind: 'offer', sdp: desc.sdp })
    }
    catch {
      if (peers.get(id) === p) drop(id)
    }
  }

  async function accept(id: string, sdp: string) {
    const p = create(id)
    try {
      await p.pc.setRemoteDescription({ type: 'offer', sdp })
      await p.pc.setLocalDescription(await p.pc.createAnswer())
      const desc = await gathered(p.pc)
      if (desc && peers.get(id) === p) await opts.sendSignal(id, { kind: 'answer', sdp: desc.sdp })
    }
    catch {
      if (peers.get(id) === p) drop(id)
    }
  }

  function prune() {
    const now = Date.now()
    for (const [id, p] of peers) {
      const isOpen = p.channel?.readyState === 'open'
      if (isOpen ? now - p.lastHeard > SILENCE_MS : now - p.createdAt > CONNECT_TIMEOUT_MS) drop(id)
    }
  }

  return {
    ensure(ids) {
      if (!supported) return
      prune()
      const self = opts.selfId()
      for (const id of ids) {
        // Соединение начинает устройство с меньшим id — чтобы не было встречных offer.
        if (id === self || peers.has(id) || self > id) continue
        void connect(id)
      }
    },
    handleSignal(from, data) {
      if (!supported) return
      if (data.kind === 'offer') void accept(from, data.sdp)
      else if (data.kind === 'answer') {
        const p = peers.get(from)
        if (p && p.pc.signalingState === 'have-local-offer') p.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }).catch(() => drop(from))
      }
    },
    send(to, msg) {
      const ch = peers.get(to)?.channel
      if (ch?.readyState !== 'open') return false
      try {
        ch.send(JSON.stringify(msg))
        return true
      }
      catch {
        return false
      }
    },
    broadcast(msg) {
      const raw = JSON.stringify(msg)
      for (const p of peers.values()) {
        if (p.channel?.readyState === 'open') {
          try {
            p.channel.send(raw)
          }
          catch {}
        }
      }
    },
    open,
    pending: () => [...peers.values()].some(p => p.channel?.readyState !== 'open'),
    close() {
      clearInterval(pruneTimer)
      for (const id of [...peers.keys()]) drop(id)
    },
  }
}
