export type ConfettiViewport = {
  width: number;
  height: number;
};

export type ConfettiRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ConfettiOrigin = {
  x: number;
  y: number;
};

export function getConfettiOriginFromRect(
  rect: ConfettiRect,
  viewport: ConfettiViewport,
): ConfettiOrigin {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return {
    x: roundOrigin(clampOrigin(centerX / viewport.width)),
    y: roundOrigin(clampOrigin(centerY / viewport.height)),
  };
}

function clampOrigin(value: number): number {
  return Math.min(0.98, Math.max(0.02, value));
}

function roundOrigin(value: number): number {
  return Math.round(value * 100) / 100;
}
