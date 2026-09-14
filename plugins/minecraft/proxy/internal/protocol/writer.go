package protocol

import (
	"encoding/binary"
	"math"
)

// Writer builds a packet payload. Every field method returns the Writer, so
// calls chain:
//
//	p := protocol.NewWriter(0x02).UUID(id).String(name).VarInt(0).Packet()
//
// No field method can fail, so none of them report an error; [Writer.Packet]
// finishes the packet and is the only call that produces a value.
type Writer struct {
	id  int32
	buf []byte
}

// NewWriter starts a packet with the given id.
func NewWriter(id int32) *Writer {
	return &Writer{id: id}
}

// Packet returns the finished packet. The Writer must not be used afterwards;
// further field calls may or may not be reflected in the returned Data.
func (w *Writer) Packet() *Packet {
	return &Packet{ID: w.id, Data: w.buf}
}

// Len reports the number of payload bytes written so far, excluding the id.
func (w *Writer) Len() int {
	return len(w.buf)
}

// VarInt appends a variable-length 32-bit integer.
func (w *Writer) VarInt(v int32) *Writer {
	w.buf = AppendVarInt(w.buf, v)
	return w
}

// VarLong appends a variable-length 64-bit integer.
func (w *Writer) VarLong(v int64) *Writer {
	u := uint64(v)
	for {
		if u&^0x7f == 0 {
			w.buf = append(w.buf, byte(u))
			return w
		}
		w.buf = append(w.buf, byte(u&0x7f)|0x80)
		u >>= 7
	}
}

// Bool appends a single byte, 1 or 0.
func (w *Writer) Bool(v bool) *Writer {
	if v {
		return w.UByte(1)
	}
	return w.UByte(0)
}

// Byte appends a signed byte.
func (w *Writer) Byte(v int8) *Writer {
	return w.UByte(uint8(v))
}

// UByte appends an unsigned byte.
func (w *Writer) UByte(v uint8) *Writer {
	w.buf = append(w.buf, v)
	return w
}

// Short appends a big-endian signed 16-bit integer.
func (w *Writer) Short(v int16) *Writer {
	return w.UShort(uint16(v))
}

// UShort appends a big-endian unsigned 16-bit integer.
func (w *Writer) UShort(v uint16) *Writer {
	w.buf = binary.BigEndian.AppendUint16(w.buf, v)
	return w
}

// Int appends a big-endian signed 32-bit integer.
func (w *Writer) Int(v int32) *Writer {
	w.buf = binary.BigEndian.AppendUint32(w.buf, uint32(v))
	return w
}

// Long appends a big-endian signed 64-bit integer.
func (w *Writer) Long(v int64) *Writer {
	w.buf = binary.BigEndian.AppendUint64(w.buf, uint64(v))
	return w
}

// Float appends a big-endian IEEE-754 single.
func (w *Writer) Float(v float32) *Writer {
	w.buf = binary.BigEndian.AppendUint32(w.buf, math.Float32bits(v))
	return w
}

// Double appends a big-endian IEEE-754 double.
func (w *Writer) Double(v float64) *Writer {
	w.buf = binary.BigEndian.AppendUint64(w.buf, math.Float64bits(v))
	return w
}

// String appends a VarInt byte-length prefix followed by the UTF-8 bytes of s.
func (w *Writer) String(s string) *Writer {
	w.buf = AppendVarInt(w.buf, int32(len(s)))
	w.buf = append(w.buf, s...)
	return w
}

// ByteArray appends a VarInt length prefix followed by b.
func (w *Writer) ByteArray(b []byte) *Writer {
	w.buf = AppendVarInt(w.buf, int32(len(b)))
	w.buf = append(w.buf, b...)
	return w
}

// Raw appends b with no length prefix, for payloads that are already encoded
// (NBT, a nested packet body, a pre-built chunk section).
func (w *Writer) Raw(b []byte) *Writer {
	w.buf = append(w.buf, b...)
	return w
}

// UUID appends a 128-bit identifier.
func (w *Writer) UUID(u UUID) *Writer {
	w.buf = append(w.buf, u[:]...)
	return w
}
