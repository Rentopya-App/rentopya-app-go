package handler

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/authctx"
)

// TEC-1170: the platform bulk route reads at most maxBulkBody bytes; an
// oversized body is refused before it is decoded.
func TestExecuteRejectsOversizedBody(t *testing.T) {
	h := New(nil)
	body := append([]byte(`{"action":"x","target":{"ids":["`), bytes.Repeat([]byte("a"), maxBulkBody)...)
	body = append(body, []byte(`"]}}`)...)
	req := httptest.NewRequest(http.MethodPost, "/v1/platform/users/bulk", bytes.NewReader(body))
	req = req.WithContext(authctx.WithPrincipal(context.Background(), authctx.Principal{UserInternal: 1}))
	rec := httptest.NewRecorder()
	h.ExecuteUsers(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
