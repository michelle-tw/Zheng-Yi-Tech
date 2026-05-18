import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, initializeFirestore } from 'firebase/firestore';
// @ts-ignore
import firebaseConfig from '../../firebase-applet-config.json';

export const isPlaceholder = !firebaseConfig || firebaseConfig.apiKey === 'PLACEHOLDER' || !firebaseConfig.apiKey;

function getFirebaseApp() {
  if (isPlaceholder) return null;
  if (getApps().length > 0) return getApp();
  return initializeApp(firebaseConfig);
}

const app = getFirebaseApp();

export const db = app ? initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId || undefined) : null as any;
export const auth = app ? getAuth(app) : null as any;

export async function testConnection() {
  if (isPlaceholder || !db) return;
  console.log("Testing Firestore connection to database:", firebaseConfig.firestoreDatabaseId || '(default)');
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection successful!");
  } catch (error) {
    console.error("Firestore connectivity check failed:", error);
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration: the client thinks it is offline.");
    }
  }
}

if (app) testConnection();
