// Package control is a typed client for the bot's loopback control API,
// described in CONTROL_API.md at the root of this module.
//
// The proxy owns no database, no Discord connection and no credentials: every
// decision that needs the bot's state is asked over this API. The client is
// safe for concurrent use by many connection goroutines.
package control

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

// maxBodyBytes caps how much of any response is read into memory. The largest
// realistic body is a config listing every backend, which is kilobytes.
const maxBodyBytes = 1 << 20

// errBodyBytes is how much of a failing response is kept in the error, so an
// operator can tell a 401 from a 502 from an HTML error page.
const errBodyBytes = 512

// defaultTimeout bounds a single control request. The bot is on loopback, so
// anything slower than this is a hang rather than latency.
const defaultTimeout = 10 * time.Second

// Status values returned by POST /start. These are the complete set from
// CONTROL_API.md; an unrecognised status should be treated like StatusFailed.
const (
	// StatusStarted means the server is starting now.
	StatusStarted = "started"
	// StatusAlreadyOnline means nothing had to be done and the player can be routed.
	StatusAlreadyOnline = "already_online"
	// StatusPollCreated means a vote was posted to the configured channel.
	StatusPollCreated = "poll_created"
	// StatusPollPending means a vote is already open.
	StatusPollPending = "poll_pending"
	// StatusNoChannel means no vote channel is configured, so the player must
	// start the vote from Discord themselves.
	StatusNoChannel = "no_channel"
	// StatusNoPermission means the player may not start and no vote could be raised.
	StatusNoPermission = "no_permission"
	// StatusInsufficientCredit means the linked account could not pay the poll fee.
	StatusInsufficientCredit = "insufficient_credit"
	// StatusPortConflict means another server already holds the port.
	StatusPortConflict = "port_conflict"
	// StatusNotLinked means the player has no linked Discord account.
	StatusNotLinked = "not_linked"
	// StatusNoAccess means the linked account may not use this server.
	StatusNoAccess = "no_access"
	// StatusFailed is anything else; the accompanying Message explains.
	StatusFailed = "failed"
)

// Forwarding modes a backend can be configured for.
const (
	ForwardingNone       = "none"
	ForwardingBungeeCord = "bungeecord"
	ForwardingVelocity   = "velocity"
)

// APIError is a non-2xx response from the control API. It carries the status
// code and a truncated body so that, for example, a 401 caused by a bad
// MC_PROXY_TOKEN is obvious in a log line.
type APIError struct {
	StatusCode int
	Status     string
	Path       string
	Body       string
}

func (e *APIError) Error() string {
	if e.Body == "" {
		return fmt.Sprintf("control: %s: unexpected status %d %s", e.Path, e.StatusCode, e.Status)
	}
	return fmt.Sprintf("control: %s: unexpected status %d %s: %s", e.Path, e.StatusCode, e.Status, e.Body)
}

// Client is a typed client for the bot's control API.
type Client struct {
	baseURL string
	token   string
	hc      *http.Client
}

// New returns a Client for the control API at baseURL, authenticating with
// token. A nil http.Client gets a default with a timeout and keep-alives,
// which is what the proxy wants: one client reused for every call.
func New(baseURL, token string, hc *http.Client) *Client {
	if hc == nil {
		hc = &http.Client{Timeout: defaultTimeout}
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), token: token, hc: hc}
}

// NewIPC returns a Client that reaches the bot over a Unix domain socket
// instead of a network port.
//
// This is how the proxy and the bot normally talk. Nothing about the requests
// changes — it is the same HTTP — but the transport is a file, so access is
// governed by filesystem permissions rather than by whoever can open a loopback
// port. On a shared host that is the difference between "only this user" and
// "any local process".
func NewIPC(socketPath, token string) *Client {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", socketPath)
		},
		MaxIdleConns:       4,
		IdleConnTimeout:    90 * time.Second,
		DisableCompression: true,
	}
	return &Client{
		// The host is ignored by a Unix dialer but has to be syntactically
		// valid for net/http to build a request at all.
		baseURL: "http://mcproxy.ipc",
		token:   token,
		hc:      &http.Client{Timeout: defaultTimeout, Transport: transport},
	}
}

