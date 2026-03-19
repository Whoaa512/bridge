package discover

import "testing"

func TestClassifyPublicGithub(t *testing.T) {
	url := "git@github.com:user/repo.git"
	c := Classify(&url, false, "")
	if c.Class != "public" || c.Source != "remote" {
		t.Errorf("got %+v, want public/remote", c)
	}
}

func TestClassifyInternalGHE(t *testing.T) {
	url := "git@git.musta.ch:airbnb/repo.git"
	c := Classify(&url, false, "")
	if c.Class != "internal" || c.Source != "remote" {
		t.Errorf("got %+v, want internal/remote", c)
	}
}

func TestClassifyInternalInfra(t *testing.T) {
	url := "git@github.com:user/repo.git"
	c := Classify(&url, true, "")
	if c.Class != "internal" || c.Source != "infra" {
		t.Errorf("got %+v, want internal/infra", c)
	}
}

func TestClassifyManualOverride(t *testing.T) {
	url := "git@github.com:user/repo.git"
	c := Classify(&url, true, "personal")
	if c.Class != "personal" || c.Source != "manual" {
		t.Errorf("got %+v, want personal/manual", c)
	}
}

func TestClassifyNoRemote(t *testing.T) {
	c := Classify(nil, false, "")
	if c.Class != "personal" || c.Source != "remote" {
		t.Errorf("got %+v, want personal/remote", c)
	}
}

func TestClassifyHTTPSGithub(t *testing.T) {
	url := "https://github.com/user/repo.git"
	c := Classify(&url, false, "")
	if c.Class != "public" {
		t.Errorf("got %+v, want public", c)
	}
}

func TestClassifyInfraOverridesRemote(t *testing.T) {
	c := Classify(nil, true, "")
	if c.Class != "internal" || c.Source != "infra" {
		t.Errorf("got %+v, want internal/infra", c)
	}
}
