import packageJson from '../package.json';
import { getAPIVersion } from './thymio';

type FirmwareCompatibilityRange = {
  min?: string,
  max?: string
};

type FirmwareCompatibility = {
  esp32?: FirmwareCompatibilityRange
};

type PackageJsonWithFirmwareCompatibility = typeof packageJson & {
  thymio?: {
    firmwareCompatibility?: FirmwareCompatibility
  }
};

const firmwareCompatibility = (packageJson as PackageJsonWithFirmwareCompatibility).thymio?.firmwareCompatibility;

export function compareVersions(leftVersion: string, rightVersion: string): number {
  const leftParts = parseFirmwareVersion(leftVersion);
  const rightParts = parseFirmwareVersion(rightVersion);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let i = 0; i < maxLength; i++) {
    const leftPart = leftParts[i] ?? 0;
    const rightPart = rightParts[i] ?? 0;

    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

export async function checkFirmwareCompatibility(firmwareVersion: string): Promise<void> {
  try {
    warnIfFirmwareIsIncompatible(firmwareVersion);
  } catch (error) {
    // TODO this should throw an actual warning as soon as the firmware versioning is in place
    //throw new Error("Firmware compatibility check failed:", error);
    console.warn("[Thymio 3 API] Firmware compatibility check failed:", error);
  }
}

function warnIfFirmwareIsIncompatible(firmwareVersion: string): void {
  if (!isCompatibleFirmwareVersion(firmwareVersion, firmwareCompatibility)) {
    console.log('compatible')
    console.warn(
      `[Thymio 3 API] Firmware compatibility warning: ESP32 firmware ${firmwareVersion} is outside the compatible range ${formatCompatibilityRange(firmwareCompatibility)} for API version ${getAPIVersion()}. Some API features may not work as expected.`
    );
  }
  console.log('incompatible')
}

function isCompatibleFirmwareVersion(
  version: string,
  range?: FirmwareCompatibilityRange
): boolean {
  if (!range) return true;
  if (range.min !== undefined && compareVersions(version, range.min) < 0) return false;
  if (range.max !== undefined && compareVersions(version, range.max) > 0) return false;

  return true;
}

function formatCompatibilityRange(range?: FirmwareCompatibilityRange): string {
  if (!range) return "any version";

  const min = range.min ?? "-infinity";
  const max = range.max ?? "infinity";

  return `${min} to ${max}`;
}

function parseFirmwareVersion(version: string): number[] {
  return version.replace(/^v/i, "").split(".").map(Number);
}
