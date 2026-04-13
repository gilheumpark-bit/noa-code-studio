/**
 * Re-exports the real audit engine from `@noa/quill-engine` so Code Studio panels
 * resolve a single module path in the desktop bundle.
 */
export {
  runProjectAudit,
  formatAuditReport,
  type AuditProgressCallback,
} from "@noa/quill-engine/audit/audit-engine";
