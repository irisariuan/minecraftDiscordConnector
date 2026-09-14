package protocol

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"unicode/utf8"
)

// ErrShortBuffer is returned when a field extends past the end of the packet
// payload.
var ErrShortBuffer = errors.New("protocol: packet truncated")

// ErrStringTooLong is returned when a length-prefixed string exceeds the
// caller's limit.
var ErrStringTooLong = errors.New("protocol: string too long")

// Packet is one decoded packet: its id and the payload that followed, with
// the length prefix, compression wrapper and encryption all removed.
//
// Data aliases the buffer the packet was decoded into and is owned by the
// caller; it is not reused by the connection.
type Packet struct {
	ID   int32
	Data []byte
}

// Reader decodes fields out of a packet payload. Every method reports an error
// instead of panicking when the buffer is short or malformed; once a read
// fails the Reader's position is unchanged, so a caller that ignores errors
// gets zero values rather than misaligned ones.
//
// Slices returned by [Reader.Bytes], [Reader.ByteArray] and
// [Reader.Remaining] alias the underlying buffer. Copy them if they must
// outlive it.
type Reader struct {
	data []byte
	pos  int
}

// NewReader returns a Reader over data. data is not copied.
func NewReader(data []byte) *Reader {
	return &Reader{data: data}
}

// Len reports how many bytes are left unread.
func (r *Reader) Len() int {
	return len(r.data) - r.pos
}

// Remaining returns the unread bytes without consuming them.
func (r *Reader) Remaining() []byte {
	return r.data[r.pos:]
}

// Bytes consumes and returns the next n bytes.
func (r *Reader) Bytes(n int) ([]byte, error) {
	if n < 0 {
		return nil, fmt.Errorf("protocol: negative length %d", n)
	}
	if r.Len() < n {
		return nil, ErrShortBuffer
	}
	b := r.data[r.pos : r.pos+n]
	r.pos += n
	return b, nil
}

// VarInt reads a variable-length 32-bit integer.
func (r *Reader) VarInt() (int32, error) {
	var value uint32
	for i := 0; i < MaxVarIntLen; i++ {
		if r.pos+i >= len(r.data) {
			return 0, ErrShortBuffer
		}
		b := r.data[r.pos+i]
		value |= uint32(b&0x7f) << (7 * i)
		if b&0x80 == 0 {
			r.pos += i + 1
			return int32(value), nil
		}
	}
	return 0, ErrVarIntTooLong
}

// VarLong reads a variable-length 64-bit integer.
func (r *Reader) VarLong() (int64, error) {
	var value uint64
	for i := 0; i < 10; i++ {
		if r.pos+i >= len(r.data) {
			return 0, ErrShortBuffer
		}
		b := r.data[r.pos+i]
		value |= uint64(b&0x7f) << (7 * i)
		if b&0x80 == 0 {
			r.pos += i + 1
			return int64(value), nil
		}
	}
	return 0, errors.New("protocol: VarLong too long")
}

// Bool reads a single byte, where any non-zero value is true.
func (r *Reader) Bool() (bool, error) {
	b, err := r.UByte()
	return b != 0, err
}

// Byte reads a signed byte.
func (r *Reader) Byte() (int8, error) {
	b, err := r.UByte()
	return int8(b), err
}

// UByte reads an unsigned byte.
func (r *Reader) UByte() (uint8, error) {
	if r.Len() < 1 {
		return 0, ErrShortBuffer
	}
	b := r.data[r.pos]
	r.pos++
	return b, nil
}

// Short reads a big-endian signed 16-bit integer.
func (r *Reader) Short() (int16, error) {
	v, err := r.UShort()
	return int16(v), err
}

// UShort reads a big-endian unsigned 16-bit integer.
func (r *Reader) UShort() (uint16, error) {
	b, err := r.Bytes(2)
	if err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint16(b), nil
}

// Int reads a big-endian signed 32-bit integer.
func (r *Reader) Int() (int32, error) {
	b, err := r.Bytes(4)
	if err != nil {
		return 0, err
	}
	return int32(binary.BigEndian.Uint32(b)), nil
}

// Long reads a big-endian signed 64-bit integer.
func (r *Reader) Long() (int64, error) {
	b, err := r.Bytes(8)
	if err != nil {
		return 0, err
	}
	return int64(binary.BigEndian.Uint64(b)), nil
}

// Float reads a big-endian IEEE-754 single.
func (r *Reader) Float() (float32, error) {
	b, err := r.Bytes(4)
	if err != nil {
		return 0, err
	}
	return math.Float32frombits(binary.BigEndian.Uint32(b)), nil
}

// Double reads a big-endian IEEE-754 double.
func (r *Reader) Double() (float64, error) {
	b, err := r.Bytes(8)
	if err != nil {
		return 0, err
	}
	return math.Float64frombits(binary.BigEndian.Uint64(b)), nil
}

// String reads a VarInt-prefixed UTF-8 string of at most max runes. The wire
// prefix counts bytes, so the byte length is additionally rejected above
// max*4, the largest a max-rune string can be, before anything is read. A max
// of zero or less means no limit.
//
// The result is a copy and does not alias the packet buffer.
func (r *Reader) String(max int) (string, error) {
	n, err := r.VarInt()
	if err != nil {
		return "", err
	}
	if n < 0 {
		return "", fmt.Errorf("protocol: negative string length %d", n)
	}
	if max > 0 && int64(n) > int64(max)*4 {
		return "", fmt.Errorf("%w: %d bytes, limit %d runes", ErrStringTooLong, n, max)
	}
	b, err := r.Bytes(int(n))
	if err != nil {
		return "", err
	}
	if max > 0 && utf8.RuneCount(b) > max {
		return "", fmt.Errorf("%w: %d runes, limit %d", ErrStringTooLong, utf8.RuneCount(b), max)
	}
	return string(b), nil
}

// ByteArray reads a VarInt-prefixed run of bytes. The result aliases the
// packet buffer.
func (r *Reader) ByteArray() ([]byte, error) {
	n, err := r.VarInt()
	if err != nil {
		return nil, err
	}
	if n < 0 {
		return nil, fmt.Errorf("protocol: negative array length %d", n)
	}
	return r.Bytes(int(n))
}

// UUID reads a 128-bit identifier.
func (r *Reader) UUID() (UUID, error) {
	b, err := r.Bytes(16)
	if err != nil {
		return UUID{}, err
	}
	var u UUID
	copy(u[:], b)
	return u, nil
}
