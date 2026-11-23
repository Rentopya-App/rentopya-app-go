package usecase

import (
	"errors"
	"testing"

	resusecase "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/reservations/usecase"
)

// TEC-1281: every coupon rejection reads the same on the public API, except min_amount.
func TestPublicCouponReasonsAreUniform(t *testing.T) {
	for _, reason := range []string{"not_found", "inactive", "not_started", "expired", "channel", "scope", "customer_scope", "customer_required", "customer_limit"} {
		err := publicFieldErr(&resusecase.ValidationError{Details: []resusecase.Detail{{Field: "coupon_code", Code: "coupon_" + reason, Message: "the coupon does not apply: " + reason}}})
		var ve *ValidationError
		if !errors.As(err, &ve) || len(ve.Details) != 1 {
			t.Fatalf("%s: %v", reason, err)
		}
		if d := ve.Details[0]; d.Code != CouponInvalid || d.Field != "coupon_code" || d.Message != "the coupon code is not valid for this booking" {
			t.Fatalf("%s leaks: %+v", reason, d)
		}
	}
	err := publicFieldErr(&resusecase.ValidationError{Details: []resusecase.Detail{
		{Field: "coupon_code", Code: "coupon_min_amount", Message: "the coupon does not apply: min_amount"},
		{Field: "starts_at", Code: "required", Message: "required"},
	}})
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Details[0].Code != "coupon_min_amount" || ve.Details[1].Code != "required" {
		t.Fatalf("other details changed: %+v", err)
	}
}
