import { describe, expect, it } from 'vitest';
import { compareVersions } from '../src/firmware-compatibility';

describe('firmware version comparison', () => {
  it('compares v-prefixed semantic firmware versions', () => {
    expect(compareVersions('v1.9.0', 'v1.8.9')).toBe(1);
    expect(compareVersions('v1.8.0', '1.8')).toBe(0);
    expect(compareVersions('1.7.9', 'v1.8.0')).toBe(-1);
  });

  it('compares semver-like prerelease firmware versions', () => {
    expect(compareVersions('v1.10.0', 'v1.10.0-rc.1')).toBe(1);
    expect(compareVersions('v1.10.0-rc.2', 'v1.10.0-rc.1')).toBe(1);
    expect(compareVersions('v1.10.0-beta.1', 'v1.10.0-rc.1')).toBe(-1);
    expect(compareVersions('v1.10.0+build.1', 'v1.10.0')).toBe(0);
  });
});
