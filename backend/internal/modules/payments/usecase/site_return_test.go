package usecase

import (
	"context"
	"testing"
)

type fakeSites struct {
	org    int64
	origin string
	asked  string
}

func (f *fakeSites) LiveOrigin(_ context.Context, orgID int64, origin string) (bool, error) {
	f.asked = origin
	return orgID == f.org && origin == f.origin, nil
}

// A checkout returns to the branded site only on that organization's own
// live site, on the token's return path, with nothing but the sealed state.
func TestSiteReturn(t *testing.T) {
	t.Parallel()
	const token = "AbCdEfGhIjKlMnOpQrStUv"
	sites := &fakeSites{org: 7, origin: "https://ides.rentopya.app"}
	s := &Service{sites: sites}
	cases := []struct {
		name string
		org  int64
		url  string
		want bool
	}{
		{"site return", 7, "https://ides.rentopya.app/payment/" + token + "/return", true},
		{"with sealed state", 7, "https://ides.rentopya.app/payment/" + token + "/return?s=abc.def", true},
		{"another organization", 8, "https://ides.rentopya.app/payment/" + token + "/return", false},
		{"another host", 7, "https://evil.example/payment/" + token + "/return", false},
		{"another token", 7, "https://ides.rentopya.app/payment/OtherTokenOtherToken12/return", false},
		{"another path", 7, "https://ides.rentopya.app/reservation/ABC", false},
		{"extra query", 7, "https://ides.rentopya.app/payment/" + token + "/return?next=https://evil.example", false},
		{"repeated state", 7, "https://ides.rentopya.app/payment/" + token + "/return?s=a&s=b", false},
		{"fragment", 7, "https://ides.rentopya.app/payment/" + token + "/return#x", false},
		{"user info", 7, "https://a@ides.rentopya.app/payment/" + token + "/return", false},
		{"plain http", 7, "http://ides.rentopya.app/payment/" + token + "/return", false},
		{"encoded path", 7, "https://ides.rentopya.app/payment/" + token + "%2Freturn", false},
	}
	for _, c := range cases {
		got, err := s.siteReturn(context.Background(), c.org, token, c.url)
		if err != nil || got != c.want {
			t.Errorf("%s: got %v, %v; want %v", c.name, got, err, c.want)
		}
	}
	if ok, _ := (&Service{}).siteReturn(context.Background(), 7, token, "https://ides.rentopya.app/payment/"+token+"/return"); ok {
		t.Error("without a site resolver a site return is refused")
	}
}
