package watch

import (
	"testing"
	"time"
)

func TestCacheSetGet(t *testing.T) {
	c := NewCache()

	c.Set("key1", "value1", TierLocal)

	val, ok := c.Get("key1")
	if !ok {
		t.Fatal("expected key1 to exist")
	}
	if val != "value1" {
		t.Errorf("got %v, want value1", val)
	}
}

func TestCacheExpiry(t *testing.T) {
	c := NewCache()
	fakeNow := time.Now()
	c.now = func() time.Time { return fakeNow }

	c.Set("local", "v1", TierLocal)
	c.Set("remote", "v2", TierRemote)

	if _, ok := c.Get("local"); !ok {
		t.Error("local should exist immediately")
	}
	if _, ok := c.Get("remote"); !ok {
		t.Error("remote should exist immediately")
	}

	fakeNow = fakeNow.Add(31 * time.Second)

	if _, ok := c.Get("local"); ok {
		t.Error("local should have expired after 31s")
	}
	if _, ok := c.Get("remote"); !ok {
		t.Error("remote should still exist after 31s")
	}

	fakeNow = fakeNow.Add(5 * time.Minute)

	if _, ok := c.Get("remote"); ok {
		t.Error("remote should have expired after 5min+31s")
	}
}

func TestCacheInvalidate(t *testing.T) {
	c := NewCache()

	c.Set("key1", "v1", TierLocal)
	c.Invalidate("key1")

	if _, ok := c.Get("key1"); ok {
		t.Error("key1 should be invalidated")
	}
}

func TestCacheInvalidatePrefix(t *testing.T) {
	c := NewCache()

	c.Set("/code/project:git", "v1", TierLocal)
	c.Set("/code/project:ci", "v2", TierRemote)
	c.Set("/code/other:git", "v3", TierLocal)

	c.InvalidatePrefix("/code/project")

	if _, ok := c.Get("/code/project:git"); ok {
		t.Error("project:git should be invalidated")
	}
	if _, ok := c.Get("/code/project:ci"); ok {
		t.Error("project:ci should be invalidated")
	}
	if _, ok := c.Get("/code/other:git"); !ok {
		t.Error("other:git should still exist")
	}
}

func TestTierDurations(t *testing.T) {
	if TierLocal.Duration() != 30*time.Second {
		t.Errorf("local tier = %v, want 30s", TierLocal.Duration())
	}
	if TierRemote.Duration() != 5*time.Minute {
		t.Errorf("remote tier = %v, want 5m", TierRemote.Duration())
	}
}

func TestCacheLen(t *testing.T) {
	c := NewCache()
	if c.Len() != 0 {
		t.Error("empty cache should have len 0")
	}
	c.Set("a", 1, TierLocal)
	c.Set("b", 2, TierLocal)
	if c.Len() != 2 {
		t.Errorf("len = %d, want 2", c.Len())
	}
}
