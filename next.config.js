const isDev = process.env.NODE_ENV !== "production";

// Next needs inline scripts for hydration, and eval only in dev. Everything else is locked
// to our own origin plus the three hosts the app really talks to.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://d2ol7oe51mr4n9.cloudfront.net https://lh3.googleusercontent.com",
  "media-src 'self' blob: https://res.cloudinary.com https://d2ol7oe51mr4n9.cloudfront.net",
  "font-src 'self' data:",
<<<<<<< HEAD
  "connect-src 'self' https://api.cloudinary.com https://res.cloudinary.com",
=======
  "connect-src 'self' https://api.cloudinary.com",
>>>>>>> c98f3fb7c1bab184f45a30a22bb8a0d7bb19c92b
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // ffmpeg ships as a native binary; keep it out of the bundle but include it in the deploy.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  outputFileTracingIncludes: {
    "/api/jobs": [
      "./node_modules/ffmpeg-static/**",
      "./node_modules/ffprobe-static/bin/linux/x64/**",
    ],
    "/api/jobs/[id]": [
      "./node_modules/ffmpeg-static/**",
      "./node_modules/ffprobe-static/bin/linux/x64/**",
    ],
    "/api/cron/recover": [
      "./node_modules/ffmpeg-static/**",
      "./node_modules/ffprobe-static/bin/linux/x64/**",
    ],
  },
};

export default nextConfig;
