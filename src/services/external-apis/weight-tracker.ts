// src/services/external-apis/weight-tracker.ts
import { db } from '@/lib/firebase/config'; // Assuming your Firebase config is here
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  Timestamp, // Import Timestamp
  limit // Optional: to limit history length if needed
} from 'firebase/firestore';

/**
 * Represents a weight entry structure for Firestore interaction.
 * Note: We'll store date as a Firestore Timestamp for querying,
 * but the getWeightEntries might return it as a string if needed by AI.
 */
interface WeightEntryData {
  weightKg: number;
  date: Timestamp; // Store as Timestamp in Firestore
}

/**
 * Represents a weight entry structure returned by the service.
 */
export interface WeightEntry {
  id?: string; // Firestore document ID, optional
  date: string; // Date as a string (e.g., ISO format)
  weightKg: number;
}

/**
 * Asynchronously retrieves weight information for a given user from Firestore.
 *
 * @param userId The user ID for which to retrieve weight data.
 * @returns A promise that resolves to a list of WeightEntry objects, ordered by date descending.
 */
export async function getWeightEntries(userId: string): Promise<WeightEntry[]> {
  if (!userId) {
    console.error("getWeightEntries: userId is required");
    return [];
  }
  try {
    // Reference the 'weights' subcollection for the user
    const weightsRef = collection(db, `users/${userId}/weights`);
    // Query to order by date, newest first
    const q = query(weightsRef, orderBy('date', 'desc')/*, limit(100)*/); // Optional limit
    const snapshot = await getDocs(q);

    const entries: WeightEntry[] = snapshot.docs.map(doc => {
      const data = doc.data() as WeightEntryData;
      // Convert Firestore Timestamp to ISO string format for the return type
      const dateString = data.date instanceof Timestamp ? data.date.toDate().toISOString() : new Date().toISOString(); // Fallback just in case

      return {
        id: doc.id,
        date: dateString,
        weightKg: data.weightKg,
      };
    });
    return entries;
  } catch (error) {
    console.error("Error fetching weight entries:", error);
    return []; // Return empty array on error
  }
}

/**
 * Asynchronously creates a new weight entry for a given user in Firestore.
 *
 * @param userId The user ID for which to create weight data.
 * @param weightData An object containing the weightKg. The date is added automatically.
 * @returns A promise that resolves when the entry is created.
 */
export async function createWeightEntry(userId: string, weightData: { weightKg: number }): Promise<void> {
  if (!userId || typeof weightData.weightKg !== 'number') {
    console.error("createWeightEntry: userId and valid weightKg are required");
    throw new Error("Invalid input for creating weight entry.");
  }
  try {
    const weightsRef = collection(db, `users/${userId}/weights`);
    await addDoc(weightsRef, {
      weightKg: weightData.weightKg,
      date: Timestamp.now(), // Use Firestore Timestamp for accurate sorting/querying
    });
    console.log("Weight entry created successfully");
  } catch (error) {
    console.error("Error creating weight entry:", error);
    throw error; // Re-throw error to potentially handle it in the UI
  }
}

// Note: The original WeightEntry interface expected date as string.
// createWeightEntry now takes only { weightKg: number } because the date is generated server-side.
// getWeightEntries fetches the Timestamp and converts it to an ISO string for the return type.