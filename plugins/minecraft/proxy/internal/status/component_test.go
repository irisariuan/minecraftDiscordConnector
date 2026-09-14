package status

import (
	"encoding/json"
	"testing"
)

// decodedSpan mirrors one styled run exactly as it appears on the wire. The
// tests decode the rendered JSON into this rather than comparing against the
// package's own structs, so that a change to the struct tags is caught too.
type decodedSpan struct {
	Text          string `json:"text"`
	Color         string `json:"color"`
	Bold          bool   `json:"bold"`
	Italic        bool   `json:"italic"`
	Underlined    bool   `json:"underlined"`
	Strikethrough bool   `json:"strikethrough"`
	Obfuscated    bool   `json:"obfuscated"`
}

// decodedComponent is the root component the client receives.
type decodedComponent struct {
	Text  string        `json:"text"`
	Extra []decodedSpan `json:"extra"`
}

// decodeComponent unmarshals raw and fails the test if it is not valid JSON of
// the expected shape.
func decodeComponent(t *testing.T, raw json.RawMessage) decodedComponent {
	t.Helper()
	if !json.Valid(raw) {
		t.Fatalf("rendered component is not valid JSON: %s", raw)
	}
	var got decodedComponent
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("rendered component %s does not unmarshal into a text component: %v", raw, err)
	}
	return got
}

// spansOf converts the package's own component into the decoded shape so that a
// table can state one expectation and have it checked against both
// LegacyToComponent and LegacyToComponentJSON.
func spansOf(c component) []decodedSpan {
	if len(c.Extra) == 0 {
		return nil
	}
	out := make([]decodedSpan, 0, len(c.Extra))
	for _, s := range c.Extra {
		out = append(out, decodedSpan{
			Text:          s.Text,
			Color:         s.Color,
			Bold:          s.Bold,
			Italic:        s.Italic,
			Underlined:    s.Underlined,
			Strikethrough: s.Strikethrough,
			Obfuscated:    s.Obfuscated,
		})
	}
	return out
}

func assertSpans(t *testing.T, what string, got, want []decodedSpan) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s: got %d spans %+v, want %d spans %+v", what, len(got), got, len(want), want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("%s: span %d is %+v, want %+v", what, i, got[i], want[i])
		}
	}
}

