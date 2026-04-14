'use client';

import { useState, useEffect, useCallback } from 'react';
import { AWAY_PHOTOS, CALM_PHOTOS, AWAY_FUN } from '@/lib/away-screen-data';

export function useAwayScreen() {
  const [awayScreen, setAwayScreen] = useState(false);
  const [awayPhotoIndex, setAwayPhotoIndex] = useState(() => Math.floor(Math.random() * AWAY_PHOTOS.length));
  const [awayTime, setAwayTime] = useState('');
  const [awayWeather, setAwayWeather] = useState<{ temp: string; desc: string; location: string } | null>(null);
  const [awayFunFact, setAwayFunFact] = useState('');
  const [awayBreathing, setAwayBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale');
  const [breathCount, setBreathCount] = useState(0);
  const [calmPhotoUrl, setCalmPhotoUrl] = useState(CALM_PHOTOS[Math.floor(Math.random() * CALM_PHOTOS.length)]);

  const awayPhotoUrl = AWAY_PHOTOS[awayPhotoIndex % AWAY_PHOTOS.length];

  const cyclePhoto = useCallback(() => {
    let next: number;
    do { next = Math.floor(Math.random() * AWAY_PHOTOS.length); } while (next === awayPhotoIndex && AWAY_PHOTOS.length > 1);
    setAwayPhotoIndex(next);
  }, [awayPhotoIndex]);

  // Clock + weather effect — only runs when away screen is active
  useEffect(() => {
    if (!awayScreen) return;

    const tick = () => {
      const now = new Date();
      setAwayTime(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }));
    };
    tick();
    const interval = setInterval(tick, 1000);

    if (!awayWeather && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=auto`);
            if (res.ok) {
              const data = await res.json();
              const temp = Math.round(data.current.temperature_2m);
              const code = data.current.weather_code;
              const descriptions: Record<number, string> = {
                0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
                45: 'Foggy', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
                61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow',
                75: 'Heavy snow', 80: 'Rain showers', 81: 'Moderate showers', 82: 'Heavy showers',
                95: 'Thunderstorm', 96: 'Thunderstorm with hail',
              };
              setAwayWeather({ temp: `${temp}°C`, desc: descriptions[code] || 'Unknown', location: data.timezone?.split('/').pop()?.replace(/_/g, ' ') || '' });
            }
          } catch {}
        },
        () => setAwayWeather({ temp: '', desc: '', location: '' })
      );
    }

    return () => clearInterval(interval);
  }, [awayScreen, awayWeather]);

  // Guided breathing cycle (4s inhale, 4s hold, 6s exhale)
  useEffect(() => {
    if (!awayBreathing) return;
    setBreathPhase('inhale');
    setBreathCount(0);

    const phases: Array<{ phase: 'inhale' | 'hold' | 'exhale'; duration: number }> = [
      { phase: 'inhale', duration: 4000 },
      { phase: 'hold', duration: 4000 },
      { phase: 'exhale', duration: 6000 },
    ];
    let idx = 0;
    let count = 0;

    const advance = () => {
      idx = (idx + 1) % phases.length;
      if (idx === 0) { count++; setBreathCount(count); }
      setBreathPhase(phases[idx].phase);
      timer = setTimeout(advance, phases[idx].duration);
    };
    let timer = setTimeout(advance, phases[0].duration);

    return () => clearTimeout(timer);
  }, [awayBreathing]);

  return {
    awayScreen,
    setAwayScreen,
    awayTime,
    awayWeather,
    awayPhotoIndex,
    setAwayPhotoIndex,
    awayFunFact,
    setAwayFunFact,
    awayBreathing,
    setAwayBreathing,
    breathPhase,
    breathCount,
    calmPhotoUrl,
    setCalmPhotoUrl,
    awayPhotoUrl,
    cyclePhoto,
    AWAY_PHOTOS,
    CALM_PHOTOS,
    AWAY_FUN,
  };
}
