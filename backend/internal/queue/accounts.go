package queue

import (
	"context"
	"fmt"
	"time"

	"github.com/hibiken/asynq"
)

// Self-service account deletion (docs/design/account-deletion.md).
const (
	// TaskAccountPurge erases the accounts whose 30-day restore window ended.
	TaskAccountPurge = "app:auth:account-purge"

	accountPurgeCron = "@every 1h"
)

// AccountPurgeFunc erases due accounts and returns how many it erased.
type AccountPurgeFunc func(ctx context.Context) (int64, error)

// WithAccountPurge registers the deleted-account purge.
func (w *Worker) WithAccountPurge(purge AccountPurgeFunc) *Worker {
	w.mux.HandleFunc(TaskAccountPurge, func(ctx context.Context, _ *asynq.Task) error {
		if purge == nil {
			return nil
		}
		n, err := purge(ctx)
		if n > 0 {
			w.log.Info("accounts_purged", "count", n)
		}
		return err
	})
	return w
}

// RegisterAccountPurgeSchedule adds the hourly purge. A run handles at most
// one batch; the next run continues, so an account is erased within about
// an hour of its date.
func RegisterAccountPurgeSchedule(scheduler *asynq.Scheduler) error {
	if _, err := scheduler.Register(
		accountPurgeCron, asynq.NewTask(TaskAccountPurge, []byte("{}")),
		asynq.Queue(QueueMaintenance), asynq.MaxRetry(0),
		asynq.Timeout(10*time.Minute), asynq.Unique(55*time.Minute),
	); err != nil {
		return fmt.Errorf("queue: register account purge: %w", err)
	}
	return nil
}
