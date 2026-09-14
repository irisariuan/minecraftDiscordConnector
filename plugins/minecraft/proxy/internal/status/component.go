package status

import (
	"encoding/json"
	"strings"
)

// colourNames maps the legacy § colour codes to the component colour names the
// modern client expects. Formatting codes are handled separately.
var colourNames = map[byte]string{
	'0': "black", '1': "dark_blue", '2': "dark_green", '3': "dark_aqua",
	'4': "dark_red", '5': "dark_purple", '6': "gold", '7': "gray",
	'8': "dark_gray", '9': "blue", 'a': "green", 'b': "aqua",
	'c': "red", 'd': "light_purple", 'e': "yellow", 'f': "white",
}

// span is one run of text sharing a single style.
type span struct {
	Text          string `json:"text"`
	Color         string `json:"color,omitempty"`
	Bold          bool   `json:"bold,omitempty"`
	Italic        bool   `json:"italic,omitempty"`
	Underlined    bool   `json:"underlined,omitempty"`
	Strikethrough bool   `json:"strikethrough,omitempty"`
	Obfuscated    bool   `json:"obfuscated,omitempty"`
}

// component is the root text component: an empty parent carrying styled spans.
type component struct {
	Text  string `json:"text"`
	Extra []span `json:"extra,omitempty"`
}

// LegacyToComponent converts a string written with the legacy § colour codes
// into a text component. Operators write MOTDs with § because every Minecraft
// tool does, but the status response has wanted a component for a decade, and
// relying on the client to still interpret § inside a plain string is a bet
// that keeps getting closer to losing.
//
// An unrecognised code is dropped rather than shown, matching the client.
func LegacyToComponent(s string) component {
	root := component{Text: ""}
	cur := span{}
	var b strings.Builder

	flush := func() {
		if b.Len() == 0 {
			return
		}
		out := cur
		out.Text = b.String()
		root.Extra = append(root.Extra, out)
		b.Reset()
	}

	runes := []rune(s)
	for i := 0; i < len(runes); i++ {
		if runes[i] != '§' || i+1 >= len(runes) {
			b.WriteRune(runes[i])
			continue
		}
		code := byte(runes[i+1])
		if code >= 'A' && code <= 'Z' {
			code += 'a' - 'A'
		}
		i++

		if name, ok := colourNames[code]; ok {
			// A colour resets every style, as it does in game.
			flush()
			cur = span{Color: name}
			continue
		}
		switch code {
		case 'k':
			flush()
			cur.Obfuscated = true
		case 'l':
			flush()
			cur.Bold = true
		case 'm':
			flush()
			cur.Strikethrough = true
		case 'n':
			flush()
			cur.Underlined = true
		case 'o':
			flush()
			cur.Italic = true
		case 'r':
			flush()
			cur = span{}
		}
	}
	flush()

	// A component with no styled runs at all still needs its text somewhere.
	if len(root.Extra) == 0 {
		root.Text = ""
	}
	return root
}

// LegacyToComponentJSON renders LegacyToComponent as compact JSON.
func LegacyToComponentJSON(s string) json.RawMessage {
	raw, err := json.Marshal(LegacyToComponent(s))
	if err != nil {
		// A text component built from a string cannot fail to marshal; fall
		// back to the plainest possible component rather than propagating.
		return json.RawMessage(`{"text":""}`)
	}
	return raw
}

// StripLegacy removes every § code, for the legacy ping response and for logs.
func StripLegacy(s string) string {
	var b strings.Builder
	runes := []rune(s)
	for i := 0; i < len(runes); i++ {
		if runes[i] == '§' && i+1 < len(runes) {
			i++
			continue
		}
		b.WriteRune(runes[i])
	}
	return b.String()
}
