import { describe, expect, it, vi } from 'vitest';
import publishedRelease from './fixtures/firmware-release.json';
import {
  fetchFirmwareVersions,
  getNewFirmware,
  isNewerFirmwareAvailable,
} from '../src/updater';

const firmwareReleasesUrl = 'https://api.github.com/repos/Mobsya/thymio3-firmware-esp32/releases?per_page=100';

type ReleaseOptions = {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  created_at?: string;
  published_at?: string | null;
  assets?: Array<{
    name: string;
    browser_download_url: string;
  }>;
};

function release({
  tag_name = 'v1.9.0',
  name = `${tag_name} release`,
  body = `${tag_name} notes`,
  draft = false,
  prerelease = false,
  created_at = '2026-01-01T00:00:00Z',
  published_at = '2026-01-02T00:00:00Z',
  assets = [
    {
      name: `thymio3-${tag_name}.bin`,
      browser_download_url: downloadUrl(tag_name),
    },
  ],
}: ReleaseOptions) {
  return {
    tag_name,
    name,
    body,
    draft,
    prerelease,
    created_at,
    published_at,
    assets,
  };
}

function downloadUrl(tagName: string): string {
  return `https://github.com/Mobsya/thymio3-firmware-esp32/releases/download/${tagName}/thymio3-${tagName}.bin`;
}

function stubReleaseFetch(releases: ReturnType<typeof release>[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => releases,
  }));
}

