package route

import (
	"testing"
	"time"
)

func TestChoiceCookieRoundTrips(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_700_000_000, 0)
	got, ok := decodeChoice(encodeChoice(42, now), now.Add(3*time.Second))
	if !ok || got != 42 {
		t.Fatalf("decodeChoice = %d, %v; want 42, true", got, ok)
	}
}

func TestChoiceCookieExpires(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_700_000_000, 0)
	if _, ok := decodeChoice(encodeChoice(42, now), now.Add(choiceTTL+time.Second)); ok {
		t.Error("a stale choice was accepted; a player reconnecting later should be asked again")
	}
	// A cookie stamped in the future is as unusable as a stale one: it means
	// the two clocks disagree, so neither direction can be judged.
	if _, ok := decodeChoice(encodeChoice(42, now.Add(time.Hour)), now); ok {
		t.Error("a cookie from the future was accepted")
	}
}

func TestChoiceCookieRejectsRubbish(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_700_000_000, 0)
	for _, payload := range []string{
		"", "42", "42:", ":123", "abc:123", "42:abc", "0:1700000000", "-1:1700000000",
	} {
		if _, ok := decodeChoice([]byte(payload), now); ok {
			t.Errorf("decodeChoice(%q) accepted a malformed cookie", payload)
		}
	}
}
