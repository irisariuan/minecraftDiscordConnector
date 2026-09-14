package nbt

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
)

// ErrTruncated is returned when a document ends in the middle of a tag.
var ErrTruncated = errors.New("nbt: truncated document")

// Unmarshal decodes a document whose root is a compound. When network is true
// the root is expected to carry no name, as in play-phase packets from 1.20.2
// onward; otherwise a two-byte-prefixed root name is read and discarded.
//
// Trailing bytes after the root compound are an error, so a caller that has
// sliced a packet payload correctly will notice if it has not.
func Unmarshal(b []byte, network bool) (Compound, error) {
	d := &decoder{buf: b}
	t, err := d.u8()
	if err != nil {
		return nil, err
	}
	if t != TypeCompound {
		return nil, fmt.Errorf("nbt: root is %s, want TAG_Compound", TypeName(t))
	}
	if !network {
		if _, err := d.str(); err != nil {
			return nil, fmt.Errorf("nbt: root name: %w", err)
		}
	}
	c, err := d.compound(0)
	if err != nil {
		return nil, err
	}
	if d.pos != len(d.buf) {
		return nil, fmt.Errorf("nbt: %d bytes left after root compound", len(d.buf)-d.pos)
	}
	return c, nil
}

type decoder struct {
	buf []byte
	pos int
}

func (d *decoder) take(n int) ([]byte, error) {
	if n < 0 || len(d.buf)-d.pos < n {
		return nil, ErrTruncated
	}
	b := d.buf[d.pos : d.pos+n]
	d.pos += n
	return b, nil
}

func (d *decoder) u8() (byte, error) {
	b, err := d.take(1)
	if err != nil {
		return 0, err
	}
	return b[0], nil
}

func (d *decoder) u16() (uint16, error) {
	b, err := d.take(2)
	if err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint16(b), nil
}

func (d *decoder) u32() (uint32, error) {
	b, err := d.take(4)
	if err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint32(b), nil
}

func (d *decoder) u64() (uint64, error) {
	b, err := d.take(8)
	if err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint64(b), nil
}

func (d *decoder) str() (string, error) {
	n, err := d.u16()
	if err != nil {
		return "", err
	}
	b, err := d.take(int(n))
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// count reads an int32 element count and checks it against the bytes actually
// left, so a bogus length cannot drive a huge allocation.
func (d *decoder) count(elemSize int) (int, error) {
	n, err := d.u32()
	if err != nil {
		return 0, err
	}
	if int32(n) < 0 {
		return 0, fmt.Errorf("nbt: negative length %d", int32(n))
	}
	if elemSize > 0 && int64(n)*int64(elemSize) > int64(len(d.buf)-d.pos) {
		return 0, ErrTruncated
	}
	if int64(n) > int64(math.MaxInt32) {
		return 0, ErrTruncated
	}
	return int(n), nil
}

func (d *decoder) compound(depth int) (Compound, error) {
	if depth > MaxDepth {
		return nil, fmt.Errorf("nbt: nesting deeper than %d", MaxDepth)
	}
	c := Compound{}
	for {
		t, err := d.u8()
		if err != nil {
			return nil, err
		}
		if t == TypeEnd {
			return c, nil
		}
		name, err := d.str()
		if err != nil {
			return nil, err
		}
		v, err := d.payload(t, depth+1)
		if err != nil {
			return nil, fmt.Errorf("nbt: key %q: %w", name, err)
		}
		c[name] = v
	}
}

func (d *decoder) payload(t byte, depth int) (Tag, error) {
	if depth > MaxDepth {
		return nil, fmt.Errorf("nbt: nesting deeper than %d", MaxDepth)
	}
	switch t {
	case TypeByte:
		v, err := d.u8()
		return Byte(v), err
	case TypeShort:
		v, err := d.u16()
		return Short(v), err
	case TypeInt:
		v, err := d.u32()
		return Int(v), err
	case TypeLong:
		v, err := d.u64()
		return Long(v), err
	case TypeFloat:
		v, err := d.u32()
		return Float(math.Float32frombits(v)), err
	case TypeDouble:
		v, err := d.u64()
		return Double(math.Float64frombits(v)), err
	case TypeString:
		v, err := d.str()
		return String(v), err
	case TypeByteArray:
		n, err := d.count(1)
		if err != nil {
			return nil, err
		}
		b, err := d.take(n)
		if err != nil {
			return nil, err
		}
		out := make(ByteArray, n)
		copy(out, b)
		return out, nil
	case TypeIntArray:
		n, err := d.count(4)
		if err != nil {
			return nil, err
		}
		out := make(IntArray, n)
		for i := range out {
			v, err := d.u32()
			if err != nil {
				return nil, err
			}
			out[i] = int32(v)
		}
		return out, nil
	case TypeLongArray:
		n, err := d.count(8)
		if err != nil {
			return nil, err
		}
		out := make(LongArray, n)
		for i := range out {
			v, err := d.u64()
			if err != nil {
				return nil, err
			}
			out[i] = int64(v)
		}
		return out, nil
	case TypeList:
		return d.list(depth)
	case TypeCompound:
		return d.compound(depth)
	default:
		return nil, fmt.Errorf("nbt: unknown tag id %d", t)
	}
}

func (d *decoder) list(depth int) (List, error) {
	elemType, err := d.u8()
	if err != nil {
		return List{}, err
	}
	// Every element occupies at least one byte, so the count can be bounded
	// by the bytes remaining.
	n, err := d.count(1)
	if err != nil {
		return List{}, err
	}
	if elemType == TypeEnd {
		if n != 0 {
			return List{}, fmt.Errorf("nbt: TAG_End list with %d elements", n)
		}
		return List{ElemType: TypeEnd}, nil
	}
	l := List{ElemType: elemType, Elems: make([]Tag, 0, min(n, 1024))}
	for i := 0; i < n; i++ {
		v, err := d.payload(elemType, depth+1)
		if err != nil {
			return List{}, fmt.Errorf("nbt: index %d: %w", i, err)
		}
		l.Elems = append(l.Elems, v)
	}
	return l, nil
}
