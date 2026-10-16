package com.pocketcraft.pe050;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native side of the JS bridge (see game/src/bridge.js).
 * JS -> native: AndroidBridge.postMessage(json)   native -> JS: window.__nativeEvents([...])
 * TCP frames are a 4-byte big-endian length followed by UTF-8 text, identical to the iOS side.
 */
public class NetBridge {
    private static final String TAG = "PocketCraft";
    private static final String SERVICE_TYPE = "_pocketcraft._tcp";
    private static final int MAX_FRAME = 32 * 1024 * 1024;

    private final Context ctx;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newCachedThreadPool();
    private final File root;

    private final StringBuilder pending = new StringBuilder();
    private boolean flushScheduled = false;

    private ServerSocket server;
    private final Map<String, Conn> conns = new ConcurrentHashMap<String, Conn>();
    private int acceptSeq = 1;

    private NsdManager nsd;
    private NsdManager.RegistrationListener regListener;
    private NsdManager.DiscoveryListener discListener;
    private WifiManager.MulticastLock mcastLock;
    private final LinkedList<NsdServiceInfo> resolveQueue = new LinkedList<NsdServiceInfo>();
    private boolean resolving = false;
    private String advertisedName = null;

    public NetBridge(Context ctx, WebView web) {
        this.ctx = ctx;
        this.web = web;
        this.root = ctx.getFilesDir();
    }

    // ------------------------------------------------------------------ JS entry point
    @JavascriptInterface
    public void postMessage(String json) {
        try {
            JSONObject m = new JSONObject(json);
            String op = m.optString("op", "");
            if (op.equals("send")) { send(m.optString("cid", ""), m.optString("data", "")); return; }
            if (op.equals("host")) { host(m.optInt("port", 19135)); return; }
            if (op.equals("unhost")) { unhost(); return; }
            if (op.equals("connect")) { connect(m.optString("cid", ""), m.optString("host", ""), m.optInt("port", 19135)); return; }
            if (op.equals("close")) { close(m.optString("cid", ""), false); return; }
            if (op.equals("advertise")) { advertise(m.optString("name", "PocketCraft"), m.optInt("port", 19135), m.optString("info", "{}")); return; }
            if (op.equals("unadvertise")) { unadvertise(); return; }
            if (op.equals("discover")) { discover(); return; }
            if (op.equals("undiscover")) { undiscover(); return; }
            if (op.equals("ip")) { reply(m.optInt("req", 0), quote(localIp())); return; }
            if (op.equals("keepAwake")) {
                final boolean on = m.optBoolean("on", false);
                main.post(new Runnable() { public void run() { web.setKeepScreenOn(on); } });
                return;
            }
            if (op.equals("haptic")) {
                main.post(new Runnable() { public void run() { web.performHapticFeedback(1 /* VIRTUAL_KEY */); } });
                return;
            }
            if (op.equals("fsWrite")) { fsWrite(m.optInt("req", 0), m.optString("path", ""), m.optString("data", "")); return; }
            if (op.equals("fsRead")) { fsRead(m.optInt("req", 0), m.optString("path", "")); return; }
            if (op.equals("fsList")) { fsList(m.optInt("req", 0), m.optString("dir", "")); return; }
            if (op.equals("fsDelete")) { fsDelete(m.optInt("req", 0), m.optString("path", "")); return; }
            Log.d(TAG, "unknown op " + op);
        } catch (Exception e) {
            Log.e(TAG, "bridge error", e);
        }
    }

    // ------------------------------------------------------------------ events to JS (batched per frame)
    private void emit(String eventJson) {
        synchronized (pending) {
            if (pending.length() > 0) pending.append(',');
            pending.append(eventJson);
            if (flushScheduled) return;
            flushScheduled = true;
        }
        main.post(new Runnable() {
            public void run() {
                String batch;
                synchronized (pending) {
                    batch = pending.toString();
                    pending.setLength(0);
                    flushScheduled = false;
                }
                web.evaluateJavascript("window.__nativeEvents&&window.__nativeEvents([" + batch + "])", null);
            }
        });
    }

