package mcver

import "testing"

// These tests pin the protocol boundaries the rest of the proxy branches on.
//
// They are not testing arithmetic. Each boundary was checked against the
// protocol documentation, and an off-by-one in any of them desynchronises a
// live connection in a way that is very hard to diagnose from the symptom, so
// the point of the table is to make a future edit that moves one of these
// numbers fail loudly rather than quietly.
func TestVersionBoundaries(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		fn   func(int32) bool
		// first is the lowest protocol version for which fn must be true.
		first int32
		// last, when non-zero, is the highest version for which fn is true.
		last int32
	}{
		{
			name:  "the configuration phase arrives with 1.20.2",
			fn:    HasConfigurationPhase,
			first: 764,
		},
		{
			name:  "text components become NBT at 1.20.3",
			fn:    UsesNBTComponents,
			first: 765,
		},
		{
			name:  "transfers arrive with 1.20.5",
			fn:    SupportsTransfer,
			first: 766,
		},
		{
			name:  "Login Start carries a UUID from 1.19.1",
			fn:    LoginStartHasUUID,
			first: 760,
		},
		{
			// The UUID is behind a boolean from 1.19.1 until 1.20.2 makes it
			// unconditional, so this one has an upper bound as well.
			name:  "the Login Start UUID is optional only between 1.19.1 and 1.20.2",
			fn:    LoginStartHasOptionalUUID,
			first: 760,
			last:  763,
		},
		{
			// 1.19 has the signature block and no UUID; 1.19.3 drops it again.
			name:  "the Login Start signature block exists only across the 1.19 line",
			fn:    LoginStartHasSignature,
			first: 759,
			last:  760,
		},
		{
			name:  "Encryption Response may carry a salt only across the 1.19 line",
			fn:    EncryptionResponseHasSalt,
			first: 759,
			last:  760,
		},
		{
			name:  "Encryption Request gains its authenticate flag at 1.20.5",
			fn:    EncryptionRequestHasAuthFlag,
			first: 766,
		},
		{
			name:  "a client can be held only from 1.13, when login plugin messages arrived",
			fn:    CanBeHeld,
			first: 393,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if tc.fn(tc.first - 1) {
				t.Errorf("protocol %d is one below the boundary but was included", tc.first-1)
			}
			if !tc.fn(tc.first) {
				t.Errorf("protocol %d is the boundary but was excluded", tc.first)
			}
			if tc.last == 0 {
				// Open-ended: must stay true for versions that do not exist yet,
				// so that a new release does not silently change behaviour.
				if !tc.fn(9999) {
					t.Error("a future protocol version was excluded; this rule should have no upper bound")
				}
				return
			}
			if !tc.fn(tc.last) {
				t.Errorf("protocol %d is the last included version but was excluded", tc.last)
			}
			if tc.fn(tc.last + 1) {
				t.Errorf("protocol %d is one past the range but was included", tc.last+1)
			}
		})
	}
}

// TestLoginStartLayoutsAreConsistent checks the combinations that actually
// occur, because the three Login Start predicates are read together and a
// version where they disagree would be parsed wrongly.
func TestLoginStartLayoutsAreConsistent(t *testing.T) {
	t.Parallel()

	cases := []struct {
		protocol      string
		version       int32
		wantSignature bool
		wantOptUUID   bool
		wantAnyUUID   bool
	}{
		{"1.8", 47, false, false, false},
		{"1.18.2", 758, false, false, false},
		{"1.19", 759, true, false, false},
		{"1.19.1", 760, true, true, true},
		{"1.19.3", 761, false, true, true},
		{"1.20", 763, false, true, true},
		{"1.20.2", 764, false, false, true},
		{"1.21", 767, false, false, true},
	}

	for _, tc := range cases {
		t.Run(tc.protocol, func(t *testing.T) {
			t.Parallel()

			if got := LoginStartHasSignature(tc.version); got != tc.wantSignature {
				t.Errorf("LoginStartHasSignature = %v, want %v", got, tc.wantSignature)
			}
			if got := LoginStartHasOptionalUUID(tc.version); got != tc.wantOptUUID {
				t.Errorf("LoginStartHasOptionalUUID = %v, want %v", got, tc.wantOptUUID)
			}
			if got := LoginStartHasUUID(tc.version); got != tc.wantAnyUUID {
				t.Errorf("LoginStartHasUUID = %v, want %v", got, tc.wantAnyUUID)
			}
			// 1.19 is the one release with a signature block and no UUID at all.
			// Getting this pair backwards is the classic misparse.
			if tc.version == 759 && LoginStartHasUUID(tc.version) {
				t.Error("1.19 must not expect a UUID in Login Start")
			}
		})
	}
}

// TestMinSupportedIsTheOldestModernHandshake guards the floor: below 1.7.2 the
// handshake is a different protocol entirely and cannot be parsed at all.
func TestMinSupportedIsTheOldestModernHandshake(t *testing.T) {
	t.Parallel()

	if MinSupported != V1_7_2 {
		t.Errorf("MinSupported = %d, want %d (1.7.2)", MinSupported, V1_7_2)
	}
	if MinSupported > V1_13 {
		t.Error("the supported floor must not be above the version at which clients become holdable")
	}
}
