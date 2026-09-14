// Package auth implements the Mojang online-mode authentication the proxy
// performs on behalf of backends that themselves run in offline mode.
//
// The proxy generates an ephemeral RSA keypair at process start, offers its
// public key to the client in the Encryption Request packet, decrypts the
// client's shared secret, and then asks the Mojang session server to confirm
// that the player really did join with that secret.
package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/x509"
	"fmt"
	"math/big"
)

// keyBits is the RSA modulus size. Vanilla uses 1024 bits and some clients
// reject anything else, so this is not a tunable.
const keyBits = 1024

// KeyPair is the proxy's ephemeral RSA keypair. It is regenerated on every
// process start and never persisted.
//
// The private key must never be logged or exposed; KeyPair deliberately offers
// no accessor for it and no String method.
type KeyPair struct {
	priv      *rsa.PrivateKey
	publicDER []byte
}

// GenerateKeyPair creates a fresh 1024-bit RSA keypair.
func GenerateKeyPair() (*KeyPair, error) {
	priv, err := rsa.GenerateKey(rand.Reader, keyBits)
	if err != nil {
		return nil, fmt.Errorf("auth: generate rsa key: %w", err)
	}
	der, err := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("auth: marshal public key: %w", err)
	}
	return &KeyPair{priv: priv, publicDER: der}, nil
}

// PublicKeyDER returns the X.509 SubjectPublicKeyInfo encoding of the public
// key, which is what goes on the wire in the Encryption Request packet and
// into the server hash. The returned slice is a copy; mutating it does not
// affect the keypair.
func (k *KeyPair) PublicKeyDER() []byte {
	out := make([]byte, len(k.publicDER))
	copy(out, k.publicDER)
	return out
}

// Decrypt undoes the PKCS#1 v1.5 encryption the client applies to the shared
// secret and the verify token.
//
// The plaintext is secret material: callers must not log it.
func (k *KeyPair) Decrypt(ciphertext []byte) ([]byte, error) {
	plain, err := rsa.DecryptPKCS1v15(rand.Reader, k.priv, ciphertext)
	if err != nil {
		// Deliberately does not wrap err's detail into anything that could
		// carry plaintext; rsa never returns plaintext in its errors, but the
		// message is kept generic to avoid a padding oracle in the logs.
		return nil, fmt.Errorf("auth: decrypt: %w", err)
	}
	return plain, nil
}

// twoPow160 is 2^160, the modulus of the signed 160-bit space a SHA-1 digest
// is interpreted in.
var twoPow160 = new(big.Int).Lsh(big.NewInt(1), 160)

// ServerHash computes the Mojang "server ID" hash: the SHA-1 digest of the
// server ID bytes, the shared secret and the DER-encoded public key, read as a
// signed big-endian two's-complement 160-bit integer and rendered in
// hexadecimal.
//
// That signed reading is the part everyone gets wrong. A digest whose top bit
// is set denotes a negative number, so the result starts with '-' and its
// magnitude is the two's-complement negation of the digest, not the digest
// itself. Leading zeros are never printed.
func ServerHash(serverID string, sharedSecret, publicKeyDER []byte) string {
	h := sha1.New()
	h.Write([]byte(serverID))
	h.Write(sharedSecret)
	h.Write(publicKeyDER)
	sum := h.Sum(nil)

	n := new(big.Int).SetBytes(sum)
	if sum[0]&0x80 != 0 {
		n.Sub(n, twoPow160)
	}
	return n.Text(16)
}
