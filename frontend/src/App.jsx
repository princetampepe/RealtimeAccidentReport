import { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
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
import { auth, db } from "./firebase";

const initialForm = {
  title: "",
  description: "",
  latitude: "",
  longitude: "",
  severity: "MEDIUM",
};

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

export default function App() {
  const [accidents, setAccidents] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [filter, setFilter] = useState("ALL");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [user, setUser] = useState(null);
  const [dispatchId, setDispatchId] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredAccidents = useMemo(() => {
    if (filter === "ALL") return accidents;
    return accidents.filter((item) => item.severity === filter);
  }, [accidents, filter]);

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

  async function handleSubmit(event) {
    event.preventDefault();
    if (!user || !dispatchId) {
      setError("Please sign in first.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await addDoc(collection(db, "accidents"), {
        dispatchId: dispatchId,
        reporterId: user.uid,
        reporterEmail: user.email || "",
        title: form.title,
        description: form.description,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        severity: form.severity,
        status: "ACTIVE",
        responseCount: 0,
        reportedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setForm(initialForm);
    } catch (err) {
      setError(getFirestoreErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
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

            <div className="inline-fields">
              <label>
                Latitude
                <input
                  type="number"
                  step="0.000001"
                  value={form.latitude}
                  onChange={(e) => updateForm("latitude", e.target.value)}
                  required
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  step="0.000001"
                  value={form.longitude}
                  onChange={(e) => updateForm("longitude", e.target.value)}
                  required
                />
              </label>
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

            <button type="submit" disabled={submitting || !user}>
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
            </div>
          </div>

          {error && <p className="error-box">{error}</p>}

          <div className="feed-list">
            {!loading && user && filteredAccidents.length === 0 && (
              <p className="empty-state">No incidents yet. Create your first report.</p>
            )}

            {filteredAccidents.map((item) => (
              <article key={item.id} className="incident-card">
                <div className="incident-top">
                  <h4>{item.title}</h4>
                  <span className={`badge ${item.severity?.toLowerCase()}`}>
                    {item.severity || "UNKNOWN"}
                  </span>
                </div>
                <p>{item.description}</p>
                <ul>
                  <li>Status: {item.status || "-"}</li>
                  <li>Reporter: {item.reporterId || "-"}</li>
                  <li>Location: {item.latitude}, {item.longitude}</li>
                  <li>Reported: {formatDate(item.reportedAt)}</li>
                </ul>
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
