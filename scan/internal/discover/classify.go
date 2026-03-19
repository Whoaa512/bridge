package discover

import "strings"

type Classification struct {
	Class  string // public, internal, personal
	Source string // remote, infra, manual
}

func Classify(remoteURL *string, hasInfra bool, manualOverride string) Classification {
	if manualOverride != "" {
		return Classification{Class: manualOverride, Source: "manual"}
	}

	if hasInfra {
		return Classification{Class: "internal", Source: "infra"}
	}

	if remoteURL == nil {
		return Classification{Class: "personal", Source: "remote"}
	}

	url := *remoteURL
	if isInternalRemote(url) {
		return Classification{Class: "internal", Source: "remote"}
	}
	if isPublicRemote(url) {
		return Classification{Class: "public", Source: "remote"}
	}

	return Classification{Class: "personal", Source: "remote"}
}

func isInternalRemote(url string) bool {
	return strings.Contains(url, "git.musta.ch") ||
		strings.Contains(url, "github.airbnb.com")
}

func isPublicRemote(url string) bool {
	return strings.Contains(url, "github.com")
}
