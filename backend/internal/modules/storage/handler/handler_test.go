package handler

import (
	"bytes"
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/storage/model"
	storageusecase "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/storage/usecase"
	platstorage "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/storage"
)

// recordingDriver stores uploads in memory so a test can assert whether
// anything reached object storage. Only the methods Upload touches are
// implemented; any other call panics through the nil embedded Driver.
type recordingDriver struct {
	platstorage.Driver
	mu      sync.Mutex
	objects map[string][]byte
}

func newRecordingDriver() *recordingDriver {
	return &recordingDriver{objects: map[string][]byte{}}
}

func (d *recordingDriver) Bucket() string { return "test" }

func (d *recordingDriver) Upload(_ context.Context, file platstorage.File, path string) error {
	body, err := io.ReadAll(file.Body)
	if err != nil {
		return err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	d.objects[path] = body
	return nil
}

func (d *recordingDriver) Head(_ context.Context, path string) (platstorage.ObjectInfo, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	body := d.objects[path]
	return platstorage.ObjectInfo{Key: path, Size: int64(len(body)), LastModified: time.Now()}, nil
}

func (d *recordingDriver) count() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return len(d.objects)
}

func newTestHandler(maxBytes int64) (*Handler, *recordingDriver) {
	drv := newRecordingDriver()
	return New(storageusecase.New(drv, nil, nil), maxBytes), drv
}

// multipartBody builds a multipart/form-data body with a single "file" part of
// fileBytes bytes, returning the body and its Content-Type.
func multipartBody(t *testing.T, fileBytes int) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	if err := mw.WriteField("prefix", "docs/"); err != nil {
		t.Fatalf("write prefix: %v", err)
	}
	fw, err := mw.CreateFormFile("file", "big.bin")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := fw.Write(bytes.Repeat([]byte("a"), fileBytes)); err != nil {
		t.Fatalf("write part: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	return &buf, mw.FormDataContentType()
}

func doUpload(h *Handler, body io.Reader, ctype string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/v1/platform/storage/uploads", body)
	req.Header.Set("Content-Type", ctype)
	rec := httptest.NewRecorder()
	h.Upload(rec, req)
	return rec
}

func assertTooLarge(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413; body: %s", rec.Code, rec.Body.String())
	}
	b := rec.Body.String()
	if !strings.Contains(b, `"success":false`) || !strings.Contains(b, `"code":"PAYLOAD_TOO_LARGE"`) {
		t.Fatalf("body is not a PAYLOAD_TOO_LARGE error envelope: %s", b)
	}
}

func TestUploadRejectsOversizeBody(t *testing.T) {
	// Body exceeds cap + multipart overhead: the body reader trips while parsing.
	h, drv := newTestHandler(1 << 10)
	body, ctype := multipartBody(t, int(h.maxUploadBytes+multipartOverhead)+1024)

	assertTooLarge(t, doUpload(h, body, ctype))
	if n := drv.count(); n != 0 {
		t.Fatalf("storage got %d objects, want 0", n)
	}
}

func TestUploadRejectsFileOverExactLimit(t *testing.T) {
	// File fits within the body slack, so parsing succeeds, but exceeds the
	// exact per-file limit: 413 before storage is touched.
	const maxBytes = 100 << 10
	h, drv := newTestHandler(maxBytes)
	body, ctype := multipartBody(t, maxBytes+(50<<10))

	assertTooLarge(t, doUpload(h, body, ctype))
	if n := drv.count(); n != 0 {
		t.Fatalf("storage got %d objects, want 0", n)
	}
}

func TestUploadAcceptsFileWithinLimit(t *testing.T) {
	const maxBytes = 100 << 10
	h, drv := newTestHandler(maxBytes)
	body, ctype := multipartBody(t, maxBytes) // exactly at the limit

	rec := doUpload(h, body, ctype)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", rec.Code, rec.Body.String())
	}
	drv.mu.Lock()
	got := len(drv.objects["docs/big.bin"])
	drv.mu.Unlock()
	if got != maxBytes {
		t.Fatalf("stored %d bytes at docs/big.bin, want %d (objects: %d)", got, maxBytes, drv.count())
	}
}

func TestUploadRejectsMalformedForm(t *testing.T) {
	h, drv := newTestHandler(1 << 20)
	rec := doUpload(h, strings.NewReader("not a real multipart body"), "multipart/form-data; boundary=zzz")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body: %s", rec.Code, rec.Body.String())
	}
	if n := drv.count(); n != 0 {
		t.Fatalf("storage got %d objects, want 0", n)
	}
}

func TestNewClampsNonPositiveLimit(t *testing.T) {
	for _, v := range []int64{0, -5} {
		if got := New(nil, v).maxUploadBytes; got != defaultMaxUploadBytes {
			t.Errorf("New(nil, %d).maxUploadBytes = %d, want %d", v, got, defaultMaxUploadBytes)
		}
	}
}

func TestWriteFileForcesDownloadForActiveContent(t *testing.T) {
	cases := map[string]string{
		"text/html":              "attachment",
		"image/svg+xml":          "attachment",
		"application/xhtml+xml":  "attachment",
		"text/html; charset=utf": "attachment",
		"":                       "attachment",
		"image/png":              "inline",
		"application/pdf":        "inline",
		"video/mp4":              "inline",
	}
	for mime, want := range cases {
		rec := httptest.NewRecorder()
		writeFile(rec, model.OpenObject{
			Object: model.Object{Name: "a\"b\r\n.html", MimeType: mime},
			Body:   io.NopCloser(strings.NewReader("x")),
		})
		disp := rec.Header().Get("Content-Disposition")
		if !strings.HasPrefix(disp, want+";") {
			t.Fatalf("%q: disposition %q, want %s", mime, disp, want)
		}
		if strings.ContainsAny(disp, "\r\n") || strings.Count(disp, `"`) != 2 {
			t.Fatalf("%q: unsafe filename in %q", mime, disp)
		}
		if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Fatalf("%q: nosniff missing", mime)
		}
	}
}

// presignDriver records the content type the upload session presigns with.
type presignDriver struct {
	*recordingDriver
	contentType string
}

func (d *presignDriver) PresignPut(_ context.Context, path, contentType string, _ time.Duration) (string, error) {
	d.contentType = contentType
	return "https://storage.example.test/" + path, nil
}

// The explorer sends snake_case fields (content_type); they must reach the
// presigned PUT instead of being dropped by the JSON decoder.
func TestCreateUploadSessionReadsSnakeCaseBody(t *testing.T) {
	t.Parallel()
	drv := &presignDriver{recordingDriver: newRecordingDriver()}
	h := New(storageusecase.New(drv, nil, nil), 0)
	body := `{"prefix":"docs/","filename":"a.pdf","content_type":"application/pdf","size":3}`
	rec := httptest.NewRecorder()
	h.CreateUploadSession(rec, httptest.NewRequest(http.MethodPost, "/v1/platform/storage/uploads/session", strings.NewReader(body)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if drv.contentType != "application/pdf" {
		t.Fatalf("presigned content type = %q, want application/pdf", drv.contentType)
	}
	if !strings.Contains(rec.Body.String(), `"key":"docs/a.pdf"`) {
		t.Fatalf("body = %s", rec.Body.String())
	}
}
