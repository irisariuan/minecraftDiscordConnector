package protocol

import (
	"bytes"
	"crypto/aes"
	"encoding/hex"
	"math/rand"
	"testing"
)

// TestCFB8NISTVector checks the implementation against the CFB8-AES128 vector
// from NIST SP 800-38A, appendix F.3.
func TestCFB8NISTVector(t *testing.T) {
	key, _ := hex.DecodeString("2b7e151628aed2a6abf7158809cf4f3c")
	iv, _ := hex.DecodeString("000102030405060708090a0b0c0d0e0f")
	plain, _ := hex.DecodeString("6bc1bee22e409f96e93d7e117393172aae2d")
	want, _ := hex.DecodeString("3b79424c9c0dd436bace9e0ed4586a4f32b9")

	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	got := make([]byte, len(plain))
	newCFB8(block, iv, false).XORKeyStream(got, plain)
	if !bytes.Equal(got, want) {
		t.Fatalf("encrypt = %x, want %x", got, want)
	}

	back := make([]byte, len(want))
	newCFB8(block, iv, true).XORKeyStream(back, want)
	if !bytes.Equal(back, plain) {
		t.Fatalf("decrypt = %x, want %x", back, plain)
	}
}

// TestCFB8Chunking is the important one: the shift register has to carry
// across calls, so feeding the same bytes in different-sized pieces must
// produce identical output, and a decrypter chunked differently from the
// encrypter must still recover the plaintext.
func TestCFB8Chunking(t *testing.T) {
	key := []byte("0123456789abcdef")
	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}

	rng := rand.New(rand.NewSource(1))
	plain := make([]byte, 700)
	rng.Read(plain)

	// Reference: one shot.
	ref := make([]byte, len(plain))
	newCFB8(block, key, false).XORKeyStream(ref, plain)

	chunkings := [][]int{
		{1},
		{2},
		{3},
		{15},
		{16},
		{17},
		{1, 16, 3, 200, 1, 1, 5, 64},
		{700},
	}
	for _, sizes := range chunkings {
		enc := newCFB8(block, key, false)
		out := make([]byte, 0, len(plain))
		for i, j := 0, 0; i < len(plain); j++ {
			n := sizes[j%len(sizes)]
			if i+n > len(plain) {
				n = len(plain) - i
			}
			buf := make([]byte, n)
			enc.XORKeyStream(buf, plain[i:i+n])
			out = append(out, buf...)
			i += n
		}
		if !bytes.Equal(out, ref) {
			t.Fatalf("chunking %v produced different ciphertext", sizes)
		}

		// Decrypt with a deliberately different chunking.
		dec := newCFB8(block, key, true)
		back := make([]byte, 0, len(out))
		for i := 0; i < len(out); {
			n := 1 + rng.Intn(40)
			if i+n > len(out) {
				n = len(out) - i
			}
			buf := make([]byte, n)
			dec.XORKeyStream(buf, out[i:i+n])
			back = append(back, buf...)
			i += n
		}
		if !bytes.Equal(back, plain) {
			t.Fatalf("chunking %v did not round trip", sizes)
		}
	}
}

// TestCFB8InPlace covers dst and src being the same slice, which is how the
// connection's read path uses it.
func TestCFB8InPlace(t *testing.T) {
	key := []byte("fedcba9876543210")
	block, _ := aes.NewCipher(key)

	plain := []byte("the quick brown fox jumps over the lazy dog, twice over")
	buf := append([]byte(nil), plain...)
	newCFB8(block, key, false).XORKeyStream(buf, buf)
	if bytes.Equal(buf, plain) {
		t.Fatal("in-place encryption did nothing")
	}
	newCFB8(block, key, true).XORKeyStream(buf, buf)
	if !bytes.Equal(buf, plain) {
		t.Fatalf("in-place round trip = %q", buf)
	}
}

func TestCFB8ZeroLength(t *testing.T) {
	key := []byte("0123456789abcdef")
	block, _ := aes.NewCipher(key)
	s := newCFB8(block, key, false)
	s.XORKeyStream(nil, nil)
	// The register must not have advanced.
	got := make([]byte, 4)
	s.XORKeyStream(got, []byte{0, 0, 0, 0})
	want := make([]byte, 4)
	newCFB8(block, key, false).XORKeyStream(want, []byte{0, 0, 0, 0})
	if !bytes.Equal(got, want) {
		t.Error("an empty XORKeyStream advanced the keystream")
	}
}
