'use client';

import { useRef, useEffect, type RefObject } from 'react';

interface RecordingBubbleProps {
  audioLevelRef: RefObject<number>;
  audioLowRef?: RefObject<number>;   // low frequency band (0-1)
  audioHighRef?: RefObject<number>;  // high frequency band (0-1)
  elapsed: number;
  height?: number;
}

// Color lerp helper
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function lerpRgb(a: number[], b: number[], t: number): number[] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Palette
const TEAL    = [13, 148, 136];
const CYAN    = [45, 212, 191];
const WARM    = [180, 140, 80];   // warm gold for low freq
const COOL    = [100, 140, 220];  // cool blue for high freq
const BRIGHT  = [160, 245, 235];  // bright white-cyan for loud

export default function RecordingBubble({ audioLevelRef, audioLowRef, audioHighRef, elapsed, height = 90 }: RecordingBubbleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const startTime = useRef(Date.now());
  const levelBuf = useRef<Float32Array>(new Float32Array(60));
  const bufIdx = useRef(0);
  const smoothLevel = useRef(0);
  const smoothLow = useRef(0);
  const smoothHigh = useRef(0);

  useEffect(() => {
    startTime.current = Date.now();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const now = (Date.now() - startTime.current) / 1000;
      const rawLevel = audioLevelRef.current ?? 0;
      const rawLow = audioLowRef?.current ?? 0;
      const rawHigh = audioHighRef?.current ?? 0;

      // Ring buffer for average level
      levelBuf.current[bufIdx.current % 60] = rawLevel;
      bufIdx.current++;
      let sum = 0;
      for (let i = 0; i < 60; i++) sum += levelBuf.current[i];
      const avgLevel = sum / 60;

      // Smooth values
      const prevSl = smoothLevel.current;
      smoothLevel.current = prevSl + (rawLevel - prevSl) * (rawLevel > prevSl ? 0.4 : 0.04);
      const sl = smoothLevel.current;

      smoothLow.current += (rawLow - smoothLow.current) * 0.15;
      smoothHigh.current += (rawHigh - smoothHigh.current) * 0.15;
      const sLow = smoothLow.current;
      const sHigh = smoothHigh.current;

      // Color driven by audio level + frequency content
      // sl drives intensity, sLow/sHigh drive hue shift
      // Even without freq data, level alone shifts color (quiet=teal → loud=bright)

      // Wave color: teal at rest → warm/cool blend when active → bright when loud
      let waveColor = [...CYAN];
      if (sl > 0.02) {
        // Low freq shifts warm, high freq shifts cool — both scale with level
        waveColor = lerpRgb(waveColor, WARM, Math.min(1, sLow * 1.5) * sl);
        waveColor = lerpRgb(waveColor, COOL, Math.min(1, sHigh * 1.5) * sl);
        // Always brighten with volume regardless of freq data
        waveColor = lerpRgb(waveColor, BRIGHT, sl * 0.4);
      }

      // Core glow — shifts more aggressively
      let coreColor = lerpRgb(CYAN, BRIGHT, sl * 0.6);
      coreColor = lerpRgb(coreColor, [255, 185, 90], Math.min(1, sLow * 2) * sl);
      coreColor = lerpRgb(coreColor, [120, 165, 255], Math.min(1, sHigh * 2) * sl);

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      // --- Ambient background color wash (makes color shifts visible) ---
      if (sl > 0.02) {
        const ambGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.45);
        ambGrad.addColorStop(0, `rgba(${Math.round(coreColor[0])},${Math.round(coreColor[1])},${Math.round(coreColor[2])},${sl * 0.06})`);
        ambGrad.addColorStop(0.5, `rgba(${Math.round(waveColor[0])},${Math.round(waveColor[1])},${Math.round(waveColor[2])},${sl * 0.03})`);
        ambGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = ambGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // --- Continuous waves across full width ---
      const waveCount = 6;
      const maxAmp = h * 0.35;
      const padL = 10;
      const padR = 50;

      for (let wi = 0; wi < waveCount; wi++) {
        const freq1 = 0.012 + wi * 0.004;
        const freq2 = freq1 * 2.1;
        const freq3 = freq1 * 0.4;
        const speed1 = (1.0 + wi * 0.35) * (wi % 2 === 0 ? 1 : -1);
        const speed2 = speed1 * 0.6;
        const phase1 = now * speed1 + wi * 0.7;
        const phase2 = now * speed2 + wi * 1.3;

        const steps = Math.floor((w - padL - padR) / 2);
        const yPoints: number[] = [];

        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = padL + t * (w - padL - padR);
          const distFromCenter = Math.abs(x - cx) / (w / 2);
          const bell = Math.exp(-distFromCenter * distFromCenter * 3.5);
          const audioAmp = sl * 0.85 + 0.02;
          const amp = audioAmp * bell * maxAmp * (1 - wi * 0.1);

          const y = cy
            + Math.sin(x * freq1 + phase1) * amp
            + Math.sin(x * freq2 + phase2) * amp * 0.2
            + Math.sin(x * freq3 + now * 0.3) * amp * 0.15;

          yPoints.push(y);
        }

        // Per-wave color: inner waves use core color influence, outer waves stay teal
        const colorBlend = Math.max(0, 1 - wi * 0.2); // inner waves = 1, outer = ~0.2
        const thisColor = lerpRgb([waveColor[0], waveColor[1], waveColor[2]], TEAL, 1 - colorBlend);

        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const x = padL + (s / steps) * (w - padL - padR);
          if (s === 0) ctx.moveTo(x, yPoints[s]);
          else ctx.lineTo(x, yPoints[s]);
        }

        const waveAlpha = (0.1 + sl * 0.5) * (1 - wi * 0.1);
        ctx.strokeStyle = `rgba(${Math.round(thisColor[0])},${Math.round(thisColor[1])},${Math.round(thisColor[2])},${Math.max(0.03, waveAlpha)})`;
        ctx.lineWidth = 1.8 - wi * 0.15;
        ctx.stroke();

        // Fill between wave pairs
        if (wi > 0 && wi % 2 === 0) {
          ctx.beginPath();
          for (let s = 0; s <= steps; s++) {
            const x = padL + (s / steps) * (w - padL - padR);
            if (s === 0) ctx.moveTo(x, yPoints[s]);
            else ctx.lineTo(x, yPoints[s]);
          }
          for (let s = steps; s >= 0; s--) {
            const x = padL + (s / steps) * (w - padL - padR);
            ctx.lineTo(x, cy);
          }
          ctx.closePath();
          ctx.fillStyle = `rgba(${Math.round(thisColor[0])},${Math.round(thisColor[1])},${Math.round(thisColor[2])},${0.012 + sl * 0.025})`;
          ctx.fill();
        }
      }

      // --- Center glow (over waves) ---
      const glowLayers = 5;
      for (let layer = glowLayers - 1; layer >= 0; layer--) {
        const lt = layer / glowLayers;
        const spread = 0.6 + lt * 1.5;
        const rx = w * 0.1 * spread * (1 + sl * 0.25);
        const ry = h * 0.25 * spread * (1 + sl * 0.2);

        const wobX = Math.sin(now * 1.4 + layer * 0.6) * sl * 8 + Math.sin(now * 0.5) * 2;
        const wobY = Math.cos(now * 1.0 + layer * 0.9) * sl * 5 + Math.cos(now * 0.7) * 1.5;
        const bx = cx + wobX;
        const by = cy + wobY;

        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(rx, ry));
        const coreAlpha = layer === 0
          ? 0.22 + sl * 0.45
          : (0.04 + sl * 0.1) * (1 - lt * 0.4);

        // Use frequency-reactive core color
        const gc = layer === 0 ? coreColor : lerpRgb(coreColor, TEAL, 0.5 + lt * 0.5);
        grad.addColorStop(0, `rgba(${Math.round(gc[0])},${Math.round(gc[1])},${Math.round(gc[2])},${coreAlpha})`);
        grad.addColorStop(0.25, `rgba(${Math.round(waveColor[0])},${Math.round(waveColor[1])},${Math.round(waveColor[2])},${coreAlpha * 0.7})`);
        grad.addColorStop(0.6, `rgba(${TEAL[0]},${TEAL[1]},${TEAL[2]},${coreAlpha * 0.3})`);
        grad.addColorStop(1, 'rgba(13,148,136,0)');

        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(1, ry / rx);
        ctx.translate(-bx, -by);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(bx, by, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // --- Edge fades ---
      const fadeL = ctx.createLinearGradient(0, 0, 18, 0);
      fadeL.addColorStop(0, 'rgba(8,11,20,0.98)');
      fadeL.addColorStop(1, 'transparent');
      ctx.fillStyle = fadeL;
      ctx.fillRect(0, 0, 18, h);

      const fadeR = ctx.createLinearGradient(w - padR, 0, w, 0);
      fadeR.addColorStop(0, 'transparent');
      fadeR.addColorStop(0.4, 'rgba(8,11,20,0.5)');
      fadeR.addColorStop(1, 'rgba(8,11,20,0.98)');
      ctx.fillStyle = fadeR;
      ctx.fillRect(w - padR, 0, padR, h);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [audioLevelRef, audioLowRef, audioHighRef, height]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <div className="w-full rounded-xl relative overflow-hidden" style={{
      height: `${height}px`,
      background: 'linear-gradient(160deg, rgba(8,11,20,0.97) 0%, rgba(10,14,24,0.98) 50%, rgba(8,11,20,0.97) 100%)',
      border: '1px solid rgba(13,148,136,0.08)',
    }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ display: 'block' }} />

      <div className="absolute top-2 left-0 right-0 flex items-center px-3.5 z-20 pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="rec-pulse-dot" />
          <span className="text-[9px] text-white/20 font-medium tracking-[0.15em] uppercase">Encounter</span>
          <span className="text-[10px] text-white/35 font-mono tabular-nums">{timeStr}</span>
        </div>
      </div>

      <style>{`
        .rec-pulse-dot {
          width: 5px; height: 5px; border-radius: 50%; background: #ef4444;
          box-shadow: 0 0 4px rgba(239,68,68,0.5), 0 0 8px rgba(239,68,68,0.2);
          animation: rdp 2s ease-in-out infinite;
        }
        @keyframes rdp {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
