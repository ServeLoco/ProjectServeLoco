const { initializeApp, getApps, cert, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin SDK (firebase-admin v14+ modular API).
// Looks for the service-account JSON in order:
//   1. FIREBASE_SERVICE_ACCOUNT_PATH env var (absolute or relative to cwd)
//   2. firebase-service-account.json in apps/api/
//   3. GOOGLE_APPLICATION_CREDENTIALS (Google's default env var)

let firebaseApp;

function initFirebase() {
  if (firebaseApp) return firebaseApp;

  // If another module already initialized the default app, reuse it.
  const existing = getApps();
  if (existing.length > 0) {
    firebaseApp = existing[0];
    return firebaseApp;
  }

  const possiblePaths = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.resolve(__dirname, '../../firebase-service-account.json'),
  ].filter(Boolean);

  let serviceAccount = null;
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
      }
    } catch (_) {
      // try next
    }
  }

  if (serviceAccount) {
    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    firebaseApp = initializeApp({
      credential: applicationDefault(),
    });
  } else {
    console.warn(
      '[firebase] No service-account JSON found. Firebase Phone Auth verification will not work. ' +
      'Place firebase-service-account.json in apps/api/ or set FIREBASE_SERVICE_ACCOUNT_PATH.'
    );
    return null;
  }

  console.log('[firebase] Admin SDK initialized.');
  return firebaseApp;
}

function getFirebaseAuth() {
  const app = initFirebase();
  if (!app) return null;
  return getAuth(app);
}

module.exports = { initFirebase, getFirebaseAuth };
