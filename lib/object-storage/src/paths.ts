// Single source of truth for the evidence object-storage layout.
//
// PRIVATE_OBJECT_DIR is "<bucket>/<gcsPrefix>" (gcsPrefix may be empty).
// Evidence objects live in GCS at:   <gcsPrefix>/case-<id>/<filename>
// and are referenced app-side at:     /objects/case-<id>/<filename>
//
// Any change to this scheme must happen here so the live upload/delete paths
// and the backfill script stay in lockstep.

export function parsePrivateObjectDir(dir: string): {
  bucketName: string;
  gcsPrefix: string;
} {
  const normalized = dir.replace(/^\//, "");
  const slashIdx = normalized.indexOf("/");
  if (slashIdx === -1) return { bucketName: normalized, gcsPrefix: "" };
  return {
    bucketName: normalized.slice(0, slashIdx),
    gcsPrefix: normalized.slice(slashIdx + 1),
  };
}

// GCS object name for a single evidence file: "<gcsPrefix>/case-<id>/<filename>".
export function evidenceObjectName(
  gcsPrefix: string,
  caseId: number | string,
  filename: string
): string {
  const rel = `case-${caseId}/${filename}`;
  return gcsPrefix ? `${gcsPrefix}/${rel}` : rel;
}

// GCS list/delete prefix for all objects of one case: "<gcsPrefix>/case-<id>/".
export function evidenceCaseListPrefix(
  gcsPrefix: string,
  caseId: number | string
): string {
  const rel = `case-${caseId}/`;
  return gcsPrefix ? `${gcsPrefix}/${rel}` : rel;
}

// GCS list prefix covering all evidence objects (backfill enumeration).
export function evidenceListPrefix(gcsPrefix: string): string {
  return gcsPrefix ? `${gcsPrefix}/` : "";
}

// App-facing object path stored in the evidence_files table.
export function evidenceObjectPath(
  caseId: number | string,
  filename: string
): string {
  return `/objects/case-${caseId}/${filename}`;
}

// Strip the gcsPrefix from a full GCS object name to get the case-relative path.
export function relativeToGcsPrefix(gcsPrefix: string, objectName: string): string {
  return gcsPrefix ? objectName.slice(gcsPrefix.length + 1) : objectName;
}

const EVIDENCE_RELATIVE_RE = /^case-(\d+)\/(.+)$/;

// Parse a case-relative path "case-<id>/<filename>" into its parts. Returns
// null for non-matching names and for "directory placeholder" objects (names
// ending in a slash).
export function parseEvidenceRelativePath(
  relative: string
): { caseId: number; filename: string } | null {
  const match = EVIDENCE_RELATIVE_RE.exec(relative);
  if (!match) return null;
  const filename = match[2];
  if (!filename || filename.endsWith("/")) return null;
  return { caseId: parseInt(match[1], 10), filename };
}
