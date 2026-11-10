import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap, unwrapVoid } from '@/core/api/client';
import type { components } from '@/core/api/schema';
import { useSession } from '@/core/auth/session';
import { formPart } from '@/features/uploads/files';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

import { withStepUp } from './step-up';

type S = components['schemas'];
export type TenantMember = S['TenantMember'];
export type Invitation = S['Invitation'];
export type TenantRole = S['TenantRole'];
export type SupportGrant = S['SupportGrant'];
export type OrganizationSettings = S['OrganizationSettings'];
export type OrganizationSettingsVersion = S['OrganizationSettingsVersion'];
export type IntegrationAccount = S['IntegrationAccount'];
export type NotificationEvent = S['NotificationEvent'];

function useOrg() {
  return useSession((s) => s.organization?.slug);
}

const header = () => ({ header: orgHeader() });

/** Offset-paged list of a `/v1/tenant/*` endpoint, keyed by the organization. */
function usePaged<T>(
  key: unknown[],
  fetchPage: (offset: number) => Promise<{ items: T[]; total: number; limit: number; offset: number }>,
  enabled = true,
) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: ['org-settings', org, ...key],
    enabled: !!org && enabled,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
  });
}

function useOne<T>(key: unknown[], fetch: () => Promise<T>, enabled = true) {
  const org = useOrg();
  return useQuery({ queryKey: ['org-settings', org, ...key], enabled: !!org && enabled, queryFn: fetch });
}

/** Every write runs through the step-up helper, so a `STEP_UP_REQUIRED` answer asks for the password and repeats once. */
function useWrite<A, R>(call: (a: A) => Promise<R>, invalidate: string[][]) {
  const qc = useQueryClient();
  const org = useOrg();
  return useMutation({
    mutationFn: (a: A) => withStepUp(() => call(a)),
    onSuccess: () => {
      for (const k of invalidate) void qc.invalidateQueries({ queryKey: ['org-settings', org, ...k] });
    },
  });
}

// ---------------------------------------------------------------- organization

export function useOrganizationProfile() {
  return useOne(['profile'], () => unwrap(api.GET('/v1/tenant/organization', { params: header() })));
}

export function useRenameOrganization() {
  return useWrite(
    (name: string) => unwrap(api.PATCH('/v1/tenant/organization', { params: header(), body: { name } })),
    [['profile']],
  );
}

/** Uploads the picked file as multipart `logo`; the answer carries the new API-owned `logo_url`. */
export function useUploadLogo() {
  return useWrite(
    async (file: { uri: string; name: string; type: string }) => {
      const form = new FormData();
      form.append('logo', (await formPart(file.uri, file.name, file.type)) as Blob);
      return unwrap(api.PUT('/v1/tenant/organization/logo', { params: header(), body: form as never }));
    },
    [['profile']],
  );
}

export function useRemoveLogo() {
  return useWrite(() => unwrap(api.DELETE('/v1/tenant/organization/logo', { params: header() })), [['profile']]);
}

export function useOrganizationSettings() {
  return useOne(['settings'], () => unwrap(api.GET('/v1/tenant/settings', { params: header() })));
}

export function useSaveSettings() {
  return useWrite(
    (b: { settings: OrganizationSettings; base_version: number }) =>
      unwrap(api.PUT('/v1/tenant/settings', { params: header(), body: b })),
    [['settings']],
  );
}

// ---------------------------------------------------------------- members and invitations

export function useMembers(q: string) {
  return usePaged(['members', q], (offset) =>
    unwrap(
      api.GET('/v1/tenant/members', {
        params: { ...header(), query: { q: q || undefined, limit: PAGE_SIZE, offset, sort: 'name' } },
      }),
    ),
  );
}

export function useMember(userUuid: string) {
  return useOne(['member', userUuid], () =>
    unwrap(api.GET('/v1/tenant/members/{userUuid}', { params: { ...header(), path: { userUuid } } })),
  );
}

export function useUpdateMember(userUuid: string) {
  return useWrite(
    (body: S['TenantMemberPatchRequest']) =>
      unwrap(api.PATCH('/v1/tenant/members/{userUuid}', { params: { ...header(), path: { userUuid } }, body })),
    [['members'], ['member', userUuid]],
  );
}

