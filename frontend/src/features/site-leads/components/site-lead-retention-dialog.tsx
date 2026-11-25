"use client";

import { useMemo, useState } from "react";
import { z } from "zod";

import { AppDialog } from "@/components/dialogs/app-dialog";
import { AppForm, AppInput } from "@/components/forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  useSaveSiteLeadSettings,
  useSiteLeadSettings,
} from "@/features/site-leads/hooks/use-site-leads";
import { ApiError } from "@/lib/api";
import { useLocale } from "@/providers/locale-provider";

const FORM_ID = "site-lead-retention-form";

/**
 * Retention period of website enquiries (TEC-1287, KVKK storage
 * limitation): leads older than this are deleted every night and the
 * deletion is recorded in the organization's activity.
 */
export function SiteLeadRetentionDialog({
  open,
  onOpenChange,
  canManage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}) {
  const { t } = useLocale();
  const settings = useSiteLeadSettings(open);
  const save = useSaveSiteLeadSettings();
  const [problem, setProblem] = useState<string | null>(null);
  const schema = useMemo(() => {
    const message = t("site_leads.retention.range");
    return z.object({
      retention_months: z.coerce
        .number(message)
        .int(message)
        .min(1, message)
        .max(120, message),
    });
  }, [t]);
  const close = () => {
    setProblem(null);
    onOpenChange(false);
  };
  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !save.isPending) close();
      }}
      title={t("site_leads.retention.title")}
      description={t("site_leads.retention.description")}
      className="sm:max-w-md"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={save.isPending}
          >
            {t("form.cancel")}
          </Button>
          {canManage ? (
            <Button
              type="submit"
              form={FORM_ID}
              disabled={save.isPending || !settings.data}
            >
              {t("site_leads.retention.save")}
            </Button>
          ) : null}
        </>
      }
    >
      {settings.data ? (
        <div className="space-y-4">
          {problem ? (
            <Alert variant="destructive">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          ) : null}
          <AppForm
            id={FORM_ID}
            className="space-y-4"
            schema={schema}
            defaultValues={{
              retention_months: settings.data.retention_months,
            }}
            onSubmit={async (values) => {
              setProblem(null);
              try {
                await save.mutateAsync({
                  retention_months: values.retention_months,
                });
                close();
              } catch (error) {
                setProblem(
                  error instanceof ApiError
                    ? error.message
                    : t("site_leads.retention.failed"),
                );
              }
            }}
          >
            <AppInput
              name="retention_months"
              label={t("site_leads.retention.months")}
              description={t("site_leads.retention.hint")}
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              disabled={!canManage}
            />
          </AppForm>
        </div>
      ) : null}
    </AppDialog>
  );
}
