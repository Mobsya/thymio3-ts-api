import { compareVersions } from "./firmware-compatibility";
import { uploadFirmware } from "./ota";

const FIRMWARE_VERSIONS_URL = "https://mobsya.github.io/thymio-3-firmware/versions.json";
const FIRMWARE_BASE_URL = 'https://mobsya.github.io/thymio-3-firmware/firmware/';

interface FirmwareVersion {
	version: string;
	file: string;
	releaseDate: string;
	description: string;
}

export async function fetchFirmwareVersions(): Promise<FirmwareVersion[]> {
	try {
		const response = await fetch(FIRMWARE_VERSIONS_URL);

		if (!response.ok) {
				throw new Error('Failed to fetch firmware versions');
		}

		const data = await response.json();
		return data.firmware_versions;
	} catch (error) {
		console.error('Error fetching firmware versions:', error);
		throw error;
	}
}

export async function isNewerFirmwareAvailable(
	localVersion: string
): Promise<boolean> {
	const latestRelease = await getLatestRelease();

	const remoteVersion = latestRelease.version;

	return isNewerVersion(remoteVersion, localVersion);
}

export async function getNewFirmware(
	localVersion: string
): Promise<Uint8Array<ArrayBuffer>> {
	const latestRelease = await getLatestRelease();

	if (isNewerVersion(latestRelease.version, localVersion)) {
		const firmwareURL = `${FIRMWARE_BASE_URL}${latestRelease.file}`

		return downloadFirmware(firmwareURL);
	} else {
		throw new Error(
			`The local version ${localVersion} is the same or newer than the latest firmware version ${latestRelease.version}`
		);
	}
}

export async function updateFirmware(
	localVersion: string,
  server: BluetoothRemoteGATTServer
): Promise<void> {
  const newFirmware = await getNewFirmware(localVersion);
  return await uploadFirmware(server, newFirmware);
}

async function downloadFirmware(url: string): Promise<Uint8Array<ArrayBuffer>> {
	const response = await fetch(url);

	if (!response.ok) throw new Error("Firmware download failed");

	const arrayBuf = await response.arrayBuffer();
	return new Uint8Array(arrayBuf);
}

async function getLatestRelease() {
	const firmwareVersions = await fetchFirmwareVersions();

	const latestVersion = firmwareVersions.reduce((prev, current) => {
		return compareVersions(prev.version, current.version) > 0 ? prev : current;
	});

	return latestVersion;
}

function isNewerVersion(remoteVersion: string, localVersion: string): boolean {
	return compareVersions(remoteVersion, localVersion) > 0;
}
