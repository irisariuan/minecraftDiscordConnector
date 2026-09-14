// Command mcproxy is the Minecraft proxy that fronts every managed server on a
// single port and holds players while a backend is down.
//
// It is normally started as a child of the Discord bot, which passes the
// control API's address and token in the environment. It can also be run by
// hand against a bot that is already up, which is the easiest way to debug it.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/route"
)

func main() {
	if err := run(); err != nil {
		slog.Error("proxy exited", "error", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		ipcPath = flag.String("ipc", os.Getenv("MC_PROXY_IPC_PATH"),
			"path to the bot's control socket; the normal way the two talk")
		controlURL = flag.String("control", os.Getenv("MC_PROXY_CONTROL_URL"),
			"base URL of the bot's control API, as an alternative to -ipc")
		token = flag.String("token", os.Getenv("MC_PROXY_TOKEN"),
			"bearer token for the control API")
		listenPort = flag.Int("port", envInt("MC_PROXY_LISTEN_PORT", 0),
			"port to accept players on; 0 takes the value from the bot")
		bindAddr = flag.String("bind", env("MC_PROXY_BIND", "0.0.0.0"),
			"address to bind the player listener to")
		logLevel = flag.String("log-level", env("MC_PROXY_LOG_LEVEL", "info"),
			"debug, info, warn or error")
	)
	flag.Parse()

	logger := newLogger(*logLevel)
	slog.SetDefault(logger)

	if *token == "" {
		return fmt.Errorf("no control API token: set MC_PROXY_TOKEN")
	}
	if *ipcPath == "" && *controlURL == "" {
		return fmt.Errorf("no control channel: set MC_PROXY_IPC_PATH (preferred) or MC_PROXY_CONTROL_URL")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var client *control.Client
	channel := *controlURL
	if *ipcPath != "" {
		// The socket wins when both are set: it is the more restricted channel,
		// so preferring it can only ever narrow access.
		client = control.NewIPC(*ipcPath, *token)
		channel = "unix:" + *ipcPath
	} else {
		client = control.New(*controlURL, *token, nil)
	}
	poller := control.NewPoller(client, control.DefaultInterval)
	go poller.Run(ctx)

	port, err := resolvePort(ctx, poller, *listenPort)
	if err != nil {
		return err
	}

	proxy, err := route.New(route.Options{
		ListenAddr: fmt.Sprintf("%s:%d", *bindAddr, port),
		Control:    client,
		Poller:     poller,
		Logger:     logger,
	})
	if err != nil {
		return err
	}

	logger.Info("mcproxy starting", "control", channel, "port", port)
	return proxy.ListenAndServe(ctx)
}

// resolvePort settles which port to accept players on. An explicit value always
// wins; otherwise the bot's configuration is used, and the proxy waits a short
// while for it rather than binding the wrong port and having to be restarted.
func resolvePort(ctx context.Context, poller *control.Poller, override int) (int, error) {
	if override > 0 {
		return override, nil
	}

	waitCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	select {
	case <-poller.Ready():
		if cfg := poller.Snapshot(); cfg != nil && cfg.ListenPort > 0 {
			return cfg.ListenPort, nil
		}
		return 25565, nil
	case <-waitCtx.Done():
		if ctx.Err() != nil {
			return 0, ctx.Err()
		}
		// The bot has not answered. Binding the default is better than not
		// listening at all: players then get a holding screen instead of a
		// connection refused, which is the entire point of this program.
		slog.Warn("bot did not answer in time; using the default port", "port", 25565)
		return 25565, nil
	}
}

func newLogger(level string) *slog.Logger {
	var lvl slog.Level
	if err := lvl.UnmarshalText([]byte(level)); err != nil {
		lvl = slog.LevelInfo
	}
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: lvl}))
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
