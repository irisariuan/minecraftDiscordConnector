package forward

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/auth"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// testUUID is Notch's, dashed as the control API sends them.
const testUUID = "069a79f4-44e9-4726-a5be-fca90e38aaf5"

func mustUUID(t *testing.T, s string) protocol.UUID {
	t.Helper()
	u, err := protocol.ParseUUID(s)
	if err != nil {
		t.Fatalf("ParseUUID(%q): %v", s, err)
	}
	return u
}

func TestParseMode(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    Mode
		wantErr bool
	}{
		{name: "none", input: "none", want: ModeNone},
		{name: "bungeecord", input: "bungeecord", want: ModeBungeeCord},
		{name: "velocity", input: "velocity", want: ModeVelocity},
		{name: "empty means no forwarding", input: "", want: ModeNone},
		{name: "mixed case is accepted", input: "BungeeCord", want: ModeBungeeCord},
		{name: "upper case is accepted", input: "VELOCITY", want: ModeVelocity},
		{name: "surrounding whitespace is trimmed", input: "  velocity\t", want: ModeVelocity},
		{name: "whitespace only is empty and means none", input: "   ", want: ModeNone},
		{
			name:    "an unknown value degrades to none and reports the typo",
			input:   "bungee",
			want:    ModeNone,
			wantErr: true,
		},
		{
			name:    "a near miss is still an error rather than a guess",
			input:   "velocity-modern",
			want:    ModeNone,
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := ParseMode(tc.input)
			if got != tc.want {
				t.Errorf("ParseMode(%q) mode = %q, want %q", tc.input, got, tc.want)
			}
			switch {
			case tc.wantErr && err == nil:
				t.Errorf("ParseMode(%q) returned no error, want one naming the bad value", tc.input)
			case tc.wantErr && !strings.Contains(err.Error(), tc.input):
				t.Errorf("ParseMode(%q) error %q does not quote the offending value", tc.input, err)
			case !tc.wantErr && err != nil:
				t.Errorf("ParseMode(%q) returned %v, want nil", tc.input, err)
			}
		})
	}
}

// bungeeParts splits a forwarding address and insists on the documented four
// null-separated fields.
func bungeeParts(t *testing.T, addr string) (host, ip, uuid, props string) {
	t.Helper()
	parts := strings.Split(addr, "\x00")
	if len(parts) != 4 {
		t.Fatalf("forwarding address has %d null-separated parts %q, want exactly 4", len(parts), parts)
	}
	return parts[0], parts[1], parts[2], parts[3]
}

func TestBungeeAddressLayout(t *testing.T) {
	t.Parallel()

	id := Identity{
		UUID:     mustUUID(t, testUUID),
		Name:     "Notch",
		ClientIP: "203.0.113.7",
		Properties: []auth.Property{
			{Name: "textures", Value: "eyJ0aW1lc3RhbXAiOjF9", Signature: "c2lnbmF0dXJl"},
		},
	}

	got, err := BungeeAddress("mc.example.com", id)
	if err != nil {
		t.Fatalf("BungeeAddress: %v", err)
	}
	host, ip, uuid, props := bungeeParts(t, got)

	if host != "mc.example.com" {
		t.Errorf("part 0 (host) = %q, want %q", host, "mc.example.com")
	}
	if ip != "203.0.113.7" {
		t.Errorf("part 1 (client ip) = %q, want %q", ip, "203.0.113.7")
	}
	if want := "069a79f444e94726a5befca90e38aaf5"; uuid != want {
		t.Errorf("part 2 (uuid) = %q, want the undashed %q", uuid, want)
	}
	if strings.Contains(uuid, "-") {
		t.Errorf("part 2 (uuid) %q still carries dashes; Spigot rejects a dashed uuid here", uuid)
	}

	var decoded []auth.Property
	if err := json.Unmarshal([]byte(props), &decoded); err != nil {
		t.Fatalf("part 3 (properties) %q is not a property array: %v", props, err)
	}
	if len(decoded) != 1 {
		t.Fatalf("decoded %d properties, want 1", len(decoded))
	}
	if decoded[0] != id.Properties[0] {
		t.Errorf("property = %+v, want %+v", decoded[0], id.Properties[0])
	}
}

