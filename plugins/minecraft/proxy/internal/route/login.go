package route

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/auth"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/mcver"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// Packet ids in the login state. These have been stable across every protocol
// version the proxy supports; only the field layouts move.
const (
	idLoginStart         = 0x00
	idEncryptionResponse = 0x01
	idLoginAcknowledged  = 0x03

	idLoginDisconnect   = 0x00
	idEncryptionRequest = 0x01
	idLoginSuccess      = 0x02
	idSetCompression    = 0x03
)

// loginStart is the client's opening claim about who it is. Nothing in it is
// trusted: the name is used to ask Mojang, and the UUID is ignored entirely in
// favour of the one the session server returns.
type loginStart struct {
	Name string
}

// readLoginStart parses Login Start across every supported protocol version.
//
// The layout of this packet has changed more than any other. The proxy only
// needs the name, but it must still walk the optional fields correctly, because
// a misparse here desynchronises the whole connection.
func readLoginStart(conn *protocol.Conn, proto int32) (*loginStart, error) {
	pkt, err := conn.ReadPacket()
	if err != nil {
		return nil, fmt.Errorf("read login start: %w", err)
	}
	if pkt.ID != idLoginStart {
		return nil, fmt.Errorf("expected login start, got packet 0x%02x", pkt.ID)
	}

	r := protocol.NewReader(pkt.Data)
	name, err := r.String(16)
	if err != nil {
		return nil, fmt.Errorf("login start name: %w", err)
	}
	if name == "" {
		return nil, errors.New("login start carried an empty name")
	}

	// 1.19 and 1.19.1/2 carried the chat-signing key here. The fields are of no
	// use to the proxy but must be consumed to stay in frame.
	if mcver.LoginStartHasSignature(proto) {
		hasSig, err := r.Bool()
		if err != nil {
			return nil, fmt.Errorf("login start signature flag: %w", err)
		}
		if hasSig {
			if _, err := r.Long(); err != nil {
				return nil, fmt.Errorf("login start key expiry: %w", err)
			}
			if _, err := r.ByteArray(); err != nil {
				return nil, fmt.Errorf("login start public key: %w", err)
			}
			if _, err := r.ByteArray(); err != nil {
				return nil, fmt.Errorf("login start key signature: %w", err)
			}
		}
	}

	return &loginStart{Name: name}, nil
}

// authenticate runs the encryption exchange and verifies the player against the
// Mojang session server, then switches the connection to the negotiated cipher.
//
// The proxy is the only online-mode authority in the system. Everything
// downstream trusts the profile this returns, so this function must never
// return a profile it did not get from Mojang.
func (p *Proxy) authenticate(ctx context.Context, conn *protocol.Conn, proto int32, ls *loginStart, ip string) (*auth.Profile, error) {
	verifyToken := make([]byte, 4)
	if _, err := rand.Read(verifyToken); err != nil {
		return nil, fmt.Errorf("generate verify token: %w", err)
	}

	// Vanilla sends an empty server id and folds it into the hash; matching it
	// keeps the hash computation identical to the one Mojang expects.
	const serverID = ""
	pubDER := p.keys.PublicKeyDER()

	req := protocol.NewWriter(idEncryptionRequest).
		String(serverID).
		ByteArray(pubDER).
		ByteArray(verifyToken)
	if mcver.EncryptionRequestHasAuthFlag(proto) {
		// Tell the client this proxy really does want it to authenticate. Saying
		// false here would let an unauthenticated client through, which is the
		// one thing this whole path exists to prevent.
		req = req.Bool(true)
	}
	if err := conn.WritePacket(req.Packet()); err != nil {
		return nil, fmt.Errorf("send encryption request: %w", err)
	}

	pkt, err := conn.ReadPacket()
	if err != nil {
		return nil, fmt.Errorf("read encryption response: %w", err)
	}
	if pkt.ID != idEncryptionResponse {
		return nil, fmt.Errorf("expected encryption response, got packet 0x%02x", pkt.ID)
	}

	r := protocol.NewReader(pkt.Data)
	encryptedSecret, err := r.ByteArray()
	if err != nil {
		return nil, fmt.Errorf("encryption response shared secret: %w", err)
	}

	// Across the 1.19 line the client could answer with a salted signature
	// instead of the encrypted verify token. The session server check below is
	// the real authority either way, so an unverifiable token is tolerated but
	// a wrong one is not.
	tokenPresent := true
	var encryptedToken []byte
	if mcver.EncryptionResponseHasSalt(proto) {
		hasToken, err := r.Bool()
		if err != nil {
			return nil, fmt.Errorf("encryption response token flag: %w", err)
		}
		tokenPresent = hasToken
	}
	if tokenPresent {
		encryptedToken, err = r.ByteArray()
		if err != nil {
			return nil, fmt.Errorf("encryption response verify token: %w", err)
		}
	}

	sharedSecret, err := p.keys.Decrypt(encryptedSecret)
	if err != nil {
		return nil, fmt.Errorf("decrypt shared secret: %w", err)
	}
	if len(sharedSecret) != 16 {
		return nil, fmt.Errorf("shared secret is %d bytes, expected 16", len(sharedSecret))
	}

	if tokenPresent {
		got, err := p.keys.Decrypt(encryptedToken)
		if err != nil {
			return nil, fmt.Errorf("decrypt verify token: %w", err)
		}
		if subtle.ConstantTimeCompare(got, verifyToken) != 1 {
			return nil, errors.New("verify token did not match")
		}
	}

	hash := auth.ServerHash(serverID, sharedSecret, pubDER)

	// Encryption starts immediately after the response, before the session
	// server is even asked, because every further byte in either direction is
	// enciphered from this point on.
	if err := conn.EnableEncryption(sharedSecret); err != nil {
		return nil, fmt.Errorf("enable encryption: %w", err)
	}

	profile, err := p.verifier.HasJoined(ctx, ls.Name, hash, ip)
	if err != nil {
		return nil, err
	}
	return profile, nil
}

// disconnectLogin ends a connection that never got past login, with a message
// the player can actually read.
//
// This is used only for conditions the player must act on themselves, such as a
// client too old to serve. A player waiting for a server is never sent here.
func disconnectLogin(conn *protocol.Conn, message string) error {
	payload, err := json.Marshal(map[string]string{"text": message})
	if err != nil {
		payload = []byte(`{"text":"Disconnected"}`)
	}
	return conn.WritePacket(protocol.NewWriter(idLoginDisconnect).String(string(payload)).Packet())
}

// awaitLoginAcknowledged consumes the acknowledgement modern clients send after
// Login Success, which is what moves them into the configuration phase.
func awaitLoginAcknowledged(conn *protocol.Conn) error {
	pkt, err := conn.ReadPacket()
	if err != nil {
		return fmt.Errorf("read login acknowledged: %w", err)
	}
	if pkt.ID != idLoginAcknowledged {
		return fmt.Errorf("expected login acknowledged, got packet 0x%02x", pkt.ID)
	}
	return nil
}
