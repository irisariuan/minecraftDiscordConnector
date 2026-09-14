package control

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeBot is a controllable stand-in for the bot's /config endpoint.
type fakeBot struct {
	mu     sync.Mutex
	online bool
	fail   bool
	tag    string
	calls  atomic.Int64
}

func (f *fakeBot) setOnline(v bool) { f.mu.Lock(); f.online = v; f.mu.Unlock() }
func (f *fakeBot) setFail(v bool)   { f.mu.Lock(); f.fail = v; f.mu.Unlock() }
func (f *fakeBot) setTag(v string)  { f.mu.Lock(); f.tag = v; f.mu.Unlock() }

func (f *fakeBot) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.calls.Add(1)
	f.mu.Lock()
	online, fail, tag := f.online, f.fail, f.tag
	f.mu.Unlock()

	if fail {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("bot is restarting"))
		return
	}
	fmt.Fprintf(w, `{"listenPort":25565,"publicHost":"mc.example.com","maxPlayers":100,
	  "motd":"hub","linkTtlSeconds":300,"voteChannelConfigured":true,
	  "servers":[{"id":1,"tag":%q,"host":"127.0.0.1","port":25566,"online":%t,
	  "forwarding":"bungeecord","forwardingSecret":null}]}`, tag, online)
}

func newTestPoller(t *testing.T, bot *fakeBot) (*Poller, context.CancelFunc) {
	t.Helper()
	srv := httptest.NewServer(bot)
	t.Cleanup(srv.Close)

	p := NewPoller(New(srv.URL, "tok", srv.Client()), 5*time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		p.Run(ctx)
	}()
	t.Cleanup(func() {
		cancel()
		<-done
	})
	return p, cancel
}

func TestPollerReady(t *testing.T) {
	bot := &fakeBot{tag: "Survival"}

	srv := httptest.NewServer(bot)
	defer srv.Close()
	p := NewPoller(New(srv.URL, "tok", srv.Client()), 5*time.Millisecond)

	// Before the first poll there is nothing to serve.
	if p.Snapshot() != nil {
		t.Error("Snapshot is non-nil before the first successful poll")
	}
	if _, ok := p.Server(1); ok {
		t.Error("Server reported a hit before the first successful poll")
	}
	select {
	case <-p.Ready():
		t.Fatal("Ready is closed before the first successful poll")
	default:
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go p.Run(ctx)

	select {
	case <-p.Ready():
	case <-time.After(2 * time.Second):
		t.Fatal("Ready never closed")
	}

	cfg := p.Snapshot()
	if cfg == nil || cfg.ListenPort != 25565 || len(cfg.Servers) != 1 {
		t.Fatalf("Snapshot = %+v", cfg)
	}
	e, ok := p.Server(1)
	if !ok || e.Tag != "Survival" || e.Port != 25566 {
		t.Errorf("Server(1) = %+v, %v", e, ok)
	}
	if _, ok := p.Server(99); ok {
		t.Error("Server(99) found an entry that does not exist")
	}
}

func TestPollerSnapshotIsACopy(t *testing.T) {
	bot := &fakeBot{tag: "Survival"}
	p, _ := newTestPoller(t, bot)
	<-p.Ready()

	a := p.Snapshot()
	a.Servers[0].Tag = "mutated"
	a.PublicHost = "evil"

	b := p.Snapshot()
	if b.Servers[0].Tag != "Survival" || b.PublicHost != "mc.example.com" {
		t.Errorf("a caller mutated the poller's shared state: %+v", b)
	}
}

func TestPollerWaitOnlineTransition(t *testing.T) {
	bot := &fakeBot{tag: "Survival", online: false}
	p, _ := newTestPoller(t, bot)
	<-p.Ready()

	if e, _ := p.Server(1); e.Online {
		t.Fatal("server started out online; the test cannot observe a transition")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	errCh := make(chan error, 1)
	go func() { errCh <- p.WaitOnline(ctx, 1) }()

	// It must still be blocked while the backend is down.
	select {
	case err := <-errCh:
		t.Fatalf("WaitOnline returned early: %v", err)
	case <-time.After(50 * time.Millisecond):
	}

	bot.setOnline(true)

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("WaitOnline: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("WaitOnline did not wake on the transition to online")
	}
}

func TestPollerWaitOnlineReturnsImmediatelyWhenUp(t *testing.T) {
	bot := &fakeBot{tag: "Survival", online: true}
	p, _ := newTestPoller(t, bot)
	<-p.Ready()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := p.WaitOnline(ctx, 1); err != nil {
		t.Fatalf("WaitOnline on an already-online server: %v", err)
	}
}

func TestPollerWaitOnlineContextCancelled(t *testing.T) {
	bot := &fakeBot{tag: "Survival", online: false}
	p, _ := newTestPoller(t, bot)
	<-p.Ready()

	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()

	start := time.Now()
	err := p.WaitOnline(ctx, 1)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err = %v, want context.DeadlineExceeded", err)
	}
	if d := time.Since(start); d > 3*time.Second {
		t.Errorf("WaitOnline took %v to honour the deadline", d)
	}

	// An unknown server id must also be cancellable rather than an error.
	ctx2, cancel2 := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel2()
	if err := p.WaitOnline(ctx2, 404); !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("WaitOnline on an unknown id = %v, want context.DeadlineExceeded", err)
	}
}

