/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClothingItem, WeatherForecast, Outfit, StylePreference } from '../types';

/**
 * Checks if a materials string refers to heavy/thick textiles
 */
export function isHeavyOrSlowDry(item: ClothingItem): boolean {
  if (item.isQuickDry) return false;
  const mat = item.material.toLowerCase();
  return (
    mat.includes('heavy denim') ||
    mat.includes('wool') ||
    mat.includes('denim') ||
    mat.includes('leather') ||
    mat.includes('suede') ||
    mat.includes('cotton (100%)') ||
    mat.includes('knit')
  );
}

/**
 * Determines availability of clothes on a given relative dayOffset (0: Today, 1: Tomorrow, etc.)
 * - If currently mark as Damp (due to rain & moisture), unavailable on any day.
 * - If today worn: goes to washing tomorrow (Day 1) and ready day after tomorrow (Day 2).
 * - If currently Dirty: unavailable on Day 0 and 1, available on Day 2.
 */
export function getAvailableItemsForDay(
  allItems: ClothingItem[],
  dayOffset: number,
  wornItemIdsByDayOffset: { [day: number]: string[] },
  itemsGoingToWashToday: string[] = [],
  activeLaundryTimes: { [itemId: string]: number } = {}
): ClothingItem[] {
  return allItems.filter((item) => {
    // 1. If currently marked Damp (due to rain and moisture), it becomes clean & dry tomorrow.
    if (item.status === 'Damp') {
      return dayOffset >= 1;
    }

    // 2. If worn on any planned previous day W:
    //    - On Day W+1: it goes to wash and is unavailable.
    //    - On Day W+2: it becomes available again.
    for (let prevDay = 0; prevDay < dayOffset; prevDay++) {
      const prevWorn = wornItemIdsByDayOffset[prevDay] || [];
      if (prevWorn.includes(item.id)) {
        const relativeDiff = dayOffset - prevDay;
        if (relativeDiff === 1) {
          return false; // In washing/laundry tomorrow
        }
      }
    }

    // 3. Raw status relative checks:
    if (item.status === 'Dirty') {
      // Dirty today (Day 0) -> Available clean tomorrow (Day 1+)
      return dayOffset >= 1;
    }

    return true;
  });
}

/**
 * Grades the harmony of a combination of items based on colors and styling coordinate rules
 * to ensure they are matched in the right combination of style & color!
 */
