# Mobile App (Expo)

This is a cross-platform mobile scaffold for iOS/Android/Web that mirrors the web app workflows:

- Report incidents with title presets and structured details
- Auto-detect location and allow manual location refresh
- Live feed with pagination
- Notifications page
- Profile page
- Responder/Admin actions: mark responded and resolve

## 1) Install

```bash
cd mobile
npm install
```

## 2) Configure Firebase

Edit `mobile/app.json` and set values under `expo.extra`:

- `firebaseApiKey`
- `firebaseAuthDomain`
- `firebaseProjectId`
- `firebaseStorageBucket`
- `firebaseMessagingSenderId`
- `firebaseAppId`

## 3) Run

```bash
npm run start
```

Then press:
- `a` for Android
- `i` for iOS (macOS)
- `w` for web

## Notes

- Role defaults to `DISPATCHER` at signup.
- Assign `RESPONDER`/`ADMIN` role from trusted admin tooling.
- Deploy Firestore rules from project root after role/workflow changes.
