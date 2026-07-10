// Firebase config for React Native (customer-app).
// Uses @react-native-firebase/auth for native phone auth (no reCAPTCHA needed).
//
// SETUP REQUIRED:
//   1. Download google-services.json from Firebase Console
//      (Project Settings -> General -> Your apps -> Android app)
//   2. Place it at apps/customer-app/google-services.json
//   3. Run: npx expo prebuild --clean
//   4. Run: npx expo run:android
//
// v22 modular API — this is an already-initialized auth instance, not a
// function. Pass it as the first arg to modular functions, e.g.
// signInWithPhoneNumber(auth, phoneNumber), getIdToken(auth.currentUser).
// See https://rnfirebase.io/migrating-to-v22

import { getAuth } from '@react-native-firebase/auth';

export const auth = getAuth();
