import { v2 as cloudinary } from "cloudinary";

// The SDK reads CLOUDINARY_URL from the environment by itself.
const SOURCE_FOLDER = "sources";
const REEL_FOLDER = "reels";

// Params the browser needs to upload a source video straight to Cloudinary.
// Uploading directly keeps big files out of the Vercel function (4.5 MB body limit).
export function signUpload() {
  const { cloud_name, api_key, api_secret } = cloudinary.config();
  const params = {
    folder: SOURCE_FOLDER,
    timestamp: Math.floor(Date.now() / 1000),
  };
  const signature = cloudinary.utils.api_sign_request(params, api_secret);

  return { cloudName: cloud_name, apiKey: api_key, signature, ...params };
}

// Only accept source videos that our own signed upload could have produced.
// Anything else would let a caller make the server fetch arbitrary URLs (SSRF).
export function isOwnSourceUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return false;
  }

  const { cloud_name } = cloudinary.config();
  const allowedPath = new RegExp(
    `^/${cloud_name}/video/upload/(v\\d+/)?${SOURCE_FOLDER}/[\\w-]+\\.\\w+$`,
  );

  return (
    url.protocol === "https:" &&
    url.hostname === "res.cloudinary.com" &&
    !url.username &&
    !url.password &&
    allowedPath.test(url.pathname)
  );
}

// public_id = jobId, so a retried job overwrites its own reel instead of duplicating it.
export async function uploadReel(filePath, jobId) {
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: "video",
    folder: REEL_FOLDER,
    public_id: jobId,
    overwrite: true,
  });
  return result.secure_url;
}
