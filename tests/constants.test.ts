import { describe, expect, it } from 'vitest';
import {
  AUDIO_CHARACTERISTIC_UUID,
  COMMAND_CHARACTERISTIC_UUID,
  DEVICE_INFO_CHARACTERISTIC_UUID,
  FILE_CHARACTERISTIC_UUID,
  MAIN_SERVICE_UUID,
  OTA_COMMAND_CHARACTERISTIC_UUID,
  OTA_FIRMWARE_CHARACTERISTIC_UUID,
  OTA_SERVICE_UUID,
  PYTHON_CHARACTERISTIC_UUID,
  SENSOR_STREAM_CHARACTERISTIC_UUID,
  STD_OUT_CHARACTERISTIC_UUID,
  THYMIO_AUDIO_UPLOAD_PROGRESS_EVENT_ID,
  THYMIO_CONNECTED_EVENT_ID,
  THYMIO_FILE_DOWNLOAD_PROGRESS_EVENT_ID,
  THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID,
  THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID,
  THYMIO_OTHER_SENSOR_VALUES_EVENT_ID,
  THYMIO_PROMPT_MANUAL_RECONNECTION_EVENT_ID,
  THYMIO_PYTHON_EXECUTION_STATUS_EVENT_ID,
  THYMIO_PYTHON_LOAD_RESULT_EVENT_ID,
  THYMIO_SENSOR_VALUES_EVENT_ID,
  THYMIO_STD_OUT_EVENT_ID,
} from '../src/constants';

describe('Bluetooth protocol constants', () => {
  it('matches the Thymio BLE service and characteristic UUIDs', () => {
    expect(MAIN_SERVICE_UUID).toBe('0000abf0-0000-1000-8000-00805f9b34fb');
    expect(COMMAND_CHARACTERISTIC_UUID).toBe('0000abf1-0000-1000-8000-00805f9b34fb');
    expect(SENSOR_STREAM_CHARACTERISTIC_UUID).toBe('0000abf2-0000-1000-8000-00805f9b34fb');
    expect(PYTHON_CHARACTERISTIC_UUID).toBe('0000abf3-0000-1000-8000-00805f9b34fb');
    expect(AUDIO_CHARACTERISTIC_UUID).toBe('0000abf4-0000-1000-8000-00805f9b34fb');
    expect(DEVICE_INFO_CHARACTERISTIC_UUID).toBe('0000abf5-0000-1000-8000-00805f9b34fb');
    expect(FILE_CHARACTERISTIC_UUID).toBe('0000abf6-0000-1000-8000-00805f9b34fb');
    expect(STD_OUT_CHARACTERISTIC_UUID).toBe('0000abf7-0000-1000-8000-00805f9b34fb');
  });

  it('matches the OTA service and characteristic identifiers', () => {
    expect(OTA_SERVICE_UUID).toBe(0x8018);
    expect(OTA_FIRMWARE_CHARACTERISTIC_UUID).toBe(0x8020);
    expect(OTA_COMMAND_CHARACTERISTIC_UUID).toBe(0x8022);
  });

  it('keeps public DOM event names stable', () => {
    expect(THYMIO_CONNECTED_EVENT_ID).toBe('thymio-connected');
    expect(THYMIO_PROMPT_MANUAL_RECONNECTION_EVENT_ID).toBe('thymio-prompt-manual-reconnection');
    expect(THYMIO_PYTHON_EXECUTION_STATUS_EVENT_ID).toBe('thymio-python-execution-status');
    expect(THYMIO_PYTHON_LOAD_RESULT_EVENT_ID).toBe('thymio-python-load-result');
    expect(THYMIO_SENSOR_VALUES_EVENT_ID).toBe('thymio-sensor-values');
    expect(THYMIO_OTHER_SENSOR_VALUES_EVENT_ID).toBe('thymio-sensor-other-values');
    expect(THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID).toBe('thymio-ota-upload-progress');
    expect(THYMIO_AUDIO_UPLOAD_PROGRESS_EVENT_ID).toBe('thymio-audio-upload-progress');
    expect(THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID).toBe('thymio-file-upload-progress');
    expect(THYMIO_FILE_DOWNLOAD_PROGRESS_EVENT_ID).toBe('thymio-file-download-progress');
    expect(THYMIO_STD_OUT_EVENT_ID).toBe('thymio-std-out-values');
  });
});
