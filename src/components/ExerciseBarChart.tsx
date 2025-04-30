// src/components/ExerciseBarChart.tsx
'use client';

import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell // Import Cell for individual bar segment coloring
} from 'recharts';
import { Timestamp } from 'firebase/firestore';

// --- Interfaces ---
interface ExerciseEntry {
  id?: string;
  date: Timestamp;
  duration: number;
  type?: string;
}

interface ExerciseBarChartProps {
  data: ExerciseEntry[];
  weekStartDate: Date;
}

interface WeeklyChartData {
  day: string;
  dayIndex: number;
  // Store aggregated data per type for tooltip and structure
  // The actual display will sum these up per day
  [exerciseType: string]: number | string; 
}

// --- Helper Functions ---
const getStartOfDay = (date: Date): Date => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

const getEndOfDay = (date: Date): Date => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
};

const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

// --- Color Palette --- 
// Define a broader, visually distinct color palette
const COLOR_PALETTE = [
  "#8884d8", // purple
  "#82ca9d", // green
  "#ffc658", // yellow
  "#ff7300", // orange
  "#8dd1e1", // light blue
  "#d0ed57", // lime green
  "#ff8042", // coral
  "#a4de6c", // light green
  "#FF6347", // tomato
  "#4682B4", // steel blue
  "#32CD32", // lime green (alternative)
  "#FFD700", // gold
  "#6A5ACD", // slate blue
];

// Function to assign colors consistently to exercise types
const exerciseColorMap = new Map<string, string>();
let colorIndex = 0;

const getColorForExercise = (type: string): string => {
  const normalizedType = type.trim().toLowerCase();
  if (!exerciseColorMap.has(normalizedType)) {
    exerciseColorMap.set(normalizedType, COLOR_PALETTE[colorIndex % COLOR_PALETTE.length]);
    colorIndex++;
  }
  return exerciseColorMap.get(normalizedType) || COLOR_PALETTE[0]; // Fallback to first color
};
// ---------------------


// --- Data Preparation Function ---
const prepareWeeklyChartData = (entries: ExerciseEntry[], weekStartDate: Date): { chartData: WeeklyChartData[], exerciseTypes: string[] } => {
  exerciseColorMap.clear(); // Reset color map for each calculation
  colorIndex = 0;

  const startOfWeek = getStartOfDay(weekStartDate);
  const endOfWeekDate = addDays(startOfWeek, 6);
  const endOfWeek = getEndOfDay(endOfWeekDate);

  const weeklyEntries = entries.filter(entry => {
    if (!(entry.date instanceof Timestamp) || typeof entry.duration !== 'number' || entry.duration <= 0) {
        return false;
    }
    try {
      const entryDate = entry.date.toDate();
      return entryDate >= startOfWeek && entryDate <= endOfWeek;
    } catch (e) {
      console.error("Error processing date in filter:", entry.date, e);
      return false;
    }
  });

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weeklyDataMap: { [key: number]: WeeklyChartData } = {};
  daysOfWeek.forEach((day, index) => {
    weeklyDataMap[index] = { day: day, dayIndex: index };
  });

  const uniqueExerciseTypes = new Set<string>();

  weeklyEntries.forEach(entry => {
    try {
        const entryDate = entry.date.toDate();
        const dayIndex = entryDate.getDay();
        const type = entry.type?.trim() || 'Other'; // Ensure type exists and trim whitespace

        if (weeklyDataMap[dayIndex]) {
            if (type) { // Only add if type is valid
                 uniqueExerciseTypes.add(type);
                 // Assign color immediately
                 getColorForExercise(type); 
                 const currentDuration = (weeklyDataMap[dayIndex][type] as number) || 0;
                 weeklyDataMap[dayIndex][type] = currentDuration + entry.duration;
            }
        } else {
            console.warn(`Day index ${dayIndex} not found for entry date ${entryDate.toISOString()}`);
        }
    } catch(e) {
        console.error("Error processing entry:", entry, e);
    }
  });

  const exerciseTypesArray = Array.from(uniqueExerciseTypes).sort(); // Sort types for consistent legend/bar order
  const finalChartData = Object.values(weeklyDataMap).map(dayData => {
    exerciseTypesArray.forEach(type => {
      if (!(type in dayData)) {
        dayData[type] = 0; // Ensure every type has a 0 value if not present for the day
      }
    });
    return dayData;
  });

  finalChartData.sort((a, b) => a.dayIndex - b.dayIndex);

  return { chartData: finalChartData, exerciseTypes: exerciseTypesArray };
};


// --- Custom Tooltip ---
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Filter out entries with 0 value for cleaner tooltip
    const validPayload = payload.filter((entry: any) => entry.value > 0);
    if (validPayload.length === 0) return null; // Don't show tooltip if only 0 values

    return (
      <div className="bg-white p-3 border border-gray-300 rounded shadow-md text-sm">
        <p className="font-bold mb-2">{`Day: ${label}`}</p>
        {validPayload.map((entry: any, index: number) => (
            <p key={`item-${index}`} style={{ color: entry.payload.fill || entry.color }}>
                {`${entry.name}: ${entry.value} min`}
            </p>
        ))}
         <p className="pt-1 mt-1 border-t font-semibold">
           Total: {validPayload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0)} min
         </p>
      </div>
    );
  }
  return null;
};


// --- Main Chart Component ---
const ExerciseBarChart: React.FC<ExerciseBarChartProps> = ({ data, weekStartDate }) => {
  const { chartData, exerciseTypes } = prepareWeeklyChartData(data || [], weekStartDate);
  const hasFilteredData = chartData.some(day => exerciseTypes.some(type => (day[type] as number) > 0));

  if (!hasFilteredData) {
     if (!data || data.length === 0) {
         return <p className="text-center text-gray-500 mt-4 text-sm">Log exercises to see your activity chart.</p>;
     } else {
         return <p className="text-center text-gray-500 mt-4 text-sm">No exercises logged for this week.</p>;
     }
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 5, left: -20, bottom: 20 }} // Increased bottom margin for legend
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey="day" fontSize={10} axisLine={false} tickLine={false} />
        <YAxis 
           label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fontSize: 10, offset: 10 }} 
           fontSize={10} 
           axisLine={false} 
           tickLine={false} 
           width={40} // Adjusted width slightly
         />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(206, 206, 206, 0.2)' }} />
        <Legend 
           wrapperStyle={{fontSize: '10px', paddingTop: '10px'}} // Added padding top
           iconSize={8} 
           verticalAlign="bottom" // Move legend below chart
           align="center"
         />

        {/* Map through exercise types to create a Bar for each */}
        {exerciseTypes.map((type) => (
          <Bar
            key={type}
            dataKey={type} // Corresponds to keys in chartData objects
            stackId="a" // All bars belong to the same stack
            name={type} // Name shown in legend and tooltip
            fill={getColorForExercise(type)} // Get color based on type
            radius={[2, 2, 0, 0]} // Optional: slightly rounded top corners
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ExerciseBarChart;
