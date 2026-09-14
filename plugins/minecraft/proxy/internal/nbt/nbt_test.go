package nbt

import (
	"bytes"
	"encoding/binary"
	"math"
	"reflect"
	"testing"
)

// sample is shaped like the dimension codec the limbo world needs: a nested
// compound, a list of compounds, a long array the size of a heightmap word
// run, and a negative int.
func sample() Compound {
	return Compound{
		"minecraft:dimension_type": Compound{
			"type": String("minecraft:dimension_type"),
			"value": NewList(
				Compound{
					"name": String("minecraft:overworld"),
					"id":   Int(0),
					"element": Compound{
						"piglin_safe":          Bool(false),
						"has_raids":            Bool(true),
						"ambient_light":        Float(0),
						"coordinate_scale":     Double(1),
						"min_y":                Int(-64),
						"height":               Int(384),
						"logical_height":       Int(384),
						"monster_spawn_light_": Byte(-1),
					},
				},
				Compound{
					"name":    String("minecraft:the_nether"),
					"id":      Int(1),
					"element": Compound{"min_y": Int(0), "height": Int(256)},
				},
			),
		},
		"heightmap": LongArray{0, -1, math.MaxInt64, math.MinInt64, 0x0123456789abcdef},
		"blocks":    ByteArray{0, 1, 2, 0xff},
		"sections":  IntArray{-1, 0, 2147483647},
		"depth":     Short(-300),
		"seed":      Long(-8888888888),
		"empty":     List{},
		"emptyC":    Compound{},
	}
}

func TestRoundTripNetwork(t *testing.T) {
	in := sample()
	b, err := MarshalNetwork(in)
	if err != nil {
		t.Fatalf("MarshalNetwork: %v", err)
	}
	if b[0] != TypeCompound {
		t.Fatalf("first byte = %d, want TAG_Compound", b[0])
	}
	// Network form carries no root name, so the second byte is the first
	// child's tag id, not a length prefix.
	if b[1] == 0 && b[2] == 0 {
		t.Error("network form appears to have written a root name")
	}

	out, err := Unmarshal(b, true)
	if err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if !reflect.DeepEqual(in, out) {
		t.Errorf("round trip changed the document:\n got %#v\nwant %#v", out, in)
	}
}

func TestRoundTripNamed(t *testing.T) {
	in := sample()
	for _, name := range []string{"", "root", "a longer root name"} {
		b, err := MarshalNamed(name, in)
		if err != nil {
			t.Fatalf("MarshalNamed(%q): %v", name, err)
		}
		if got := binary.BigEndian.Uint16(b[1:3]); int(got) != len(name) {
			t.Errorf("name length prefix = %d, want %d", got, len(name))
		}
		if string(b[3:3+len(name)]) != name {
			t.Errorf("root name not written")
		}
		out, err := Unmarshal(b, false)
		if err != nil {
			t.Fatalf("Unmarshal named: %v", err)
		}
		if !reflect.DeepEqual(in, out) {
			t.Errorf("named round trip changed the document")
		}
	}
}

func TestNegativeScalars(t *testing.T) {
	in := Compound{
		"b": Byte(-128),
		"s": Short(math.MinInt16),
		"i": Int(math.MinInt32),
		"l": Long(math.MinInt64),
		"f": Float(-1.5),
		"d": Double(-2.25),
		"a": LongArray{math.MinInt64, -1},
		"n": IntArray{math.MinInt32, -1},
	}
	b, err := MarshalNetwork(in)
	if err != nil {
		t.Fatal(err)
	}
	out, err := Unmarshal(b, true)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(in, out) {
		t.Errorf("got %#v, want %#v", out, in)
	}
}

func TestDeterministicOutput(t *testing.T) {
	in := sample()
	first, err := MarshalNetwork(in)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 20; i++ {
		again, err := MarshalNetwork(in)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(first, again) {
			t.Fatal("encoding is not deterministic across runs")
		}
	}
}

// TestKnownEncoding pins the byte layout so a change to the encoder is
// noticed rather than silently reinterpreted by the decoder.
func TestKnownEncoding(t *testing.T) {
	b, err := MarshalNetwork(Compound{"a": Byte(1), "b": String("hi")})
	if err != nil {
		t.Fatal(err)
	}
	want := []byte{
		TypeCompound,
		TypeByte, 0, 1, 'a', 0x01,
		TypeString, 0, 1, 'b', 0, 2, 'h', 'i',
		TypeEnd,
	}
	if !bytes.Equal(b, want) {
		t.Errorf("got % x\nwant % x", b, want)
	}

	named, err := MarshalNamed("", Compound{"a": Byte(1), "b": String("hi")})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(named, append([]byte{TypeCompound, 0, 0}, want[1:]...)) {
		t.Errorf("named form = % x", named)
	}
}

func TestEmptyListEncoding(t *testing.T) {
	b, err := MarshalNetwork(Compound{"l": List{ElemType: TypeCompound}})
	if err != nil {
		t.Fatal(err)
	}
	want := []byte{TypeCompound, TypeList, 0, 1, 'l', TypeEnd, 0, 0, 0, 0, TypeEnd}
	if !bytes.Equal(b, want) {
		t.Errorf("got % x, want % x", b, want)
	}
	out, err := Unmarshal(b, true)
	if err != nil {
		t.Fatal(err)
	}
	l := out["l"].(List)
	if l.ElemType != TypeEnd || len(l.Elems) != 0 {
		t.Errorf("empty list decoded as %+v", l)
	}
}

