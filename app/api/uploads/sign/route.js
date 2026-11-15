import { signUpload } from "../../../../lib/storage/cloudinary.js";
import { rateLimitResponse } from "../../../../lib/request-info.js";

export const dynamic = "force-dynamic";

// Step 1: the browser asks for permission to upload a source video to Cloudinary.
export async function POST(request) {
  const limited = await rateLimitResponse(request, "sign", 10, 3600);
  if (limited) {
    return limited;
  }
  return Response.json(signUpload());
}
