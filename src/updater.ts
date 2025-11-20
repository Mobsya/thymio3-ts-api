import { getFirmwareInfo } from "./device-info";
import { uploadFirmware } from "./ota";

const FIRMWARE_URL = "https://api.github.com/repos/mobsya/thymio3-firmware/releases/latest";

export async function isNewerFirmwareAvailable(
	deviceInfoCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<boolean> {
	const localVersion = (await getFirmwareInfo(deviceInfoCharacteristic)).esp32_ver;
	const latestRelease = await getLatestRelease();

	const remoteVersion = latestRelease.tagName;

	return isNewerVersion(remoteVersion, localVersion);
}

export async function getNewFirmware(
	deviceInfoCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<ArrayBuffer> {
	const localVersion = (await getFirmwareInfo(deviceInfoCharacteristic)).esp32_ver;
	const latestRelease = await getLatestRelease();

	if (isNewerVersion(latestRelease.tagName, localVersion)) {
		const firmwareURL = latestRelease.assetUrl;

		return downloadFirmware(firmwareURL);
	} else {
		throw new Error(
			`The local version ${localVersion} is the same or newer than the latest firmware version ${latestRelease.tagName}`
		);
	}
}

export async function updateFirmware(
  deviceInfoCharacteristic: BluetoothRemoteGATTCharacteristic,
  otaCommandCharacteristic: BluetoothRemoteGATTCharacteristic,
  otaFirmwareCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<void> {
  const newFirmware = await getNewFirmware(deviceInfoCharacteristic);
  return await uploadFirmware(otaCommandCharacteristic, otaFirmwareCharacteristic, newFirmware);
}

async function downloadFirmware(url: string): Promise<ArrayBuffer> {
	const response = await fetch(url);

	if (!response.ok) throw new Error("Firmware download failed");

	return await response.arrayBuffer();
}

async function getLatestRelease() {
	const response = await fetch(FIRMWARE_URL);

	if (!response.ok) {
		throw new Error(`GitHub API error: ${response.statusText}`);
	}

	const release = await response.json();

	return {
		tagName: release.tag_name, // e.g., "v1.0.2"

		assetUrl: release.assets[0]?.browser_download_url,

		assetName: release.assets[0]?.name,
	};
}

function isNewerVersion(remoteTagName: string, localVersion: number): boolean {
  // Remove the "v" character from the tag
  const remoteVersion = Number(remoteTagName.substring(1));
  return remoteVersion > localVersion;
}

/*
function isNewerVersion(remoteVersion: string, localVersion: string): boolean {
	const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);

	const [r, l] = [parse(remoteVersion), parse(localVersion)];

	for (let i = 0; i < r.length; i++) {
		if (r[i] > (l[i] || 0)) return true;

		if (r[i] < (l[i] || 0)) return false;
	}

	return false;
}
*/
