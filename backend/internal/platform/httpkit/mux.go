package httpkit

import "net/http"

// Mux is the part of *http.ServeMux that route registration uses. Modules
// take a Mux instead of *http.ServeMux so the server can mount them through
// a RouteRecorder and test the complete route table.
type Mux interface {
	Handle(pattern string, handler http.Handler)
	HandleFunc(pattern string, handler func(http.ResponseWriter, *http.Request))
}

// RouteRecorder is a Mux that forwards to another Mux and keeps every
// pattern it mounts, in registration order.
type RouteRecorder struct {
	next     Mux
	patterns []string
}

// NewRouteRecorder wraps next (nil: record only).
func NewRouteRecorder(next Mux) *RouteRecorder { return &RouteRecorder{next: next} }

// Handle records pattern and forwards it.
func (r *RouteRecorder) Handle(pattern string, handler http.Handler) {
	r.patterns = append(r.patterns, pattern)
	if r.next != nil {
		r.next.Handle(pattern, handler)
	}
}

// HandleFunc records pattern and forwards it.
func (r *RouteRecorder) HandleFunc(pattern string, handler func(http.ResponseWriter, *http.Request)) {
	r.Handle(pattern, http.HandlerFunc(handler))
}

// Patterns returns the mounted patterns ("GET /v1/x", "/static/").
func (r *RouteRecorder) Patterns() []string { return append([]string(nil), r.patterns...) }
