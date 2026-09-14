package protocol

import (
	"bytes"
	"errors"
	"io"
	"net"
	"strings"
	"sync"
	"testing"
	"time"
)

// memConn is a net.Conn over a pair of in-memory buffers, so framing tests can
// stay synchronous: write with one Conn, then read the bytes back with
// another.
type memConn struct {
	r io.Reader
	w io.Writer
}

func (m memConn) Read(p []byte) (int, error)  { return m.r.Read(p) }
func (m memConn) Write(p []byte) (int, error) { return m.w.Write(p) }
func (m memConn) Close() error                { return nil }
func (m memConn) LocalAddr() net.Addr         { return fakeAddr{} }
func (m memConn) RemoteAddr() net.Addr        { return fakeAddr{} }
func (memConn) SetDeadline(time.Time) error   { return nil }

func (memConn) SetReadDeadline(time.Time) error  { return nil }
func (memConn) SetWriteDeadline(time.Time) error { return nil }

type fakeAddr struct{}

func (fakeAddr) Network() string { return "mem" }
func (fakeAddr) String() string  { return "mem" }

func writerConn(buf *bytes.Buffer) *Conn {
	return NewConn(memConn{r: strings.NewReader(""), w: buf})
}

func readerConn(b []byte) *Conn {
	return NewConn(memConn{r: bytes.NewReader(b), w: io.Discard})
}

func samplePacket(id int32, size int) *Packet {
	data := make([]byte, size)
	for i := range data {
		data[i] = byte(i * 7)
	}
	return &Packet{ID: id, Data: data}
}

func assertPacket(t *testing.T, got *Packet, want *Packet) {
	t.Helper()
	if got.ID != want.ID {
		t.Errorf("id = %d, want %d", got.ID, want.ID)
	}
	if !bytes.Equal(got.Data, want.Data) {
		t.Errorf("payload of %d bytes does not match the %d written", len(got.Data), len(want.Data))
	}
}

func TestFramingUncompressed(t *testing.T) {
	packets := []*Packet{
		{ID: 0x00, Data: nil},
		samplePacket(0x01, 1),
		samplePacket(0x7f, 300),
		samplePacket(0x1234, 5000),
	}
	var buf bytes.Buffer
	w := writerConn(&buf)
	for _, p := range packets {
		if err := w.WritePacket(p); err != nil {
			t.Fatalf("WritePacket: %v", err)
		}
	}

	// A packet with no payload must be exactly "len=1, id=0".
	if !bytes.HasPrefix(buf.Bytes(), []byte{0x01, 0x00}) {
		t.Errorf("empty packet framed as % x", buf.Bytes()[:4])
	}

	r := readerConn(buf.Bytes())
	for _, p := range packets {
		got, err := r.ReadPacket()
		if err != nil {
			t.Fatalf("ReadPacket: %v", err)
		}
		assertPacket(t, got, p)
	}
	if _, err := r.ReadPacket(); !errors.Is(err, io.EOF) {
		t.Errorf("after the last packet: got %v, want io.EOF", err)
	}
}

// TestFramingCompressionThreshold exercises both sides of the threshold,
// including the exact boundary, and checks the uncompressed form really is
// emitted below it.
func TestFramingCompressionThreshold(t *testing.T) {
	const threshold = 256

	// Body length is VarIntLen(id) + len(data); with a one-byte id, a
	// payload of threshold-1 bytes sits exactly on the boundary.
	cases := []struct {
		name       string
		payload    int
		compressed bool
	}{
		{"empty", 0, false},
		{"well below", 10, false},
		{"one below the threshold", threshold - 2, false},
		{"exactly at the threshold", threshold - 1, true},
		{"one above", threshold, true},
		{"far above", 9000, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := samplePacket(0x21, tc.payload)

			var buf bytes.Buffer
			w := writerConn(&buf)
			w.EnableCompression(threshold)
			if got := w.CompressionThreshold(); got != threshold {
				t.Fatalf("CompressionThreshold = %d", got)
			}
			if err := w.WritePacket(p); err != nil {
				t.Fatalf("WritePacket: %v", err)
			}

			// Inspect the envelope: packet length, then the uncompressed
			// length, which is 0 exactly when the body was stored verbatim.
			fr := NewReader(buf.Bytes())
			frameLen, err := fr.VarInt()
			if err != nil {
				t.Fatal(err)
			}
			if int(frameLen) != fr.Len() {
				t.Fatalf("frame declares %d bytes, %d present", frameLen, fr.Len())
			}
			size, err := fr.VarInt()
			if err != nil {
				t.Fatal(err)
			}
			if tc.compressed && size == 0 {
				t.Errorf("expected a zlib body, got the stored-verbatim marker")
			}
			if !tc.compressed {
				if size != 0 {
					t.Errorf("expected the stored-verbatim marker, got size %d", size)
				}
				body := fr.Remaining()
				if int(body[0]) != 0x21 || !bytes.Equal(body[1:], p.Data) {
					t.Errorf("stored body is not the raw packet")
				}
			}

			r := readerConn(buf.Bytes())
			r.EnableCompression(threshold)
			got, err := r.ReadPacket()
			if err != nil {
				t.Fatalf("ReadPacket: %v", err)
			}
			assertPacket(t, got, p)
		})
	}
}

