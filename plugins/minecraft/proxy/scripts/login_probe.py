"""Login-path probe for mcproxy.

Sends a Login Start in each of the five historical layouts and checks that the
proxy parses it and answers with a well-formed Encryption Request. This is the
version-branching logic, so a misparse here is the failure mode that matters
most: it would desynchronise a real client silently.
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
import uuid as uuidlib
from http.server import BaseHTTPRequestHandler, HTTPServer

TOKEN = "probe-token"
SOCKET_PATH = "/tmp/mcproxy-probe.sock"
PROXY_PORT = 47575

CONFIG = {
    "listenPort": PROXY_PORT,
    "publicHost": "",
    "maxPlayers": 20,
    "motd": "probe",
    "linkTtlSeconds": 300,
    "voteChannelConfigured": False,
    "servers": [],
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.send_response(401)
            self.end_headers()
            return
        body = json.dumps(CONFIG).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def varint(v):
    out = b""
    v &= 0xFFFFFFFF
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out += bytes([b | 0x80])
        else:
            return out + bytes([b])


def read_varint(sock):
    num = 0
    for i in range(5):
        b = sock.recv(1)
        if not b:
            raise EOFError
        num |= (b[0] & 0x7F) << (7 * i)
        if not b[0] & 0x80:
            return num
    raise ValueError("varint too long")


def read_exact(sock, n):
    buf = b""
    while len(buf) < n:
        c = sock.recv(n - len(buf))
        if not c:
            raise EOFError
        buf += c
    return buf


def mc_string(s):
    raw = s.encode()
    return varint(len(raw)) + raw


def packet(pid, payload):
    body = varint(pid) + payload
    return varint(len(body)) + body


class Reader:
    def __init__(self, data):
        self.d = data
        self.i = 0

    def varint(self):
        num = 0
        for k in range(5):
            b = self.d[self.i]
            self.i += 1
            num |= (b & 0x7F) << (7 * k)
            if not b & 0x80:
                return num
        raise ValueError

    def string(self):
        n = self.varint()
        s = self.d[self.i : self.i + n].decode()
        self.i += n
        return s

    def byte_array(self):
        n = self.varint()
        b = self.d[self.i : self.i + n]
        self.i += n
        return b

    def bool(self):
        b = self.d[self.i]
        self.i += 1
        return b != 0

    def remaining(self):
        return len(self.d) - self.i


PLAYER = uuidlib.UUID("069a79f4-44e9-4726-a5be-fca90e38aaf5")


def login_start_payload(proto, name):
    """Build Login Start in the layout the given protocol version uses."""
    out = mc_string(name)
    # The chat-signing key block existed only across 1.19 and 1.19.1/2.
    if 759 <= proto < 761:
        out += b"\x00"  # has signature data: no
    # The UUID was optional from 1.19.1, and unconditional from 1.20.2.
    if proto >= 764:
        out += PLAYER.bytes
    elif proto >= 760:
        out += b"\x01" + PLAYER.bytes
    return out


def probe(proto, label):
    s = socket.create_connection(("127.0.0.1", PROXY_PORT), timeout=5)
    hs = varint(proto) + mc_string("mc.example.com") + struct.pack(">H", PROXY_PORT) + varint(2)
    s.sendall(packet(0x00, hs))
    s.sendall(packet(0x00, login_start_payload(proto, "SmokeTester")))

    read_varint(s)
    pid = read_varint(s)
    length_left = None
    if pid == 0x00:
        r_len = read_varint(s)
        text = read_exact(s, r_len).decode()
        s.close()
        return ("disconnect", json.loads(text))

    if pid != 0x01:
        s.close()
        return ("unexpected", pid)

    # Encryption Request: server id, public key, verify token, [+ auth flag].
    rest = b""
    s.settimeout(2)
    try:
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            rest += chunk
    except socket.timeout:
        pass
    s.close()

    r = Reader(rest)
    server_id = r.string()
    pubkey = r.byte_array()
    token = r.byte_array()
    auth_flag = r.bool() if r.remaining() >= 1 else None
    return ("encryption_request", {
        "server_id": server_id,
        "pubkey_len": len(pubkey),
        "pubkey_der_ok": pubkey[:1] == b"\x30",
        "token_len": len(token),
        "auth_flag": auth_flag,
    })


def main():
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)

    class UnixHTTPServer(HTTPServer):
        address_family = socket.AF_UNIX

        def server_bind(self):
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
            raise SystemExit("proxy never listened")

        failures = []
        cases = [
            (770, "1.21.6-ish", True),
            (767, "1.21", True),
            (764, "1.20.2", False),
            (763, "1.20", False),
            (760, "1.19.1", False),
            (759, "1.19", False),
            (47, "1.8", False),
            (4, "1.7.2", False),
        ]
        for proto, label, expect_auth_flag in cases:
            kind, detail = probe(proto, label)
            if kind != "encryption_request":
                failures.append(f"{label} ({proto}): got {kind} {detail!r}")
                continue
            if detail["server_id"] != "":
                failures.append(f"{label}: server id {detail['server_id']!r} should be empty")
            if not detail["pubkey_der_ok"]:
                failures.append(f"{label}: public key is not a DER SEQUENCE")
            if not (140 <= detail["pubkey_len"] <= 200):
                failures.append(f"{label}: public key length {detail['pubkey_len']} implausible for RSA-1024")
            if detail["token_len"] != 4:
                failures.append(f"{label}: verify token was {detail['token_len']} bytes, expected 4")
            if expect_auth_flag and detail["auth_flag"] is not True:
                failures.append(f"{label}: expected the should-authenticate flag to be true, got {detail['auth_flag']!r}")
            if not expect_auth_flag and detail["auth_flag"] is not None:
                failures.append(f"{label}: unexpected trailing auth flag {detail['auth_flag']!r}")
            print(f"  login {label} (protocol {proto}): encryption request ok")

        kind, detail = probe(3, "pre-1.7.2")
        if kind != "disconnect":
            failures.append(f"protocol 3 should be refused with a message, got {kind} {detail!r}")
        else:
            print(f"  login protocol 3: refused with {detail!r}")

        if failures:
            print("\nFAILURES:")
            for f in failures:
                print("  -", f)
            return 1
        print("\nall login probes passed")
        return 0
    finally:
        proc.terminate()
        try:
            out, _ = proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            out, _ = proc.communicate()
        print("\n--- proxy log (tail) ---")
        print("\n".join(out.strip().splitlines()[-12:]))
        httpd.shutdown()
        if os.path.exists(SOCKET_PATH):
            os.unlink(SOCKET_PATH)


if __name__ == "__main__":
    sys.exit(main())
