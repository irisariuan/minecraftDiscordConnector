package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// sessionServerURL is the Mojang endpoint that confirms a join.
const sessionServerURL = "https://sessionserver.mojang.com/session/minecraft/hasJoined"

// maxBodyBytes caps how much of a session server response is read. A profile
// with a signed textures property is a few kilobytes; 1 MiB is generous.
const maxBodyBytes = 1 << 20

// defaultTimeout bounds a single hasJoined call when the caller's context has
// no deadline of its own.
const defaultTimeout = 10 * time.Second

// ErrNotAuthenticated reports that the session server does not believe this
// player completed the encryption handshake with us. It is the expected
// outcome for a cracked client, not an operational failure.
var ErrNotAuthenticated = errors.New("player failed session server verification")

// Property is a signed profile property, most usefully "textures".
type Property struct {
	Name      string `json:"name"`
	Value     string `json:"value"`
	Signature string `json:"signature,omitempty"`
}

// Profile is the verified identity of a player.
type Profile struct {
	ID         protocol.UUID
	Name       string
	Properties []Property
}

// Verifier talks to the Mojang session server.
type Verifier struct {
	hc      *http.Client
	baseURL string
}

// NewVerifier returns a Verifier. A nil http.Client gets a sane default with a
// request timeout and connection reuse.
func NewVerifier(hc *http.Client) *Verifier {
	if hc == nil {
		hc = &http.Client{Timeout: defaultTimeout}
	}
	return &Verifier{hc: hc, baseURL: sessionServerURL}
}

// NewVerifierAt returns a Verifier pointed at a different hasJoined endpoint.
//
// This exists so the login path can be exercised end to end against a stand-in
// session server. Point it anywhere but Mojang in production and the proxy
// stops being an authentication authority, so treat a non-default value as a
// test-only setting.
func NewVerifierAt(hc *http.Client, baseURL string) *Verifier {
	v := NewVerifier(hc)
	if baseURL != "" {
		v.baseURL = baseURL
	}
	return v
}

// rawProfile mirrors the session server's JSON, whose id is undashed.
type rawProfile struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Properties []Property `json:"properties"`
}

// HasJoined asks the session server whether username joined a server whose
// hash is hash. ip, when non-empty, is the player's address and is sent as the
// ip query parameter so Mojang can apply its prevent-proxy-connections check;
// pass "" to omit it.
//
// It returns ErrNotAuthenticated when the session server answers 204 or an
// empty body, which is how it says "no such pending join".
func (v *Verifier) HasJoined(ctx context.Context, username, hash, ip string) (*Profile, error) {
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, defaultTimeout)
		defer cancel()
	}

	q := url.Values{}
	q.Set("username", username)
	q.Set("serverId", hash)
	if ip != "" {
		q.Set("ip", ip)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.baseURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, fmt.Errorf("auth: build hasJoined request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := v.hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("auth: hasJoined: %w", err)
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxBodyBytes))
		resp.Body.Close()
	}()

	switch {
	case resp.StatusCode == http.StatusNoContent:
		return nil, ErrNotAuthenticated
	case resp.StatusCode == http.StatusOK:
		// fall through
	default:
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("auth: hasJoined: unexpected status %d: %s",
			resp.StatusCode, truncate(strings.TrimSpace(string(body)), 256))
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))
	if err != nil {
		return nil, fmt.Errorf("auth: read hasJoined body: %w", err)
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return nil, ErrNotAuthenticated
	}

	var raw rawProfile
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("auth: decode hasJoined body: %w", err)
	}
	if raw.ID == "" {
		return nil, ErrNotAuthenticated
	}

	id, err := protocol.ParseUUID(raw.ID)
	if err != nil {
		return nil, fmt.Errorf("auth: hasJoined returned an unparseable uuid %q: %w", raw.ID, err)
	}

	return &Profile{ID: id, Name: raw.Name, Properties: raw.Properties}, nil
}

// truncate shortens s for inclusion in an error message.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
