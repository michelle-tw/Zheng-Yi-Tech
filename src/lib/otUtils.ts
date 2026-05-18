export interface OTCalculation {
  normalHours: number;
  ot134Hours: number;
  ot167Hours: number;
  totalHours: number;
}

/**
 * Calculates OT hours based on the company's rule:
 * - First 8 hours: Normal (1.0x)
 * - Next 2 hours: OT 1.34x
 * - After that: OT 1.67x
 */
export function calculateOT(hours: number): OTCalculation {
  let normalHours = 0;
  let ot134Hours = 0;
  let ot167Hours = 0;

  if (hours <= 8) {
    normalHours = hours;
  } else {
    normalHours = 8;
    const remainingAfterNormal = hours - 8;
    
    if (remainingAfterNormal <= 2) {
      ot134Hours = remainingAfterNormal;
    } else {
      ot134Hours = 2;
      ot167Hours = remainingAfterNormal - 2;
    }
  }

  return {
    normalHours,
    ot134Hours,
    ot167Hours,
    totalHours: hours
  };
}

/**
 * Utility to calculate duration from start time and end time strings (HH:mm)
 */
export function calculateDuration(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  
  let startTotalMinutes = startH * 60 + startM;
  let endTotalMinutes = endH * 60 + endM;
  
  // Handle overnight work
  if (endTotalMinutes < startTotalMinutes) {
    endTotalMinutes += 24 * 60;
  }
  
  const diffMinutes = endTotalMinutes - startTotalMinutes;
  return diffMinutes / 60;
}
