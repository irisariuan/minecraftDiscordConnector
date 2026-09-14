package text

import (
	"strings"
	"testing"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/nbt"
)

// The JSON rendering is covered through the status package, which is what it
// was written for. These tests cover the NBT rendering, which is newer and is
// the one the waiting world depends on.

func decodeNBT(t *testing.T, s string) nbt.Compound {
	t.Helper()
	raw, err := NetworkNBT(s)
	if err != nil {
		t.Fatalf("NetworkNBT(%q): %v", s, err)
	}
	root, err := nbt.Unmarshal(raw, true)
	if err != nil {
		t.Fatalf("NetworkNBT(%q) is not network NBT: %v", s, err)
	}
	return root
}

func runs(t *testing.T, root nbt.Compound) []nbt.Compound {
	t.Helper()
	list, ok := root["extra"].(nbt.List)
	if !ok {
		return nil
	}
	out := make([]nbt.Compound, 0, len(list.Elems))
	for i, elem := range list.Elems {
		run, ok := elem.(nbt.Compound)
		if !ok {
			t.Fatalf("run %d is %T, wanted a compound", i, elem)
		}
		out = append(out, run)
	}
	return out
}

func TestNetworkNBTCarriesColourAsAComponentField(t *testing.T) {
	t.Parallel()

	got := runs(t, decodeNBT(t, "§aSurvival§7 is running"))
	if len(got) != 2 {
		t.Fatalf("got %d runs, wanted 2: %+v", len(got), got)
	}
	if got[0]["text"] != nbt.String("Survival") || got[0]["color"] != nbt.String("green") {
		t.Errorf("first run is %+v", got[0])
	}
	if got[1]["text"] != nbt.String(" is running") || got[1]["color"] != nbt.String("gray") {
		t.Errorf("second run is %+v", got[1])
	}
}

// No formatting code may survive into a component's text.
//
// Whether a modern client still interprets a section sign inside a component is
// undocumented and the codes are deprecated, so a style that travelled that way
// might or might not be rendered. A lone section sign is a different matter: it
// is a character somebody typed, it styles nothing, and it is passed through on
// purpose — an operator whose MOTD says "§" should see one.
func TestNetworkNBTLeavesNoFormattingCodeInTheText(t *testing.T) {
	t.Parallel()

	for _, in := range []string{
		"§aplain", "§l§nstyled", "§r reset", "no codes at all",
		"§", "trailing §", "§z unknown code", "§§a doubled", "§Amixed case",
	} {
		for _, run := range runs(t, decodeNBT(t, in)) {
			body, _ := run["text"].(nbt.String)
			text := []rune(string(body))
			for i, r := range text {
				if r != '§' || i+1 >= len(text) {
					continue
				}
				if isFormattingCode(text[i+1]) {
					t.Errorf("NetworkNBT(%q) left the code §%c in the text %q",
						in, text[i+1], body)
				}
			}
		}
	}
}

// isFormattingCode reports whether a rune following a section sign would be
// read as a style by a client that still interprets them.
func isFormattingCode(r rune) bool {
	if r >= 'A' && r <= 'Z' {
		r += 'a' - 'A'
	}
	if _, ok := colourNames[byte(r)]; ok && r < 128 {
		return true
	}
	return strings.ContainsRune("klmnor", r)
}

func TestNetworkNBTOnlyWritesStylesThatAreSet(t *testing.T) {
	t.Parallel()

	// An absent field inherits from the parent; a field written as false
	// overrides an inherited style. Writing every style as false would make
	// every line of chat immune to a parent it does not have, which is
	// harmless, but it would also treble the size of every packet.
	got := runs(t, decodeNBT(t, "§lbold"))
	if len(got) != 1 {
		t.Fatalf("got %d runs, wanted 1", len(got))
	}
	if got[0]["bold"] != nbt.Byte(1) {
		t.Errorf("bold is %v, wanted 1", got[0]["bold"])
	}
	for _, unset := range []string{"italic", "underlined", "strikethrough", "obfuscated", "color"} {
		if _, present := got[0][unset]; present {
			t.Errorf("%q was written even though it was never set", unset)
		}
	}
}

func TestNetworkNBTHandlesTextWithNoCodesAtAll(t *testing.T) {
	t.Parallel()

	root := decodeNBT(t, "just words")
	got := runs(t, root)
	if len(got) != 1 || got[0]["text"] != nbt.String("just words") {
		t.Fatalf("runs = %+v, wanted the text in a single run", got)
	}
	// The parent carries no text of its own, so a client that ignored the
	// children entirely would show nothing rather than something wrong.
	if root["text"] != nbt.String("") {
		t.Errorf("root text is %v, wanted empty", root["text"])
	}
}

func TestNetworkNBTKeepsTheNewlineAMOTDMayCarry(t *testing.T) {
	t.Parallel()

	got := runs(t, decodeNBT(t, "§bServer Hub§r\n§7Join to start"))
	var joined strings.Builder
	for _, run := range got {
		if s, ok := run["text"].(nbt.String); ok {
			joined.WriteString(string(s))
		}
	}
	if !strings.Contains(joined.String(), "\n") {
		t.Errorf("the newline was lost: %q", joined.String())
	}
}
