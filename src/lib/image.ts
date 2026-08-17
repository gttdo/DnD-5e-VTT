/**
 * Client-side image normalization for avatars.
 *
 * The avatar doubles as the character's VTT token, which is clipped to a circle
 * and shown small on a map — so an upload has to be square and reasonably
 * sharp. Rather than reject non-square images, we center-crop to a square and
 * downscale to a fixed size, and only reject sources that are simply too small
 * to look right as a token.
 */

/** Minimum source dimension (short edge) we'll accept for an avatar. */
export const MIN_AVATAR_PX = 200;

/** Output size of the normalized square avatar. */
export const AVATAR_OUTPUT_PX = 512;

/**
 * Center-crop `file` to a square and resize to AVATAR_OUTPUT_PX. Rejects with a
 * human-readable message if the image is too small or unreadable.
 */
export const cropToSquareAvatar = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const short = Math.min(img.naturalWidth, img.naturalHeight);
      if (short < MIN_AVATAR_PX) {
        reject(
          new Error(
            `That image is only ${img.naturalWidth}×${img.naturalHeight}px — ` +
              `avatars need at least ${MIN_AVATAR_PX}px on the short side so the ` +
              `token stays sharp.`
          )
        );
        return;
      }
      // Center square crop from the source.
      const sx = (img.naturalWidth - short) / 2;
      const sy = (img.naturalHeight - short) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_OUTPUT_PX;
      canvas.height = AVATAR_OUTPUT_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Your browser couldn't process the image."));
        return;
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, short, short, 0, 0, AVATAR_OUTPUT_PX, AVATAR_OUTPUT_PX);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the image."))),
        "image/png"
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file didn't look like a readable image."));
    };
    img.src = url;
  });
