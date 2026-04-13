# Real-time Accident Reporting System

A modern full-stack application for real-time accident reporting with dispatch management. Built with React, Spring Boot, and Firebase Firestore.

## Features

- 🔐 **Firebase Authentication** - Email/password sign-up and login
- 📍 **Real-time Data Sync** - Live accident feed powered by Firestore
- 🎯 **Auto Dispatch ID** - Unique, random dispatch ID assigned to each dispatcher
- 🎨 **Modern UI** - Glassmorphism design with responsive layout
- 📊 **Dashboard Analytics** - Real-time stats (total reports, active, critical)
- 🗺️ **Geolocation Support** - Latitude/longitude tracking for incidents
- 🔴 **Severity Levels** - LOW, MEDIUM, HIGH, CRITICAL classification
- 🖼️ **Cloudinary Images** - Incident photos uploaded to Cloudinary with retry support
- 📷 **Camera Auto Upload** - Capture from camera and auto-attach media before submit
- ✅ **Strict API Validation** - Server-side constraints for payload shape, geo ranges, enums, and media fields
- 🔒 **Protected Write Endpoints** - Token-authenticated POST/PUT/DELETE with owner/admin authorization checks
- 🧱 **Abuse Guardrails** - Built-in idempotency, duplicate detection, and per-actor rate limiting

## Tech Stack

### Frontend
- **React 18.3** - UI framework
- **Vite 7.1** - Fast build tool
- **Firebase SDK 12.12** - Authentication & Firestore
- **Cloudinary Upload API** - Image hosting
- **CSS** - Modern glassmorphism styling

### Backend
- **Spring Boot 3.2** - REST API framework
- **Java 25** - Latest LTS runtime
- **Maven 3.9** - Build management
- **H2 Database** - Development database

### Infrastructure
- **Firebase Auth** - User authentication
- **Cloud Firestore** - Real-time database
- **Cloudinary** - Image CDN/storage for incident photos
- **Deployed on**: Localhost (dev environment)

## Project Structure

```
realtime reporting/
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main React component
│   │   ├── firebase.js      # Firebase config & initialization
│   │   ├── styles.css       # UI styling
│   │   └── main.jsx         # Entry point
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── src/
│   │   └── main/
│   │       ├── java/com/accidentreport/
│   │       │   ├── AccidentReportingApplication.java
│   │       │   ├── controller/AccidentController.java
│   │       │   ├── service/AccidentService.java
│   │       │   ├── model/Accident.java
│   │       │   └── config/
│   │       │       ├── SecurityConfig.java
│   │       │       └── FirebaseConfig.java
│   │       └── resources/application.yml
│   └── pom.xml
└── README.md
```

## Setup Instructions

### Prerequisites
- Node.js 18+
- Java 21+
- Maven 3.9+
- Firebase project with Firestore enabled

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:5173

### Backend Setup

```bash
cd backend
mvn clean package
mvn spring-boot:run
```

Backend runs on http://localhost:8080

## Production Backend Hardening

The backend now includes these protections by default:

- Request DTO validation (`@Valid`) with consistent JSON error responses
- Unknown JSON field rejection (`fail-on-unknown-properties=true`)
- Stateless auth filter for Firebase bearer tokens
- Owner/admin authorization for update and delete
- In-memory request rate limiting for write routes
- Idempotency-key support for safe retry of report creation
- Duplicate incident guard (distance + time + title similarity)

### Security Configuration

In `backend/src/main/resources/application.yml`:

```yaml
firebase:
  enabled: false # set true in production when Firebase Admin credentials are configured

app:
  security:
    require-auth: true
```

For production, set `firebase.enabled=true` and provide Google application credentials for Firebase Admin SDK.
If you disable `require-auth`, write endpoints can be used without authentication (development only).

### Write Endpoint Requirements

- `Authorization: Bearer <firebase-id-token>` when auth is enabled
- Optional `Idempotency-Key` header on `POST /api/accidents`

### Validation/Test Coverage Added

- Service tests for defaults, idempotency, duplicate detection, and ownership checks
- Controller tests for validation failures, unknown fields, and successful create requests

### Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Email/Password** authentication
3. Create a **Firestore database** (Asia Southeast 1 region)
4. Replace Firebase config in `frontend/.env.local`:
   ```
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

5. Set Firestore security rules:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read: if request.auth.uid == userId;
         allow create: if request.auth.uid == userId;
       }
       match /accidents/{docId} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

### Cloudinary Setup (Images)

1. Create a Cloudinary account at https://cloudinary.com
2. Add these **Vercel Project Environment Variables**:
  ```
  CLOUDINARY_CLOUD_NAME=your_cloud_name
  CLOUDINARY_API_KEY=your_api_key
  CLOUDINARY_API_SECRET=your_api_secret
  CLOUDINARY_IMAGE_FOLDER=accidents/images
  ```
3. The project includes `api/cloudinary-signature.js` which signs image uploads on the server.
4. For local dev, set `frontend/.env.local`:
  ```
  VITE_CLOUDINARY_SIGNATURE_ENDPOINT=/api/cloudinary-signature
  ```
5. Restart the frontend dev server after editing env variables.

## Database Schema

### Users Collection
```json
{
  "email": "dispatcher@city.gov",
  "dispatchId": "DSP-ABC123XYZ456",
  "createdAt": "2024-04-10T10:30:00Z"
}
```

### Accidents Collection
```json
{
  "dispatchId": "DSP-ABC123XYZ456",
  "reporterId": "firebase_uid_xxx",
  "reporterEmail": "dispatcher@city.gov",
  "title": "Multi-vehicle collision",
  "description": "Traffic accident on Main St",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "severity": "CRITICAL",
  "status": "ACTIVE",
  "reportedAt": "2024-04-10T10:35:00Z",
  "updatedAt": "2024-04-10T10:35:00Z"
}
```

## How It Works

1. **User Registration**
   - Sign up with email/password
   - Firebase Auth creates user account
   - App generates unique Dispatch ID (e.g., `DSP-0AVLBRMZ8GLU`)
   - User data saved to Firestore `users` collection

2. **Report Submission**
   - Dispatcher fills out incident form with title, description, location, severity
   - Dispatch ID auto-populated from user profile
   - Report saved to Firestore `accidents` collection with real-time timestamp

3. **Real-time Feed**
   - Dashboard subscribes to accident collection
   - New reports appear instantly in live feed
   - Filter by severity level
   - Mark incidents as resolved or delete

## Features Coming Soon

- 📱 Mobile app (React Native)
- 🗺️ Interactive map view with geolocation
- 📞 Automated emergency notifications
- 📊 Advanced analytics dashboard
- 🚨 SMS/Email alerts for critical incidents
- 🔗 Integration with emergency services APIs

## Development

### Build Frontend Production
```bash
cd frontend
npm run build
```

### Run Tests (Backend)
```bash
cd backend
mvn test
```

### Code Structure
- **Frontend**: Single-page application (SPA) with real-time Firestore sync
- **Backend**: REST API (currently in-memory storage for dev; ready for production DB)
- **Authentication**: Firebase Auth handles all user verification
- **Database**: Firestore handles both users and incident data

## License

MIT

## Author

Prince Tampepe
