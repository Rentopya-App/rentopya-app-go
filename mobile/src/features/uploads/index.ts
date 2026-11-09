/**
 * Offline upload queue for inspection evidence. Module screens (handover,
 * return) use these; the queue itself owns no screen but the status sheet.
 */
export {
  enqueuePhoto,
  enqueueSignature,
  type EnqueuePhotoInput,
  type EnqueueSignatureInput,
  removeJob,
  retryFailed,
  waitUntilDrained,
} from './queue';
export { useUploadJobs, useUploadQueue, useUploadQueueBadge, useUploadWorker } from './hooks';
export type { QueueCounts, UploadJob, UploadState } from './machine';
