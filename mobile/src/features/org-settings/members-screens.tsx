import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { formatRelative, formatShort } from '@/core/format';
import { apiErrorMessage } from '@/core/i18n';
import { useBranches, useTenantContext } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { HeaderButton } from '@/ui/header-button';
import { Input } from '@/ui/input';
import { ListRow } from '@/ui/list';
import { MultiSelect } from '@/ui/multi-select';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  useAllRoles,
  useInvitationAction,
  useInvitations,
  useInvite,
  useMember,
  useMembers,
  useRemoveMember,
  useUpdateMember,
  type Invitation,
  type TenantMember,
} from './api';
import {
  accessBody,
  fullName,
  initialScope,
  invitationActions,
  isEmail,
  validateAccess,
  type AccessDraft,
  type AccessErrors,
  type BranchScope,
} from './lib';
import { confirmAction, Gate, InfoRow, Pill } from './parts';
import { StepUpHost } from './step-up';

type Tab = 'members' | 'invitations';

/** "Üyeler" (`/settings/members`): members and the invitations tab, search on both. */
export function MembersScreen() {
  const { t } = useTranslation('tenant_members');
  const can = useCan();
  const [tab, setTab] = useState<Tab>('members');
  return (
    <>
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight: can(Permission.TenantMembersWrite)
            ? () => (
                <HeaderButton
                  icon="add"
                  label={t('invitations:actions.invite')}
                  onPress={() => router.push('/settings/members/invite')}
                />
              )
            : undefined,
        }}
      />
      <StepUpHost />
      <Gate perm={Permission.TenantMembersRead}>
        {tab === 'members' ? <MembersList tab={tab} setTab={setTab} /> : <InvitationsList tab={tab} setTab={setTab} />}
      </Gate>
    </>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { t } = useTranslation('tenant_members');
  return (
    <Chips
      options={[
        { value: 'members' as const, label: t('tabs.members') },
        { value: 'invitations' as const, label: t('tabs.invitations') },
      ]}
      value={tab}
      onChange={setTab}
    />
  );
}

function scopeLabel(t: (k: string) => string, scope: BranchScope, branches: { name: string }[]) {
  return scope === 'all' ? t('branch_scope.all') : branches.map((b) => b.name).join(', ') || t('branch_scope.none');
}

