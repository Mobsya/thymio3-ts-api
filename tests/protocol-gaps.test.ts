import { describe, it } from 'vitest';

describe('documented protocol coverage gaps', () => {
  it.todo('command characteristic packets for rotation angle, clear flags, volume, behavior config, and read-sensor selection');
  it.todo('Python debug/read/return-value packet handling from the protocol document');
  it.todo('stream characteristic configurable sensor packet handling beyond the two fixed notification shapes');
  it.todo('audio save and audio download packet flows from the protocol document');
  it.todo('file erase-all acknowledgement handling and CRC validation for listing/download payloads');
});
