"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { useFragmentToken } from "@/features/account/lib/fragment";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { isApiError } from "@/lib/api";
import { useLocale } from "@/providers/locale-provider";
import { authService } from "@/services/auth.service";

/**
 * Restore link of the account deletion e-mail
 * (`/platform/restore-account#token`, docs/design/account-deletion.md). The
 * account reopens only when the person presses the button, so a mail
 * scanner opening the link changes nothing.
 */
export function RestoreAccountPage() {
  const { t } = useLocale();
  const token = useFragmentToken();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = async () => {
    if (!token) return;
    setPending(true);
    setError(null);
    try {
      await authService.restoreAccount(token);
      setDone(true);
    } catch (err) {
      if (isApiError(err) && err.code === "INVALID_RESTORE_LINK") {
        setError(t("auth.restore_account.invalid"));
      } else if (isApiError(err) && err.code === "RATE_LIMITED") {
        setError(t("auth.login.rate_limited"));
      } else {
        setError(t("auth.restore_account.error"));
      }
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <AuthShell>
        <AuthCard
          title={t("auth.restore_account.success_title")}
          description={t("auth.restore_account.success_description")}
        >
          <div className="flex flex-col items-center gap-4">
            <CheckCircle2 className="text-primary size-10" />
            <Button asChild className="w-full">
              <Link href={routes.guest.login}>
                {t("auth.restore_account.sign_in")}
              </Link>
            </Button>
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthCard
        title={t("auth.restore_account.title")}
        description={t("auth.restore_account.description")}
      >
        <div className="flex flex-col gap-4">
          {token === "" ? (
            <Alert variant="destructive">
              <AlertDescription>
                {t("auth.restore_account.missing")}
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            className="w-full"
            disabled={!token || pending}
            onClick={() => void restore()}
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {pending
              ? t("auth.restore_account.restoring")
              : t("auth.restore_account.button")}
          </Button>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
