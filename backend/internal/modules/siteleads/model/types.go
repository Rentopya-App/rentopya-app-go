// Package model defines site enquiry and subscription records.
package model

import (
	"github.com/google/uuid"
	"time"
)

const Resource = "tenant.site_leads"

var Kinds = []string{"newsletter", "contact", "corporate", "franchise"}
var Statuses = []string{"new", "in_progress", "done", "spam"}

type Input struct {
	Kind             string `json:"kind"`
	Name             string `json:"name"`
	Email            string `json:"email"`
	Phone            string `json:"phone"`
	Company          string `json:"company"`
	City             string `json:"city"`
	Message          string `json:"message"`
	FleetSize        *int32 `json:"fleet_size"`
	Locale           string `json:"locale"`
	ConsentKVKK      bool   `json:"consent_kvkk"`
	ConsentMarketing bool   `json:"consent_marketing"`
	Honeypot         string `json:"honeypot"`
}

type Patch struct {
	Status *string `json:"status"`
	Note   *string `json:"note"`
}

type Lead struct {
	UUID             uuid.UUID  `json:"uuid"`
	Kind             string     `json:"kind"`
	Name             string     `json:"name"`
	Email            string     `json:"email"`
	Phone            string     `json:"phone"`
	Company          string     `json:"company"`
	City             string     `json:"city"`
	Message          string     `json:"message"`
	FleetSize        *int32     `json:"fleet_size"`
	Locale           string     `json:"locale"`
	ConsentKVKK      bool       `json:"consent_kvkk"`
	ConsentMarketing bool       `json:"consent_marketing"`
	SourceHost       string     `json:"source_host"`
	Status           string     `json:"status"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	HandledBy        *int64     `json:"handled_by"`
	HandledAt        *time.Time `json:"handled_at"`
	Note             string     `json:"note"`
	// MarketingStatus (TEC-1287): none (no marketing asked), pending (the
	// e-mail confirmation is outstanding: no permission yet), confirmed or
	// unsubscribed. Only confirmed is marketing permission.
	MarketingStatus string `json:"marketing_status"`
}

// Marketing statuses (TEC-1287).
const (
	MarketingNone         = "none"
	MarketingPending      = "pending"
	MarketingConfirmed    = "confirmed"
	MarketingUnsubscribed = "unsubscribed"
)

// Settings are an organization's lead settings (TEC-1287).
type Settings struct {
	// RetentionMonths: leads older than this are deleted by a daily job.
	RetentionMonths int `json:"retention_months"`
}

// TokenInput confirms a subscription or unsubscribes (the e-mail links).
type TokenInput struct {
	Token string `json:"token"`
}
