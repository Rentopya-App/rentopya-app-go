package site_test

import (
	"context"
	"strings"
	"testing"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/site/model"
)

// A payment may return only to the organization's own live site.
func TestLiveOrigin(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	saved, err := e.svc.Save(ctx, e.a.id, e.a.slug, 0, model.SaveInput{Version: ptr(0), Enabled: ptr(true)})
	e.must(err)
	origin := strings.TrimSuffix(saved.URL, "/")
	live := func(org int64, o string) bool {
		ok, err := e.svc.LiveOrigin(ctx, org, o)
		e.must(err)
		return ok
	}
	if live(e.a.id, origin) {
		t.Fatal("unpublished site is live")
	}
	e.publish(e.a, saved.Version)
	if !live(e.a.id, origin) {
		t.Fatalf("published site %s not live", origin)
	}
	for _, o := range []string{
		origin + "/reservation/X", origin + "?x=1", origin + "#x",
		strings.Replace(origin, "://", "://u@", 1),
		strings.Replace(origin, "https://", "http://", 1),
		"https://evil.example",
	} {
		if live(e.a.id, o) {
			t.Errorf("%s accepted", o)
		}
	}
	if live(e.b.id, origin) {
		t.Fatal("another organization's site accepted")
	}
}

// The customer portal sends visitors to the organization's live site only.
func TestLiveSite(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	if _, _, ok, err := e.svc.LiveSite(ctx, e.a.id); err != nil || ok {
		t.Fatalf("never saved site is live: %v %v", ok, err)
	}
	saved, err := e.svc.Save(ctx, e.a.id, e.a.slug, 0, model.SaveInput{Version: ptr(0), Enabled: ptr(true)})
	e.must(err)
	if _, _, ok, _ := e.svc.LiveSite(ctx, e.a.id); ok {
		t.Fatal("unpublished site is live")
	}
	e.publish(e.a, saved.Version)
	origin, locale, ok, err := e.svc.LiveSite(ctx, e.a.id)
	e.must(err)
	if !ok || origin != strings.TrimSuffix(saved.URL, "/") || locale == "" {
		t.Fatalf("live site = %q %q %v", origin, locale, ok)
	}
	if _, _, ok, _ := e.svc.LiveSite(ctx, e.b.id); ok {
		t.Fatal("organization without a site has one")
	}
}