// TestCompressionEnabledMidStream is the Set Compression sequence: some
// packets plain, then the switch, then compressed packets.
func TestCompressionEnabledMidStream(t *testing.T) {
	before := samplePacket(0x02, 40)
	after := samplePacket(0x03, 4000)

	var buf bytes.Buffer
	w := writerConn(&buf)
	if err := w.WritePacket(before); err != nil {
		t.Fatal(err)
	}
	w.EnableCompression(128)
	if err := w.WritePacket(after); err != nil {
		t.Fatal(err)
	}

	r := readerConn(buf.Bytes())
	got, err := r.ReadPacket()
	if err != nil {
		t.Fatal(err)
	}
	assertPacket(t, got, before)
	r.EnableCompression(128)
	got, err = r.ReadPacket()
	if err != nil {
		t.Fatal(err)
	}
	assertPacket(t, got, after)

	// And turning it back off.
	if r.EnableCompression(-5); r.CompressionThreshold() >= 0 {
		t.Errorf("a negative threshold left compression on: %d", r.CompressionThreshold())
	}
}

func TestCompressionZeroThresholdCompressesEverything(t *testing.T) {
	p := samplePacket(0x04, 3)
	var buf bytes.Buffer
	w := writerConn(&buf)
	w.EnableCompression(0)
	if err := w.WritePacket(p); err != nil {
		t.Fatal(err)
	}
	fr := NewReader(buf.Bytes())
	fr.VarInt()
	size, _ := fr.VarInt()
	if size == 0 {
		t.Error("threshold 0 should compress every packet")
	}
	r := readerConn(buf.Bytes())
	r.EnableCompression(0)
	got, err := r.ReadPacket()
	if err != nil {
		t.Fatal(err)
	}
	assertPacket(t, got, p)
}

func TestEncryptionRoundTrip(t *testing.T) {
	secret := []byte("sixteen byte key")
	packets := []*Packet{samplePacket(0x00, 5), samplePacket(0x01, 700), samplePacket(0x02, 0)}

	var buf bytes.Buffer
	w := writerConn(&buf)
	if err := w.EnableEncryption(secret); err != nil {
		t.Fatal(err)
	}
	for _, p := range packets {
		if err := w.WritePacket(p); err != nil {
			t.Fatal(err)
		}
	}
	if bytes.Contains(buf.Bytes(), packets[1].Data[:64]) {
		t.Fatal("plaintext is visible on the wire")
	}

	r := readerConn(buf.Bytes())
	if err := r.EnableEncryption(secret); err != nil {
		t.Fatal(err)
	}
	for _, p := range packets {
		got, err := r.ReadPacket()
		if err != nil {
			t.Fatalf("ReadPacket: %v", err)
		}
		assertPacket(t, got, p)
	}
}

func TestEnableEncryptionBadSecret(t *testing.T) {
	var buf bytes.Buffer
	if err := writerConn(&buf).EnableEncryption([]byte("short")); err == nil {
		t.Error("a 5-byte secret was accepted")
	}
}

// TestEncryptionEnabledMidStreamWithPipelinedBytes is the login sequence, with
// the peer pipelining the first encrypted packet in the same TCP segment as
// the last plaintext one. The read buffer will have slurped both, so the
// encrypted bytes are already sitting in bufio when the cipher is installed.
func TestEncryptionEnabledMidStreamWithPipelinedBytes(t *testing.T) {
	secret := []byte("0123456789abcdef")
	plain := samplePacket(0x01, 20)
	enc1 := samplePacket(0x02, 64)
	enc2 := samplePacket(0x03, 900)

	var buf bytes.Buffer
	w := writerConn(&buf)
	if err := w.WritePacket(plain); err != nil {
		t.Fatal(err)
	}
	if err := w.EnableEncryption(secret); err != nil {
		t.Fatal(err)
	}
	for _, p := range []*Packet{enc1, enc2} {
		if err := w.WritePacket(p); err != nil {
			t.Fatal(err)
		}
	}

	// Everything arrives at once, so the first ReadPacket buffers the lot.
	r := readerConn(buf.Bytes())
	got, err := r.ReadPacket()
	if err != nil {
		t.Fatal(err)
	}
	assertPacket(t, got, plain)
	if r.br.Buffered() == 0 {
		t.Skip("read buffer did not pipeline; the case under test did not arise")
	}
	if err := r.EnableEncryption(secret); err != nil {
		t.Fatal(err)
	}
	for _, p := range []*Packet{enc1, enc2} {
		got, err := r.ReadPacket()
		if err != nil {
			t.Fatalf("ReadPacket after mid-stream encryption: %v", err)
		}
		assertPacket(t, got, p)
	}
}

