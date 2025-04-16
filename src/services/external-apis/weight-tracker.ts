/**
 * Represents a weight entry.
 */
export interface WeightEntry {
  /**
   * The date of the weight entry.
   */
  date: string;
  /**
   * The weight in kilograms.
   */
  weightKg: number;
}

/**
 * Asynchronously retrieves weight information for a given user.
 *
 * @param userId The user ID for which to retrieve weight data.
 * @returns A promise that resolves to a list of WeightEntry objects.
 */
export async function getWeightEntries(userId: string): Promise<WeightEntry[]> {
  // TODO: Implement this by calling an API.

  return [
    {
      date: '2024-01-01',
      weightKg: 70,
    },
    {
      date: '2024-01-02',
      weightKg: 69.5,
    },
  ];
}

/**
 * Asynchronously creates a new weight entry for a given user.
 *
 * @param userId The user ID for which to create weight data.
 * @param weightEntry The weight entry to create.
 * @returns A promise that resolves to the created WeightEntry object.
 */
export async function createWeightEntry(userId: string, weightEntry: WeightEntry): Promise<WeightEntry> {
  // TODO: Implement this by calling an API.

  return weightEntry;
}
