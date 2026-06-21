/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ClothingItem, ClothingCategory, StylePreference, SeasonalUse, ClothingStatus } from '../types';
import { COLORS, STYLES, CATEGORIES, SEASONS, MATERIALS } from '../data';
import { Plus, Search, Filter, Trash2, CheckCircle2, ShieldAlert, Sparkles, RefreshCw, Feather, Image, UploadCloud, Loader2, CloudRain, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WardrobeCatalogProps {
  wardrobe: ClothingItem[];
  onAddItem: (item: Omit<ClothingItem, 'id' | 'timesWorn'>) => void;
  onDeleteItem: (id: string) => void;
  onToggleStatus: (id: string, newStatus: ClothingStatus) => void;
  onEditItem?: (item: ClothingItem) => void;
}

export default function WardrobeCatalog({
  wardrobe,
  onAddItem,
  onDeleteItem,
  onToggleStatus,
  onEditItem,
}: WardrobeCatalogProps) {
  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ClothingCategory | 'All'>('All');
  const [selectedStyle, setSelectedStyle] = useState<StylePreference | 'All'>('All');
  const [selectedSeason, setSelectedSeason] = useState<SeasonalUse | 'All'>('All');
  const [selectedStatus, setSelectedStatus] = useState<ClothingStatus | 'All'>('All');

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ClothingItem | null>(null);
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [devicePhoto, setDevicePhoto] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const [aiTaggingLoading, setAiTaggingLoading] = useState(false);

  const [newItem, setNewItem] = useState({
    name: '',
    category: 'Top' as ClothingCategory,
    style: 'Casual' as StylePreference,
    seasonalUse: 'All-Year' as SeasonalUse,
    material: 'Cotton (100%)',
    isQuickDry: false,
    color: 'Charcoal Black',
    colorHex: '#1e1e1e',
    status: 'Clean' as ClothingStatus,
  });

  const [mainCategoryGroup, setMainCategoryGroup] = useState<'day' | 'night'>('day');

  const handleStartEdit = (item: ClothingItem) => {
    setEditingItem(item);
    setMainCategoryGroup((item.category === 'Nightwear' || item.category === 'Nightwear Top' || item.category === 'Nightwear Bottom') ? 'night' : 'day');
    setNewItem({
      name: item.name,
      category: item.category,
      style: item.style,
      seasonalUse: item.seasonalUse,
      material: item.material,
      isQuickDry: item.isQuickDry,
      color: item.color,
      colorHex: item.colorHex,
      status: item.status,
    });
    setCustomImageUrl(item.imageUrl || '');
    setDevicePhoto('');
    setShowAddForm(true);
    
    // Scroll form into view gently
    setTimeout(() => {
      document.getElementById('wardrobe-catalog-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // File drag-and-drop / selector processing
  const processFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setDevicePhoto(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Gemini tag auto suggestions
  const handleAiAutoSuggestions = async () => {
    if (!newItem.name.trim()) return;
    setAiTaggingLoading(true);
    try {
      const response = await fetch('/api/gemini/suggest-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newItem.name }),
      });
      if (response.ok) {
        const data = await response.json();
        setNewItem((prev) => ({
          ...prev,
          category: data.category || prev.category,
          style: data.style || prev.style,
          seasonalUse: data.seasonalUse || prev.seasonalUse,
          material: data.material || prev.material,
          isQuickDry: data.isQuickDry !== undefined ? data.isQuickDry : prev.isQuickDry,
        }));
      }
    } catch (err) {
      console.error("Failed to fetch autocomplete suggestions", err);
    } finally {
      setAiTaggingLoading(false);
    }
  };

  // Handle Material Change to automatically default isQuickDry
  const handleMaterialChange = (materialName: string) => {
    const predefined = MATERIALS.find((m) => m.name === materialName);
    setNewItem((prev) => ({
      ...prev,
      material: materialName,
      isQuickDry: predefined ? predefined.isQuickDry : false,
    }));
  };

  // Handle Color change and find HEX
  const handleColorChange = (colorName: string) => {
    const colorObj = COLORS.find((c) => c.name === colorName);
    setNewItem((prev) => ({
      ...prev,
      color: colorName,
      colorHex: colorObj ? colorObj.hex : '#1e1e1e',
    }));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    // Default high-quality stock photo mapping based on category to fulfill "closest is must be in real photo"
    const photoMap: { [key: string]: string } = {
      Top: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=80&w=400',
      Bottom: 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&q=80&w=400',
      Outerwear: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=400',
      Footwear: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=400',
    };

    const targetUrl = devicePhoto || customImageUrl.trim() || (editingItem?.imageUrl) || photoMap[newItem.category] || photoMap.Top;

    if (editingItem) {
      if (onEditItem) {
        onEditItem({
          ...editingItem,
          ...newItem,
          imageUrl: targetUrl,
        });
      }
      setEditingItem(null);
    } else {
      const addedItem = {
        ...newItem,
        imageUrl: targetUrl,
      };
      onAddItem(addedItem);
    }
    
    // Reset Form
    setNewItem({
      name: '',
      category: 'Top',
      style: 'Casual',
      seasonalUse: 'All-Year',
      material: 'Cotton (100%)',
      isQuickDry: false,
      color: 'Charcoal Black',
      colorHex: '#1e1e1e',
      status: 'Clean',
    });
    setMainCategoryGroup('day');
    setCustomImageUrl('');
    setDevicePhoto('');
    setShowAddForm(false);
  };

  // Filter logic
  const filteredWardrobe = wardrobe.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.color.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesStyle = selectedStyle === 'All' || item.style === selectedStyle;
    const matchesSeason = selectedSeason === 'All' || item.seasonalUse === selectedSeason;
    const matchesStatus = selectedStatus === 'All' || item.status === selectedStatus;

    return matchesSearch && matchesCategory && matchesStyle && matchesSeason && matchesStatus;
  });

  const daywearItems = filteredWardrobe.filter((item) => item.category !== 'Nightwear' && item.category !== 'Nightwear Top' && item.category !== 'Nightwear Bottom');
  const nightwearItems = filteredWardrobe.filter((item) => item.category === 'Nightwear' || item.category === 'Nightwear Top' || item.category === 'Nightwear Bottom');

  return (
    <div id="wardrobe-catalog-section" className="bg-white rounded-[24px] border border-stone-200/80 p-6 shadow-3xs">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-stone-150 pb-5">
        <div>
          <h2 className="text-sm font-extrabold text-stone-900 tracking-tight flex items-center gap-2">
            <Feather className="w-4 h-4 text-stone-800" />
            Wardrobe Catalog ({wardrobe.length})
          </h2>
          <p className="text-xs text-stone-500 font-sans">Explore your visual collection of wet-resistant items and dry states.</p>
        </div>
        
        <button
          id="btn-add-item-modal"
          onClick={() => {
            if (showAddForm && editingItem) {
              setEditingItem(null);
              setNewItem({
                name: '',
                category: 'Top',
                style: 'Casual',
                seasonalUse: 'All-Year',
                material: 'Cotton (100%)',
                isQuickDry: false,
                color: 'Charcoal Black',
                colorHex: '#1e1e1e',
                status: 'Clean',
              });
              setMainCategoryGroup('day');
              setCustomImageUrl('');
              setDevicePhoto('');
            } else {
              setShowAddForm(!showAddForm);
              setEditingItem(null);
              setMainCategoryGroup('day');
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-955 text-[#FBF9F4] font-bold text-xs rounded-xl border border-transparent shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {editingItem ? 'Add New Item Instead' : 'Add To Catalog'}
        </button>
      </div>

      {/* Add New Item Slide-down Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6 border border-stone-200 bg-stone-50/60 rounded-2xl"
          >
            <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
              <h3 className="text-xs font-black text-amber-600 uppercase tracking-wider flex items-center gap-2 font-mono">
                {editingItem ? (
                  <>
                    <Pencil className="w-3.5 h-3.5 text-amber-500" />
                    ✏️ Edit Garment Spec: <span className="text-stone-900 normal-case">{editingItem.name}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Insert New Wardrobe Masterpiece
                  </>
                )}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Item Name */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-stone-700">Small Descriptive Name</label>
                    <button
                      type="button"
                      onClick={handleAiAutoSuggestions}
                      disabled={aiTaggingLoading || !newItem.name.trim()}
                      className="inline-flex items-center gap-1.2 px-2 py-0.5 rounded-full text-[10px] font-extrabold font-mono uppercase bg-stone-200/60 hover:bg-stone-300/80 text-stone-700 hover:text-stone-900 border border-transparent transition-all cursor-pointer disabled:opacity-50"
                      title="Press to let Gemini auto-fill details based on the name"
                    >
                      {aiTaggingLoading ? (
                        <>
                          <Loader2 className="w-2.5 h-2.5 animate-spin text-stone-600" />
                          Tagging...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-2.5 h-2.5 text-stone-550" />
                          AI Auto-Fill details
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Breezy Linen Top"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    className="w-full text-xs px-3.5 py-2 rounded-lg border border-stone-250 bg-white focus:outline-hidden focus:border-stone-500 focus:ring-1 focus:ring-stone-500 transition-all font-sans"
                  />
                </div>

                {/* Optional Custom Image URL and Device Upload Combo */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Option A: Device File Drag & Drop + Click Upload */}
                  <div className="w-full">
                    <label className="block text-xs font-semibold text-stone-700 mb-1 flex items-center gap-1">
                      <UploadCloud className="w-3.5 h-3.5 text-stone-500" />
                      Upload Device Photo (No Link required)
                    </label>
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`relative border-2 border-dashed rounded-xl p-2.5 text-center transition-all flex flex-col items-center justify-center cursor-pointer min-h-[82px] ${
                        dragActive ? "border-stone-500 bg-stone-100" : "border-stone-200 hover:border-stone-300 bg-white"
                      }`}
                      onClick={() => document.getElementById('device-photo-input')?.click()}
                    >
                      <input
                        type="file"
                        id="device-photo-input"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      
                      {devicePhoto ? (
                        <div className="flex items-center gap-2">
                          <img src={devicePhoto} className="w-12 h-12 rounded-lg object-cover border border-stone-200" alt="Preview" />
                          <div className="text-left">
                            <p className="text-[10px] font-bold text-stone-850">Photo Ready!</p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDevicePhoto('');
                              }}
                              className="text-[9px] text-rose-600 hover:underline font-mono"
                            >
                              Clear photo
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <UploadCloud className="w-4 h-4 text-stone-400 mx-auto" />
                          <p className="text-[10px] text-stone-550">
                            Drag & drop or <span className="font-extrabold text-stone-850 underline bg-stone-100 px-1 py-0.5 rounded-sm">browse device</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Option B: Custom Image URL Link */}
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1 flex items-center gap-1">
                      <Image className="w-3.5 h-3.5 text-stone-500" />
                      Or Paste Image URL Address
                    </label>
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/..."
                      value={customImageUrl}
                      disabled={!!devicePhoto}
                      onChange={(e) => setCustomImageUrl(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-stone-250 bg-white disabled:bg-stone-50 disabled:text-stone-400 focus:outline-hidden focus:border-stone-500 focus:ring-1 focus:ring-stone-500 transition-all font-sans"
                    />
                    <p className="text-[9px] text-stone-400 mt-1 font-sans">
                      {devicePhoto ? "Using uploaded device photo" : "Falls back to category stock photos if empty"}
                    </p>
                  </div>
                </div>

                {/* Categories - Vertically Two Choice Cards */}
                <div className="md:col-span-3 border border-stone-200/70 rounded-2xl p-4 bg-white space-y-3">
                  <span className="block text-xs font-bold text-stone-750 tracking-tight font-mono uppercase">Garment Type Category</span>
                  <div className="flex flex-col gap-3">
                    {/* Option 1: Day Life Clothes */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setMainCategoryGroup('day');
                        if (newItem.category === 'Nightwear' || newItem.category === 'Nightwear Top' || newItem.category === 'Nightwear Bottom') {
                          setNewItem(prev => ({ ...prev, category: 'Top' }));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setMainCategoryGroup('day');
                          if (newItem.category === 'Nightwear' || newItem.category === 'Nightwear Top' || newItem.category === 'Nightwear Bottom') {
                            setNewItem(prev => ({ ...prev, category: 'Top' }));
                          }
                        }
                      }}
                      className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between cursor-pointer focus:outline-none ${
                        mainCategoryGroup === 'day'
                          ? 'border-stone-900 bg-stone-50/45 shadow-3xs'
                          : 'border-stone-200 hover:border-stone-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">☀️</span>
                          <div>
                            <span className="text-xs font-extrabold text-stone-900 block leading-tight">Day Life Clothes</span>
                            <span className="text-[10px] text-stone-400 font-sans block mt-0.5">Styled daily coordinates (Tops, Bottoms, Outerwear, Footwear)</span>
                          </div>
                        </div>
                        <input
                          type="radio"
                          name="mainCategoryGroup"
                          checked={mainCategoryGroup === 'day'}
                          onChange={() => {}}
                          className="w-4 h-4 accent-stone-900 pointer-events-none"
                        />
                      </div>

                      {/* Nest the sub-category selector inside when "Day Clothes" is active */}
                      {mainCategoryGroup === 'day' && (
                        <div className="mt-3.5 pt-3.5 border-t border-stone-200/60 w-full" onClick={(e) => e.stopPropagation()}>
                          <label className="block text-[10px] font-bold text-stone-500 uppercase font-mono tracking-wider mb-1.5">Choose Daywear Layer Style:</label>
                          <select
                            value={(newItem.category === 'Nightwear' || newItem.category === 'Nightwear Top' || newItem.category === 'Nightwear Bottom') ? 'Top' : newItem.category}
                            onChange={(e) => setNewItem({ ...newItem, category: e.target.value as ClothingCategory })}
                            className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none text-stone-900 font-bold transition-all cursor-pointer font-sans"
                          >
                            <option value="Top">👕 Top (Shirts, T-shirts, Knits)</option>
                            <option value="Bottom">👖 Bottom (Jeans, Pants, Skirts)</option>
                            <option value="Outerwear">🧥 Outerwear (Raincoats, Jackets, Coats)</option>
                            <option value="Footwear">👟 Footwear (Shoes, Sneakers, Boots)</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Option 2: Nightwear */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setMainCategoryGroup('night');
                        if (newItem.category !== 'Nightwear Top' && newItem.category !== 'Nightwear Bottom') {
                          setNewItem(prev => ({ ...prev, category: 'Nightwear Top' }));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setMainCategoryGroup('night');
                          if (newItem.category !== 'Nightwear Top' && newItem.category !== 'Nightwear Bottom') {
                            setNewItem(prev => ({ ...prev, category: 'Nightwear Top' }));
                          }
                        }
                      }}
                      className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between cursor-pointer focus:outline-none ${
                        mainCategoryGroup === 'night'
                          ? 'border-indigo-600 bg-indigo-50/15 shadow-3xs'
                          : 'border-stone-200 hover:border-stone-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🌙</span>
                          <div>
                            <span className="text-xs font-extrabold text-[#111827] block leading-tight">Nightwear / Sleep Suit</span>
                            <span className="text-[10px] text-stone-400 font-sans block mt-0.5">Cozy home wear & pajamas used to track sleep & morning cycle</span>
                          </div>
                        </div>
                        <input
                          type="radio"
                          name="mainCategoryGroup"
                          checked={mainCategoryGroup === 'night'}
                          onChange={() => {}}
                          className="w-4 h-4 accent-indigo-600 pointer-events-none"
                        />
                      </div>

                      {/* Nest the sub-category selector inside when "Nightwear" is active */}
                      {mainCategoryGroup === 'night' && (
                        <div className="mt-3.5 pt-3.5 border-t border-indigo-200/50 w-full" onClick={(e) => e.stopPropagation()}>
                          <label className="block text-[10px] font-bold text-indigo-500 uppercase font-mono tracking-wider mb-1.5">Choose Nightwear Subcategory:</label>
                          <select
                            value={(newItem.category === 'Nightwear Top' || newItem.category === 'Nightwear Bottom') ? newItem.category : 'Nightwear Top'}
                            onChange={(e) => setNewItem({ ...newItem, category: e.target.value as ClothingCategory })}
                            className="w-full text-xs px-3 py-2 rounded-lg border border-indigo-200 bg-white focus:outline-none text-indigo-900 font-bold transition-all cursor-pointer font-sans"
                          >
                            <option value="Nightwear Top">👕 Sleep Topwear (Sleep shirts, pajama tops)</option>
                            <option value="Nightwear Bottom">👖 Sleep Bottomwear (Pajama pants, sleep shorts)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Styles */}
                {mainCategoryGroup !== 'night' && (
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Style Category</label>
                    <select
                      value={newItem.style}
                      onChange={(e) => setNewItem({ ...newItem, style: e.target.value as StylePreference })}
                      className="w-full text-xs px-3.5 py-2 rounded-lg border border-stone-250 bg-white focus:outline-hidden focus:border-stone-500 focus:ring-1 focus:ring-stone-500 transition-all cursor-pointer font-sans"
                    >
                      {STYLES.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Seasonal Use */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Seasonal Utility</label>
                  <select
                    value={newItem.seasonalUse}
                    onChange={(e) => setNewItem({ ...newItem, seasonalUse: e.target.value as SeasonalUse })}
                    className="w-full text-xs px-3.5 py-2 rounded-lg border border-stone-250 bg-white focus:outline-hidden focus:border-stone-500 focus:ring-1 focus:ring-stone-500 transition-all cursor-pointer font-sans"
                  >
                    {SEASONS.map((sz) => (
                      <option key={sz} value={sz}>{sz}</option>
                    ))}
                  </select>
                </div>

                {/* Material Selection & Auto QuickDry */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Textile Fabric Material</label>
                  <select
                    value={newItem.material}
                    onChange={(e) => handleMaterialChange(e.target.value)}
                    className="w-full text-xs px-3.5 py-2 rounded-lg border border-stone-250 bg-white focus:outline-hidden focus:border-stone-500 focus:ring-1 focus:ring-stone-500 transition-all cursor-pointer font-sans"
                  >
                    {MATERIALS.map((mat) => (
                      <option key={mat.name} value={mat.name}>{mat.name}</option>
                    ))}
                  </select>
                </div>

                {/* Color Name */}
                {mainCategoryGroup !== 'night' && (
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Color Shade</label>
                    <select
                      value={newItem.color}
                      onChange={(e) => handleColorChange(e.target.value)}
                      className="w-full text-xs px-3.5 py-2 rounded-lg border border-stone-250 bg-white focus:outline-hidden focus:border-stone-500 focus:ring-1 focus:ring-stone-500 transition-all cursor-pointer font-sans"
                    >
                      {COLORS.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Cleanliness Status */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Cleanliness State</label>
                  <select
                    value={newItem.status}
                    onChange={(e) => setNewItem({ ...newItem, status: e.target.value as ClothingStatus })}
                    className="w-full text-xs px-3.5 py-2 rounded-lg border border-stone-250 bg-white focus:outline-hidden focus:border-stone-500 focus:ring-1 focus:ring-stone-500 transition-all cursor-pointer font-sans"
                  >
                    <option value="Clean">Clean (Washed & Dry)</option>
                    <option value="Dirty">Dirty (Ready to wash)</option>
                    <option value="Washing">Active Washing</option>
                    <option value="Drying">Active Drying</option>
                  </select>
                </div>

                {/* Quick Dry Custom Switch */}
                <div className="flex items-center gap-3 bg-white border border-stone-200 rounded-lg p-2.5 mt-4 md:mt-2">
                  <input
                    type="checkbox"
                    id="checkbox-quickdry"
                    checked={newItem.isQuickDry}
                    onChange={(e) => setNewItem({ ...newItem, isQuickDry: e.target.checked })}
                    className="w-4 h-4 text-stone-900 accent-stone-900 border-stone-300 rounded-sm focus:ring-stone-550 cursor-pointer"
                  />
                  <div>
                    <label htmlFor="checkbox-quickdry" className="block text-xs font-bold text-stone-800 cursor-pointer">Quick-Drying Fabric</label>
                    <span className="text-[10px] text-stone-400 font-sans block">Dries fast on rainy days</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingItem(null);
                    setNewItem({
                      name: '',
                      category: 'Top',
                      style: 'Casual',
                      seasonalUse: 'All-Year',
                      material: 'Cotton (100%)',
                      isQuickDry: false,
                      color: 'Charcoal Black',
                      colorHex: '#1e1e1e',
                      status: 'Clean',
                    });
                    setMainCategoryGroup('day');
                    setCustomImageUrl('');
                    setDevicePhoto('');
                  }}
                  className="px-4 py-2 hover:bg-stone-100 text-stone-600 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-stone-900 hover:bg-stone-955 text-[#FBF9F4] font-bold text-xs rounded-lg shadow-xs cursor-pointer transition-transform"
                >
                  {editingItem ? 'Save Garment Changes' : 'Submit New Garment'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary Filters Toolbar */}
      <div className="bg-stone-50 rounded-2xl p-4 mb-6 border border-stone-200/60">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          {/* Category Filter */}
          <div>
            <label className="block text-[11px] text-stone-500 mb-1 font-bold uppercase tracking-wider font-sans">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as ClothingCategory | 'All')}
              className="w-full text-xs bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-stone-500 cursor-pointer font-sans font-semibold"
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Style Filter */}
          <div>
            <label className="block text-[11px] text-stone-500 mb-1 font-bold uppercase tracking-wider font-sans">Style Vibe</label>
            <select
              value={selectedStyle}
              onChange={(e) => setSelectedStyle(e.target.value as StylePreference | 'All')}
              className="w-full text-xs bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-stone-500 cursor-pointer font-sans font-semibold"
            >
              <option value="All">All Styles</option>
              {STYLES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Season Filter */}
          <div>
            <label className="block text-[11px] text-stone-500 mb-1 font-bold uppercase tracking-wider font-sans">Utility Season</label>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value as SeasonalUse | 'All')}
              className="w-full text-xs bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-stone-500 cursor-pointer font-sans font-semibold"
            >
              <option value="All">All Seasons</option>
              {SEASONS.map((se) => (
                <option key={se} value={se}>{se}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] text-stone-500 mb-1 font-bold uppercase tracking-wider font-sans">State</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as ClothingStatus | 'All')}
              className="w-full text-xs bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-stone-500 cursor-pointer font-sans font-semibold"
            >
              <option value="All">All Cleanliness</option>
              <option value="Clean">Clean & Dry</option>
              <option value="Dirty">Dirty</option>
              <option value="Damp">Damp / Not Dry</option>
            </select>
          </div>

          {/* Search Term Input */}
          <div className="col-span-2 md:col-span-1 pr-1">
            <label className="block text-[11px] text-stone-500 mb-1 font-bold uppercase tracking-wider font-sans">Query</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
              <input
                type="text"
                placeholder="Linen, wool etc..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-8 pr-2.5 py-1.5 bg-white rounded-lg border border-stone-200 focus:outline-hidden focus:ring-1 focus:ring-stone-500 font-sans"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Wardrobe Sections - Grouped into Day Life Clothing & Nightwear Series */}
      <div className="space-y-10">
        
        {/* SECTION 1: DAY LIFE CLOTHING */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-stone-150 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">👕</span>
              <div>
                <h3 className="text-sm font-black uppercase text-stone-900 tracking-wider">
                  Day Life Clothes
                </h3>
                <p className="text-[10px] text-stone-400 font-sans">Tops, bottoms, outerwear, footwear for daily active routines</p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full">
              {daywearItems.length} items
            </span>
          </div>

          {daywearItems.length === 0 ? (
            <div className="py-12 text-center bg-stone-50/40 rounded-2xl border border-dashed border-stone-200">
              <ShieldAlert className="w-6 h-6 text-stone-400 mx-auto mb-1" />
              <p className="text-xs text-stone-500 font-medium font-sans">No matching day life garments in view.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
              <AnimatePresence mode="popLayout">
                {daywearItems.map((item) => (
                  <motion.div
                    layout
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    key={item.id}
                    className={`border rounded-[20px] overflow-hidden flex flex-col justify-between transition-all ${
                      item.status === 'Dirty'
                        ? 'border-rose-150 bg-rose-50/10 shadow-3xs'
                        : item.status === 'Damp'
                        ? 'border-amber-200 bg-amber-50/10 shadow-3xs ring-1 ring-amber-100/50'
                        : 'border-stone-200/80 hover:border-stone-400 bg-white hover:shadow-2xs'
                    }`}
                  >
                    <div>
                      {/* 1. Real Photo container with category absolute badge */}
                      <div className="relative h-44 bg-stone-100 overflow-hidden group">
                        <img
                          src={item.imageUrl || 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=80&w=400'}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        
                        {/* Category Absolute label */}
                        <span className="absolute top-2.5 left-2.5 px-2 py-1 text-[9px] font-extrabold bg-stone-900/90 text-[#FBF9F4] uppercase rounded-md tracking-widest font-mono backdrop-blur-xs">
                          {item.category}
                        </span>

                        {/* Circular color indicator overlaid */}
                        <span
                          className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full border border-white/50 block shadow-xs"
                          style={{ backgroundColor: item.colorHex }}
                          title={item.color}
                        />
                      </div>

                      {/* 2. Text layout with extremely Small elegant name */}
                      <div className="p-4 space-y-1.5">
                        <div className="flex items-center justify-between font-sans">
                          <h4 className="text-xs font-extrabold text-stone-900 tracking-tight shorten-title truncate max-w-[150px]">
                            {item.name}
                          </h4>
                          
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => handleStartEdit(item)}
                              className="text-stone-400 hover:text-amber-600 p-1 rounded-md hover:bg-stone-50 transition-colors cursor-pointer animate-none"
                              title="Edit Item Properties"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              id={`delete-clothing-${item.id}`}
                              onClick={() => onDeleteItem(item.id)}
                              className="text-stone-400 hover:text-rose-600 p-1 rounded-md hover:bg-stone-50 transition-colors cursor-pointer animate-none"
                              title="Remove from Catalog"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          <span className="text-[9px] font-sans bg-stone-100 text-stone-850 font-bold px-1.5 py-0.5 rounded-xs">
                            {item.material}
                          </span>
                          <span className="text-[9px] font-sans bg-amber-50 text-amber-900 font-bold px-1.5 py-0.5 rounded-xs">
                            {item.style}
                          </span>
                          <span className="text-[9px] font-sans bg-stone-100 text-stone-500 font-bold px-1.5 py-0.5 rounded-xs">
                            {item.seasonalUse}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 3. State control footer */}
                    <div className="px-3 pb-4 pt-3 border-t border-stone-150/60 bg-stone-50/50 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] text-stone-400 font-bold font-mono uppercase block leading-none">LAUNDERING STATE</span>
                        <div className="flex items-center gap-1">
                          {item.status === 'Clean' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#15803d] font-sans">
                              <CheckCircle2 className="w-3 h-3 text-[#16a34a]" />
                              Clean
                            </span>
                          ) : item.status === 'Dirty' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#be123c] font-sans">
                              <ShieldAlert className="w-3 h-3 text-[#e11d48]" />
                              Dirty
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-800 animate-pulse font-sans">
                              <CloudRain className="w-3 h-3 text-amber-500" />
                              Damp (Not Dry)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-1 justify-between">
                        <button
                          onClick={() => onToggleStatus(item.id, 'Clean')}
                          className={`flex-1 py-1 text-[9px] font-extrabold rounded-md shadow-2xs transition-all cursor-pointer ${
                            item.status === 'Clean' ? 'bg-emerald-600 text-white' : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          Clean
                        </button>
                        <button
                          onClick={() => onToggleStatus(item.id, 'Dirty')}
                          className={`flex-1 py-1 text-[9px] font-extrabold rounded-md shadow-2xs transition-all cursor-pointer ${
                            item.status === 'Dirty' ? 'bg-rose-600 text-white' : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          Dirty
                        </button>
                        <button
                          onClick={() => onToggleStatus(item.id, 'Damp')}
                          className={`flex-1 py-1 text-[9px] font-extrabold rounded-md shadow-2xs transition-all cursor-pointer ${
                            item.status === 'Damp' ? 'bg-amber-600 text-white animate-pulse' : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                          }`}
                          title="Mark as Damp (Not Dry due to rain / weather humidity)"
                        >
                          Damp 🌧️
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* SECTION 2: NIGHTWEAR & SLEEP SUITS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-indigo-150 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌙</span>
              <div>
                <h3 className="text-sm font-black uppercase text-indigo-900 tracking-wider">
                  Nightwear & Sleep Suits
                </h3>
                <p className="text-[10px] text-stone-400 font-sans">Pajama suits, night pajamas, nightshirts for healthy sleep routines</p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-800 border border-indigo-150 px-2 py-0.5 rounded-full">
              {nightwearItems.length} items
            </span>
          </div>

          {nightwearItems.length === 0 ? (
            <div className="py-12 text-center bg-indigo-50/10 rounded-2xl border border-dashed border-indigo-150/55">
              <ShieldAlert className="w-6 h-6 text-indigo-400 mx-auto mb-1" />
              <p className="text-xs text-indigo-600/80 font-medium font-sans">No matching night dresses in catalog yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
              <AnimatePresence mode="popLayout">
                {nightwearItems.map((item) => (
                  <motion.div
                    layout
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    key={item.id}
                    className={`border rounded-[20px] overflow-hidden flex flex-col justify-between transition-all ${
                      item.status === 'Dirty'
                        ? 'border-indigo-200 bg-rose-50/10 shadow-3xs'
                        : item.status === 'Damp'
                        ? 'border-amber-200 bg-amber-50/10 shadow-3xs ring-1 ring-amber-100/50'
                        : 'border-indigo-150/80 hover:border-indigo-300 bg-white hover:shadow-2xs'
                    }`}
                  >
                    <div>
                      {/* 1. Real Photo container with category absolute badge */}
                      <div className="relative h-44 bg-indigo-50/20 overflow-hidden group">
                        <img
                          src={item.imageUrl || 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&q=80&w=400'}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        
                        {/* Category Absolute label */}
                        <span className="absolute top-2.5 left-2.5 px-2 py-1 text-[9px] font-extrabold bg-indigo-900/90 text-amber-300 uppercase rounded-md tracking-widest font-mono backdrop-blur-xs">
                          {item.category}
                        </span>

                         {/* Circular color indicator overlaid (only rendered if not nightwear) */}
                        {item.category !== 'Nightwear' && item.category !== 'Nightwear Top' && item.category !== 'Nightwear Bottom' && (
                          <span
                            className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full border border-white/50 block shadow-xs"
                            style={{ backgroundColor: item.colorHex }}
                            title={item.color}
                          />
                        )}
                      </div>

                      {/* 2. Text layout with extremely Small elegant name */}
                      <div className="p-4 space-y-1.5">
                        <div className="flex items-center justify-between font-sans">
                          <h4 className="text-xs font-extrabold text-stone-900 tracking-tight shorten-title truncate max-w-[150px]">
                            {item.name}
                          </h4>
                          
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => handleStartEdit(item)}
                              className="text-indigo-400 hover:text-indigo-700 p-1 rounded-md hover:bg-[#F0EEFF] transition-colors cursor-pointer animate-none"
                              title="Edit Item Properties"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              id={`delete-clothing-${item.id}`}
                              onClick={() => onDeleteItem(item.id)}
                              className="text-indigo-400 hover:text-rose-600 p-1 rounded-md hover:bg-[#F0EEFF] transition-colors cursor-pointer animate-none"
                              title="Remove from Catalog"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          <span className="text-[9px] font-sans bg-indigo-50 text-indigo-805 font-bold px-1.5 py-0.5 rounded-xs">
                            {item.material}
                          </span>
                          {item.category !== 'Nightwear' && item.category !== 'Nightwear Top' && item.category !== 'Nightwear Bottom' && (
                            <span className="text-[9px] font-sans bg-[#FAF9F6] text-amber-800 border border-amber-250 font-bold px-1.5 py-0.5 rounded-xs">
                              {item.style}
                            </span>
                          )}
                          <span className="text-[9px] font-sans bg-indigo-50 text-stone-500 font-bold px-1.5 py-0.5 rounded-xs">
                            {item.seasonalUse}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 3. State control footer */}
                    <div className="px-3 pb-4 pt-3 border-t border-indigo-100 bg-[#FAF9F6] flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] text-indigo-400 font-bold font-mono uppercase block leading-none">LAUNDERING STATE</span>
                        <div className="flex items-center gap-1">
                          {item.status === 'Clean' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#15803d] font-sans">
                              <CheckCircle2 className="w-3 h-3 text-[#16a34a]" />
                              Clean
                            </span>
                          ) : item.status === 'Dirty' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#be123c] font-sans">
                              <ShieldAlert className="w-3 h-3 text-[#e11d48]" />
                              Dirty
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-800 animate-pulse font-sans">
                              <CloudRain className="w-3 h-3 text-amber-500" />
                              Damp (Not Dry)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-1 justify-between">
                        <button
                          onClick={() => onToggleStatus(item.id, 'Clean')}
                          className={`flex-1 py-1 text-[9px] font-extrabold rounded-md shadow-2xs transition-all cursor-pointer ${
                            item.status === 'Clean' ? 'bg-emerald-600 text-white' : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          Clean
                        </button>
                        <button
                          onClick={() => onToggleStatus(item.id, 'Dirty')}
                          className={`flex-1 py-1 text-[9px] font-extrabold rounded-md shadow-2xs transition-all cursor-pointer ${
                            item.status === 'Dirty' ? 'bg-rose-600 text-white' : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          Dirty
                        </button>
                        <button
                          onClick={() => onToggleStatus(item.id, 'Damp')}
                          className={`flex-1 py-1 text-[9px] font-extrabold rounded-md shadow-2xs transition-all cursor-pointer ${
                            item.status === 'Damp' ? 'bg-amber-600 text-white animate-pulse' : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                          }`}
                          title="Mark as Damp (Not Dry due to rain / weather humidity)"
                        >
                          Damp 🌧️
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
