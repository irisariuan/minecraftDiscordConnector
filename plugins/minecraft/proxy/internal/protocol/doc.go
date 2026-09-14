// Package protocol implements the Minecraft: Java Edition wire codec: the
// VarInt-based field encoding, packet framing, zlib compression, and the
// AES-128/CFB8 stream cipher, together with a [Conn] that ties them together.
//
// # Framing states
//
// A connection moves through three framing states, and both peers must switch
// at exactly the same point in the byte stream or every subsequent packet is
// garbage.
//
//  1. Plain. Every packet is
//
//     VarInt length | VarInt packet id | payload
//
//     where length counts the id plus the payload. This is the state a
//     connection starts in, and it covers the handshake, the whole status
//     exchange, and the login phase up to Set Compression.
//
//  2. Encrypted. After the login Encryption Response is exchanged, both
//     directions are wrapped in AES-128 in CFB8 mode, keyed by the shared
//     secret with the IV equal to the key. Encryption is a transport layer
//     below framing: the frames above are unchanged, the bytes carrying them
//     are enciphered. Call [Conn.EnableEncryption] immediately after the
//     packet that established the secret has been read or written; it affects
//     only subsequent traffic. The two directions keep independent cipher
//     states.
//
//  3. Compressed. After Set Compression with a non-negative threshold, every
//     packet becomes
//
//     VarInt packet length | VarInt uncompressed length | zlib stream
//
//     where packet length counts the uncompressed-length field plus the bytes
//     that follow it. An uncompressed length of 0 is the special case meaning
//     "not actually compressed": the remainder is a plain
//     "VarInt packet id | payload" with no zlib wrapper, and it is what must
//     be emitted for any packet whose uncompressed body is smaller than the
//     threshold. [Conn.EnableCompression] with a negative threshold returns
//     the connection to plain framing.
//
// Encryption and compression are orthogonal and usually both active during
// play. Encryption is always the outermost layer.
//
// # Handing off to a raw tunnel
//
// Once a proxied session reaches the play phase and both links share one
// compression threshold, packets no longer need decoding, and a proxy can copy
// bytes instead. [Conn.StreamReader] and [Conn.StreamWriter] expose the
// connection as a plain byte stream with framing bypassed but encryption still
// applied. StreamReader yields the bytes [Conn.ReadPacket] has already
// buffered before it touches the socket again, so no packet is lost at the
// handoff.
//
// # Concurrency
//
// Writes ([Conn.WritePacket] and the writer from [Conn.StreamWriter]) are
// serialized internally and may be called from any goroutine. Reads are not:
// [Conn.ReadPacket], the reader from [Conn.StreamReader], and
// [Conn.EnableEncryption] must all be driven by the single goroutine that owns
// the read side.
package protocol