func TestBungeeAddressProperties(t *testing.T) {
	t.Parallel()

	base := Identity{UUID: mustUUID(t, testUUID), Name: "Notch", ClientIP: "203.0.113.7"}

	t.Run("a nil property list serialises as an empty array, not null", func(t *testing.T) {
		t.Parallel()

		id := base
		id.Properties = nil
		got, err := BungeeAddress("mc.example.com", id)
		if err != nil {
			t.Fatalf("BungeeAddress: %v", err)
		}
		_, _, _, props := bungeeParts(t, got)
		if props != "[]" {
			t.Errorf("properties field = %q, want %q: Spigot splits on nulls and needs the field present", props, "[]")
		}
	})

	t.Run("an empty property list serialises as an empty array", func(t *testing.T) {
		t.Parallel()

		id := base
		id.Properties = []auth.Property{}
		got, err := BungeeAddress("mc.example.com", id)
		if err != nil {
			t.Fatalf("BungeeAddress: %v", err)
		}
		_, _, _, props := bungeeParts(t, got)
		if props != "[]" {
			t.Errorf("properties field = %q, want %q", props, "[]")
		}
	})

	t.Run("an unsigned property omits its signature", func(t *testing.T) {
		t.Parallel()

		id := base
		id.Properties = []auth.Property{{Name: "textures", Value: "dmFsdWU="}}
		got, err := BungeeAddress("mc.example.com", id)
		if err != nil {
			t.Fatalf("BungeeAddress: %v", err)
		}
		_, _, _, props := bungeeParts(t, got)
		if want := `[{"name":"textures","value":"dmFsdWU="}]`; props != want {
			t.Errorf("properties field = %s, want %s", props, want)
		}
	})

	t.Run("a signed property carries its signature", func(t *testing.T) {
		t.Parallel()

		id := base
		id.Properties = []auth.Property{{Name: "textures", Value: "dmFsdWU=", Signature: "c2ln"}}
		got, err := BungeeAddress("mc.example.com", id)
		if err != nil {
			t.Fatalf("BungeeAddress: %v", err)
		}
		_, _, _, props := bungeeParts(t, got)
		if want := `[{"name":"textures","value":"dmFsdWU=","signature":"c2ln"}]`; props != want {
			t.Errorf("properties field = %s, want %s", props, want)
		}
	})

	t.Run("several properties keep their order", func(t *testing.T) {
		t.Parallel()

		id := base
		id.Properties = []auth.Property{
			{Name: "textures", Value: "dA=="},
			{Name: "other", Value: "bw==", Signature: "cw=="},
		}
		got, err := BungeeAddress("mc.example.com", id)
		if err != nil {
			t.Fatalf("BungeeAddress: %v", err)
		}
		_, _, _, props := bungeeParts(t, got)
		var decoded []auth.Property
		if err := json.Unmarshal([]byte(props), &decoded); err != nil {
			t.Fatalf("properties field %q is not a property array: %v", props, err)
		}
		if len(decoded) != 2 || decoded[0].Name != "textures" || decoded[1].Name != "other" {
			t.Errorf("properties = %+v, want textures then other", decoded)
		}
	})
}

