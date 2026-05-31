export interface DocumentPipWindowRequest {
  width?: number;
  height?: number;
}

export interface DocumentPipClient {
  isSupported(): boolean;
  requestWindow(options?: DocumentPipWindowRequest): Promise<Window>;
}

export function createDocumentPipClient(): DocumentPipClient {
  return {
    isSupported() {
      return typeof documentPictureInPicture !== "undefined";
    },
    requestWindow(options) {
      if (typeof documentPictureInPicture === "undefined") {
        return Promise.reject(new Error("Document PiP is unavailable"));
      }

      return documentPictureInPicture.requestWindow(options);
    },
  };
}
