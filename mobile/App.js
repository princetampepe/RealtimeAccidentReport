import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "./src/firebase";

const TITLE_PRESETS = [
  "Motorcycle collision",
  "Multi-vehicle collision",
  "Pedestrian hit",
  "Truck rollover",
  "Bus collision",
  "Road obstruction crash",
];

const STRUCTURED_TEMPLATE = [
  "Vehicles involved:",
  "Injuries observed:",
  "Road blockage level:",
  "Hazards:",
  "Nearest landmark:",
  "Immediate assistance needed:",
].join("\n");

const FEED_ITEMS_PER_PAGE = 8;

const INITIAL_FORM = {
  title: "",
  description: "",
  address: "",
  latitude: "",
  longitude: "",
  severity: "MEDIUM",
};

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
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

function normalizeCoordinates(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    lat: Number(latitude.toFixed(6)),
    lng: Number(longitude.toFixed(6)),
  };
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState("DISPATCHER");
  const [dispatchId, setDispatchId] = useState(null);

  const [activeTab, setActiveTab] = useState("feed");
  const [feedPage, setFeedPage] = useState(1);
  const [filter, setFilter] = useState("ALL");

  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  const [accidents, setAccidents] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [error, setError] = useState("");

  const isResponderOrAdmin = userRole === "RESPONDER" || userRole === "ADMIN";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setDispatchId(null);
        setUserRole("DISPATCHER");
        setAuthReady(true);
        return;
      }

      try {
        const profileRef = doc(db, "users", nextUser.uid);
        const profileDoc = await getDoc(profileRef);

        if (profileDoc.exists()) {
          const profile = profileDoc.data();
          setDispatchId(profile.dispatchId || null);
          setUserRole(profile.role || "DISPATCHER");
        } else {
          setDispatchId(null);
          setUserRole("DISPATCHER");
        }
      } catch (err) {
        setError(err?.message || "Failed to load profile.");
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setAccidents([]);
      setLoadingFeed(false);
      return undefined;
    }

    setLoadingFeed(true);
    const q = query(collection(db, "accidents"), orderBy("reportedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        setAccidents(records);
        setLoadingFeed(false);
      },
      (err) => {
        setError(err?.message || "Failed to load incidents.");
        setLoadingFeed(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const visibleAccidents = useMemo(() => {
    const next =
      filter === "ALL"
        ? [...accidents]
        : accidents.filter((item) => item.severity === filter);

    next.sort((a, b) => toMillis(b.reportedAt) - toMillis(a.reportedAt));
    return next;
  }, [accidents, filter]);

  const totalFeedPages = useMemo(() => {
    return Math.max(1, Math.ceil(visibleAccidents.length / FEED_ITEMS_PER_PAGE));
  }, [visibleAccidents.length]);

  const pagedAccidents = useMemo(() => {
    const start = (feedPage - 1) * FEED_ITEMS_PER_PAGE;
    return visibleAccidents.slice(start, start + FEED_ITEMS_PER_PAGE);
  }, [feedPage, visibleAccidents]);

  useEffect(() => {
    setFeedPage((prev) => Math.min(prev, totalFeedPages));
  }, [totalFeedPages]);

  const notifications = useMemo(() => {
    if (!user) return [];

    const list = [];
    for (const item of accidents) {
      if (
        item.status === "RESOLUTION_PENDING" &&
        isResponderOrAdmin &&
        item.reporterId !== user.uid
      ) {
        list.push({
          id: `${item.id}-resolution`,
          title: `Review needed: ${item.title || "Untitled"}`,
          message: "A reporter requested closure and needs responder confirmation.",
          when: item.updatedAt || item.reportedAt,
        });
      }

      if (item.status === "RESPONDED" && item.reporterId === user.uid) {
        list.push({
          id: `${item.id}-responded`,
          title: `Responder assigned: ${item.title || "Untitled"}`,
          message: "Responder acknowledged this incident.",
          when: item?.response?.respondedAt || item.updatedAt,
        });
      }
    }

    list.sort((a, b) => toMillis(b.when) - toMillis(a.when));
    return list;
  }, [accidents, isResponderOrAdmin, user]);

  const myStats = useMemo(() => {
    const mine = accidents.filter((item) => item.reporterId === user?.uid);
    return {
      total: mine.length,
      active: mine.filter((item) => item.status === "ACTIVE").length,
      responded: mine.filter((item) => item.status === "RESPONDED").length,
      pending: mine.filter((item) => item.status === "RESOLUTION_PENDING").length,
      resolved: mine.filter((item) => item.status === "RESOLVED").length,
    };
  }, [accidents, user]);

  async function handleAuth() {
    setError("");
    setAuthLoading(true);

    try {
      if (authMode === "signup") {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const generatedDispatchId = `DSP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

        await setDoc(doc(db, "users", userCred.user.uid), {
          email: userCred.user.email,
          dispatchId: generatedDispatchId,
          role: "DISPATCHER",
          createdAt: serverTimestamp(),
        });

        setDispatchId(generatedDispatchId);
        setUserRole("DISPATCHER");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }

      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err?.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function detectLocation() {
    setError("");
    setLocating(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Location permission was denied.");
        setLocating(false);
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setForm((prev) => ({
        ...prev,
        latitude: String(Number(position.coords.latitude).toFixed(6)),
        longitude: String(Number(position.coords.longitude).toFixed(6)),
      }));
    } catch (err) {
      setError(err?.message || "Could not get current location.");
    } finally {
      setLocating(false);
    }
  }

  async function submitReport() {
    if (!user || !dispatchId) {
      setError("Please sign in first.");
      return;
    }

    const position = normalizeCoordinates(form.latitude, form.longitude);
    if (!position) {
      setError("Enter a valid latitude/longitude.");
      return;
    }

    if (form.title.trim().length < 3 || form.description.trim().length < 8) {
      setError("Title/description are too short.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const reportRef = doc(collection(db, "accidents"));
      await setDoc(reportRef, {
        dispatchId,
        reporterId: user.uid,
        reporterEmail: user.email || "",
        title: form.title.trim(),
        description: form.description.trim(),
        address: form.address.trim() || null,
        latitude: position.lat,
        longitude: position.lng,
        severity: form.severity,
        status: "ACTIVE",
        responseCount: 0,
        reportedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setForm(INITIAL_FORM);
      setActiveTab("feed");
    } catch (err) {
      setError(err?.message || "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestResolution(item) {
    if (!user || item.reporterId !== user.uid || item.status !== "ACTIVE") return;

    const note = "Reporter verified scene is clear and incident is closed.";
    await updateDoc(doc(db, "accidents", item.id), {
      status: "RESOLUTION_PENDING",
      resolution: {
        note,
        requestedBy: user.uid,
        requestedByEmail: user.email || "",
        requestedAt: serverTimestamp(),
        confirmedBy: [user.uid],
        confirmationCount: 1,
        confirmationsRequired: 2,
      },
      updatedAt: serverTimestamp(),
    });
  }

  async function confirmResolution(item) {
    if (!user || !isResponderOrAdmin || item.status !== "RESOLUTION_PENDING") return;

    const confirmedBy = Array.isArray(item?.resolution?.confirmedBy)
      ? item.resolution.confirmedBy
      : [];

    if (confirmedBy.includes(user.uid)) return;

    const nextConfirmedBy = [...confirmedBy, user.uid];
    const shouldResolve = nextConfirmedBy.length >= 2;

    await updateDoc(doc(db, "accidents", item.id), {
      status: shouldResolve ? "RESOLVED" : "RESOLUTION_PENDING",
      "resolution.confirmedBy": nextConfirmedBy,
      "resolution.confirmationCount": nextConfirmedBy.length,
      "resolution.finalizedBy": shouldResolve ? user.uid : null,
      "resolution.finalizedAt": shouldResolve ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
  }

  async function markResponded(item) {
    if (!user || !isResponderOrAdmin || item.status !== "ACTIVE") return;

    await updateDoc(doc(db, "accidents", item.id), {
      status: "RESPONDED",
      response: {
        respondedBy: user.uid,
        respondedByEmail: user.email || "",
        responderRole: userRole,
        note: "Responder acknowledged and is managing the site.",
        respondedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
  }

  async function resolveFromResponder(item) {
    if (!user || !isResponderOrAdmin || item.status !== "RESPONDED") return;

    if (userRole !== "ADMIN" && item?.response?.respondedBy !== user.uid) return;

    await updateDoc(doc(db, "accidents", item.id), {
      status: "RESOLVED",
      resolution: {
        note: "Responder confirmed incident fully resolved.",
        finalizedBy: user.uid,
        finalizedByEmail: user.email || "",
        finalizedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
  }

  async function handleLogout() {
    await signOut(auth);
    setActiveTab("feed");
    setFeedPage(1);
  }

  function appendStructuredTemplate() {
    setForm((prev) => {
      if (!prev.description.trim()) {
        return { ...prev, description: STRUCTURED_TEMPLATE };
      }
      if (prev.description.includes("Vehicles involved:")) {
        return prev;
      }
      return {
        ...prev,
        description: `${prev.description.trim()}\n\n${STRUCTURED_TEMPLATE}`,
      };
    });
  }

  if (!authReady) {
    return (
      <SafeAreaView style={styles.screenCenter}>
        <ActivityIndicator color="#ffd17d" />
        <Text style={styles.mutedText}>Loading session...</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.headerBox}>
          <Text style={styles.headerTitle}>Accident Reporting Mobile</Text>
          <Text style={styles.mutedText}>Cross-platform client for iOS and Android</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>
            {authMode === "signup" ? "Create Account" : "Sign In"}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9cb1d8"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9cb1d8"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Pressable style={styles.primaryButton} onPress={handleAuth} disabled={authLoading}>
            <Text style={styles.primaryButtonText}>{authLoading ? "Please wait..." : authMode === "signup" ? "Sign Up" : "Log In"}</Text>
          </Pressable>
          <Pressable onPress={() => setAuthMode((prev) => (prev === "signup" ? "login" : "signup"))}>
            <Text style={styles.linkText}>
              {authMode === "signup" ? "Already have an account? Log In" : "Need an account? Sign Up"}
            </Text>
          </Pressable>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />

      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarTitle}>Accident Reporting Mobile</Text>
          <Text style={styles.mutedText}>{user.email} | {userRole}</Text>
          <Text style={styles.mutedText}>Dispatch ID: {dispatchId || "-"}</Text>
        </View>
        <Pressable style={styles.outlineButton} onPress={handleLogout}>
          <Text style={styles.outlineButtonText}>Log Out</Text>
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        {[
          ["report", "Report"],
          ["feed", "Feed"],
          ["notifications", `Notifications${notifications.length ? ` (${notifications.length})` : ""}`],
          ["profile", "Profile"],
        ].map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.tabButton, activeTab === key && styles.tabButtonActive]}
            onPress={() => setActiveTab(key)}
          >
            <Text style={[styles.tabButtonText, activeTab === key && styles.tabButtonTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {activeTab === "report" && (
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>New Report</Text>

            <TextInput
              style={styles.input}
              placeholder="Title"
              placeholderTextColor="#9cb1d8"
              value={form.title}
              onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))}
            />

            <View style={styles.chipWrap}>
              {TITLE_PRESETS.map((preset) => (
                <Pressable
                  key={preset}
                  style={styles.chip}
                  onPress={() => setForm((prev) => ({ ...prev, title: preset }))}
                >
                  <Text style={styles.chipText}>{preset}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              value={form.description}
              onChangeText={(value) => setForm((prev) => ({ ...prev, description: value }))}
              placeholder="Accurate details"
              placeholderTextColor="#9cb1d8"
            />

            <Pressable style={styles.outlineButton} onPress={appendStructuredTemplate}>
              <Text style={styles.outlineButtonText}>Use Structured Template</Text>
            </Pressable>

            <TextInput
              style={styles.input}
              placeholder="Address"
              placeholderTextColor="#9cb1d8"
              value={form.address}
              onChangeText={(value) => setForm((prev) => ({ ...prev, address: value }))}
            />

            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="Latitude"
                placeholderTextColor="#9cb1d8"
                value={form.latitude}
                onChangeText={(value) => setForm((prev) => ({ ...prev, latitude: value }))}
              />
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="Longitude"
                placeholderTextColor="#9cb1d8"
                value={form.longitude}
                onChangeText={(value) => setForm((prev) => ({ ...prev, longitude: value }))}
              />
            </View>

            <View style={styles.row}>
              <Pressable style={styles.outlineButton} onPress={detectLocation} disabled={locating}>
                <Text style={styles.outlineButtonText}>{locating ? "Locating..." : "Use Current Location"}</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={submitReport} disabled={submitting}>
                <Text style={styles.primaryButtonText}>{submitting ? "Submitting..." : "Submit Report"}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeTab === "feed" && (
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Live Feed</Text>

            <View style={styles.row}>
              {[
                ["ALL", "All"],
                ["LOW", "Low"],
                ["MEDIUM", "Medium"],
                ["HIGH", "High"],
                ["CRITICAL", "Critical"],
              ].map(([key, label]) => (
                <Pressable
                  key={key}
                  style={[styles.filterChip, filter === key && styles.filterChipActive]}
                  onPress={() => {
                    setFilter(key);
                    setFeedPage(1);
                  }}
                >
                  <Text style={styles.filterChipText}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {loadingFeed ? (
              <ActivityIndicator color="#ffd17d" />
            ) : (
              pagedAccidents.map((item) => (
                <View key={item.id} style={styles.incidentCard}>
                  <Text style={styles.incidentTitle}>{item.title || "Untitled"}</Text>
                  <Text style={styles.incidentMeta}>{item.severity} | {item.status || "ACTIVE"}</Text>
                  <Text style={styles.incidentText}>{item.description}</Text>
                  <Text style={styles.incidentMeta}>{item.address || "No address"}</Text>
                  <Text style={styles.incidentMeta}>Reported: {formatDate(item.reportedAt)}</Text>

                  <View style={styles.rowWrap}>
                    {item.status === "ACTIVE" && item.reporterId === user.uid ? (
                      <Pressable style={styles.smallButton} onPress={() => requestResolution(item)}>
                        <Text style={styles.smallButtonText}>Request Resolution</Text>
                      </Pressable>
                    ) : null}

                    {item.status === "ACTIVE" && isResponderOrAdmin ? (
                      <Pressable style={styles.smallOutlineButton} onPress={() => markResponded(item)}>
                        <Text style={styles.smallOutlineButtonText}>Mark Responded</Text>
                      </Pressable>
                    ) : null}

                    {item.status === "RESPONDED" && isResponderOrAdmin ? (
                      <Pressable style={styles.smallOutlineButton} onPress={() => resolveFromResponder(item)}>
                        <Text style={styles.smallOutlineButtonText}>Resolve Incident</Text>
                      </Pressable>
                    ) : null}

                    {item.status === "RESOLUTION_PENDING" && isResponderOrAdmin && item.reporterId !== user.uid ? (
                      <Pressable style={styles.smallOutlineButton} onPress={() => confirmResolution(item)}>
                        <Text style={styles.smallOutlineButtonText}>Confirm Resolution</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            )}

            {visibleAccidents.length > FEED_ITEMS_PER_PAGE ? (
              <View style={styles.paginationRow}>
                <Pressable
                  style={styles.smallOutlineButton}
                  onPress={() => setFeedPage((prev) => Math.max(1, prev - 1))}
                  disabled={feedPage <= 1}
                >
                  <Text style={styles.smallOutlineButtonText}>Previous</Text>
                </Pressable>
                <Text style={styles.mutedText}>Page {feedPage} / {totalFeedPages}</Text>
                <Pressable
                  style={styles.smallOutlineButton}
                  onPress={() => setFeedPage((prev) => Math.min(totalFeedPages, prev + 1))}
                  disabled={feedPage >= totalFeedPages}
                >
                  <Text style={styles.smallOutlineButtonText}>Next</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}

        {activeTab === "notifications" && (
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            {notifications.length === 0 ? (
              <Text style={styles.mutedText}>No notifications.</Text>
            ) : (
              notifications.map((notice) => (
                <View key={notice.id} style={styles.noticeCard}>
                  <Text style={styles.noticeTitle}>{notice.title}</Text>
                  <Text style={styles.noticeText}>{notice.message}</Text>
                  <Text style={styles.noticeDate}>{formatDate(notice.when)}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === "profile" && (
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Profile</Text>
            <Text style={styles.mutedText}>Email: {user.email}</Text>
            <Text style={styles.mutedText}>Role: {userRole}</Text>
            <Text style={styles.mutedText}>Dispatch ID: {dispatchId || "-"}</Text>
            <Text style={styles.mutedText}>My Reports: {myStats.total}</Text>
            <Text style={styles.mutedText}>Active: {myStats.active}</Text>
            <Text style={styles.mutedText}>Responded: {myStats.responded}</Text>
            <Text style={styles.mutedText}>Pending Resolution: {myStats.pending}</Text>
            <Text style={styles.mutedText}>Resolved: {myStats.resolved}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0d1930",
    paddingTop: 8,
  },
  screenCenter: {
    flex: 1,
    backgroundColor: "#0d1930",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerBox: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    color: "#f6fbff",
    fontSize: 24,
    fontWeight: "800",
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topBarTitle: {
    color: "#f6fbff",
    fontSize: 18,
    fontWeight: "800",
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#24344f",
  },
  tabButtonActive: {
    backgroundColor: "#f7be63",
  },
  tabButtonText: {
    color: "#dce9ff",
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: "#111",
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    gap: 10,
  },
  panel: {
    backgroundColor: "#152643",
    borderColor: "#304766",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    color: "#f6fbff",
    fontSize: 16,
    fontWeight: "800",
  },
  input: {
    borderColor: "#3a567f",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#1a2f53",
    color: "#f6fbff",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  halfInput: {
    flex: 1,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#496891",
    backgroundColor: "#21375d",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipText: {
    color: "#dce9ff",
    fontSize: 12,
    fontWeight: "700",
  },
  primaryButton: {
    backgroundColor: "#f7be63",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: "#111",
    textAlign: "center",
    fontWeight: "800",
  },
  outlineButton: {
    borderColor: "#4f6e99",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  outlineButtonText: {
    color: "#d8e8ff",
    textAlign: "center",
    fontWeight: "700",
  },
  smallButton: {
    backgroundColor: "#f7be63",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  smallButtonText: {
    color: "#111",
    fontWeight: "800",
    fontSize: 12,
  },
  smallOutlineButton: {
    borderColor: "#4f6e99",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  smallOutlineButtonText: {
    color: "#d8e8ff",
    fontWeight: "700",
    fontSize: 12,
  },
  linkText: {
    color: "#ffd17d",
    fontWeight: "700",
    marginTop: 4,
  },
  incidentCard: {
    borderColor: "#365276",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#10233f",
    gap: 4,
  },
  incidentTitle: {
    color: "#f6fbff",
    fontSize: 15,
    fontWeight: "800",
  },
  incidentText: {
    color: "#d5e5ff",
    fontSize: 13,
  },
  incidentMeta: {
    color: "#9fb4d8",
    fontSize: 12,
  },
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  noticeCard: {
    borderColor: "#38567f",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#122748",
    gap: 4,
  },
  noticeTitle: {
    color: "#f4f9ff",
    fontWeight: "800",
  },
  noticeText: {
    color: "#d2e2ff",
  },
  noticeDate: {
    color: "#9db4da",
    fontSize: 12,
  },
  mutedText: {
    color: "#a8bcdf",
    fontSize: 13,
  },
  errorText: {
    color: "#ffb0b0",
    fontWeight: "700",
  },
});