    private void event(String ev, String cid, String extraKey, String extraJson) {
        StringBuilder b = new StringBuilder(64);
        b.append("{\"ev\":").append(quote(ev));
        if (cid != null) b.append(",\"cid\":").append(quote(cid));
        if (extraKey != null) b.append(",\"").append(extraKey).append("\":").append(extraJson);
        b.append('}');
        emit(b.toString());
    }

    private void reply(int req, String dataJson) {
        emit("{\"ev\":\"reply\",\"req\":" + req + ",\"data\":" + dataJson + "}");
    }

    private void replyError(int req, String msg) {
        emit("{\"ev\":\"reply\",\"req\":" + req + ",\"error\":" + quote(msg) + "}");
    }

    static String quote(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder(s.length() + 16);
        b.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                case ' ': b.append("\\u2028"); break;
                case ' ': b.append("\\u2029"); break;
                default:
                    if (c < 0x20) { b.append(String.format("\\u%04x", (int) c)); }
                    else b.append(c);
            }
        }
        b.append('"');
        return b.toString();
    }

    // ------------------------------------------------------------------ TCP
    private class Conn {
        final String cid;
        final Socket sock;
        final DataOutputStream out;
        final ExecutorService writer = Executors.newSingleThreadExecutor();
        volatile boolean closed = false;

        Conn(String cid, Socket sock) throws IOException {
            this.cid = cid;
            this.sock = sock;
            sock.setTcpNoDelay(true);
            sock.setKeepAlive(true);
            this.out = new DataOutputStream(new BufferedOutputStream(sock.getOutputStream(), 65536));
        }

        void startReading() {
            io.execute(new Runnable() {
                public void run() {
                    try {
                        DataInputStream in = new DataInputStream(new BufferedInputStream(sock.getInputStream(), 65536));
                        while (!closed) {
                            int len = in.readInt();
                            if (len < 0 || len > MAX_FRAME) throw new IOException("bad frame " + len);
                            byte[] buf = new byte[len];
                            in.readFully(buf);
                            event("msg", cid, "data", quote(new String(buf, "UTF-8")));
                        }
                    } catch (Exception e) {
                        // fallthrough to close
                    }
                    close(cid, true);
                }
            });
        }

        void send(final String data) {
            if (closed) return;
            writer.execute(new Runnable() {
                public void run() {
                    try {
                        byte[] b = data.getBytes("UTF-8");
                        out.writeInt(b.length);
                        out.write(b);
                        out.flush();
                    } catch (Exception e) {
                        close(cid, true);
                    }
                }
            });
        }

        void shut() {
            closed = true;
            try { sock.close(); } catch (Exception e) { /* ignore */ }
            writer.shutdown();
        }
    }

    private void host(final int port) {
        unhost();
        io.execute(new Runnable() {
            public void run() {
                try {
                    ServerSocket ss = new ServerSocket();
                    ss.setReuseAddress(true);
                    ss.bind(new InetSocketAddress(port));
                    server = ss;
                    Log.d(TAG, "hosting on " + port);
                    while (!ss.isClosed()) {
                        Socket s = ss.accept();
                        String cid = "s" + (acceptSeq++);
                        Conn c = new Conn(cid, s);
                        conns.put(cid, c);
                        String addr = s.getInetAddress() != null ? s.getInetAddress().getHostAddress() : "?";
                        event("accept", cid, "addr", quote(addr));
                        c.startReading();
                    }
                } catch (Exception e) {
                    Log.d(TAG, "server stopped: " + e);
                }
            }
        });
    }

    private void unhost() {
        ServerSocket ss = server;
        server = null;
        if (ss != null) { try { ss.close(); } catch (Exception e) { /* ignore */ } }
        for (Conn c : new ArrayList<Conn>(conns.values())) if (c.cid.startsWith("s")) close(c.cid, false);
    }

    private void connect(final String cid, final String host, final int port) {
        io.execute(new Runnable() {
            public void run() {
                try {
                    Socket s = new Socket();
                    s.connect(new InetSocketAddress(host, port), 6000);
                    Conn c = new Conn(cid, s);
                    conns.put(cid, c);
                    event("open", cid, null, null);
                    c.startReading();
                } catch (Exception e) {
                    event("error", cid, "msg", quote(String.valueOf(e.getMessage())));
                }
            }
        });
    }

    private void send(String cid, String data) {
        Conn c = conns.get(cid);
        if (c != null) c.send(data);
    }

    private void close(String cid, boolean notify) {
        Conn c = conns.remove(cid);
        if (c == null) return;
        c.shut();
        if (notify) event("close", cid, null, null);
    }

    // ------------------------------------------------------------------ LAN discovery (mDNS / DNS-SD, interoperates with iOS Bonjour)
    private NsdManager nsd() {
        if (nsd == null) nsd = (NsdManager) ctx.getSystemService(Context.NSD_SERVICE);
        return nsd;
    }

    private void lockMulticast(boolean on) {
        try {
            if (on) {
                if (mcastLock == null) {
                    WifiManager wm = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    mcastLock = wm.createMulticastLock("pocketcraft");
                    mcastLock.setReferenceCounted(false);
                }
                mcastLock.acquire();
            } else if (mcastLock != null && mcastLock.isHeld()) {
                mcastLock.release();
            }
        } catch (Exception e) {
            Log.d(TAG, "multicast lock: " + e);
        }
    }

    private void advertise(String name, int port, String info) {
        unadvertise();
        try {
            NsdServiceInfo si = new NsdServiceInfo();
            String safe = name.length() > 60 ? name.substring(0, 60) : name;
            si.setServiceName(safe);
            si.setServiceType(SERVICE_TYPE);
            si.setPort(port);
            si.setAttribute("info", info.length() > 200 ? "{}" : info);
            regListener = new NsdManager.RegistrationListener() {
                public void onRegistrationFailed(NsdServiceInfo s, int err) { Log.d(TAG, "register failed " + err); }
                public void onUnregistrationFailed(NsdServiceInfo s, int err) { }
                public void onServiceRegistered(NsdServiceInfo s) { advertisedName = s.getServiceName(); }
                public void onServiceUnregistered(NsdServiceInfo s) { }
            };
            nsd().registerService(si, NsdManager.PROTOCOL_DNS_SD, regListener);
        } catch (Exception e) {
            Log.e(TAG, "advertise", e);
        }
    }

    private void unadvertise() {
        if (regListener != null) {
            try { nsd().unregisterService(regListener); } catch (Exception e) { /* ignore */ }
            regListener = null;
        }
        advertisedName = null;
    }

    private void discover() {
        undiscover();
        lockMulticast(true);
        discListener = new NsdManager.DiscoveryListener() {
            public void onStartDiscoveryFailed(String t, int err) { Log.d(TAG, "discovery failed " + err); }
            public void onStopDiscoveryFailed(String t, int err) { }
            public void onDiscoveryStarted(String t) { }
            public void onDiscoveryStopped(String t) { }
            public void onServiceFound(NsdServiceInfo s) {
                if (advertisedName != null && advertisedName.equals(s.getServiceName())) return; // ourselves
                synchronized (resolveQueue) { resolveQueue.add(s); }
                resolveNext();
            }
            public void onServiceLost(NsdServiceInfo s) { event("lost", null, "name", quote(s.getServiceName())); }
        };
        try {
            nsd().discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discListener);
        } catch (Exception e) {
            Log.e(TAG, "discover", e);
        }
    }

    // NsdManager can only resolve one service at a time
    private void resolveNext() {
        NsdServiceInfo next;
        synchronized (resolveQueue) {
            if (resolving || resolveQueue.isEmpty()) return;
            next = resolveQueue.removeFirst();
            resolving = true;
        }
        try {
            nsd().resolveService(next, new NsdManager.ResolveListener() {
                public void onResolveFailed(NsdServiceInfo s, int err) { done(); }
                public void onServiceResolved(NsdServiceInfo s) {
                    InetAddress a = s.getHost();
                    if (a != null) {
                        String info = "{}";
                        try {
                            Map<String, byte[]> attrs = s.getAttributes();
                            if (attrs != null && attrs.get("info") != null) info = new String(attrs.get("info"), "UTF-8");
                        } catch (Exception e) { /* ignore */ }
                        emit("{\"ev\":\"found\",\"name\":" + quote(s.getServiceName()) + ",\"host\":" + quote(a.getHostAddress())
                                + ",\"port\":" + s.getPort() + ",\"info\":" + quote(info) + "}");
                    }
                    done();
                }
                void done() {
                    synchronized (resolveQueue) { resolving = false; }
                    resolveNext();
                }
            });
        } catch (Exception e) {
            synchronized (resolveQueue) { resolving = false; }
        }
    }

    private void undiscover() {
        if (discListener != null) {
            try { nsd().stopServiceDiscovery(discListener); } catch (Exception e) { /* ignore */ }
            discListener = null;
        }
        synchronized (resolveQueue) { resolveQueue.clear(); resolving = false; }
        lockMulticast(false);
    }

    static String localIp() {
        String fallback = "?";
        try {
            Enumeration<NetworkInterface> ifs = NetworkInterface.getNetworkInterfaces();
            while (ifs != null && ifs.hasMoreElements()) {
                NetworkInterface ni = ifs.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                Enumeration<InetAddress> as = ni.getInetAddresses();
                while (as.hasMoreElements()) {
                    InetAddress a = as.nextElement();
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    String ip = a.getHostAddress();
                    String n = ni.getName();
                    if (n.startsWith("wlan") || n.startsWith("ap") || n.startsWith("swlan")) return ip;
                    if (a.isSiteLocalAddress()) fallback = ip;
                }
            }
        } catch (Exception e) { /* ignore */ }
        return fallback;
    }

    // ------------------------------------------------------------------ storage (app-private files)
    private File file(String path) throws IOException {
        File f = new File(root, path);
        if (!f.getCanonicalPath().startsWith(root.getCanonicalPath())) throw new IOException("bad path");
        return f;
    }

    private void fsWrite(final int req, final String path, final String data) {
        io.execute(new Runnable() {
            public void run() {
                try {
                    File f = file(path);
                    File dir = f.getParentFile();
                    if (dir != null && !dir.exists()) dir.mkdirs();
                    File tmp = new File(f.getPath() + ".tmp");
                    FileOutputStream o = new FileOutputStream(tmp);
                    try { o.write(data.getBytes("UTF-8")); } finally { o.close(); }
                    if (f.exists() && !f.delete()) throw new IOException("cannot replace " + path);
                    if (!tmp.renameTo(f)) throw new IOException("rename failed");
                    reply(req, "true");
                } catch (Exception e) {
                    replyError(req, String.valueOf(e.getMessage()));
                }
            }
        });
    }

    private void fsRead(final int req, final String path) {
        io.execute(new Runnable() {
            public void run() {
                try {
                    File f = file(path);
                    if (!f.exists()) { reply(req, "null"); return; }
                    byte[] buf = new byte[(int) f.length()];
                    FileInputStream in = new FileInputStream(f);
                    try {
                        int off = 0;
                        while (off < buf.length) { int n = in.read(buf, off, buf.length - off); if (n < 0) break; off += n; }
                    } finally { in.close(); }
                    reply(req, quote(new String(buf, "UTF-8")));
                } catch (Exception e) {
                    replyError(req, String.valueOf(e.getMessage()));
                }
            }
        });
    }

    private void fsList(int req, String dir) {
        try {
            File d = file(dir);
            StringBuilder b = new StringBuilder("[");
            String[] names = d.list();
            if (names != null) {
                boolean first = true;
                for (String n : names) {
                    if (n.endsWith(".tmp")) continue;
                    if (!first) b.append(',');
                    b.append(quote(n));
                    first = false;
                }
            }
            b.append(']');
            reply(req, b.toString());
        } catch (Exception e) {
            replyError(req, String.valueOf(e.getMessage()));
        }
    }

    private void fsDelete(int req, String path) {
        try {
            File f = file(path);
            if (f.exists()) f.delete();
            reply(req, "true");
        } catch (Exception e) {
            replyError(req, String.valueOf(e.getMessage()));
        }
    }

    public void shutdown() {
        undiscover();
        unadvertise();
        unhost();
        for (String cid : new ArrayList<String>(conns.keySet())) close(cid, false);
        io.shutdownNow();
    }
}
