// Package forward carries a player identity the proxy has already verified down
// to a backend that cannot verify it itself.
//
// The proxy is the online-mode authority. Backends behind it run in offline
// mode, which means anyone who can open a TCP connection to a backend directly
// can claim to be anyone. Every mode in this package therefore assumes the
// backend is firewalled so that only the proxy can reach it. That assumption is
// not something the proxy can check, so it is stated loudly here and in the
// operator documentation instead.
package forward

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/auth"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// Mode selects how the verified identity reaches the backend.
type Mode string

const (
	// ModeNone sends nothing. The backend sees the proxy's address and, in
	// offline mode, derives the player's UUID from their name. Only suitable
	// for a backend that does not care who anyone is.
	ModeNone Mode = "none"
	// ModeBungeeCord appends the identity to the handshake address field. Works
	// on every Spigot derivative since 1.8 and on every protocol version.
	ModeBungeeCord Mode = "bungeecord"
	// ModeVelocity answers a login plugin request with an HMAC-signed payload.
	// Only modern backends with modern forwarding configured support it.
	ModeVelocity Mode = "velocity"
)

// ParseMode maps a configured string onto a Mode, defaulting to ModeNone for
// anything unrecognised so that a typo degrades to "no forwarding" rather than
// to "forward with a broken payload".
func ParseMode(s string) (Mode, error) {
	switch Mode(strings.ToLower(strings.TrimSpace(s))) {
	case ModeNone, "":
		return ModeNone, nil
	case ModeBungeeCord:
		return ModeBungeeCord, nil
	case ModeVelocity:
		return ModeVelocity, nil
	default:
		return ModeNone, fmt.Errorf("unknown forwarding mode %q", s)
	}
}

// Identity is everything a backend is told about a verified player.
type Identity struct {
	UUID protocol.UUID
	Name string
	// ClientIP is the player's address, without a port.
	ClientIP   string
	Properties []auth.Property
}

// BungeeAddress builds the value of the handshake's server-address field for
// BungeeCord legacy forwarding.
//
// The field becomes four null-separated parts: the hostname the client asked
// for, the player's real IP, their UUID without dashes, and their profile
// properties as JSON. Spigot splits on the null byte and rejects anything with
// the wrong number of parts, so the property array must be present even when
// empty.
func BungeeAddress(host string, id Identity) (string, error) {
	// A null byte reaching this from an untrusted hostname would let a client
	// forge the trailing fields, which is precisely the spoofing this scheme is
	// famous for. Refuse rather than sanitise.
	if strings.ContainsRune(host, 0) {
		return "", fmt.Errorf("handshake host contains a null byte")
	}

	// Called out separately from the character-class check below so that the
	// error names the actual problem: a null byte here is an injection attempt,
	// not a malformed address, and the two deserve different log lines.
	if strings.ContainsRune(id.ClientIP, 0) {
		return "", fmt.Errorf("client address contains a null byte")
	}

	// Spigot and its forks validate the address field against a character class
	// that admits only lowercase hex, dots and colons for the IP part, and they
	// reject the whole connection rather than the field. An uppercase IPv6
	// address would therefore be refused by the backend with no useful error,
	// so normalise here and fail loudly on anything that still does not fit.
	clientIP := strings.ToLower(id.ClientIP)
	if !validForwardedIP(clientIP) {
		return "", fmt.Errorf("client address %q cannot be forwarded to a Spigot backend", id.ClientIP)
	}

	props := id.Properties
	if props == nil {
		props = []auth.Property{}
	}
	encoded, err := json.Marshal(props)
	if err != nil {
		return "", fmt.Errorf("encode profile properties: %w", err)
	}

	return strings.Join([]string{
		host,
		clientIP,
		id.UUID.Undashed(),
		string(encoded),
	}, "\x00"), nil
}

// maxForwardedIPLen is the cap Spigot applies to the address portion.
const maxForwardedIPLen = 45

// validForwardedIP reports whether an address survives a Spigot backend's
// validation of the forwarded handshake: lowercase hex digits, dots and colons
// only, which covers both IPv4 and IPv6 but excludes hostnames.
func validForwardedIP(ip string) bool {
	if ip == "" || len(ip) > maxForwardedIPLen {
		return false
	}
	for _, r := range ip {
		switch {
		case r >= '0' && r <= '9':
		case r >= 'a' && r <= 'f':
		case r == '.' || r == ':':
		default:
			return false
		}
	}
	return true
}
