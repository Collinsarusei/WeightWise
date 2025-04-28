// src/components/ExerciseBarChart.tsx
'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Timestamp } from 'firebase/firestore'; // NEW: Import Timestamp if needed for type safety

// --- Interfaces ---
// Use Timestamp for date consistency with dashboard
interface ExerciseEntry {
  id?: string;
  date: Timestamp; // CHANGED: Expect Timestamp from dashboard
  duration: number;
  type?: string;
}

interface ExerciseBarChartProps {
  data: ExerciseEntry[];
  weekStartDate: Date; // NEW: Prop to specify the week to display
}

interface WeeklyChartData {
  day: string;
  dayIndex: number;
  [exerciseType: string]: number | string;
}

// --- Helper Functions ---

// No longer calculates start/end here, relies on weekStartDate prop

// Get Date object for the start of a given Date's day
const getStartOfDay = (date: Date): Date => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

// Get Date object for the end of a given Date's day
const getEndOfDay = (date: Date): Date => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
};

// Add days to a date
const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};


// Exercise colors (keep existing)
const exerciseColors: { [key: string]: string } = {
  Running: "#8884d8", // Indigo
  Walking: "#82ca9d", // Green
  Cycling: "#ffc658", // Yellow
  Weightlifting: "#ff7300", // Orange
  Swimming: "#8dd1e1", // Light Blue
  Yoga: "#d0ed57", // Lime
  Other: "#a4de6c", // Another green
  Default: "#cccccc", // Grey fallback
};
const getColor = (type: string | undefined): string => {
    if (!type) return exerciseColors.Default;
    // Simple case-insensitive check
    const normalizedType = Object.keys(exerciseColors).find(key =>
        key.toLowerCase() === type.toLowerCase()
    ) || 'Default';
    return exerciseColors[normalizedType];
};;


// --- Data Preparation Function ---
// CHANGED: Accepts weekStartDate as argument
const prepareWeeklyChartData = (entries: ExerciseEntry[], weekStartDate: Date): { chartData: WeeklyChartData[], exerciseTypes: string[] } => {

  // Calculate start and end based on the provided weekStartDate prop
  const startOfWeek = getStartOfDay(weekStartDate); // Use the start of the provided date
  const endOfWeekDate = addDays(startOfWeek, 6); // Calculate end date
  const endOfWeek = getEndOfDay(endOfWeekDate); // Use end of the calculated end date

  console.log(`[prepareWeeklyChartData] Filtering for week: ${startOfWeek.toISOString()} to ${endOfWeek.toISOString()}`);

  const weeklyEntries = entries.filter(entry => {
    // Ensure date is a Timestamp and duration is valid
    if (!(entry.date instanceof Timestamp) || typeof entry.duration !== 'number' || entry.duration <= 0) {
        // console.warn("Skipping invalid entry:", entry);
        return false;
    }
    try {
      const entryDate = entry.date.toDate(); // Convert Firestore Timestamp to JS Date
      // No need to set hours, compare directly with start/end dates
      const isValid = entryDate >= startOfWeek && entryDate <= endOfWeek;
      // if (isValid) console.log(`Including entry: ${entryDate.toISOString()}`, entry);
      // else console.log(`Excluding entry: ${entryDate.toISOString()}`, entry);
       return isValid;
    } catch (e) {
      console.error("Error processing date in filter:", entry.date, e);
      return false;
    }
  });

  console.log("[prepareWeeklyChartData] Filtered Weekly Entries:", weeklyEntries);

  // Initialize data structure for the week days
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weeklyDataMap: { [key: number]: WeeklyChartData } = {};
  daysOfWeek.forEach((day, index) => {
    weeklyDataMap[index] = { day: day, dayIndex: index };
  });

  const uniqueExerciseTypes = new Set<string>();

  // Aggregate data
  weeklyEntries.forEach(entry => {
    try {
        const entryDate = entry.date.toDate(); // Convert Timestamp
        const dayIndex = entryDate.getDay(); // 0 for Sunday, etc.
        const type = entry.type || 'Other';

        if (weeklyDataMap[dayIndex]) {
            uniqueExerciseTypes.add(type);
            const currentDuration = (weeklyDataMap[dayIndex][type] as number) || 0;
            weeklyDataMap[dayIndex][type] = currentDuration + entry.duration;
        } else {
            console.warn(`Day index ${dayIndex} not found for entry date ${entryDate.toISOString()}`);
        }
    } catch(e) {
        console.error("Error processing entry:", entry, e);
    }
  });

  // Convert map to array and ensure all types have a value (0 if no activity)
  const exerciseTypesArray = Array.from(uniqueExerciseTypes);
  const finalChartData = Object.values(weeklyDataMap).map(dayData => {
    exerciseTypesArray.forEach(type => {
      if (!(type in dayData)) {
        dayData[type] = 0;
      }
    });
    return dayData;
  });

  finalChartData.sort((a, b) => a.dayIndex - b.dayIndex);

  console.log("[prepareWeeklyChartData] Final Chart Data for week:", finalChartData);
  console.log("[prepareWeeklyChartData] Unique Exercise Types for week:", exerciseTypesArray);

  return { chartData: finalChartData, exerciseTypes: exerciseTypesArray };
};


// --- Custom Tooltip (Keep existing) ---
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-gray-300 rounded shadow-md text-sm">
        <p className="font-bold mb-2">{`Day: ${label}`}</p>
        {payload.map((entry: any, index: number) => (
             entry.value > 0 && ( // Only show activities with duration > 0
                <p key={`item-${index}`} style={{ color: entry.color || entry.payload.fill }}>
                    {`${entry.name}: ${entry.value} min`}
                </p>
             )
        ))}
        {/* Optional: Calculate and show total */}
         <p className="pt-1 mt-1 border-t font-semibold">
           Total: {payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0)} min
         </p>
      </div>
    );
  }
  return null;
};


// --- Main Chart Component ---
// CHANGED: Destructure weekStartDate from props
const ExerciseBarChart: React.FC<ExerciseBarChartProps> = ({ data, weekStartDate }) => {
  console.log("[ExerciseBarChart] Received raw data prop:", data?.length);
  console.log("[ExerciseBarChart] Received weekStartDate prop:", weekStartDate?.toDateString());

  // CHANGED: Pass weekStartDate to preparation function
  const { chartData, exerciseTypes } = prepareWeeklyChartData(data || [], weekStartDate);

  // CHANGED: Updated empty message logic
  const hasFilteredData = chartData.some(day => exerciseTypes.some(type => (day[type] as number) > 0));

  if (!hasFilteredData) {
     // Check if raw data exists at all
     if (!data || data.length === 0) {
         return <p className="text-center text-gray-500 mt-4 text-sm">Log exercises to see your activity chart.</p>;
     } else {
         // Raw data exists, but none for the selected week
         return <p className="text-center text-gray-500 mt-4 text-sm">No exercises logged for this week.</p>;
     }
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey="day" fontSize={10} axisLine={false} tickLine={false} />
        <YAxis label={{ value: 'Total Minutes', angle: -90, position: 'insideLeft', fontSize: 10, dx: -10 }} fontSize={10} axisLine={false} tickLine={false} width={35} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(206, 206, 206, 0.2)' }} />
        <Legend wrapperStyle={{fontSize: '10px', paddingTop: '10px'}} iconSize={8} />

        {exerciseTypes.map((type) => (
          <Bar
            key={type}
            dataKey={type}
            stackId="a"
            name={type}
            fill={getColor(type)}
            radius={[2, 2, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ExerciseBarChart;