// TestStreamHandoff is the point of StreamReader: after the last packet the
// proxy decodes, every remaining byte must still be delivered, including the
// ones bufio has already pulled off the socket.
func TestStreamHandoff(t *testing.T) {
	first := samplePacket(0x00, 16)
	rest := samplePacket(0x01, 4096)
	trailer := []byte("trailing raw bytes that are not a packet")

	var buf bytes.Buffer
	w := writerConn(&buf)
	if err := w.WritePacket(first); err != nil {
		t.Fatal(err)
	}
	mark := buf.Len()
	if err := w.WritePacket(rest); err != nil {
		t.Fatal(err)
	}
	buf.Write(trailer)
	wantTail := append([]byte(nil), buf.Bytes()[mark:]...)

	r := readerConn(buf.Bytes())
	got, err := r.ReadPacket()
	if err != nil {
		t.Fatal(err)
	}
	assertPacket(t, got, first)

	var tail bytes.Buffer
	if _, err := io.Copy(&tail, r.StreamReader()); err != nil {
		t.Fatalf("io.Copy from StreamReader: %v", err)
	}
	if !bytes.Equal(tail.Bytes(), wantTail) {
		t.Fatalf("stream handoff lost or corrupted bytes: got %d, want %d",
			tail.Len(), len(wantTail))
	}
}

// TestStreamHandoffEncrypted checks the handoff still decrypts, and that a
// StreamWriter re-encrypts on the far side.
func TestStreamHandoffEncrypted(t *testing.T) {
	secret := []byte("abcdefghijklmnop")
	first := samplePacket(0x00, 8)
	tailBytes := bytes.Repeat([]byte("payload!"), 1000)

	var wire bytes.Buffer
	w := writerConn(&wire)
	if err := w.EnableEncryption(secret); err != nil {
		t.Fatal(err)
	}
	if err := w.WritePacket(first); err != nil {
		t.Fatal(err)
	}
	if _, err := w.StreamWriter().Write(tailBytes); err != nil {
		t.Fatal(err)
	}

	r := readerConn(wire.Bytes())
	if err := r.EnableEncryption(secret); err != nil {
		t.Fatal(err)
	}
	got, err := r.ReadPacket()
	if err != nil {
		t.Fatal(err)
	}
	assertPacket(t, got, first)

	var tail bytes.Buffer
	if _, err := io.Copy(&tail, r.StreamReader()); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(tail.Bytes(), tailBytes) {
		t.Fatalf("encrypted handoff mismatched: %d of %d bytes", tail.Len(), len(tailBytes))
	}
}

func TestConcurrentWrites(t *testing.T) {
	var mu sync.Mutex
	var buf bytes.Buffer
	w := NewConn(memConn{r: strings.NewReader(""), w: lockedWriter{&mu, &buf}})
	if err := w.EnableEncryption([]byte("0123456789abcdef")); err != nil {
		t.Fatal(err)
	}

	const goroutines, each = 8, 50
	var wg sync.WaitGroup
	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < each; i++ {
				if err := w.WritePacket(samplePacket(int32(g), 64)); err != nil {
					t.Errorf("WritePacket: %v", err)
					return
				}
			}
		}(g)
	}
	wg.Wait()

	// Every frame must still be intact and decryptable in order.
	r := readerConn(buf.Bytes())
	if err := r.EnableEncryption([]byte("0123456789abcdef")); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < goroutines*each; i++ {
		p, err := r.ReadPacket()
		if err != nil {
			t.Fatalf("packet %d: %v", i, err)
		}
		if len(p.Data) != 64 {
			t.Fatalf("packet %d has %d payload bytes", i, len(p.Data))
		}
	}
}

type lockedWriter struct {
	mu *sync.Mutex
	w  io.Writer
}

func (l lockedWriter) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.w.Write(p)
}

func TestReadPacketRejectsOversizedFrame(t *testing.T) {
	frame := AppendVarInt(nil, MaxPacketLength+1)
	r := readerConn(frame)
	if _, err := r.ReadPacket(); !errors.Is(err, ErrPacketTooLarge) {
		t.Errorf("got %v, want ErrPacketTooLarge", err)
	}

	// A negative length must not be read as a huge allocation either.
	r = readerConn(AppendVarInt(nil, -1))
	if _, err := r.ReadPacket(); !errors.Is(err, ErrPacketTooLarge) {
		t.Errorf("negative length: got %v, want ErrPacketTooLarge", err)
	}

	// Zero-length frames carry no packet id.
	r = readerConn([]byte{0x00})
	if _, err := r.ReadPacket(); err == nil {
		t.Error("an empty frame was accepted")
	}
}

