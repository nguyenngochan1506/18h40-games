export function sceneStage(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new RangeError('Invalid viewport');
  if (width < 900) return null;
  const stageWidth = Math.min(width, height * 16 / 9);
  const stageHeight = stageWidth * 9 / 16;
  return { width: stageWidth, height: stageHeight, left: (width - stageWidth) / 2, top: (height - stageHeight) / 2 };
}
