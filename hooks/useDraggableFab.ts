import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'ed-fab-position';

interface FabPosition {
  x: number;
  y: number;
}

/**
 * Hook for managing a draggable Floating Action Button.
 * Persists position to localStorage. Returns position, refs, and reset function.
 */
export function useDraggableFab() {
  const [fabPos, setFabPos] = useState<FabPosition | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  const fabDragging = useRef(false);
  const fabDragStart = useRef({ x: 0, y: 0, fabX: 0, fabY: 0 });
  const fabMoved = useRef(false);
  const fabRef = useRef<HTMLDivElement>(null);

  // Window-level pointer handlers for reliable drag tracking
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!fabDragging.current) return;
      const dx = e.clientX - fabDragStart.current.x;
      const dy = e.clientY - fabDragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        fabMoved.current = true;
        setFabPos({
          x: Math.max(16, Math.min(window.innerWidth - 72, fabDragStart.current.fabX + dx)),
          y: Math.max(16, Math.min(window.innerHeight - 72, fabDragStart.current.fabY + dy)),
        });
      }
    };
    const handleUp = () => {
      fabDragging.current = false;
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, []);

  // Persist position
  useEffect(() => {
    if (fabPos) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fabPos));
    }
  }, [fabPos]);

  const handlePointerDown = (e: React.PointerEvent) => {
    fabDragging.current = true;
    fabMoved.current = false;
    const rect = fabRef.current?.getBoundingClientRect();
    fabDragStart.current = {
      x: e.clientX,
      y: e.clientY,
      fabX: rect?.left ?? e.clientX,
      fabY: rect?.top ?? e.clientY,
    };
  };

  const resetPosition = () => {
    setFabPos(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const wasDragged = () => fabMoved.current;

  return {
    fabPos,
    fabRef,
    handlePointerDown,
    resetPosition,
    wasDragged,
  };
}
