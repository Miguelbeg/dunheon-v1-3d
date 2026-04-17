import React, { useRef } from 'react';

interface ControlsProps {
  onMove: (data: { vector: { x: number; y: number }; distance: number }) => void;
  onAttack: () => void;
  onLook: (delta: { x: number; y: number }) => void;
  onToggleInventory: () => void;
  onAbility?: (id: string) => void;
  mode: 'touch' | 'keyboard';
}

export const Controls: React.FC<ControlsProps> = ({ onMove, onAttack, onLook, onToggleInventory, onAbility, mode }) => {
  const lookAreaRef = useRef<HTMLDivElement>(null);
  const lastTouch = useRef<{ x: number; y: number } | null>(null);
  const movementRef = useRef({ up: false, down: false, left: false, right: false });

  const updateMovement = () => {
    let x = 0;
    let y = 0;
    if (movementRef.current.up) y += 1;
    if (movementRef.current.down) y -= 1;
    if (movementRef.current.left) x -= 1;
    if (movementRef.current.right) x += 1;

    let distance = 0;
    let finalX = 0;
    let finalY = 0;

    if (x !== 0 || y !== 0) {
      distance = 1;
      const length = Math.sqrt(x * x + y * y);
      finalX = x / length;
      finalY = y / length;
    }

    onMove({
      vector: { x: finalX, y: finalY },
      distance
    });
  };

  const handleDirStart = (dir: 'up' | 'down' | 'left' | 'right') => (e: React.SyntheticEvent) => {
    e.preventDefault();
    movementRef.current[dir] = true;
    updateMovement();
  };

  const handleDirEnd = (dir: 'up' | 'down' | 'left' | 'right') => (e: React.SyntheticEvent) => {
    e.preventDefault();
    movementRef.current[dir] = false;
    updateMovement();
  };

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    lastTouch.current = { x: clientX, y: clientY };
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (lastTouch.current) {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const deltaX = clientX - lastTouch.current.x;
      const deltaY = clientY - lastTouch.current.y;
      
      onLook({ x: deltaX, y: deltaY });
      lastTouch.current = { x: clientX, y: clientY };
    }
  };

  const handleTouchEnd = () => {
    lastTouch.current = null;
    onLook({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-20 touch-none">
      {mode === 'touch' && (
        <>
          {/* D-Pad Zone */}
          <div className="absolute bottom-8 left-8 w-48 h-48 pointer-events-none flex flex-col items-center justify-center">
            <div className="absolute -top-6 text-[10px] text-white/30 uppercase tracking-[0.2em] text-center w-full">Movement</div>
            
            <div className="relative w-36 h-36 flex items-center justify-center">
              {/* Up */}
              <button 
                className="absolute top-0 w-12 h-12 bg-white/10 border border-white/20 rounded-md pointer-events-auto active:bg-white/30 backdrop-blur-sm flex items-center justify-center"
                onTouchStart={handleDirStart('up')} onTouchEnd={handleDirEnd('up')}
                onMouseDown={handleDirStart('up')} onMouseUp={handleDirEnd('up')} onMouseLeave={handleDirEnd('up')}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
              </button>
              
              {/* Down */}
              <button 
                className="absolute bottom-0 w-12 h-12 bg-white/10 border border-white/20 rounded-md pointer-events-auto active:bg-white/30 backdrop-blur-sm flex items-center justify-center"
                onTouchStart={handleDirStart('down')} onTouchEnd={handleDirEnd('down')}
                onMouseDown={handleDirStart('down')} onMouseUp={handleDirEnd('down')} onMouseLeave={handleDirEnd('down')}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
              </button>
              
              {/* Left */}
              <button 
                className="absolute left-0 w-12 h-12 bg-white/10 border border-white/20 rounded-md pointer-events-auto active:bg-white/30 backdrop-blur-sm flex items-center justify-center"
                onTouchStart={handleDirStart('left')} onTouchEnd={handleDirEnd('left')}
                onMouseDown={handleDirStart('left')} onMouseUp={handleDirEnd('left')} onMouseLeave={handleDirEnd('left')}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              
              {/* Right */}
              <button 
                className="absolute right-0 w-12 h-12 bg-white/10 border border-white/20 rounded-md pointer-events-auto active:bg-white/30 backdrop-blur-sm flex items-center justify-center"
                onTouchStart={handleDirStart('right')} onTouchEnd={handleDirEnd('right')}
                onMouseDown={handleDirStart('right')} onMouseUp={handleDirEnd('right')} onMouseLeave={handleDirEnd('right')}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>

          {/* Look Area (Right side, excluding attack button) */}
          <div 
            ref={lookAreaRef}
            className="absolute inset-0 left-1/2 pointer-events-auto"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseMove={(e) => {
              if (e.buttons === 1) handleTouchMove(e);
            }}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
          />

          {/* Action Buttons */}
          <div className="absolute bottom-12 right-12 pointer-events-auto flex items-end gap-6 z-30">
            {/* Secondary actions (placeholders for now) */}
            <div className="flex gap-4 mb-2">
              <button 
                onClick={() => onAbility && onAbility('lightning')}
                className="w-16 h-16 rounded-full bg-ui-bg border-2 border-blue-500/50 flex items-center justify-center text-2xl backdrop-blur-md active:scale-90 transition-all text-blue-300"
              >
                ⚡
              </button>
              <button 
                onClick={() => onAbility && onAbility('fireball')}
                className="w-16 h-16 rounded-full bg-ui-bg border-2 border-orange-500/50 flex items-center justify-center text-2xl backdrop-blur-md active:scale-90 transition-all text-orange-400"
              >
                🔥
              </button>
              <button 
                onClick={onToggleInventory}
                className="w-16 h-16 rounded-full bg-ui-bg border-2 border-white/20 flex items-center justify-center text-2xl backdrop-blur-md active:scale-90 transition-all"
              >
                🎒
              </button>
            </div>

            {/* Main Attack Button */}
            <button
              onClick={onAttack}
              className="w-28 h-28 bg-accent rounded-full flex items-center justify-center active:scale-95 transition-all shadow-[0_0_20px_rgba(230,57,70,0.4)] border-none"
            >
              <span className="text-white text-3xl">⚔️</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
