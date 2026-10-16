import Foundation
import Network
import UIKit
import WebKit

/// Native side of the JS bridge (see game/src/bridge.js), mirroring android/.../NetBridge.java:
///  JS -> native : webkit.messageHandlers.bridge.postMessage(json)
///  native -> JS : window.__nativeEvents([...])
/// TCP frames = 4-byte big-endian length + UTF-8 payload (same as Android, so iOS and Android can play together).
/// LAN discovery uses Bonjour (DNS-SD) service type `_pocketcraft._tcp`, which Android's NsdManager also speaks.
final class NativeBridge: NSObject, WKScriptMessageHandler {
    static let serviceType = "_pocketcraft._tcp"
    static let maxFrame = 32 * 1024 * 1024

    private final class Conn {
        let cid: String
        let connection: NWConnection
        var opened = false
        var closed = false
        init(cid: String, connection: NWConnection) {
            self.cid = cid
            self.connection = connection
        }
    }

    private weak var webView: WKWebView?
    private let netQueue = DispatchQueue(label: "pocketcraft.net")
    private let ioQueue = DispatchQueue(label: "pocketcraft.io")
    private let fileRoot: URL

    // main-thread state
    private var pendingEvents: [[String: Any]] = []
    private var flushScheduled = false
    private var listener: NWListener?
    private var pendingService: NWListener.Service?
    private var advertisedName: String?
    private var conns: [String: Conn] = [:]
    private var acceptSeq = 1
    private var browser: NWBrowser?

    init(webView: WKWebView) {
        self.webView = webView
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        fileRoot = base.appendingPathComponent("PocketCraft", isDirectory: true)
        try? FileManager.default.createDirectory(at: fileRoot, withIntermediateDirectories: true)
        super.init()
    }

