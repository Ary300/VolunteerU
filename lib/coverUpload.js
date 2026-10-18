/* ==========================================================================
   coverUpload.js, a lead's own cover photo

   1. coverFileError(file) checks type and size before anything is read.
   2. downscaleCover(file) draws it on a canvas, at most 1600px wide, and
      returns a JPEG blob at quality 0.82. A 12 MP phone photo goes from
      about 4 MB to about 300 KB, and the EXIF data (GPS included) is gone.
   3. uploadCover(blob) puts it in the public Storage bucket "covers" at
      <user id>/<uuid>.jpg and returns the public URL. The listing's `cover`
      column stores that URL (migration 20261018000003_cover_storage.sql).

   Errors are thrown as { code, message } where message is a plain sentence
   the field can show as is. The raw Supabase error goes to the console.
   ========================================================================== */

import { supabase, backendConfigured } from './supabase.js';

export const COVER_BUCKET = 'covers';
export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const COVER_ACCEPT = COVER_TYPES.join(',');
export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_MAX_WIDTH = 1600;
export const COVER_QUALITY = 0.82;

/**
 * Why a picked file can't be a cover, as one sentence, or null when it can.
 * @param {File | Blob | null | undefined} file
 * @returns {string | null}
 */
export function coverFileError(file) {
  if (!file) return 'Choose a photo to upload.';
  if (!COVER_TYPES.includes(file.type)) return "That file isn't a JPEG, PNG or WebP photo. Choose one of those.";
  if (file.size > COVER_MAX_BYTES) return 'That photo is over 5 MB. Choose a smaller one.';
  if (file.size === 0) return "That file is empty. Choose another photo.";
  return null;
}

function fail(code, message, cause) {
  if (cause) console.error(`[cover] ${code}`, cause);
  const err = new Error(message);
  err.code = code;
  return err;
}

/** Decode a file to something drawImage takes, with EXIF rotation applied. */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* Safari before 17 rejects the options bag; fall through to <img>. */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Downscale a photo to a JPEG at most `maxWidth` wide. Smaller photos keep
 * their size and are re-encoded, which also strips their metadata.
 * @param {File | Blob} file
 * @param {{ maxWidth?: number, quality?: number }} [opts]
 * @returns {Promise<Blob>} image/jpeg
 */
export async function downscaleCover(file, opts = {}) {
  const maxWidth = opts.maxWidth || COVER_MAX_WIDTH;
  const quality = opts.quality || COVER_QUALITY;
  let src;
  try {
    src = await decode(file);
  } catch (e) {
    throw fail('DECODE', "That photo couldn't be opened. Try a different JPEG or PNG.", e);
  }
  const w0 = src.width || src.naturalWidth;
  const h0 = src.height || src.naturalHeight;
  if (!w0 || !h0) throw fail('DECODE', "That photo couldn't be opened. Try a different JPEG or PNG.");
  const scale = Math.min(1, maxWidth / w0);
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw fail('DECODE', "Your browser couldn't resize that photo. Try a different browser.");
  // A transparent PNG would turn black as a JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  if (typeof src.close === 'function') src.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw fail('DECODE', "Your browser couldn't resize that photo. Try a different browser.");
  return blob;
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Upload a downscaled cover and return its public URL.
 * @param {Blob} blob image/jpeg from downscaleCover
 * @returns {Promise<string>}
 */
export async function uploadCover(blob) {
  if (!backendConfigured || !supabase) throw fail('NO_BACKEND', "Photo uploads aren't working right now. Choose one of our photos instead.");
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw fail('OFFLINE', "You're offline. Check your connection and upload it again.");
  const { data, error: sessionError } = await supabase.auth.getSession();
  const uid = data && data.session && data.session.user && data.session.user.id;
  if (sessionError || !uid) throw fail('SIGNED_OUT', 'Sign in again to upload a photo.', sessionError);
  const path = `${uid}/${newId()}.jpg`;
  // An ArrayBuffer goes up as the raw body with its content type. A Blob
  // would be wrapped in multipart form data.
  const body = await blob.arrayBuffer();
  let res;
  try {
    res = await supabase.storage.from(COVER_BUCKET).upload(path, body, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  } catch (e) {
    throw fail('UPLOAD', "The photo didn't upload. Check your connection and try again.", e);
  }
  if (res.error) {
    const status = Number(res.error.statusCode || res.error.status || 0);
    if (status === 413) throw fail('TOO_BIG', 'That photo is over 5 MB. Choose a smaller one.', res.error);
    if (status === 401 || status === 403) throw fail('DENIED', 'Sign in again to upload a photo.', res.error);
    throw fail('UPLOAD', "The photo didn't upload. Check your connection and try again.", res.error);
  }
  const { data: pub } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);
  if (!pub || !pub.publicUrl) throw fail('UPLOAD', "The photo didn't upload. Try again.");
  return pub.publicUrl;
}

/**
 * Check, downscale and upload a picked file. `onPreview` gets an object URL
 * of the downscaled photo as soon as it exists, so the field can show it
 * while the upload runs; the caller revokes it.
 * @param {File} file
 * @param {{ onPreview?: (url: string) => void }} [opts]
 * @returns {Promise<string>} the public URL
 */
export async function prepareAndUploadCover(file, opts = {}) {
  const problem = coverFileError(file);
  if (problem) throw fail('FILE', problem);
  const blob = await downscaleCover(file);
  if (opts.onPreview) opts.onPreview(URL.createObjectURL(blob));
  return uploadCover(blob);
}
