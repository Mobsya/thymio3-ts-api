import { compareVersions } from "./firmware-compatibility";
import { uploadFirmware } from "./ota";

const FIRMWARE_RELEASES_URL = "https://api.github.com/repos/Mobsya/thymio3-firmware-esp32/releases?per_page=100";
const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
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

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string | null;
  assets: GitHubReleaseAsset[];
}

export async function fetchFirmwareVersions(
  options: FirmwareUpdateOptions = {}
): Promise<FirmwareVersion[]> {
  try {
    const response = await fetch(FIRMWARE_RELEASES_URL, {
      headers: GITHUB_API_HEADERS,
    });

    if (!response.ok) {
      throw new Error('Failed to fetch firmware releases');
    }

    const releases = await response.json();

    if (!Array.isArray(releases)) {
      throw new Error('Invalid firmware releases response');
    }

    return (releases as GitHubRelease[])
      .filter((release) => !release.draft)
      .filter((release) => options.includePrereleases || !release.prerelease)
      .map(toFirmwareVersion);
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
    return downloadFirmware(latestRelease.downloadUrl);
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

async function downloadFirmware(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);

  if (!response.ok) throw new Error("Firmware download failed");

  const arrayBuf = await response.arrayBuffer();
  return new Uint8Array(arrayBuf);
}

async function getLatestRelease(options: FirmwareUpdateOptions) {
  const firmwareVersions = await fetchFirmwareVersions(options);

  if (firmwareVersions.length === 0) {
    throw new Error('No firmware releases found');
  }

  const latestVersion = firmwareVersions.reduce((prev, current) => {
    return compareVersions(prev.version, current.version) > 0 ? prev : current;
  });

  return latestVersion;
}

function isNewerVersion(remoteVersion: string, localVersion: string): boolean {
  return compareVersions(remoteVersion, localVersion) > 0;
}

function toFirmwareVersion(release: GitHubRelease): FirmwareVersion {
  const firmwareAsset = selectFirmwareAsset(release);

  return {
    version: release.tag_name,
    releaseDate: release.published_at ?? release.created_at,
    description: release.body ?? release.name ?? '',
    downloadUrl: firmwareAsset.browser_download_url,
  };
}

function selectFirmwareAsset(release: GitHubRelease): GitHubReleaseAsset {
  const bonAssets = release.assets.filter((asset) =>
    asset.name.toLowerCase().endsWith('.bin')
  );

  if (bonAssets.length === 0) {
    throw new Error(`No .bin firmware asset found for release ${release.tag_name}`);
  }

  if (bonAssets.length === 1) {
    return bonAssets[0];
  }

  const releaseTag = release.tag_name.toLowerCase();
  const releaseVersion = releaseTag.replace(/^v/, '');
  const matchingAssets = bonAssets.filter((asset) => {
    const assetName = asset.name.toLowerCase();
    return assetName.includes(releaseTag) || assetName.includes(releaseVersion);
  });

  if (matchingAssets.length === 1) {
    return matchingAssets[0];
  }

  throw new Error(`Multiple .bin firmware assets found for release ${release.tag_name}`);
}