export function calculateCombinationScore(
  top: ClothingItem,
  bottom: ClothingItem,
  footwear: ClothingItem,
  outerwear: ClothingItem | undefined,
  targetStyle: StylePreference,
  weather: WeatherForecast
): { score: number; notes: string } {
  let score = 80; // Default beautiful baseline style score
  let notes = "";

  // 1. Style preference matching
  let styleMismatchCount = 0;
  if (top.style !== targetStyle) {
    score -= 15;
    styleMismatchCount++;
  }
  if (bottom.style !== targetStyle) {
    score -= 15;
    styleMismatchCount++;
  }
  if (footwear.style !== targetStyle) {
    score -= 15;
    styleMismatchCount++;
  }
  if (outerwear && outerwear.style !== targetStyle) {
    score -= 10;
    styleMismatchCount++;
  }

  if (styleMismatchCount === 0) {
    score += 10;
    notes += `✨ Matches your styled ${targetStyle} preference. `;
  } else {
    notes += `⚠️ Style mismatch: ${styleMismatchCount} piece(s) don't match optimal ${targetStyle} style. `;
  }

  // Cross-garment cohesive style check
  const styleSet = new Set([top.style, bottom.style, footwear.style]);
  if (outerwear) styleSet.add(outerwear.style);

  if (styleSet.size === 1) {
    score += 15;
    notes += `👔 Coherent single-style theme! `;
  }

  // 2. Color harmony matching and clashing avoidance
  const neutrals = ['Charcoal Black', 'Off White', 'Classic Grey', 'Khaki Beige', 'Soft Peach'];
  const isTopNeutral = neutrals.includes(top.color);
  const isBottomNeutral = neutrals.includes(bottom.color);
  const isFootwearNeutral = neutrals.includes(footwear.color);

  // Avoid clashing identical loud colors (except matching pajamas/suits)
  if (top.color === bottom.color && !neutrals.includes(top.color)) {
    score -= 30; // Severe uniform clashing!
    notes += `❌ Heavy color clash: identical bright ${top.color} top & bottom is oversaturated. `;
  }

  // Multi-loud-color penalty (limit to max 1 bright color for elegant dressing)
  let brightCount = 0;
  if (!isTopNeutral) brightCount++;
  if (!isBottomNeutral) brightCount++;
  if (!isFootwearNeutral) brightCount++;

  if (brightCount === 1) {
    score += 15; // Elegant accent styling!
    notes += `🎨 Beautiful balanced color accent. `;
  } else if (brightCount === 0) {
    score += 10; // Understated clean neutrals
    notes += `🌿 Sophisticated neutral combination. `;
  } else if (brightCount >= 2) {
    score -= 20; // Too busy
    notes += `⚠️ Too busy: Multiple distinct bright colors in coordinate. `;
  }

  // Distinct known clashes
  if ((top.color === 'Lava Orange' && bottom.color === 'Sky Blue') || (top.color === 'Sky Blue' && bottom.color === 'Lava Orange')) {
    score -= 20;
    notes += `❌ Loud color conflict: Orange & Sky Blue. `;
  }
  if ((top.color === 'Forest Green' && bottom.color === 'Lava Orange') || (top.color === 'Lava Orange' && bottom.color === 'Forest Green')) {
    score -= 25;
    notes += `❌ Aesthetic clash: Green & Orange. `;
  }

  // Specific pleasant matching rules
  if (top.color === 'Sky Blue' && bottom.color === 'Khaki Beige') {
    score += 15;
    notes += `🏆 Blue-Beige breeze harmony. `;
  }
  if (top.color === 'Forest Green' && bottom.color === 'Khaki Beige') {
    score += 15;
    notes += `🏆 Elegant earth-tone coordinate. `;
  }
  if (top.color === 'Navy Blue' && bottom.color === 'Off White') {
    score += 15;
    notes += `🏆 Yachting high contrast contrast. `;
  }
  if (top.color === 'Lava Orange' && bottom.color === 'Charcoal Black') {
    score += 15;
    notes += `🏆 Sporty High contrast combo! `;
  }

  // 3. Weather safety
  const isRainy = weather.condition === 'Rainy';
  const isCold = weather.condition === 'Snowy' || weather.condition === 'Cold' || weather.temp < 15;
  const isHot = weather.temp > 24;

  if (isRainy) {
    if (!top.isQuickDry) {
      score -= 25;
      notes += `🌧️ Non-quick-dry top fails rain comfort safety. `;
    }
    if (!bottom.isQuickDry) {
      score -= 25;
      notes += `🌧️ Absorbent pants fail rain safety. `;
    }
    if (!footwear.isQuickDry) {
      score -= 20;
      notes += `🌧️ Footwear lacks water resistance. `;
    }
  }

  if (isCold) {
    if (!outerwear) {
      score -= 20;
      notes += `❄️ Missing layers for cold ${weather.temp}°C air. `;
    }
    if (top.seasonalUse === 'Summer') {
      score -= 10;
      notes += `❄️ Summer top thinness on chilly day. `;
    }
  }

  if (isHot) {
    if (top.seasonalUse === 'Winter' || top.material.toLowerCase().includes('wool') || top.material.toLowerCase().includes('knit')) {
      score -= 20;
      notes += `🔥 High-dry heavy fabric on hot day. `;
    }
    if (outerwear) {
      score -= 15;
      notes += `🔥 Unneeded outer layer under high heat. `;
    }
  }

  // Clamp strictly between 0 and 100
  const finalScore = Math.min(100, Math.max(0, score));
  return { score: finalScore, notes: notes.trim() };
}

/**
 * Suggests an outfit for a given forecast and style preference from available items
 * If preferred style is unavailable, falls back automatically to next best style and
 * lists the exact unavailable item categories.
 */
