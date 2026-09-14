package forward

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"testing"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/auth"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// signatureLen is the fixed prefix VelocityResponse puts in front of the
// payload: an HMAC-SHA256 digest.
const signatureLen = sha256.Size

var testSecret = []byte("a-forwarding-secret")

func TestRequestedVelocityVersion(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input []byte
		want  int32
	}{
		{
			name:  "an empty request means the oldest version",
			input: nil,
			want:  VelocityVersionDefault,
		},
		{
			name:  "an empty but non-nil request means the oldest version",
			input: []byte{},
			want:  VelocityVersionDefault,
		},
		{
			name:  "a version below the default is raised to it",
			input: []byte{0},
			want:  VelocityVersionDefault,
		},
		{
			name:  "the default is returned as itself",
			input: []byte{1},
			want:  1,
		},
		{
			name:  "a version above the default is reported as asked",
			input: []byte{4},
			want:  4,
		},
		{
			name:  "only the first byte is read",
			input: []byte{2, 9, 9, 9},
			want:  2,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := RequestedVelocityVersion(tc.input); got != tc.want {
				t.Errorf("RequestedVelocityVersion(%v) = %d, want %d", tc.input, got, tc.want)
			}
		})
	}
}

// velocityPayload is the payload half of a response, decoded field by field.
type velocityPayload struct {
	Version    int32
	ClientIP   string
	UUID       protocol.UUID
	Name       string
	Properties []auth.Property
}

// splitResponse checks the framing and decodes both halves.
func splitResponse(t *testing.T, out []byte) (signature, payload []byte) {
	t.Helper()
	if len(out) < signatureLen {
		t.Fatalf("response is %d bytes, too short to carry a %d byte signature", len(out), signatureLen)
	}
	return out[:signatureLen], out[signatureLen:]
}

// decodeVelocityPayload reads the payload back with the same codec the backend
// uses, and insists nothing is left over.
func decodeVelocityPayload(t *testing.T, payload []byte) velocityPayload {
	t.Helper()

	r := protocol.NewReader(payload)
	var got velocityPayload
	var err error

	if got.Version, err = r.VarInt(); err != nil {
		t.Fatalf("payload version: %v", err)
	}
	if got.ClientIP, err = r.String(0); err != nil {
		t.Fatalf("payload client address: %v", err)
	}
	if got.UUID, err = r.UUID(); err != nil {
		t.Fatalf("payload uuid: %v", err)
	}
	if got.Name, err = r.String(16); err != nil {
		t.Fatalf("payload name: %v", err)
	}
	count, err := r.VarInt()
	if err != nil {
		t.Fatalf("payload property count: %v", err)
	}
	for i := int32(0); i < count; i++ {
		var prop auth.Property
		if prop.Name, err = r.String(0); err != nil {
			t.Fatalf("property %d name: %v", i, err)
		}
		if prop.Value, err = r.String(0); err != nil {
			t.Fatalf("property %d value: %v", i, err)
		}
		signed, err := r.Bool()
		if err != nil {
			t.Fatalf("property %d signature flag: %v", i, err)
		}
		if signed {
			if prop.Signature, err = r.String(0); err != nil {
				t.Fatalf("property %d signature: %v", i, err)
			}
		}
		got.Properties = append(got.Properties, prop)
	}
	if r.Len() != 0 {
		t.Fatalf("payload has %d trailing bytes after the last property: %x", r.Len(), r.Remaining())
	}
	return got
}

// assertSignature recomputes the HMAC independently of the implementation.
func assertSignature(t *testing.T, secret, signature, payload []byte) {
	t.Helper()
	mac := hmac.New(sha256.New, secret)
	mac.Write(payload)
	want := mac.Sum(nil)
	if !hmac.Equal(signature, want) {
		t.Errorf("signature = %x, want the HMAC-SHA256 of the payload under the secret, %x", signature, want)
	}
}

