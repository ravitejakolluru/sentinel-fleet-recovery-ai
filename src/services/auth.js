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
  const publicMessages = {
    'auth/invalid-api-key': 'Google sign-in is temporarily unavailable. Public visitors can continue without creating an account or use Demo Mode.',
    'auth/unauthorized-domain': 'Google sign-in is unavailable for this host. Public visitors can continue without creating an account or use Demo Mode.',
    'auth/operation-not-allowed': 'This sign-in method is turned off right now. Public visitors can continue without creating an account or use Demo Mode.',
    'auth/popup-blocked': 'The Google popup was blocked. You can still continue as a public visitor or use Demo Mode.',
    'auth/cancelled-popup-request': 'Google sign-in is already in progress.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled. You can continue without creating an account or use Demo Mode.',
    'auth/account-exists-with-different-credential': 'This email already uses another sign-in method.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'No account was found for this email.',
    'auth/wrong-password': 'Incorrect email or password.',
  }
  if (error?.code === 'auth/network-request-failed') return 'Unable to reach authentication. Check your connection or continue as a public visitor.'
  if (error?.code === 'auth/user-disabled') return 'This account is not currently allowed to sign in.'
  return publicMessages[error?.code] || 'Authentication is unavailable right now. Public visitors can continue without creating an account.'
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
    if (error?.code === 'auth/operation-not-allowed') {
      throw new Error('Google sign-in is currently unavailable. Public visitors can continue without creating an account or use Demo Mode.')
    }
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
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    if (name.trim()) await updateProfile(result.user, { displayName: name.trim() })
    return normalizeUser(result.user, 'email')
  } catch (error) {
    if (error?.code === 'auth/operation-not-allowed') {
      throw new Error('Account creation is currently disabled. Public visitors can continue without creating an account or use Demo Mode.')
    }
    throw error
  }
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