func TestReadPacketRejectsOversizedDecompression(t *testing.T) {
	// A tiny zlib body claiming to expand to more than the cap.
	frame := AppendVarInt(nil, MaxUncompressedLength+1)
	frame = append(frame, 0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01)
	full := AppendVarInt(nil, int32(len(frame)))
	full = append(full, frame...)

	r := readerConn(full)
	r.EnableCompression(256)
	if _, err := r.ReadPacket(); !errors.Is(err, ErrPacketTooLarge) {
		t.Errorf("got %v, want ErrPacketTooLarge", err)
	}
}

func TestReadPacketRejectsUndersizedDecompression(t *testing.T) {
	// Declares more uncompressed bytes than the zlib stream actually holds.
	var body bytes.Buffer
	w := writerConn(&body)
	w.EnableCompression(1)
	if err := w.WritePacket(samplePacket(0x05, 100)); err != nil {
		t.Fatal(err)
	}

	// Rewrite the uncompressed-length field to a larger value.
	fr := NewReader(body.Bytes())
	fr.VarInt() // frame length
	fr.VarInt() // uncompressed length
	inner := AppendVarInt(nil, 4096)
	inner = append(inner, fr.Remaining()...)
	full := AppendVarInt(nil, int32(len(inner)))
	full = append(full, inner...)

	r := readerConn(full)
	r.EnableCompression(1)
	if _, err := r.ReadPacket(); err == nil {
		t.Error("a lying uncompressed length was accepted")
	}
}

func TestConnAccessors(t *testing.T) {
	var buf bytes.Buffer
	nc := memConn{r: strings.NewReader(""), w: &buf}
	c := NewConn(nc)
	if c.NetConn() != net.Conn(nc) {
		t.Error("NetConn did not return the wrapped connection")
	}
	if c.RemoteAddr().String() != "mem" {
		t.Error("RemoteAddr")
	}
	if err := c.SetReadDeadline(time.Now()); err != nil {
		t.Error(err)
	}
	if err := c.SetWriteDeadline(time.Now()); err != nil {
		t.Error(err)
	}
	if err := c.Close(); err != nil {
		t.Error(err)
	}
	if c.CompressionThreshold() >= 0 {
		t.Error("a fresh connection should have compression off")
	}
}

// TestOverRealSocket runs one session end to end over a real TCP connection,
// so the buffering and the cipher are exercised against actual segment
// boundaries rather than a single in-memory buffer.
func TestOverRealSocket(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skipf("no loopback listener: %v", err)
	}
	defer ln.Close()

	secret := []byte("0123456789abcdef")
	packets := []*Packet{samplePacket(0, 10), samplePacket(1, 2000), samplePacket(2, 50)}
	trailer := bytes.Repeat([]byte{0xab}, 10000)

	done := make(chan error, 1)
	go func() {
		nc, err := ln.Accept()
		if err != nil {
			done <- err
			return
		}
		defer nc.Close()
		c := NewConn(nc)
		if err := c.WritePacket(packets[0]); err != nil {
			done <- err
			return
		}
		if err := c.EnableEncryption(secret); err != nil {
			done <- err
			return
		}
		c.EnableCompression(128)
		for _, p := range packets[1:] {
			if err := c.WritePacket(p); err != nil {
				done <- err
				return
			}
		}
		_, err = c.StreamWriter().Write(trailer)
		done <- err
	}()

	nc, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer nc.Close()
	c := NewConn(nc)
	if err := c.SetReadDeadline(time.Now().Add(10 * time.Second)); err != nil {
		t.Fatal(err)
	}
	got, err := c.ReadPacket()
	if err != nil {
		t.Fatal(err)
	}
	assertPacket(t, got, packets[0])
	if err := c.EnableEncryption(secret); err != nil {
		t.Fatal(err)
	}
	c.EnableCompression(128)
	for _, p := range packets[1:] {
		got, err := c.ReadPacket()
		if err != nil {
			t.Fatalf("ReadPacket: %v", err)
		}
		assertPacket(t, got, p)
	}
	var tail bytes.Buffer
	if _, err := io.Copy(&tail, io.LimitReader(c.StreamReader(), int64(len(trailer)))); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(tail.Bytes(), trailer) {
		t.Fatalf("trailer mismatch: %d of %d bytes", tail.Len(), len(trailer))
	}
	if err := <-done; err != nil {
		t.Fatalf("server side: %v", err)
	}
}
