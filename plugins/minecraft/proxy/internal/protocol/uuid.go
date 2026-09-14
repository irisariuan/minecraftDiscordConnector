package protocol

import (
	"crypto/md5"
	"errors"
	"fmt"
)

// UUID is a 128-bit identifier in the big-endian byte order used on the wire.
type UUID [16]byte

// ErrInvalidUUID is returned by [ParseUUID] for input that is not a UUID in
// either the dashed or the undashed form.
var ErrInvalidUUID = errors.New("protocol: invalid UUID")

const hexDigits = "0123456789abcdef"

// ParseUUID parses the dashed ("069a79f4-44e9-4726-a5be-fca90e38aaf5") or
// undashed ("069a79f444e94726a5befca90e38aaf5") hexadecimal form. Case is
// ignored. Mojang's API returns the undashed form; almost everything else uses
// the dashed one.
func ParseUUID(s string) (UUID, error) {
	var u UUID
	switch len(s) {
	case 32:
		for i := 0; i < 16; i++ {
			hi, ok1 := unhex(s[i*2])
			lo, ok2 := unhex(s[i*2+1])
			if !ok1 || !ok2 {
				return UUID{}, ErrInvalidUUID
			}
			u[i] = hi<<4 | lo
		}
		return u, nil
	case 36:
		if s[8] != '-' || s[13] != '-' || s[18] != '-' || s[23] != '-' {
			return UUID{}, ErrInvalidUUID
		}
		groups := [...][2]int{{0, 8}, {9, 13}, {14, 18}, {19, 23}, {24, 36}}
		n := 0
		for _, g := range groups {
			for i := g[0]; i < g[1]; i += 2 {
				hi, ok1 := unhex(s[i])
				lo, ok2 := unhex(s[i+1])
				if !ok1 || !ok2 {
					return UUID{}, ErrInvalidUUID
				}
				u[n] = hi<<4 | lo
				n++
			}
		}
		return u, nil
	default:
		return UUID{}, fmt.Errorf("%w: bad length %d", ErrInvalidUUID, len(s))
	}
}

func unhex(c byte) (byte, bool) {
	switch {
	case c >= '0' && c <= '9':
		return c - '0', true
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10, true
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10, true
	}
	return 0, false
}

// String returns the lowercase dashed form.
func (u UUID) String() string {
	var b [36]byte
	n := 0
	for i := 0; i < 16; i++ {
		if i == 4 || i == 6 || i == 8 || i == 10 {
			b[n] = '-'
			n++
		}
		b[n] = hexDigits[u[i]>>4]
		b[n+1] = hexDigits[u[i]&0x0f]
		n += 2
	}
	return string(b[:])
}

// Undashed returns the lowercase 32-character form used by the Mojang API.
func (u UUID) Undashed() string {
	var b [32]byte
	for i := 0; i < 16; i++ {
		b[i*2] = hexDigits[u[i]>>4]
		b[i*2+1] = hexDigits[u[i]&0x0f]
	}
	return string(b[:])
}

// IsZero reports whether u is the all-zero UUID.
func (u UUID) IsZero() bool {
	return u == UUID{}
}

// OfflineUUID derives the UUID an offline-mode server would assign to name: a
// version 3 (MD5, name-based) UUID over the UTF-8 bytes of
// "OfflinePlayer:<name>". The name is used exactly as given, so casing matters
// — this is how vanilla behaves.
func OfflineUUID(name string) UUID {
	sum := md5.Sum([]byte("OfflinePlayer:" + name))
	var u UUID
	copy(u[:], sum[:])
	u[6] = (u[6] & 0x0f) | 0x30 // version 3
	u[8] = (u[8] & 0x3f) | 0x80 // RFC 4122 variant
	return u
}
