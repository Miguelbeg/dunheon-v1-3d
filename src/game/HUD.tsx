import React from 'react';
import { GameState } from '../types';
import { Heart, Shield, Sword, Zap } from 'lucide-react';

interface HUDProps {
  state: GameState;
}

export const HUD: React.FC<HUDProps> = ({ state }) => {
  const healthPercent = (state.player.health / state.player.maxHealth) * 100;

  return (
    <div className="fixed inset-0 p-8 pointer-events-none select-none flex flex-col justify-between z-10">
      {/* Top Bar */}
      <div className="flex justify-between items-start">
        <div className="stat-group">
          <div className="label">Dungeon Floor</div>
          <div className="value">B{state.player.level}: Obsidian Core</div>
        </div>

        <div className="stat-group text-right">
          <div className="flex items-center justify-end gap-2 mb-1">
            <span className="text-yellow-400 text-sm font-bold">💰 {state.player.coins}</span>
          </div>
          <div className="label">Vitality</div>
          <div className="value">{state.player.health} / {state.player.maxHealth}</div>
          <div className="w-64 h-3 bg-white/10 rounded-full overflow-hidden mt-1 mb-2">
            <div
              className="h-full bg-accent shadow-[0_0_15px_var(--color-accent)] transition-all duration-300"
              style={{ width: `${healthPercent}%` }}
            />
          </div>
          
          <div className="label">Mana</div>
          <div className="value text-blue-400">{state.player.mana} / {state.player.maxMana}</div>
          <div className="w-64 h-3 bg-white/10 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all duration-300"
              style={{ width: `${(state.player.mana / state.player.maxMana) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="flex justify-between items-end">
        {/* Left side is for joystick area - we leave space here */}
        <div className="w-48" />

        {/* Center - Weapon Info */}
        <div className="flex flex-col items-center gap-4 mb-4">
          <div className="bg-ui-bg border-l-4 border-gold p-3 rounded-xl flex items-center gap-4 backdrop-blur-md border border-white/10">
            <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center text-2xl">
              ⚔️
            </div>
            <div>
              <div className="label">Equipped</div>
              <div className="value text-sm uppercase">{state.player.weapon}</div>
            </div>
          </div>
        </div>

        {/* Right - Mini Map / XP */}
        <div className="w-40 h-40 bg-ui-bg border border-white/20 rounded-lg overflow-hidden relative backdrop-blur-md">
          {/* Placeholder for mini-map canvas if we had one, for now just a style */}
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/20 uppercase tracking-widest">
            Mini Map
          </div>
          
          {/* XP Bar at bottom of map */}
          <div className="absolute bottom-0 left-0 w-full h-1 bg-black/50">
            <div 
              className="h-full bg-gold" 
              style={{ width: `${(state.player.xp % 100)}%` }}
            />
          </div>
          
          {/* Level indicator */}
          <div className="absolute top-2 right-2 bg-black/40 px-2 py-0.5 rounded text-[10px] font-bold text-gold border border-gold/30">
            LVL {state.player.level}
          </div>
        </div>
      </div>
    </div>
  );
};
