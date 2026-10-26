import { compareVersions } from "./firmware-compatibility";
import { uploadFirmware } from "./ota";

const FIRMWARE_RELEASES_URL = "https://mobsya.github.io/thymio3-firmware-esp32/releases.json";
const DOWNLOAD_OPTIONS: RequestInit = {
  credentials: "omit",
  cache: "no-cache",
};

export interface FirmwareUpdateOptions {
  includePrereleases?: boolean;
}

interface FirmwareVersion {
  version: string;
  releaseDate: string;
  description: string;
  downloadUrl: string;
}

interface FirmwareAsset {
  name: string;
  url: string;
  size: number;
  sha256: string;
  role: string | null;
}

interface FirmwareRelease {
  tag: string;
  name: string;
  prerelease: boolean;
  published_at: string;
  assets: FirmwareAsset[];
}

interface FirmwareCatalog {
  schema_version: 1;
  latest_stable: string | null;
  releases: FirmwareRelease[];
}

export async function fetchFirmwareVersions(
  options: FirmwareUpdateOptions = {}
): Promise<FirmwareVersion[]> {
  const catalog = await fetchFirmwareCatalog();

  return catalog.releases
    .filter((release) => options.includePrereleases || !release.prerelease)
    .filter((release) => release.assets.some((asset) => asset.role === 'app'))
    .map(toFirmwareVersion);
}

async function fetchFirmwareCatalog(): Promise<FirmwareCatalog> {
  try {
    const response = await fetch(FIRMWARE_RELEASES_URL, DOWNLOAD_OPTIONS);

    if (!response.ok) {
      throw new Error('Failed to fetch firmware releases');
    }

    return parseFirmwareCatalog(await response.json());
  } catch (error) {
    console.error('Error fetching firmware releases:', error);
    throw error;
  }
}

export async function isNewerFirmwareAvailable(
  localVersion: string,
  options: FirmwareUpdateOptions = {}
): Promise<boolean> {
  const latestRelease = await getLatestRelease(options);

  const remoteVersion = latestRelease.version;

  return isNewerVersion(remoteVersion, localVersion);
}

export async function getNewFirmware(
  localVersion: string,
  options: FirmwareUpdateOptions = {}
): Promise<Uint8Array<ArrayBuffer>> {
  const latestRelease = await getLatestRelease(options);

  if (isNewerVersion(latestRelease.version, localVersion)) {
    return downloadFirmware(latestRelease.asset);
  } else {
    throw new Error(
      `The local version ${localVersion} is the same or newer than the latest firmware version ${latestRelease.version}`
    );
  }
}

export async function updateFirmware(
  localVersion: string,
  server: BluetoothRemoteGATTServer,
  options: FirmwareUpdateOptions = {}
): Promise<void> {
  const newFirmware = await getNewFirmware(localVersion, options);
  return await uploadFirmware(server, newFirmware);
}

async function downloadFirmware(asset: FirmwareAsset): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(asset.url, DOWNLOAD_OPTIONS);

  if (!response.ok) throw new Error("Firmware download failed");

  const arrayBuf = await response.arrayBuffer();
  if (arrayBuf.byteLength !== asset.size) {
    throw new Error('Firmware size mismatch');
  }

  if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
    throw new Error('Web Crypto is required to verify firmware');
  }

  const firmware = new Uint8Array(arrayBuf);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', firmware);
  const checksum = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  if (checksum !== asset.sha256) {
    throw new Error('Firmware checksum mismatch');
  }

  return firmware;
}

async function getLatestRelease(options: FirmwareUpdateOptions) {
  const catalog = await fetchFirmwareCatalog();

  if (catalog.releases.length === 0) {
    throw new Error('No firmware releases found');
  }

  let release: FirmwareRelease;
  if (options.includePrereleases) {
    release = catalog.releases.reduce((prev, current) =>
      compareVersions(prev.tag, current.tag) > 0 ? prev : current
    );
  } else {
    if (catalog.latest_stable === null) {
      throw new Error('No stable firmware release found');
    }
    const stableRelease = catalog.releases.find((entry) => entry.tag === catalog.latest_stable);
    if (!stableRelease || stableRelease.prerelease) {
      throw new Error(`Invalid latest stable firmware release: ${catalog.latest_stable}`);
    }
    release = stableRelease;
  }

  // Select the release before checking its assets: never silently fall back
  // to an older version if the selected release cannot be used for OTA.
  return { version: release.tag, asset: selectFirmwareAsset(release) };
}

function isNewerVersion(remoteVersion: string, localVersion: string): boolean {
  return compareVersions(remoteVersion, localVersion) > 0;
}

function toFirmwareVersion(release: FirmwareRelease): FirmwareVersion {
  const firmwareAsset = selectFirmwareAsset(release);

  return {
    version: release.tag,
    releaseDate: release.published_at,
    description: release.name || release.tag,
    downloadUrl: firmwareAsset.url,
  };
}

function selectFirmwareAsset(release: FirmwareRelease): FirmwareAsset {
  const firmwareAssets = release.assets.filter((asset) => asset.role === 'app');

  if (firmwareAssets.length === 0) {
    throw new Error(`No application firmware asset found for release ${release.tag}`);
  }

  if (firmwareAssets.length === 1) {
    return firmwareAssets[0];
  }

  throw new Error(`Multiple application firmware assets found for release ${release.tag}`);
}

function parseFirmwareCatalog(value: unknown): FirmwareCatalog {
  if (!isRecord(value)) {
    throw new Error('Invalid firmware catalog');
  }
  if (value.schema_version !== 1) {
    throw new Error('Unsupported firmware catalog schema version');
  }
  if ((value.latest_stable !== null && !isNonEmptyString(value.latest_stable))
    || !Array.isArray(value.releases)) {
    throw new Error('Invalid firmware catalog');
  }

  const tags = new Set<string>();
  const releases = value.releases.map((entry: unknown): FirmwareRelease => {
    if (!isRecord(entry) || !isNonEmptyString(entry.tag)
      || typeof entry.name !== 'string' || typeof entry.prerelease !== 'boolean'
      || !isNonEmptyString(entry.published_at) || !Number.isFinite(Date.parse(entry.published_at))
      || !Array.isArray(entry.assets)) {
      throw new Error('Invalid firmware catalog release');
    }
    if (tags.has(entry.tag)) {
      throw new Error(`Duplicate firmware release tag: ${entry.tag}`);
    }
    tags.add(entry.tag);

    const assets = entry.assets.map((asset: unknown): FirmwareAsset => {
      if (!isRecord(asset) || !isNonEmptyString(asset.name)
        || !isHttpsUrl(asset.url)
        || typeof asset.size !== 'number' || !Number.isSafeInteger(asset.size) || asset.size < 0
        || typeof asset.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(asset.sha256)
        || (asset.role !== null && !isNonEmptyString(asset.role))) {
        throw new Error(`Invalid firmware catalog asset for release ${entry.tag}`);
      }
      return {
        name: asset.name, url: asset.url, size: asset.size,
        sha256: asset.sha256, role: asset.role,
      };
    });
    return {
      tag: entry.tag, name: entry.name, prerelease: entry.prerelease,
      published_at: entry.published_at, assets,
    };
  });

  return { schema_version: 1, latest_stable: value.latest_stable, releases };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
