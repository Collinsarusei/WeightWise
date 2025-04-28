import { db } from './config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function logExercise(uid: string, type: string, duration: number) {
  try {
    const ref = collection(db, "users", uid, "exercises");
    await addDoc(ref, {
      type,
      duration,
      date: serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to log exercise:", error);
  }
}
