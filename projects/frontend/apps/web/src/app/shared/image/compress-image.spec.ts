import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { compressImage } from './compress-image';

/**
 * Pins [compressImage] (#110), the step every screenshot goes through before upload :
 *
 *  - **The longest side stops at 1600 px**, the ratio is kept, and a smaller image is never blown up.
 *  - **The result is a WebP** named after the source, at quality 0.8.
 *  - **It fails soft** : not an image, no canvas context, no WebP, no size win or a decoding error
 *    all hand back the original, so the caller can upload whatever comes out.
 *
 * jsdom has neither `createImageBitmap` nor a working canvas : both are doubles here, so these tests
 * pin the sizing and the fallbacks, not the actual encoding.
 */
describe('compressImage', () => {
  const SOURCE_SIZE = 1000;

  let drawImage: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;
  let createImageBitmapDouble: ReturnType<typeof vi.fn>;
  let toBlob: ReturnType<typeof vi.fn>;
  let getContext: ReturnType<typeof vi.fn>;

  function makeScreenshot(name = 'capture-gus.png', type = 'image/png'): File {
    return new File(['x'.repeat(SOURCE_SIZE)], name, { type });
  }

  function makeBlob(size: number): Blob {
    return new Blob(['x'.repeat(size)], { type: 'image/webp' });
  }

  function givenBitmap(width: number, height: number): void {
    createImageBitmapDouble.mockResolvedValue({ width, height, close });
  }

  function givenEncoded(blob: Blob | null): void {
    toBlob.mockImplementation((callback: BlobCallback) => callback(blob));
  }

  beforeEach(() => {
    drawImage = vi.fn();
    close = vi.fn();
    createImageBitmapDouble = vi.fn();
    toBlob = vi.fn();
    getContext = vi.fn(() => ({ drawImage }));

    vi.stubGlobal('createImageBitmap', createImageBitmapDouble);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      getContext as unknown as HTMLCanvasElement['getContext'],
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      toBlob as unknown as HTMLCanvasElement['toBlob'],
    );

    givenBitmap(800, 600);
    givenEncoded(makeBlob(100));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('brings the longest side down to 1600 px and keeps the ratio', async () => {
    givenBitmap(3200, 1800);

    await compressImage(makeScreenshot());

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 900);
  });

  it('scales on the height when the image is taller than it is wide', async () => {
    givenBitmap(1800, 3200);

    await compressImage(makeScreenshot());

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 900, 1600);
  });

  it('never blows up an image already under the limit', async () => {
    givenBitmap(800, 600);

    await compressImage(makeScreenshot());

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600);
  });

  it('asks for a WebP at quality 0.8', async () => {
    await compressImage(makeScreenshot());

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.8);
  });

  it('returns a WebP named after the source, only its last extension replaced', async () => {
    const compressed = await compressImage(makeScreenshot('capture.gus.png'));

    expect(compressed.name).toBe('capture.gus.webp');
    expect(compressed.type).toBe('image/webp');
    expect(compressed.size).toBe(100);
  });

  it('releases the bitmap once it is drawn', async () => {
    await compressImage(makeScreenshot());

    expect(close).toHaveBeenCalledOnce();
  });

  it('leaves a file that is not an image alone, without decoding it', async () => {
    const pdf = makeScreenshot('releve.pdf', 'application/pdf');

    expect(await compressImage(pdf)).toBe(pdf);
    expect(createImageBitmapDouble).not.toHaveBeenCalled();
  });

  it('keeps the original when the canvas has no context, and still releases the bitmap', async () => {
    getContext.mockReturnValue(null);
    const screenshot = makeScreenshot();

    expect(await compressImage(screenshot)).toBe(screenshot);
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the original when the browser cannot encode WebP', async () => {
    givenEncoded(null);
    const screenshot = makeScreenshot();

    expect(await compressImage(screenshot)).toBe(screenshot);
  });

  it('keeps the original when the WebP comes out larger', async () => {
    givenEncoded(makeBlob(SOURCE_SIZE + 1));
    const screenshot = makeScreenshot();

    expect(await compressImage(screenshot)).toBe(screenshot);
  });

  it('keeps the original when the WebP saves nothing', async () => {
    givenEncoded(makeBlob(SOURCE_SIZE));
    const screenshot = makeScreenshot();

    expect(await compressImage(screenshot)).toBe(screenshot);
  });

  it('keeps the original when the image cannot be decoded', async () => {
    createImageBitmapDouble.mockRejectedValue(new DOMException('corrupt', 'InvalidStateError'));
    const screenshot = makeScreenshot();

    expect(await compressImage(screenshot)).toBe(screenshot);
  });
});
