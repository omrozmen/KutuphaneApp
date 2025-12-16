import { useState, useMemo, useEffect } from "react";
import {
  StatDefinition,
  StatType,
  StatLocation,
  defaultStats,
  calculateStat,
  loadStatsFromStorage,
  saveStatsToStorage,
  StatCalculationContext,
} from "../utils/statisticsConfig";

export const useStatistics = (context: StatCalculationContext) => {
  const [stats, setStats] = useState<StatDefinition[]>(() => loadStatsFromStorage());

  // İstatistikleri hesapla ve cache'le
  const calculatedStats = useMemo(() => {
    return stats.map((stat) => ({
      ...stat,
      value: calculateStat(stat.type, context),
    }));
  }, [stats, context.books, context.loans, context.bookStats, context.studentStats, context.maxPenaltyPoints]);

  // Belirli bir lokasyondaki istatistikleri getir
  const getStatsByLocation = (location: StatLocation) => {
    return calculatedStats
      .filter((stat) => stat.enabled && stat.locations.includes(location))
      .sort((a, b) => a.order - b.order);
  };

  // İstatistik ekle
  const addStat = (stat: Omit<StatDefinition, "id">) => {
    const newStat: StatDefinition = {
      ...stat,
      id: `stat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    const newStats = [...stats, newStat];
    setStats(newStats);
    saveStatsToStorage(newStats);
  };

  // İstatistik güncelle
  const updateStat = (id: string, updates: Partial<StatDefinition>) => {
    const newStats = stats.map((stat) =>
      stat.id === id ? { ...stat, ...updates } : stat
    );
    setStats(newStats);
    saveStatsToStorage(newStats);
  };

  // İstatistik sil
  const deleteStat = (id: string) => {
    const newStats = stats.filter((stat) => stat.id !== id);
    setStats(newStats);
    saveStatsToStorage(newStats);
  };

  // İstatistik sırasını değiştir
  const reorderStats = (fromIndex: number, toIndex: number) => {
    const newStats = [...stats];
    const [removed] = newStats.splice(fromIndex, 1);
    newStats.splice(toIndex, 0, removed);
    // Order değerlerini güncelle
    newStats.forEach((stat, index) => {
      stat.order = index + 1;
    });
    setStats(newStats);
    saveStatsToStorage(newStats);
  };

  // Tüm istatistikleri sıfırla
  const resetStats = () => {
    setStats(defaultStats);
    saveStatsToStorage(defaultStats);
  };

  return {
    stats: calculatedStats,
    getStatsByLocation,
    addStat,
    updateStat,
    deleteStat,
    reorderStats,
    resetStats,
  };
};




