import packageJson from '../package.json';
import { getAPIVersion } from './thymio';

type FirmwareCompatibilityRange = {
  min?: string,
  max?: string
};

type FirmwareCompatibility = {
  esp32?: FirmwareCompatibilityRange
};

type ParsedFirmwareVersion = {
  parts: number[],
  prereleaseParts: string[]
};

type PackageJsonWithFirmwareCompatibility = typeof packageJson & {
  thymio?: {
    firmwareCompatibility?: FirmwareCompatibility
  }
};

const firmwareCompatibility = (packageJson as PackageJsonWithFirmwareCompatibility).thymio?.firmwareCompatibility;

export function compareVersions(leftVersion: string, rightVersion: string): number {
  const left = parseFirmwareVersion(leftVersion);
  const right = parseFirmwareVersion(rightVersion);
  const maxLength = Math.max(left.parts.length, right.parts.length);

  for (let i = 0; i < maxLength; i++) {
    const leftPart = left.parts[i] ?? 0;
    const rightPart = right.parts[i] ?? 0;

    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return comparePrereleaseVersions(left.prereleaseParts, right.prereleaseParts);
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

function parseFirmwareVersion(version: string): ParsedFirmwareVersion {
  const cleanedVersion = version.trim().replace(/^v/i, "");
  const versionWithoutBuild = cleanedVersion.split("+")[0] ?? "";
  const prereleaseSeparatorIndex = versionWithoutBuild.indexOf("-");
  const mainVersion = prereleaseSeparatorIndex === -1
    ? versionWithoutBuild
    : versionWithoutBuild.slice(0, prereleaseSeparatorIndex);
  const prereleaseVersion = prereleaseSeparatorIndex === -1
    ? ""
    : versionWithoutBuild.slice(prereleaseSeparatorIndex + 1);

  return {
    parts: mainVersion.split(".").map(parseNumericVersionPart),
    prereleaseParts: prereleaseVersion === "" ? [] : prereleaseVersion.split("."),
  };
}

function parseNumericVersionPart(part: string): number {
  const parsedPart = Number(part);
  return Number.isFinite(parsedPart) ? parsedPart : 0;
}

function comparePrereleaseVersions(
  leftParts: string[],
  rightParts: string[]
): number {
  if (leftParts.length === 0 && rightParts.length === 0) return 0;
  if (leftParts.length === 0) return 1;
  if (rightParts.length === 0) return -1;

  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let i = 0; i < maxLength; i++) {
    const leftPart = leftParts[i];
    const rightPart = rightParts[i];

    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;

    const comparison = comparePrereleasePart(leftPart, rightPart);
    if (comparison !== 0) return comparison;
  }

  return 0;
}

function comparePrereleasePart(leftPart: string, rightPart: string): number {
  const leftIsNumeric = isNumericPrereleasePart(leftPart);
  const rightIsNumeric = isNumericPrereleasePart(rightPart);

  if (leftIsNumeric && rightIsNumeric) {
    const leftNumber = Number(leftPart);
    const rightNumber = Number(rightPart);

    if (leftNumber > rightNumber) return 1;
    if (leftNumber < rightNumber) return -1;
    return 0;
  }

  if (leftIsNumeric) return -1;
  if (rightIsNumeric) return 1;

  if (leftPart > rightPart) return 1;
  if (leftPart < rightPart) return -1;
  return 0;
}

function isNumericPrereleasePart(part: string): boolean {
  return /^(0|[1-9]\d*)$/.test(part);
}