// TestBungeeAddressRejectsNullBytes is the security test for this scheme.
//
// The fields are separated by null bytes and the backend trusts whatever it is
// given, so a null byte reaching the address from a client-controlled hostname
// would let that client append its own IP, UUID and properties and become
// anyone. Sanitising would silently change the value the backend sees; refusing
// is the only safe answer.
func TestBungeeAddressRejectsNullBytes(t *testing.T) {
	t.Parallel()

	id := Identity{UUID: mustUUID(t, testUUID), Name: "Notch", ClientIP: "203.0.113.7"}

	tests := []struct {
		name string
		host string
		ip   string
		// wantErrContains is checked only where the message is part of the
		// contract; the refusal itself is what every case pins.
		wantErrContains string
	}{
		{
			name:            "a null in the handshake host",
			host:            "mc.example.com\x00spoofed",
			ip:              "203.0.113.7",
			wantErrContains: "null byte",
		},
		{
			name:            "a host carrying a whole forged forwarding payload",
			host:            "mc.example.com\x001.2.3.4\x00069a79f444e94726a5befca90e38aaf5\x00[]",
			ip:              "203.0.113.7",
			wantErrContains: "null byte",
		},
		{
			name:            "a bare null as the host",
			host:            "\x00",
			ip:              "203.0.113.7",
			wantErrContains: "null byte",
		},
		{
			name: "a null in the client address",
			host: "mc.example.com",
			ip:   "203.0.113.7\x00069a79f444e94726a5befca90e38aaf5",
		},
		{
			name: "a null in both",
			host: "mc.example.com\x00x",
			ip:   "203.0.113.7\x00y",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			victim := id
			victim.ClientIP = tc.ip
			got, err := BungeeAddress(tc.host, victim)
			if err == nil {
				t.Fatalf("BungeeAddress(%q, ip=%q) = %q with no error; a null byte must be refused, not forwarded",
					tc.host, tc.ip, got)
			}
			if got != "" {
				t.Errorf("BungeeAddress returned %q alongside its error, want the empty string", got)
			}
			if tc.wantErrContains != "" && !strings.Contains(err.Error(), tc.wantErrContains) {
				t.Errorf("error %q does not mention %q", err, tc.wantErrContains)
			}
		})
	}
}

// TestBungeeAddressClientAddress covers the validation BungeeAddress applies to
// the address half of the payload. Spigot rejects the whole connection, with no
// useful error, when the field does not match what it expects, so anything that
// would not survive the backend has to be refused here instead.
func TestBungeeAddressClientAddress(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		ip      string
		want    string
		wantErr bool
	}{
		{name: "an IPv4 address is passed through", ip: "203.0.113.7", want: "203.0.113.7"},
		{name: "an IPv6 address is passed through", ip: "2001:db8::1", want: "2001:db8::1"},
		{name: "an uppercase IPv6 address is normalised", ip: "2001:DB8::AB", want: "2001:db8::ab"},
		{name: "the loopback address is fine", ip: "127.0.0.1", want: "127.0.0.1"},
		{name: "an empty address is refused", ip: "", wantErr: true},
		{name: "a hostname is refused", ip: "player.example.com", wantErr: true},
		{
			// The check is a character class, not a parse, and a colon has to
			// be allowed for IPv6. Callers strip the port before they get here
			// (route.clientIP), so this is documented rather than guarded.
			name: "a port is not detected, because colons belong to IPv6",
			ip:   "203.0.113.7:25565",
			want: "203.0.113.7:25565",
		},
		{name: "an IPv6 zone identifier is refused", ip: "fe80::1%eth0", wantErr: true},
		{name: "a null byte is refused", ip: "203.0.113.7\x00x", wantErr: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			id := Identity{UUID: mustUUID(t, testUUID), Name: "Notch", ClientIP: tc.ip}
			got, err := BungeeAddress("mc.example.com", id)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("BungeeAddress with client address %q = %q, want an error", tc.ip, got)
				}
				if got != "" {
					t.Errorf("BungeeAddress returned %q alongside its error, want the empty string", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("BungeeAddress with client address %q: %v", tc.ip, err)
			}
			_, ip, _, _ := bungeeParts(t, got)
			if ip != tc.want {
				t.Errorf("forwarded client address = %q, want %q", ip, tc.want)
			}
		})
	}
}

func TestBungeeAddressPreservesAnEmptyHost(t *testing.T) {
	t.Parallel()

	// An empty host is odd but not dangerous, and the field must still be
	// present so the part count stays at four.
	id := Identity{UUID: mustUUID(t, testUUID), Name: "Notch", ClientIP: "203.0.113.7"}
	got, err := BungeeAddress("", id)
	if err != nil {
		t.Fatalf("BungeeAddress: %v", err)
	}
	host, ip, _, _ := bungeeParts(t, got)
	if host != "" {
		t.Errorf("host field = %q, want the empty string it was given", host)
	}
	if ip != "203.0.113.7" {
		t.Errorf("client ip field = %q, want %q", ip, "203.0.113.7")
	}
}
