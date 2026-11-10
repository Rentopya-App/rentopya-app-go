import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch, View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Permission, useCan } from '@/core/auth/permissions';
import { apiErrorMessage } from '@/core/i18n';
import { useDebounced } from '@/core/use-debounced';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { TextArea } from '@/ui/fields';
import { HeaderButton } from '@/ui/header-button';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { ListRow } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { useDeleteRole, usePermissionCatalog, useRole, useRoles, useSaveRole, type TenantRole } from './api';
import {
  groupPermissions,
  roleKeyFromName,
  roleRequest,
  toggleGroup,
  togglePermission,
  validateRole,
  type PermissionItem,
  type RoleDraft,
} from './lib';
import { confirmAction, Gate } from './parts';
import { StepUpHost } from './step-up';

/** "Roller": template roles (read-only) and the company's own roles. */
export function RolesScreen() {
  const { t } = useTranslation('tenant_roles');
  const can = useCan();
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const query = useRoles(search.trim());
  return (
    <>
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight: can(Permission.TenantRolesWrite)
            ? () => (
                <HeaderButton
                  icon="add"
                  label={t('actions.create')}
                  onPress={() => router.push('/settings/roles/new')}
                />
              )
            : undefined,
        }}
      />
      <Gate perm={Permission.TenantRolesRead}>
        <PagedList<TenantRole>
          query={query}
          keyOf={(r) => r.uuid}
          empty={search ? t('empty_filtered_title') : t('empty_title')}
          header={<SearchField value={q} onChangeText={setQ} placeholder={t('settings_app:roles.search')} />}
          renderItem={(r, _i, last) => (
            <ListRow
              icon="security"
              title={r.name}
              subtitle={`${r.is_template ? t('template') : t('custom')} · ${t('permission_count', {
                count: r.permissions.length,
              })}`}
              trailing={
                <Text variant="footnote" tone="muted">
                  {t('settings_app:roles.members', { count: r.member_count })}
                </Text>
              }
              onPress={() => router.push(`/settings/roles/${r.uuid}`)}
              last={last}
            />
          )}
        />
      </Gate>
    </>
  );
}

/** New role (`/settings/roles/new`) or one role (`/settings/roles/{uuid}`): view, edit, delete. */
export function RoleScreen({ create }: { create?: boolean }) {
  const { uuid } = useLocalSearchParams<{ uuid?: string }>();
  const { t } = useTranslation('tenant_roles');
  return (
    <>
      <Stack.Screen options={{ title: create ? t('create_title') : t('detail_title') }} />
      <StepUpHost />
      <Gate perm={create ? Permission.TenantRolesWrite : Permission.TenantRolesRead}>
        {create ? <RoleForm /> : <ExistingRole uuid={uuid ?? ''} />}
      </Gate>
    </>
  );
}

function ExistingRole({ uuid }: { uuid: string }) {
  const role = useRole(uuid);
  return <QueryState query={role}>{(r) => <RoleForm key={r.updated_at} role={r} />}</QueryState>;
}