func TestNewListInfersType(t *testing.T) {
	l := NewList(String("a"), String("b"))
	if l.ElemType != TypeString || len(l.Elems) != 2 {
		t.Errorf("NewList = %+v", l)
	}
	if e := NewList(); e.ElemType != TypeEnd || len(e.Elems) != 0 {
		t.Errorf("NewList() = %+v", e)
	}
	// An unset ElemType is filled in at encode time from the first element.
	b, err := MarshalNetwork(Compound{"l": List{Elems: []Tag{Int(1), Int(2)}}})
	if err != nil {
		t.Fatal(err)
	}
	out, _ := Unmarshal(b, true)
	if got := out["l"].(List); got.ElemType != TypeInt {
		t.Errorf("inferred element type = %d", got.ElemType)
	}
}

func TestMarshalErrors(t *testing.T) {
	if _, err := MarshalNetwork(Compound{"x": nil}); err == nil {
		t.Error("a nil tag was accepted")
	}
	mixed := List{ElemType: TypeInt, Elems: []Tag{Int(1), String("no")}}
	if _, err := MarshalNetwork(Compound{"l": mixed}); err == nil {
		t.Error("a mixed-type list was accepted")
	}
	if _, err := MarshalNetwork(Compound{"s": String(string(make([]byte, 70000)))}); err == nil {
		t.Error("an over-long string was accepted")
	}
	if _, err := MarshalNamed(string(make([]byte, 70000)), Compound{}); err == nil {
		t.Error("an over-long root name was accepted")
	}
}

func TestUnmarshalErrors(t *testing.T) {
	good, err := MarshalNetwork(sample())
	if err != nil {
		t.Fatal(err)
	}

	if _, err := Unmarshal(nil, true); err == nil {
		t.Error("an empty document was accepted")
	}
	if _, err := Unmarshal([]byte{TypeString, 0, 0}, true); err == nil {
		t.Error("a non-compound root was accepted")
	}
	if _, err := Unmarshal(append(append([]byte(nil), good...), 0x00), true); err == nil {
		t.Error("trailing bytes were accepted")
	}
	if _, err := Unmarshal(good, false); err == nil {
		t.Error("network form decoded as named without complaint")
	}
	// No truncation may panic, and none may reproduce the original document.
	for n := 1; n < len(good); n++ {
		out, err := Unmarshal(good[:n], true)
		if err == nil && reflect.DeepEqual(out, sample()) {
			t.Errorf("a document truncated to %d bytes decoded as the original", n)
		}
	}

	// A length field that outruns the buffer must not drive an allocation.
	huge := []byte{TypeCompound, TypeLongArray, 0, 1, 'x', 0x7f, 0xff, 0xff, 0xff, TypeEnd}
	if _, err := Unmarshal(huge, true); err == nil {
		t.Error("a bogus long-array length was accepted")
	}
	if _, err := Unmarshal([]byte{TypeCompound, 0x63, 0, 1, 'x', TypeEnd}, true); err == nil {
		t.Error("an unknown tag id was accepted")
	}
	// TAG_End lists must be empty.
	bogus := []byte{TypeCompound, TypeList, 0, 1, 'x', TypeEnd, 0, 0, 0, 1, TypeEnd}
	if _, err := Unmarshal(bogus, true); err == nil {
		t.Error("a TAG_End list with elements was accepted")
	}
}

func TestDepthLimit(t *testing.T) {
	// A compound nested past MaxDepth, built by hand.
	var b []byte
	b = append(b, TypeCompound)
	for i := 0; i < MaxDepth+10; i++ {
		b = append(b, TypeCompound, 0, 1, 'a')
	}
	for i := 0; i < MaxDepth+11; i++ {
		b = append(b, TypeEnd)
	}
	if _, err := Unmarshal(b, true); err == nil {
		t.Error("unbounded nesting was accepted")
	}
}

func TestTagTypes(t *testing.T) {
	cases := []struct {
		tag  Tag
		want byte
	}{
		{Byte(0), TypeByte},
		{Short(0), TypeShort},
		{Int(0), TypeInt},
		{Long(0), TypeLong},
		{Float(0), TypeFloat},
		{Double(0), TypeDouble},
		{String(""), TypeString},
		{ByteArray(nil), TypeByteArray},
		{IntArray(nil), TypeIntArray},
		{LongArray(nil), TypeLongArray},
		{Compound{}, TypeCompound},
		{List{}, TypeList},
	}
	for _, c := range cases {
		if got := c.tag.TagType(); got != c.want {
			t.Errorf("%T.TagType() = %d, want %d", c.tag, got, c.want)
		}
		if TypeName(c.want) == "" {
			t.Errorf("no name for type %d", c.want)
		}
	}
	if Bool(true) != 1 || Bool(false) != 0 {
		t.Error("Bool")
	}
	if got := TypeName(99); got != "TAG_Unknown(99)" {
		t.Errorf("TypeName(99) = %q", got)
	}
}
