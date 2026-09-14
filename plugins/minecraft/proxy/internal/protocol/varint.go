package protocol

import (
	"errors"
	"io"
)

// MaxVarIntLen is the largest number of bytes a 32-bit VarInt can occupy.
const MaxVarIntLen = 5

// ErrVarIntTooLong is returned when a VarInt does not terminate within
// [MaxVarIntLen] bytes.
var ErrVarIntTooLong = errors.New("protocol: VarInt too long")

// ReadVarInt reads a single VarInt from r.
//
// If r implements io.ByteReader it is used directly; otherwise r is read one
// byte at a time, so an unbuffered reader will make up to five syscalls. A
// clean end of stream before any byte has been consumed is reported as
// [io.EOF]; a truncation part way through a VarInt is reported as
// [io.ErrUnexpectedEOF].
func ReadVarInt(r io.Reader) (int32, error) {
	br, ok := r.(io.ByteReader)
	if !ok {
		br = &singleByteReader{r: r}
	}
	var value uint32
	for i := 0; i < MaxVarIntLen; i++ {
		b, err := br.ReadByte()
		if err != nil {
			if err == io.EOF && i > 0 {
				err = io.ErrUnexpectedEOF
			}
			return 0, err
		}
		value |= uint32(b&0x7f) << (7 * i)
		if b&0x80 == 0 {
			return int32(value), nil
		}
	}
	return 0, ErrVarIntTooLong
}

// WriteVarInt writes v to w as a VarInt.
func WriteVarInt(w io.Writer, v int32) error {
	var buf [MaxVarIntLen]byte
	b := AppendVarInt(buf[:0], v)
	_, err := w.Write(b)
	return err
}

// AppendVarInt appends the VarInt encoding of v to b and returns the extended
// slice.
func AppendVarInt(b []byte, v int32) []byte {
	u := uint32(v)
	for {
		if u&^0x7f == 0 {
			return append(b, byte(u))
		}
		b = append(b, byte(u&0x7f)|0x80)
		u >>= 7
	}
}

// VarIntLen reports how many bytes the VarInt encoding of v occupies.
func VarIntLen(v int32) int {
	u := uint32(v)
	n := 1
	for u >= 0x80 {
		u >>= 7
		n++
	}
	return n
}

type singleByteReader struct {
	r   io.Reader
	buf [1]byte
}

func (s *singleByteReader) ReadByte() (byte, error) {
	for {
		n, err := s.r.Read(s.buf[:])
		if n > 0 {
			return s.buf[0], nil
		}
		if err != nil {
			return 0, err
		}
	}
}
