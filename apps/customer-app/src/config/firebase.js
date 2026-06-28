// Firebase config for React Native (customer-app).
// Uses @react-native-firebase/auth for native phone auth (no reCAPTCHA needed).
//
// SETUP REQUIRED:
//   1. Download google-services.json from Firebase Console
//      (Project Settings -> General -> Your apps -> Android app)
//   2. Place it at apps/customer-app/google-services.json
//   3. Run: npx expo prebuild --clean
//   4. Run: npx expo run:android

import auth from '@react-native-firebase/auth';

export { auth };

