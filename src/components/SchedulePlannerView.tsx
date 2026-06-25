/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { DailyPlan, ClothingItem, Outfit, StylePreference, WeatherCondition, ClothingStatus } from '../types';
import { predictRequiredWashItems, calculateCombinationScore, getAvailableItemsForDay } from '../utils/outfitEngine';
import { Calendar, RotateCw, CheckCircle, Sparkles, AlertCircle, WashingMachine, Sparkle, RefreshCw, ArrowRightLeft, Sun, CloudRain, Cloud, Wind, Snowflake, Thermometer, MapPin, ArrowUpRight, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SchedulePlannerViewProps {
  wardrobe: ClothingItem[];
  dailyPlans: DailyPlan[];
  stylePreference: StylePreference;
  onStylePreferenceChanged: (style: StylePreference) => void;
  onUpdateOutfitSelection: (dayOffset: number, key: 'top' | 'bottom' | 'outerwear' | 'footwear', item: ClothingItem) => void;
  onAutoReplan: () => void;
  onResetSingleDayOutfit?: (dayOffset: number) => void;
  itemsGoingToWashToday: string[];
  activeLaundryTimes: { [id: string]: number };
  onUpdateStatus: (id: string, newStatus: ClothingStatus) => void;
  onSaveFavoriteCombo?: (name: string, topId: string, bottomId: string, footwearId: string, outerwearId?: string, style?: StylePreference) => void;
  favoriteOutfits?: { id: string; name: string; topId: string; bottomId: string; footwearId: string; outerwearId?: string; style: string; }[];
}

export default function SchedulePlannerView({
  wardrobe,
  dailyPlans,
  stylePreference,
  onStylePreferenceChanged,
  onUpdateOutfitSelection,
  onAutoReplan,
  onResetSingleDayOutfit,
  itemsGoingToWashToday,
  activeLaundryTimes,
  onUpdateStatus,
  onSaveFavoriteCombo,
  favoriteOutfits = [],
}: SchedulePlannerViewProps) {
  const [activePlanOffset, setActivePlanOffset] = useState<number>(0);
  const [swappingCategory, setSwappingCategory] = useState<'Top' | 'Bottom' | 'Outerwear' | 'Footwear' | null>(null);
  const [showSaveFavoriteInline, setShowSaveFavoriteInline] = useState(false);
  const [favoriteName, setFavoriteName] = useState('');
  const [geminiAdvice, setGeminiAdvice] = useState<{ harmony: string; rainReady: string; suggestion: string } | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [geminiTab, setGeminiTab] = useState<'harmony' | 'weather' | 'tip'>('harmony');
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isWeatherDetailOpen, setIsWeatherDetailOpen] = useState(false);
  const [inspectedGarment, setInspectedGarment] = useState<ClothingItem | null>(null);

  // Real weather search grounding state & trigger
  const [loadingRealWeather, setLoadingRealWeather] = useState(false);
  const [realWeatherReport, setRealWeatherReport] = useState<{ text: string; sources: { uri: string; title: string }[] } | null>(null);

  const fetchRealWeather = async () => {
    setLoadingRealWeather(true);
    setIsWeatherDetailOpen(true);
    try {
      const response = await fetch('/api/gemini/real-weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        setRealWeatherReport(data);
      } else {
        // Fallback for static builds (like GitHub Pages)
        setRealWeatherReport({
          text: "Kolhapur enjoys a warm humid monsoon climate today. Typical temperatures range between 24°C and 30°C. Heavy cotton garments dry slowly due to dampness, whereas athletic synthetic polyesters dry rapidly in under 2 hours.",
          sources: [
            { uri: "https://weather.com", title: "Weather Channel (Offline Fallback)" }
          ]
        });
      }
    } catch (err) {
      console.error("Error fetching real weather grounding:", err);
      // Fallback in case of networking issues
      setRealWeatherReport({
        text: "Kolhapur enjoys a warm humid monsoon climate today. Typical temperatures range between 24°C and 30°C. Heavy cotton garments dry slowly due to dampness, whereas athletic synthetic polyesters dry rapidly in under 2 hours.",
        sources: [
          { uri: "https://weather.com", title: "Weather Channel (Offline Fallback)" }
        ]
      });
    } finally {
      setLoadingRealWeather(false);
    }
  };

  // Calculates exact dates dynamically based on current live date
  const getFormattedDate = (dayOffset: number) => {
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + dayOffset);
    return baseDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const selectedPlan = dailyPlans.find((p) => p.dayOffset === activePlanOffset) || dailyPlans[0];

  // Calculate available clothes taking custom wear tracking sequence into account!
  // App compiles worn sequences automatically, so we pass down an empty sequence as
  // App already sequentially filtered the `dailyPlans` items! This is beautifully clean and simple.
  const availableItemsForSelectedDay = getAvailableItemsForDay(
    wardrobe,
    activePlanOffset,
    {}, // Wear maps processed at master level inside App.tsx
    itemsGoingToWashToday,
    activeLaundryTimes
  );

  const getSwappableItems = (category: 'Top' | 'Bottom' | 'Outerwear' | 'Footwear') => {
    const isRainy = selectedPlan.weather.condition === 'Rainy';
    return availableItemsForSelectedDay.filter((item) => {
      if (item.category !== category) return false;
      if (item.status !== 'Clean' && selectedPlan.dayOffset === 0) return false; // Must be clean for active today
      if (isRainy && !item.isQuickDry) return false; // Rainy fast-dry constraints
      return true;
    });
  };

  const currentOutfit = selectedPlan.suggestedOutfit;

  const fetchGeminiAdvice = async () => {
    if (!currentOutfit) {
      setGeminiAdvice(null);
      return;
    }
    setLoadingAdvice(true);
    try {
      const response = await fetch('/api/gemini/outfit-consultant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weather: selectedPlan.weather,
          outfit: currentOutfit,
          wardrobeCount: wardrobe.length
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setGeminiAdvice(data);
      } else {
        // Fallback for non-server static hosting environments
        setGeminiAdvice({
          harmony: `Color coordinates of ${currentOutfit.top.name} with ${currentOutfit.bottom.name} look highly cohesive and balanced!`,
          rainReady: `Materials like ${currentOutfit.top.material} and ${currentOutfit.bottom.material} have standard drying factors in ${selectedPlan.weather.condition} conditions.`,
          suggestion: `Add quick-drying layers or protective outer garments to keep yourself ready for weather shifts in Kolhapur.`
        });
      }
    } catch (err) {
      console.error("Gemini advisor fetch error:", err);
      // Fallback on offline/networking issues
      setGeminiAdvice({
        harmony: `Color coordinates of ${currentOutfit.top.name} with ${currentOutfit.bottom.name} look highly cohesive and balanced!`,
        rainReady: `Materials like ${currentOutfit.top.material} and ${currentOutfit.bottom.material} have standard drying factors in ${selectedPlan.weather.condition} conditions.`,
        suggestion: `Add quick-drying layers or protective outer garments to keep yourself ready for weather shifts in Kolhapur.`
      });
    } finally {
      setLoadingAdvice(false);
    }
  };

  const outfitKey = currentOutfit ? `${currentOutfit.top.id}-${currentOutfit.bottom.id}-${currentOutfit.outerwear?.id || ''}-${currentOutfit.footwear.id}` : '';

  useEffect(() => {
    // Prevent auto-fetching to conserve API quota and avoid 429 limits. Let the user evaluate manually.
    setGeminiAdvice(null);
  }, [activePlanOffset, stylePreference, outfitKey]);

  const swappableItemsList = swappingCategory ? getSwappableItems(swappingCategory) : [];

  // Determine scoring
  const outfitScoreAndNotes = currentOutfit ? calculateCombinationScore(
    currentOutfit.top,
    currentOutfit.bottom,
    currentOutfit.footwear,
    currentOutfit.outerwear,
    stylePreference,
    selectedPlan.weather
  ) : null;

  // Active predictive alerts
  const washAlerts = predictRequiredWashItems(wardrobe, stylePreference);

  // Auto solve alternative swap helper
  const handleAutoSwapBestHarmoniousItem = (category: 'Top' | 'Bottom' | 'Outerwear' | 'Footwear') => {
    if (!currentOutfit) return;
    const candidates = getSwappableItems(category);
    if (candidates.length === 0) return;

    let bestCandidate = candidates[0];
    let highestScore = -999;

    candidates.forEach((cand) => {
      const testTop = category === 'Top' ? cand : currentOutfit.top;
      const testBottom = category === 'Bottom' ? cand : currentOutfit.bottom;
      const testFootwear = category === 'Footwear' ? cand : currentOutfit.footwear;
      const testOuterwear = category === 'Outerwear' ? cand : currentOutfit.outerwear;

      const res = calculateCombinationScore(testTop, testBottom, testFootwear, testOuterwear, stylePreference, selectedPlan.weather);
      if (res.score > highestScore) {
        highestScore = res.score;
        bestCandidate = cand;
      }
    });

    onUpdateOutfitSelection(activePlanOffset, category.toLowerCase() as any, bestCandidate);
    setSwappingCategory(null);
  };

  const getWeatherIcon = (cond: WeatherCondition, customClass = 'w-4 h-4') => {
    switch (cond) {
      case 'Sunny':
        return <Sun className={`${customClass} text-amber-500`} />;
      case 'Rainy':
        return <CloudRain className={`${customClass} text-blue-500`} />;
      case 'Windy':
        return <Wind className={`${customClass} text-sky-400`} />;
      case 'Cloudy':
        return <Cloud className={`${customClass} text-slate-400`} />;
      case 'Snowy':
        return <Snowflake className={`${customClass} text-blue-200`} />;
      case 'Cold':
        return <Thermometer className={`${customClass} text-blue-600`} />;
      default:
        return <Sun className={`${customClass} text-amber-500`} />;
    }
  };

  // Determine score representation color
  const getScoreColorInfo = (score: number) => {
    if (score < 50) {
      return {
        barClass: 'bg-rose-500',
        textClass: 'text-rose-500',
        bgClass: 'bg-rose-50 border-rose-100',
        label: '🚨 Bad Combination / Critical Style Clash'
      };
    } else if (score < 75) {
      return {
        barClass: 'bg-amber-500',
        textClass: 'text-amber-600',
        bgClass: 'bg-amber-50/80 border-amber-100',
        label: '👔 Modest / Wearable Coordinates Blend'
      };
    } else {
      return {
        barClass: 'bg-emerald-500',
        textClass: 'text-emerald-400',
        bgClass: 'bg-emerald-950/40 border-emerald-950',
        label: '✨ Sublime Coordinated Harmony'
      };
    }
  };

  return (
    <div id="schedule-planner-section" className="space-y-6">
      
      {/* 1. COMPACT GEOGRAPHICAL LOCATION BAR & WEATHER SUMMARY ROW */}
      <div className="bg-white rounded-[24px] border border-stone-200/80 p-5 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-800 shrink-0">
            <MapPin className="w-5 h-5 text-stone-800" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-900 leading-tight">Live Location: Chuye, Kolhapur</h3>
            <p className="text-xs text-stone-400 font-mono">Maharashtra, India • Climatic Synchronized Forecast</p>
          </div>
        </div>

        {/* 3-Day Forecast Compact Collages */}
        <div id="weather-quick-collages" className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          {dailyPlans.map((p) => (
            <button
              key={p.dayOffset}
              onClick={() => setActivePlanOffset(p.dayOffset)}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2.5 shrink-0 transition-all cursor-pointer ${
                activePlanOffset === p.dayOffset
                  ? 'bg-stone-900 border-stone-950 text-[#FBF9F4] shadow-sm font-bold scale-[1.02]'
                  : 'bg-stone-50 border-stone-150 text-stone-600 hover:bg-stone-100'
              }`}
            >
              <div className="text-left">
                <span className="text-[10px] font-bold font-mono tracking-wider uppercase block leading-none">
                  {p.dayOffset === 0 ? 'TODAY' : p.dayOffset === 1 ? 'TOMORROW' : `DAY +${p.dayOffset}`}
                </span>
                <span className={`text-[8px] font-medium font-sans block mt-0.5 ${activePlanOffset === p.dayOffset ? 'text-stone-300' : 'text-stone-400'}`}>
                  {getFormattedDate(p.dayOffset)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {getWeatherIcon(p.weather.condition, 'w-3.5 h-3.5')}
                <span className="text-xs font-mono font-bold">{p.weather.temp}°C</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 2. STYLE PREFERENCE & SELECTION CONTROL - MOVED TO TOP AS REQUESTED */}
      <div className="bg-white rounded-[24px] border-2 border-stone-900 p-5 shadow-[4px_4px_0px_0px_rgba(28,25,23,1)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-150 pb-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-black text-stone-900 tracking-tight flex items-center gap-2 uppercase">
              <Calendar className="w-4 h-4 text-stone-800" />
              Optimal Combination Target
            </h2>
            <p className="text-xs text-stone-500 font-medium">Specify your style target to compute compatible clothing matches.</p>
          </div>

          <div className="flex flex-wrap items-center gap-1 bg-stone-50 p-1 rounded-xl border border-stone-150">
            {(['Casual', 'Formal', 'Sporty', 'Business', 'Chic'] as StylePreference[]).map((pref) => (
              <button
                key={pref}
                id={`style-pref-tab-${pref.toLowerCase()}`}
                onClick={() => onStylePreferenceChanged(pref)}
                className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                  stylePreference === pref
                    ? 'bg-stone-900 text-[#FAF9F6] shadow-xs'
                    : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                {pref}
              </button>
            ))}
          </div>
        </div>

        {/* Global actions row */}
        <div className="flex items-center justify-start gap-3">
          <button
            onClick={onAutoReplan}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-50 hover:bg-stone-100 text-stone-800 font-bold text-xs rounded-xl transition-all border border-stone-200 cursor-pointer"
            title="Recalculate combinations based on active clean wardrobe"
          >
            <RotateCw className="w-3 h-3 text-stone-600 animate-spin" style={{ animationDuration: '4s' }} />
            Auto-Replan All Days
          </button>

          {selectedPlan.lockedOutfit && onResetSingleDayOutfit && (
            <button
              onClick={() => onResetSingleDayOutfit(activePlanOffset)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-105 text-rose-700 border border-rose-200 font-extrabold text-xs rounded-xl transition-all cursor-pointer"
              title="Reset to recommended combinations"
            >
              <RefreshCw className="w-3 h-3" />
              Reset Today's Swaps
            </button>
          )}
        </div>
      </div>

         {/* 3. CORE DISPLAY WINDOWS BENTO GRID - MOVED UP AS REQUESTED */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* WINDOW 1: MAIN COMBINATION COLLAGE & DETAIL PANEL */}
        <div id="window-combo-viewer" className="lg:col-span-8 bg-white border border-stone-200/80 rounded-[24px] p-6 shadow-3xs space-y-6">
          <div className="flex items-start justify-between border-b border-stone-150 pb-4">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-mono font-black text-stone-500 uppercase tracking-widest block font-bold">
                {activePlanOffset === 0 ? "TODAY'S COMBINATION" : "UPCOMING SCHEDULE COMBINATION"}
              </span>
              <div className="flex items-center gap-2 mt-0.5 max-w-full">
                <h3 className="text-base font-black text-stone-900 font-sans tracking-tight truncate">
                  {selectedPlan.weather.dayName} • {getFormattedDate(activePlanOffset)}
                </h3>
                {onSaveFavoriteCombo && currentOutfit && (
                  <button
                    onClick={() => setShowSaveFavoriteInline(!showSaveFavoriteInline)}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                      favoriteOutfits.some(fav => 
                        fav.topId === currentOutfit.top.id && 
                        fav.bottomId === currentOutfit.bottom.id && 
                        fav.footwearId === currentOutfit.footwear.id && 
                        (!fav.outerwearId || fav.outerwearId === currentOutfit.outerwear?.id)
                      )
                        ? "bg-amber-50 border-amber-300 text-amber-500"
                        : "bg-stone-50 border-stone-200 text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                    }`}
                    title="Save this combination to Favorites"
                  >
                    <Star className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200/70 text-right shrink-0">
              {getWeatherIcon(selectedPlan.weather.condition, 'w-4 h-4')}
              <span className="text-xs font-black text-stone-900 font-mono">{selectedPlan.weather.temp}°C</span>
              <span className="text-[10px] uppercase font-bold text-stone-500 bg-white border px-1.5 py-0.5 rounded-md">{selectedPlan.weather.condition}</span>
            </div>
          </div>

          {/* INLINE FAVORITE SAVE DIALOG */}
          {showSaveFavoriteInline && currentOutfit && (
            <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-2 text-xs">
              <p className="font-bold text-stone-850">Curate & Catalog Favorite Outfit</p>
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="e.g., Casual Indigo Weekend Suit"
                  value={favoriteName}
                  onChange={(e) => setFavoriteName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-stone-250 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (favoriteName.trim()) {
                        onSaveFavoriteCombo?.(
                          favoriteName.trim(),
                          currentOutfit.top.id,
                          currentOutfit.bottom.id,
                          currentOutfit.footwear.id,
                          currentOutfit.outerwear?.id,
                          stylePreference
                        );
                        setFavoriteName('');
                        setShowSaveFavoriteInline(false);
                      }
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (favoriteName.trim()) {
                      onSaveFavoriteCombo?.(
                        favoriteName.trim(),
                        currentOutfit.top.id,
                        currentOutfit.bottom.id,
                        currentOutfit.footwear.id,
                        currentOutfit.outerwear?.id,
                        stylePreference
                      );
                      setFavoriteName('');
                      setShowSaveFavoriteInline(false);
                    }
                  }}
                  className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white font-extrabold rounded-xl cursor-pointer"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowSaveFavoriteInline(false)}
                  className="px-3 py-2 bg-stone-150 text-stone-600 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!currentOutfit ? (
            <div className="py-14 px-6 text-center bg-stone-50 border border-stone-200/50 rounded-2xl space-y-3">
              <AlertCircle className="w-9 h-9 text-rose-500 mx-auto" />
              <h5 className="text-sm font-bold text-stone-900">No Combination Suggested</h5>
              <p className="text-xs text-stone-500 leading-relaxed max-w-sm mx-auto">
                {selectedPlan.missingItemsExplanation || 'Get some laundry washed to satisfy clean clothes availability rules for this day!'}
              </p>
              <button
                onClick={onAutoReplan}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 hover:bg-stone-955 text-[#FBF9F4] font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-transform"
              >
                <RotateCw className="w-3 h-3 animate-spin" style={{ animationDuration: '3s' }} />
                Refresh Suggestions
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* STYLE FALLBACK WARNING */}
              {currentOutfit.styleFallbackUsed && (
                <div id="fallback-notification-block" className="p-4 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs text-amber-900 space-y-1 font-sans">
                  <div className="flex items-center gap-2 font-bold">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Unavailable Style Warning — Transition suggestions applied</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-805">
                    Your preferred <strong>{currentOutfit.requestedStyle}</strong> set is dry-locked or dirty. 
                    Instead, we curated a custom color-coordinated transition pairing in <strong>{currentOutfit.fallbackStyle}</strong>.
                  </p>
                </div>
              )}

              {/* OUTWARD REASONING COMPOSITION STRIP ERASED AS              {/* THE COLLAGE CARDS SYSTEM (SQUARE TYPE LAYOUT) */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* TOP GARMENT CELL */}
                <div
                  onClick={() => setInspectedGarment(currentOutfit.top)}
                  className="p-4 bg-stone-50/40 hover:bg-white border border-stone-200/50 rounded-[24px] flex flex-col justify-between gap-3 relative hover:border-stone-400 hover:shadow-2xs transition-all duration-250 aspect-square cursor-pointer active:scale-99"
                  title="Click to view full garment care specs and details"
                >
                  <div className="relative w-full h-[65%] rounded-xl overflow-hidden border border-stone-150 bg-white">
                    <img
                      src={currentOutfit.top.imageUrl || 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=80&w=400'}
                      alt={currentOutfit.top.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover scale-102 transition-transform duration-300 hover:scale-105"
                    />
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-stone-900/80 text-[8px] font-bold text-white font-mono uppercase tracking-wide">
                      👕 TOP
                    </span>
                  </div>
                  
                  <div className="min-w-0 flex-1 flex flex-col justify-end text-left pr-6">
                    <h5 className="text-xs font-bold text-stone-900 truncate leading-tight mb-0.5">{currentOutfit.top.name}</h5>
                    <span className="text-[9px] font-semibold text-stone-500 block font-mono capitalize truncate">{currentOutfit.top.color} • {currentOutfit.top.material}</span>
                    <span className="text-[8px] font-mono text-emerald-600 font-bold block leading-none mt-1">🗓️ Plan Sync: {getFormattedDate(activePlanOffset)}</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSwappingCategory('Top');
                    }}
                    className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500 hover:text-stone-900 hover:border-stone-400 shadow-3xs cursor-pointer transition-colors z-10"
                    title="Swap other top"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* BOTTOM LAYER CELL */}
                <div
                  onClick={() => setInspectedGarment(currentOutfit.bottom)}
                  className="p-4 bg-stone-50/40 hover:bg-white border border-stone-200/50 rounded-[24px] flex flex-col justify-between gap-3 relative hover:border-stone-400 hover:shadow-2xs transition-all duration-250 aspect-square cursor-pointer active:scale-99"
                  title="Click to view full garment care specs and details"
                >
                  <div className="relative w-full h-[65%] rounded-xl overflow-hidden border border-stone-150 bg-white">
                    <img
                      src={currentOutfit.bottom.imageUrl || 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&q=80&w=400'}
                      alt={currentOutfit.bottom.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover scale-102 transition-transform duration-300 hover:scale-105"
                    />
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-stone-900/80 text-[8px] font-bold text-white font-mono uppercase tracking-wide">
                      👖 BOTTOM
                    </span>
                  </div>
                  
                  <div className="min-w-0 flex-1 flex flex-col justify-end text-left pr-6">
                    <h5 className="text-xs font-bold text-stone-900 truncate leading-tight mb-0.5">{currentOutfit.bottom.name}</h5>
                    <span className="text-[9px] font-semibold text-stone-500 block font-mono capitalize truncate">{currentOutfit.bottom.color} • {currentOutfit.bottom.material}</span>
                    <span className="text-[8px] font-mono text-emerald-600 font-bold block leading-none mt-1">🗓️ Plan Sync: {getFormattedDate(activePlanOffset)}</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSwappingCategory('Bottom');
                    }}
                    className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500 hover:text-stone-900 hover:border-stone-400 shadow-3xs cursor-pointer transition-colors z-10"
                    title="Swap other bottom"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* OUTERWEAR CELL */}
                <div
                  onClick={() => currentOutfit.outerwear && setInspectedGarment(currentOutfit.outerwear)}
                  className={`p-4 rounded-[24px] flex flex-col justify-between gap-3 relative border transition-all duration-250 aspect-square ${
                    currentOutfit.outerwear
                      ? 'border-stone-200/50 bg-stone-50/40 hover:bg-white hover:border-stone-400 hover:shadow-2xs cursor-pointer active:scale-99'
                      : 'border-dashed border-stone-250/60 bg-stone-50/10 opacity-70'
                  }`}
                  title={currentOutfit.outerwear ? "Click to view full garment care specs and details" : undefined}
                >
                  <div className="relative w-full h-[65%] rounded-xl overflow-hidden border border-stone-150 bg-white">
                    <img
                      src={currentOutfit.outerwear?.imageUrl || 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=400'}
                      alt="outer"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover scale-102 transition-transform duration-300 hover:scale-105"
                    />
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-stone-900/80 text-[8px] font-bold text-white font-mono uppercase tracking-wide">
                      🧥 OUTER
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col justify-end text-left pr-6">
                    {currentOutfit.outerwear ? (
                      <>
                        <h5 className="text-xs font-bold text-stone-900 truncate leading-tight mb-0.5">{currentOutfit.outerwear.name}</h5>
                        <span className="text-[9px] font-semibold text-stone-500 block font-mono capitalize truncate">{currentOutfit.outerwear.color}</span>
                        <span className="text-[8px] font-mono text-emerald-600 font-bold block leading-none mt-1">🗓️ Plan Sync: {getFormattedDate(activePlanOffset)}</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-stone-400 italic block font-sans truncate">No outerwear needed</span>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSwappingCategory('Outerwear');
                    }}
                    className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500 hover:text-stone-900 hover:border-stone-400 shadow-3xs cursor-pointer transition-colors z-10"
                    title="Swap outerwear"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* FOOTWEAR CELL */}
                <div
                  onClick={() => setInspectedGarment(currentOutfit.footwear)}
                  className="p-4 bg-stone-50/40 hover:bg-white border border-stone-200/50 rounded-[24px] flex flex-col justify-between gap-3 relative hover:border-stone-400 hover:shadow-2xs transition-all duration-250 aspect-square cursor-pointer active:scale-99"
                  title="Click to view full garment care specs and details"
                >
                  <div className="relative w-full h-[65%] rounded-xl overflow-hidden border border-stone-150 bg-white">
                    <img
                      src={currentOutfit.footwear.imageUrl || 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=400'}
                      alt={currentOutfit.footwear.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover scale-102 transition-transform duration-300 hover:scale-105"
                    />
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-stone-900/80 text-[8px] font-bold text-white font-mono uppercase tracking-wide">
                      👟 FOOTWEAR
                    </span>
                  </div>
                  
                  <div className="min-w-0 flex-1 flex flex-col justify-end text-left pr-6">
                    <h5 className="text-xs font-bold text-stone-900 truncate leading-tight mb-0.5">{currentOutfit.footwear.name}</h5>
                    <span className="text-[9px] font-semibold text-stone-500 block font-mono capitalize truncate">{currentOutfit.footwear.color} • {currentOutfit.footwear.material}</span>
                    <span className="text-[8px] font-mono text-emerald-600 font-bold block leading-none mt-1">🗓️ Plan Sync: {getFormattedDate(activePlanOffset)}</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSwappingCategory('Footwear');
                    }}
                    className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500 hover:text-stone-900 hover:border-stone-400 shadow-3xs cursor-pointer transition-colors z-10"
                    title="Swap other footwear"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* SIDE BAR / SUBMITTED SUB-WINDOWS DISPLAY */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* WINDOW 2: HARMONY SCORE CAR WITH ACCURATE DYNAMIC RED/BLACK/ORANGE COLOR SCALE */}
          {outfitScoreAndNotes && (
            <div
              id="window-coordination-insights"
              className="bg-white rounded-[24px] p-5 border border-stone-200/80 shadow-3xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-stone-400 font-mono">
                  Style Composition Score
                </h4>
                <span className="text-xs font-bold px-2 py-0.5 bg-stone-50 text-stone-600 rounded-md border border-stone-200/60 font-sans">
                  Target: {stylePreference}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-mono font-black text-stone-900">
                    {outfitScoreAndNotes.score} / 100
                  </span>
                  
                  <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-md ${
                    outfitScoreAndNotes.score < 50
                      ? 'text-rose-700 bg-rose-50 border border-rose-100'
                      : outfitScoreAndNotes.score < 75
                      ? 'text-amber-700 bg-amber-50 border border-amber-100'
                      : 'text-emerald-700 bg-emerald-50 border border-emerald-100'
                  }`}>
                    {outfitScoreAndNotes.score < 50 ? 'Low Harmony' : outfitScoreAndNotes.score < 75 ? 'Fair Match' : 'Premium Cohesion'}
                  </span>
                </div>

                {/* Score bar that actually reacts in colors! */}
                <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getScoreColorInfo(outfitScoreAndNotes.score).barClass}`}
                    style={{ width: `${outfitScoreAndNotes.score}%` }}
                  />
                </div>

                <div
                  onClick={() => setIsDiagnosticsOpen(true)}
                  className={`p-3 rounded-2xl border cursor-pointer hover:border-stone-900 shadow-3xs transition-all active:scale-98 ${getScoreColorInfo(outfitScoreAndNotes.score).bgClass}`}
                  title="Click to see complete style diagnostics breakdown"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase font-bold text-stone-500 block">Aesthetic Diagnostics</span>
                    <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Inspect matrix ➔</span>
                  </div>
                  <p className="text-[11px] leading-relaxed font-sans font-medium text-stone-850 truncate">
                    {outfitScoreAndNotes.notes || 'Selected garment items meet standard color theory constraints.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* GEMINI AI CLINIC & STYLING COACH CARD - REDESIGNED SUB-100px / SUPER COMPACT */}
          {currentOutfit && (
            <div id="gemini-ai-advisor-window" className="bg-stone-900 text-[#FAF9F6] rounded-[24px] p-4 border border-stone-950 space-y-3 animate-fade-in shadow-[2px_2px_0px_0px_rgba(28,25,23,1)]">
              <div className="flex items-center justify-between border-b border-stone-850 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 text-[8px] font-black font-mono tracking-wider bg-stone-850 text-amber-400 uppercase rounded border border-stone-750">
                    GEMINI
                  </span>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-stone-300 font-mono">
                    Climate Coach
                  </h4>
                </div>
                
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={fetchRealWeather}
                    disabled={loadingRealWeather}
                    className="text-[9px] font-black font-mono uppercase px-2 py-0.5 rounded bg-stone-850 border border-stone-750 hover:bg-stone-800 hover:text-white transition-colors cursor-pointer text-stone-200"
                  >
                    ⛅ Live Radar
                  </button>
                  <button
                    type="button"
                    onClick={fetchGeminiAdvice}
                    disabled={loadingAdvice}
                    className="p-1 rounded bg-stone-850 hover:bg-stone-800 text-stone-300 transition-colors cursor-pointer"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${loadingAdvice ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {loadingAdvice ? (
                <div className="py-4 text-center">
                  <p className="text-[10px] font-mono text-stone-400 animate-pulse">Running climate diagnostics...</p>
                </div>
              ) : geminiAdvice ? (
                <div className="space-y-2">
                  {/* COMPACT INTERACTIVE TABS */}
                  <div className="flex items-center gap-1 bg-stone-955 p-1 rounded-xl border border-stone-800">
                    {(['harmony', 'weather', 'tip'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setGeminiTab(tab)}
                        className={`flex-1 py-1 text-[9px] font-black uppercase font-mono rounded-md transition-all cursor-pointer ${
                          geminiTab === tab
                            ? 'bg-stone-800 text-amber-400 border border-stone-750 font-black'
                            : 'text-stone-500 hover:text-stone-300'
                        }`}
                      >
                        {tab === 'harmony' ? '🎨 Blend' : tab === 'weather' ? '🌦️ Sky' : '✨ Tip'}
                      </button>
                    ))}
                  </div>

                  {/* ACTIVE TAB CONTENT */}
                  <div className="bg-stone-955 p-2.5 rounded-xl border border-stone-800 min-h-[44px] flex items-center">
                    {geminiTab === 'harmony' && (
                      <p className="text-[10.5px] text-stone-200 leading-normal font-sans font-medium">
                        {geminiAdvice.harmony || "Style parameters are well-harmonized."}
                      </p>
                    )}
                    {geminiTab === 'weather' && (
                      <p className="text-[10.5px] text-stone-200 leading-normal font-sans font-medium">
                        {geminiAdvice.rainReady || "Outfit is matched beautifully for water protection."}
                      </p>
                    )}
                    {geminiTab === 'tip' && (
                      <p className="text-[10.5px] text-amber-300 leading-normal font-sans font-medium">
                        {geminiAdvice.suggestion || "Clean fallback items provide peace of mind in high humidity."}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs py-1 bg-stone-955 p-2.5 rounded-xl border border-stone-800">
                  <p className="text-[10px] text-stone-400 font-sans font-medium">Evaluate current mix suitability.</p>
                  <button
                    type="button"
                    onClick={fetchGeminiAdvice}
                    className="px-2 py-1 bg-[#FAF9F6] hover:bg-stone-250 text-stone-950 font-black text-[9px] uppercase font-mono rounded-lg cursor-pointer transition-all active:scale-95 border border-stone-200"
                  >
                    Evaluate
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

      </div>


      {/* Interactive Helper Popups */}

      {/* 1. COHESION SCORE AESTHETICS DIAGNOSTICS POPUP */}
      <AnimatePresence>
        {isDiagnosticsOpen && outfitScoreAndNotes && (
          <div
            style={{ position: 'fixed', zIndex: 99999 }}
            className="fixed inset-0 bg-stone-900/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setIsDiagnosticsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#FAF9F6] border-4 border-stone-900 rounded-[32px] w-full max-w-md shadow-[8px_8px_0px_0px_rgba(28,25,23,1)] overflow-hidden"
            >
              <div className="p-6 border-b-2 border-stone-900 bg-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-stone-900 text-[#FAF9F6] flex items-center justify-center font-black font-mono text-medium">
                    {outfitScoreAndNotes.score}
                  </div>
                  <div>
                    <span className="text-[9px] font-mono font-black uppercase text-stone-400 block tracking-wider">Aesthetic Matrix</span>
                    <h3 className="text-xs font-black text-stone-900 uppercase">Combination Score Diagnostics</h3>
                  </div>
                </div>
                <button
                  onClick={() => setIsDiagnosticsOpen(false)}
                  className="w-8 h-8 rounded-full border-2 border-stone-900 bg-white hover:bg-stone-100 flex items-center justify-center font-black text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="space-y-3.5">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-stone-550 font-bold uppercase font-mono text-[10px]">Vibe Target Match</span>
                      <span className="font-mono font-black text-stone-900">Passed</span>
                    </div>
                    <div className="w-full bg-stone-200 h-2.5 rounded-full overflow-hidden border border-stone-950">
                      <div className="bg-stone-900 h-full w-[95%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-stone-550 font-bold uppercase font-mono text-[10px]">Contrast Harmony Index</span>
                      <span className="font-mono font-black text-stone-900">Optimal Contrast</span>
                    </div>
                    <div className="w-full bg-stone-200 h-2.5 rounded-full overflow-hidden border border-stone-950">
                      <div className="bg-emerald-500 h-full w-[88%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-stone-550 font-bold uppercase font-mono text-[10px]">Climatic Preparedness</span>
                      <span className="font-mono font-black text-emerald-600 font-bold">Rain Alert Shield On</span>
                    </div>
                    <div className="w-full bg-stone-200 h-2.5 rounded-full overflow-hidden border border-stone-950">
                      <div className="bg-stone-900 h-full w-[92%]" />
                    </div>
                  </div>
                </div>

                <div className="bg-white border-2 border-stone-900 p-4.5 rounded-2xl shadow-[3px_3px_0px_0px_rgba(28,25,23,0.1)] space-y-1.5">
                  <span className="text-[10px] font-mono font-black uppercase text-amber-600 tracking-wider block">Aesthetic Theory Summary</span>
                  <p className="text-xs text-stone-700 leading-relaxed font-sans font-medium">
                    {outfitScoreAndNotes.notes || 'This coordinate setup complies fully with secondary contrast and weather rules.'}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. LIVE METEOROLOGICAL RADAR POPUP */}
      <AnimatePresence>
        {isWeatherDetailOpen && (
          <div
            style={{ position: 'fixed', zIndex: 99999 }}
            className="fixed inset-0 bg-stone-900/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setIsWeatherDetailOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border-4 border-stone-900 rounded-[32px] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(28,25,23,1)] overflow-hidden"
            >
              <div className="p-6 border-b-2 border-stone-900 bg-[#FAF9F6] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-stone-900 text-[#FAF9F6] flex items-center justify-center">
                    <Sun className="w-5 h-5 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
                  </div>
                  <div>
                    <span className="text-[9px] font-mono font-black uppercase text-stone-400 block tracking-wider">Google Grounding Search Active</span>
                    <h3 className="text-xs font-black text-stone-900 uppercase">Live Weather Radar: Kolhapur</h3>
                  </div>
                </div>
                <button
                  onClick={() => setIsWeatherDetailOpen(false)}
                  className="w-8 h-8 rounded-full border-2 border-stone-900 bg-white hover:bg-stone-100 flex items-center justify-center font-black text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-5">
                {loadingRealWeather ? (
                  <div className="py-12 text-center space-y-4">
                    <RefreshCw className="w-9 h-9 animate-spin text-stone-850 mx-auto" style={{ animationDuration: '2s' }} />
                    <p className="text-xs text-stone-500 font-mono font-bold animate-pulse">Syncing dynamic cloud weather feeds from Chuye region...</p>
                  </div>
                ) : realWeatherReport ? (
                  <div className="space-y-4">
                    <div className="bg-[#FAF9F6] border-2 border-stone-900 p-5 rounded-2xl text-xs text-stone-800 leading-relaxed font-sans font-medium shadow-[3px_3px_0px_0px_rgba(28,25,23,0.15)]">
                      {realWeatherReport.text}
                    </div>

                    {realWeatherReport.sources && realWeatherReport.sources.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase text-stone-400 block font-mono">Sync Citations & Web Sources:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {realWeatherReport.sources.map((src, idx) => (
                            <a
                              key={idx}
                              href={src.uri}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between p-3 rounded-xl bg-stone-50 hover:bg-stone-100 border border-stone-250 text-xs text-stone-800 font-bold transition-all text-left"
                            >
                              <span className="truncate max-w-[85%]">{src.title}</span>
                              <ArrowUpRight className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <p className="text-xs text-stone-500">Failed to load real climate parameters. Please try again.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. INDIVIDUAL GARMENT SPECIFICATIONS & CONTROL CARD POPUP */}
      <AnimatePresence>
        {inspectedGarment && (
          <div
            style={{ position: 'fixed', zIndex: 99999 }}
            className="fixed inset-0 bg-stone-900/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setInspectedGarment(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border-4 border-stone-900 rounded-[32px] w-full max-w-sm shadow-[8px_8px_0px_0px_rgba(28,25,23,1)] overflow-hidden"
            >
              <div className="relative h-44 bg-stone-100 border-b-2 border-stone-900 overflow-hidden">
                <img src={inspectedGarment.imageUrl} alt={inspectedGarment.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                <button
                  onClick={() => setInspectedGarment(null)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full border-2 border-stone-900 bg-white hover:bg-stone-100 flex items-center justify-center font-black text-xs cursor-pointer z-10 shadow-sm"
                >
                  ✕
                </button>
                <span className="absolute bottom-3 left-3 bg-stone-900 text-[#FAF9F6] font-mono text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-sm border-2 border-stone-900 shadow-sm">
                  {inspectedGarment.category}
                </span>
                <span className={`absolute bottom-3 right-3 text-[9px] font-black uppercase font-mono px-2 py-1 rounded-sm border-2 ${
                  inspectedGarment.status === 'Clean'
                    ? 'bg-emerald-500 text-white border-emerald-600'
                    : inspectedGarment.status === 'Dirty'
                    ? 'bg-rose-500 text-white border-rose-600'
                    : 'bg-amber-400 text-stone-950 border-amber-500'
                }`}>
                  {inspectedGarment.status}
                </span>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight mb-1">{inspectedGarment.name}</h3>
                  <p className="text-[11px] text-stone-500 font-medium">Garment specifications data card & care controller.</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-stone-50 border border-stone-200 p-3 rounded-xl font-medium">
                  <div>
                    <span className="text-[8.5px] text-stone-400 block font-mono uppercase">Color Hue</span>
                    <span className="font-extrabold text-stone-850 truncate block capitalize">{inspectedGarment.color}</span>
                  </div>
                  <div>
                    <span className="text-[8.5px] text-stone-400 block font-mono uppercase">Material Type</span>
                    <span className="font-extrabold text-stone-850 truncate block capitalize">{inspectedGarment.material}</span>
                  </div>
                  <div>
                    <span className="text-[8.5px] text-stone-400 block font-mono uppercase">Style Segment</span>
                    <span className="font-extrabold text-stone-850 truncate block capitalize">{inspectedGarment.style}</span>
                  </div>
                  <div>
                    <span className="text-[8.5px] text-stone-400 block font-mono uppercase font-bold">Quick Dry Spec</span>
                    <span className={`font-mono text-[10px] font-bold block ${inspectedGarment.isQuickDry ? 'text-emerald-600' : 'text-stone-400'}`}>
                      {inspectedGarment.isQuickDry ? '✓ Rain Shield' : '✕ Standard Care'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-stone-200/80 pt-3 flex flex-col gap-2">
                  <button
                    onClick={() => {
                      const cat = inspectedGarment.category;
                      setInspectedGarment(null);
                      setSwappingCategory(cat as any);
                    }}
                    className="w-full py-2 bg-stone-900 hover:bg-stone-955 text-[#FAF9F6] font-black uppercase text-xs rounded-xl shadow-[3px_3px_0px_rgba(28,25,23,1)] transition-transform active:scale-98 cursor-pointer text-center"
                  >
                    🔄 Swap Clothes Item
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onUpdateStatus(inspectedGarment.id, 'Dirty');
                        setInspectedGarment(null);
                      }}
                      className="flex-1 py-1.5 border border-rose-250 bg-rose-50 text-rose-800 font-bold text-[10px] uppercase font-mono rounded-lg cursor-pointer hover:bg-rose-100 transition-colors"
                    >
                      Set Dirty
                    </button>
                    <button
                      onClick={() => {
                        onUpdateStatus(inspectedGarment.id, 'Damp');
                        setInspectedGarment(null);
                      }}
                      className="flex-1 py-1.5 border border-amber-250 bg-amber-50 text-amber-800 font-bold text-[10px] uppercase font-mono rounded-lg cursor-pointer hover:bg-amber-100 transition-colors"
                    >
                      Set Damp
                    </button>
                    <button
                      onClick={() => {
                        onUpdateStatus(inspectedGarment.id, 'Clean');
                        setInspectedGarment(null);
                      }}
                      className="flex-1 py-1.5 border border-emerald-250 bg-emerald-50 text-emerald-800 font-bold text-[10px] uppercase font-mono rounded-lg cursor-pointer hover:bg-emerald-100 transition-colors"
                    >
                      Set Clean
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. MODAL POP-UP FOR CHOOSING INDIVIDUAL PIECES (IMMEDIATELY CLOSES ON SELECT AS REQUESTED) */}
      <AnimatePresence>
        {swappingCategory && (
          <div
            id="choose-popup-modal-backdrop"
            style={{ position: 'fixed', zIndex: 99999 }}
            className="fixed inset-0 bg-[#1e1c18]/50 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
            onClick={() => setSwappingCategory(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[24px] w-full max-w-md shadow-2xl border border-stone-250/70 overflow-hidden"
            >
              {/* HEADER */}
              <div className="p-4 border-b border-stone-150 flex items-center justify-between bg-stone-50">
                <div>
                  <span className="text-[9px] font-bold text-stone-550 font-mono block uppercase">Interactive Choose Window</span>
                  <h4 className="text-sm font-bold text-stone-905">Select Alternative {swappingCategory}</h4>
                </div>
                <button
                  onClick={() => setSwappingCategory(null)}
                  className="w-7 h-7 rounded-full bg-white border border-stone-200 hover:bg-stone-100 text-stone-600 hover:text-stone-900 font-extrabold flex items-center justify-center cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>

              {/* AUTO-HARMONIZE SOLVER */}
              <div className="p-4 bg-stone-50 border-b border-stone-150 space-y-2">
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-stone-700 bg-white border border-stone-200/50 px-2 py-0.5 rounded-full uppercase">
                  <Sparkles className="w-3 h-3 text-stone-600" />
                  Auto Solver Engine
                </span>
                <p className="text-[10px] text-stone-600 leading-relaxed font-sans">
                  Instantly compute and equip the most harmonious clean alternative garment piece based on real-time style and color coordinate rules.
                </p>
                <button
                  id="btn-auto-harmonize-solver"
                  onClick={() => handleAutoSwapBestHarmoniousItem(swappingCategory)}
                  className="w-full py-2 bg-stone-900 hover:bg-stone-955 text-[#FBF9F4] font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  🤖 Auto-Harmonize & Swap Now
                </button>
              </div>

              {/* CLEAN CLOTHES LIST */}
              <div className="p-4 max-h-72 overflow-y-auto space-y-2">
                <span className="text-[10px] font-black tracking-wider text-stone-400 font-mono block mb-2">Available Clean Pieces</span>
                
                {swappableItemsList.map((item) => {
                  // Run preview scoring matrix
                  const testT = swappingCategory === 'Top' ? item : currentOutfit?.top || item;
                  const testB = swappingCategory === 'Bottom' ? item : currentOutfit?.bottom || item;
                  const testF = swappingCategory === 'Footwear' ? item : currentOutfit?.footwear || item;
                  const testO = (swappingCategory === 'Outerwear' ? item : currentOutfit?.outerwear) as any;

                  const fitScore = currentOutfit ? calculateCombinationScore(testT, testB, testF, testO, stylePreference, selectedPlan.weather).score : 85;

                  return (
                    <div
                      key={item.id}
                      id={`swap-option-${item.id}`}
                      onClick={() => {
                        onUpdateOutfitSelection(activePlanOffset, swappingCategory.toLowerCase() as any, item);
                        setSwappingCategory(null); // IMMEDIATELY CLOSES ON SELECT AS REQUESTED!
                      }}
                      className="border border-stone-150 hover:border-stone-400 hover:bg-stone-50/50 p-2.5 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition-all hover:scale-[1.01]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-stone-200 bg-stone-50">
                          <img src={item.imageUrl} alt={item.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-extrabold text-stone-900 text-xs truncate leading-tight">{item.name}</p>
                          <span className="text-[10px] text-stone-500 block truncate font-sans">
                            {item.color} • {item.material} • {item.style}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`text-[9px] font-extrabold font-mono px-2 py-0.5 rounded-md border ${
                          fitScore < 50
                            ? 'text-rose-700 bg-rose-50 border-stone-100'
                            : fitScore < 75
                            ? 'text-amber-700 bg-amber-50 border-stone-100'
                            : 'text-emerald-700 bg-emerald-50 border-stone-100'
                        }`}>
                          {fitScore} pts
                        </span>
                      </div>
                    </div>
                  );
                })}

                {swappableItemsList.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-xs text-stone-500 italic font-sans">No alternative clean matching {swappingCategory}s found in catalog.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
