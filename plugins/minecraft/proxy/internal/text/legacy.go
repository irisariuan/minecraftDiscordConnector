// Package text turns strings written with the legacy § colour codes into the
// text components the modern client expects, in either of the two forms the
// protocol uses for them.
//
// Operators write MOTDs with § because every Minecraft tool does, and the
// proxy's own messages are written the same way so that the two look alike in
// the source. The client, however, has wanted a structured component for a
// decade, and whether it still interprets a § inside a component's text is
// nowhere documented — the formatting codes are marked deprecated and described
// as being for text outside gameplay. Converting rather than hoping is the only
// version of this that is certain to work, so nothing here ever puts a § on the
// wire.
package text

import (
	"encoding/json"
	"strings"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/nbt"
)

// colourNames maps the legacy § colour codes to the component colour names the
// modern client expects. Formatting codes are handled separately.
var colourNames = map[byte]string{
	'0': "black", '1': "dark_blue", '2': "dark_green", '3': "dark_aqua",
	'4': "dark_red", '5': "dark_purple", '6': "gold", '7': "gray",
	'8': "dark_gray", '9': "blue", 'a': "green", 'b': "aqua",
	'c': "red", 'd': "light_purple", 'e': "yellow", 'f': "white",
}

// Span is one run of text sharing a single style.
type Span struct {
	Text          string `json:"text"`
	Color         string `json:"color,omitempty"`
	Bold          bool   `json:"bold,omitempty"`
	Italic        bool   `json:"italic,omitempty"`
	Underlined    bool   `json:"underlined,omitempty"`
	Strikethrough bool   `json:"strikethrough,omitempty"`
	Obfuscated    bool   `json:"obfuscated,omitempty"`
}

// Component is the root text component: an empty parent carrying styled spans.
type Component struct {
	Text  string `json:"text"`
	Extra []Span `json:"extra,omitempty"`
}

// FromLegacy converts a string written with the legacy § colour codes into a
// text component.
//
// An unrecognised code is dropped rather than shown, matching the client.
func FromLegacy(s string) Component {
	root := Component{Text: ""}
	cur := Span{}
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
		next := runes[i+1]
		if next > 127 {
			// Narrowing a multibyte rune to a byte would let something like
			// U+0142 masquerade as the colour code its low byte happens to
			// spell. No formatting code is outside ASCII, so this is literal
			// text and the section sign stays with it.
			b.WriteRune(runes[i])
			continue
		}
		code := byte(next)
		if code >= 'A' && code <= 'Z' {
			code += 'a' - 'A'
		}
		i++

		if name, ok := colourNames[code]; ok {
			// A colour resets every style, as it does in game.
			flush()
			cur = Span{Color: name}
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
			cur = Span{}
		}
	}
	flush()
	return root
}

// JSON renders FromLegacy as compact JSON, which is the form the status
// response and every pre-1.20.3 play packet expect.
func JSON(s string) json.RawMessage {
	raw, err := json.Marshal(FromLegacy(s))
	if err != nil {
		// A text component built from a string cannot fail to marshal; fall
		// back to the plainest possible component rather than propagating.
		return json.RawMessage(`{"text":""}`)
	}
	return raw
}

// NetworkNBT renders FromLegacy as network NBT, which is how text components
// travel in play-phase packets from 1.20.3 onward.
//
// The shape mirrors the JSON exactly — an empty parent with styled children —
// because it is the same component, and a client that disagreed with one of the
// two renderings about what it meant would be a client with a bug.
func NetworkNBT(s string) ([]byte, error) {
	c := FromLegacy(s)

	root := nbt.Compound{"text": nbt.String(c.Text)}
	if len(c.Extra) > 0 {
		elems := make([]nbt.Tag, 0, len(c.Extra))
		for _, span := range c.Extra {
			elems = append(elems, spanNBT(span))
		}
		root["extra"] = nbt.List{ElemType: nbt.TypeCompound, Elems: elems}
	}
	return nbt.MarshalNetworkTag(root)
}

// spanNBT renders one styled run. Only the styles actually set are written:
// an absent field inherits from the parent, whereas a field written as false
// overrides an inherited style, and the two are not the same thing.
func spanNBT(s Span) nbt.Compound {
	out := nbt.Compound{"text": nbt.String(s.Text)}
	if s.Color != "" {
		out["color"] = nbt.String(s.Color)
	}
	if s.Bold {
		out["bold"] = nbt.Bool(true)
	}
	if s.Italic {
		out["italic"] = nbt.Bool(true)
	}
	if s.Underlined {
		out["underlined"] = nbt.Bool(true)
	}
	if s.Strikethrough {
		out["strikethrough"] = nbt.Bool(true)
	}
	if s.Obfuscated {
		out["obfuscated"] = nbt.Bool(true)
	}
	return out
}

// Strip removes every § code, for the legacy ping response and for logs.
func Strip(s string) string {
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