export function generateOutfitSuggestion(
  availableItems: ClothingItem[],
  weather: WeatherForecast,
  stylePref: StylePreference
): {
  outfit: (Outfit & {
    styleFallbackUsed?: boolean;
    requestedStyle?: StylePreference;
    appliedStyle?: StylePreference;
    unavailableStyleItems?: string[];
    colorHarmonyScore?: number;
    styleCompatibilityNotes?: string;
  }) | null;
  reasoning: string;
} {
  // 1. Try to find the absolute best combination among available items
  const tops = availableItems.filter((i) => i.category === 'Top');
  const bottoms = availableItems.filter((i) => i.category === 'Bottom');
  const outers = availableItems.filter((i) => i.category === 'Outerwear');
  const footwears = availableItems.filter((i) => i.category === 'Footwear');

  const isCold = weather.condition === 'Snowy' || weather.condition === 'Cold' || weather.temp < 15;

  // Let's compute the best combination for a given style preference
  const findBestCombinationForStyle = (targetStyle: StylePreference) => {
    let bestCombo: { top: ClothingItem; bottom: ClothingItem; footwear: ClothingItem; outerwear?: ClothingItem; score: number; notes: string } | null = null;

    for (const t of tops) {
      for (const b of bottoms) {
        for (const f of footwears) {
          if (isCold || weather.condition === 'Windy') {
            const applicableOuters = outers.length > 0 ? outers : [undefined];
            for (const o of applicableOuters) {
              const res = calculateCombinationScore(t, b, f, o, targetStyle, weather);
              if (!bestCombo || res.score > bestCombo.score) {
                bestCombo = { top: t, bottom: b, footwear: f, outerwear: o, score: res.score, notes: res.notes };
              }
            }
          } else {
            const res = calculateCombinationScore(t, b, f, undefined, targetStyle, weather);
            if (!bestCombo || res.score > bestCombo.score) {
              bestCombo = { top: t, bottom: b, footwear: f, score: res.score, notes: res.notes };
            }
          }
        }
      }
    }

    return bestCombo;
  };

  // 1. Primary search with requested style preference
  let bestMatch = findBestCombinationForStyle(stylePref);

  // If there's a match, but the style match score is highly compromised or no garments of that style are clean/available
  // let's check if we fell back or if we need to actively trigger fallback to find other choices.
  const hasPreferredStyleItems = availableItems.some(i => i.style === stylePref);

  if (bestMatch && hasPreferredStyleItems) {
    const outfit = {
      top: bestMatch.top,
      bottom: bestMatch.bottom,
      footwear: bestMatch.footwear,
      outerwear: bestMatch.outerwear,
      colorHarmonyScore: Math.round(bestMatch.score),
      styleCompatibilityNotes: bestMatch.notes,
    };

    let reasoning = `Chuye climate optimized match for a ${weather.temp}°C ${weather.condition} day: ` + bestMatch.notes;
    if (weather.condition === 'Rainy') {
      reasoning += `☔ Monsoon safe: Checked wet-resistance of ${bestMatch.top.material}.`;
    }

    return { outfit, reasoning };
  }

  // 2. FALLBACK INITIATION: If requested style items are completely unavailable / unclean, fall back gracefully!
  // Find which ones are missing in total wardrobe
  const missingCategories: string[] = [];
  const itemsInWardrobeWithRequestedStyle = availableItems.filter(item => item.style === stylePref);
  
  if (itemsInWardrobeWithRequestedStyle.filter(i => i.category === 'Top').length === 0) {
    missingCategories.push(`${stylePref} Top`);
  }
  if (itemsInWardrobeWithRequestedStyle.filter(i => i.category === 'Bottom').length === 0) {
    missingCategories.push(`${stylePref} Bottom`);
  }
  if (itemsInWardrobeWithRequestedStyle.filter(i => i.category === 'Footwear').length === 0) {
    missingCategories.push(`${stylePref} Footwear`);
  }

  // Let's attempt fallback search across other styles!
  const styleOrder: StylePreference[] = ['Casual', 'Chic', 'Formal', 'Sporty', 'Business'];
  const alternativeStyles = styleOrder.filter(s => s !== stylePref);

  for (const altStyle of alternativeStyles) {
    const altMatch = findBestCombinationForStyle(altStyle);
    if (altMatch) {
      const outfit = {
        top: altMatch.top,
        bottom: altMatch.bottom,
        footwear: altMatch.footwear,
        outerwear: altMatch.outerwear,
        styleFallbackUsed: true,
        requestedStyle: stylePref,
        fallbackStyle: altStyle,
        unavailableStyleItems: missingCategories.length > 0 ? missingCategories : [`Clean ${stylePref} items`],
        colorHarmonyScore: Math.round(altMatch.score),
        styleCompatibilityNotes: altMatch.notes,
      };

      const reasoning = `⚠️ Style Fallback Applied: ${stylePref} clothes were unavailable right now. Blended matching ${altStyle} garments elegantly instead. ` + altMatch.notes;

      return { outfit, reasoning };
    }
  }

  // Absolute fallback: Just return first clean item combo possible
  if (tops.length > 0 && bottoms.length > 0 && footwears.length > 0) {
    const outfit = {
      top: tops[0],
      bottom: bottoms[0],
      footwear: footwears[0],
      outerwear: outers[0],
      colorHarmonyScore: 50,
      styleCompatibilityNotes: "Simple basic coordinate.",
    };
    return { outfit, reasoning: "Basic coordinate. Clean clothes levels are very low." };
  }

  return { outfit: null, reasoning: `No clothes available to suggest a combination for ${weather.dayName}.` };
}

/**
 * Predicts and flags dirty items that are requested for tomorrow or day after tomorrow
 * so that we notify the user immediately to wash them!
 */
export function predictRequiredWashItems(
  wardrobe: ClothingItem[],
  stylePreference: StylePreference
): { item: ClothingItem; requiredOffset: number; requiredDayName: string }[] {
  const alerts: { item: ClothingItem; requiredOffset: number; requiredDayName: string }[] = [];

  // Let's inspect Day 1 (Tomorrow) and Day 2 (Day after tomorrow)
  const tomorrowItems = wardrobe.filter(
    (item) => item.style === stylePreference && item.status === 'Dirty'
  );

  tomorrowItems.forEach((item) => {
    alerts.push({
      item,
      requiredOffset: 1,
      requiredDayName: 'Tomorrow',
    });
  });

  return alerts;
}
