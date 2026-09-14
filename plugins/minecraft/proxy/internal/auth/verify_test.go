package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// newTestVerifier points a Verifier at an httptest server instead of Mojang.
func newTestVerifier(srv *httptest.Server) *Verifier {
	v := NewVerifier(srv.Client())
	v.baseURL = srv.URL
	return v
}

const notchProfile = `{
  "id": "069a79f444e94726a5befca90e38aaf5",
  "name": "Notch",
  "properties": [
    {"name": "textures", "value": "eyJ0ZXh0dXJlcyI6e319", "signature": "c2ln"}
  ]
}`

func TestHasJoinedOK(t *testing.T) {
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(notchProfile))
	}))
	defer srv.Close()

	p, err := newTestVerifier(srv).HasJoined(context.Background(), "Notch", "somehash", "1.2.3.4")
	if err != nil {
		t.Fatalf("HasJoined: %v", err)
	}
	if p.Name != "Notch" {
		t.Errorf("Name = %q, want Notch", p.Name)
	}
	if got, want := p.ID.String(), "069a79f4-44e9-4726-a5be-fca90e38aaf5"; got != want {
		t.Errorf("ID = %q, want %q", got, want)
	}
	if len(p.Properties) != 1 || p.Properties[0].Name != "textures" || p.Properties[0].Signature != "c2ln" {
		t.Errorf("Properties = %+v, want one signed textures property", p.Properties)
	}
	for _, want := range []string{"username=Notch", "serverId=somehash", "ip=1.2.3.4"} {
		if !strings.Contains(gotQuery, want) {
			t.Errorf("query %q is missing %q", gotQuery, want)
		}
	}
}

func TestHasJoinedOmitsEmptyIP(t *testing.T) {
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		_, _ = w.Write([]byte(notchProfile))
	}))
	defer srv.Close()

	if _, err := newTestVerifier(srv).HasJoined(context.Background(), "Notch", "h", ""); err != nil {
		t.Fatalf("HasJoined: %v", err)
	}
	if strings.Contains(gotQuery, "ip=") {
		t.Errorf("query %q carries an ip parameter for an empty ip", gotQuery)
	}
}

func TestHasJoinedNoContent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	_, err := newTestVerifier(srv).HasJoined(context.Background(), "Notch", "h", "")
	if !errors.Is(err, ErrNotAuthenticated) {
		t.Errorf("err = %v, want ErrNotAuthenticated", err)
	}
}

func TestHasJoinedEmptyBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	_, err := newTestVerifier(srv).HasJoined(context.Background(), "Notch", "h", "")
	if !errors.Is(err, ErrNotAuthenticated) {
		t.Errorf("err = %v, want ErrNotAuthenticated", err)
	}
}

func TestHasJoinedServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("mojang is having a day"))
	}))
	defer srv.Close()

	_, err := newTestVerifier(srv).HasJoined(context.Background(), "Notch", "h", "")
	if err == nil {
		t.Fatal("want an error for a 503")
	}
	if errors.Is(err, ErrNotAuthenticated) {
		t.Error("a 503 must not be reported as a failed authentication")
	}
	if !strings.Contains(err.Error(), "503") {
		t.Errorf("err = %v, want the status code in the message", err)
	}
}

func TestHasJoinedMalformedBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("{ this is not json"))
	}))
	defer srv.Close()

	if _, err := newTestVerifier(srv).HasJoined(context.Background(), "Notch", "h", ""); err == nil {
		t.Fatal("want an error for a malformed body")
	}
}

func TestHasJoinedBadUUID(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"nope","name":"Notch"}`))
	}))
	defer srv.Close()

	if _, err := newTestVerifier(srv).HasJoined(context.Background(), "Notch", "h", ""); err == nil {
		t.Fatal("want an error for an unparseable uuid")
	}
}

func TestHasJoinedContextCancelled(t *testing.T) {
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release
	}))
	defer srv.Close()
	defer close(release)

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	if _, err := newTestVerifier(srv).HasJoined(ctx, "Notch", "h", ""); err == nil {
		t.Fatal("want an error when the context expires")
	}
}
