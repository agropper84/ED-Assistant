'use client';

import { useTheme } from '@/lib/theme';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`p-2 rounded-full transition-all duration-200 ${className}`}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <div className="relative w-5 h-5">
        {theme === 'dark' ? (
          <Sun className="w-5 h-5 transition-transform duration-300 rotate-0" />
        ) : (
          <Moon className="w-5 h-5 transition-transform duration-300 rotate-0" />
        )}
      </div>
    </button>
  );
}
