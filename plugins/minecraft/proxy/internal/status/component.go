package status

import (
	"encoding/json"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/text"
)

// The § conversion moved to internal/text when the waiting world needed the
// same thing in NBT rather than JSON. These aliases and wrappers stay because
// the status response is what the conversion was written for, and renaming its
// entry points at the call sites would have gained nothing.

// component is the root text component: an empty parent carrying styled spans.
type component = text.Component

// LegacyToComponent converts a string written with the legacy § colour codes
// into a text component.
func LegacyToComponent(s string) component { return text.FromLegacy(s) }

// LegacyToComponentJSON renders LegacyToComponent as compact JSON.
func LegacyToComponentJSON(s string) json.RawMessage { return text.JSON(s) }

// StripLegacy removes every § code, for the legacy ping response and for logs.
func StripLegacy(s string) string { return text.Strip(s) }