func TestPollerSurvivesTransientFailure(t *testing.T) {
	bot := &fakeBot{tag: "Survival", online: true}
	p, _ := newTestPoller(t, bot)
	<-p.Ready()

	before := p.Snapshot()
	if before == nil {
		t.Fatal("no snapshot after Ready")
	}

	// The bot falls over. The poller must keep serving what it last knew.
	bot.setFail(true)
	failStart := bot.calls.Load()
	waitForCalls(t, bot, failStart+3)

	during := p.Snapshot()
	if during == nil || during.PublicHost != "mc.example.com" {
		t.Fatalf("snapshot lost during an outage: %+v", during)
	}
	if e, ok := p.Server(1); !ok || !e.Online {
		t.Errorf("Server(1) = %+v, %v during an outage; want the last known entry", e, ok)
	}

	// The bot comes back with new data; the poller must pick it up.
	bot.setTag("Renamed")
	bot.setFail(false)

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if e, ok := p.Server(1); ok && e.Tag == "Renamed" {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("poller did not recover after the bot returned")
}

func TestPollerStopsOnContextCancel(t *testing.T) {
	bot := &fakeBot{tag: "Survival"}
	srv := httptest.NewServer(bot)
	defer srv.Close()

	p := NewPoller(New(srv.URL, "tok", srv.Client()), 5*time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { defer close(done); p.Run(ctx) }()

	<-p.Ready()
	cancel()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not return after its context was cancelled")
	}
}

func TestNewPollerDefaultsInterval(t *testing.T) {
	p := NewPoller(New("http://127.0.0.1:1", "t", nil), 0)
	if p.interval != DefaultInterval {
		t.Errorf("interval = %v, want %v", p.interval, DefaultInterval)
	}
}

// TestPollerConcurrentReaders exercises the lock discipline under -race.
func TestPollerConcurrentReaders(t *testing.T) {
	bot := &fakeBot{tag: "Survival"}
	p, _ := newTestPoller(t, bot)
	<-p.Ready()

	stop := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				if cfg := p.Snapshot(); cfg != nil && len(cfg.Servers) > 0 {
					cfg.Servers[0].Tag = "scribble"
				}
				_, _ = p.Server(1)
			}
		}()
	}
	go func() {
		for i := 0; ; i++ {
			select {
			case <-stop:
				return
			default:
			}
			bot.setOnline(i%2 == 0)
			time.Sleep(time.Millisecond)
		}
	}()

	time.Sleep(200 * time.Millisecond)
	close(stop)
	wg.Wait()

	if e, ok := p.Server(1); !ok || e.Tag != "Survival" {
		t.Errorf("Server(1) = %+v, %v; readers corrupted the shared entry", e, ok)
	}
}

func waitForCalls(t *testing.T, bot *fakeBot, want int64) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if bot.calls.Load() >= want {
			return
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatalf("only %d calls after waiting for %d", bot.calls.Load(), want)
}
