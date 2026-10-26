import { beforeEach, describe, expect, it, vi } from 'vitest';
import publishedCatalog from './fixtures/firmware-catalog.json';
import {
  fetchFirmwareVersions,
  getNewFirmware,
  isNewerFirmwareAvailable,
} from '../src/updater';

// jsdom does not expose SubtleCrypto; use the runtime implementation.
const { webcrypto } = await vi.importActual<{ webcrypto: Crypto }>('node:crypto');
const catalogUrl = 'https://mobsya.github.io/thymio3-firmware-esp32/releases.json';
const downloadOptions = { credentials: 'omit', cache: 'no-cache' };
const publishedRelease = publishedCatalog.releases[0]!;
const publishedApp = publishedRelease.assets.find((asset) => asset.role === 'app')!;
const firmwareBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
type Release = typeof publishedRelease;

function release({
  tag = 'v1.9.0',
  name = `${tag} release`,
  prerelease = false,
  published_at = '2026-01-02T00:00:00Z',
  assets = [{
    ...publishedApp,
    name: `thymio3-${tag}.bin`,
    url: `https://mobsya.github.io/thymio3-firmware-esp32/releases/123/thymio3-${tag}.bin`,
    size: firmwareBytes.byteLength,
    sha256: '5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953',
  }],
}: Partial<Release> = {}): Release {
  return { ...publishedRelease, tag, name, prerelease, published_at, assets };
}

function catalog(
  releases: Release[] = [release()],
  latest_stable: string | null = releases.find((entry) => !entry.prerelease)?.tag ?? null
) {
  return { schema_version: 1, latest_stable, releases };
}