func TestLegacyToComponent(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  []decodedSpan
	}{
		{
			name:  "plain text becomes a single unstyled span",
			input: "Server Hub",
			want:  []decodedSpan{{Text: "Server Hub"}},
		},
		{
			name:  "empty input renders an empty component with no spans",
			input: "",
			want:  nil,
		},
		{
			name:  "a colour code styles the text that follows it",
			input: "§aReady to play",
			want:  []decodedSpan{{Text: "Ready to play", Color: "green"}},
		},
		{
			name:  "text before a colour code keeps its own unstyled span",
			input: "Hub §cdown",
			want: []decodedSpan{
				{Text: "Hub "},
				{Text: "down", Color: "red"},
			},
		},
		{
			name:  "a colour resets formatting applied before it",
			input: "§lBold§aplain green",
			want: []decodedSpan{
				{Text: "Bold", Bold: true},
				{Text: "plain green", Color: "green"},
			},
		},
		{
			name:  "format codes stack onto one another",
			input: "§l§o§nAll three",
			want:  []decodedSpan{{Text: "All three", Bold: true, Italic: true, Underlined: true}},
		},
		{
			name:  "a format code keeps the colour that is already active",
			input: "§c§lShout",
			want:  []decodedSpan{{Text: "Shout", Color: "red", Bold: true}},
		},
		{
			name:  "obfuscated and strikethrough are carried through",
			input: "§kmagic§r§mgone",
			want: []decodedSpan{
				{Text: "magic", Obfuscated: true},
				{Text: "gone", Strikethrough: true},
			},
		},
		{
			name:  "§r clears both colour and formatting",
			input: "§c§lShout§rback to normal",
			want: []decodedSpan{
				{Text: "Shout", Color: "red", Bold: true},
				{Text: "back to normal"},
			},
		},
		{
			name:  "an unrecognised code is dropped rather than shown",
			input: "a§zb",
			want:  []decodedSpan{{Text: "ab"}},
		},
		{
			name:  "a trailing lone § has no code to consume and stays in the text",
			input: "Server Hub§",
			want:  []decodedSpan{{Text: "Server Hub§"}},
		},
		{
			name:  "uppercase codes are treated as their lowercase form",
			input: "§AGreen§LBold",
			want: []decodedSpan{
				{Text: "Green", Color: "green"},
				{Text: "Bold", Color: "green", Bold: true},
			},
		},
		{
			name:  "multibyte text survives unchanged",
			input: "§b日本語のサーバー — ok",
			want:  []decodedSpan{{Text: "日本語のサーバー — ok", Color: "aqua"}},
		},
		{
			name:  "the newline a MOTD may carry is preserved inside its span",
			input: "§bServer Hub§r\n§7Join to start a server",
			want: []decodedSpan{
				{Text: "Server Hub", Color: "aqua"},
				{Text: "\n"},
				{Text: "Join to start a server", Color: "gray"},
			},
		},
		{
			name:  "every colour code maps to a name",
			input: "§0a§1b§2c§3d§4e§5f§6g§7h§8i§9j§ak§bl§cm§dn§eo§fp",
			want: []decodedSpan{
				{Text: "a", Color: "black"},
				{Text: "b", Color: "dark_blue"},
				{Text: "c", Color: "dark_green"},
				{Text: "d", Color: "dark_aqua"},
				{Text: "e", Color: "dark_red"},
				{Text: "f", Color: "dark_purple"},
				{Text: "g", Color: "gold"},
				{Text: "h", Color: "gray"},
				{Text: "i", Color: "dark_gray"},
				{Text: "j", Color: "blue"},
				{Text: "k", Color: "green"},
				{Text: "l", Color: "aqua"},
				{Text: "m", Color: "red"},
				{Text: "n", Color: "light_purple"},
				{Text: "o", Color: "yellow"},
				{Text: "p", Color: "white"},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := LegacyToComponent(tc.input)
			if got.Text != "" {
				t.Errorf("root text is %q, want \"\": every run belongs in extra", got.Text)
			}
			assertSpans(t, "LegacyToComponent("+tc.input+")", spansOf(got), tc.want)

			raw := LegacyToComponentJSON(tc.input)
			decoded := decodeComponent(t, raw)
			if decoded.Text != "" {
				t.Errorf("decoded root text is %q, want \"\"", decoded.Text)
			}
			assertSpans(t, "LegacyToComponentJSON("+tc.input+") -> "+string(raw), decoded.Extra, tc.want)
		})
	}
}

func TestLegacyToComponentJSONOmitsUnsetStyles(t *testing.T) {
	t.Parallel()

	// An unstyled run must not carry "bold":false and friends: the omitempty
	// tags exist so an unstyled span inherits from its parent rather than
	// pinning every style off.
	got := string(LegacyToComponentJSON("plain"))
	want := `{"text":"","extra":[{"text":"plain"}]}`
	if got != want {
		t.Errorf("LegacyToComponentJSON(%q) = %s, want %s", "plain", got, want)
	}
}

func TestLegacyToComponentJSONEmptyInput(t *testing.T) {
	t.Parallel()

	got := string(LegacyToComponentJSON(""))
	want := `{"text":""}`
	if got != want {
		t.Errorf("LegacyToComponentJSON(%q) = %s, want %s", "", got, want)
	}
}

func TestStripLegacy(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "text with no codes is returned unchanged",
			input: "Server Hub",
			want:  "Server Hub",
		},
		{
			name:  "empty input stays empty",
			input: "",
			want:  "",
		},
		{
			name:  "colour and format codes are removed with their §",
			input: "§aGreen §lBold§r done",
			want:  "Green Bold done",
		},
		{
			name:  "an unrecognised code is removed just like a real one",
			input: "a§zb",
			want:  "ab",
		},
		{
			name:  "a doubled § consumes the second § as the code",
			input: "§§a",
			want:  "a",
		},
		{
			name:  "a trailing lone § has no code to strip and survives",
			input: "Server Hub§",
			want:  "Server Hub§",
		},
		{
			name:  "multibyte text is untouched",
			input: "§b日本語 — ok",
			want:  "日本語 — ok",
		},
		{
			name:  "a newline is not a code and is preserved",
			input: "§bHub§r\n§7line two",
			want:  "Hub\nline two",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := StripLegacy(tc.input); got != tc.want {
				t.Errorf("StripLegacy(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}
