import { supabase } from "./supabase";

/**
 * Art handouts (#0042 follow-up) — the picture a DM reveals to the party.
 * Two ways to get the image: upload a file, or generate one from a prompt via
 * the shared generate-image edge function. Both return a public URL that goes
 * on the handout's meta.image and rides the Share/Present pipeline for free.
 */

export type ArtAspect = "portrait" | "landscape" | "square";

const SIZE: Record<ArtAspect, "1024x1024" | "1536x1024" | "1024x1536"> = {
  portrait: "1024x1536",
  landscape: "1536x1024",
  square: "1024x1024",
};

/**
 * generate-image collapses non-2xx into an opaque message; the real reason is
 * in the response body on `.context`. Dig it out so failures say why.
 */
const edgeErrorMessage = async (error: { message?: string; context?: unknown }): Promise<string> => {
  const ctx = error.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = await (ctx as Response).clone().json();
      if (body && typeof body.error === "string") return body.error;
    } catch {
      /* not JSON — fall through */
    }
  }
  return error.message ?? "The image service failed.";
};

/** Generate an illustration from a prompt; returns the stored public URL. */
export const generateArt = async (prompt: string, aspect: ArtAspect = "portrait"): Promise<string> => {
  const framed =
    aspect === "portrait"
      ? `Fantasy character illustration, painterly digital art, full figure or portrait, dramatic lighting. ${prompt}`
      : aspect === "landscape"
        ? `Fantasy scene illustration, painterly digital art, cinematic wide composition, atmospheric lighting. ${prompt}`
        : `Fantasy illustration, painterly digital art, centered subject. ${prompt}`;
  const { data, error } = await supabase.functions.invoke("generate-image", {
    body: { prompt: framed, size: SIZE[aspect], quality: "high" },
  });
  if (error) throw new Error(await edgeErrorMessage(error));
  const payload = data as { image_url?: string; error?: string };
  if (payload.error) throw new Error(payload.error);
  if (!payload.image_url) throw new Error("No image was returned.");
  return payload.image_url;
};

/** Upload an image file to storage; returns its public URL. */
export const uploadArt = async (file: File, gameId: string): Promise<string> => {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `handout-art/${gameId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("map-images").upload(path, file, {
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) {
    throw new Error(
      error.message.toLowerCase().includes("row-level security")
        ? "Uploads aren't enabled — check the map-images bucket policy."
        : `Upload failed: ${error.message}`
    );
  }
  const { data } = supabase.storage.from("map-images").getPublicUrl(path);
  return data.publicUrl;
};
