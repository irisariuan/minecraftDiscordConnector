package protocol

import (
	"bytes"
	"errors"
	"math"
	"strings"
	"testing"
)

func TestWriterReaderRoundTrip(t *testing.T) {
	id, _ := ParseUUID("069a79f4-44e9-4726-a5be-fca90e38aaf5")
	p := NewWriter(0x2b).
		VarInt(-7).
		VarLong(-1 << 40).
		Bool(true).
		Bool(false).
		Byte(-128).
		UByte(200).
		Short(-30000).
		UShort(65535).
		Int(math.MinInt32).
		Long(math.MaxInt64).
		Float(0.5).
		Double(-3.25).
		String("hello ✨ world").
		ByteArray([]byte{1, 2, 3}).
		UUID(id).
		Raw([]byte{0xde, 0xad}).
		Packet()

	if p.ID != 0x2b {
		t.Fatalf("id = %d", p.ID)
	}
	r := NewReader(p.Data)

	check := func(name string, got, want any, err error) {
		t.Helper()
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if got != want {
			t.Errorf("%s = %v, want %v", name, got, want)
		}
	}

	v1, err := r.VarInt()
	check("VarInt", v1, int32(-7), err)
	v2, err := r.VarLong()
	check("VarLong", v2, int64(-1<<40), err)
	b1, err := r.Bool()
	check("Bool true", b1, true, err)
	b2, err := r.Bool()
	check("Bool false", b2, false, err)
	by, err := r.Byte()
	check("Byte", by, int8(-128), err)
	ub, err := r.UByte()
	check("UByte", ub, uint8(200), err)
	sh, err := r.Short()
	check("Short", sh, int16(-30000), err)
	us, err := r.UShort()
	check("UShort", us, uint16(65535), err)
	i32, err := r.Int()
	check("Int", i32, int32(math.MinInt32), err)
	i64, err := r.Long()
	check("Long", i64, int64(math.MaxInt64), err)
	f32, err := r.Float()
	check("Float", f32, float32(0.5), err)
	f64, err := r.Double()
	check("Double", f64, -3.25, err)
	s, err := r.String(64)
	check("String", s, "hello ✨ world", err)

	ba, err := r.ByteArray()
	if err != nil {
		t.Fatalf("ByteArray: %v", err)
	}
	if !bytes.Equal(ba, []byte{1, 2, 3}) {
		t.Errorf("ByteArray = % x", ba)
	}
	gotID, err := r.UUID()
	check("UUID", gotID, id, err)

	if rest := r.Remaining(); !bytes.Equal(rest, []byte{0xde, 0xad}) {
		t.Errorf("Remaining = % x, want dead", rest)
	}
	if r.Len() != 2 {
		t.Errorf("Len = %d, want 2", r.Len())
	}
}

func TestReaderStringLimit(t *testing.T) {
	// 16 multi-byte runes: 48 bytes on the wire.
	long := strings.Repeat("✨", 16)
	p := NewWriter(0).String(long).Packet()

	if _, err := NewReader(p.Data).String(16); err != nil {
		t.Errorf("exactly at the limit was rejected: %v", err)
	}
	if _, err := NewReader(p.Data).String(15); !errors.Is(err, ErrStringTooLong) {
		t.Errorf("over the rune limit: got %v, want ErrStringTooLong", err)
	}
	if _, err := NewReader(p.Data).String(0); err != nil {
		t.Errorf("max 0 should mean unlimited: %v", err)
	}

	// A byte length far past max*4 must be refused before anything is read,
	// even though the buffer cannot possibly hold it.
	bogus := AppendVarInt(nil, 1<<20)
	if _, err := NewReader(bogus).String(32); !errors.Is(err, ErrStringTooLong) {
		t.Errorf("oversized prefix: got %v, want ErrStringTooLong", err)
	}

	// An honest prefix that runs past the buffer is a short buffer.
	short := append(AppendVarInt(nil, 10), 'a', 'b')
	if _, err := NewReader(short).String(64); !errors.Is(err, ErrShortBuffer) {
		t.Errorf("truncated string: got %v, want ErrShortBuffer", err)
	}
}

