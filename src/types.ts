/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ClothingCategory = 'Top' | 'Bottom' | 'Outerwear' | 'Footwear' | 'Nightwear' | 'Nightwear Top' | 'Nightwear Bottom';

export type StylePreference = 'Casual' | 'Formal' | 'Sporty' | 'Business' | 'Chic';

export type SeasonalUse = 'Summer' | 'Winter' | 'Fall/Spring' | 'All-Year';

export type ClothingStatus = 'Clean' | 'Dirty' | 'Damp';

export interface ClothingItem {
  id: string;
  name: string;
  category: ClothingCategory;
  style: StylePreference;
  seasonalUse: SeasonalUse;
  material: string;
  isQuickDry: boolean;
  color: string;
  colorHex: string;
  status: ClothingStatus;
  timesWorn?: number;
  imageUrl?: string;
}

export type WeatherCondition = 'Sunny' | 'Rainy' | 'Windy' | 'Cloudy' | 'Snowy' | 'Cold';

export interface WeatherForecast {
  dayOffset: number; // 0: Today, 1: Tomorrow, 2: Day After, 3: Next Day
  dayName: string;
  temp: number; // °C
  condition: WeatherCondition;
  humidity: number; // %
  windSpeed: number; // km/h
}

export interface Outfit {
  top: ClothingItem;
  bottom: ClothingItem;
  outerwear?: ClothingItem;
  footwear: ClothingItem;
  styleFallbackUsed?: boolean;
  requestedStyle?: StylePreference;
  fallbackStyle?: StylePreference;
  unavailableStyleItems?: string[];
  colorHarmonyScore?: number;
  styleCompatibilityNotes?: string;
}

export interface DailyPlan {
  dayOffset: number; // 0, 1, 2, 3
  dateString: string;
  weather: WeatherForecast;
  suggestedOutfit?: Outfit;
  lockedOutfit?: boolean; // If pinned by user
  missingItemsExplanation?: string; // If an outfit couldn't be made
}

export interface LaundryLoad {
  id: string;
  status: 'Idle' | 'Washing' | 'Drying' | 'Complete';
  itemIds: string[];
  startedAt?: number;
  durationSeconds: number;
}

export interface LaundryNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'laundry' | 'outfit' | 'weather';
}