function stubFetch(metadata: unknown = catalog(), bytes = firmwareBytes) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === catalogUrl) return { ok: true, json: async () => metadata };
    return { ok: true, arrayBuffer: async () => bytes.buffer };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('firmware updater', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('maps catalog metadata without exposing verification fields', async () => {
    const oldRelease = release({ tag: 'v1.8.0', name: 'Old release' });
    const newRelease = release({ tag: 'v1.9.0', name: '', published_at: '2026-02-01T00:00:00Z' });
    const preview = release({ tag: 'v2.0.0-rc.1', prerelease: true });
    const fetchMock = stubFetch(catalog([oldRelease, newRelease, preview]));

    await expect(fetchFirmwareVersions()).resolves.toEqual([
      {
        version: 'v1.8.0', releaseDate: '2026-01-02T00:00:00Z',
        description: 'Old release', downloadUrl: oldRelease.assets[0]!.url,
      },
      {
        version: 'v1.9.0', releaseDate: '2026-02-01T00:00:00Z',
        description: 'v1.9.0', downloadUrl: newRelease.assets[0]!.url,
      },
    ]);
    await expect(fetchFirmwareVersions({ includePrereleases: true })).resolves.toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith(catalogUrl, downloadOptions);
  });

  it('follows latest_stable even when another release is newer or has a higher version', async () => {
    const selected = release();
    const higher = release({ tag: 'v2.0.0', published_at: '2026-03-01T00:00:00Z' });
    const fetchMock = stubFetch(catalog([higher, selected], selected.tag));

    await expect(isNewerFirmwareAvailable('v1.8.1')).resolves.toBe(true);
    await expect(isNewerFirmwareAvailable('v1.9.0')).resolves.toBe(false);
    await expect(getNewFirmware('v1.8.1')).resolves.toEqual(firmwareBytes);
    expect(fetchMock).toHaveBeenLastCalledWith(selected.assets[0]!.url, downloadOptions);
    expect(fetchMock.mock.calls.every(([url]) => new URL(url).hostname === 'mobsya.github.io')).toBe(true);
  });

  it.each([
    ['v2.0.0-rc.1', true],
    ['v2.0.0', false],
  ])('selects the highest version %s when prereleases are enabled', async (tag, prerelease) => {
    const selected = release({ tag, prerelease });
    const fetchMock = stubFetch(catalog([
      release({ tag: 'v1.9.9' }), selected,
      release({ tag: 'v1.10.0' }), release({ tag: 'v2.0.0-beta.1', prerelease: true }),
    ], 'v1.9.9'));

    await expect(isNewerFirmwareAvailable('v1.9.9', { includePrereleases: true })).resolves.toBe(true);
    await expect(getNewFirmware('v1.9.9', { includePrereleases: true })).resolves.toEqual(firmwareBytes);
    expect(fetchMock).toHaveBeenLastCalledWith(selected.assets[0]!.url, downloadOptions);
  });

  it('allows an explicitly requested prerelease when there is no stable release', async () => {
    stubFetch(catalog([release({ tag: 'v2.0.0-rc.1', prerelease: true })], null));
    await expect(isNewerFirmwareAvailable('v1.9.0')).rejects.toThrow('No stable firmware release found');
    await expect(getNewFirmware('v1.9.0', { includePrereleases: true })).resolves.toEqual(firmwareBytes);
  });

  it.each(['v1.9.0', '1.9.0', 'v1.10.0'])('does not download for an equal or newer local version %s', async (version) => {
    const fetchMock = stubFetch();
    await expect(getNewFirmware(version)).rejects.toThrow(
      `The local version ${version} is the same or newer than the latest firmware version v1.9.0`
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(isNewerFirmwareAvailable(version)).resolves.toBe(false);
  });

  it.each([
    [catalog([]), 'No firmware releases found'],
    [catalog([release()], null), 'No stable firmware release found'],
    [catalog([release()], 'v9.0.0'), 'Invalid latest stable firmware release: v9.0.0'],
    [catalog([release({ prerelease: true })], 'v1.9.0'), 'Invalid latest stable firmware release: v1.9.0'],
  ])('rejects an unavailable or inconsistent stable selection', async (metadata, error) => {
    const fetchMock = stubFetch(metadata);
    await expect(getNewFirmware('v1.0.0')).rejects.toThrow(error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns an empty listing but rejects selection from an empty catalog with prereleases enabled', async () => {
    stubFetch(catalog([]));
    await expect(fetchFirmwareVersions()).resolves.toEqual([]);
    await expect(getNewFirmware('v1.0.0', { includePrereleases: true })).rejects.toThrow('No firmware releases found');
  });

  it('selects the application from the published catalog', async () => {
    stubFetch(publishedCatalog);
    await expect(fetchFirmwareVersions()).resolves.toEqual([{
      version: 'v1.10.2', releaseDate: publishedRelease.published_at,
      description: 'v1.10.2', downloadUrl: publishedApp.url,
    }]);
    await expect(isNewerFirmwareAvailable('1.10.1')).resolves.toBe(true);
    await expect(isNewerFirmwareAvailable('1.10.2')).resolves.toBe(false);
  });

  it.each(['full', 'bootloader', 'partition-table', 'ota-data', 'audio-tone', null])(
    'never selects a %s asset even when its filename looks like an application', async (role) => {
      const unclassified = release({ assets: [{ ...publishedApp, role }] });
      stubFetch(catalog([unclassified]));
      await expect(fetchFirmwareVersions()).resolves.toEqual([]);
      await expect(getNewFirmware('v1.8.0')).rejects.toThrow('No application firmware asset found for release v1.9.0');
    }
  );

  it('uses the application role without guessing from filenames or fetching manifests', async () => {
    const selected = release();
    selected.assets[0]!.name = 'firmware.image';
    selected.assets.push(...publishedRelease.assets.filter((asset) => asset.role !== 'app'));
    const fetchMock = stubFetch(catalog([selected]));
    await expect(getNewFirmware('v1.8.0')).resolves.toEqual(firmwareBytes);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(selected.assets[0]!.url, downloadOptions);
  });

  it('omits historical releases without an application role without blocking the selected release', async () => {
    stubFetch(catalog([release({ tag: 'v1.0.0', assets: [] }), release()], 'v1.9.0'));
    await expect(fetchFirmwareVersions()).resolves.toHaveLength(1);
    await expect(getNewFirmware('v1.8.0')).resolves.toEqual(firmwareBytes);
  });

  it.each([false, true])('does not fall back when the selected release has no application (prereleases: %s)', async (includePrereleases) => {
    stubFetch(catalog([release(), release({ tag: 'v2.0.0', assets: [] })], 'v2.0.0'));
    await expect(getNewFirmware('v1.8.0', { includePrereleases })).rejects.toThrow(
      'No application firmware asset found for release v2.0.0'
    );
  });

  it('rejects multiple applications in both listings and selected releases', async () => {
    stubFetch(catalog([release({ assets: [publishedApp, { ...publishedApp, name: 'other.bin' }] })]));
    await expect(fetchFirmwareVersions()).rejects.toThrow('Multiple application firmware assets found for release v1.9.0');
    await expect(getNewFirmware('v1.8.0')).rejects.toThrow('Multiple application firmware assets found for release v1.9.0');
  });

  it.each([
    [null, 'Invalid firmware catalog'],
    [[], 'Invalid firmware catalog'],
    [{ ...catalog(), schema_version: 2 }, 'Unsupported firmware catalog schema version'],
    [{ ...catalog(), schema_version: undefined }, 'Unsupported firmware catalog schema version'],
    [{ ...catalog(), latest_stable: undefined }, 'Invalid firmware catalog'],
    [{ ...catalog(), latest_stable: '' }, 'Invalid firmware catalog'],
    [{ ...catalog(), releases: {} }, 'Invalid firmware catalog'],
    [{ ...catalog(), releases: [null] }, 'Invalid firmware catalog release'],
    [catalog([release(), release()]), 'Duplicate firmware release tag: v1.9.0'],
  ])('rejects malformed or unsupported catalogs', async (metadata, error) => {
    stubFetch(metadata);
    await expect(fetchFirmwareVersions()).rejects.toThrow(error);
  });

  it.each([
    ['tag', ''], ['tag', 123], ['name', null], ['published_at', 'not-a-date'],
    ['prerelease', 'false'], ['assets', null],
  ])('rejects an invalid release field %s', async (field, value) => {
    stubFetch({ ...catalog(), releases: [{ ...release(), [field]: value }] });
    await expect(fetchFirmwareVersions()).rejects.toThrow('Invalid firmware catalog release');
  });

  it.each([
    ['name', ''], ['url', '/relative.bin'], ['url', 'http://example.com/app.bin'],
    ['url', 'not-a-url'], ['size', -1], ['size', 1.5], ['size', '4'],
    ['sha256', 'invalid'], ['sha256', null], ['role', undefined], ['role', 1],
  ])('rejects an invalid asset field %s', async (field, value) => {
    stubFetch({ ...catalog(), releases: [{ ...release(), assets: [{ ...publishedApp, [field]: value }] }] });
    await expect(fetchFirmwareVersions()).rejects.toThrow('Invalid firmware catalog asset for release v1.9.0');
  });

  it('rejects a truncated download', async () => {
    stubFetch(catalog(), firmwareBytes.slice(0, -1));
    await expect(getNewFirmware('v1.8.0')).rejects.toThrow('Firmware size mismatch');
  });

  it('rejects corrupted firmware of the expected size', async () => {
    stubFetch(catalog(), new Uint8Array([0, 0, 0, 0]));
    await expect(getNewFirmware('v1.8.0')).rejects.toThrow('Firmware checksum mismatch');
  });

  it.each([undefined, {}, { subtle: {} }])('rejects downloads when Web Crypto is unavailable', async (crypto) => {
    vi.stubGlobal('crypto', crypto);
    stubFetch();
    await expect(getNewFirmware('v1.8.0')).rejects.toThrow('Web Crypto is required to verify firmware');
  });

  it('propagates a digest failure instead of returning unverified bytes', async () => {
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockRejectedValue(new Error('Digest failed')) } });
    stubFetch();
    await expect(getNewFirmware('v1.8.0')).rejects.toThrow('Digest failed');
  });

  it('rejects catalog HTTP failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchFirmwareVersions()).rejects.toThrow('Failed to fetch firmware releases');
  });

  it('rejects invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); },
    }));
    await expect(fetchFirmwareVersions()).rejects.toThrow('Invalid JSON');
  });

  it('rejects binary HTTP failures', async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => catalog() })
      .mockResolvedValueOnce({ ok: false, arrayBuffer: async () => firmwareBytes.buffer });
    await expect(getNewFirmware('v1.8.0')).rejects.toThrow('Firmware download failed');
  });

  it.each(['catalog', 'binary'])('propagates %s network failures', async (stage) => {
    const fetchMock = stubFetch();
    if (stage === 'binary') fetchMock.mockResolvedValueOnce({ ok: true, json: async () => catalog() });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(getNewFirmware('v1.8.0')).rejects.toThrow('Failed to fetch');
  });
});
