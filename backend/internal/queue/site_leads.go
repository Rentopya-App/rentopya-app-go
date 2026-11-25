package queue

import (
	"context"
	"fmt"
	"time"

	"github.com/hibiken/asynq"
)

// TaskSiteLeadRetention deletes site leads older than their organization's
// retention period (TEC-1287, KVKK storage limitation).
const TaskSiteLeadRetention = "app:site-leads:retention"

// siteLeadRetentionCron runs nightly (Europe/Istanbul is UTC+3: 03:40).
const siteLeadRetentionCron = "40 0 * * *"

// SiteLeadRetentionFunc deletes expired leads and returns how many.
type SiteLeadRetentionFunc func(ctx context.Context) (int, error)

// NewSiteLeadRetentionTask builds the task.
func NewSiteLeadRetentionTask() *asynq.Task {
	return asynq.NewTask(TaskSiteLeadRetention, []byte("{}"))
}

// WithSiteLeadRetention registers the handler.
func (w *Worker) WithSiteLeadRetention(fn SiteLeadRetentionFunc) *Worker {
	w.mux.HandleFunc(TaskSiteLeadRetention, func(ctx context.Context, _ *asynq.Task) error {
		if fn == nil {
			return nil
		}
		n, err := fn(ctx)
		if n > 0 {
			w.log.Info("site_leads_retention_deleted", "leads", n)
		}
		return err
	})
	return w
}

// RegisterSiteLeadRetentionSchedule adds the nightly run.
func RegisterSiteLeadRetentionSchedule(scheduler *asynq.Scheduler) error {
	if _, err := scheduler.Register(
		siteLeadRetentionCron, NewSiteLeadRetentionTask(),
		asynq.Queue(QueueMaintenance), asynq.MaxRetry(3),
		asynq.Timeout(10*time.Minute), asynq.Unique(time.Hour),
	); err != nil {
		return fmt.Errorf("queue: register site lead retention: %w", err)
	}
	return nil
}
