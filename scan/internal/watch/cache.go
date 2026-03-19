package watch

import (
	"sync"
	"time"
)

type TTLTier int

const (
	TierLocal  TTLTier = iota // 30s - git status, ports, docker
	TierRemote                // 5min - CI, PRs, Asana
)

func (t TTLTier) Duration() time.Duration {
	switch t {
	case TierLocal:
		return 30 * time.Second
	case TierRemote:
		return 5 * time.Minute
	default:
		return 30 * time.Second
	}
}

type CacheEntry struct {
	Value     interface{}
	ExpiresAt time.Time
	Tier      TTLTier
}

type Cache struct {
	mu      sync.RWMutex
	entries map[string]CacheEntry
	now     func() time.Time
}

func NewCache() *Cache {
	return &Cache{
		entries: make(map[string]CacheEntry),
		now:     time.Now,
	}
}

func (c *Cache) Get(key string) (interface{}, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, ok := c.entries[key]
	if !ok {
		return nil, false
	}
	if c.now().After(entry.ExpiresAt) {
		return nil, false
	}
	return entry.Value, true
}

func (c *Cache) Set(key string, value interface{}, tier TTLTier) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries[key] = CacheEntry{
		Value:     value,
		ExpiresAt: c.now().Add(tier.Duration()),
		Tier:      tier,
	}
}

func (c *Cache) Invalidate(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, key)
}

func (c *Cache) InvalidatePrefix(prefix string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	for k := range c.entries {
		if len(k) >= len(prefix) && k[:len(prefix)] == prefix {
			delete(c.entries, k)
		}
	}
}

func (c *Cache) Len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.entries)
}
