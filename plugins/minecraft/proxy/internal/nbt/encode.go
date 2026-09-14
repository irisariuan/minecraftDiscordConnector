package nbt

import (
	"encoding/binary"
	"fmt"
	"math"
	"sort"
)

// MarshalNetwork encodes c as network NBT: the compound tag id followed
// directly by the payload, with no root name. This is the form used by
// play-phase packets from 1.20.2 onward.
func MarshalNetwork(c Compound) ([]byte, error) {
	buf := make([]byte, 0, 256)
	buf = append(buf, TypeCompound)
	return appendCompound(buf, c)
}

// MarshalNamed encodes c as a classic named NBT document: the compound tag id,
// a two-byte-prefixed name, then the payload. Pass an empty name for the
// conventional unnamed root of a file or a pre-1.20.2 packet.
func MarshalNamed(name string, c Compound) ([]byte, error) {
	if len(name) > math.MaxUint16 {
		return nil, fmt.Errorf("nbt: root name of %d bytes is too long", len(name))
	}
	buf := make([]byte, 0, 256+len(name))
	buf = append(buf, TypeCompound)
	buf = appendString(buf, name)
	return appendCompound(buf, c)
}

func appendString(b []byte, s string) []byte {
	b = binary.BigEndian.AppendUint16(b, uint16(len(s)))
	return append(b, s...)
}

func appendCompound(b []byte, c Compound) ([]byte, error) {
	keys := make([]string, 0, len(c))
	for k := range c {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var err error
	for _, k := range keys {
		v := c[k]
		if v == nil {
			return nil, fmt.Errorf("nbt: nil tag at key %q", k)
		}
		if len(k) > math.MaxUint16 {
			return nil, fmt.Errorf("nbt: key of %d bytes is too long", len(k))
		}
		b = append(b, v.TagType())
		b = appendString(b, k)
		if b, err = appendPayload(b, v); err != nil {
			return nil, fmt.Errorf("nbt: key %q: %w", k, err)
		}
	}
	return append(b, TypeEnd), nil
}

func appendPayload(b []byte, t Tag) ([]byte, error) {
	switch v := t.(type) {
	case Byte:
		return append(b, byte(v)), nil
	case Short:
		return binary.BigEndian.AppendUint16(b, uint16(v)), nil
	case Int:
		return binary.BigEndian.AppendUint32(b, uint32(v)), nil
	case Long:
		return binary.BigEndian.AppendUint64(b, uint64(v)), nil
	case Float:
		return binary.BigEndian.AppendUint32(b, math.Float32bits(float32(v))), nil
	case Double:
		return binary.BigEndian.AppendUint64(b, math.Float64bits(float64(v))), nil
	case String:
		if len(v) > math.MaxUint16 {
			return nil, fmt.Errorf("string of %d bytes is too long", len(v))
		}
		return appendString(b, string(v)), nil
	case ByteArray:
		b = binary.BigEndian.AppendUint32(b, uint32(len(v)))
		return append(b, v...), nil
	case IntArray:
		b = binary.BigEndian.AppendUint32(b, uint32(len(v)))
		for _, n := range v {
			b = binary.BigEndian.AppendUint32(b, uint32(n))
		}
		return b, nil
	case LongArray:
		b = binary.BigEndian.AppendUint32(b, uint32(len(v)))
		for _, n := range v {
			b = binary.BigEndian.AppendUint64(b, uint64(n))
		}
		return b, nil
	case List:
		return appendList(b, v)
	case Compound:
		return appendCompound(b, v)
	default:
		return nil, fmt.Errorf("unsupported tag %T", t)
	}
}

func appendList(b []byte, l List) ([]byte, error) {
	elemType := l.ElemType
	if len(l.Elems) == 0 {
		// An empty list has no element type to speak of; TAG_End is the
		// conventional filler and what every implementation writes.
		b = append(b, TypeEnd)
		return binary.BigEndian.AppendUint32(b, 0), nil
	}
	if elemType == TypeEnd {
		elemType = l.Elems[0].TagType()
	}
	b = append(b, elemType)
	b = binary.BigEndian.AppendUint32(b, uint32(len(l.Elems)))
	var err error
	for i, e := range l.Elems {
		if e == nil {
			return nil, fmt.Errorf("nil element at index %d", i)
		}
		if e.TagType() != elemType {
			return nil, fmt.Errorf("list of %s has %s at index %d",
				TypeName(elemType), TypeName(e.TagType()), i)
		}
		if b, err = appendPayload(b, e); err != nil {
			return nil, fmt.Errorf("index %d: %w", i, err)
		}
	}
	return b, nil
}
