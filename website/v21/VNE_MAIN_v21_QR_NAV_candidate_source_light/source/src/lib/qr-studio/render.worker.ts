import { createArtwork } from "./core";
self.onmessage = (event) => {
  try {
    self.postMessage({
      art: createArtwork(
        event.data.text,
        event.data.pattern,
        event.data.passAccess,
        event.data.engineVersion,
      ),
      error: "",
    });
  } catch (error) {
    self.postMessage({
      art: null,
      error: error instanceof Error ? error.message : "Не удалось построить QR.",
    });
  }
};
