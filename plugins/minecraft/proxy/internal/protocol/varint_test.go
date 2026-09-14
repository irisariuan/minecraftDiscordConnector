package protocol

import (
	"bytes"
	"errors"
	"io"
	"testing"
)

var varIntCases = []struct {
	name string
	v    int32
	enc  []byte
}{
	{"zero", 0, []byte{0x00}},
	{"one", 1, []byte{0x01}},
	{"127", 127, []byte{0x7f}},
	{"128", 128, []byte{0x80, 0x01}},
	{"255", 255, []byte{0xff, 0x01}},
	{"2097151", 2097151, []byte{0xff, 0xff, 0x7f}},
	{"max", 2147483647, []byte{0xff, 0xff, 0xff, 0xff, 0x07}},
	{"minus one", -1, []byte{0xff, 0xff, 0xff, 0xff, 0x0f}},
	{"min", -2147483648, []byte{0x80, 0x80, 0x80, 0x80, 0x08}},
}

func TestAppendVarInt(t *testing.T) {
	for _, tc := range varIntCases {
		t.Run(tc.name, func(t *testing.T) {
			got := AppendVarInt(nil, tc.v)
			if !bytes.Equal(got, tc.enc) {
				t.Errorf("AppendVarInt(%d) = % x, want % x", tc.v, got, tc.enc)
			}
			if n := VarIntLen(tc.v); n != len(tc.enc) {
				t.Errorf("VarIntLen(%d) = %d, want %d", tc.v, n, len(tc.enc))
			}
			var buf bytes.Buffer
			if err := WriteVarInt(&buf, tc.v); err != nil {
				t.Fatalf("WriteVarInt: %v", err)
			}
			if !bytes.Equal(buf.Bytes(), tc.enc) {
				t.Errorf("WriteVarInt(%d) = % x, want % x", tc.v, buf.Bytes(), tc.enc)
			}
		})
	}
}

func TestReadVarInt(t *testing.T) {
	for _, tc := range varIntCases {
		t.Run(tc.name, func(t *testing.T) {
			// Through a plain io.Reader (no ByteReader shortcut) and with a
			// trailing sentinel, so over-reading would be caught.
			src := append(append([]byte{}, tc.enc...), 0x42)
			r := onlyReader{bytes.NewReader(src)}
			got, err := ReadVarInt(r)
			if err != nil {
				t.Fatalf("ReadVarInt: %v", err)
			}
			if got != tc.v {
				t.Errorf("ReadVarInt(% x) = %d, want %d", tc.enc, got, tc.v)
			}
			rest, _ := io.ReadAll(r)
			if len(rest) != 1 || rest[0] != 0x42 {
				t.Errorf("consumed past the VarInt, leftover = % x", rest)
			}

			// And through a bytes.Reader, which is an io.ByteReader.
			got, err = ReadVarInt(bytes.NewReader(tc.enc))
			if err != nil || got != tc.v {
				t.Errorf("ReadVarInt via ByteReader = %d, %v; want %d", got, err, tc.v)
			}
		})
	}
}

func TestReaderVarIntMatchesReadVarInt(t *testing.T) {
	for _, tc := range varIntCases {
		r := NewReader(tc.enc)
		got, err := r.VarInt()
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if got != tc.v {
			t.Errorf("%s: Reader.VarInt = %d, want %d", tc.name, got, tc.v)
		}
		if r.Len() != 0 {
			t.Errorf("%s: %d bytes left over", tc.name, r.Len())
		}
	}
}

func TestReadVarIntErrors(t *testing.T) {
	if _, err := ReadVarInt(bytes.NewReader(nil)); !errors.Is(err, io.EOF) {
		t.Errorf("empty input: got %v, want io.EOF", err)
	}
	if _, err := ReadVarInt(bytes.NewReader([]byte{0x80})); !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Errorf("truncated: got %v, want io.ErrUnexpectedEOF", err)
	}
	long := []byte{0xff, 0xff, 0xff, 0xff, 0xff, 0x01}
	if _, err := ReadVarInt(bytes.NewReader(long)); !errors.Is(err, ErrVarIntTooLong) {
		t.Errorf("overlong: got %v, want ErrVarIntTooLong", err)
	}
	if _, err := NewReader(long).VarInt(); !errors.Is(err, ErrVarIntTooLong) {
		t.Errorf("Reader overlong: got %v, want ErrVarIntTooLong", err)
	}
	r := NewReader([]byte{0x80})
	if _, err := r.VarInt(); !errors.Is(err, ErrShortBuffer) {
		t.Errorf("Reader truncated: got %v, want ErrShortBuffer", err)
	}
	if r.Len() != 1 {
		t.Errorf("failed VarInt consumed input, %d bytes left", r.Len())
	}
}

func TestVarLongRoundTrip(t *testing.T) {
	vals := []int64{0, 1, 2, 127, 128, 255, 2147483647, -1, -2147483648,
		9223372036854775807, -9223372036854775808}
	for _, v := range vals {
		p := NewWriter(0).VarLong(v).Packet()
		got, err := NewReader(p.Data).VarLong()
		if err != nil {
			t.Fatalf("VarLong(%d): %v", v, err)
		}
		if got != v {
			t.Errorf("VarLong round trip = %d, want %d", got, v)
		}
	}
}

// onlyReader hides any io.ByteReader implementation.
type onlyReader struct{ r io.Reader }

func (o onlyReader) Read(p []byte) (int, error) { return o.r.Read(p) }
