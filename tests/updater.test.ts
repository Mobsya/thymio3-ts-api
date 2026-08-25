import { describe, expect, it, vi } from 'vitest';
import {
  fetchFirmwareVersions,
  getNewFirmware,
  isNewerFirmwareAvailable,
} from '../src/updater';

const versionsResponse = {
  firmware_versions: [
    {
      version: 'v1.8.0',
      file: 'thymio-1.8.0.bin',
      releaseDate: '2026-01-01',
      description: 'Old release',
    },
    {
      version: 'v1.9.0',
      file: 'thymio-1.9.0.bin',
      releaseDate: '2026-02-01',
      description: 'New release',
    },
  ],
};

describe('firmware updater', () => {
  it('fetches firmware version metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => versionsResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchFirmwareVersions()).resolves.toEqual(versionsResponse.firmware_versions);
  });

  it('reports whether a newer release is available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => versionsResponse,
    }));

    await expect(isNewerFirmwareAvailable('v1.8.1')).resolves.toBe(true);
    await expect(isNewerFirmwareAvailable('v1.9.0')).resolves.toBe(false);
  });

  it('downloads the latest firmware when the local version is older', async () => {
    const firmwareBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/versions.json')) {
        return {
          ok: true,
          json: async () => versionsResponse,
        };
      }

      return {
        ok: true,
        arrayBuffer: async () => firmwareBytes.buffer,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getNewFirmware('v1.8.1')).resolves.toEqual(firmwareBytes);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://mobsya.github.io/thymio-3-firmware/firmware/thymio-1.9.0.bin'
    );
  });

  it('rejects firmware download when the local version is current', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => versionsResponse,
    }));

    await expect(getNewFirmware('v1.9.0')).rejects.toThrow(
      'The local version v1.9.0 is the same or newer than the latest firmware version v1.9.0'
    );
  });

  it('rejects metadata fetch failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
    }));

    await expect(fetchFirmwareVersions()).rejects.toThrow('Failed to fetch firmware versions');
  });
});
