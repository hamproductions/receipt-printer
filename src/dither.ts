import type { DitherAlgo } from './doc';

export type Tone = { brightness: number; contrast: number; gamma: number };

type Kernel = readonly (readonly [number, number, number])[];

const FLOYD: Kernel = [
  [1, 0, 7 / 16],
  [-1, 1, 3 / 16],
  [0, 1, 5 / 16],
  [1, 1, 1 / 16]
];

const ATKINSON: Kernel = [
  [1, 0, 1 / 8],
  [2, 0, 1 / 8],
  [-1, 1, 1 / 8],
  [0, 1, 1 / 8],
  [1, 1, 1 / 8],
  [0, 2, 1 / 8]
];

const STUCKI: Kernel = [
  [1, 0, 8 / 42],
  [2, 0, 4 / 42],
  [-2, 1, 2 / 42],
  [-1, 1, 4 / 42],
  [0, 1, 8 / 42],
  [1, 1, 4 / 42],
  [2, 1, 2 / 42],
  [-2, 2, 1 / 42],
  [-1, 2, 2 / 42],
  [0, 2, 4 / 42],
  [1, 2, 2 / 42],
  [2, 2, 1 / 42]
];

const JARVIS: Kernel = [
  [1, 0, 7 / 48],
  [2, 0, 5 / 48],
  [-2, 1, 3 / 48],
  [-1, 1, 5 / 48],
  [0, 1, 7 / 48],
  [1, 1, 5 / 48],
  [2, 1, 3 / 48],
  [-2, 2, 1 / 48],
  [-1, 2, 3 / 48],
  [0, 2, 5 / 48],
  [1, 2, 3 / 48],
  [2, 2, 1 / 48]
];

const SIERRA: Kernel = [
  [1, 0, 5 / 32],
  [2, 0, 3 / 32],
  [-2, 1, 2 / 32],
  [-1, 1, 4 / 32],
  [0, 1, 5 / 32],
  [1, 1, 4 / 32],
  [2, 1, 2 / 32],
  [-1, 2, 2 / 32],
  [0, 2, 3 / 32],
  [1, 2, 2 / 32]
];

const KERNELS: Partial<Record<DitherAlgo, Kernel>> = { floyd: FLOYD, atkinson: ATKINSON, stucki: STUCKI, jarvis: JARVIS, sierra: SIERRA };

const BAYER = (() => {
  const base = [
    [0, 2],
    [3, 1]
  ];
  let matrix = base;
  while (matrix.length < 8) {
    const size = matrix.length;
    const next: number[][] = Array.from({ length: size * 2 }, () => new Array<number>(size * 2).fill(0));
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const value = matrix[y][x] * 4;
        next[y][x] = value;
        next[y][x + size] = value + 2;
        next[y + size][x] = value + 3;
        next[y + size][x + size] = value + 1;
      }
    }
    matrix = next;
  }
  return matrix.map((row) => row.map((value) => ((value + 0.5) / 64) * 255));
})();

export function toGray(data: Uint8ClampedArray, tone: Tone) {
  const gray = new Float32Array(data.length / 4);
  const contrast = (259 * (tone.contrast + 255)) / (255 * (259 - tone.contrast));
  const gamma = 1 / Math.max(0.1, tone.gamma);
  for (let i = 0; i < gray.length; i += 1) {
    const alpha = data[i * 4 + 3] / 255;
    const luma = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    let value = luma * alpha + 255 * (1 - alpha);
    value = contrast * (value - 128) + 128 + tone.brightness * 2.55;
    value = 255 * Math.pow(Math.min(1, Math.max(0, value / 255)), gamma);
    gray[i] = value;
  }
  return gray;
}

export function dither(gray: Float32Array, width: number, height: number, algo: DitherAlgo, threshold = 128) {
  const black = new Uint8Array(gray.length);
  if (algo === 'threshold') {
    for (let i = 0; i < gray.length; i += 1) {
      black[i] = gray[i] < threshold ? 1 : 0;
    }
    return black;
  }
  if (algo === 'bayer') {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        black[i] = gray[i] < BAYER[y & 7][x & 7] ? 1 : 0;
      }
    }
    return black;
  }
  if (algo === 'halftone') {
    return halftone(gray, width, height);
  }
  const screen = SCREENS[algo];
  if (screen) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        black[i] = screen(x, y, 1 - gray[i] / 255) ? 1 : 0;
      }
    }
    return black;
  }
  const kernel = KERNELS[algo] ?? FLOYD;
  const buffer = Float32Array.from(gray);
  for (let y = 0; y < height; y += 1) {
    const reverse = y % 2 === 1;
    for (let step = 0; step < width; step += 1) {
      const x = reverse ? width - 1 - step : step;
      const i = y * width + x;
      const value = buffer[i];
      const isBlack = value < threshold;
      black[i] = isBlack ? 1 : 0;
      const error = value - (isBlack ? 0 : 255);
      for (const [dx, dy, weight] of kernel) {
        const nx = x + (reverse ? -dx : dx);
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny < height) {
          buffer[ny * width + nx] += error * weight;
        }
      }
    }
  }
  return black;
}

function fract(value: number) {
  return value - Math.floor(value);
}

function hash(x: number, y: number) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
}

function line(x: number, y: number, angle: number, period: number) {
  const u = (x * Math.cos(angle) + y * Math.sin(angle)) / period;
  return Math.abs(fract(u) - 0.5) * 2;
}

type Screen = (x: number, y: number, darkness: number) => boolean;

const SCREENS: Partial<Record<DitherAlgo, Screen>> = {
  grain: (x, y, darkness) => fract(52.9829189 * fract(0.06711056 * x + 0.00583715 * y)) < darkness,
  stipple: (x, y, darkness) => hash(x, y) < Math.pow(darkness, 1.4),
  engrave: (x, y, darkness) => {
    const wobble = Math.sin(y * 0.09 + Math.sin(x * 0.03) * 2) * 1.5;
    return line(x, y + wobble, Math.PI / 6, 5) < darkness * 1.1;
  },
  crosshatch: (x, y, darkness) =>
    (darkness > 0.15 && line(x, y, Math.PI / 4, 6) < 0.34) ||
    (darkness > 0.4 && line(x, y, -Math.PI / 4, 6) < 0.34) ||
    (darkness > 0.62 && line(x, y, 0, 4) < 0.5) ||
    (darkness > 0.82 && line(x, y, Math.PI / 2, 4) < 0.5)
};

function halftone(gray: Float32Array, width: number, height: number) {
  const black = new Uint8Array(gray.length);
  const cell = 6;
  const angle = Math.PI / 4;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = (x * cos + y * sin) / cell;
      const v = (-x * sin + y * cos) / cell;
      const fu = u - Math.floor(u) - 0.5;
      const fv = v - Math.floor(v) - 0.5;
      const distance = Math.sqrt(fu * fu + fv * fv) / 0.7071;
      const i = y * width + x;
      const darkness = 1 - gray[i] / 255;
      black[i] = distance < Math.sqrt(darkness) ? 1 : 0;
    }
  }
  return black;
}

export function paint(black: Uint8Array, image: ImageData, invert = false) {
  for (let i = 0; i < black.length; i += 1) {
    const value = (black[i] === 1) !== invert ? 0 : 255;
    image.data[i * 4] = value;
    image.data[i * 4 + 1] = value;
    image.data[i * 4 + 2] = value;
    image.data[i * 4 + 3] = 255;
  }
  return image;
}
