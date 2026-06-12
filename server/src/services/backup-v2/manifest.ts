import crypto from 'crypto';
import semver from 'semver';

export const MANIFEST_VERSION = '1.0';
export const MANIFEST_FORMAT = 'trek-export';

export interface ManifestScope {
  trips?: boolean;
  users?: boolean;
  settings?: boolean;
  uploads?: boolean;
  explore?: boolean;
}

export interface ManifestFilters {
  user_ids?: string[] | null;
  trip_ids?: string[] | null;
  date_from?: string | null;
  date_to?: string | null;
}

export interface ManifestStats {
  trips?: number;
  places?: number;
  budget_items?: number;
  reservations?: number;
  files?: number;
  total_size_bytes?: number;
  [key: string]: number | undefined;
}

export interface ManifestExportedBy {
  user_id: string;
  role: string;
}

export interface TrekManifest {
  version: string;
  format: string;
  created_at: string;
  trek_version: string;
  export_type: 'full' | 'selective' | 'user_export' | 'scheduled';
  scope: ManifestScope;
  filters: ManifestFilters;
  stats: ManifestStats;
  exported_by: ManifestExportedBy;
}

export interface ChecksumsFile {
  [filePath: string]: string;
}

export function generateManifest(
  opts: {
    trekVersion: string;
    exportType: TrekManifest['export_type'];
    scope: ManifestScope;
    filters: ManifestFilters;
    stats: ManifestStats;
    exportedBy: ManifestExportedBy;
  }
): TrekManifest {
  return {
    version: MANIFEST_VERSION,
    format: MANIFEST_FORMAT,
    created_at: new Date().toISOString(),
    trek_version: opts.trekVersion,
    export_type: opts.exportType,
    scope: opts.scope,
    filters: opts.filters,
    stats: opts.stats,
    exported_by: opts.exportedBy,
  };
}

export function validateManifest(manifest: unknown): { valid: true; manifest: TrekManifest } | { valid: false; error: string } {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, error: 'Manifest is not a valid object' };
  }

  const m = manifest as Record<string, unknown>;

  if (m.version !== MANIFEST_VERSION) {
    return { valid: false, error: `Unsupported manifest version: ${m.version}. Expected ${MANIFEST_VERSION}` };
  }
  if (m.format !== MANIFEST_FORMAT) {
    return { valid: false, error: `Unsupported manifest format: ${m.format}. Expected ${MANIFEST_FORMAT}` };
  }
  if (!m.created_at || typeof m.created_at !== 'string') {
    return { valid: false, error: 'Manifest missing created_at' };
  }
  if (!m.trek_version || typeof m.trek_version !== 'string') {
    return { valid: false, error: 'Manifest missing trek_version' };
  }
  if (!m.scope || typeof m.scope !== 'object') {
    return { valid: false, error: 'Manifest missing scope' };
  }
  if (!m.exported_by || typeof m.exported_by !== 'object') {
    return { valid: false, error: 'Manifest missing exported_by' };
  }

  const trekVersion = String(m.trek_version);
  // Accept any trek version >= 3.0.0 (current server is 3.0.13)
  // For newer exports, we show a warning but still allow import
  if (semver.valid(trekVersion) && semver.lt(trekVersion, '2.0.0')) {
    return { valid: false, error: `Export from TREK ${trekVersion} is too old and not supported` };
  }

  return { valid: true, manifest: m as unknown as TrekManifest };
}

export function checkVersionCompatibility(manifestVersion: string, currentVersion: string): {
  compatible: boolean;
  warning?: string;
} {
  if (!semver.valid(manifestVersion) || !semver.valid(currentVersion)) {
    return { compatible: true };
  }

  if (semver.gt(manifestVersion, currentVersion)) {
    return {
      compatible: true,
      warning: `This export was created with TREK ${manifestVersion} which is newer than the current version (${currentVersion}). Some data may not be importable.`,
    };
  }

  if (semver.lt(manifestVersion, currentVersion)) {
    return {
      compatible: true,
      warning: `This export was created with TREK ${manifestVersion}. Data will be migrated to the current schema automatically.`,
    };
  }

  return { compatible: true };
}
