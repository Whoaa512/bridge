package server

import (
	cryptoRand "crypto/rand"
	"encoding/hex"
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

	"github.com/cjwinslow/bridge/scan/internal/agent"
	"github.com/cjwinslow/bridge/scan/internal/spec"
	"github.com/gorilla/websocket"
)

var hexEncode = hex.EncodeToString

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

	sessions *agent.SessionManager
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

func WithSessionManager(sm *agent.SessionManager) Option {
	return func(s *Server) { s.sessions = sm }
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

func (s *Server) SetSessionManager(sm *agent.SessionManager) {
	s.sessions = sm
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
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		s.handleWSMessage(c, raw)
	}
}

type wsEnvelope struct {
	Type string `json:"type"`
}

func (s *Server) handleWSMessage(c *wsClient, raw []byte) {
	var env wsEnvelope
	if err := json.Unmarshal(raw, &env); err != nil {
		sendToClient(c, map[string]string{"type": "error", "error": "invalid json"})
		return
	}

	switch env.Type {
	case "session_create":
		s.handleSessionCreate(c, raw)
	case "session_destroy":
		s.handleSessionDestroy(c, raw)
	case "sessions_list_request":
		s.handleSessionsList(c)
	case "pi_command":
		s.handlePiCommand(c, raw)
	case "extension_ui_response":
		s.handleExtensionUIResponse(c, raw)
	}
}

func (s *Server) handleSessionCreate(c *wsClient, raw []byte) {
	var req struct {
		CWD       string `json:"cwd"`
		Model     string `json:"model"`
		ProjectID string `json:"projectId"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		sendToClient(c, map[string]string{"type": "error", "error": "invalid session_create"})
		return
	}

	if s.sessions == nil {
		sendToClient(c, map[string]string{"type": "error", "error": "session manager not available"})
		return
	}

	id, err := generateSessionID()
	if err != nil {
		sendToClient(c, map[string]string{"type": "error", "error": "failed to generate session id"})
		return
	}

	h, err := s.sessions.Create(id, req.CWD, req.Model, req.ProjectID)
	if err != nil {
		sendToClient(c, map[string]interface{}{
			"type":  "error",
			"error": fmt.Sprintf("create session: %v", err),
		})
		return
	}

	sendToClient(c, map[string]interface{}{
		"type":    "session_created",
		"session": h.Info(),
	})
}

func (s *Server) handleSessionDestroy(c *wsClient, raw []byte) {
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		sendToClient(c, map[string]string{"type": "error", "error": "invalid session_destroy"})
		return
	}

	if s.sessions == nil {
		sendToClient(c, map[string]string{"type": "error", "error": "session manager not available"})
		return
	}

	if err := s.sessions.Destroy(req.SessionID); err != nil {
		sendToClient(c, map[string]interface{}{
			"type":  "error",
			"error": fmt.Sprintf("destroy session: %v", err),
		})
		return
	}

	sendToClient(c, map[string]interface{}{
		"type":      "session_destroyed",
		"sessionId": req.SessionID,
	})
}

func (s *Server) handleSessionsList(c *wsClient) {
	if s.sessions == nil {
		sendToClient(c, map[string]interface{}{
			"type":     "sessions_list",
			"sessions": []interface{}{},
		})
		return
	}

	sendToClient(c, map[string]interface{}{
		"type":     "sessions_list",
		"sessions": s.sessions.List(),
	})
}

func (s *Server) handlePiCommand(c *wsClient, raw []byte) {
	var req struct {
		SessionID string          `json:"sessionId"`
		Command   json.RawMessage `json:"command"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		sendToClient(c, map[string]string{"type": "error", "error": "invalid pi_command"})
		return
	}

	if s.sessions == nil {
		sendToClient(c, map[string]string{"type": "error", "error": "session manager not available"})
		return
	}

	if err := s.sessions.Send(req.SessionID, req.Command); err != nil {
		sendToClient(c, map[string]interface{}{
			"type":  "error",
			"error": fmt.Sprintf("send to session: %v", err),
		})
	}
}

func (s *Server) handleExtensionUIResponse(c *wsClient, raw []byte) {
	var req struct {
		SessionID string          `json:"sessionId"`
		Response  json.RawMessage `json:"response"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		sendToClient(c, map[string]string{"type": "error", "error": "invalid extension_ui_response"})
		return
	}

	if s.sessions == nil {
		return
	}

	s.sessions.Send(req.SessionID, req.Response)
}

func (s *Server) Broadcast(msg []byte) {
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

func sendToClient(c *wsClient, v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case c.send <- data:
	default:
	}
}

func generateSessionID() (string, error) {
	b := make([]byte, 16)
	if _, err := cryptoRand.Read(b); err != nil {
		return "", err
	}
	return hexEncode(b), nil
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
