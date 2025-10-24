/**
 * Utility functions for determining trading days and market hours
 */

/**
 * Check if a given date is a trading day (Monday-Friday, excluding major holidays)
 * @param date - The date to check
 * @returns true if it's a trading day, false otherwise
 */
export function isTradingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  
  // Weekend check (Saturday = 6, Sunday = 0)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  // Check for major US market holidays
  const month = date.getMonth();
  const day = date.getDate();
  const year = date.getFullYear();
  
  // New Year's Day (January 1)
  if (month === 0 && day === 1) return false;
  
  // Martin Luther King Jr. Day (third Monday in January)
  if (month === 0 && isThirdMonday(date)) return false;
  
  // Presidents' Day (third Monday in February)
  if (month === 1 && isThirdMonday(date)) return false;
  
  // Good Friday (Friday before Easter - approximation)
  if (isGoodFriday(date)) return false;
  
  // Memorial Day (last Monday in May)
  if (month === 4 && isLastMonday(date)) return false;
  
  // Juneteenth (June 19)
  if (month === 5 && day === 19) return false;
  
  // Independence Day (July 4)
  if (month === 6 && day === 4) return false;
  
  // Labor Day (first Monday in September)
  if (month === 8 && isFirstMonday(date)) return false;
  
  // Thanksgiving (fourth Thursday in November)
  if (month === 10 && isFourthThursday(date)) return false;
  
  // Christmas Day (December 25)
  if (month === 11 && day === 25) return false;
  
  return true;
}

/**
 * Check if a date is within market hours (9:30 AM - 4:00 PM ET)
 * @param date - The date to check
 * @returns true if within market hours, false otherwise
 */
export function isMarketHours(date: Date): boolean {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // Market hours: 9:30 AM - 4:00 PM ET (570 - 960 minutes)
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  
  return timeInMinutes >= marketOpen && timeInMinutes <= marketClose;
}

/**
 * Get the start and end of a trading day for a given date
 * @param date - The date to get trading day boundaries for
 * @returns Object with start and end timestamps for the trading day
 */
export function getTradingDayBoundaries(date: Date): { start: number; end: number } {
  const start = new Date(date);
  start.setHours(9, 30, 0, 0); // 9:30 AM
  
  const end = new Date(date);
  end.setHours(16, 0, 0, 0); // 4:00 PM
  
  return {
    start: start.getTime(),
    end: end.getTime()
  };
}

/**
 * Get all trading days in a date range
 * @param startDate - Start of the range
 * @param endDate - End of the range
 * @returns Array of Date objects representing trading days
 */
export function getTradingDaysInRange(startDate: Date, endDate: Date): Date[] {
  const tradingDays: Date[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    if (isTradingDay(current)) {
      tradingDays.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  
  return tradingDays;
}

// Helper functions for holiday calculations

function isThirdMonday(date: Date): boolean {
  const day = date.getDate();
  const dayOfWeek = date.getDay();
  return dayOfWeek === 1 && day >= 15 && day <= 21;
}

function isLastMonday(date: Date): boolean {
  const day = date.getDate();
  const dayOfWeek = date.getDay();
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return dayOfWeek === 1 && day > lastDayOfMonth - 7;
}

function isFirstMonday(date: Date): boolean {
  const day = date.getDate();
  const dayOfWeek = date.getDay();
  return dayOfWeek === 1 && day >= 1 && day <= 7;
}

function isFourthThursday(date: Date): boolean {
  const day = date.getDate();
  const dayOfWeek = date.getDay();
  return dayOfWeek === 4 && day >= 22 && day <= 28;
}

function isGoodFriday(date: Date): boolean {
  // Simplified Good Friday calculation (Friday before Easter)
  // This is an approximation - for production use, consider a proper Easter calculation
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  
  if (date.getDay() !== 5) return false; // Must be Friday
  
  // Very basic approximation - in practice, you'd want a proper Easter calculation
  // This is just a placeholder that catches some Good Fridays
  const easterApprox = new Date(year, 2, 21); // March 21st approximation
  const goodFriday = new Date(easterApprox);
  goodFriday.setDate(easterApprox.getDate() - 2);
  
  return month === goodFriday.getMonth() && day === goodFriday.getDate();
}