func TestVelocityResponseRequiresASecret(t *testing.T) {
	t.Parallel()

	id := Identity{UUID: mustUUID(t, testUUID), Name: "Notch", ClientIP: "203.0.113.7"}

	for _, secret := range [][]byte{nil, {}} {
		got, err := VelocityResponse(secret, 1, id)
		if !errors.Is(err, ErrVelocityNoSecret) {
			t.Errorf("VelocityResponse(secret=%v) error = %v, want ErrVelocityNoSecret", secret, err)
		}
		if got != nil {
			t.Errorf("VelocityResponse(secret=%v) returned %x alongside its error, want nil", secret, got)
		}
	}
}

func TestVelocityResponseRequiresAClientAddress(t *testing.T) {
	t.Parallel()

	// The backend uses this as the player's address for bans and logging, so a
	// blank one is a bug worth catching here rather than a mystery downstream.
	id := Identity{UUID: mustUUID(t, testUUID), Name: "Notch", ClientIP: ""}
	got, err := VelocityResponse(testSecret, 1, id)
	if err == nil {
		t.Fatalf("VelocityResponse with an empty client address = %x, want an error", got)
	}
	if got != nil {
		t.Errorf("VelocityResponse returned %x alongside its error, want nil", got)
	}
}

func TestVelocityResponseFraming(t *testing.T) {
	t.Parallel()

	id := Identity{
		UUID:     mustUUID(t, testUUID),
		Name:     "Notch",
		ClientIP: "203.0.113.7",
	}

	out, err := VelocityResponse(testSecret, VelocityVersionDefault, id)
	if err != nil {
		t.Fatalf("VelocityResponse: %v", err)
	}

	signature, payload := splitResponse(t, out)
	if len(signature) != 32 {
		t.Fatalf("signature is %d bytes, want exactly 32", len(signature))
	}
	if len(payload) == 0 {
		t.Fatal("payload is empty; the signature must be followed by the signed body")
	}
	if len(out) != len(signature)+len(payload) {
		t.Fatalf("response is %d bytes, want signature (%d) plus payload (%d)",
			len(out), len(signature), len(payload))
	}
	assertSignature(t, testSecret, signature, payload)

	// A different secret must not verify: that is the whole point of the scheme.
	otherMAC := hmac.New(sha256.New, []byte("not-the-secret"))
	otherMAC.Write(payload)
	if hmac.Equal(signature, otherMAC.Sum(nil)) {
		t.Error("the signature verifies under a different secret, so it is not keyed at all")
	}

	// A tampered payload must not verify under the real secret either.
	tampered := bytes.Clone(payload)
	tampered[len(tampered)-1] ^= 0xFF
	realMAC := hmac.New(sha256.New, testSecret)
	realMAC.Write(tampered)
	if hmac.Equal(signature, realMAC.Sum(nil)) {
		t.Error("the signature still verifies over a tampered payload")
	}
}

