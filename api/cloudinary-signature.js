import crypto from "node:crypto";

const MAX_PUBLIC_ID_LENGTH = 160;

function parseBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeFolder(input, fallback) {
  const value = (input || fallback || "").trim();
  if (!value) return "accidents/images";
  return value.replace(/\\+/g, "/").replace(/\/+$/g, "").replace(/^\/+/, "");
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
  const apiKey = process.env.CLOUDINARY_API_KEY || "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET || "";

  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(500).json({
      error:
        "Cloudinary environment variables are missing (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).",
    });
  }

  const body = parseBody(req);
  const defaultFolder = process.env.CLOUDINARY_IMAGE_FOLDER || "accidents/images";
  const allowedPrefix = process.env.CLOUDINARY_ALLOWED_FOLDER_PREFIX || "accidents/images";

  const folder = normalizeFolder(body.folder, defaultFolder);
  if (!folder.startsWith(allowedPrefix)) {
    return res.status(400).json({
      error: `Folder must start with ${allowedPrefix}.`,
    });
  }

  const requestedPublicId =
    typeof body.publicId === "string" ? body.publicId.trim() : "";

  if (requestedPublicId && requestedPublicId.length > MAX_PUBLIC_ID_LENGTH) {
    return res.status(400).json({
      error: `publicId must be ${MAX_PUBLIC_ID_LENGTH} characters or less.`,
    });
  }

  if (requestedPublicId && !/^[a-zA-Z0-9/_-]+$/.test(requestedPublicId)) {
    return res.status(400).json({
      error: "publicId contains invalid characters.",
    });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = {
    folder,
    timestamp,
  };

  if (requestedPublicId) {
    paramsToSign.public_id = requestedPublicId;
  }

  const signatureBase = Object.entries(paramsToSign)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const signature = crypto
    .createHash("sha1")
    .update(`${signatureBase}${apiSecret}`)
    .digest("hex");

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder,
    publicId: requestedPublicId || "",
  });
}
