package forward

import (
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"fmt"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// VelocityChannel is the login plugin message channel a modern-forwarding
// backend uses to ask the proxy who is connecting.
const VelocityChannel = "velocity:player_info"

// Velocity forwarding payload versions.
//
// The proxy answers with version 1. Later versions exist only to carry the
// player's chat-signing key, which this proxy deliberately does not relay: it
// never asks the client for one, because holding a player in a limbo world does
// not require signed chat and requesting keys would add a failure mode for no
// gain. A backend that asked for a later version accepts a lower one, and
// treats affected players as sending unsigned chat.
const (
	VelocityVersionDefault = 1
	velocityMaxSupported   = 1
)

// ErrVelocityNoSecret is returned when a backend is configured for modern
// forwarding but no secret was supplied. Guessing or proceeding unsigned would
// produce a confusing kick from the backend instead of a clear error here.
var ErrVelocityNoSecret = errors.New("velocity forwarding requires a forwarding secret")

// RequestedVelocityVersion reads the version the backend asked for out of its
// login plugin request. An empty request means the oldest version.
func RequestedVelocityVersion(data []byte) int32 {
	if len(data) == 0 {
		return VelocityVersionDefault
	}
	version := int32(data[0])
	if version < VelocityVersionDefault {
		return VelocityVersionDefault
	}
	return version
}

// VelocityResponse builds the body of the login plugin response: a 32 byte
// HMAC-SHA256 signature over the payload, followed by the payload itself.
//
// The signature is what makes this scheme safe where BungeeCord's is not. A
// backend that only accepts correctly signed payloads cannot be fed a forged
// identity by anyone who lacks the secret, so it does not depend purely on
// being unreachable.
func VelocityResponse(secret []byte, requestedVersion int32, id Identity) ([]byte, error) {
	if len(secret) == 0 {
		return nil, ErrVelocityNoSecret
	}
	if id.ClientIP == "" {
		return nil, fmt.Errorf("velocity forwarding needs the player address")
	}

	version := requestedVersion
	if version > velocityMaxSupported {
		version = velocityMaxSupported
	}

	w := protocol.NewWriter(0).
		VarInt(version).
		String(id.ClientIP).
		UUID(id.UUID).
		String(id.Name).
		VarInt(int32(len(id.Properties)))
	for _, prop := range id.Properties {
		w = w.String(prop.Name).String(prop.Value)
		if prop.Signature != "" {
			w = w.Bool(true).String(prop.Signature)
		} else {
			w = w.Bool(false)
		}
	}

	pkt := w.Packet()
	if pkt == nil {
		return nil, fmt.Errorf("encode velocity payload")
	}
	// The writer keeps the packet id separate from the body, so Data is exactly
	// the signed payload. The zero passed to NewWriter is never serialised.
	payload := pkt.Data

	mac := hmac.New(sha256.New, secret)
	mac.Write(payload)
	signature := mac.Sum(nil)

	out := make([]byte, 0, len(signature)+len(payload))
	out = append(out, signature...)
	out = append(out, payload...)
	return out, nil
}
