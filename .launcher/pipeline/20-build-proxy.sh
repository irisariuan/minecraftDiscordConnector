#!/bin/bash
#
# Build the Go Minecraft proxy this version expects, and remove it again on the
# way out.
#
# The binary is gitignored build output, so a checkout never brings it or takes
# it away: without this step, switching to a version whose proxy sources have
# changed silently keeps running the binary built from the previous one, and
# switching to a version that has no proxy at all leaves a stray one behind.
#
set -euo pipefail

PROXY_DIR="plugins/minecraft/proxy"
BIN_DIR="$PROXY_DIR/bin"
BIN="${MC_PROXY_BIN:-$BIN_DIR/mcproxy}"

case "$1" in
apply)
	# Versions before the proxy existed carry no sources; nothing to build.
	# Test for the module rather than the directory: git leaves the ignored
	# bin/ behind when switching to a version without the proxy, so the
	# directory can outlive the sources.
	if [ ! -f "$PROXY_DIR/go.mod" ]; then
		echo "no Go proxy sources in this version — skipping proxy build"
		exit 0
	fi
	if ! command -v go >/dev/null 2>&1; then
		echo "go is not installed, but $PROXY_DIR needs compiling." >&2
		echo "Install Go, or run the switch with pipeline:false and keep MC_PROXY_ENABLED unset." >&2
		exit 1
	fi
	echo "building the Minecraft proxy with $(go version)"
	bun run build:proxy
	if [ ! -x "$BIN" ]; then
		echo "build reported success but $BIN is missing or not executable." >&2
		exit 1
	fi
	echo "built $BIN"
	;;

unapply)
	# Drop the build output so the next version compiles its own, and so a
	# version without a proxy is not left with a stale binary to run.
	if [ -d "$BIN_DIR" ]; then
		rm -rf "$BIN_DIR"
		echo "removed $BIN_DIR"
	else
		echo "no $BIN_DIR to remove"
	fi
	;;

*)
	echo "usage: $0 apply|unapply" >&2
	exit 2
	;;
esac