// ServerEntry is one backend as reported by GET /config.
type ServerEntry struct {
	ID               int    `json:"id"`
	Tag              string `json:"tag"`
	Host             string `json:"host"`
	Port             int    `json:"port"`
	Online           bool   `json:"online"`
	Forwarding       string `json:"forwarding"`
	ForwardingSecret string `json:"forwardingSecret"`
}

// Config is the proxy's only source of truth for which backends exist and
// whether they are up.
type Config struct {
	ListenPort            int           `json:"listenPort"`
	PublicHost            string        `json:"publicHost"`
	MaxPlayers            int           `json:"maxPlayers"`
	MOTD                  string        `json:"motd"`
	VoteChannelConfigured bool          `json:"voteChannelConfigured"`
	Servers               []ServerEntry `json:"servers"`
}

// Clone returns a deep copy, so a caller can hold and even mutate a Config
// without racing the poller that produced it.
func (c *Config) Clone() *Config {
	if c == nil {
		return nil
	}
	out := *c
	if c.Servers != nil {
		out.Servers = make([]ServerEntry, len(c.Servers))
		copy(out.Servers, c.Servers)
	}
	return &out
}

// Config fetches GET /config.
func (c *Client) Config(ctx context.Context) (*Config, error) {
	var out Config
	if err := c.do(ctx, http.MethodGet, "/config", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// SessionServerInfo is one backend as seen by a particular player.
type SessionServerInfo struct {
	ID          int    `json:"id"`
	Tag         string `json:"tag"`
	Online      bool   `json:"online"`
	Accessible  bool   `json:"accessible"`
	CanStart    bool   `json:"canStart"`
	PollPending bool   `json:"pollPending"`
	PollURL     string `json:"pollUrl"`
}

// Session is who a player is and what they may do.
type Session struct {
	Linked                bool                `json:"linked"`
	DiscordID             string              `json:"discordId"`
	VoteChannelConfigured bool                `json:"voteChannelConfigured"`
	Servers               []SessionServerInfo `json:"servers"`
}

type sessionRequest struct {
	UUID     string `json:"uuid"`
	Name     string `json:"name"`
	IP       string `json:"ip"`
	Protocol int32  `json:"protocol"`
}

// Session calls POST /session, once per login, after the player has been
// authenticated against Mojang. uuid must be lowercase and dashed.
func (c *Client) Session(ctx context.Context, uuid, name, ip string, protocolVersion int32) (*Session, error) {
	req := sessionRequest{UUID: uuid, Name: name, IP: ip, Protocol: protocolVersion}
	var out Session
	if err := c.do(ctx, http.MethodPost, "/session", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// StartResult is the outcome of asking for a server to be started. Message is
// safe to show verbatim in game: plain text, no section codes, no newlines.
type StartResult struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	PollURL string `json:"pollUrl"`
}

type startRequest struct {
	UUID     string `json:"uuid"`
	Name     string `json:"name"`
	ServerID int    `json:"serverId"`
}

// Start calls POST /start. A non-nil result with a status the caller does not
// recognise should be handled like StatusFailed.
func (c *Client) Start(ctx context.Context, uuid, name string, serverID int) (*StartResult, error) {
	req := startRequest{UUID: uuid, Name: name, ServerID: serverID}
	var out StartResult
	if err := c.do(ctx, http.MethodPost, "/start", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// do performs one request, encoding body as JSON when non-nil and decoding the
// response into out.
func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var rdr io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("control: %s: encode request: %w", path, err)
		}
		rdr = bytes.NewReader(buf)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, rdr)
	if err != nil {
		return fmt.Errorf("control: %s: build request: %w", path, err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.hc.Do(req)
	if err != nil {
		return fmt.Errorf("control: %s: %w", path, err)
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxBodyBytes))
		resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, errBodyBytes))
		return &APIError{
			StatusCode: resp.StatusCode,
			Status:     http.StatusText(resp.StatusCode),
			Path:       path,
			Body:       truncate(strings.TrimSpace(string(b)), errBodyBytes),
		}
	}

	if out == nil {
		return nil
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))
	if err != nil {
		return fmt.Errorf("control: %s: read response: %w", path, err)
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("control: %s: decode response: %w", path, err)
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
