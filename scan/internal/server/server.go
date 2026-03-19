package server

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
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
	webDir   string
}

func New(port int, opts ...Option) *Server {
	s := &Server{
		started: time.Now(),
	}
	for _, o := range opts {
		o(s)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/spec", cors(s.handleSpec))
	mux.HandleFunc("GET /api/projects", cors(s.handleProjects))
	mux.HandleFunc("GET /api/health", cors(s.handleHealth))

	if s.webDir != "" {
		mux.Handle("/", s.spaHandler())
	}

	s.srv = &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: mux,
	}

	return s
}

type Option func(*Server)

func WithWebDir(dir string) Option {
	return func(s *Server) { s.webDir = dir }
}

func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		next(w, r)
	}
}

func (s *Server) spaHandler() http.Handler {
	root := os.DirFS(s.webDir)
	fileServer := http.FileServer(http.Dir(s.webDir))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			path = "index.html"
		} else {
			path = path[1:]
		}

		if _, err := fs.Stat(root, filepath.Clean(path)); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}

		http.ServeFile(w, r, filepath.Join(s.webDir, "index.html"))
	})
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
	sp := s.current
	s.mu.RUnlock()

	if sp == nil {
		writeJSON(w, []any{})
		return
	}
	writeJSON(w, sp.Projects)
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
