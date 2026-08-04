function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function hsvToRgb(colorSensor) {
  if (!colorSensor) return null;

  const hue = ((clamp(Number(colorSensor.h), 0, 360) % 360) + 360) % 360;
  const saturation = clamp(Number(colorSensor.s), 0, 100) / 100;
  const value = clamp(Number(colorSensor.v), 0, 100) / 100;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - chroma;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = chroma;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = chroma;
  } else if (hue < 180) {
    g = chroma;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = chroma;
  } else if (hue < 300) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function colorRawToRgb(colorRaw) {
  if (!colorRaw) return null;

  return {
    r: clamp(Number(colorRaw.red), 0, 255),
    g: clamp(Number(colorRaw.green), 0, 255),
    b: clamp(Number(colorRaw.blue), 0, 255),
  };
}
