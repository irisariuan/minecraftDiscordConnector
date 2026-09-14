package protocol

import "crypto/cipher"

// cfb8 is AES in CFB mode with a segment size of one byte, the mode Minecraft
// uses. Go's crypto/cipher CFB helpers are full-block CFB, which is a
// different and incompatible construction, so the mode is implemented here.
//
// For every byte the shift register is encrypted, the byte is XORed with the
// first byte of that output, and the register is shifted one position left
// with the ciphertext byte appended. Encrypting and decrypting differ only in
// which byte — output or input — is the ciphertext byte to feed back.
//
// A cfb8 is not safe for concurrent use; one instance belongs to one
// direction of one connection.
type cfb8 struct {
	block   cipher.Block
	reg     []byte
	scratch []byte
	decrypt bool
}

// newCFB8 returns a byte-at-a-time CFB stream over block, starting from iv.
// The iv is copied. Minecraft passes the shared secret as both key and iv.
func newCFB8(block cipher.Block, iv []byte, decrypt bool) *cfb8 {
	bs := block.BlockSize()
	if len(iv) != bs {
		panic("protocol: cfb8 iv length does not match block size")
	}
	c := &cfb8{
		block:   block,
		reg:     make([]byte, bs),
		scratch: make([]byte, bs),
		decrypt: decrypt,
	}
	copy(c.reg, iv)
	return c
}

// XORKeyStream implements [cipher.Stream]. dst and src may be the same slice,
// and calls may be made with any chunking: the register carries across calls.
func (c *cfb8) XORKeyStream(dst, src []byte) {
	if len(dst) < len(src) {
		panic("protocol: cfb8 output smaller than input")
	}
	last := len(c.reg) - 1
	for i := 0; i < len(src); i++ {
		in := src[i]
		c.block.Encrypt(c.scratch, c.reg)
		out := in ^ c.scratch[0]
		copy(c.reg, c.reg[1:])
		if c.decrypt {
			c.reg[last] = in
		} else {
			c.reg[last] = out
		}
		dst[i] = out
	}
}
