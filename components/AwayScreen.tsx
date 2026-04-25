'use client';

import { useState } from 'react';
import { X, Wind, Sparkles, Gamepad2 } from 'lucide-react';
import { AWAY_FUN, CALM_PHOTOS } from '@/lib/away-screen-data';
import { ZeldaGame } from '@/components/ZeldaGame';

interface AwayScreenProps {
  onClose: () => void;
  awayTime: string;
  awayWeather: { temp: string; desc: string; location: string } | null;
  awayPhotoUrl: string;
  awayFunFact: string;
  setAwayFunFact: (v: string) => void;
  awayBreathing: boolean;
  setAwayBreathing: (v: boolean) => void;
  breathPhase: 'inhale' | 'hold' | 'exhale';
  breathCount: number;
  calmPhotoUrl: string;
  setCalmPhotoUrl: (v: string) => void;
  cyclePhoto: () => void;
}

export function AwayScreen({
  onClose,
  awayTime,
  awayWeather,
  awayPhotoUrl,
  awayFunFact,
  setAwayFunFact,
  awayBreathing,
  setAwayBreathing,
  breathPhase,
  breathCount,
  calmPhotoUrl,
  setCalmPhotoUrl,
  cyclePhoto,
}: AwayScreenProps) {
  const [showGame, setShowGame] = useState(false);

  const handleClose = () => {
    setAwayFunFact('');
    setAwayBreathing(false);
    setShowGame(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer select-none"
      onClick={() => cyclePhoto()}
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
            setShowGame(true);
            setAwayBreathing(false);
            setAwayFunFact('');
          }}
        >
          <div className="p-3.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all duration-200" style={{ backdropFilter: 'blur(8px)' }}>
            <Gamepad2 className="w-6 h-6 text-white/80" />
          </div>
        </div>
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

      {/* Game overlay */}
      {showGame && <ZeldaGame onClose={() => setShowGame(false)} />}
    </div>
  );
}
