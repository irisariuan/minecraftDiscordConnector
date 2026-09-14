package protocol

import (
	"bufio"
	"bytes"
	"compress/zlib"
	"crypto/aes"
	"crypto/cipher"
	"errors"
	"fmt"
	"io"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

const (
	// MaxPacketLength is the largest frame, in bytes, that will be read or
	// written. Vanilla's own limit is the same 2 MiB.
	MaxPacketLength = 2 * 1024 * 1024

	// MaxUncompressedLength caps the declared size of a compressed packet, so
	// a hostile peer cannot make the proxy allocate an arbitrary buffer from
	// a few bytes of zlib.
	MaxUncompressedLength = 8 * 1024 * 1024

	// readBufferSize is the bufio buffer in front of each connection. Reads
	// larger than this bypass the buffer entirely, so it only needs to be big
	// enough to amortise packet-sized reads.
	readBufferSize = 8 * 1024
)

// ErrPacketTooLarge is returned when a frame exceeds [MaxPacketLength] or a
// compressed packet declares more than [MaxUncompressedLength].
var ErrPacketTooLarge = errors.New("protocol: packet too large")

// Conn is a framed Minecraft connection. It owns the packet length prefix,
// zlib compression and the AES/CFB8 stream cipher; see the package comment for
// how those layers stack and when each is switched on.
//
// Writes are serialized internally and safe from multiple goroutines. The read
// side is not: [Conn.ReadPacket], the [Conn.StreamReader] and
// [Conn.EnableEncryption] belong to one goroutine.
type Conn struct {
	conn net.Conn

	// read side, owned by the read goroutine
	cr *cipherReader
	br *bufio.Reader
	zr io.ReadCloser

	// write side, guarded by wmu
	wmu  sync.Mutex
	enc  cipher.Stream
	zw   *zlib.Writer
	zbuf bytes.Buffer
	wbuf []byte

	threshold atomic.Int32
}

// NewConn wraps c. The connection starts in plain framing with neither
// compression nor encryption.
func NewConn(c net.Conn) *Conn {
	cr := &cipherReader{r: c}
	conn := &Conn{
		conn: c,
		cr:   cr,
		br:   bufio.NewReaderSize(cr, readBufferSize),
	}
	conn.threshold.Store(-1)
	return conn
}

// NetConn returns the underlying connection. Reading or writing it directly
// bypasses framing and encryption both.
func (c *Conn) NetConn() net.Conn { return c.conn }

// RemoteAddr returns the peer address.
func (c *Conn) RemoteAddr() net.Addr { return c.conn.RemoteAddr() }

// SetReadDeadline sets the deadline on the underlying connection.
func (c *Conn) SetReadDeadline(t time.Time) error { return c.conn.SetReadDeadline(t) }

// SetWriteDeadline sets the deadline on the underlying connection.
func (c *Conn) SetWriteDeadline(t time.Time) error { return c.conn.SetWriteDeadline(t) }

// Close closes the underlying connection.
func (c *Conn) Close() error { return c.conn.Close() }

// CompressionThreshold returns the current threshold, or a negative number if
// compression is off.
func (c *Conn) CompressionThreshold() int { return int(c.threshold.Load()) }

// EnableCompression switches to compressed framing for all subsequent
// packets. Packets whose uncompressed body is at least threshold bytes are
// zlib-compressed; smaller ones are sent with the zero uncompressed-length
// marker. A threshold of 0 compresses everything; a negative threshold returns
// the connection to plain framing.
//
// The change applies to traffic after the call, so it must be made at exactly
// the point Set Compression sits in the stream.
func (c *Conn) EnableCompression(threshold int) {
	if threshold < 0 {
		threshold = -1
	}
	c.threshold.Store(int32(threshold))
}

// EnableEncryption switches both directions to AES-128/CFB8 keyed by
// sharedSecret, which must be 16 bytes and is used as the IV as well. Only
// subsequent traffic is affected.
//
// Any bytes the read buffer had already pulled off the socket are re-read as
// ciphertext, so it is safe to call even when the peer pipelined data behind
// the packet that carried the secret. It must not be called concurrently with
// [Conn.ReadPacket].
func (c *Conn) EnableEncryption(sharedSecret []byte) error {
	if len(sharedSecret) != 16 {
		return fmt.Errorf("protocol: shared secret must be 16 bytes, got %d", len(sharedSecret))
	}
	encBlock, err := aes.NewCipher(sharedSecret)
	if err != nil {
		return fmt.Errorf("protocol: %w", err)
	}
	decBlock, err := aes.NewCipher(sharedSecret)
	if err != nil {
		return fmt.Errorf("protocol: %w", err)
	}

	dec := newCFB8(decBlock, sharedSecret, true)
	// Bytes already sitting in the bufio buffer were copied through before
	// the cipher existed, so they are still ciphertext. They precede anything
	// the socket will yield next, so decrypting them here keeps the keystream
	// in order.
	if n := c.br.Buffered(); n > 0 {
		if b, err := c.br.Peek(n); err == nil {
			dec.XORKeyStream(b, b)
		}
	}
	c.cr.setStream(dec)

	c.wmu.Lock()
	c.enc = newCFB8(encBlock, sharedSecret, false)
	c.wmu.Unlock()
	return nil
}

// ReadPacket reads and decodes one packet. A clean close by the peer between
// packets is reported as [io.EOF].
func (c *Conn) ReadPacket() (*Packet, error) {
	length, err := ReadVarInt(c.br)
	if err != nil {
		return nil, err
	}
	if length < 0 || int64(length) > MaxPacketLength {
		return nil, fmt.Errorf("%w: frame declares %d bytes", ErrPacketTooLarge, length)
	}
	if length == 0 {
		return nil, errors.New("protocol: empty frame")
	}
	frame := make([]byte, length)
	if _, err := io.ReadFull(c.br, frame); err != nil {
		if err == io.EOF {
			err = io.ErrUnexpectedEOF
		}
		return nil, err
	}

	if c.threshold.Load() >= 0 {
		frame, err = c.decompress(frame)
		if err != nil {
			return nil, err
		}
	}

	r := NewReader(frame)
	id, err := r.VarInt()
	if err != nil {
		return nil, fmt.Errorf("protocol: reading packet id: %w", err)
	}
	return &Packet{ID: id, Data: r.Remaining()}, nil
}

// decompress unwraps the compressed-framing envelope: a VarInt uncompressed
// length, then either a zlib stream or, when that length is zero, the body
// verbatim.
func (c *Conn) decompress(frame []byte) ([]byte, error) {
	r := NewReader(frame)
	size, err := r.VarInt()
	if err != nil {
		return nil, fmt.Errorf("protocol: reading uncompressed length: %w", err)
	}
	body := r.Remaining()
	if size == 0 {
		return body, nil
	}
	if size < 0 || int64(size) > MaxUncompressedLength {
		return nil, fmt.Errorf("%w: declares %d uncompressed bytes", ErrPacketTooLarge, size)
	}

	src := bytes.NewReader(body)
	if c.zr == nil {
		zr, err := zlib.NewReader(src)
		if err != nil {
			return nil, fmt.Errorf("protocol: zlib header: %w", err)
		}
		c.zr = zr
	} else if err := c.zr.(zlib.Resetter).Reset(src, nil); err != nil {
		return nil, fmt.Errorf("protocol: zlib header: %w", err)
	}

	out := make([]byte, size)
	if _, err := io.ReadFull(c.zr, out); err != nil {
		return nil, fmt.Errorf("protocol: zlib body: %w", err)
	}
	// Anything past the declared length means the peer lied about the size.
	var probe [1]byte
	if n, err := c.zr.Read(probe[:]); n > 0 || (err != nil && err != io.EOF) {
		if n > 0 {
			return nil, fmt.Errorf("protocol: packet longer than its declared %d bytes", size)
		}
		return nil, fmt.Errorf("protocol: zlib trailer: %w", err)
	}
	return out, nil
}

// WritePacket encodes and writes one packet, applying compression and
// encryption as currently configured. It is safe to call from any goroutine.
func (c *Conn) WritePacket(p *Packet) error {
	c.wmu.Lock()
	defer c.wmu.Unlock()

	body := VarIntLen(p.ID) + len(p.Data)
	threshold := int(c.threshold.Load())
	frame := c.wbuf[:0]

	switch {
	case threshold < 0:
		if body > MaxPacketLength {
			return fmt.Errorf("%w: %d bytes", ErrPacketTooLarge, body)
		}
		frame = AppendVarInt(frame, int32(body))
		frame = AppendVarInt(frame, p.ID)
		frame = append(frame, p.Data...)

	case body < threshold:
		// Below the threshold: the zero marker, then the body verbatim.
		payload := 1 + body
		if payload > MaxPacketLength {
			return fmt.Errorf("%w: %d bytes", ErrPacketTooLarge, payload)
		}
		frame = AppendVarInt(frame, int32(payload))
		frame = append(frame, 0)
		frame = AppendVarInt(frame, p.ID)
		frame = append(frame, p.Data...)

	default:
		c.zbuf.Reset()
		if c.zw == nil {
			c.zw = zlib.NewWriter(&c.zbuf)
		} else {
			c.zw.Reset(&c.zbuf)
		}
		var idBuf [MaxVarIntLen]byte
		if _, err := c.zw.Write(AppendVarInt(idBuf[:0], p.ID)); err != nil {
			return fmt.Errorf("protocol: zlib: %w", err)
		}
		if _, err := c.zw.Write(p.Data); err != nil {
			return fmt.Errorf("protocol: zlib: %w", err)
		}
		if err := c.zw.Close(); err != nil {
			return fmt.Errorf("protocol: zlib: %w", err)
		}
		payload := VarIntLen(int32(body)) + c.zbuf.Len()
		if payload > MaxPacketLength {
			return fmt.Errorf("%w: %d bytes", ErrPacketTooLarge, payload)
		}
		frame = AppendVarInt(frame, int32(payload))
		frame = AppendVarInt(frame, int32(body))
		frame = append(frame, c.zbuf.Bytes()...)
	}

	// Keep the scratch buffer for the next packet, unless one oversized
	// packet grew it out of proportion.
	if cap(frame) <= 64*1024 {
		c.wbuf = frame[:0]
	} else {
		c.wbuf = nil
	}
	_, err := c.writeLocked(frame)
	return err
}

// StreamReader returns the connection as a raw byte stream, decrypting if
// encryption is on but applying no framing. Bytes already buffered by
// [Conn.ReadPacket] are yielded before the socket is touched again, so a
// handoff from packet reads to a raw copy loses nothing.
//
// The returned reader shares the read side with [Conn.ReadPacket]; use one or
// the other.
func (c *Conn) StreamReader() io.Reader { return connReader{c} }

// StreamWriter returns a writer that sends bytes verbatim, encrypting if
// encryption is on but applying no framing. It serializes with
// [Conn.WritePacket] and is safe from any goroutine.
func (c *Conn) StreamWriter() io.Writer { return connWriter{c} }

type connReader struct{ c *Conn }

func (r connReader) Read(p []byte) (int, error) { return r.c.br.Read(p) }

// WriteTo lets io.Copy hand the whole stream to the bufio reader, which keeps
// the copy out of an intermediate buffer.
func (r connReader) WriteTo(w io.Writer) (int64, error) { return r.c.br.WriteTo(w) }

type connWriter struct{ c *Conn }

func (w connWriter) Write(p []byte) (int, error) {
	w.c.wmu.Lock()
	defer w.c.wmu.Unlock()
	return w.c.writeLocked(p)
}

// writeLocked encrypts if needed and writes. c.wmu must be held.
func (c *Conn) writeLocked(p []byte) (int, error) {
	if c.enc == nil {
		return c.conn.Write(p)
	}
	// The keystream advances over everything handed to the socket, so a
	// short write desynchronises the cipher; the connection is unusable after
	// an error either way.
	buf := make([]byte, len(p))
	c.enc.XORKeyStream(buf, p)
	return c.conn.Write(buf)
}

// cipherReader decrypts whatever the socket yields. The stream may be
// installed mid-flight by [Conn.EnableEncryption].
type cipherReader struct {
	r  io.Reader
	mu sync.Mutex
	s  cipher.Stream
}

func (cr *cipherReader) setStream(s cipher.Stream) {
	cr.mu.Lock()
	cr.s = s
	cr.mu.Unlock()
}

func (cr *cipherReader) Read(p []byte) (int, error) {
	n, err := cr.r.Read(p)
	if n > 0 {
		cr.mu.Lock()
		s := cr.s
		cr.mu.Unlock()
		if s != nil {
			s.XORKeyStream(p[:n], p[:n])
		}
	}
	return n, err
}
