"""End-to-end smoke test for mcproxy.

Stands up a fake bot control API, launches the real compiled proxy against it,
and speaks enough of the Minecraft protocol from a raw socket to check the
server-list ping on both the modern and the pre-1.7 paths.
"""
import json
import os
import socket
import socketserver
import struct
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

TOKEN = "smoke-token"
SOCKET_PATH = "/tmp/mcproxy-smoke.sock"
PROXY_PORT = 47565

CONFIG = {
    "listenPort": PROXY_PORT,
    "publicHost": "mc.example.com",
    "maxPlayers": 42,
    "motd": "§bSmoke Hub§r\n§7join to start",
    "linkTtlSeconds": 300,
    "voteChannelConfigured": True,
    "servers": [
        {
            "id": 1,
            "tag": "Survival",
            "host": "127.0.0.1",
            "port": 47566,
            "online": False,
            "forwarding": "bungeecord",
            "forwardingSecret": None,
        }
    ],
}

hits = []


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _auth(self):
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b'{"error":"unauthorized"}')
            return False
        return True

    def do_GET(self):
        if not self._auth():
            return
        hits.append(("GET", self.path))
        if self.path == "/config":
            body = json.dumps(CONFIG).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()


def varint(v):
    out = b""
    v &= 0xFFFFFFFF
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out += bytes([b | 0x80])
        else:
            out += bytes([b])
            return out


def read_varint(sock):
    num = 0
    for i in range(5):
        b = sock.recv(1)
        if not b:
            raise EOFError("socket closed while reading varint")
        num |= (b[0] & 0x7F) << (7 * i)
        if not b[0] & 0x80:
            return num
    raise ValueError("varint too long")


def read_exact(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise EOFError("socket closed")
        buf += chunk
    return buf


def packet(pid, payload):
    body = varint(pid) + payload
    return varint(len(body)) + body


def mc_string(s):
    raw = s.encode()
    return varint(len(raw)) + raw


def modern_ping(protocol_version):
    s = socket.create_connection(("127.0.0.1", PROXY_PORT), timeout=5)
    hs = varint(protocol_version) + mc_string("survival.example.com") + struct.pack(">H", PROXY_PORT) + varint(1)
    s.sendall(packet(0x00, hs))
    s.sendall(packet(0x00, b""))

    read_varint(s)  # frame length
    pid = read_varint(s)
    assert pid == 0x00, f"expected status response, got 0x{pid:02x}"
    slen = read_varint(s)
    payload = json.loads(read_exact(s, slen).decode())

    nonce = 0x0123456789ABCDEF
    s.sendall(packet(0x01, struct.pack(">q", nonce)))
    read_varint(s)
    pid = read_varint(s)
    assert pid == 0x01, f"expected pong, got 0x{pid:02x}"
    got = struct.unpack(">q", read_exact(s, 8))[0]
    assert got == nonce, f"pong nonce {got} != {nonce}"
    s.close()
    return payload


def legacy_ping():
    s = socket.create_connection(("127.0.0.1", PROXY_PORT), timeout=5)
    s.sendall(b"\xfe\x01")
    data = s.recv(4096)
    s.close()
    assert data[0] == 0xFF, f"expected 0xFF kick packet, got 0x{data[0]:02x}"
    (length,) = struct.unpack(">H", data[1:3])
    text = data[3 : 3 + length * 2].decode("utf-16-be")
    return text


def main():
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)

    class UnixHTTPServer(HTTPServer):
        address_family = socket.AF_UNIX

        def server_bind(self):
            # HTTPServer.server_bind wants a host/port pair for the Host header.
            socketserver.TCPServer.server_bind(self)
            self.server_name = "mcproxy.ipc"
            self.server_port = 0

    httpd = UnixHTTPServer(SOCKET_PATH, Handler)
    os.chmod(SOCKET_PATH, 0o600)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    proc = subprocess.Popen(
        [sys.argv[1]],
        env={
            "MC_PROXY_IPC_PATH": SOCKET_PATH,
            "MC_PROXY_TOKEN": TOKEN,
            "MC_PROXY_LISTEN_PORT": str(PROXY_PORT),
            "MC_PROXY_BIND": "127.0.0.1",
            "MC_PROXY_LOG_LEVEL": "debug",
            "PATH": "/usr/bin:/bin",
        },
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        deadline = time.time() + 15
        while time.time() < deadline:
            try:
                socket.create_connection(("127.0.0.1", PROXY_PORT), timeout=1).close()
                break
            except OSError:
                time.sleep(0.2)
        else:
            raise SystemExit("proxy never started listening")

        failures = []

        for proto, label in ((767, "1.21"), (47, "1.8"), (4, "1.7.2")):
            payload = modern_ping(proto)
            if payload["version"]["protocol"] != proto:
                failures.append(f"{label}: protocol echo was {payload['version']['protocol']}")
            if payload["players"]["max"] != 42:
                failures.append(f"{label}: maxPlayers was {payload['players']['max']}")
            if payload["players"]["sample"] != []:
                failures.append(f"{label}: sample was {payload['players']['sample']!r}")
            desc = json.dumps(payload["description"])
            if "Smoke Hub" not in desc:
                failures.append(f"{label}: MOTD missing from {desc}")
            if "aqua" not in desc:
                failures.append(f"{label}: colour code not converted in {desc}")
            print(f"  modern ping {label}: ok")

        legacy = legacy_ping()
        parts = legacy.split("\x00")
        if parts[0] != "§1":
            failures.append(f"legacy: first field was {parts[0]!r}")
        if "Smoke Hub" not in parts[3]:
            failures.append(f"legacy: MOTD field was {parts[3]!r}")
        if parts[5] != "42":
            failures.append(f"legacy: max players was {parts[5]!r}")
        print(f"  legacy ping: ok ({parts!r})")

        if not any(p == "/config" for _, p in hits):
            failures.append("proxy never polled /config")
        else:
            print(f"  control API: polled /config {sum(1 for _, p in hits if p == '/config')} times")

        if failures:
            print("\nFAILURES:")
            for f in failures:
                print("  -", f)
            return 1
        print("\nall smoke checks passed")
        return 0
    finally:
        proc.terminate()
        try:
            out, _ = proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            out, _ = proc.communicate()
        print("\n--- proxy log ---")
        print(out.strip()[:2000])
        httpd.shutdown()
        if os.path.exists(SOCKET_PATH):
            os.unlink(SOCKET_PATH)


if __name__ == "__main__":
    sys.exit(main())
