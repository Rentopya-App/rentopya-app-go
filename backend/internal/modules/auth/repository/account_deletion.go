package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/auth/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// RestoreDeactivatedUser reopens the account whose restore link hashes to
// restoreHash while its purge date is still ahead. ErrNotFound otherwise.
func (r *Postgres) RestoreDeactivatedUser(ctx context.Context, restoreHash string, now time.Time) (model.User, error) {
	row, err := r.q.RestoreDeactivatedUser(ctx, db.RestoreDeactivatedUserParams{
		RestoreTokenHash: pgtype.Text{String: restoreHash, Valid: true},
		Now:              pgtype.Timestamptz{Time: now, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.User{}, ErrNotFound
		}
		return model.User{}, err
	}
	return mapUser(row), nil
}

// ListOrganizationsSolelyOwnedByUser lists the live organizations the user
// is the only open owner of (the deletion request is refused for them).
func (r *Postgres) ListOrganizationsSolelyOwnedByUser(ctx context.Context, userID int64) ([]model.SoleOwnedOrganization, error) {
	rows, err := r.q.ListOrganizationsSolelyOwnedByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]model.SoleOwnedOrganization, 0, len(rows))
	for _, row := range rows {
		out = append(out, model.SoleOwnedOrganization{UUID: row.Uuid, Slug: row.Slug, Name: row.Name})
	}
	return out, nil
}

// DeleteUserPushTargets removes the user's mobile push devices and browser
// push subscriptions.
func (r *Postgres) DeleteUserPushTargets(ctx context.Context, userID int64) error {
	return r.q.DeleteUserPushTargets(ctx, userID)
}

// ListUsersDueForPurge returns deactivated accounts whose restore window ended.
func (r *Postgres) ListUsersDueForPurge(ctx context.Context, now time.Time, limit int32) ([]model.PurgeCandidate, error) {
	rows, err := r.q.ListUsersDueForPurge(ctx, db.ListUsersDueForPurgeParams{
		Now: pgtype.Timestamptz{Time: now, Valid: true}, RowLimit: limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]model.PurgeCandidate, 0, len(rows))
	for _, row := range rows {
		out = append(out, model.PurgeCandidate{ID: row.ID, UUID: row.Uuid})
	}
	return out, nil
}

// PurgeUser erases the account in one transaction: sign-in data, devices,
// inbox and memberships are deleted and the users row is anonymised
// (rental, contract, finance and audit records keep pointing to it). False
// when the account was already purged.
func (r *Postgres) PurgeUser(ctx context.Context, userID int64, anonymousName string, now time.Time) (bool, error) {
	var purged bool
	err := r.withTx(ctx, func(q *db.Queries) error {
		if err := q.PurgeUserSignInData(ctx, userID); err != nil {
			return fmt.Errorf("purge sign-in data: %w", err)
		}
		if err := q.PurgeUserPersonalData(ctx, userID); err != nil {
			return fmt.Errorf("purge personal data: %w", err)
		}
		orgIDs, err := q.ListUserOrganizationIDs(ctx, userID)
		if err != nil {
			return fmt.Errorf("list organizations: %w", err)
		}
		for _, orgID := range orgIDs {
			if err := q.PurgeUserFromOrganization(ctx, db.PurgeUserFromOrganizationParams{
				OrganizationID: orgID, UserID: userID,
			}); err != nil {
				return fmt.Errorf("purge from organization %d: %w", orgID, err)
			}
		}
		n, err := q.AnonymizeUser(ctx, db.AnonymizeUserParams{
			ID: userID, Name: anonymousName, Now: pgtype.Timestamptz{Time: now, Valid: true},
		})
		if err != nil {
			return fmt.Errorf("anonymize user: %w", err)
		}
		purged = n > 0
		return nil
	})
	return purged, err
}
