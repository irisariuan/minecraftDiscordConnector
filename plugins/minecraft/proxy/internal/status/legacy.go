package status

import (
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

// legacyDrainTimeout bounds the wait for the rest of a legacy ping request.
// These clients send their whole request in one burst, so anything that has not
// arrived almost immediately is not coming.
const legacyDrainTimeout = 250 * time.Millisecond

// LegacyPingFirstByte is the first byte of a pre-1.7 server-list ping. It is not
// a valid modern packet length, so seeing it is an unambiguous signal that the
// modern framing must not be applied to this connection.
const LegacyPingFirstByte = 0xFE

// ServeLegacy answers a pre-1.7 server-list ping and closes the connection.
//
// These clients cannot ever join through this proxy, but they can still ask
// what is here, and a server that appears broken to an old launcher generates
// support questions. The request is drained rather than parsed: every variant
// gets the same answer.
func ServeLegacy(conn net.Conn, info Info) error {
	// Drain whatever else the client sent. The caller has already consumed the
	// leading 0xFE, and a 1.4 or 1.5 client's entire ping is that one byte, so
	// there may be nothing at all left to read. A plain Read would then block
	// until the handshake deadline fired and the reply would never be written,
	// which is why this gets a deadline of its own.
	_ = conn.SetReadDeadline(time.Now().Add(legacyDrainTimeout))
	buf := make([]byte, 256)
	_, _ = conn.Read(buf)
	_ = conn.SetReadDeadline(time.Time{})

	motd := StripLegacy(info.MOTD)
	// The legacy response is null-delimited, so an embedded null or newline
	// would corrupt the frame.
	motd = strings.NewReplacer("\x00", " ", "\n", " ", "§", "").Replace(motd)

	name := info.VersionName
	if name == "" {
		name = "Proxy"
	}

	fields := []string{
		"§1",
		strconv.Itoa(int(info.ClientProtocol)),
		name,
		motd,
		strconv.Itoa(info.OnlinePlayers),
		strconv.Itoa(info.MaxPlayers),
	}
	payload := strings.Join(fields, "\x00")

	encoded := utf16.Encode([]rune(payload))
	if len(encoded) > 0xFFFF {
		return fmt.Errorf("legacy ping response too long: %d units", len(encoded))
	}

	out := make([]byte, 0, 3+len(encoded)*2)
	out = append(out, 0xFF) // legacy disconnect packet, which is how this reply is carried
	out = binary.BigEndian.AppendUint16(out, uint16(len(encoded)))
	for _, unit := range encoded {
		out = binary.BigEndian.AppendUint16(out, unit)
	}

	if _, err := conn.Write(out); err != nil && err != io.EOF {
		return err
	}
	return nil
}
