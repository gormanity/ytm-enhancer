interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
}

interface DocumentPictureInPicture extends EventTarget {
  requestWindow(
    options?: DocumentPictureInPictureOptions,
  ): Promise<Window>;
  readonly window: Window | null;
}

interface Window {
  readonly documentPictureInPicture?: DocumentPictureInPicture;
}

// eslint-disable-next-line no-var
declare var documentPictureInPicture: DocumentPictureInPicture;
