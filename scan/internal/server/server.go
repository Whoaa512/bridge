package server

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/cjwinslow/bridge/scan/internal/spec"
	"github.com/gorilla/websocket"
)

type wsClient struct {
	conn *websocket.Conn
	send chan []byte
}

type Server struct {
	mu       sync.RWMutex
	current  *spec.BridgeSpec
	started  time.Time
	listener net.Listener
	srv      *http.Server
	webDir   string

	wsMu    sync.Mutex
	clients []*wsClient
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
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
	mux.HandleFunc("/ws", s.handleWS)

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

func isLocalOrigin(origin string) bool {
	return strings.Contains(origin, "localhost") || strings.Contains(origin, "127.0.0.1")
}

func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); isLocalOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
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

	s.broadcastSpec(sp)
}

func (s *Server) broadcastSpec(sp *spec.BridgeSpec) {
	msg, err := marshalFullSync(sp)
	if err != nil {
		log.Printf("ws: marshal error: %v", err)
		return
	}

	s.wsMu.Lock()
	defer s.wsMu.Unlock()

	live := s.clients[:0]
	for _, c := range s.clients {
		select {
		case c.send <- msg:
			live = append(live, c)
		default:
			c.conn.Close()
		}
	}
	s.clients = live
}

func marshalFullSync(sp *spec.BridgeSpec) ([]byte, error) {
	wrapper := map[string]interface{}{
		"type": "full_sync",
		"spec": sp,
	}
	return json.Marshal(wrapper)
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws: upgrade error: %v", err)
		return
	}

	client := &wsClient{
		conn: conn,
		send: make(chan []byte, 8),
	}

	s.wsMu.Lock()
	s.clients = append(s.clients, client)
	s.wsMu.Unlock()

	s.mu.RLock()
	sp := s.current
	s.mu.RUnlock()

	if sp != nil {
		msg, err := marshalFullSync(sp)
		if err == nil {
			select {
			case client.send <- msg:
			default:
			}
		}
	}

	go s.wsWritePump(client)
	s.wsReadPump(client)
}

func (s *Server) wsWritePump(c *wsClient) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	defer c.conn.Close()

	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, nil)
				return
			}
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (s *Server) wsReadPump(c *wsClient) {
	defer func() {
		s.removeClient(c)
		close(c.send)
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (s *Server) removeClient(c *wsClient) {
	s.wsMu.Lock()
	defer s.wsMu.Unlock()
	for i, client := range s.clients {
		if client == c {
			s.clients = append(s.clients[:i], s.clients[i+1:]...)
			return
		}
	}
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
