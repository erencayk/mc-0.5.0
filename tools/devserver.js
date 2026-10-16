// Development server: serves www/ and provides a WebSocket relay at /relay that emulates the
// native LAN bridge (host / connect / discover) so multiplayer can be tested in desktop browsers.
//   node tools/devserver.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = +(process.argv[2] || process.env.PORT || 8080);
const ROOT = path.join(__dirname, '..', 'www');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.map': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/relay' });
let nextHost = 1;
const hosts = new Map();   // hostKey -> {ws, port, name, info}
const conns = new Map();   // cid -> {client ws, host ws}
const browsers = new Set();

function send(ws, o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }

wss.on('connection', (ws, req) => {
  ws.hostKey = null;
  const ip = (req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
  ws.on('message', (buf) => {
    let m; try { m = JSON.parse(buf); } catch (e) { return; }
    switch (m.op) {
      case 'host': ws.hostKey = 'h' + (nextHost++); hosts.set(ws.hostKey, { ws, port: m.port, name: null, info: {} }); break;
      case 'unhost': if (ws.hostKey) { hosts.delete(ws.hostKey); ws.hostKey = null; } break;
      case 'advertise': {
        const h = hosts.get(ws.hostKey); if (!h) break;
        h.name = m.name; h.info = m.info;
        for (const b of browsers) send(b, { ev: 'found', name: m.name, host: ws.hostKey, port: m.port, info: m.info });
        break;
      }
      case 'unadvertise': { const h = hosts.get(ws.hostKey); if (h && h.name) for (const b of browsers) send(b, { ev: 'lost', name: h.name }); break; }
      case 'discover':
        browsers.add(ws);
        for (const [k, h] of hosts) if (h.name && h.ws !== ws) send(ws, { ev: 'found', name: h.name, host: k, port: h.port, info: h.info });
        break;
      case 'undiscover': browsers.delete(ws); break;
      case 'ip': send(ws, { ev: 'ip', ip: ws.hostKey || ip }); break;
      case 'connect': {
        // host may be a hostKey ("h1") or anything else -> first host
        let h = hosts.get(m.host);
        if (!h) h = [...hosts.values()][0];
        if (!h) { send(ws, { ev: 'error', cid: m.cid, msg: 'no host' }); break; }
        conns.set(m.cid, { client: ws, host: h.ws });
        send(h.ws, { ev: 'accept', cid: m.cid, addr: ip });
        send(ws, { ev: 'open', cid: m.cid });
        break;
      }
      case 'send': {
        const c = conns.get(m.cid); if (!c) break;
        send(ws === c.client ? c.host : c.client, { ev: 'msg', cid: m.cid, data: m.data });
        break;
      }
      case 'close': {
        const c = conns.get(m.cid); if (!c) break;
        conns.delete(m.cid);
        send(ws === c.client ? c.host : c.client, { ev: 'close', cid: m.cid });
        break;
      }
    }
  });
  ws.on('close', () => {
    browsers.delete(ws);
    if (ws.hostKey) { const h = hosts.get(ws.hostKey); if (h && h.name) for (const b of browsers) send(b, { ev: 'lost', name: h.name }); hosts.delete(ws.hostKey); }
    for (const [cid, c] of conns) if (c.client === ws || c.host === ws) { conns.delete(cid); send(c.client === ws ? c.host : c.client, { ev: 'close', cid }); }
  });
});

server.listen(PORT, () => console.log(`PocketCraft dev server on http://localhost:${PORT}`));