describe('firmware updater', () => {
  it('fetches firmware release metadata from GitHub', async () => {
    const releasesResponse = [
      release({
        tag_name: 'v1.8.0',
        body: 'Old release',
        published_at: '2026-01-01T00:00:00Z',
      }),
      release({
        tag_name: 'v1.9.0',
        name: 'New release',
        body: null,
        created_at: '2026-02-01T00:00:00Z',
        published_at: null,
      }),
      release({
        tag_name: 'v2.0.0-rc.1',
        prerelease: true,
      }),
      release({
        tag_name: 'v9.0.0',
        draft: true,
      }),
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => releasesResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchFirmwareVersions()).resolves.toEqual([
      {
        version: 'v1.8.0',
        releaseDate: '2026-01-01T00:00:00Z',
        description: 'Old release',
        downloadUrl: downloadUrl('v1.8.0'),
      },
      {
        version: 'v1.9.0',
        releaseDate: '2026-02-01T00:00:00Z',
        description: 'New release',
        downloadUrl: downloadUrl('v1.9.0'),
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      firmwareReleasesUrl,
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        }),
      })
    );
  });

  it('reports whether a newer stable release is available', async () => {
    stubReleaseFetch([
      release({ tag_name: 'v1.9.0' }),
      release({ tag_name: 'v2.0.0-rc.1', prerelease: true }),
    ]);

    await expect(isNewerFirmwareAvailable('v1.8.1')).resolves.toBe(true);
    await expect(isNewerFirmwareAvailable('v1.9.0')).resolves.toBe(false);
    await expect(isNewerFirmwareAvailable('v1.9.0', { includePrereleases: true })).resolves.toBe(true);
  });

  it('downloads the latest firmware when the local version is older', async () => {
    const firmwareBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const releasesResponse = [
      release({ tag_name: 'v1.9.9' }),
      release({ tag_name: 'v1.10.0' }),
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (url === firmwareReleasesUrl) {
        return {
          ok: true,
          json: async () => releasesResponse,
        };
      }

      return {
        ok: true,
        arrayBuffer: async () => firmwareBytes.buffer,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getNewFirmware('v1.9.9')).resolves.toEqual(firmwareBytes);
    expect(fetchMock).toHaveBeenCalledWith(downloadUrl('v1.10.0'));
  });

  it('prefers the matching .bin asset when multiple application assets are present', async () => {
    const matchingDownloadUrl = downloadUrl('v1.9.0');
    const otherDownloadUrl = 'https://example.com/other-device.bin';
    const firmwareBytes = new Uint8Array([0xca, 0xfe]);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === firmwareReleasesUrl) {
        return {
          ok: true,
          json: async () => [
            release({
              tag_name: 'v1.9.0',
              assets: [
                {
                  name: 'other-device.bin',
                  browser_download_url: otherDownloadUrl,
                },
                {
                  name: 'thymio3-v1.9.0.bin',
                  browser_download_url: matchingDownloadUrl,
                },
              ],
            }),
          ],
        };
      }

      return {
        ok: true,
        arrayBuffer: async () => firmwareBytes.buffer,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getNewFirmware('v1.8.0')).resolves.toEqual(firmwareBytes);
    expect(fetchMock).toHaveBeenCalledWith(matchingDownloadUrl);
  });

  it('rejects firmware download when the local version is current', async () => {
    stubReleaseFetch([
      release({ tag_name: 'v1.9.0' }),
    ]);

    await expect(getNewFirmware('v1.9.0')).rejects.toThrow(
      'The local version v1.9.0 is the same or newer than the latest firmware version v1.9.0'
    );
  });

  it('rejects metadata fetch failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
    }));

    await expect(fetchFirmwareVersions()).rejects.toThrow('Failed to fetch firmware releases');
  });

  it('rejects releases without a .bin firmware asset', async () => {
    stubReleaseFetch([
      release({
        tag_name: 'v1.9.0',
        assets: [
          {
            name: 'release-notes.txt',
            browser_download_url: 'https://example.com/release-notes.txt',
          },
        ],
      }),
    ]);

    await expect(fetchFirmwareVersions()).rejects.toThrow(
      'No .bin firmware asset found for release v1.9.0'
    );
  });

  it('rejects ambiguous .bin firmware assets', async () => {
    stubReleaseFetch([
      release({
        tag_name: 'v1.9.0',
        assets: [
          {
            name: 'left.bin',
            browser_download_url: 'https://example.com/left.bin',
          },
          {
            name: 'right.bin',
            browser_download_url: 'https://example.com/right.bin',
          },
        ],
      }),
    ]);

    await expect(fetchFirmwareVersions()).rejects.toThrow(
      'Multiple .bin firmware assets found for release v1.9.0'
    );
  });

  it('rejects firmware download failures', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === firmwareReleasesUrl) {
        return {
          ok: true,
          json: async () => [
            release({ tag_name: 'v1.9.0' }),
          ],
        };
      }

      return {
        ok: false,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getNewFirmware('v1.8.0')).rejects.toThrow('Firmware download failed');
  });

  it('selects the application from the published v1.10.2 release', async () => {
    stubReleaseFetch([publishedRelease]);

    const versions = await fetchFirmwareVersions();
    expect(versions[0]?.downloadUrl).toBe(
      'https://github.com/Mobsya/thymio3-firmware-esp32/releases/download/v1.10.2/ESP32-2026-10-05-872e8c2-1.10.2.bin'
    );
    await expect(isNewerFirmwareAvailable('1.10.1')).resolves.toBe(true);
    await expect(isNewerFirmwareAvailable('1.10.2')).resolves.toBe(false);
    await expect(isNewerFirmwareAvailable('1.11.0')).resolves.toBe(false);
  });

  it.each(publishedRelease.assets.filter((asset) =>
    asset.name.endsWith('.bin') && asset.name !== 'ESP32-2026-10-05-872e8c2-1.10.2.bin'
  ))('never selects $name even when it is the only asset', async (asset) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubReleaseFetch([{ ...publishedRelease, assets: [asset] }]);

    await expect(fetchFirmwareVersions()).rejects.toThrow(
      'No .bin firmware asset found for release v1.10.2'
    );
  });

  it('matches .bin assets case-insensitively without a v prefix', async () => {
    stubReleaseFetch([release({
      assets: [
        { name: 'other.bin', browser_download_url: 'https://example.com/other.bin' },
        { name: 'THYMIO3-1.9.0.BIN', browser_download_url: downloadUrl('v1.9.0') },
      ],
    })]);

    await expect(fetchFirmwareVersions()).resolves.toEqual([
      expect.objectContaining({ downloadUrl: downloadUrl('v1.9.0') }),
    ]);
  });
});
