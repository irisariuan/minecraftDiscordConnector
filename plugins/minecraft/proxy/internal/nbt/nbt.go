// Package nbt implements the slice of Minecraft's NBT format that the
// play-phase packets need: enough to build a registry codec, a dimension
// entry or an empty chunk's heightmap, and enough to read one back.
//
// # Named and network NBT
//
// A classic NBT document is a tag id, a name, and a payload; the root is
// always a compound, so it begins 0x0A followed by a two-byte-prefixed name
// that is conventionally empty. From 1.20.2 the network form drops the root
// name entirely: 0x0A followed straight by the compound payload. Both forms
// are supported — [MarshalNetwork] and [MarshalNamed] to write, [Unmarshal]
// with the network flag to read.
//
// Compound keys are written in sorted order, so the encoding of a given value
// is deterministic.
//
// # Limits
//
// Strings are encoded as plain UTF-8. Real NBT uses Java's modified UTF-8,
// which differs only for U+0000 and for characters outside the basic
// multilingual plane; neither appears in the identifiers and translation keys
// this package is used for. Decoding enforces a nesting depth limit so a
// hostile document cannot exhaust the stack.
package nbt

import "fmt"

// Tag ids as they appear on the wire.
const (
	TypeEnd       byte = 0
	TypeByte      byte = 1
	TypeShort     byte = 2
	TypeInt       byte = 3
	TypeLong      byte = 4
	TypeFloat     byte = 5
	TypeDouble    byte = 6
	TypeByteArray byte = 7
	TypeString    byte = 8
	TypeList      byte = 9
	TypeCompound  byte = 10
	TypeIntArray  byte = 11
	TypeLongArray byte = 12
)

// MaxDepth is the deepest nesting [Unmarshal] will follow.
const MaxDepth = 512

// Tag is any NBT value. The concrete types are [Byte], [Short], [Int],
// [Long], [Float], [Double], [ByteArray], [String], [List], [Compound],
// [IntArray] and [LongArray].
type Tag interface {
	// TagType returns the wire id of the tag.
	TagType() byte
}

// Scalar and array tags. These are defined types over their Go equivalents,
// so they convert freely: nbt.Int(3), int32(someTag).
type (
	// Byte is TAG_Byte, also used for booleans (0 or 1).
	Byte int8
	// Short is TAG_Short.
	Short int16
	// Int is TAG_Int.
	Int int32
	// Long is TAG_Long.
	Long int64
	// Float is TAG_Float.
	Float float32
	// Double is TAG_Double.
	Double float64
	// String is TAG_String.
	String string
	// ByteArray is TAG_Byte_Array.
	ByteArray []byte
	// IntArray is TAG_Int_Array.
	IntArray []int32
	// LongArray is TAG_Long_Array, the shape a chunk heightmap takes.
	LongArray []int64
)

// Compound is TAG_Compound, a set of named tags.
type Compound map[string]Tag

// List is TAG_List, a run of unnamed tags that all share one type.
//
// ElemType must be the type of every element in Elems. An empty list carries
// ElemType [TypeEnd] by convention, which is what the zero List encodes as.
type List struct {
	ElemType byte
	Elems    []Tag
}

func (Byte) TagType() byte      { return TypeByte }
func (Short) TagType() byte     { return TypeShort }
func (Int) TagType() byte       { return TypeInt }
func (Long) TagType() byte      { return TypeLong }
func (Float) TagType() byte     { return TypeFloat }
func (Double) TagType() byte    { return TypeDouble }
func (String) TagType() byte    { return TypeString }
func (ByteArray) TagType() byte { return TypeByteArray }
func (IntArray) TagType() byte  { return TypeIntArray }
func (LongArray) TagType() byte { return TypeLongArray }
func (Compound) TagType() byte  { return TypeCompound }
func (List) TagType() byte      { return TypeList }

// Bool returns b as the [Byte] tag Minecraft uses for booleans.
func Bool(b bool) Byte {
	if b {
		return 1
	}
	return 0
}

// NewList builds a [List] from elems, taking the element type from the first
// entry. An empty elems yields the empty list.
func NewList(elems ...Tag) List {
	if len(elems) == 0 {
		return List{ElemType: TypeEnd}
	}
	return List{ElemType: elems[0].TagType(), Elems: elems}
}

// TypeName returns a readable name for a tag id, for error messages.
func TypeName(t byte) string {
	switch t {
	case TypeEnd:
		return "TAG_End"
	case TypeByte:
		return "TAG_Byte"
	case TypeShort:
		return "TAG_Short"
	case TypeInt:
		return "TAG_Int"
	case TypeLong:
		return "TAG_Long"
	case TypeFloat:
		return "TAG_Float"
	case TypeDouble:
		return "TAG_Double"
	case TypeByteArray:
		return "TAG_Byte_Array"
	case TypeString:
		return "TAG_String"
	case TypeList:
		return "TAG_List"
	case TypeCompound:
		return "TAG_Compound"
	case TypeIntArray:
		return "TAG_Int_Array"
	case TypeLongArray:
		return "TAG_Long_Array"
	default:
		return fmt.Sprintf("TAG_Unknown(%d)", t)
	}
}
