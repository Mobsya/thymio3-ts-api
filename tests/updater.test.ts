import { describe, expect, it, vi } from 'vitest';
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
      name: `thymio3-${tag_name}.bon`,
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
  return `https://github.com/Mobsya/thymio3-firmware-esp32/releases/download/${tagName}/thymio3-${tagName}.bon`;
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

  it('prefers the matching .bon asset when multiple .bon assets are present', async () => {
    const matchingDownloadUrl = downloadUrl('v1.9.0');
    const otherDownloadUrl = 'https://example.com/other-device.bon';
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
                  name: 'other-device.bon',
                  browser_download_url: otherDownloadUrl,
                },
                {
                  name: 'thymio3-v1.9.0.bon',
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

  it('rejects releases without a .bon firmware asset', async () => {
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
      'No .bon firmware asset found for release v1.9.0'
    );
  });

  it('rejects ambiguous .bon firmware assets', async () => {
    stubReleaseFetch([
      release({
        tag_name: 'v1.9.0',
        assets: [
          {
            name: 'left.bon',
            browser_download_url: 'https://example.com/left.bon',
          },
          {
            name: 'right.bon',
            browser_download_url: 'https://example.com/right.bon',
          },
        ],
      }),
    ]);

    await expect(fetchFirmwareVersions()).rejects.toThrow(
      'Multiple .bon firmware assets found for release v1.9.0'
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
});
