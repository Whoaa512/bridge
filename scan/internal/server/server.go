package server

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/cjwinslow/bridge/scan/internal/spec"
)

type Server struct {
	mu       sync.RWMutex
	current  *spec.BridgeSpec
	started  time.Time
	listener net.Listener
	srv      *http.Server
}

func New(port int) *Server {
	s := &Server{
		started: time.Now(),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/spec", s.handleSpec)
	mux.HandleFunc("GET /api/projects", s.handleProjects)
	mux.HandleFunc("GET /api/health", s.handleHealth)

	s.srv = &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: mux,
	}

	return s
}

func (s *Server) SetSpec(sp *spec.BridgeSpec) {
	s.mu.Lock()
	s.current = sp
	s.mu.Unlock()
}

func (s *Server) Start() error {
	ln, err := net.Listen("tcp", s.srv.Addr)
	if err != nil {
		return err
	}
	s.listener = ln
	return s.srv.Serve(ln)
}

func (s *Server) Close() {
	if s.srv != nil {
		s.srv.Close()
	}
}

func (s *Server) Handler() http.Handler {
	return s.srv.Handler
}

func (s *Server) handleSpec(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	sp := s.current
	s.mu.RUnlock()

	writeJSON(w, sp)
}

func (s *Server) handleProjects(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	projects := s.current.Projects
	s.mu.RUnlock()

	writeJSON(w, projects)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	uptime := int64(time.Since(s.started).Seconds())
	writeJSON(w, map[string]interface{}{
		"status": "ok",
		"uptime": uptime,
	})
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		http.Error(w, fmt.Sprintf("encode error: %v", err), http.StatusInternalServerError)
	}
}
