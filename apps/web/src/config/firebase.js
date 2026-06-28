import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyA7dUfNh8LxcUwUoKPi2BTQHEnH0HdokV0',
  authDomain: 'villkro-714fc.firebaseapp.com',
  projectId: 'villkro-714fc',
  storageBucket: 'villkro-714fc.firebasestorage.app',
  messagingSenderId: '957749046932',
  appId: '1:957749046932:web:bbd1e9df1d969275964e81',
  measurementId: 'G-TSPZXV1981',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { app, auth };
