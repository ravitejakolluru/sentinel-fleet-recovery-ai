import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, getRedirectResult, onAuthStateChanged, setPersistence, browserLocalPersistence, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, updateProfile } from 'firebase/auth'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Object.values(config).every(Boolean)
const firebaseApp = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null
export const auth = firebaseApp ? getAuth(firebaseApp) : null
const googleProvider = new GoogleAuthProvider()

export const authErrorMessage = (error) => {
  if (error?.code === 'auth/unauthorized-domain') return `This application host (${window.location.hostname}) is not authorized for Google Sign-In. Add this domain to Firebase Authentication Authorized Domains.`
  const messages = {
    'auth/invalid-api-key': 'Google sign-in is unavailable because the Firebase API key is invalid.',
    'auth/unauthorized-domain': 'Google sign-in is unavailable for this hostname. Add localhost in Firebase Authorized domains.',
    'auth/operation-not-allowed': 'Google sign-in is disabled. Enable the Google provider in Firebase Authentication.',
    'auth/popup-blocked': 'Popup was blocked. Continuing with secure redirect sign-in...',
    'auth/cancelled-popup-request': 'Google sign-in is already in progress.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled. You can try again.',
    'auth/account-exists-with-different-credential': 'This email already uses another sign-in method.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'No account was found for this email.',
    'auth/wrong-password': 'Incorrect email or password.',
  }
  if (error?.code === 'auth/network-request-failed') return 'Unable to reach Google/Firebase authentication. Check your connection.'
  if (error?.code === 'auth/user-disabled') return 'Your account is not currently allowed to sign in.'
  return messages[error?.code] || 'Google sign-in could not be completed. Please try again.'
}

export async function signInWithGoogle() {
  if (!auth) throw new Error('Google Authentication is not configured. Use Demo Mode.')
  await setPersistence(auth, browserLocalPersistence)
  try {
    const popupResult = signInWithPopup(auth, googleProvider)
    const timeout = new Promise((_, reject) => window.setTimeout(() => reject({ code: 'auth/popup-blocked' }), 8000))
    const result = await Promise.race([popupResult, timeout])
    return normalizeUser(result.user)
  } catch (error) {
    if (['auth/popup-blocked', 'auth/popup-failed-to-open', 'auth/operation-not-supported-in-this-environment'].includes(error?.code)) {
      await signInWithRedirect(auth, googleProvider)
      return null
    }
    throw error
  }
}

export async function signInWithEmail(email, password) {
  if (!auth) throw new Error('Email Authentication is not configured. Use Demo Mode.')
  await setPersistence(auth, browserLocalPersistence)
  const result = await signInWithEmailAndPassword(auth, email, password)
  return normalizeUser(result.user, 'email')
}

export async function createAccount(name, email, password) {
  if (!auth) throw new Error('Email Authentication is not configured. Use Demo Mode.')
  await setPersistence(auth, browserLocalPersistence)
  const result = await createUserWithEmailAndPassword(auth, email, password)
  if (name.trim()) await updateProfile(result.user, { displayName: name.trim() })
  return normalizeUser(result.user, 'email')
}

export async function resetPassword(email) {
  if (!auth) throw new Error('Email Authentication is not configured. Use Demo Mode.')
  return sendPasswordResetEmail(auth, email)
}

export async function redirectToGoogle() {
  if (!auth) throw new Error('Google Authentication is not configured. Use Demo Mode.')
  await setPersistence(auth, browserLocalPersistence)
  return signInWithRedirect(auth, googleProvider)
}

export async function completeGoogleRedirect() {
  if (!auth) return null
  const result = await getRedirectResult(auth)
  return result?.user ? normalizeUser(result.user) : null
}

export function subscribeToAuthState(callback) {
  return auth ? onAuthStateChanged(auth, (firebaseUser) => callback(firebaseUser ? normalizeUser(firebaseUser) : null)) : () => undefined
}

function normalizeUser(firebaseUser, provider = 'google') {
  return { uid: firebaseUser.uid, name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Authenticated user', email: firebaseUser.email || '', photoURL: firebaseUser.photoURL || '', provider }
}

export function signOutUser() {
  return auth ? signOut(auth) : Promise.resolve()
}

export async function getAuthToken() {
  return auth?.currentUser ? auth.currentUser.getIdToken() : null
}
