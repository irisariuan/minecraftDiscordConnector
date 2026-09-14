package control

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"
)

// DefaultInterval is the poll cadence CONTROL_API.md specifies for GET /config.
const DefaultInterval = 2 * time.Second

// Poller keeps the last known configuration and lets callers wait for a
// backend to come up.
//
// It is designed to survive the bot being unreachable: it keeps serving the
// last good snapshot, logs at most one line per outage transition rather than
// one per failed poll, and recovers on its own when the bot returns.
//
// All accessors are safe for concurrent use and return copies, so a connection
// goroutine can never mutate state another goroutine is reading.
type Poller struct {
	c        *Client
	interval time.Duration

	mu      sync.RWMutex
	cfg     *Config
	byID    map[int]ServerEntry
	updated chan struct{} // closed and replaced on each successful poll

	ready     chan struct{}
	readyOnce sync.Once

	// failing is only touched by Run, so it needs no lock.
	failing bool
}

// NewPoller returns a Poller that refreshes every interval. A non-positive
// interval falls back to DefaultInterval.
func NewPoller(c *Client, interval time.Duration) *Poller {
	if interval <= 0 {
		interval = DefaultInterval
	}
	return &Poller{
		c:        c,
		interval: interval,
		updated:  make(chan struct{}),
		ready:    make(chan struct{}),
	}
}

// Run polls until ctx is cancelled. It polls once immediately so that Ready
// closes as soon as the bot answers, rather than one interval later.
func (p *Poller) Run(ctx context.Context) {
	t := time.NewTicker(p.interval)
	defer t.Stop()

	for {
		p.pollOnce(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// pollOnce performs one GET /config and publishes the result.
func (p *Poller) pollOnce(ctx context.Context) {
	cfg, err := p.c.Config(ctx)
	if err != nil {
		// A cancelled context is shutdown, not an outage.
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return
		}
		if !p.failing {
			p.failing = true
			log.Printf("control: bot unreachable, serving the last known config: %v", err)
		}
		return
	}
	if p.failing {
		p.failing = false
		log.Printf("control: bot reachable again")
	}
	p.publish(cfg)
}

// publish installs a new snapshot and wakes everyone waiting on a change.
func (p *Poller) publish(cfg *Config) {
	byID := make(map[int]ServerEntry, len(cfg.Servers))
	for _, s := range cfg.Servers {
		byID[s.ID] = s
	}

	p.mu.Lock()
	p.cfg = cfg.Clone()
	p.byID = byID
	prev := p.updated
	p.updated = make(chan struct{})
	p.mu.Unlock()

	close(prev)
	p.readyOnce.Do(func() { close(p.ready) })
}

// Snapshot returns a deep copy of the last successfully fetched config, or nil
// if none has been fetched yet.
func (p *Poller) Snapshot() *Config {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.cfg.Clone()
}

// Ready is closed after the first successful poll. Until then Snapshot returns
// nil and Server reports not-found for every id.
func (p *Poller) Ready() <-chan struct{} {
	return p.ready
}

// Server returns the entry for id from the last successful poll. ServerEntry
// is a value type with no reference fields, so the copy is complete.
func (p *Poller) Server(id int) (ServerEntry, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	e, ok := p.byID[id]
	return e, ok
}

// WaitOnline blocks until the server with the given id reports online, or ctx
// is done. It is driven by the poll cycle rather than by a timer of its own,
// so it wakes on the poll that flips the flag and never busy-waits.
//
// A server that disappears from the config is not an error: WaitOnline keeps
// waiting, in case the bot is mid-reconfiguration. Callers that need a
// deadline should put one on ctx.
func (p *Poller) WaitOnline(ctx context.Context, serverID int) error {
	for {
		// Take the wake channel before reading state: a publish between the
		// two would close this channel, so no transition can be missed.
		p.mu.RLock()
		wake := p.updated
		e, ok := p.byID[serverID]
		p.mu.RUnlock()

		if ok && e.Online {
			return nil
		}

		select {
		case <-wake:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}
