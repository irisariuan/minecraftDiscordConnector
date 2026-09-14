# Proxy verification scripts

Two standalone checks that run the **compiled** proxy against a stand-in bot and
speak the Minecraft protocol from a raw socket. They need nothing but Python 3
and a built binary, and they are the fastest way to tell whether a deployment is
wired up correctly.

```sh
bun run build:proxy
python3 plugins/minecraft/proxy/scripts/smoke.py        plugins/minecraft/proxy/bin/mcproxy
python3 plugins/minecraft/proxy/scripts/login_probe.py  plugins/minecraft/proxy/bin/mcproxy
```

**`smoke.py`** serves a fake control API over a Unix socket, then checks the
server-list ping: that the MOTD's legacy colour codes become a proper text
component, that the client's own protocol is echoed so the entry never shows as
incompatible, that the ping nonce comes back untouched, and that the pre-1.7
`0xFE` ping still answers. It also confirms the proxy really is polling the bot
over the socket rather than a port.

**`login_probe.py`** sends a Login Start in each of the layouts Mojang has used
since 1.7.2 and checks that the proxy parses every one of them and replies with
a well-formed Encryption Request — right server id, a public key that is valid
DER, a four byte verify token, and the should-authenticate flag appearing at
exactly protocol 766 and no earlier. A misparse here is the failure that would
silently desynchronise a real client, so this is the check worth running after
any change to the login path.

Neither script can complete a login: that needs a Mojang session, which is what
the Go tests in `internal/route/e2e_test.go` stand in for. Those tests also cover
the waiting world end to end — entering it, choosing a server in it, and being
transferred out — which is beyond what a raw socket script can reach.
