/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { ClothingItem, WeatherForecast, DailyPlan, StylePreference, ClothingStatus, Outfit } from './types';
import { INITIAL_WARDROBE, CHUYE_KOLHAPUR_FORECAST } from './data';
import { generateOutfitSuggestion, getAvailableItemsForDay } from './utils/outfitEngine';
import { Shirt, CheckCircle, RefreshCw, Sparkles, Thermometer, CloudRain, Sun, LayoutGrid, Calendar, LogIn, Sparkle, ArrowRight, WashingMachine, Star, Trash2, Coins, Moon, Bed, Coffee } from 'lucide-react';
import WardrobeCatalog from './components/WardrobeCatalog';
import SchedulePlannerView from './components/SchedulePlannerView';
import { motion, AnimatePresence } from 'motion/react';

const LOCAL_STORAGE_KEY_WARDROBE = 'weather_wardrobe_items_v2';
const LOCAL_STORAGE_KEY_STYLE = 'weather_wardrobe_style_v2';
const LOCAL_STORAGE_KEY_LAUNDRY_TIMES = 'weather_wardrobe_laundry_times_v2';
const LOCAL_STORAGE_KEY_AUTO_CYCLE = 'weather_wardrobe_auto_cycle_v2';
const LOCAL_STORAGE_KEY_FAVORITES = 'weather_wardrobe_favorites_v3';

export interface FavoriteOutfit {
  id: string;
  name: string;
  topId: string;
  bottomId: string;
  footwearId: string;
  outerwearId?: string;
  style: StylePreference;
}

