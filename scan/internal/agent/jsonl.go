package agent

import (
	"bufio"
	"encoding/json"
	"io"
	"sync"
)

type JSONLReader struct {
	scanner *bufio.Scanner
}

func NewJSONLReader(r io.Reader) *JSONLReader {
	s := bufio.NewScanner(r)
	s.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)
	return &JSONLReader{scanner: s}
}

func (r *JSONLReader) Read() (json.RawMessage, error) {
	if !r.scanner.Scan() {
		if err := r.scanner.Err(); err != nil {
			return nil, err
		}
		return nil, io.EOF
	}
	line := r.scanner.Bytes()
	if len(line) == 0 {
		return r.Read()
	}
	raw := make(json.RawMessage, len(line))
	copy(raw, line)
	return raw, nil
}

type JSONLWriter struct {
	mu sync.Mutex
	w  io.Writer
}

func NewJSONLWriter(w io.Writer) *JSONLWriter {
	return &JSONLWriter{w: w}
}

func (w *JSONLWriter) Write(v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	data = append(data, '\n')

	w.mu.Lock()
	defer w.mu.Unlock()
	_, err = w.w.Write(data)
	return err
}
