package adapters

import (
	"context"
	"testing"

	notifmodel "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/model"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifyengine/channel"
	"github.com/google/uuid"
)

type recordingNotifier struct{ in []notifmodel.EnqueueInput }

func (r *recordingNotifier) Enqueue(_ context.Context, in notifmodel.EnqueueInput) ([]notifmodel.Notification, error) {
	r.in = append(r.in, in)
	return []notifmodel.Notification{{UUID: uuid.New()}}, nil
}

// A staff push goes through the member's inbox with the event as its kind
// (the mobile push text) and the panel path as the link (the app's deep link).
func TestStaffPushCarriesKindAndRelativeLink(t *testing.T) {
	n := &recordingNotifier{}
	p := NewPush(n, nil, VAPID{})
	id := uuid.New()
	res, err := p.Send(context.Background(), 7, channel.Message{
		DeliveryUUID: uuid.New(), Event: "reservation.approval_waiting", Subject: "s", Body: "b",
		Link:      "https://app.example.test/t/acme/reservations/" + id.String(),
		Recipient: channel.Recipient{Audience: channel.AudienceStaff, UserID: 3, Name: "Ali"},
	})
	if err != nil || res.Outcome != channel.OutcomeSent || len(n.in) != 1 {
		t.Fatalf("send: %+v %v %d", res, err, len(n.in))
	}
	in := n.in[0]
	if in.Payload["kind"] != "reservation.approval_waiting" {
		t.Fatalf("kind: %v", in.Payload)
	}
	if in.ActionURL == nil || *in.ActionURL != "/t/acme/reservations/"+id.String() {
		t.Fatalf("action url: %v", in.ActionURL)
	}
}