    // MARK: - JS entry point (main thread)

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String,
              let data = text.data(using: .utf8),
              let m = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let op = m["op"] as? String else { return }
        let str = { (k: String) -> String in (m[k] as? String) ?? "" }
        let num = { (k: String, def: Int) -> Int in (m[k] as? NSNumber)?.intValue ?? def }
        switch op {
        case "send": send(cid: str("cid"), text: str("data"))
        case "host": host(port: num("port", 19135))
        case "unhost": unhost()
        case "connect": connect(cid: str("cid"), host: str("host"), port: num("port", 19135))
        case "close": close(cid: str("cid"), notify: false)
        case "advertise": advertise(name: str("name"), info: str("info"))
        case "unadvertise": unadvertise()
        case "discover": discover()
        case "undiscover": undiscover()
        case "ip": reply(num("req", 0), NativeBridge.localIP())
        case "keepAwake": UIApplication.shared.isIdleTimerDisabled = (m["on"] as? Bool) ?? false
        case "haptic": UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "fsWrite": fsWrite(req: num("req", 0), path: str("path"), data: str("data"))
        case "fsRead": fsRead(req: num("req", 0), path: str("path"))
        case "fsList": fsList(req: num("req", 0), dir: str("dir"))
        case "fsDelete": fsDelete(req: num("req", 0), path: str("path"))
        default: NSLog("PocketCraft: unknown bridge op %@", op)
        }
    }

    // MARK: - events to JS (batched once per run-loop turn)

    private func emit(_ event: [String: Any]) {
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in self?.emit(event) }
            return
        }
        pendingEvents.append(event)
        if flushScheduled { return }
        flushScheduled = true
        DispatchQueue.main.async { [weak self] in self?.flush() }
    }

    private func flush() {
        flushScheduled = false
        guard !pendingEvents.isEmpty else { return }
        let batch = pendingEvents
        pendingEvents.removeAll()
        guard let data = try? JSONSerialization.data(withJSONObject: batch),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.__nativeEvents&&window.__nativeEvents(\(json))", completionHandler: nil)
    }

    private func reply(_ req: Int, _ value: Any) {
        emit(["ev": "reply", "req": req, "data": value])
    }

    private func replyError(_ req: Int, _ message: String) {
        emit(["ev": "reply", "req": req, "error": message])
    }

    // MARK: - TCP

    private static func tcpParameters() -> NWParameters {
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        tcp.enableKeepalive = true
        let params = NWParameters(tls: nil, tcp: tcp)
        params.allowLocalEndpointReuse = true
        params.includePeerToPeer = false
        return params
    }

    private func host(port: Int) {
        unhost()
        guard let p = NWEndpoint.Port(rawValue: UInt16(clamping: port)) else { return }
        do {
            let l = try NWListener(using: NativeBridge.tcpParameters(), on: p)
            l.newConnectionHandler = { [weak self] nc in
                DispatchQueue.main.async { self?.accept(nc) }
            }
            l.stateUpdateHandler = { state in
                if case .failed(let err) = state { NSLog("PocketCraft: listener failed %@", "\(err)") }
            }
            listener = l
            // start on the next turn so an `advertise` sent right after `host` is applied before starting
            DispatchQueue.main.async { [weak self] in
                guard let self = self, let current = self.listener, current === l else { return }
                if let svc = self.pendingService { current.service = svc }
                current.start(queue: self.netQueue)
            }
        } catch {
            NSLog("PocketCraft: cannot listen on %d: %@", port, "\(error)")
        }
    }

    private func unhost() {
        listener?.cancel()
        listener = nil
        for (cid, _) in conns where cid.hasPrefix("s") { close(cid: cid, notify: false) }
    }

    private func accept(_ nc: NWConnection) {
        let cid = "s\(acceptSeq)"
        acceptSeq += 1
        let c = Conn(cid: cid, connection: nc)
        c.opened = true
        conns[cid] = c
        nc.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed, .cancelled:
                DispatchQueue.main.async { self?.closed(c) }
            default: break
            }
        }
        nc.start(queue: netQueue)
        var addr = "?"
        if case let .hostPort(h, _) = nc.endpoint { addr = "\(h)" }
        emit(["ev": "accept", "cid": cid, "addr": addr])
        receiveFrame(c)
    }

    private func connect(cid: String, host: String, port: Int) {
        let endpoint: NWEndpoint
        if host.hasPrefix("svc:") {
            // a game found through Bonjour: connect to the service directly (no IP needed)
            endpoint = .service(name: String(host.dropFirst(4)), type: NativeBridge.serviceType, domain: "local.", interface: nil)
        } else {
            guard let p = NWEndpoint.Port(rawValue: UInt16(clamping: port)) else {
                emit(["ev": "error", "cid": cid, "msg": "bad port"])
                return
            }
            endpoint = .hostPort(host: NWEndpoint.Host(host.trimmingCharacters(in: .whitespaces)), port: p)
        }
        let nc = NWConnection(to: endpoint, using: NativeBridge.tcpParameters())
        let c = Conn(cid: cid, connection: nc)
        conns[cid] = c
        nc.stateUpdateHandler = { [weak self] state in
            DispatchQueue.main.async {
                guard let self = self else { return }
                switch state {
                case .ready:
                    if !c.opened {
                        c.opened = true
                        self.emit(["ev": "open", "cid": cid])
                        self.receiveFrame(c)
                    }
                case .failed(let err):
                    if c.opened { self.closed(c) } else { self.fail(c, "\(err)") }
                case .cancelled:
                    if c.opened { self.closed(c) }
                default:
                    break
                }
            }
        }
        nc.start(queue: netQueue)
        // .waiting can last forever (e.g. host unreachable or Local Network permission denied)
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            guard let self = self, !c.opened, !c.closed, self.conns[cid] === c else { return }
            self.fail(c, "Timed out. Check that both devices are on the same Wi-Fi and Local Network access is allowed in Settings.")
        }
    }

    private func fail(_ c: Conn, _ message: String) {
        guard !c.closed else { return }
        c.closed = true
        if conns[c.cid] === c { conns.removeValue(forKey: c.cid) }
        c.connection.cancel()
        emit(["ev": "error", "cid": c.cid, "msg": message])
    }

    private func receiveFrame(_ c: Conn) {
        c.connection.receive(minimumIncompleteLength: 4, maximumLength: 4) { [weak self] header, _, _, error in
            guard let self = self else { return }
            guard error == nil, let header = header, header.count == 4 else {
                DispatchQueue.main.async { self.closed(c) }
                return
            }
            let b = [UInt8](header)
            let len = Int(b[0]) << 24 | Int(b[1]) << 16 | Int(b[2]) << 8 | Int(b[3])
            if len < 0 || len > NativeBridge.maxFrame {
                DispatchQueue.main.async { self.closed(c) }
                return
            }
            if len == 0 {
                self.emit(["ev": "msg", "cid": c.cid, "data": ""])
                self.receiveFrame(c)
                return
            }
            self.receiveBody(c, remaining: len, buffer: Data(capacity: len))
        }
    }

    private func receiveBody(_ c: Conn, remaining: Int, buffer: Data) {
        c.connection.receive(minimumIncompleteLength: 1, maximumLength: remaining) { [weak self] chunk, _, _, error in
            guard let self = self else { return }
            guard error == nil, let chunk = chunk, !chunk.isEmpty else {
                DispatchQueue.main.async { self.closed(c) }
                return
            }
            var buf = buffer
            buf.append(chunk)
            if chunk.count < remaining {
                self.receiveBody(c, remaining: remaining - chunk.count, buffer: buf)
                return
            }
            let text = String(decoding: buf, as: UTF8.self)
            self.emit(["ev": "msg", "cid": c.cid, "data": text])
            self.receiveFrame(c)
        }
    }

    private func send(cid: String, text: String) {
        guard let c = conns[cid], !c.closed else { return }
        let payload = Data(text.utf8)
        var frame = Data(capacity: payload.count + 4)
        let n = UInt32(payload.count)
        frame.append(contentsOf: [UInt8(n >> 24 & 0xff), UInt8(n >> 16 & 0xff), UInt8(n >> 8 & 0xff), UInt8(n & 0xff)])
        frame.append(payload)
        c.connection.send(content: frame, completion: .contentProcessed { [weak self] error in
            if error != nil { DispatchQueue.main.async { self?.closed(c) } }
        })
    }

    /// remote side went away
    private func closed(_ c: Conn) {
        guard !c.closed else { return }
        c.closed = true
        if conns[c.cid] === c { conns.removeValue(forKey: c.cid) }
        c.connection.cancel()
        emit(["ev": "close", "cid": c.cid])
    }

    /// closed by JS
    private func close(cid: String, notify: Bool) {
        guard let c = conns.removeValue(forKey: cid) else { return }
        c.closed = true
        c.connection.cancel()
        if notify { emit(["ev": "close", "cid": cid]) }
    }

    // MARK: - Bonjour advertise / browse

    private func advertise(name: String, info: String) {
        let trimmed = String(name.prefix(60))
        let txt = NWTXTRecord(["info": info.count > 200 ? "{}" : info])
        let svc = NWListener.Service(name: trimmed, type: NativeBridge.serviceType, domain: nil, txtRecord: txt.data)
        pendingService = svc
        advertisedName = trimmed
        listener?.service = svc
    }

    private func unadvertise() {
        pendingService = nil
        advertisedName = nil
        listener?.service = nil
    }

    private func discover() {
        undiscover()
        let params = NWParameters()
        params.includePeerToPeer = false
        let b = NWBrowser(for: .bonjourWithTXTRecord(type: NativeBridge.serviceType, domain: nil), using: params)
        b.browseResultsChangedHandler = { [weak self] _, changes in
            DispatchQueue.main.async {
                guard let self = self else { return }
                for change in changes {
                    switch change {
                    case .added(let r): self.found(r)
                    case .changed(old: _, new: let r, flags: _): self.found(r)
                    case .removed(let r):
                        if case let .service(name, _, _, _) = r.endpoint { self.emit(["ev": "lost", "name": name]) }
                    default: break
                    }
                }
            }
        }
        b.stateUpdateHandler = { state in
            if case .failed(let err) = state { NSLog("PocketCraft: browser failed %@", "\(err)") }
        }
        b.start(queue: netQueue)
        browser = b
    }

    private func found(_ r: NWBrowser.Result) {
        guard case let .service(name, _, _, _) = r.endpoint else { return }
        if let mine = advertisedName, mine == name, listener != nil { return }
        var info = "{}"
        if case let .bonjour(txt) = r.metadata, let v = txt["info"] { info = v }
        emit(["ev": "found", "name": name, "host": "svc:" + name, "port": 0, "info": info])
    }

    private func undiscover() {
        browser?.cancel()
        browser = nil
    }

    static func localIP() -> String {
        var fallback = "?"
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return fallback }
        defer { freeifaddrs(ifaddr) }
        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let ifa = ptr.pointee
            guard let sa = ifa.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET) else { continue }
            let name = String(cString: ifa.ifa_name)
            var hostBuf = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(sa, socklen_t(sa.pointee.sa_len), &hostBuf, socklen_t(hostBuf.count), nil, 0, NI_NUMERICHOST) != 0 { continue }
            let ip = String(cString: hostBuf)
            if name == "en0" { return ip }
            if fallback == "?" && (name.hasPrefix("en") || name.hasPrefix("bridge")) { fallback = ip }
        }
        return fallback
    }

    // MARK: - storage (Application Support/PocketCraft)

    private func resolve(_ path: String) -> URL? {
        let url = fileRoot.appendingPathComponent(path).standardizedFileURL
        guard url.path.hasPrefix(fileRoot.standardizedFileURL.path) else { return nil }
        return url
    }

    private func fsWrite(req: Int, path: String, data: String) {
        guard let url = resolve(path) else { replyError(req, "bad path"); return }
        ioQueue.async { [weak self] in
            do {
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try Data(data.utf8).write(to: url, options: .atomic)
                self?.reply(req, true)
            } catch {
                self?.replyError(req, "\(error.localizedDescription)")
            }
        }
    }

    private func fsRead(req: Int, path: String) {
        guard let url = resolve(path) else { replyError(req, "bad path"); return }
        ioQueue.async { [weak self] in
            if let d = try? Data(contentsOf: url) {
                self?.reply(req, String(decoding: d, as: UTF8.self))
            } else {
                self?.reply(req, NSNull())
            }
        }
    }

    private func fsList(req: Int, dir: String) {
        guard let url = resolve(dir) else { replyError(req, "bad path"); return }
        let names = (try? FileManager.default.contentsOfDirectory(atPath: url.path)) ?? []
        reply(req, names.filter { !$0.hasPrefix(".") })
    }

    private func fsDelete(req: Int, path: String) {
        guard let url = resolve(path) else { replyError(req, "bad path"); return }
        try? FileManager.default.removeItem(at: url)
        reply(req, true)
    }
}
