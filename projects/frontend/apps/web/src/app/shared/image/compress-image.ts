/**
 * Client-side image compression for screenshot uploads (issue #110). Downscales to a max dimension
 * and re-encodes to WebP so the bytea we store stays small, without any backend dependency.
 *
 * Fail-soft : anything unexpected (not an image, canvas unavailable, WebP unsupported, or the result
 * ends up larger than the source) returns the **original** file untouched. So the caller can always
 * upload whatever this returns.
 */
const MAX_DIMENSION = 1600;
const QUALITY = 0.8;

export async function compressImage(file: File): Promise<File> {
  if (typeof document === 'undefined' || !file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await canvasToBlob(canvas, 'image/webp', QUALITY);
    // No blob (WebP unsupported) or no size win → keep the original.
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp' });
  } catch {
    return file;
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}