function MembersList({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { t } = useTranslation('tenant_members');
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const query = useMembers(search.trim());
  return (
    <PagedList<TenantMember>
      query={query}
      keyOf={(m) => m.user.uuid}
      empty={search ? t('empty_filtered_title') : t('empty_title')}
      header={
        <>
          <Tabs tab={tab} setTab={setTab} />
          <SearchField value={q} onChangeText={setQ} placeholder={t('settings_app:members.search')} />
        </>
      }
      renderItem={(m, _i, last) => (
        <ListRow
          icon="user"
          title={fullName(m.user)}
          subtitle={`${m.roles.map((r) => r.name).join(', ')} · ${scopeLabel(t, m.branch_scope, m.branches)}`}
          trailing={
            <Text variant="footnote" tone="muted">
              {m.last_login_at ? formatRelative(m.last_login_at) : t('never_logged_in')}
            </Text>
          }
          onPress={() => router.push(`/settings/members/${m.user.uuid}`)}
          last={last}
        />
      )}
    />
  );
}

function InvitationsList({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { t } = useTranslation('invitations');
  const can = useCan();
  const write = can(Permission.TenantMembersWrite);
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const query = useInvitations(search.trim());
  const action = useInvitationAction();

  const run = async (inv: Invitation, kind: 'resend' | 'revoke') => {
    if (kind === 'revoke') {
      const ok = await confirmAction({
        title: t('revoke.title'),
        body: t('revoke.description', { email: inv.email }),
        action: t('actions.revoke'),
        cancel: t('common:cancel'),
        destructive: true,
      });
      if (!ok) return;
    }
    action.mutate(
      { uuid: inv.uuid, action: kind },
      {
        onSuccess: () =>
          toast.success(kind === 'resend' ? t('toast.resent', { email: inv.email }) : t('toast.revoked')),
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <PagedList<Invitation>
      query={query}
      keyOf={(i) => i.uuid}
      empty={search ? t('empty_filtered_title') : t('empty_title')}
      header={
        <>
          <Tabs tab={tab} setTab={setTab} />
          <SearchField value={q} onChangeText={setQ} placeholder={t('settings_app:members.search_invitations')} />
        </>
      }
      renderItem={(inv) => {
        const acts = invitationActions(inv.status);
        return (
          <View className="gap-2 border-b border-border px-4 py-3">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 font-sans-semibold" numberOfLines={1}>
                {inv.email}
              </Text>
              <Pill status={inv.status} label={t(`status.${inv.status}`)} />
            </View>
            <Text variant="footnote" tone="muted">
              {inv.roles.map((r) => r.name).join(', ')} ·{' '}
              {inv.branch_scope === 'all' ? t('branch_scope.all') : inv.branches.map((b) => b.name).join(', ')}
            </Text>
            <Text variant="footnote" tone="muted">
              {t('columns.expires_at')}: {formatShort(inv.expires_at)}
            </Text>
            {write && (acts.resend || acts.revoke) ? (
              <View className="flex-row gap-2">
                {acts.resend ? (
                  <Button
                    title={t('actions.resend')}
                    variant="outline"
                    icon="refresh"
                    className="flex-1"
                    disabled={action.isPending}
                    onPress={() => void run(inv, 'resend')}
                  />
                ) : null}
                {acts.revoke ? (
                  <Button
                    title={t('actions.revoke')}
                    variant="ghost"
                    icon="cancel"
                    className="flex-1"
                    disabled={action.isPending}
                    onPress={() => void run(inv, 'revoke')}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        );
      }}
    />
  );
}

/** Roles and branches pickers shared by the member access form and the invitation form. */
function AccessFields({
  draft,
  setDraft,
  errors,
  ns,
  extraBranches = [],
}: {
  draft: AccessDraft;
  setDraft: (d: AccessDraft) => void;
  errors: AccessErrors;
  ns: 'tenant_members' | 'invitations';
  extraBranches?: { uuid: string; name: string; code: string }[];
}) {
  const { t } = useTranslation(ns);
  const can = useCan();
  const roles = useAllRoles(can(Permission.TenantRolesRead) || can(Permission.TenantMembersWrite));
  const branches = useBranches();
  const callerScope = useTenantContext().data?.branch_scope;
  const branchOptions = useMemo(() => {
    const items = [...(branches.data?.items ?? [])];
    for (const b of extraBranches) if (!items.some((x) => x.uuid === b.uuid)) items.push(b as never);
    return items.map((b) => ({ value: b.uuid, label: `${b.code} · ${b.name}` }));
  }, [branches.data?.items, extraBranches]);
  const scopes: { value: BranchScope; label: string }[] = [
    ...(callerScope === 'selected'
      ? []
      : [{ value: 'all' as const, label: t('tenant_members:branch_scope.all_long') }]),
    { value: 'selected', label: t('tenant_members:branch_scope.selected_long') },
  ];
  return (
    <>
      <MultiSelect
        label={t('fields.roles')}
        hint={t('fields.roles_hint')}
        placeholder={t('fields.roles_placeholder')}
        values={draft.roleUuids}
        options={(roles.data?.items ?? []).map((r) => ({
          value: r.uuid,
          label: r.name,
          description: r.description || undefined,
        }))}
        onChange={(roleUuids) => setDraft({ ...draft, roleUuids })}
        error={errors.roles ? t('validation.roles_required') : undefined}
      />
      <Text variant="footnote" tone="muted">
        {t('fields.branch_scope')}
      </Text>
      <Chips options={scopes} value={draft.scope} onChange={(scope) => setDraft({ ...draft, scope })} />
      {callerScope === 'selected' ? (
        <Text variant="footnote" tone="muted">
          {t('tenant_members:access.restricted_hint')}
        </Text>
      ) : null}
      {draft.scope === 'selected' ? (
        <MultiSelect
          label={t('fields.branches')}
          hint={t('fields.branches_hint')}
          placeholder={t('fields.branches_placeholder')}
          values={draft.branchUuids}
          options={branchOptions}
          onChange={(branchUuids) => setDraft({ ...draft, branchUuids })}
          error={errors.branches ? t('validation.branches_required') : undefined}
        />
      ) : null}
    </>
  );
}

/** One member: roles and branch access (edit with `tenant.members.write`), remove from the company. */
export function MemberScreen() {
  const { userUuid } = useLocalSearchParams<{ userUuid: string }>();
  const { t } = useTranslation('tenant_members');
  return (
    <>
      <Stack.Screen options={{ title: t('access.title') }} />
      <StepUpHost />
      <Gate perm={Permission.TenantMembersRead}>
        <MemberBody userUuid={userUuid} />
      </Gate>
    </>
  );
}

function MemberBody({ userUuid }: { userUuid: string }) {
  const member = useMember(userUuid);
  return <QueryState query={member}>{(m) => <MemberForm key={m.updated_at} member={m} />}</QueryState>;
}

function MemberForm({ member }: { member: TenantMember }) {
  const { t } = useTranslation('tenant_members');
  const can = useCan();
  const write = can(Permission.TenantMembersWrite);
  const callerScope = useTenantContext().data?.branch_scope;
  const update = useUpdateMember(member.user.uuid);
  const remove = useRemoveMember();
  const [draft, setDraft] = useState<AccessDraft>({
    roleUuids: member.roles.map((r) => r.uuid),
    scope: initialScope(callerScope, member.branch_scope),
    branchUuids: member.branches.map((b) => b.uuid),
  });
  const [errors, setErrors] = useState<AccessErrors>({});
  const name = fullName(member.user);

  const save = () => {
    const e = validateAccess(draft);
    setErrors(e);
    if (Object.keys(e).length) return;
    update.mutate(accessBody(draft), {
      onSuccess: () => toast.success(t('toast.updated')),
      onError: (err) => toast.error(apiErrorMessage(err)),
    });
  };

  const removeMember = async () => {
    const ok = await confirmAction({
      title: t('remove.title', { name }),
      body: t('remove.description', { name }),
      action: t('actions.remove'),
      cancel: t('common:cancel'),
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(member.user.uuid, {
      onSuccess: () => {
        toast.success(t('toast.removed'));
        router.back();
      },
      onError: (err) => toast.error(apiErrorMessage(err)),
    });
  };

  return (
    <FormScreen
      footer={
        write ? <Button title={t('actions.save')} size="lg" loading={update.isPending} onPress={save} /> : undefined
      }>
      <Card>
        <Text variant="headline">{name}</Text>
        <InfoRow label={t('columns.email')} value={member.user.email} />
        <InfoRow
          label={t('columns.last_login_at')}
          value={member.last_login_at ? formatShort(member.last_login_at) : t('never_logged_in')}
        />
        <InfoRow label={t('columns.created_at')} value={formatShort(member.created_at)} />
      </Card>
      {write ? (
        <>
          <Card title={t('access.title')}>
            <AccessFields
              draft={draft}
              setDraft={setDraft}
              errors={errors}
              ns="tenant_members"
              extraBranches={member.branches}
            />
          </Card>
          <Button
            title={t('actions.remove')}
            variant="ghost"
            icon="trash"
            loading={remove.isPending}
            onPress={() => void removeMember()}
          />
        </>
      ) : (
        <Card title={t('access.title')}>
          <InfoRow label={t('columns.roles')} value={member.roles.map((r) => r.name).join(', ')} />
          <InfoRow label={t('columns.branch_scope')} value={scopeLabel(t, member.branch_scope, member.branches)} />
        </Card>
      )}
    </FormScreen>
  );
}

/** Invite a staff member by e-mail with roles and branch access (the panel's invite drawer). */
export function InviteScreen() {
  const { t } = useTranslation('invitations');
  return (
    <>
      <Stack.Screen options={{ title: t('create.title') }} />
      <StepUpHost />
      <Gate perm={Permission.TenantMembersWrite}>
        <InviteForm />
      </Gate>
    </>
  );
}

function InviteForm() {
  const { t } = useTranslation('invitations');
  const callerScope = useTenantContext().data?.branch_scope;
  const invite = useInvite();
  const [email, setEmail] = useState('');
  const [draft, setDraft] = useState<AccessDraft>({
    roleUuids: [],
    scope: initialScope(callerScope),
    branchUuids: [],
  });
  const [errors, setErrors] = useState<AccessErrors>({});

  const send = () => {
    const e: AccessErrors = { ...validateAccess(draft) };
    if (!email.trim()) e.email = 'required';
    else if (!isEmail(email)) e.email = 'invalid';
    setErrors(e);
    if (Object.keys(e).length) return;
    const to = email.trim();
    invite.mutate(
      { email: to, ...accessBody(draft) },
      {
        onSuccess: () => {
          toast.success(t('toast.created', { email: to }));
          router.back();
        },
        onError: (err) => toast.error(apiErrorMessage(err)),
      },
    );
  };

  return (
    <FormScreen footer={<Button title={t('actions.send')} size="lg" loading={invite.isPending} onPress={send} />}>
      <Text tone="muted">{t('create.description')}</Text>
      <Input
        label={t('fields.email')}
        placeholder={t('fields.email_placeholder')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={
          errors.email
            ? t(errors.email === 'required' ? 'validation.email_required' : 'validation.email_invalid')
            : undefined
        }
      />
      <AccessFields draft={draft} setDraft={setDraft} errors={errors} ns="invitations" />
      <Text variant="footnote" tone="muted">
        {t('create.expiry_hint')}
      </Text>
    </FormScreen>
  );
}
