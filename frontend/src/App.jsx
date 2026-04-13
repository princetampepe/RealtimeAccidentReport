// v1.0.0 - Real-time Accident Reporting System
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from "firebase/storage";
import { auth, db, storage } from "./firebase";
import "leaflet/dist/leaflet.css";

const initialForm = {
  title: "",
  description: "",
  latitude: "",
  longitude: "",
  address: "",
  locationAccuracyMeters: "",
  incidentRadiusMeters: "120",
  severity: "MEDIUM",
};

const DEFAULT_MAP_CENTER = [14.5995, 120.9842];
const MAX_MEDIA_FILES = 4;
const MAX_IMAGE_MB = 8;
const MAX_VIDEO_MB = 20;
const UPLOAD_MAX_ATTEMPTS = 3;
const DUPLICATE_RADIUS_KM = 0.6;
const DUPLICATE_WINDOW_HOURS = 6;
const ETA_SPEED_KMPH = 35;
const CLOUDINARY_CLOUD_NAME_FALLBACK =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY_FALLBACK =
  import.meta.env.VITE_CLOUDINARY_API_KEY || "";
const CLOUDINARY_SIGNATURE_ENDPOINT =
  import.meta.env.VITE_CLOUDINARY_SIGNATURE_ENDPOINT ||
  "/api/cloudinary-signature";
const CLOUDINARY_IMAGE_FOLDER =
  import.meta.env.VITE_CLOUDINARY_IMAGE_FOLDER || "accidents/images";

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetriableStorageError(code) {
  return (
    code === "storage/retry-limit-exceeded" ||
    code === "storage/unknown" ||
    code === "storage/canceled"
  );
}

function isRetriableCloudinaryStatus(status) {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

function buildMediaFileKey(file, index) {
  return `${index}:${file.name}:${file.size}`;
}

function createDraftAccidentId() {
  return doc(collection(db, "accidents")).id;
}

async function fetchCloudinarySignedParams({ folder, publicId }) {
  const response = await fetch(CLOUDINARY_SIGNATURE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder, publicId }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(
      payload?.error ||
        payload?.message ||
        "Failed to obtain Cloudinary upload signature."
    );
    error.code = "cloudinary/signature-failed";
    error.status = response.status;
    throw error;
  }

  const cloudName = payload?.cloudName || CLOUDINARY_CLOUD_NAME_FALLBACK;
  const apiKey = payload?.apiKey || CLOUDINARY_API_KEY_FALLBACK;
  const timestamp = Number(payload?.timestamp);
  const signature = payload?.signature || "";

  if (!cloudName || !apiKey || !signature || !Number.isFinite(timestamp)) {
    const error = new Error(
      "Cloudinary signature endpoint returned incomplete upload credentials."
    );
    error.code = "cloudinary/not-configured";
    error.status = 500;
    throw error;
  }

  return {
    cloudName,
    apiKey,
    signature,
    timestamp,
    folder: payload?.folder || folder || "",
    publicId: payload?.publicId || publicId || "",
  };
}

function uploadImageToCloudinaryOnce({ file, signedUpload, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${signedUpload.cloudName}/image/upload`
    );
    xhr.timeout = 60000;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress?.(percent);
    };

    xhr.onerror = () => {
      const error = new Error("Network error during Cloudinary upload.");
      error.code = "cloudinary/network-error";
      error.status = 0;
      reject(error);
    };

    xhr.ontimeout = () => {
      const error = new Error("Cloudinary upload timed out.");
      error.code = "cloudinary/timeout";
      error.status = 0;
      reject(error);
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;

      let body = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        body = {};
      }

      if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) {
        resolve({
          secureUrl: body.secure_url,
          publicId: body.public_id || null,
          assetId: body.asset_id || null,
        });
        return;
      }

      const error = new Error(
        body?.error?.message || "Cloudinary image upload failed."
      );
      error.code = "cloudinary/upload-failed";
      error.status = xhr.status;
      reject(error);
    };

    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", signedUpload.apiKey);
    formData.append("timestamp", String(signedUpload.timestamp));
    formData.append("signature", signedUpload.signature);
    if (signedUpload.folder) {
      formData.append("folder", signedUpload.folder);
    }
    if (signedUpload.publicId) {
      formData.append("public_id", signedUpload.publicId);
    }

    xhr.send(formData);
  });
}

async function uploadCloudinaryImageWithRetry({
  file,
  folder,
  publicId,
  maxAttempts = UPLOAD_MAX_ATTEMPTS,
  onAttempt,
  onProgress,
}) {
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    onAttempt?.(attempt, maxAttempts);

    try {
      const signedUpload = await fetchCloudinarySignedParams({
        folder,
        publicId,
      });

      const uploadResult = await uploadImageToCloudinaryOnce({
        file,
        signedUpload,
        onProgress,
      });

      return { ...uploadResult, attemptsUsed: attempt };
    } catch (err) {
      const code = err?.code || "";
      const status = Number(err?.status || 0);
      if (
        code === "cloudinary/not-configured" ||
        attempt >= maxAttempts ||
        !isRetriableCloudinaryStatus(status)
      ) {
        throw err;
      }

      const backoffMs = 700 * 2 ** (attempt - 1);
      await wait(backoffMs);
    }
  }

  throw new Error("Cloudinary upload failed after retries.");
}

async function uploadEvidenceFileWithRetry({
  file,
  targetPath,
  maxAttempts = UPLOAD_MAX_ATTEMPTS,
  onProgress,
  onAttempt,
}) {
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    onAttempt?.(attempt, maxAttempts);

    try {
      const targetRef = storageRef(storage, targetPath);

      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(targetRef, file, {
          contentType: file.type || undefined,
        });

        task.on(
          "state_changed",
          (snapshot) => {
            const percent = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );
            onProgress?.(percent);
          },
          (err) => reject(err),
          () => resolve()
        );
      });

      const url = await getDownloadURL(targetRef);
      return { url, attemptsUsed: attempt };
    } catch (err) {
      const code = err?.code || "";
      if (attempt >= maxAttempts || !isRetriableStorageError(code)) {
        throw err;
      }

      const backoffMs = 700 * 2 ** (attempt - 1);
      await wait(backoffMs);
    }
  }

  throw new Error("Upload failed after retries.");
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(latA, lngA, latB, lngB) {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(latB - latA);
  const deltaLng = toRadians(lngB - lngA);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function estimateEtaMinutes(distanceKm) {
  if (!Number.isFinite(distanceKm)) return null;
  return Math.max(2, Math.round((distanceKm / ETA_SPEED_KMPH) * 60 + 2));
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeTitle(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTitleSimilarityScore(firstTitle, secondTitle) {
  const firstTokens = new Set(normalizeTitle(firstTitle).split(" ").filter((token) => token.length > 2));
  const secondTokens = new Set(normalizeTitle(secondTitle).split(" ").filter((token) => token.length > 2));

  if (!firstTokens.size || !secondTokens.size) return 0;

  let common = 0;
  for (const token of firstTokens) {
    if (secondTokens.has(token)) {
      common += 1;
    }
  }

  const union = new Set([...firstTokens, ...secondTokens]).size;
  return union ? common / union : 0;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getLocationSourceLabel(source) {
  if (source === "gps") return "GPS";
  if (source === "maps-link") return "Maps Link";
  if (source === "map-click") return "Map Pin";
  return "Unknown";
}

async function reverseGeocodeCoordinates(latitude, longitude) {
  const normalized = normalizeCoordinates(latitude, longitude);
  if (!normalized) return "";

  const endpoint = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${normalized.lat}&longitude=${normalized.lng}&localityLanguage=en`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error("Address lookup failed.");
  }

  const data = await response.json();
  const values = [
    data.locality,
    data.city,
    data.principalSubdivision,
    data.countryName,
  ];

  const uniqueParts = values.filter((part, index) => part && values.indexOf(part) === index);
  return uniqueParts.join(", ");
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function validateMediaFiles(files) {
  if (!files.length) return "";
  if (files.length > MAX_MEDIA_FILES) {
    return `Attach up to ${MAX_MEDIA_FILES} files only.`;
  }

  for (const file of files) {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      return `${file.name} is not supported. Use image or video files only.`;
    }

    const maxSizeMb = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return `${file.name} exceeds ${maxSizeMb} MB.`;
    }
  }

  return "";
}

function normalizeCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  };
}

function parseCoordinatesFromText(value) {
  let input = (value || "").trim();
  try {
    input = decodeURIComponent(input);
  } catch {
    // Keep original value if URI decoding fails.
  }

  if (!input) return null;

  const directMatch = input.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (directMatch) {
    return normalizeCoordinates(directMatch[1], directMatch[2]);
  }

  const patterns = [
    /@(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|ll|query)=(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return normalizeCoordinates(match[1], match[2]);
    }
  }

  return null;
}

function getGoogleMapsLink(latitude, longitude) {
  const position = normalizeCoordinates(latitude, longitude);
  if (!position) return "";
  return `https://www.google.com/maps?q=${position.lat},${position.lng}`;
}

function LocationMapPicker({ onPick }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function MapCenterUpdater({ center }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center);
  }, [map, center]);

  return null;
}

function IncidentMiniMap({ latitude, longitude }) {
  const position = normalizeCoordinates(latitude, longitude);
  if (!position) return null;

  const center = [position.lat, position.lng];
  return (
    <div className="incident-mini-map-frame">
      <MapContainer
        center={center}
        zoom={15}
        className="incident-mini-map"
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        touchZoom={false}
        keyboard={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CircleMarker
          center={center}
          radius={8}
          pathOptions={{ color: "#ff9a66", fillColor: "#ffc95a", fillOpacity: 0.84 }}
        />
      </MapContainer>
    </div>
  );
}

function generateDispatchId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "DSP-";
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function formatDate(value) {
  if (!value) return "-";
  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function getAuthErrorMessage(err) {
  const code = err?.code || "";

  switch (code) {
    case "auth/configuration-not-found":
    case "auth/operation-not-allowed":
      return "Firebase Authentication is not configured for Email/Password. Enable it in Firebase Console -> Authentication -> Sign-in method.";
    case "auth/email-already-in-use":
      return "This email is already registered. Please log in instead.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Invalid email or password.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    default:
      return err?.message || "Authentication failed.";
  }
}

function getFirestoreErrorMessage(err) {
  const code = err?.code || "";

  switch (code) {
    case "permission-denied":
      return "Firestore denied this request. Update Firestore security rules to allow authenticated users.";
    case "failed-precondition":
      return "Firestore index/rules are not ready for this query yet.";
    case "unavailable":
      return "Firestore is temporarily unavailable. Please try again.";
    default:
      return err?.message || "Firestore request failed.";
  }
}

function getStorageErrorMessage(err) {
  const code = err?.code || "";

  switch (code) {
    case "storage/unauthorized":
      return "Storage upload denied. Update Firebase Storage rules for authenticated upload.";
    case "storage/canceled":
      return "Upload was canceled.";
    case "storage/retry-limit-exceeded":
      return "Upload timed out. Check your network and try again.";
    default:
      return err?.message || "Media upload failed.";
  }
}

function getCloudinaryErrorMessage(err) {
  const code = err?.code || "";
  const status = Number(err?.status || 0);

  if (code === "cloudinary/not-configured") {
    return "Cloudinary signed upload is not configured correctly. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in Vercel project settings.";
  }
  if (code === "cloudinary/signature-failed") {
    return (
      err?.message ||
      "Could not obtain Cloudinary upload signature from the server."
    );
  }
  if (status === 400) {
    return err?.message || "Cloudinary rejected the upload request.";
  }
  if (status === 401 || status === 403) {
    return "Cloudinary authorization failed. Verify API key/secret and signature endpoint.";
  }
  if (status === 429) {
    return "Cloudinary rate limit reached. Please retry shortly.";
  }
  if (status >= 500) {
    return "Cloudinary is temporarily unavailable. Please try again.";
  }
  return err?.message || "Cloudinary image upload failed.";
}

export default function App() {
  const [accidents, setAccidents] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [filter, setFilter] = useState("ALL");
  const [sortMode, setSortMode] = useState("NEWEST");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [user, setUser] = useState(null);
  const [dispatchId, setDispatchId] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [mapsLinkInput, setMapsLinkInput] = useState("");
  const [locationSource, setLocationSource] = useState("");
  const [draftReportId, setDraftReportId] = useState(() => createDraftAccidentId());
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedMedia, setUploadedMedia] = useState([]);
  const [allowDuplicateSubmit, setAllowDuplicateSubmit] = useState(false);
  const [uploadProgressMap, setUploadProgressMap] = useState({});
  const [uploadAttemptMap, setUploadAttemptMap] = useState({});
  const [uploadStatusMessage, setUploadStatusMessage] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [instantUploadBusy, setInstantUploadBusy] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressHint, setAddressHint] = useState("");
  const [operatorLocLoading, setOperatorLocLoading] = useState(false);
  const [operatorLocation, setOperatorLocation] = useState(null);
  const [error, setError] = useState("");

  const geocodeRequestIdRef = useRef(0);
  const mediaInputRef = useRef(null);
  const cameraPhotoInputRef = useRef(null);
  const cameraVideoInputRef = useRef(null);
  const liveVideoRef = useRef(null);
  const liveStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState("photo");
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraRecording, setCameraRecording] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const selectedPosition = useMemo(() => {
    const normalized = normalizeCoordinates(form.latitude, form.longitude);
    if (!normalized) return null;
    return [normalized.lat, normalized.lng];
  }, [form.latitude, form.longitude]);

  const overallUploadProgress = useMemo(() => {
    const progressValues = Object.values(uploadProgressMap);
    if (!progressValues.length) return 0;

    const total = progressValues.reduce((sum, value) => sum + Number(value || 0), 0);
    return Math.round(total / progressValues.length);
  }, [uploadProgressMap]);

  const mapCenter = selectedPosition || DEFAULT_MAP_CENTER;

  const accidentsWithMeta = useMemo(
    () =>
      accidents.map((item) => {
        const normalized = normalizeCoordinates(item.latitude, item.longitude);
        const distanceKm =
          operatorLocation && normalized
            ? getDistanceKm(operatorLocation.lat, operatorLocation.lng, normalized.lat, normalized.lng)
            : null;

        return {
          ...item,
          reportedAtMs: toMillis(item.reportedAt),
          distanceKm,
          etaMinutes: distanceKm == null ? null : estimateEtaMinutes(distanceKm),
        };
      }),
    [accidents, operatorLocation]
  );

  const visibleAccidents = useMemo(() => {
    const next =
      filter === "ALL"
        ? [...accidentsWithMeta]
        : accidentsWithMeta.filter((item) => item.severity === filter);

    if (sortMode === "NEAREST" && operatorLocation) {
      next.sort((first, second) => (first.distanceKm ?? Number.POSITIVE_INFINITY) - (second.distanceKm ?? Number.POSITIVE_INFINITY));
      return next;
    }

    next.sort((first, second) => second.reportedAtMs - first.reportedAtMs);
    return next;
  }, [accidentsWithMeta, filter, sortMode, operatorLocation]);

  const duplicateCandidates = useMemo(() => {
    if (!selectedPosition) return [];

    const normalizedDraftTitle = normalizeTitle(form.title);
    const now = Date.now();

    return accidents
      .map((item) => {
        const normalized = normalizeCoordinates(item.latitude, item.longitude);
        if (!normalized) return null;

        const reportedAtMs = toMillis(item.reportedAt);
        const hoursAgo = reportedAtMs
          ? (now - reportedAtMs) / (1000 * 60 * 60)
          : Number.POSITIVE_INFINITY;
        const distanceKm = getDistanceKm(
          selectedPosition[0],
          selectedPosition[1],
          normalized.lat,
          normalized.lng
        );
        const existingTitle = item.title || "";
        const normalizedExistingTitle = normalizeTitle(existingTitle);
        const titleSimilarity = getTitleSimilarityScore(normalizedDraftTitle, normalizedExistingTitle);

        return {
          ...item,
          hoursAgo,
          distanceKm,
          titleSimilarity,
          normalizedExistingTitle,
        };
      })
      .filter(Boolean)
      .filter((item) => item.status !== "RESOLVED")
      .filter((item) => item.hoursAgo <= DUPLICATE_WINDOW_HOURS)
      .filter((item) => item.distanceKm <= DUPLICATE_RADIUS_KM)
      .filter((item) => {
        if (!normalizedDraftTitle || normalizedDraftTitle.length < 3) {
          return true;
        }

        const existingTitleContainsDraft =
          !!item.normalizedExistingTitle &&
          item.normalizedExistingTitle.includes(normalizedDraftTitle);
        const draftContainsExistingTitle =
          !!item.normalizedExistingTitle &&
          normalizedDraftTitle.includes(item.normalizedExistingTitle);

        return (
          item.titleSimilarity >= 0.24 ||
          existingTitleContainsDraft ||
          draftContainsExistingTitle
        );
      })
      .sort((first, second) => first.distanceKm - second.distanceKm)
      .slice(0, 3);
  }, [accidents, selectedPosition, form.title]);

  useEffect(() => {
    if (!duplicateCandidates.length) {
      setAllowDuplicateSubmit(false);
    }
  }, [duplicateCandidates.length]);

  const stats = useMemo(() => {
    const total = accidents.length;
    const active = accidents.filter((item) => item.status === "ACTIVE").length;
    const critical = accidents.filter((item) => item.severity === "CRITICAL").length;
    const high = accidents.filter((item) => item.severity === "HIGH").length;
    return { total, active, critical, high };
  }, [accidents]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", nextUser.uid));
          if (userDoc.exists()) {
            setDispatchId(userDoc.data().dispatchId);
          } else {
            setDispatchId(null);
          }
        } catch (err) {
          console.error("Error fetching dispatch ID:", err);
          setDispatchId(null);
        }
      } else {
        setDispatchId(null);
      }
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setAccidents([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    const accidentsQuery = query(
      collection(db, "accidents"),
      orderBy("reportedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      accidentsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        setAccidents(items);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  async function handleAuth(event) {
    event.preventDefault();
    setAuthLoading(true);
    setError("");

    try {
      if (authMode === "signup") {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const newDispatchId = generateDispatchId();
        await setDoc(doc(db, "users", userCred.user.uid), {
          email: userCred.user.email,
          dispatchId: newDispatchId,
          createdAt: serverTimestamp(),
        });
        setDispatchId(newDispatchId);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setAuthLoading(false);
    }
  }

  async function uploadSingleEvidenceFile({
    file,
    reportId,
    fileKey,
    itemNumber,
    itemTotal,
  }) {
    const safeName = sanitizeFileName(file.name);
    const uploadTimestamp = Date.now();

    setUploadStatusMessage(`Uploading evidence ${itemNumber}/${itemTotal}`);

    if (file.type.startsWith("image/")) {
      const imagePublicId = `${reportId}-${uploadTimestamp}-${itemNumber}-${safeName.replace(/\.[^/.]+$/, "")}`;
      const cloudinaryResult = await uploadCloudinaryImageWithRetry({
        file,
        folder: CLOUDINARY_IMAGE_FOLDER,
        publicId: imagePublicId,
        maxAttempts: UPLOAD_MAX_ATTEMPTS,
        onAttempt: (attempt, max) => {
          setUploadAttemptMap((prev) => ({
            ...prev,
            [fileKey]: { attempt, max },
          }));
        },
        onProgress: (percent) => {
          setUploadProgressMap((prev) => ({
            ...prev,
            [fileKey]: percent,
          }));
        },
      });

      return {
        url: cloudinaryResult.secureUrl,
        name: file.name,
        storagePath: null,
        cloudinaryPublicId: cloudinaryResult.publicId,
        cloudinaryAssetId: cloudinaryResult.assetId,
        provider: "cloudinary",
        type: "image",
        contentType: file.type || "",
        size: file.size,
        attemptsUsed: cloudinaryResult.attemptsUsed,
      };
    }

    const path = `accidents/${reportId}/${uploadTimestamp}-${itemNumber}-${safeName}`;

    const { url, attemptsUsed } = await uploadEvidenceFileWithRetry({
      file,
      targetPath: path,
      maxAttempts: UPLOAD_MAX_ATTEMPTS,
      onAttempt: (attempt, max) => {
        setUploadAttemptMap((prev) => ({
          ...prev,
          [fileKey]: { attempt, max },
        }));
      },
      onProgress: (percent) => {
        setUploadProgressMap((prev) => ({
          ...prev,
          [fileKey]: percent,
        }));
      },
    });

    return {
      url,
      name: file.name,
      storagePath: path,
      cloudinaryPublicId: null,
      cloudinaryAssetId: null,
      provider: "firebase-storage",
      type: file.type.startsWith("video/") ? "video" : "image",
      contentType: file.type || "",
      size: file.size,
      attemptsUsed,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!user || !dispatchId) {
      setError("Please sign in first.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const position = normalizeCoordinates(form.latitude, form.longitude);
      if (!position) {
        setError("Please choose a valid accident location from the map.");
        setSubmitting(false);
        return;
      }

      const radiusMeters = Number(form.incidentRadiusMeters);
      if (!Number.isFinite(radiusMeters) || radiusMeters < 10 || radiusMeters > 5000) {
        setError("Incident radius must be between 10 and 5000 meters.");
        setSubmitting(false);
        return;
      }

      if (instantUploadBusy) {
        setError("Please wait for camera auto-upload to finish before submitting.");
        setSubmitting(false);
        return;
      }

      const totalAttachmentCount = uploadedMedia.length + selectedFiles.length;
      if (totalAttachmentCount > MAX_MEDIA_FILES) {
        setError(`Attach up to ${MAX_MEDIA_FILES} files only.`);
        setSubmitting(false);
        return;
      }

      const mediaValidationError = validateMediaFiles(selectedFiles);
      if (mediaValidationError) {
        setError(mediaValidationError);
        setSubmitting(false);
        return;
      }

      if (duplicateCandidates.length > 0 && !allowDuplicateSubmit) {
        setError("Potential duplicate detected. Confirm override to submit this report.");
        setSubmitting(false);
        return;
      }

      setUploadProgressMap({});
      setUploadAttemptMap({});
      setUploadStatusMessage(
        selectedFiles.length ? "Preparing evidence upload..." : ""
      );

      const reportId = draftReportId || createDraftAccidentId();
      const accidentRef = doc(db, "accidents", reportId);

      const queuedMediaAttachments = await Promise.all(
        selectedFiles.map(async (file, index) => {
          const fileKey = buildMediaFileKey(file, index);
          return uploadSingleEvidenceFile({
            file,
            reportId,
            fileKey,
            itemNumber: uploadedMedia.length + index + 1,
            itemTotal: totalAttachmentCount,
          });
        })
      );

      const mediaAttachments = [...uploadedMedia, ...queuedMediaAttachments];

      await setDoc(accidentRef, {
        dispatchId: dispatchId,
        reporterId: user.uid,
        reporterEmail: user.email || "",
        title: form.title.trim(),
        description: form.description.trim(),
        latitude: position.lat,
        longitude: position.lng,
        address: form.address.trim() || null,
        locationSource: locationSource || null,
        locationAccuracyMeters: form.locationAccuracyMeters
          ? Number(form.locationAccuracyMeters)
          : null,
        incidentRadiusMeters: radiusMeters,
        googleMapsUrl: getGoogleMapsLink(position.lat, position.lng),
        severity: form.severity,
        status: "ACTIVE",
        mediaAttachments,
        duplicateOverrideUsed: allowDuplicateSubmit && duplicateCandidates.length > 0,
        duplicateReferenceIds: allowDuplicateSubmit
          ? duplicateCandidates.map((item) => item.id)
          : [],
        responseCount: 0,
        reportedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setForm(initialForm);
      setMapsLinkInput("");
      setLocationSource("");
      setAllowDuplicateSubmit(false);
      setAddressHint("");
      setSelectedFiles([]);
      setUploadedMedia([]);
      setUploadProgressMap({});
      setUploadAttemptMap({});
      setUploadStatusMessage("");
      setInstantUploadBusy(false);
      setDraftReportId(createDraftAccidentId());
      if (mediaInputRef.current) {
        mediaInputRef.current.value = "";
      }
      if (cameraPhotoInputRef.current) {
        cameraPhotoInputRef.current.value = "";
      }
      if (cameraVideoInputRef.current) {
        cameraVideoInputRef.current.value = "";
      }
    } catch (err) {
      if ((err?.code || "").startsWith("storage/")) {
        setError(getStorageErrorMessage(err));
        setUploadStatusMessage("Evidence upload failed. You can submit again to retry.");
      } else if ((err?.code || "").startsWith("cloudinary/")) {
        setError(getCloudinaryErrorMessage(err));
        setUploadStatusMessage("Image upload failed. You can submit again to retry.");
      } else {
        setError(getFirestoreErrorMessage(err));
        setUploadStatusMessage("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resolveAddressForLocation(latitude, longitude) {
    const requestId = geocodeRequestIdRef.current + 1;
    geocodeRequestIdRef.current = requestId;
    setAddressLoading(true);
    setAddressHint("");

    try {
      const nextAddress = await reverseGeocodeCoordinates(latitude, longitude);
      if (requestId !== geocodeRequestIdRef.current) return;

      if (nextAddress) {
        setForm((prev) => ({ ...prev, address: nextAddress }));
        setAddressHint("Address auto-filled from selected map point.");
      } else {
        setAddressHint("Coordinates saved. Address lookup returned no result.");
      }
    } catch {
      if (requestId !== geocodeRequestIdRef.current) return;
      setAddressHint("Coordinates saved. Address lookup is currently unavailable.");
    } finally {
      if (requestId === geocodeRequestIdRef.current) {
        setAddressLoading(false);
      }
    }
  }

  function setSelectedLocation(latitude, longitude, options = {}) {
    const normalized = normalizeCoordinates(latitude, longitude);
    if (!normalized) {
      setError("Could not determine a valid location. Please try again.");
      return false;
    }

    const accuracyValue = Number(options.accuracyMeters);

    setForm((prev) => ({
      ...prev,
      latitude: String(normalized.lat),
      longitude: String(normalized.lng),
      locationAccuracyMeters: Number.isFinite(accuracyValue)
        ? String(Math.round(accuracyValue))
        : "",
    }));
    setLocationSource(options.source || "map-click");
    setError("");
    resolveAddressForLocation(normalized.lat, normalized.lng);
    return true;
  }

  function handleMapsLinkUse() {
    const parsed = parseCoordinatesFromText(mapsLinkInput);
    if (!parsed) {
      setError("Could not read coordinates from that Google Maps link.");
      return;
    }
    setSelectedLocation(parsed.lat, parsed.lng, { source: "maps-link" });
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSelectedLocation(position.coords.latitude, position.coords.longitude, {
          source: "gps",
          accuracyMeters: position.coords.accuracy,
        });
        setGeoLoading(false);
      },
      () => {
        setError("Location access failed. Allow location permission and try again.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  function locateDispatcherForNearestSort() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }

    setOperatorLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOperatorLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: Math.round(position.coords.accuracy),
        });
        setSortMode("NEAREST");
        setOperatorLocLoading(false);
      },
      () => {
        setError("Could not access your location for nearest sorting.");
        setOperatorLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  function stopCameraTracks() {
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((track) => track.stop());
      liveStreamRef.current = null;
    }

    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  }

  async function openLiveCamera(mode) {
    setCameraError("");
    setCameraMode(mode);
    setCameraReady(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Live camera is not supported by this browser. Falling back to file picker.");
      if (mode === "photo") {
        cameraPhotoInputRef.current?.click();
      } else {
        cameraVideoInputRef.current?.click();
      }
      return;
    }

    setCameraStarting(true);
    try {
      const isMobileDevice =
        /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: isMobileDevice ? "environment" : "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: mode === "video",
      });

      liveStreamRef.current = stream;
      setCameraOpen(true);

      if (liveVideoRef.current) {
        const video = liveVideoRef.current;
        video.srcObject = stream;
        video.muted = true;

        const ready = await new Promise((resolve) => {
          let resolved = false;

          const complete = (value) => {
            if (resolved) return;
            resolved = true;
            video.removeEventListener("loadedmetadata", onReady);
            video.removeEventListener("canplay", onReady);
            resolve(value);
          };

          const onReady = () => complete(true);
          video.addEventListener("loadedmetadata", onReady, { once: true });
          video.addEventListener("canplay", onReady, { once: true });

          video
            .play()
            .then(() => complete(true))
            .catch(() => {
              // Some browsers still need explicit user interaction before play resolves.
            });

          setTimeout(() => complete(video.videoWidth > 0 && video.videoHeight > 0), 4500);
        });

        if (!ready) {
          setCameraError("Camera stream is warming up. Try capture again in a second.");
        }

        setCameraReady(true);
      }
    } catch {
      setCameraError("Camera access failed. Allow camera permission and try again.");
      if (mode === "photo") {
        cameraPhotoInputRef.current?.click();
      } else {
        cameraVideoInputRef.current?.click();
      }
    } finally {
      setCameraStarting(false);
    }
  }

  function closeLiveCamera() {
    if (cameraRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }

    setCameraRecording(false);
    setCameraReady(false);
    setCameraOpen(false);
    stopCameraTracks();
    recordedChunksRef.current = [];
  }

  async function capturePhotoFromLiveCamera() {
    const video = liveVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("Camera is not ready yet. Please wait and try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");

    if (!context) {
      setCameraError("Could not capture photo from camera.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setCameraError("Photo capture failed. Please try again.");
      return;
    }

    const fileName = `camera-photo-${Date.now()}.jpg`;
    const file = new File([blob], fileName, { type: "image/jpeg" });

    await uploadFilesImmediately([file], "camera-photo");
    closeLiveCamera();
  }

  function startVideoRecording() {
    if (!liveStreamRef.current) {
      setCameraError("Camera stream is not available.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setCameraError("Video recording is not supported in this browser.");
      return;
    }

    recordedChunksRef.current = [];
    try {
      const recorder = new MediaRecorder(liveStreamRef.current, {
        mimeType: "video/webm",
      });

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
          if (!blob.size) {
            setCameraError("Recorded video is empty. Please try again.");
            return;
          }

          const file = new File([blob], `camera-video-${Date.now()}.webm`, {
            type: "video/webm",
          });

          await uploadFilesImmediately([file], "camera-video");
        } finally {
          closeLiveCamera();
        }
      };

      recorder.start();
      setCameraRecording(true);
      setCameraError("");
    } catch {
      setCameraError("Could not start video recording on this browser/device.");
    }
  }

  function stopVideoRecording() {
    if (mediaRecorderRef.current && cameraRecording) {
      mediaRecorderRef.current.stop();
      setCameraRecording(false);
    }
  }

  useEffect(() => {
    return () => {
      stopCameraTracks();
    };
  }, []);

  async function uploadFilesImmediately(files, sourceLabel) {
    if (!files.length) return;

    const projectedCount = uploadedMedia.length + selectedFiles.length + files.length;
    if (projectedCount > MAX_MEDIA_FILES) {
      setError(`Attach up to ${MAX_MEDIA_FILES} files only.`);
      return;
    }

    const mediaValidationError = validateMediaFiles([...selectedFiles, ...files]);
    if (mediaValidationError) {
      setError(mediaValidationError);
      return;
    }

    const reportId = draftReportId || createDraftAccidentId();
    if (!draftReportId) {
      setDraftReportId(reportId);
    }

    setError("");
    setInstantUploadBusy(true);
    setUploadProgressMap({});
    setUploadAttemptMap({});
    setUploadStatusMessage("Preparing camera auto-upload...");

    const uploadedItems = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const fileKey = buildMediaFileKey(
        file,
        `${sourceLabel}-${Date.now()}-${index}`
      );

      try {
        const attachment = await uploadSingleEvidenceFile({
          file,
          reportId,
          fileKey,
          itemNumber: index + 1,
          itemTotal: files.length,
        });

        uploadedItems.push({ ...attachment, uploadSource: sourceLabel });
      } catch (err) {
        if ((err?.code || "").startsWith("storage/")) {
          setError(getStorageErrorMessage(err));
        } else if ((err?.code || "").startsWith("cloudinary/")) {
          setError(getCloudinaryErrorMessage(err));
        } else {
          setError(err?.message || "Camera auto-upload failed.");
        }
        setUploadStatusMessage("Camera auto-upload failed. Please retry.");
        setInstantUploadBusy(false);
        return;
      }
    }

    setUploadedMedia((prev) => [...prev, ...uploadedItems]);
    setUploadStatusMessage("Camera auto-upload completed.");
    setInstantUploadBusy(false);
  }

  async function handleCameraPhotoCapture(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await uploadFilesImmediately(files, "camera-photo");
  }

  async function handleCameraVideoCapture(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await uploadFilesImmediately(files, "camera-video");
  }

  function handleMediaSelection(event) {
    const pickedFiles = Array.from(event.target.files || []);
    if (!pickedFiles.length) return;

    const merged = [...selectedFiles, ...pickedFiles];
    if (uploadedMedia.length + merged.length > MAX_MEDIA_FILES) {
      setError(`Attach up to ${MAX_MEDIA_FILES} files only.`);
      if (mediaInputRef.current) {
        mediaInputRef.current.value = "";
      }
      return;
    }

    const mediaValidationError = validateMediaFiles(merged);

    if (mediaValidationError) {
      setError(mediaValidationError);
      if (mediaInputRef.current) {
        mediaInputRef.current.value = "";
      }
      return;
    }

    setSelectedFiles(merged);
    setUploadProgressMap({});
    setUploadAttemptMap({});
    setUploadStatusMessage("");
    setError("");
    if (mediaInputRef.current) {
      mediaInputRef.current.value = "";
    }
  }

  function removeSelectedFile(index) {
    setSelectedFiles((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
    setUploadProgressMap({});
    setUploadAttemptMap({});
    setUploadStatusMessage("");
  }

  function removeUploadedMedia(index) {
    setUploadedMedia((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  async function markResolved(item) {
    setError("");
    try {
      await updateDoc(doc(db, "accidents", item.id), {
        status: "RESOLVED",
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setError(getFirestoreErrorMessage(err));
    }
  }

  async function removeAccident(id) {
    setError("");
    try {
      await deleteDoc(doc(db, "accidents", id));
    } catch (err) {
      setError(getFirestoreErrorMessage(err));
    }
  }

  async function handleLogout() {
    setError("");
    try {
      await signOut(auth);
      setDraftReportId(createDraftAccidentId());
      setSelectedFiles([]);
      setUploadedMedia([]);
      setUploadProgressMap({});
      setUploadAttemptMap({});
      setUploadStatusMessage("");
      setInstantUploadBusy(false);
    } catch (err) {
      setError(err.message);
    }
  }

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  if (!authReady) {
    return (
      <div className="app-shell">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />

        <header className="hero">
          <p className="eyebrow">Realtime Monitoring</p>
          <h1>Accident Reporting Command Center</h1>
          <p>Checking your authentication session...</p>
        </header>

        <section className="panel auth-panel">
          <h3>Loading</h3>
          <p className="empty-state">Please wait...</p>
        </section>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />

        <header className="hero">
          <p className="eyebrow">Realtime Monitoring</p>
          <h1>Accident Reporting Command Center</h1>
          <p>Log in or sign up to access the dashboard.</p>
        </header>

        <section className="panel auth-panel">
          <h3>{authMode === "signup" ? "Create Dispatcher Account" : "Dispatcher Login"}</h3>
          <form className="auth-form" onSubmit={handleAuth}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dispatcher@city.gov"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
              />
            </label>
            <button type="submit" disabled={authLoading}>
              {authLoading
                ? "Please wait..."
                : authMode === "signup"
                  ? "Sign Up"
                  : "Log In"}
            </button>
          </form>

          <p className="auth-switch">
            {authMode === "signup" ? "Already have an account?" : "Need an account?"}
            <button
              type="button"
              className="link-button"
              onClick={() => setAuthMode((prev) => (prev === "signup" ? "login" : "signup"))}
            >
              {authMode === "signup" ? "Log In" : "Sign Up"}
            </button>
          </p>

          {error && <p className="error-box">{error}</p>}
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <header className="hero">
        <p className="eyebrow">Realtime Monitoring</p>
        <h1>Accident Reporting Command Center</h1>
        <p>
          Reports are saved directly in your Firebase Firestore collection.
          Each dispatcher has a unique auto-assigned Dispatch ID.
        </p>
      </header>

      <section className="panel user-panel">
        <p>
          Logged in as <strong>{user.email}</strong>
        </p>
        <p>
          Dispatch ID: <strong>{dispatchId || "Loading..."}</strong>
        </p>
        <button type="button" onClick={handleLogout}>Log Out</button>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <h2>Total Reports</h2>
          <p>{stats.total}</p>
        </article>
        <article className="stat-card">
          <h2>Active</h2>
          <p>{stats.active}</p>
        </article>
        <article className="stat-card">
          <h2>High Severity</h2>
          <p>{stats.high}</p>
        </article>
        <article className="stat-card">
          <h2>Critical</h2>
          <p>{stats.critical}</p>
        </article>
      </section>

      <main className="layout-grid">
        <section className="panel">
          <h3>Report New Accident</h3>
          <form onSubmit={handleSubmit} className="report-form">
            <label>
              Dispatch ID
              <input value={dispatchId || ""} disabled readOnly />
            </label>

            <label>
              Title
              <input
                value={form.title}
                onChange={(e) => updateForm("title", e.target.value)}
                placeholder="Multi-vehicle collision"
                required
              />
            </label>

            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                placeholder="Brief details about the incident"
                rows={4}
                required
              />
            </label>

            <div className="location-block">
              <div className="location-block-header">
                <h4>Location</h4>
                <p>Pick on map, use your GPS, or paste a Google Maps link.</p>
              </div>

              <div className="location-controls">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={useCurrentLocation}
                  disabled={geoLoading}
                >
                  {geoLoading ? "Locating..." : "Use Current Location"}
                </button>
                <a
                  className="map-open-link"
                  href="https://www.google.com/maps"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Google Maps
                </a>
              </div>

              <div className="maps-link-row">
                <input
                  type="text"
                  value={mapsLinkInput}
                  onChange={(e) => setMapsLinkInput(e.target.value)}
                  placeholder="Paste Google Maps URL or lat,lng"
                />
                <button type="button" className="secondary-button" onClick={handleMapsLinkUse}>
                  Use Link
                </button>
              </div>

              <div className="map-frame">
                <MapContainer
                  center={mapCenter}
                  zoom={13}
                  className="report-map"
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapCenterUpdater center={mapCenter} />
                  <LocationMapPicker onPick={(latitude, longitude) => setSelectedLocation(latitude, longitude, { source: "map-click" })} />
                  {selectedPosition && (
                    <CircleMarker
                      center={selectedPosition}
                      radius={10}
                      pathOptions={{ color: "#ff9a66", fillColor: "#ffc95a", fillOpacity: 0.88 }}
                    />
                  )}
                </MapContainer>
              </div>

              <div className="inline-fields coordinates-readonly">
                <label>
                  Latitude
                  <input value={form.latitude} readOnly placeholder="Select on map" />
                </label>
                <label>
                  Longitude
                  <input value={form.longitude} readOnly placeholder="Select on map" />
                </label>
              </div>

              <p className="location-state">
                {selectedPosition
                  ? `Selected: ${selectedPosition[0]}, ${selectedPosition[1]}`
                  : "No location selected yet."}
              </p>

              <div className="inline-fields location-meta-fields">
                <label>
                  Pin Accuracy (m)
                  <input
                    type="number"
                    value={form.locationAccuracyMeters}
                    onChange={(event) => updateForm("locationAccuracyMeters", event.target.value)}
                    min={1}
                    placeholder="Auto from GPS"
                  />
                </label>
                <label>
                  Incident Radius (m)
                  <input
                    type="number"
                    value={form.incidentRadiusMeters}
                    onChange={(event) => updateForm("incidentRadiusMeters", event.target.value)}
                    min={10}
                    max={5000}
                    required
                  />
                </label>
              </div>

              <label>
                Address
                <input
                  value={form.address}
                  onChange={(event) => updateForm("address", event.target.value)}
                  placeholder={addressLoading ? "Resolving address..." : "Address will auto-fill"}
                />
              </label>

              {(addressLoading || addressHint) && (
                <p className="location-state">
                  {addressLoading ? "Resolving selected location..." : addressHint}
                </p>
              )}

              {locationSource && (
                <span className="source-pill">Source: {getLocationSourceLabel(locationSource)}</span>
              )}

              {selectedPosition && (
                <a
                  className="map-open-link"
                  href={getGoogleMapsLink(selectedPosition[0], selectedPosition[1])}
                  target="_blank"
                  rel="noreferrer"
                >
                  View selected point in Google Maps
                </a>
              )}
            </div>

            <label>
              Severity
              <select
                value={form.severity}
                onChange={(e) => updateForm("severity", e.target.value)}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </label>

            <div className="media-picker">
              <div className="location-block-header">
                <h4>Media Evidence</h4>
                <p>Attach up to 4 files. Images up to 8 MB each, videos up to 20 MB each.</p>
              </div>

              <div className="camera-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => openLiveCamera("photo")}
                  disabled={submitting || instantUploadBusy}
                >
                  {cameraStarting && cameraMode === "photo"
                    ? "Opening Camera..."
                    : "Open Camera (Auto Upload Photo)"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => openLiveCamera("video")}
                  disabled={submitting || instantUploadBusy}
                >
                  {cameraStarting && cameraMode === "video"
                    ? "Opening Camera..."
                    : "Record Video (Auto Upload)"}
                </button>
              </div>

              {cameraError && <p className="camera-error">{cameraError}</p>}

              {cameraOpen && (
                <div className="camera-live-panel">
                  <video ref={liveVideoRef} autoPlay playsInline muted className="camera-live-preview" />
                  {!cameraReady && <p className="camera-wait">Starting camera stream...</p>}
                  <div className="camera-live-actions">
                    {cameraMode === "photo" ? (
                      <button
                        type="button"
                        onClick={capturePhotoFromLiveCamera}
                        disabled={instantUploadBusy || !cameraReady}
                      >
                        Capture Photo
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={cameraRecording ? stopVideoRecording : startVideoRecording}
                        disabled={instantUploadBusy || !cameraReady}
                      >
                        {cameraRecording ? "Stop Recording" : "Start Recording"}
                      </button>
                    )}

                    <button type="button" className="secondary-button" onClick={closeLiveCamera}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <input
                ref={cameraPhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={handleCameraPhotoCapture}
              />

              <input
                ref={cameraVideoInputRef}
                type="file"
                accept="video/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={handleCameraVideoCapture}
              />

              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleMediaSelection}
              />

              {selectedFiles.length > 0 && (
                <ul className="selected-media-list">
                  {selectedFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`}>
                      <span>
                        {file.name} ({formatBytes(file.size)})
                      </span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => removeSelectedFile(index)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {uploadedMedia.length > 0 && (
                <ul className="uploaded-media-list">
                  {uploadedMedia.map((media, index) => (
                    <li key={`${media.url}-${index}`}>
                      <span>
                        {media.name} ({media.type === "video" ? "video" : "image"}, auto-uploaded)
                      </span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => removeUploadedMedia(index)}
                      >
                        Detach
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {(selectedFiles.length > 0 || uploadedMedia.length > 0) && (
                <p className="upload-policy-note">
                  Camera capture uploads immediately and attaches to this draft report. Images use Cloudinary signed uploads; videos use Firebase Storage.
                </p>
              )}

              {(submitting || instantUploadBusy) &&
                Object.keys(uploadProgressMap).length > 0 && (
                <div className="upload-progress-panel">
                  <p>
                    {uploadStatusMessage ||
                      `Uploading evidence... ${overallUploadProgress}%`}
                  </p>
                  <div className="progress-track">
                    <span
                      className="progress-bar"
                      style={{ width: `${overallUploadProgress}%` }}
                    />
                  </div>
                  <ul className="upload-item-progress-list">
                    {Object.entries(uploadProgressMap).map(([fileKey, progress]) => {
                      const attemptInfo = uploadAttemptMap[fileKey];
                      const keyParts = String(fileKey).split(":");
                      const displayName = keyParts.length > 1 ? keyParts[1] : fileKey;

                      return (
                        <li key={`${fileKey}-progress`}>
                          <span>{displayName}</span>
                          <span>
                            {progress}%
                            {attemptInfo
                              ? ` (try ${attemptInfo.attempt}/${attemptInfo.max})`
                              : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {duplicateCandidates.length > 0 && (
              <div className="duplicate-warning">
                <p>
                  Potential duplicate reports detected within {Math.round(DUPLICATE_RADIUS_KM * 1000)} meters and {DUPLICATE_WINDOW_HOURS} hours.
                </p>
                <ul>
                  {duplicateCandidates.map((candidate) => (
                    <li key={candidate.id}>
                      {candidate.title || "Untitled"} | {candidate.distanceKm.toFixed(2)} km away | {Math.max(1, Math.round(candidate.hoursAgo * 60))} minutes ago
                    </li>
                  ))}
                </ul>

                <label className="duplicate-check">
                  <input
                    type="checkbox"
                    checked={allowDuplicateSubmit}
                    onChange={(event) => setAllowDuplicateSubmit(event.target.checked)}
                  />
                  I verified this is a different incident and want to submit anyway.
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={
                submitting ||
                instantUploadBusy ||
                !user ||
                !selectedPosition ||
                (duplicateCandidates.length > 0 && !allowDuplicateSubmit)
              }
            >
              {submitting ? "Submitting..." : "Submit Report"}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Live Accident Feed</h3>
            <div className="toolbar">
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="ALL">All severity</option>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                <option value="NEWEST">Newest first</option>
                <option value="NEAREST">Nearest first</option>
              </select>
              <button
                type="button"
                className="secondary-button"
                onClick={locateDispatcherForNearestSort}
                disabled={operatorLocLoading}
              >
                {operatorLocLoading ? "Finding You..." : "Use My Location"}
              </button>
            </div>
          </div>

          {operatorLocation && (
            <p className="dispatcher-location-note">
              Nearest sort uses your current position (±{operatorLocation.accuracyMeters} m).
            </p>
          )}

          {error && <p className="error-box">{error}</p>}

          <div className="feed-list">
            {!loading && user && visibleAccidents.length === 0 && (
              <p className="empty-state">No incidents yet. Create your first report.</p>
            )}

            {visibleAccidents.map((item) => (
              <article key={item.id} className="incident-card">
                <div className="incident-top">
                  <h4>{item.title}</h4>
                  <div className="incident-labels">
                    <span className={`badge ${item.severity?.toLowerCase()}`}>
                      {item.severity || "UNKNOWN"}
                    </span>
                    {item.locationSource && (
                      <span className="source-pill">{getLocationSourceLabel(item.locationSource)}</span>
                    )}
                  </div>
                </div>
                <p>{item.description}</p>
                <p className="incident-address">{item.address || "Address unavailable"}</p>

                <IncidentMiniMap latitude={item.latitude} longitude={item.longitude} />

                <ul>
                  <li>Status: {item.status || "-"}</li>
                  <li>Reporter: {item.reporterId || "-"}</li>
                  <li>
                    Location: {item.latitude}, {item.longitude}{" "}
                    {getGoogleMapsLink(item.latitude, item.longitude) && (
                      <a
                        href={item.googleMapsUrl || getGoogleMapsLink(item.latitude, item.longitude)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open map
                      </a>
                    )}
                  </li>
                  <li>Impact Radius: {item.incidentRadiusMeters ? `${item.incidentRadiusMeters} m` : "-"}</li>
                  <li>Pin Accuracy: {item.locationAccuracyMeters ? `±${item.locationAccuracyMeters} m` : "-"}</li>
                  {item.distanceKm != null && (
                    <li>
                      Distance: {item.distanceKm.toFixed(2)} km | Estimated responder ETA: {item.etaMinutes} min
                    </li>
                  )}
                  <li>Reported: {formatDate(item.reportedAt)}</li>
                </ul>

                {Array.isArray(item.mediaAttachments) && item.mediaAttachments.length > 0 && (
                  <div className="media-grid">
                    {item.mediaAttachments.map((media, index) =>
                      media.type === "video" ? (
                        <video
                          key={`${media.url}-${index}`}
                          controls
                          preload="metadata"
                          className="media-video"
                          src={media.url}
                        />
                      ) : (
                        <a
                          key={`${media.url}-${index}`}
                          href={media.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            src={media.url}
                            alt={`Evidence ${index + 1}`}
                            className="media-image"
                            loading="lazy"
                          />
                        </a>
                      )
                    )}
                  </div>
                )}

                <div className="incident-actions">
                  <button
                    type="button"
                    onClick={() => markResolved(item)}
                    disabled={item.status === "RESOLVED"}
                  >
                    Mark Resolved
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => removeAccident(item.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