export function useRemoveMember() {
  return useWrite(
    (userUuid: string) =>
      unwrapVoid(api.DELETE('/v1/tenant/members/{userUuid}', { params: { ...header(), path: { userUuid } } })),
    [['members']],
  );
}

export function useInvitations(q: string) {
  return usePaged(['invitations', q], (offset) =>
    unwrap(
      api.GET('/v1/tenant/invitations', {
        params: { ...header(), query: { q: q || undefined, limit: PAGE_SIZE, offset } },
      }),
    ),
  );
}

export function useInvite() {
  return useWrite(
    (body: S['CreateInvitationRequest']) => unwrap(api.POST('/v1/tenant/invitations', { params: header(), body })),
    [['invitations']],
  );
}

export function useInvitationAction() {
  return useWrite(
    ({ uuid, action }: { uuid: string; action: 'resend' | 'revoke' }) =>
      action === 'resend'
        ? unwrap(api.POST('/v1/tenant/invitations/{uuid}/resend', { params: { ...header(), path: { uuid } } }))
        : unwrap(api.POST('/v1/tenant/invitations/{uuid}/revoke', { params: { ...header(), path: { uuid } } })),
    [['invitations']],
  );
}

// ---------------------------------------------------------------- roles

export function useRoles(q: string) {
  return usePaged(['roles', q], (offset) =>
    unwrap(
      api.GET('/v1/tenant/roles', { params: { ...header(), query: { q: q || undefined, limit: PAGE_SIZE, offset } } }),
    ),
  );
}

/** Every role (pickers): one page of 100 is the panel's limit as well. */
export function useAllRoles(enabled: boolean) {
  return useOne(
    ['roles', 'all'],
    () => unwrap(api.GET('/v1/tenant/roles', { params: { ...header(), query: { limit: 100 } } })),
    enabled,
  );
}

export function useRole(uuid: string | undefined) {
  return useOne(
    ['role', uuid],
    () => unwrap(api.GET('/v1/tenant/roles/{uuid}', { params: { ...header(), path: { uuid: uuid ?? '' } } })),
    !!uuid,
  );
}

export function usePermissionCatalog() {
  return useOne(['permissions'], () => unwrap(api.GET('/v1/tenant/roles/permissions', { params: header() })));
}

export function useSaveRole(uuid: string | undefined) {
  return useWrite(
    (body: S['TenantRoleRequest']) =>
      uuid
        ? unwrap(api.PATCH('/v1/tenant/roles/{uuid}', { params: { ...header(), path: { uuid } }, body }))
        : unwrap(api.POST('/v1/tenant/roles', { params: header(), body })),
    [['roles'], ['role', uuid ?? '']],
  );
}

export function useDeleteRole() {
  return useWrite(
    (uuid: string) => unwrap(api.DELETE('/v1/tenant/roles/{uuid}', { params: { ...header(), path: { uuid } } })),
    [['roles']],
  );
}

// ---------------------------------------------------------------- support access

export function useSupportGrants() {
  return usePaged(['support'], (offset) =>
    unwrap(api.GET('/v1/tenant/support-access', { params: { ...header(), query: { limit: PAGE_SIZE, offset } } })),
  );
}

export function useOpenSupportGrant() {
  return useWrite(
    (body: S['SupportGrantOpenRequest']) => unwrap(api.POST('/v1/tenant/support-access', { params: header(), body })),
    [['support']],
  );
}

export function useRevokeSupportGrant() {
  return useWrite(
    (uuid: string) =>
      unwrap(api.POST('/v1/tenant/support-access/{uuid}/revoke', { params: { ...header(), path: { uuid } } })),
    [['support']],
  );
}

// ---------------------------------------------------------------- notifications

export function useNotificationEvents() {
  return useOne(['notification-events'], () => unwrap(api.GET('/v1/tenant/notification-events', { params: header() })));
}

export function useSaveNotificationRule() {
  return useWrite(
    (body: S['NotificationRuleInput']) => unwrap(api.PUT('/v1/tenant/notification-rules', { params: header(), body })),
    [['notification-events']],
  );
}

