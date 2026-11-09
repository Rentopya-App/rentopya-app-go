import { api } from '@/core/api/client';
import { ApiError, toApiError } from '@/core/api/errors';
import type { components } from '@/core/api/schema';

import { formPart, readBase64 } from './files';
import { type PhotoMeta, requestHeaders, type Step, type StepResult, type UploadJob } from './machine';

type PhotoRequest = components['schemas']['InspectionPhotoRequest'];
type SignatureRequest = components['schemas']['InspectionSignatureRequest'];
type UploadPath = '/v1/tenant/inspections/{uuid}/photos/{photoUuid}/file';

function failure(e: unknown): StepResult {
  if (e instanceof ApiError) {
    return { ok: false, status: e.status, code: e.code, reason: e.details?.[0]?.code, message: e.message };
  }
  return { ok: false, status: 0, code: 'NETWORK_ERROR', message: e instanceof Error ? e.message : String(e) };
}

async function check<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>) {
  let r: Awaited<typeof call>;
  try {
    r = await call;
  } catch (e) {
    throw new ApiError(0, { code: 'NETWORK_ERROR', message: e instanceof Error ? e.message : String(e) });
  }
  if (r.error !== undefined || !r.response.ok) throw toApiError(r.response.status, r.error);
  return r.data;
}

/**
 * Sends one step of a job through the typed API client (Bearer, refresh,
 * `X-Organization` = the job's organization) and reports the answer.
 */
export async function runStep(job: UploadJob, step: Step): Promise<StepResult> {
  const header = requestHeaders(job);
  const path = { uuid: job.inspectionUuid };
  try {
    switch (step.kind) {
      case 'announce': {
        const data = await check(
          api.POST('/v1/tenant/inspections/{uuid}/photos', {
            params: { header, path },
            body: step.body as PhotoRequest,
          }),
        );
        const out = data?.data;
        if (!out) return { ok: false, status: 502, code: 'BAD_RESPONSE' };
        return {
          ok: true,
          photo: { uuid: out.photo.uuid, status: out.photo.status },
          upload: {
            method: out.upload.method,
            path: out.upload.path,
            field: out.upload.field,
            maxBytes: out.upload.max_bytes,
          },
        };
      }
      case 'upload': {
        // The API documents PUT only; another method is a contract change this build cannot follow.
        if (step.method.toUpperCase() !== 'PUT')
          return { ok: false, status: 400, code: 'UNSUPPORTED_UPLOAD', message: step.method };
        const meta = job.meta as PhotoMeta;
        const form = new FormData();
        form.append(step.field, (await formPart(job.localPath, meta.fileName, meta.contentType)) as Blob);
        // The upload address is used exactly as the API issued it (an API path, no storage key).
        // It has no `{…}` placeholders, so the typed client sends it verbatim.
        await check(
          api.PUT(step.path as UploadPath, {
            params: { header, path: { uuid: job.inspectionUuid, photoUuid: job.photoUuid ?? '' } },
            body: form as never,
          }),
        );
        return { ok: true };
      }
      case 'complete':
        await check(
          api.POST('/v1/tenant/inspections/{uuid}/photos/{photoUuid}/complete', {
            params: { header, path: { uuid: job.inspectionUuid, photoUuid: job.photoUuid ?? '' } },
          }),
        );
        return { ok: true };
      case 'signature': {
        const png = await readBase64(job.localPath);
        await check(
          api.POST('/v1/tenant/inspections/{uuid}/signature', {
            params: { header, path },
            body: { ...(step.body as Omit<SignatureRequest, 'png_base64'>), png_base64: png },
          }),
        );
        return { ok: true };
      }
    }
  } catch (e) {
    return failure(e);
  }
}
