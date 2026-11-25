package ratelimit

import (
	"sync"
	"time"
)

// memoryMaxKeys bounds the in-process fallback windows (one entry per
// action and subject); beyond it expired entries are swept and, if still
// full, new subjects are allowed rather than growing without bound.
const memoryMaxKeys = 100_000

// memoryWindows are fixed windows in process memory, used while Redis
// fails (TEC-1289). With several replicas each one counts on its own, so a
// limit is at most replicas × limit during an outage instead of none.
type memoryWindows struct {
	mu   sync.Mutex
	max  int
	hits map[string]memoryWindow
}

type memoryWindow struct {
	n       int
	expires time.Time
}

func newMemoryWindows(max int) *memoryWindows {
	return &memoryWindows{max: max, hits: map[string]memoryWindow{}}
}

func (m *memoryWindows) allow(key string, limit int, window time.Duration, now time.Time) (bool, time.Duration) {
	if m == nil {
		return true, 0
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	w, ok := m.hits[key]
	if !ok || !now.Before(w.expires) {
		if !ok && len(m.hits) >= m.max {
			m.sweep(now)
			if len(m.hits) >= m.max {
				return true, 0
			}
		}
		w = memoryWindow{expires: now.Add(window)}
	}
	w.n++
	m.hits[key] = w
	if w.n > limit {
		return false, w.expires.Sub(now)
	}
	return true, 0
}

func (m *memoryWindows) under(key string, limit int, now time.Time) (bool, time.Duration) {
	if m == nil {
		return true, 0
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	w, ok := m.hits[key]
	if !ok || !now.Before(w.expires) || w.n < limit {
		return true, 0
	}
	return false, w.expires.Sub(now)
}

func (m *memoryWindows) sweep(now time.Time) {
	for k, w := range m.hits {
		if !now.Before(w.expires) {
			delete(m.hits, k)
		}
	}
}