export function useNotificationTemplates() {
  return useOne(['notification-templates'], () =>
    unwrap(api.GET('/v1/tenant/notification-templates', { params: header() })),
  );
}

export function useNotificationDeliveries() {
  return usePaged(['notification-deliveries'], (offset) =>
    unwrap(
      api.GET('/v1/tenant/notification-deliveries', {
        params: { ...header(), query: { limit: PAGE_SIZE, offset, sort: '-created_at' } },
      }),
    ),
  );
}

export function useWhatsAppSession(enabled: boolean) {
  return useOne(['whatsapp'], () => unwrap(api.GET('/v1/tenant/whatsapp/session', { params: header() })), enabled);
}

// ---------------------------------------------------------------- templates, invoices, public API

export function useContractTemplates() {
  return usePaged(['contract-templates'], (offset) =>
    unwrap(api.GET('/v1/tenant/contract-templates', { params: { ...header(), query: { limit: PAGE_SIZE, offset } } })),
  );
}

export function useInspectionTemplates() {
  return usePaged(['inspection-templates'], (offset) =>
    unwrap(
      api.GET('/v1/tenant/inspection-templates', { params: { ...header(), query: { limit: PAGE_SIZE, offset } } }),
    ),
  );
}

export function useInvoiceSettings(enabled: boolean) {
  return useOne(
    ['invoice-settings'],
    () => unwrap(api.GET('/v1/tenant/invoices/settings', { params: header() })),
    enabled,
  );
}

export function usePublicApiOverview(enabled: boolean) {
  return useOne(['public-api'], () => unwrap(api.GET('/v1/tenant/public-api/overview', { params: header() })), enabled);
}

export function usePublicApiKeys(enabled: boolean) {
  return usePaged(
    ['public-api-keys'],
    (offset) =>
      unwrap(api.GET('/v1/tenant/public-api/keys', { params: { ...header(), query: { limit: PAGE_SIZE, offset } } })),
    enabled,
  );
}

// ---------------------------------------------------------------- integrations

export function useIntegrations() {
  return usePaged(['integrations'], (offset) =>
    unwrap(api.GET('/v1/tenant/integrations', { params: { ...header(), query: { limit: PAGE_SIZE, offset } } })),
  );
}

export function useIntegration(uuid: string) {
  return useOne(['integration', uuid], () =>
    unwrap(api.GET('/v1/tenant/integrations/{uuid}', { params: { ...header(), path: { uuid } } })),
  );
}

export function useIntegrationJobs(uuid: string) {
  return usePaged(['integration-jobs', uuid], (offset) =>
    unwrap(
      api.GET('/v1/tenant/integrations/{uuid}/jobs', {
        params: { ...header(), path: { uuid }, query: { limit: PAGE_SIZE, offset, sort: '-created_at' } },
      }),
    ),
  );
}

export function useIntegrationAction(uuid: string) {
  return useWrite(
    (action: 'test' | 'enable' | 'disable') => {
      const params = { ...header(), path: { uuid } };
      if (action === 'test') return unwrap(api.POST('/v1/tenant/integrations/{uuid}/test', { params }));
      if (action === 'enable') return unwrap(api.POST('/v1/tenant/integrations/{uuid}/enable', { params }));
      return unwrap(api.POST('/v1/tenant/integrations/{uuid}/disable', { params }));
    },
    [['integrations'], ['integration', uuid]],
  );
}

// ---------------------------------------------------------------- branded site

export function useSite(enabled: boolean) {
  return useOne(['site'], () => unwrap(api.GET('/v1/tenant/site', { params: header() })), enabled);
}

export function useSiteArticles(enabled: boolean) {
  return usePaged(
    ['site-articles'],
    (offset) =>
      unwrap(
        api.GET('/v1/tenant/site/articles', {
          params: { ...header(), query: { limit: PAGE_SIZE, offset, sort: '-updated_at' } },
        }),
      ),
    enabled,
  );
}

export function useSiteLeads(enabled: boolean) {
  return usePaged(
    ['site-leads'],
    (offset) =>
      unwrap(
        api.GET('/v1/tenant/site/leads', {
          params: { ...header(), query: { limit: PAGE_SIZE, offset, sort: '-created_at' } },
        }),
      ),
    enabled,
  );
}
