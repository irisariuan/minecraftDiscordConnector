package route

import (
	"testing"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/auth"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// Offline UUIDs published for these names; they are what a vanilla server in
// offline mode assigns, and so what the connector plugin reports from inside
// one. Hard-coded rather than computed so a change to the derivation shows up
// as a failure instead of agreeing with itself.
var offlineVectors = map[string]string{
	"Notch":  "b50ad385-829d-3141-a216-7e7d7539ba7f",
	"jeb_":   "a762f560-4fce-3236-812a-b80efff0b62b",
	"Player": "a01e3843-e521-3998-958a-f459800e4d11",
}

func profileFor(t *testing.T, uuid, name string) *auth.Profile {
	t.Helper()
	id, err := protocol.ParseUUID(uuid)
	if err != nil {
		t.Fatalf("parse uuid: %v", err)
	}
	return &auth.Profile{ID: id, Name: name}
}

func TestPlayerIdentityCarriesBothUUIDs(t *testing.T) {
	const mojangUUID = "069a79f4-44e9-4726-a5be-fca90e38aaf5"

	for name, wantOffline := range offlineVectors {
		player := playerIdentity(profileFor(t, mojangUUID, name), "1.2.3.4", 767)

		if player.UUID != mojangUUID {
			t.Errorf("%s: UUID = %q, want the verified %q", name, player.UUID, mojangUUID)
		}
		if player.OfflineUUID != wantOffline {
			t.Errorf("%s: OfflineUUID = %q, want %q", name, player.OfflineUUID, wantOffline)
		}
		if player.Name != name || player.IP != "1.2.3.4" || player.Protocol != 767 {
			t.Errorf("%s: identity = %+v", name, player)
		}
	}
}

// The offline UUID must follow the name Mojang returned, not the one the client
// typed: the derivation is case-sensitive, so using the claimed spelling would
// hand the bot a UUID no backend ever assigns.
func TestPlayerIdentityUsesTheVerifiedName(t *testing.T) {
	const mojangUUID = "069a79f4-44e9-4726-a5be-fca90e38aaf5"

	verified := playerIdentity(profileFor(t, mojangUUID, "Notch"), "", 767)
	claimed := playerIdentity(profileFor(t, mojangUUID, "notch"), "", 767)

	if verified.OfflineUUID != offlineVectors["Notch"] {
		t.Errorf("OfflineUUID = %q, want %q", verified.OfflineUUID, offlineVectors["Notch"])
	}
	if claimed.OfflineUUID == verified.OfflineUUID {
		t.Error("casing must change the offline UUID; the derivation is case-sensitive")
	}
}
