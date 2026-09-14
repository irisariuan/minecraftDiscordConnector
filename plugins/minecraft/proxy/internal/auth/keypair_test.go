package auth

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"testing"
)

// TestServerHashKnownVectors checks the three digests Mojang publishes as the
// canonical examples of the signed-hex encoding. The jeb_ vector is negative
// and the simon vector has a leading zero that must not be printed, so between
// them they pin down every part of the encoding.
func TestServerHashKnownVectors(t *testing.T) {
	cases := []struct {
		serverID string
		want     string
	}{
		{"Notch", "4ed1f46bbe04bc756bcb17c0c7ce3e4632f06a48"},
		{"jeb_", "-7c9d5b0044c130109a5d7b5fb5c317c02b4e28c1"},
		{"simon", "88e16a1019277b15d58faf0541e11910eb756f6"},
	}
	for _, c := range cases {
		if got := ServerHash(c.serverID, nil, nil); got != c.want {
			t.Errorf("ServerHash(%q) = %q, want %q", c.serverID, got, c.want)
		}
	}
}

// TestServerHashConcatenationOrder pins the order of the three inputs: the
// hash must be over serverID || sharedSecret || publicKeyDER, so feeding the
// same bytes split differently must produce the same digest.
func TestServerHashConcatenationOrder(t *testing.T) {
	got := ServerHash("No", []byte("tc"), []byte("h"))
	if want := "4ed1f46bbe04bc756bcb17c0c7ce3e4632f06a48"; got != want {
		t.Errorf("split ServerHash = %q, want %q", got, want)
	}
	if a, b := ServerHash("a", []byte("b"), nil), ServerHash("ab", nil, nil); a != b {
		t.Errorf("secret is not concatenated in order: %q != %q", a, b)
	}
}

func TestServerHashNoLeadingZeros(t *testing.T) {
	// "simon" is the documented digest with a zero top nibble.
	got := ServerHash("simon", nil, nil)
	if len(got) != 39 {
		t.Errorf("ServerHash(simon) has length %d, want 39 (leading zero stripped)", len(got))
	}
	if got[0] == '0' {
		t.Errorf("ServerHash(simon) = %q has a leading zero", got)
	}
}

func TestPublicKeyDERRoundTrip(t *testing.T) {
	kp, err := GenerateKeyPair()
	if err != nil {
		t.Fatalf("GenerateKeyPair: %v", err)
	}

	der := kp.PublicKeyDER()
	pub, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		t.Fatalf("ParsePKIXPublicKey: %v", err)
	}
	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		t.Fatalf("parsed key is %T, want *rsa.PublicKey", pub)
	}
	if n := rsaPub.N.BitLen(); n != keyBits {
		t.Errorf("key is %d bits, want %d", n, keyBits)
	}

	// The returned slice must be a copy: scribbling on it must not corrupt
	// the keypair for the next caller.
	orig := append([]byte(nil), der...)
	for i := range der {
		der[i] = 0
	}
	if !bytes.Equal(kp.PublicKeyDER(), orig) {
		t.Error("PublicKeyDER returned an aliased slice; mutating it corrupted the keypair")
	}
}

func TestDecryptRoundTrip(t *testing.T) {
	kp, err := GenerateKeyPair()
	if err != nil {
		t.Fatalf("GenerateKeyPair: %v", err)
	}
	pub, err := x509.ParsePKIXPublicKey(kp.PublicKeyDER())
	if err != nil {
		t.Fatalf("ParsePKIXPublicKey: %v", err)
	}

	secret := []byte("0123456789abcdef") // a 16-byte AES key, as the client sends
	ct, err := rsa.EncryptPKCS1v15(rand.Reader, pub.(*rsa.PublicKey), secret)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	got, err := kp.Decrypt(ct)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if !bytes.Equal(got, secret) {
		t.Errorf("Decrypt = %x, want %x", got, secret)
	}

	if _, err := kp.Decrypt([]byte("not a ciphertext")); err == nil {
		t.Error("Decrypt accepted garbage")
	}
}