func TestReaderShortBuffer(t *testing.T) {
	empty := func() *Reader { return NewReader(nil) }
	cases := map[string]func() error{
		"UByte":     func() error { _, err := empty().UByte(); return err },
		"Byte":      func() error { _, err := empty().Byte(); return err },
		"Bool":      func() error { _, err := empty().Bool(); return err },
		"Short":     func() error { _, err := empty().Short(); return err },
		"UShort":    func() error { _, err := empty().UShort(); return err },
		"Int":       func() error { _, err := empty().Int(); return err },
		"Long":      func() error { _, err := empty().Long(); return err },
		"Float":     func() error { _, err := empty().Float(); return err },
		"Double":    func() error { _, err := empty().Double(); return err },
		"UUID":      func() error { _, err := empty().UUID(); return err },
		"ByteArray": func() error { _, err := empty().ByteArray(); return err },
		"Bytes":     func() error { _, err := empty().Bytes(1); return err },
		"VarLong":   func() error { _, err := empty().VarLong(); return err },
	}
	for name, fn := range cases {
		if err := fn(); err == nil {
			t.Errorf("%s on an empty buffer returned no error", name)
		}
	}
	if _, err := NewReader([]byte{1, 2}).Bytes(-1); err == nil {
		t.Error("Bytes(-1) returned no error")
	}
	neg := AppendVarInt(nil, -1)
	if _, err := NewReader(neg).ByteArray(); err == nil {
		t.Error("ByteArray with a negative length returned no error")
	}
}

func TestUUID(t *testing.T) {
	const dashed = "069a79f4-44e9-4726-a5be-fca90e38aaf5"
	const undashed = "069a79f444e94726a5befca90e38aaf5"

	a, err := ParseUUID(dashed)
	if err != nil {
		t.Fatalf("ParseUUID dashed: %v", err)
	}
	b, err := ParseUUID(undashed)
	if err != nil {
		t.Fatalf("ParseUUID undashed: %v", err)
	}
	if a != b {
		t.Errorf("dashed and undashed disagree: %v vs %v", a, b)
	}
	if got := a.String(); got != dashed {
		t.Errorf("String = %q, want %q", got, dashed)
	}
	if got := a.Undashed(); got != undashed {
		t.Errorf("Undashed = %q, want %q", got, undashed)
	}
	if upper, err := ParseUUID(strings.ToUpper(dashed)); err != nil || upper != a {
		t.Errorf("uppercase input = %v, %v", upper, err)
	}
	if (UUID{}).IsZero() != true || a.IsZero() {
		t.Error("IsZero is wrong")
	}

	bad := []string{"", "xyz", dashed[:35], undashed + "0",
		"069a79f4-44e9-4726-a5be-fca90e38aaf", "069a79f4x44e9-4726-a5be-fca90e38aaf5",
		"069a79g4-44e9-4726-a5be-fca90e38aaf5"}
	for _, s := range bad {
		if _, err := ParseUUID(s); !errors.Is(err, ErrInvalidUUID) {
			t.Errorf("ParseUUID(%q) = %v, want ErrInvalidUUID", s, err)
		}
	}
}

func TestOfflineUUID(t *testing.T) {
	// Golden values: MD5 of "OfflinePlayer:<name>" with the version 3 and
	// RFC 4122 variant bits stamped in.
	cases := map[string]string{
		"Notch": "b50ad385-829d-3141-a216-7e7d7539ba7f",
		"jeb_":  "a762f560-4fce-3236-812a-b80efff0b62b",
	}
	for name, want := range cases {
		got := OfflineUUID(name)
		if got.String() != want {
			t.Errorf("OfflineUUID(%q) = %s, want %s", name, got, want)
		}
		if v := got[6] >> 4; v != 3 {
			t.Errorf("OfflineUUID(%q) version = %d, want 3", name, v)
		}
		if got[8]&0xc0 != 0x80 {
			t.Errorf("OfflineUUID(%q) variant byte = %#x", name, got[8])
		}
	}
	if OfflineUUID("Notch") == OfflineUUID("notch") {
		t.Error("OfflineUUID must be case sensitive")
	}
}