func TestVelocityResponsePayloadFields(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name             string
		requestedVersion int32
		id               Identity
		wantVersion      int32
		wantProperties   []auth.Property
	}{
		{
			name:             "no properties",
			requestedVersion: 1,
			id: Identity{
				UUID:     mustUUID(t, testUUID),
				Name:     "Notch",
				ClientIP: "203.0.113.7",
			},
			wantVersion:    1,
			wantProperties: nil,
		},
		{
			name:             "a signed property round-trips with its signature",
			requestedVersion: 1,
			id: Identity{
				UUID:     mustUUID(t, testUUID),
				Name:     "Notch",
				ClientIP: "203.0.113.7",
				Properties: []auth.Property{
					{Name: "textures", Value: "eyJ0aW1lc3RhbXAiOjF9", Signature: "c2lnbmF0dXJl"},
				},
			},
			wantVersion: 1,
			wantProperties: []auth.Property{
				{Name: "textures", Value: "eyJ0aW1lc3RhbXAiOjF9", Signature: "c2lnbmF0dXJl"},
			},
		},
		{
			name:             "an unsigned property round-trips without one",
			requestedVersion: 1,
			id: Identity{
				UUID:     mustUUID(t, testUUID),
				Name:     "Notch",
				ClientIP: "203.0.113.7",
				Properties: []auth.Property{
					{Name: "textures", Value: "dmFsdWU="},
				},
			},
			wantVersion: 1,
			wantProperties: []auth.Property{
				{Name: "textures", Value: "dmFsdWU="},
			},
		},
		{
			name:             "signed and unsigned properties keep their order and flags",
			requestedVersion: 1,
			id: Identity{
				UUID:     mustUUID(t, testUUID),
				Name:     "Notch",
				ClientIP: "203.0.113.7",
				Properties: []auth.Property{
					{Name: "textures", Value: "dA==", Signature: "cw=="},
					{Name: "plain", Value: "cA=="},
					{Name: "last", Value: "bA==", Signature: "eg=="},
				},
			},
			wantVersion: 1,
			wantProperties: []auth.Property{
				{Name: "textures", Value: "dA==", Signature: "cw=="},
				{Name: "plain", Value: "cA=="},
				{Name: "last", Value: "bA==", Signature: "eg=="},
			},
		},
		{
			name:             "a version above what is supported is clamped to 1",
			requestedVersion: 4,
			id: Identity{
				UUID:     mustUUID(t, testUUID),
				Name:     "Notch",
				ClientIP: "203.0.113.7",
			},
			wantVersion:    1,
			wantProperties: nil,
		},
		{
			name:             "an IPv6 address survives verbatim",
			requestedVersion: 1,
			id: Identity{
				UUID:     mustUUID(t, testUUID),
				Name:     "Notch",
				ClientIP: "2001:db8::1",
			},
			wantVersion:    1,
			wantProperties: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			out, err := VelocityResponse(testSecret, tc.requestedVersion, tc.id)
			if err != nil {
				t.Fatalf("VelocityResponse: %v", err)
			}
			signature, payload := splitResponse(t, out)
			assertSignature(t, testSecret, signature, payload)

			got := decodeVelocityPayload(t, payload)
			if got.Version != tc.wantVersion {
				t.Errorf("payload version = %d, want %d", got.Version, tc.wantVersion)
			}
			if got.ClientIP != tc.id.ClientIP {
				t.Errorf("payload client address = %q, want %q", got.ClientIP, tc.id.ClientIP)
			}
			if got.UUID != tc.id.UUID {
				t.Errorf("payload uuid = %s, want %s", got.UUID, tc.id.UUID)
			}
			if got.Name != tc.id.Name {
				t.Errorf("payload name = %q, want %q", got.Name, tc.id.Name)
			}
			if len(got.Properties) != len(tc.wantProperties) {
				t.Fatalf("payload carries %d properties %+v, want %d %+v",
					len(got.Properties), got.Properties, len(tc.wantProperties), tc.wantProperties)
			}
			for i := range tc.wantProperties {
				if got.Properties[i] != tc.wantProperties[i] {
					t.Errorf("property %d = %+v, want %+v", i, got.Properties[i], tc.wantProperties[i])
				}
			}
		})
	}
}

func TestVelocityResponseIsDeterministic(t *testing.T) {
	t.Parallel()

	// Nothing in the payload is random, so two calls must be byte-identical.
	// A backend that retries a login plugin request gets the same answer.
	id := Identity{UUID: mustUUID(t, testUUID), Name: "Notch", ClientIP: "203.0.113.7"}
	first, err := VelocityResponse(testSecret, 1, id)
	if err != nil {
		t.Fatalf("VelocityResponse: %v", err)
	}
	second, err := VelocityResponse(testSecret, 1, id)
	if err != nil {
		t.Fatalf("VelocityResponse: %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Errorf("two identical requests produced different responses:\n %x\n %x", first, second)
	}
}
