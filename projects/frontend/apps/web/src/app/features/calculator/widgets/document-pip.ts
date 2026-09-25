/** The part of the Document Picture-in-Picture API the widgets use (Chromium only, for now). */
export interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

/** The API when the browser has it — the detach button is only offered then. */
export function documentPip(): DocumentPictureInPicture | null {
  return (
    (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture })
      .documentPictureInPicture ?? null
  );
}
