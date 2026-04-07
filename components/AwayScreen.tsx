'use client';

import { useState, useEffect } from 'react';
import { X, Wind, Sparkles } from 'lucide-react';
import { AWAY_PHOTOS, CALM_PHOTOS, AWAY_FUN } from '@/lib/away-screen-data';

interface AwayScreenProps {
  onClose: () => void;
}

export function AwayScreen({ onClose }: AwayScreenProps) {
  const [awayPhotoIndex, setAwayPhotoIndex] = useState(() => Math.floor(Math.random() * AWAY_PHOTOS.length));
  const [awayTime, setAwayTime] = useState('');
  const [awayWeather, setAwayWeather] = useState<{ temp: string; desc: string; location: string } | null>(null);
  const [awayFunFact, setAwayFunFact] = useState('');
  const [awayBreathing, setAwayBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale');
  const [breathCount, setBreathCount] = useState(0);
  const [calmPhotoUrl, setCalmPhotoUrl] = useState(CALM_PHOTOS[Math.floor(Math.random() * CALM_PHOTOS.length)]);

  const awayPhotoUrl = AWAY_PHOTOS[awayPhotoIndex % AWAY_PHOTOS.length];

  // Clock + weather
  useEffect(() => {
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
  }, [awayWeather]);

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

  const handleClose = () => {
    setAwayFunFact('');
    setAwayBreathing(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer select-none"
      onClick={() => {
        let next: number;
        do { next = Math.floor(Math.random() * AWAY_PHOTOS.length); } while (next === awayPhotoIndex && AWAY_PHOTOS.length > 1);
        setAwayPhotoIndex(next);
      }}
      style={{
        backgroundImage: `url(${awayPhotoUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 text-center text-white">
        <div className="text-8xl font-thin tracking-wide mb-2" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
          {awayTime}
        </div>
        {awayWeather && awayWeather.temp && (
          <div className="text-2xl font-light opacity-90" style={{ textShadow: '0 1px 10px rgba(0,0,0,0.5)' }}>
            {awayWeather.temp} &middot; {awayWeather.desc}
            {awayWeather.location && <span className="ml-2 text-lg opacity-75">{awayWeather.location}</span>}
          </div>
        )}
        <div className="mt-8 text-sm opacity-50 font-light">Tap for a new view</div>
      </div>

      {/* Close button */}
      <div
        className="absolute top-6 right-6 z-30 cursor-pointer"
        onClick={(e) => { e.stopPropagation(); handleClose(); }}
      >
        <div className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all duration-200" style={{ backdropFilter: 'blur(8px)' }}>
          <X className="w-5 h-5 text-white/70" />
        </div>
      </div>

      {/* Fun fact bubble */}
      {awayFunFact && (
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 max-w-md mx-4 px-5 py-3 rounded-2xl text-white/90 text-sm font-light text-center animate-fadeIn"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {awayFunFact}
        </div>
      )}

      {/* Breathing exercise overlay */}
      {awayBreathing && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="absolute inset-0 transition-opacity duration-[2000ms]"
            style={{
              backgroundImage: `url(${calmPhotoUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 1,
            }}
          />
          <div className="absolute inset-0 bg-black/45" />
          <div className="relative z-10 flex flex-col items-center gap-8">
            <div
              className="rounded-full flex items-center justify-center transition-all ease-in-out"
              style={{
                width: breathPhase === 'exhale' ? 140 : 260,
                height: breathPhase === 'exhale' ? 140 : 260,
                transitionDuration: breathPhase === 'inhale' ? '4s' : breathPhase === 'hold' ? '0.3s' : '6s',
                background: breathPhase === 'inhale'
                  ? 'radial-gradient(circle, rgba(94,234,212,0.35) 0%, rgba(94,234,212,0.08) 60%, transparent 100%)'
                  : breathPhase === 'hold'
                  ? 'radial-gradient(circle, rgba(147,197,253,0.35) 0%, rgba(147,197,253,0.08) 60%, transparent 100%)'
                  : 'radial-gradient(circle, rgba(196,181,253,0.25) 0%, rgba(196,181,253,0.05) 60%, transparent 100%)',
                boxShadow: [
                  `0 0 ${breathPhase === 'exhale' ? 20 : 50}px rgba(255,255,255,0.08)`,
                  `inset 0 0 ${breathPhase === 'exhale' ? 15 : 40}px rgba(255,255,255,0.05)`,
                ].join(', '),
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <span
                className="text-white/90 font-extralight uppercase whitespace-nowrap transition-all ease-in-out"
                style={{
                  fontSize: breathPhase === 'exhale' ? 12 : 18,
                  letterSpacing: breathPhase === 'exhale' ? '0.15em' : '0.25em',
                  transitionDuration: breathPhase === 'inhale' ? '4s' : breathPhase === 'hold' ? '0.3s' : '6s',
                  textShadow: '0 2px 12px rgba(0,0,0,0.4)',
                }}
              >
                {breathPhase === 'inhale' ? 'Breathe in' : breathPhase === 'hold' ? 'Hold' : 'Breathe out'}
              </span>
            </div>
            <div className="text-white/40 text-sm font-light tracking-wide" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.3)' }}>
              {breathCount > 0 ? `${breathCount} breath${breathCount !== 1 ? 's' : ''} completed` : '4 \u00b7 4 \u00b7 6 breathing'}
            </div>
            <button
              onClick={() => setAwayBreathing(false)}
              className="mt-4 px-6 py-2.5 rounded-full text-white/60 text-sm font-light tracking-wide hover:text-white/90 transition-all duration-300"
              style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Bottom buttons */}
      <div className="absolute bottom-6 right-6 z-30 flex gap-3">
        <div
          className="cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setCalmPhotoUrl(CALM_PHOTOS[Math.floor(Math.random() * CALM_PHOTOS.length)]);
            setAwayBreathing(true);
            setAwayFunFact('');
          }}
        >
          <div className="p-3.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all duration-200" style={{ backdropFilter: 'blur(8px)' }}>
            <Wind className="w-6 h-6 text-white/80" />
          </div>
        </div>
        <div
          className="cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setAwayFunFact(AWAY_FUN[Math.floor(Math.random() * AWAY_FUN.length)]);
            setAwayBreathing(false);
          }}
        >
          <div className="p-3.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all duration-200" style={{ backdropFilter: 'blur(8px)' }}>
            <Sparkles className="w-6 h-6 text-white/80" />
          </div>
        </div>
      </div>
    </div>
  );
}
