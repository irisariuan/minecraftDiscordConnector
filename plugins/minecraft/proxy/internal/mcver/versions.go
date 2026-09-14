// Package mcver holds the protocol-version thresholds the proxy branches on.
//
// The proxy accepts every client version it can complete a login for, but not
// every version can be given the same experience while it waits for a backend.
// The constants here name the exact points where behaviour has to change, so
// that no other package has to carry a bare magic number.
package mcver

// Protocol numbers for the releases the proxy branches on. These are the
// version numbers sent in the handshake, not the marketing version.
const (
	// V1_7_2 is the oldest protocol the proxy will complete a login for.
	// Everything below it predates the modern handshake entirely.
	V1_7_2 = 4
	// V1_8 is the baseline most legacy clients report.
	V1_8 = 47
	// V1_16 changed the login-success profile and dimension encoding.
	V1_16 = 735
	// V1_19 added chat signing, which put an optional public key in Login Start.
	V1_19 = 759
	// V1_19_1 kept the signature fields and changed Encryption Response.
	V1_19_1 = 760
	// V1_19_3 dropped the Login Start signature fields again.
	V1_19_3 = 761
	// V1_20_2 introduced the configuration phase and Login Acknowledged.
	V1_20_2 = 764
	// V1_20_3 switched text components on the wire from JSON to NBT.
	V1_20_3 = 765
	// V1_20_5 introduced the Transfer packet and cookies.
	V1_20_5 = 766
)

// MinSupported is the lowest protocol version the proxy will serve. Clients
// below it are refused at the handshake with an explanatory message rather than
// being dropped, because a silent disconnect looks like an outage.
const MinSupported = V1_7_2

// HasConfigurationPhase reports whether the client expects Login Acknowledged
// and a configuration phase between login and play.
func HasConfigurationPhase(protocol int32) bool { return protocol >= V1_20_2 }

// UsesNBTComponents reports whether text components travel as network NBT
// rather than as JSON strings in play-state packets.
func UsesNBTComponents(protocol int32) bool { return protocol >= V1_20_3 }

// SupportsTransfer reports whether the client understands the Transfer packet,
// which is how the proxy hands a held player over to a backend that has just
// come up without ever disconnecting them.
func SupportsTransfer(protocol int32) bool { return protocol >= V1_20_5 }

// LoginStartHasUUID reports whether Login Start carries the player's UUID.
// It was added in 1.19.1 and became unconditional in 1.20.2.
func LoginStartHasUUID(protocol int32) bool { return protocol >= V1_19_1 }

// LoginStartHasOptionalUUID reports whether the UUID in Login Start is preceded
// by a boolean rather than always being present.
func LoginStartHasOptionalUUID(protocol int32) bool {
	return protocol >= V1_19_1 && protocol < V1_20_2
}

// LoginStartHasSignature reports whether Login Start carries the chat-signing
// public key block, which existed only across the 1.19 releases.
func LoginStartHasSignature(protocol int32) bool {
	return protocol >= V1_19 && protocol < V1_19_3
}

// EncryptionResponseHasSalt reports whether Encryption Response may carry a
// salted signature in place of the encrypted verify token. Same 1.19 window.
func EncryptionResponseHasSalt(protocol int32) bool {
	return protocol >= V1_19 && protocol < V1_19_3
}

// EncryptionRequestHasAuthFlag reports whether Encryption Request ends with the
// "should authenticate" boolean added alongside transfers.
func EncryptionRequestHasAuthFlag(protocol int32) bool { return protocol >= V1_20_5 }

// CanHoldInWorld reports whether the proxy can put a waiting player into a
// holding world where it can talk to them and take commands. Below this the
// only non-disconnecting option is to stall the login itself.
func CanHoldInWorld(protocol int32) bool { return protocol >= V1_20_5 }

// V1_13 is the oldest protocol with login plugin messages, which is the only
// mechanism that keeps a stalled login alive.
const V1_13 = 393

// CanBeHeld reports whether a connection can be parked mid-login indefinitely.
//
// A client sitting on the login screen disconnects itself after about thirty
// seconds of silence, so holding one requires something to send it. The login
// phase has no keep-alive packet, but it does have login plugin messages, which
// the vanilla client always answers. Below 1.13 there is nothing to send, so
// such a client cannot be held at all.
func CanBeHeld(protocol int32) bool { return protocol >= V1_13 }