export default function App() {
  // --- 1. Master React States ---
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY_WARDROBE);
    return saved ? JSON.parse(saved) : INITIAL_WARDROBE;
  });

  // Default to our customized location of Chuye based in Kolhapur, Maharashtra
  const [currentCity] = useState('Chuye, Kolhapur (Maharashtra)');
  const [forecasts] = useState<WeatherForecast[]>(CHUYE_KOLHAPUR_FORECAST);

  const [stylePreference, setStylePreference] = useState<StylePreference>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY_STYLE);
    return (saved as StylePreference) || 'Casual';
  });

  const [isLaundryAutoCycle, setIsLaundryAutoCycle] = useState<boolean>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY_AUTO_CYCLE);
    return saved !== null ? JSON.parse(saved) : true; // Default to true for premium automated simplicity
  });

  const [itemsGoingToWashToday, setItemsGoingToWashToday] = useState<string[]>([]);
  const [activeLaundryTimes, setActiveLaundryTimes] = useState<{ [id: string]: number }>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY_LAUNDRY_TIMES);
    return saved ? JSON.parse(saved) : {};
  });

  const [pinnedOutfitSelections, setPinnedOutfitSelections] = useState<{ [dayOffset: number]: Outfit }>({});
  const [isWardrobePopupOpen, setIsWardrobePopupOpen] = useState(false);

  // Favorite Combinations State initialized dynamically to handle initial setup cleanly
  const [favoriteOutfits, setFavoriteOutfits] = useState<FavoriteOutfit[]>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY_FAVORITES);
    if (saved) return JSON.parse(saved);
    return [
      {
        id: 'fav-1',
        name: 'Signature Casual Wear',
        topId: 'top-6',
        bottomId: 'bot-2',
        footwearId: 'foot-1',
        style: 'Casual'
      },
      {
        id: 'fav-2',
        name: 'Active Rainproof Runner',
        topId: 'top-4',
        bottomId: 'bot-1',
        footwearId: 'foot-1',
        outerwearId: 'out-1',
        style: 'Sporty'
      }
    ];
  });

  // Coin Toss decider states
  const [isCoinTossing, setIsCoinTossing] = useState(false);
  const [coinResult, setCoinResult] = useState<'Heads' | 'Tails' | null>(null);
  const [showCoinPopup, setShowCoinPopup] = useState(false);
  const [coinRecommendation, setCoinRecommendation] = useState<{
    title: string;
    description: string;
    outfit?: Outfit;
  } | null>(null);

  // --- Night & Morning Cycle States ---
  const [currentCyclePhase, setCurrentCyclePhase] = useState<'day' | 'night'>(() => {
    return (localStorage.getItem('weather_wardrobe_cycle_phase') as 'day' | 'night') || 'day';
  });

  const [wornDayOutfitIds, setWornDayOutfitIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('weather_wardrobe_worn_day_ids');
    return saved ? JSON.parse(saved) : [];
  });

  const [wornNightwearId, setWornNightwearId] = useState<string | null>(() => {
    return localStorage.getItem('weather_wardrobe_worn_night_id') || null;
  });

  const [selectedNightwearId, setSelectedNightwearId] = useState<string>('');

  // --- 2. Persistent Storage Effects ---
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_WARDROBE, JSON.stringify(wardrobe));
  }, [wardrobe]);

  useEffect(() => {
    localStorage.setItem('weather_wardrobe_cycle_phase', currentCyclePhase);
  }, [currentCyclePhase]);

  useEffect(() => {
    localStorage.setItem('weather_wardrobe_worn_day_ids', JSON.stringify(wornDayOutfitIds));
  }, [wornDayOutfitIds]);

  useEffect(() => {
    localStorage.setItem('weather_wardrobe_worn_night_id', wornNightwearId || '');
  }, [wornNightwearId]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_FAVORITES, JSON.stringify(favoriteOutfits));
  }, [favoriteOutfits]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_STYLE, stylePreference);
  }, [stylePreference]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_LAUNDRY_TIMES, JSON.stringify(activeLaundryTimes));
  }, [activeLaundryTimes]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_AUTO_CYCLE, JSON.stringify(isLaundryAutoCycle));
  }, [isLaundryAutoCycle]);

  // --- 4. Dynamic Calculation Loop (3-Day Plans) ---
  const dailyPlans = useMemo(() => {
    const plans: DailyPlan[] = [];
    const wornItemIdsByDayOffset: { [day: number]: string[] } = {};

    // Sort forecasts by chronological dayOffset to process sequentially
    const sortedForecasts = [...forecasts].sort((a, b) => a.dayOffset - b.dayOffset);

    sortedForecasts.forEach((f) => {
      // 1. Calculate available clean items on this relative dayOffset, taking past worn selections into account!
      const availableItems = getAvailableItemsForDay(
        wardrobe,
        f.dayOffset,
        wornItemIdsByDayOffset, 
        itemsGoingToWashToday,
        activeLaundryTimes
      );

      let outfit: Outfit | undefined = undefined;
      let reasoning = "";
      let lockedOutfit = false;

      // Custom pinned override or auto recommendation
      if (pinnedOutfitSelections[f.dayOffset]) {
        outfit = pinnedOutfitSelections[f.dayOffset];
        reasoning = "Custom user outfit selection.";
        lockedOutfit = true;
      } else {
        const recommendation = generateOutfitSuggestion(availableItems, f, stylePreference);
        outfit = recommendation.outfit || undefined;
        reasoning = recommendation.reasoning;
      }

      // If an outfit is defined for this day, register its items as worn, preventing subsequent reuse
      if (outfit) {
        const ids: string[] = [outfit.top.id, outfit.bottom.id, outfit.footwear.id];
        if (outfit.outerwear) {
          ids.push(outfit.outerwear.id);
        }
        wornItemIdsByDayOffset[f.dayOffset] = ids;
      }

      plans.push({
        dayOffset: f.dayOffset,
        dateString: f.dayName,
        weather: f,
        suggestedOutfit: outfit,
        lockedOutfit,
        missingItemsExplanation: reasoning,
      });
    });

    // Return sorted back to standard relative ordering
    return plans.sort((a, b) => a.dayOffset - b.dayOffset);
  }, [forecasts, wardrobe, stylePreference, itemsGoingToWashToday, activeLaundryTimes, pinnedOutfitSelections]);

  // --- Derived Sleep & Wash Cycle Values ---
  const todayPlan = useMemo(() => dailyPlans.find((p) => p.dayOffset === 0), [dailyPlans]);
  
  const todayOutfitItems = useMemo(() => {
    if (wornDayOutfitIds.length > 0) {
      return wardrobe.filter(w => wornDayOutfitIds.includes(w.id));
    }
    if (todayPlan?.suggestedOutfit) {
      const outfit = todayPlan.suggestedOutfit;
      const arr = [outfit.top, outfit.bottom, outfit.footwear];
      if (outfit.outerwear) arr.push(outfit.outerwear);
      return arr;
    }
    return [];
  }, [wornDayOutfitIds, todayPlan, wardrobe]);

  const cleanNightwearList = useMemo(() => {
    return wardrobe.filter(w => (w.category === 'Nightwear' || w.category === 'Nightwear Top' || w.category === 'Nightwear Bottom') && w.status === 'Clean');
  }, [wardrobe]);

  const activeNightwearItem = useMemo(() => {
    return wardrobe.find(w => w.id === wornNightwearId) || null;
  }, [wornNightwearId, wardrobe]);

  const handleTransitionToNight = (nightwearId: string) => {
    setCurrentCyclePhase('night');
    setWornNightwearId(nightwearId);

    // If day outfit worn is not explicitly set, capture today's suggestion
    if (wornDayOutfitIds.length === 0 && todayPlan?.suggestedOutfit) {
      const o = todayPlan.suggestedOutfit;
      const ids = [o.top.id, o.bottom.id, o.footwear.id];
      if (o.outerwear) ids.push(o.outerwear.id);
      setWornDayOutfitIds(ids);
    }
  };

  const handleMorningLaundry = () => {
    // Collect worn items
    const idsToWash = [...wornDayOutfitIds];
    if (wornNightwearId) {
      idsToWash.push(wornNightwearId);
    }

    if (idsToWash.length > 0) {
      setWardrobe((prev) =>
        prev.map((item) => {
          if (idsToWash.includes(item.id)) {
            // Set as Dirty as requested by morning wash
            return {
              ...item,
              status: 'Dirty',
              timesWorn: (item.timesWorn || 0) + ((item.category === 'Nightwear' || item.category === 'Nightwear Top' || item.category === 'Nightwear Bottom') ? 1 : 0),
            };
          }
          return item;
        })
      );
    }

    // Reset cycle back to 'day'
    setCurrentCyclePhase('day');
    setWornDayOutfitIds([]);
    setWornNightwearId(null);
  };

  // --- 5. Handler Actions ---
  const handleAddClothingItem = (newItem: Omit<ClothingItem, 'id' | 'timesWorn'>) => {
    const id = `user-item-${Date.now()}`;
    const added: ClothingItem = {
      ...newItem,
      id,
      timesWorn: 0,
    };
    setWardrobe((prev) => [added, ...prev]);
  };

  const handleEditClothingItem = (updatedItem: ClothingItem) => {
    setWardrobe((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
  };

  const handleDeleteClothingItem = (id: string) => {
    setWardrobe((prev) => prev.filter((item) => item.id !== id));
    setActiveLaundryTimes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleUpdateClothingStatus = (id: string, newStatus: ClothingStatus) => {
    setWardrobe((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );

    if (newStatus === 'Clean') {
      setActiveLaundryTimes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleUpdateOutfitSelection = (
    dayOffset: number,
    key: 'top' | 'bottom' | 'outerwear' | 'footwear',
    item: ClothingItem
  ) => {
    setPinnedOutfitSelections((prev) => {
      const oldOutfit = prev[dayOffset] || dailyPlans.find((p) => p.dayOffset === dayOffset)?.suggestedOutfit || {
        top: wardrobe.find((w) => w.category === 'Top' && w.status === 'Clean')!,
        bottom: wardrobe.find((w) => w.category === 'Bottom' && w.status === 'Clean')!,
        footwear: wardrobe.find((w) => w.category === 'Footwear' && w.status === 'Clean')!,
      };

      const nextOutfit = { ...oldOutfit, [key]: item };
      return {
        ...prev,
        [dayOffset]: nextOutfit as Outfit,
      };
    });
  };

  const handleAutoReplan = () => {
    setPinnedOutfitSelections({});
  };

  const handleResetSingleDayOutfit = (dayOffset: number) => {
    setPinnedOutfitSelections((prev) => {
      const next = { ...prev };
      delete next[dayOffset];
      return next;
    });
  };

  const handleSaveFavoriteCombo = (
    name: string,
    topId: string,
    bottomId: string,
    footwearId: string,
    outerwearId?: string,
    style?: StylePreference
  ) => {
    const id = `fav-${Date.now()}`;
    const newFavorite: FavoriteOutfit = {
      id,
      name,
      topId,
      bottomId,
      footwearId,
      outerwearId,
      style: style || 'Casual',
    };
    setFavoriteOutfits((prev) => [newFavorite, ...prev]);
  };

  const handleEquipFavorite = (fav: FavoriteOutfit) => {
    const top = wardrobe.find((w) => w.id === fav.topId);
    const bottom = wardrobe.find((w) => w.id === fav.bottomId);
    const footwear = wardrobe.find((w) => w.id === fav.footwearId);
    const outerwear = fav.outerwearId ? wardrobe.find((w) => w.id === fav.outerwearId) : undefined;

    if (top && bottom && footwear) {
      setPinnedOutfitSelections((prev) => ({
        ...prev,
        [0]: {
          top,
          bottom,
          footwear,
          outerwear,
          colorHarmonyScore: 100,
          styleCompatibilityNotes: `Your saved favorite outfit "${fav.name}"!`,
        },
      }));
    }
  };

  const availableFavorites = useMemo(() => {
    return favoriteOutfits.filter((fav) => {
      const top = wardrobe.find((w) => w.id === fav.topId);
      const bottom = wardrobe.find((w) => w.id === fav.bottomId);
      const footwear = wardrobe.find((w) => w.id === fav.footwearId);
      const outerwear = fav.outerwearId ? wardrobe.find((w) => w.id === fav.outerwearId) : true;

      if (!top || !bottom || !footwear) return false;
      if (fav.outerwearId && !outerwear) return false;

      // Filter to only those currently available (Clean status)
      if (top.status !== 'Clean') return false;
      if (bottom.status !== 'Clean') return false;
      if (footwear.status !== 'Clean') return false;
      if (outerwear !== true && outerwear?.status !== 'Clean') return false;

      return true;
    });
  }, [favoriteOutfits, wardrobe]);

  const handleTossCoin = () => {
    setIsCoinTossing(true);
    setCoinResult(null);
    
    setTimeout(() => {
      const result = Math.random() > 0.5 ? 'Heads' : 'Tails';
      setCoinResult(result);
      setIsCoinTossing(false);

      // Filter available favorites
      const availableFavs = favoriteOutfits.filter((fav) => {
        const top = wardrobe.find((w) => w.id === fav.topId && w.status === 'Clean');
        const bottom = wardrobe.find((w) => w.id === fav.bottomId && w.status === 'Clean');
        const footwear = wardrobe.find((w) => w.id === fav.footwearId && w.status === 'Clean');
        const outerwear = fav.outerwearId
          ? wardrobe.find((w) => w.id === fav.outerwearId && w.status === 'Clean')
          : true;
        return top && bottom && footwear && outerwear;
      });

      let selectedOutfit: Outfit | undefined = undefined;
      let titleMsg = "";
      let descMsg = "";

      if (result === 'Heads') {
        titleMsg = "Heads! Go with a Bold Favorite";
        if (availableFavs.length > 0) {
          const randFav = availableFavs[Math.floor(Math.random() * availableFavs.length)];
          const top = wardrobe.find((w) => w.id === randFav.topId)!;
          const bottom = wardrobe.find((w) => w.id === randFav.bottomId)!;
          const footwear = wardrobe.find((w) => w.id === randFav.footwearId)!;
          const outerwear = randFav.outerwearId ? wardrobe.find((w) => w.id === randFav.outerwearId) : undefined;
          
          selectedOutfit = { top, bottom, footwear, outerwear };
          descMsg = `Heads approves your saved combo: "${randFav.name}". Let's wear it today!`;
        } else {
          const cleanTops = wardrobe.filter((w) => w.category === 'Top' && w.status === 'Clean');
          const cleanBottoms = wardrobe.filter((w) => w.category === 'Bottom' && w.status === 'Clean');
          const cleanShoes = wardrobe.filter((w) => w.category === 'Footwear' && w.status === 'Clean');
          if (cleanTops.length > 0 && cleanBottoms.length > 0 && cleanShoes.length > 0) {
            const t = cleanTops[Math.floor(Math.random() * cleanTops.length)];
            const b = cleanBottoms[Math.floor(Math.random() * cleanBottoms.length)];
            const f = cleanShoes[Math.floor(Math.random() * cleanShoes.length)];
            selectedOutfit = { top: t, bottom: b, footwear: f };
            descMsg = `Coin selected a fantastic clean duo: the ${t.color} ${t.name} and the comfy ${b.name}!`;
          } else {
            descMsg = "Heads! Coin says execute a swift laundry wash cycle first to unlock more bold styles!";
          }
        }
      } else {
        titleMsg = "Tails! A Simple Clean Vibe";
        const cleanTops = wardrobe.filter((w) => w.category === 'Top' && w.status === 'Clean');
        const cleanBottoms = wardrobe.filter((w) => w.category === 'Bottom' && w.status === 'Clean');
        const cleanShoes = wardrobe.filter((w) => w.category === 'Footwear' && w.status === 'Clean');
        if (cleanTops.length > 0 && cleanBottoms.length > 0 && cleanShoes.length > 0) {
          const t = cleanTops[Math.floor(Math.random() * cleanTops.length)];
          const b = cleanBottoms[Math.floor(Math.random() * cleanBottoms.length)];
          const f = cleanShoes[Math.floor(Math.random() * cleanShoes.length)];
          selectedOutfit = { top: t, bottom: b, footwear: f };
          descMsg = `Tails recommends a comfortable minimalist coordinates: pairing the "${t.name}" with "${b.name}".`;
        } else {
          descMsg = "Tails! Let's do some light laundry drying so you can style a neat minimal set!";
        }
      }

      setCoinRecommendation({
        title: titleMsg,
        description: descMsg,
        outfit: selectedOutfit,
      });
      setShowCoinPopup(true);
    }, 800);
  };

  // Stats
  const stats = useMemo(() => {
    const total = wardrobe.length;
    const clean = wardrobe.filter((w) => w.status === 'Clean').length;
    const dirty = wardrobe.filter((w) => w.status === 'Dirty').length;
    const laundry = wardrobe.filter((w) => w.status === 'Damp').length;
    return { total, clean, dirty, laundry };
  }, [wardrobe]);

  return (
    <div className="min-h-screen bg-[#FDFDFB] py-8 px-4 sm:px-6 lg:px-8 font-sans antialiased text-stone-900 selection:bg-amber-100 select-none">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* COMPACT LUXURY TOP BAR / GOLD BRAND FLAG BANNER */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 border-b-4 border-amber-500 pb-6 relative">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 bg-stone-900 text-amber-400 text-[9.5px] uppercase font-black font-mono tracking-widest px-3 py-1 rounded-sm shadow-[2px_2px_0px_0px_rgba(245,158,11,0.25)] select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              My clothes • Active
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <h1 className="text-3xl font-black text-stone-900 tracking-tight font-sans uppercase">
                My clothes
              </h1>
              <span className="text-xs font-mono font-bold text-stone-400">v3.0 Premium</span>
            </div>
          </div>

          <div className="flex flex-col text-left md:items-end">
            <span className="text-[11px] font-extrabold text-stone-500 font-mono tracking-widest block">
              🌹 Premium Sarto-Weather System
            </span>
            <span className="text-xs font-bold text-amber-600 font-mono block">
              Sun, Jun 21, 2026
            </span>
          </div>
        </header>

        {/* CORE APPLICATION ASYMMETRIC BENTO GRID */}
        <main className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          
          {/* LEFT ZONE (8/12 Columns) - ADAPTIVE COMBINATIONS & SUGGESTIONS */}
          <div className="xl:col-span-8 space-y-8 animate-fade-in">
            {/* Visual Schedule Outfit Planner */}
            <SchedulePlannerView
              wardrobe={wardrobe}
              dailyPlans={dailyPlans}
              stylePreference={stylePreference}
              onStylePreferenceChanged={setStylePreference}
              onUpdateOutfitSelection={handleUpdateOutfitSelection}
              onAutoReplan={handleAutoReplan}
              onResetSingleDayOutfit={handleResetSingleDayOutfit}
              itemsGoingToWashToday={[]}
              activeLaundryTimes={{}}
              onUpdateStatus={handleUpdateClothingStatus}
              onSaveFavoriteCombo={handleSaveFavoriteCombo}
              favoriteOutfits={favoriteOutfits}
            />

            {/* MY FAVORITE COMBINATIONS SECTION */}
            <div id="favorites-section-neobrutal" className="bg-white border-2 border-stone-900 rounded-[24px] p-6 shadow-[4px_4px_0px_0px_rgba(28,25,23,1)] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-stone-150 pb-4 gap-3">
                <div>
                  <span className="text-[10px] font-mono font-black text-amber-600 uppercase tracking-widest block font-bold">⭐ SAVED COORDINATES</span>
                  <h3 className="text-lg font-black text-stone-900 tracking-tight uppercase">
                    My Favorite Combinations
                  </h3>
                  <p className="text-[11px] text-stone-500 font-sans mt-0.5">
                    Your custom curated wardrobe looks. Showing only when all items are clean & available in their categories!
                  </p>
                </div>
                
                <div className="text-[9.5px] font-mono font-bold text-stone-600 bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-lg shrink-0">
                  Saved: {favoriteOutfits.length} • Available: {availableFavorites.length}
                </div>
              </div>

              {availableFavorites.length === 0 ? (
                <div className="py-8 px-4 text-center bg-stone-50 border border-stone-200 border-dashed rounded-2xl">
                  <Star className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-stone-750">No favorite combinations currently available.</p>
                  <p className="text-[10.5px] text-stone-500 mt-1 max-w-md mx-auto">
                    Wash your dirty or rain-damp clothes to make your favorites available! To save your first favorite outfit, click the Star icon next to any suggested suit's date.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableFavorites.map((fav) => {
                    const top = wardrobe.find(w => w.id === fav.topId)!;
                    const bottom = wardrobe.find(w => w.id === fav.bottomId)!;
                    const footwear = wardrobe.find(w => w.id === fav.footwearId)!;
                    const outerwear = fav.outerwearId ? wardrobe.find(w => w.id === fav.outerwearId) : null;

                    return (
                      <div 
                        key={fav.id}
                        className="p-4 bg-stone-50/50 hover:bg-stone-50/80 border border-stone-205 hover:border-stone-400 rounded-2xl flex flex-col justify-between space-y-4 transition-all relative group"
                      >
                        <div className="absolute top-4 right-4 flex items-center gap-1 bg-green-50 text-green-700 text-[8.5px] font-black uppercase font-mono px-2 py-0.5 rounded-md border border-green-200">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                          <span>Ready</span>
                        </div>

                        <div>
                          <h4 className="font-extrabold text-[13px] text-stone-900 uppercase tracking-tight group-hover:text-amber-600 transition-colors">
                            {fav.name}
                          </h4>
                          <span className="text-[9px] font-bold text-stone-400 font-mono tracking-wider uppercase">
                            {fav.style} Vibe
                          </span>
                        </div>

                        {/* Category Checklist */}
                        <div className="space-y-1 bg-white p-2.5 rounded-xl border border-stone-150">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-stone-450 font-bold">👕 Top:</span>
                            <span className="font-bold text-stone-850 text-right truncate max-w-[140px]" title={top.name}>{top.name}</span>
                          </div>
                          
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-stone-455 font-bold">👖 Bottom:</span>
                            <span className="font-bold text-stone-850 text-right truncate max-w-[140px]" title={bottom.name}>{bottom.name}</span>
                          </div>

                          {outerwear && (
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-stone-455 font-bold">🧥 Outer:</span>
                              <span className="font-bold text-stone-855 text-right truncate max-w-[140px]" title={outerwear.name}>{outerwear.name}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-stone-455 font-bold">👟 Footwear:</span>
                            <span className="font-bold text-stone-855 text-right truncate max-w-[140px]" title={footwear.name}>{footwear.name}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1.5">
                          <button
                            onClick={() => handleEquipFavorite(fav)}
                            className="flex-1 cursor-pointer py-1.5 px-3 bg-stone-900 hover:bg-stone-800 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-3xs flex items-center justify-center gap-1.5"
                          >
                            <Sparkle className="w-3 h-3 text-amber-400" />
                            Wear Today
                          </button>
                          
                          <button
                            onClick={() => {
                              setFavoriteOutfits(prev => prev.filter(f => f.id !== fav.id));
                            }}
                            className="p-1.5 text-stone-400 hover:text-red-600 bg-stone-100 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Remove Favorite"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT ZONE (4/12 Columns) - TACTILE CLOSET STATION */}
          <div className="xl:col-span-4 space-y-6">

            {/* INTERACTIVE COIN TOSS DECIDER CARD */}
            <div id="coin-toss-card" className="bg-white border-2 border-stone-900 rounded-[24px] p-6 shadow-[4px_4px_0px_0px_rgba(28,25,23,1)] space-y-4 relative overflow-hidden">
              <div className="border-b border-stone-150 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1 px-2.5 bg-amber-100 text-amber-800 rounded-lg font-mono text-[9.5px] font-bold">DECISION ENGINE</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                </div>
                <h3 className="text-sm font-black text-stone-900 font-sans uppercase tracking-tight mt-1 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-500" />
                  Flip Coin Outfit Recommender
                </h3>
                <p className="text-[10px] text-stone-500 font-sans">
                  Can't decide what clean suit to style? Let a lucky coin flip pinpoint a curated recommendation instantly!
                </p>
              </div>

              <div className="flex flex-col items-center justify-center py-2 space-y-4 bg-[#FAF9F6] border border-stone-200/60 rounded-2xl p-4">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <motion.div
                    animate={isCoinTossing ? { rotateY: 1800, rotateX: 360, scale: [1, 1.4, 1] } : { rotateY: 0 }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-400 to-amber-500 border-4 border-stone-900 flex items-center justify-center font-black text-stone-900 text-2xl shadow-[3px_3px_0px_0px_rgba(28,25,23,1)] select-none"
                  >
                    🪙
                  </motion.div>
                </div>
                <button
                  onClick={handleTossCoin}
                  disabled={isCoinTossing}
                  className="w-full text-xs font-black uppercase tracking-wider py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-stone-200 text-stone-900 border-2 border-stone-900 rounded-xl shadow-[3px_3px_0px_0px_rgba(28,25,23,1)] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isCoinTossing ? "Tossing coin..." : "Flip a Coin!"}
                </button>
              </div>
            </div>

            {/* SLEEP & LAUNDRY CYCLE STATION CARD */}
            <div id="sleep-cycle-card" className="bg-white border-2 border-stone-900 rounded-[24px] p-6 shadow-[4px_4px_0px_0px_rgba(28,25,23,1)] space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl pointer-events-none" />
              <div className="border-b border-stone-150 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1 px-2.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg font-mono text-[9px] font-black uppercase tracking-widest">
                    Cycle Station
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                </div>
                <h3 className="text-sm font-black text-stone-900 font-sans uppercase tracking-tight mt-1.5 flex items-center gap-1.5">
                  <Bed className="w-4 h-4 text-indigo-600" />
                  Sleep & Morning Care Cycle
                </h3>
                <p className="text-[11px] text-stone-500 font-sans leading-relaxed">
                  Track full-day and nightwear sets seamlessly. Auto-wear and add both sets to the wash every morning!
                </p>
              </div>

              {currentCyclePhase === 'day' ? (
                <div className="space-y-4">
                  <div className="p-3 bg-amber-50/40 border border-amber-200/60 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-amber-800 uppercase font-mono tracking-wider">
                        🌞 Today's Active Day Wear
                      </span>
                      <span className="text-[8.5px] px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded-md font-mono font-bold uppercase">
                        Current Frame
                      </span>
                    </div>

                    {todayOutfitItems.length === 0 ? (
                      <p className="text-[10.5px] text-stone-500 italic">No clothes equipped for today yet.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        {todayOutfitItems.map((item) => (
                          <div key={item.id} className="text-[10px] bg-white/70 border border-stone-150 px-2.5 py-1 rounded-lg text-stone-800 truncate flex items-center gap-1.5">
                            <span className="text-xs">
                              {item.category === 'Top' ? '👕' : item.category === 'Bottom' ? '👖' : item.category === 'Footwear' ? '👟' : (item.category === 'Nightwear' || item.category === 'Nightwear Top' || item.category === 'Nightwear Bottom') ? '🛌' : '🧥'}
                            </span>
                            <span className="truncate">{item.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9.5px] font-black uppercase text-stone-500 font-mono tracking-wider block">
                      🌙 Select Nightwear for tonight:
                    </label>

                    {cleanNightwearList.length === 0 ? (
                      <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-center">
                        <p className="text-[10.5px] text-rose-800 font-semibold leading-tight">
                          No clean nightwear items left in closet!
                        </p>
                        <p className="text-[8.5px] text-rose-500 mt-0.5">
                          Create some in the Closet or finish laundry.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <select
                          value={selectedNightwearId || (cleanNightwearList[0]?.id || '')}
                          onChange={(e) => setSelectedNightwearId(e.target.value)}
                          className="w-full text-xs font-mono bg-[#FAF9F6] border-2 border-stone-900 px-3 py-1.5 rounded-xl text-stone-900 font-bold focus:outline-none"
                        >
                          <option value="" disabled>-- Pick Sleep Suit Set --</option>
                          {cleanNightwearList.map((nightItem) => (
                            <option key={nightItem.id} value={nightItem.id}>
                              [{nightItem.category === 'Nightwear Top' ? 'Topwear' : nightItem.category === 'Nightwear Bottom' ? 'Bottom Wear' : 'Nightwear'}] {nightItem.name} ({nightItem.color} • {nightItem.material})
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => {
                            const nightId = selectedNightwearId || cleanNightwearList[0]?.id;
                            if (nightId) {
                              handleTransitionToNight(nightId);
                            }
                          }}
                          className="w-full hover:translate-x-0.5 hover:translate-y-0.5   text-xs font-black uppercase tracking-wider py-2 bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-stone-900 rounded-xl shadow-[3px_3px_0px_0px_rgba(28,25,23,1)] flex items-center justify-center gap-1.5 cursor-pointer transition-transform"
                        >
                          <Moon className="w-3.5 h-3.5 text-amber-300 animate-none" />
                          Change into Nightwear!
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-purple-50/50 border border-purple-200/60 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-extrabold text-indigo-900 uppercase font-mono tracking-wider flex items-center gap-1">
                        <Bed className="w-3 h-3 text-indigo-500 animate-pulse" />
                        🛌 Sleep Mode Engaged
                      </span>
                      <span className="text-[8px] font-black uppercase font-mono px-1.5 py-0.5 bg-indigo-100 text-indigo-900 rounded-md">
                        Sleeping
                      </span>
                    </div>

                    <p className="text-[10.5px] text-stone-605 leading-relaxed font-sans font-semibold">
                      You are tucked in! Sleep comfortably in your nightsuit set. Both of your wear sets are queued to wash upon wake-up.
                    </p>

                    <div className="border-t border-purple-100 pt-2 space-y-1.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-stone-400 font-medium font-sans">Equipped Nightwear:</span>
                        <span className="font-bold text-stone-800">{activeNightwearItem?.name || "Night suit"}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-stone-400 font-medium font-sans">Active Day Suit:</span>
                        <span className="font-bold text-stone-800 truncate max-w-[140px]">
                          {todayOutfitItems.map(i => i.name).slice(0, 2).join(', ')}...
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleMorningLaundry}
                    className="w-full hover:translate-x-0.5 hover:translate-y-0.5 text-xs font-black uppercase tracking-wider py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white border-2 border-stone-900 rounded-xl shadow-[3px_3px_0px_0px_rgba(28,25,23,1)] flex items-center justify-center gap-2 cursor-pointer transition-transform"
                  >
                    <Coffee className="w-4 h-4 text-amber-100 animate-bounce" />
                    Good Morning! Wash Both Sets
                  </button>
                  <p className="text-[8.5px] font-mono text-stone-400 text-center leading-relaxed">
                    *Puts Daywear and Night pajamas instantly to Dirty status to wash every morning!
                  </p>
                </div>
              )}
            </div>
            
            {/* TACTILE CAB TRIPLE STATS DECK */}
            <div className="bg-white border-2 border-stone-900 rounded-[24px] p-6 shadow-[4px_4px_0px_0px_rgba(28,25,23,1)] space-y-4">
              <div className="border-b border-stone-200 pb-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-600 font-mono tracking-widest block font-bold">Cabinet Feed</span>
                  <h3 className="text-sm font-black text-stone-900 font-sans uppercase tracking-tight">Active Wardrobe Overview</h3>
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 bg-amber-500 text-stone-550 font-mono uppercase rounded-full">Active</span>
              </div>

              <div id="stat-grid-neobrutal" className="grid grid-cols-2 gap-3">
                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl flex flex-col justify-between">
                  <span className="text-[9.5px] font-bold text-stone-550 font-mono tracking-wide uppercase">Total Catalog Pieces</span>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-xl font-black text-stone-900 font-mono">{stats.total}</span>
                    <span className="text-[10px] text-stone-400 font-sans">items</span>
                  </div>
                </div>

                <div className="bg-[#10B981]/5 border border-[#10B981]/20 p-3 rounded-xl flex flex-col justify-between">
                  <span className="text-[9.5px] font-bold text-[#065F46] font-mono tracking-wide uppercase">Ready To Wear</span>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-xl font-black text-[#047857] font-mono">{stats.clean}</span>
                    <span className="text-[10px] text-[#059669] font-sans">clean</span>
                  </div>
                </div>

                <div className="bg-[#F43F5E]/5 border border-[#F43F5E]/20 p-3 rounded-xl flex flex-col justify-between">
                  <span className="text-[9.5px] font-semibold text-[#9F1239] font-mono tracking-wide uppercase">Needs Laundry</span>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-xl font-black text-[#BE123C] font-mono">{stats.dirty}</span>
                    <span className="text-[10px] text-[#E11D48] font-sans">dirty</span>
                  </div>
                </div>

                <div className="bg-[#F59E0B]/5 border border-[#F59E0B]/20 p-3 rounded-xl flex flex-col justify-between">
                  <span className="text-[9.5px] font-semibold text-[#92400E] font-mono tracking-wide uppercase">Rain-Damp Pieces</span>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-xl font-black text-[#B45309] font-mono">{stats.laundry}</span>
                    <span className="text-[10px] text-[#D97706] font-sans">damp</span>
                  </div>
                </div>
              </div>
            </div>

            {/* DESIGNER Cabinet trigger box */}
            <div 
              onClick={() => setIsWardrobePopupOpen(true)}
              id="cabinet-trigger-box" 
              className="group relative overflow-hidden bg-white hover:bg-amber-50/20 border-2 border-stone-900 rounded-[24px] p-6 text-center cursor-pointer transition-all duration-300 shadow-[4px_4px_0px_0px_rgba(28,25,23,1)] hover:translate-x-0.5 hover:translate-y-0.5"
            >
              <div className="absolute inset-0 opacity-[0.01] bg-[radial-gradient(#1A1D20_1px,transparent_1px)] [background-size:16px_16px]" />
              
              <div className="relative z-10 flex flex-col items-center justify-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-stone-900 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-sm">
                  <Shirt className="w-5 h-5 text-amber-400" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-black text-stone-900 tracking-tight font-sans flex items-center justify-center gap-1.5 uppercase">
                    🚪 Configure & Edit Closet
                    <span className="text-[9px] px-1.5 py-0.5 bg-stone-100 group-hover:bg-amber-100 group-hover:text-amber-900 rounded-md font-mono text-stone-500 font-bold transition-colors">
                      {stats.total} pieces
                    </span>
                  </h3>
                  <p className="text-[11px] text-stone-500 leading-relaxed max-w-[240px] mx-auto text-center font-medium">
                    Customize properties, edit, or append items to your fashion catalog.
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 text-[9.5px] font-black uppercase text-stone-800 bg-stone-100 group-hover:bg-amber-100 group-hover:text-amber-955 border border-stone-250 px-3 py-1 rounded-lg transition-all">
                  Open Catalog
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>

            {/* CONDITIONAL LAUNDRY OPTION / CARE STATION */}
            {(stats.dirty > 0 || stats.laundry > 0) && (
              <div 
                id="laundry-option-card"
                className="bg-white border-2 border-stone-800 rounded-[24px] p-6 shadow-[4px_4px_0px_0px_rgba(28,25,23,1)] space-y-4"
              >
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                      <WashingMachine className="w-4 h-4 text-amber-700" />
                    </span>
                    <div>
                      <h4 className="text-xs font-black uppercase text-stone-900 tracking-wider font-mono">
                        Laundry Station
                      </h4>
                      <p className="text-[10px] text-stone-400 font-mono">
                        {stats.dirty + stats.laundry} items pending
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      // Set all Dirty and Damp clothes to Clean status
                      setWardrobe(prev => prev.map(item => 
                        (item.status === 'Dirty' || item.status === 'Damp') 
                          ? { ...item, status: 'Clean' } 
                          : item
                      ));
                    }}
                    className="text-[9.5px] cursor-pointer font-extrabold uppercase px-2.5 py-1 bg-stone-900 hover:bg-stone-955 text-white rounded-lg transition-colors"
                  >
                    Wash & Dry All
                  </button>
                </div>

                <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
                  {wardrobe
                    .filter(item => item.status === 'Dirty' || item.status === 'Damp')
                    .map(item => (
                      <div 
                        key={item.id} 
                        className="flex items-center justify-between p-2 border border-stone-100 bg-[#FAF9F6]/50 rounded-xl text-xs"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="font-bold text-stone-900 truncate text-[11px]">{item.name}</p>
                          <span className="text-[9px] text-stone-400 uppercase font-mono tracking-wider">
                            {item.category} • {item.color}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded-md font-mono ${
                            item.status === 'Dirty' 
                              ? 'bg-rose-100 text-rose-800' 
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {item.status === 'Dirty' ? 'Dirty' : 'Damp'}
                          </span>
                          <button
                            onClick={() => {
                              // If Dirty -> change to Damp (washing). If Damp -> change to Clean (drying).
                              const targetStatus = item.status === 'Dirty' ? 'Damp' : 'Clean';
                              handleUpdateClothingStatus(item.id, targetStatus);
                            }}
                            className="bg-stone-100 hover:bg-stone-200 text-stone-900 p-1 rounded-lg transition-colors cursor-pointer"
                            title={item.status === 'Dirty' ? 'Wash (Set Damp)' : 'Dry & Fold (Set Clean)'}
                          >
                            <RefreshCw className="w-3 h-3 text-stone-600 animate-none hover:rotate-180 transition-transform duration-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Premium quote/details card */}
            <div className="bg-stone-900 border-2 border-amber-400 rounded-[24px] p-6 text-[#FAF9F6] relative overflow-hidden shadow-[4px_4px_0px_0px_rgba(245,158,11,0.2)]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkle className="w-4 h-4 text-amber-400" />
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest font-mono">Style Manifesto</span>
                </div>
                <p className="text-[12px] italic leading-relaxed text-stone-200 font-serif">
                  "Simplicity is the ultimate sophistication. By pairing precise weather diagnostics with refined styles, My clothes aligns your outfit seamlessly with the day's elements."
                </p>
                <div className="border-t border-stone-800 pt-3 flex items-center justify-between text-[9px] font-mono text-stone-400">
                  <span>CURATED PLATINUM ALGORITHM</span>
                  <span className="text-amber-400 font-extrabold uppercase">Premium Active</span>
                </div>
              </div>
            </div>

          </div>

        </main>

        {/* INTERACTIVE POPUP MODAL FOR CLOTHING CATALOG */}
        <AnimatePresence>
          {isWardrobePopupOpen && (
            <div 
              id="wardrobe-catalog-popup-backdrop"
              className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 md:p-8"
              onClick={() => setIsWardrobePopupOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.98, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.98, opacity: 0, y: 15 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#FBF9F4] rounded-[28px] w-full max-w-5xl h-full max-h-[88vh] shadow-2xl border border-stone-200 overflow-hidden flex flex-col"
              >
                    {/* MODAL HERO HEADER */}
                <div className="p-5 md:p-6 bg-white border-b-2 border-stone-150 flex items-center justify-between shadow-3xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-stone-900 border border-amber-450 text-[#FBF9F4] flex items-center justify-center">
                      <Shirt className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-stone-900 tracking-tight font-sans flex items-center gap-2">
                        VIRTUAL CATALOG
                        <span className="text-[9px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-mono uppercase font-black">Premium Edition</span>
                      </h2>
                      <p className="text-[11px] text-stone-500 font-sans font-medium">
                        Search, customize, edit item specifications, toggling weather and wear readiness constraints.
                      </p>
                    </div>
                  </div>

                  <button 
                    onClick={() => setIsWardrobePopupOpen(false)}
                    className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-900 hover:text-white text-stone-600 flex items-center justify-center font-bold text-sm cursor-pointer transition-colors shadow-2xs"
                  >
                    ✕
                  </button>
                </div>

                {/* MODAL WORKSPACE scroll container */}
                <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6">
                  <WardrobeCatalog
                    wardrobe={wardrobe}
                    onAddItem={handleAddClothingItem}
                    onDeleteItem={handleDeleteClothingItem}
                    onToggleStatus={handleUpdateClothingStatus}
                    onEditItem={handleEditClothingItem}
                  />
                </div>

                {/* MODAL FOOTER */}
                <div className="p-4 bg-white border-t border-stone-250/50 flex items-center justify-end gap-2 shrink-0">
                  <button
                    onClick={() => setIsWardrobePopupOpen(false)}
                    className="px-5 py-2.5 bg-stone-900 hover:bg-stone-950 text-[#FBF9F4] text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-transform"
                  >
                    Close Wardrobe Closet
                  </button>
                </div>
              </motion.div>
            </div>
          )}
          {/* DYNAMIC COIN FLIP POPUP RECOMMENDATION */}
          {showCoinPopup && coinRecommendation && (
            <div 
              className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4"
              onClick={() => setShowCoinPopup(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 30 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#FBF9F4] border-4 border-stone-900 rounded-[28px] p-6 max-w-sm w-full shadow-[8px_8px_0px_0px_rgba(28,25,23,1)] flex flex-col space-y-4 text-center relative pointer-events-auto animate-fade-in"
              >
                <span className="absolute -top-6 -right-6 text-4xl animate-bounce">🪙</span>
                
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-amber-600 font-mono tracking-widest bg-amber-100/50 border border-amber-300/60 px-2.5 py-0.5 rounded-full inline-block">
                    Lucky Toss Outcome
                  </span>
                  <h3 className="text-xl font-black text-stone-900 tracking-tight uppercase">
                    {coinRecommendation.title}
                  </h3>
                </div>

                <p className="text-xs text-stone-605 leading-relaxed font-sans font-semibold">
                  {coinRecommendation.description}
                </p>

                {coinRecommendation.outfit && (
                  <div className="p-3 bg-white border border-stone-200 rounded-2xl flex flex-col gap-2 items-stretch text-left">
                    <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest font-mono">
                      Lucky Coordinate Suggestions
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-lg">👕</span>
                      <div>
                        <p className="font-bold text-stone-805 text-[11px] leading-tight">{coinRecommendation.outfit.top.name}</p>
                        <p className="text-[9px] text-stone-450 block font-mono capitalize">{coinRecommendation.outfit.top.color} • {coinRecommendation.outfit.top.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-lg">👖</span>
                      <div>
                        <p className="font-bold text-stone-850 text-[11px] leading-tight">{coinRecommendation.outfit.bottom.name}</p>
                        <p className="text-[9px] text-stone-450 block font-mono capitalize">{coinRecommendation.outfit.bottom.color} • {coinRecommendation.outfit.bottom.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-lg">👟</span>
                      <div>
                        <p className="font-bold text-stone-850 text-[11px] leading-tight">{coinRecommendation.outfit.footwear.name}</p>
                        <p className="text-[9px] text-stone-450 block font-mono capitalize">{coinRecommendation.outfit.footwear.color} • {coinRecommendation.outfit.footwear.category}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  {coinRecommendation.outfit && (
                    <button
                      onClick={() => {
                        if (coinRecommendation.outfit) {
                          setPinnedOutfitSelections(prev => ({
                            ...prev,
                            [0]: coinRecommendation.outfit!
                          }));
                        }
                        setShowCoinPopup(false);
                      }}
                      className="flex-1 cursor-pointer py-2 px-4 bg-stone-900 text-amber-400 font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-stone-850 border border-stone-900 shadow-[3px_3px_0px_0px_rgba(28,25,23,0.3)] transition-all"
                    >
                      Wear This Today!
                    </button>
                  )}
                  <button
                    onClick={() => setShowCoinPopup(false)}
                    className={`cursor-pointer py-2 px-4 font-bold text-xs rounded-xl transition-all ${
                      coinRecommendation.outfit 
                        ? 'bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200' 
                        : 'bg-stone-900 hover:bg-stone-850 text-white w-full'
                    }`}
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* CLEAN ASSISTANT FOOTER */}
        <footer className="py-6 border-t border-stone-200 text-center text-[11px] text-stone-400 font-sans mt-8">
          <p>© 2026 My clothes Outfit Planner & Care Station. Designed purely for personal simplicity.</p>
        </footer>

      </div>
    </div>
  );
}