function RoleForm({ role }: { role?: TenantRole }) {
  const { t } = useTranslation('tenant_roles');
  const can = useCan();
  const creating = !role;
  const editable = can(Permission.TenantRolesWrite) && !role?.is_template;
  const catalog = usePermissionCatalog();
  const save = useSaveRole(role?.uuid);
  const remove = useDeleteRole();
  const [draft, setDraft] = useState<RoleDraft>({
    name: role?.name ?? '',
    key: role?.key ?? '',
    description: role?.description ?? '',
    permissions: role?.permissions ?? [],
  });
  const [keyTouched, setKeyTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setName = (name: string) =>
    setDraft((d) => ({ ...d, name, key: creating && !keyTouched ? roleKeyFromName(name) : d.key }));

  const submit = () => {
    const e = validateRole(draft, creating);
    const msg: Record<string, string> = {};
    if (e.name) msg.name = t(e.name === 'required' ? 'validation.name_required' : 'validation.name_too_long');
    if (e.key) msg.key = t('validation.key_invalid');
    if (e.description) msg.description = t('validation.description_too_long');
    setErrors(msg);
    if (Object.keys(msg).length) return;
    save.mutate(roleRequest(draft, creating), {
      onSuccess: (r) => {
        toast.success(creating ? t('toast.created') : t('toast.updated'));
        if (creating) router.replace(`/settings/roles/${r.uuid}`);
      },
      onError: (err) => {
        const f = formErrors(err);
        setErrors(f.fields);
        if (f.message) toast.error(f.message);
      },
    });
  };

  const del = async () => {
    if (!role) return;
    const ok = await confirmAction({
      title: t('settings_app:roles.delete_title', { name: role.name }),
      body: t('settings_app:roles.delete_body'),
      action: t('actions.delete'),
      cancel: t('common:cancel'),
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(role.uuid, {
      onSuccess: () => {
        toast.success(t('toast.deleted'));
        router.back();
      },
      onError: (err) => toast.error(apiErrorMessage(err)),
    });
  };

  return (
    <FormScreen
      footer={
        editable ? (
          <Button
            title={creating ? t('actions.create') : t('actions.save')}
            size="lg"
            loading={save.isPending}
            onPress={submit}
          />
        ) : undefined
      }>
      {role?.is_template ? <Text tone="muted">{t('template_read_only')}</Text> : null}
      <Card title={t('form.section_details')}>
        <Input
          label={t('fields.name')}
          value={draft.name}
          onChangeText={setName}
          editable={editable}
          error={errors.name}
        />
        <Input
          label={t('fields.key')}
          hint={t('fields.key_hint')}
          value={draft.key}
          autoCapitalize="none"
          editable={creating}
          onChangeText={(key) => {
            setKeyTouched(true);
            setDraft((d) => ({ ...d, key }));
          }}
          error={errors.key}
        />
        <TextArea
          label={t('fields.description')}
          value={draft.description}
          onChangeText={(description) => setDraft((d) => ({ ...d, description }))}
          editable={editable}
          error={errors.description}
        />
      </Card>
      <Text variant="caption" tone="muted" className="px-1">
        {t('form.section_permissions')} · {t('permission_count', { count: draft.permissions.length })}
      </Text>
      <Text variant="footnote" tone="muted" className="px-1">
        {t('form.section_permissions_desc')}
      </Text>
      <QueryState query={catalog}>
        {(c) => (
          <PermissionMatrix
            items={c.items}
            selected={draft.permissions}
            editable={editable}
            onChange={(permissions) => setDraft((d) => ({ ...d, permissions }))}
          />
        )}
      </QueryState>
      {role && editable ? (
        <Button
          title={t('actions.delete')}
          variant="ghost"
          icon="trash"
          loading={remove.isPending}
          onPress={() => void del()}
        />
      ) : null}
    </FormScreen>
  );
}

function PermissionMatrix({
  items,
  selected,
  editable,
  onChange,
}: {
  items: PermissionItem[];
  selected: string[];
  editable: boolean;
  onChange: (v: string[]) => void;
}) {
  const { t } = useTranslation('permissions');
  const groups = useMemo(() => groupPermissions(items), [items]);
  const [open, setOpen] = useState<string | null>(null);
  const set = new Set(selected);
  return (
    <View className="gap-2">
      {groups.map((g) => {
        const on = g.items.filter((p) => set.has(p.slug)).length;
        const expanded = open === g.key;
        return (
          <View key={g.key} className="overflow-hidden rounded-lg border border-border bg-card">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? null : g.key)}
              className="min-h-[52px] flex-row items-center gap-3 px-4 py-2 active:opacity-80">
              <View className="flex-1">
                <Text className="font-sans-semibold">{t(`groups.${g.key}`, { defaultValue: g.key })}</Text>
                <Text variant="footnote" tone="muted">
                  {on}/{g.items.length}
                </Text>
              </View>
              {editable ? (
                <Button
                  title={on === g.items.length ? t('settings_app:roles.none') : t('settings_app:roles.all')}
                  variant="ghost"
                  onPress={() => onChange(toggleGroup(selected, g.items))}
                />
              ) : null}
              <Icon name={expanded ? 'chevronDown' : 'forward'} tone="muted-foreground" size={18} />
            </Pressable>
            {expanded
              ? g.items.map((p) => (
                  <View key={p.slug} className="flex-row items-center gap-3 border-t border-border px-4 py-2">
                    <View className="flex-1">
                      <Text variant="callout">{p.name}</Text>
                      <Text variant="footnote" tone="muted">
                        {p.slug}
                      </Text>
                    </View>
                    <Switch
                      value={set.has(p.slug)}
                      disabled={!editable}
                      accessibilityLabel={p.name}
                      onValueChange={(v) => onChange(togglePermission(selected, p.slug, v))}
                    />
                  </View>
                ))
              : null}
          </View>
        );
      })}
    </View>
  );
}
