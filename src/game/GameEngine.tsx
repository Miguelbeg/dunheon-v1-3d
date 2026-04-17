import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DungeonGenerator } from './DungeonGenerator';
import { GameState, Vector2, PlayerStats } from '../types';
import { Controls } from './Controls';
import { HUD } from './HUD';
import { sounds } from './SoundManager';
import { motion, AnimatePresence } from 'motion/react';

const CELL_SIZE = 4;
const WALL_HEIGHT = 4;

const createWallTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(0, 0, 256, 256);
  
  ctx.fillStyle = '#3a3a3a';
  const rows = 8;
  const cols = 4;
  const brickW = 256 / cols;
  const brickH = 256 / rows;
  
  for (let y = 0; y < rows; y++) {
    const offset = (y % 2 === 0) ? 0 : brickW / 2;
    for (let x = -1; x < cols + 1; x++) {
      ctx.fillRect(x * brickW + offset + 2, y * brickH + 2, brickW - 4, brickH - 4);
      ctx.fillStyle = Math.random() > 0.5 ? '#353535' : '#404040';
      ctx.fillRect(x * brickW + offset + 4, y * brickH + 4, brickW - 8, brickH - 8);
      ctx.fillStyle = '#3a3a3a';
    }
  }
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

const createFloorTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, 256, 256);
  
  ctx.fillStyle = '#222222';
  const tiles = 4;
  const tileS = 256 / tiles;
  
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      ctx.fillRect(x * tileS + 2, y * tileS + 2, tileS - 4, tileS - 4);
      for(let i=0; i<10; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#1a1a1a' : '#2d2d2d';
        ctx.fillRect(x * tileS + Math.random() * tileS, y * tileS + Math.random() * tileS, 4, 4);
      }
      ctx.fillStyle = '#222222';
    }
  }
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

export const GameEngine: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const moveVector = useRef({ x: 0, y: 0 });
  const keys = useRef<Record<string, boolean>>({});
  const lookDelta = useRef({ x: 0, y: 0 });
  const isMoving = useRef(false);
  const attackAnim = useRef(0);
  const projectilesRef = useRef<{ mesh: THREE.Mesh, dir: THREE.Vector3, speed: number, damage: number }[]>([]);
  const fireballsRef = useRef<{ mesh: THREE.Mesh, light: THREE.PointLight, targetId: string | null, dir: THREE.Vector3, speed: number, damage: number, lifetime: number }[]>([]);
  const lightningsRef = useRef<{ mesh: THREE.Line, lifetime: number, light: THREE.PointLight }[]>([]);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const [gameStatus, setGameStatus] = useState<'menu' | 'loading' | 'playing' | 'gameover' | 'victory'>('menu');
  const [controlMode, setControlMode] = useState<'touch' | 'keyboard'>('keyboard');
  const [isReady, setIsReady] = useState(false);
  const [inventoryTab, setInventoryTab] = useState<'items' | 'shop'>('items');

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [nearbyChestId, setNearbyChestId] = useState<string | null>(null);
  const [activeChestId, setActiveChestId] = useState<string | null>(null);
  const nearbyChestIdRef = useRef<string | null>(null);
  const activeChestIdRef = useRef<string | null>(null);

  const lastTime = useRef(0);
  const animateRef = useRef<(time: number) => void>();
  const walkSoundTimer = useRef(0);

  const SHOP_ABILITIES = [
    { id: 'fireball', name: 'Bola de Fuego', description: 'Lanza una bola de fuego al enemigo más cercano. Escala con tu Daño.', cost: 100, manaCost: 20, cooldown: 1000 },
    { id: 'lightning', name: 'Rayo', description: 'Un rayo instantáneo que golpea al enemigo más cercano. Alto daño de área pequeña.', cost: 250, manaCost: 35, cooldown: 2000 },
  ];

  const SHOP_EQUIPMENT = [
    { id: 'long_sword', name: 'Espada Larga', type: 'weapon', description: 'Una espada de acero que reemplaza tu daga. +5 Daño extra.', cost: 150, bonusAttack: 5 },
    { id: 'iron_armor', name: 'Armadura de Hierro', type: 'armor', description: 'Reduce el daño recibido y aumenta tu supervivencia.', cost: 200, bonusDefense: 3 },
  ];

  const buyAbility = (ability: typeof SHOP_ABILITIES[0]) => {
    setGameState(prev => {
      if (!prev || prev.player.coins < ability.cost) return prev;
      if (prev.player.abilities.find(a => a.id === ability.id)) return prev;
      
      sounds.play('pickup', 1.0);
      return {
        ...prev,
        player: {
          ...prev.player,
          coins: prev.player.coins - ability.cost,
          abilities: [...prev.player.abilities, {
            id: ability.id,
            name: ability.name,
            description: ability.description,
            manaCost: ability.manaCost,
            cooldown: ability.cooldown,
            lastUsed: 0
          }]
        }
      };
    });
  };

  const buyEquipment = (item: typeof SHOP_EQUIPMENT[0]) => {
    setGameState(prev => {
      if (!prev || prev.player.coins < item.cost) return prev;
      
      sounds.play('pickup', 1.0);
      const newEquipment = { ...prev.player.equipment };
      let newDefense = prev.player.defense;
      let newWeaponName = prev.player.weapon;

      if (item.type === 'weapon') {
        newEquipment.weaponId = item.id;
        newWeaponName = item.name;
        // Visual change handle in animate
      } else {
        newEquipment.armorId = item.id;
        newDefense = (item.bonusDefense || 0);
      }

      return {
        ...prev,
        player: {
          ...prev.player,
          coins: prev.player.coins - item.cost,
          equipment: newEquipment,
          defense: newDefense,
          weapon: newWeaponName
        }
      };
    });
  };

  const useAbility = (abilityId: string) => {
    setGameState(prev => {
      if (!prev || prev.isInventoryOpen || prev.isGameOver) return prev;
      const ability = prev.player.abilities.find(a => a.id === abilityId);
      if (!ability) return prev;

      const now = Date.now();
      if (now - ability.lastUsed < ability.cooldown) return prev;
      if (prev.player.mana < ability.manaCost) return prev;

      if (abilityId === 'fireball') {
        spawnFireball();
      } else if (abilityId === 'lightning') {
        spawnLightning();
      }

      return {
        ...prev,
        player: {
          ...prev.player,
          mana: prev.player.mana - ability.manaCost,
          abilities: prev.player.abilities.map(a => 
            a.id === abilityId ? { ...a, lastUsed: now } : a
          )
        }
      };
    });
  };

  const spawnLightning = () => {
    if (!sceneRef.current || !cameraRef.current || !gameStateRef.current) return;
    
    // Find nearest enemy
    const enemyRef = (sceneRef.current as any).enemyMeshes as THREE.Group[];
    let nearest: THREE.Group | null = null;
    let minDist = 15;

    enemyRef.forEach(m => {
      if (m.userData.dying) return;
      const d = m.position.distanceTo(cameraRef.current!.position);
      if (d < minDist) {
        minDist = d;
        nearest = m;
      }
    });

    const startPos = cameraRef.current.position.clone();
    startPos.y -= 0.3;
    const endPos = nearest 
      ? (nearest as THREE.Group).position.clone() 
      : cameraRef.current.position.clone().add(new THREE.Vector3(0, 0, -10).applyQuaternion(cameraRef.current.quaternion));

    const points = [];
    points.push(startPos);
    
    // Create jagged line points
    const segments = 8;
    for (let i = 1; i < segments; i++) {
      const p = new THREE.Vector3().lerpVectors(startPos, endPos, i / segments);
      p.x += (Math.random() - 0.5) * 0.5;
      p.y += (Math.random() - 0.5) * 0.5;
      p.z += (Math.random() - 0.5) * 0.5;
      points.push(p);
    }
    points.push(endPos);

    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x4488ff, linewidth: 2 });
    const line = new THREE.Line(lineGeo, lineMat);
    
    const light = new THREE.PointLight(0x4488ff, 20, 10);
    light.position.copy(endPos);
    
    sceneRef.current.add(line);
    sceneRef.current.add(light);

    lightningsRef.current.push({
      mesh: line,
      light,
      lifetime: 0.2
    });

    // Damage logic
    if (nearest) {
      const target = nearest as THREE.Group;
      sounds.play('hit', 0.8);
      
      setGameState(prev => {
        if (!prev) return null;
        const damage = 60 + (prev.player.stats.attack * 0.8);
        let enemyKilled = false;
        const newEnemies = prev.enemies.map(e => {
          if (e.id === (target as any).enemyId) {
            const newHealth = e.health - damage;
            if (newHealth <= 0) enemyKilled = true;
            return { ...e, health: newHealth };
          }
          return e;
        }).filter(e => e.health > 0);

        if (enemyKilled) {
          target.userData.dying = true;
          let newXp = prev.player.xp + 25;
          let newCoins = prev.player.coins + 10;
          let newLevel = prev.player.level;
          let newStatPoints = prev.player.statPoints;
          if (newXp >= 100) {
            newXp -= 100;
            newLevel += 1;
            newStatPoints += 3;
            sounds.play('levelUp', 0.6);
          }
          return {
            ...prev,
            enemies: newEnemies,
            player: { ...prev.player, xp: newXp, level: newLevel, coins: newCoins, statPoints: newStatPoints }
          };
        }

        return { ...prev, enemies: newEnemies };
      });
    }

    sounds.play('swing', 0.6); 
  };

  const spawnFireball = () => {
    if (!sceneRef.current || !cameraRef.current || !gameStateRef.current) return;
    
    // Find nearest enemy
    const enemyRef = (sceneRef.current as any).enemyMeshes as THREE.Group[];
    let nearest: THREE.Group | null = null;
    let minDist = 15;

    enemyRef.forEach(m => {
      if (m.userData.dying) return;
      const d = m.position.distanceTo(cameraRef.current!.position);
      if (d < minDist) {
        minDist = d;
        nearest = m;
      }
    });

    const fireGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
    const mesh = new THREE.Mesh(fireGeo, fireMat);
    mesh.position.copy(cameraRef.current.position);
    mesh.position.y -= 0.5;

    const light = new THREE.PointLight(0xff4400, 10, 5);
    mesh.add(light);
    sceneRef.current.add(mesh);

    const dir = nearest 
      ? new THREE.Vector3().subVectors((nearest as THREE.Group).position, mesh.position).normalize()
      : new THREE.Vector3(0, 0, -1).applyQuaternion(cameraRef.current.quaternion);

    fireballsRef.current.push({
      mesh,
      light,
      targetId: nearest ? (nearest as any).enemyId : null,
      dir,
      speed: 12.0,
      damage: 40 + (gameStateRef.current.player.stats.attack * 0.5),
      lifetime: 3.0
    });

    sounds.play('swing', 0.5); // Replace with fireball sound if available
  };

  // Sync ref with state
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    activeChestIdRef.current = activeChestId;
    if (activeChestId) {
      document.exitPointerLock();
    }
  }, [activeChestId]);

  const toggleInventory = React.useCallback(() => {
    setGameState(prev => {
      if (!prev) return null;
      const willOpen = !prev.isInventoryOpen;
      if (willOpen) {
        document.exitPointerLock();
      }
      return { ...prev, isInventoryOpen: willOpen };
    });
  }, []);

  const upgradeStat = (statName: keyof PlayerStats) => {
    setGameState(prev => {
      if (!prev || prev.player.statPoints <= 0) return prev;
      
      const newStatPoints = prev.player.statPoints - 1;
      const newStats = { ...prev.player.stats };
      newStats[statName] += 1;
      
      let newMaxHealth = prev.player.maxHealth;
      let newMaxMana = prev.player.maxMana;
      
      // Update max values based on stats
      if (statName === 'health') {
        newMaxHealth += 5;
      } else if (statName === 'mana') {
        newMaxMana += 3;
      }
      
      return {
        ...prev,
        player: {
          ...prev.player,
          statPoints: newStatPoints,
          stats: newStats,
          maxHealth: newMaxHealth,
          maxMana: newMaxMana
        }
      };
    });
  };

  const useItem = (itemType: string) => {
    setGameState(prev => {
      if (!prev) return null;
      const newInventory = [...prev.player.inventory];
      const itemIndex = newInventory.findIndex(i => i.type === itemType);
      
      if (itemIndex === -1) return prev;
      
      const item = newInventory[itemIndex];
      let newHealth = prev.player.health;
      let newMana = prev.player.mana;
      
      if (itemType === 'health_potion') {
        if (newHealth >= prev.player.maxHealth) return prev; // Don't use if full
        newHealth = Math.min(prev.player.maxHealth, newHealth + 50);
        sounds.play('pickup', 0.5); // Maybe a drink sound instead
      } else if (itemType === 'mana_potion') {
        if (newMana >= prev.player.maxMana) return prev; // Don't use if full
        newMana = Math.min(prev.player.maxMana, newMana + 30);
        sounds.play('pickup', 0.5);
      }
      
      item.count -= 1;
      if (item.count <= 0) {
        newInventory.splice(itemIndex, 1);
      }
      
      return {
        ...prev,
        player: {
          ...prev.player,
          health: newHealth,
          mana: newMana,
          inventory: newInventory
        }
      };
    });
  };

  const transferItem = (itemId: string, from: 'chest' | 'player') => {
    if (!activeChestId) return;
    
    setGameState(prev => {
      if (!prev) return null;
      
      const chestItemIndex = prev.items.findIndex(i => i.id === activeChestId);
      if (chestItemIndex === -1) return prev;
      
      const chest = prev.items[chestItemIndex];
      if (!chest.inventory) return prev;
      
      const newPlayerInventory = [...prev.player.inventory];
      const newChestInventory = [...chest.inventory];
      let newCoins = prev.player.coins;
      
      if (from === 'chest') {
        const itemIndex = newChestInventory.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return prev;
        
        const item = newChestInventory[itemIndex];
        
        if (item.type === 'coins') {
          newCoins += item.count;
          newChestInventory.splice(itemIndex, 1);
          sounds.play('pickup', 0.5);
        } else {
          const existingPlayerItem = newPlayerInventory.find(i => i.type === item.type);
          if (existingPlayerItem) {
            existingPlayerItem.count += item.count;
          } else {
            newPlayerInventory.push({ ...item });
          }
          newChestInventory.splice(itemIndex, 1);
          sounds.play('pickup', 0.5);
        }
      } else {
        // Transfer from player to chest
        const itemIndex = newPlayerInventory.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return prev;
        
        const item = newPlayerInventory[itemIndex];
        const existingChestItem = newChestInventory.find(i => i.type === item.type);
        
        if (existingChestItem) {
          existingChestItem.count += item.count;
        } else {
          newChestInventory.push({ ...item });
        }
        newPlayerInventory.splice(itemIndex, 1);
        sounds.play('pickup', 0.5);
      }
      
      const newItems = [...prev.items];
      newItems[chestItemIndex] = { ...chest, inventory: newChestInventory, isOpen: true };
      
      return {
        ...prev,
        items: newItems,
        player: {
          ...prev.player,
          coins: newCoins,
          inventory: newPlayerInventory
        }
      };
    });
  };

  const handleAttack = React.useCallback(() => {
    if (!cameraRef.current || !sceneRef.current || !gameStateRef.current || gameStateRef.current.isGameOver || gameStateRef.current.isInventoryOpen || activeChestIdRef.current) return;

    // Trigger Animation
    attackAnim.current = 1.0;
    sounds.play('swing', 0.3);

    // Hit Detection
    const enemyMeshes = (sceneRef.current as any).enemyMeshes as THREE.Group[];
    const camera = cameraRef.current;

    enemyMeshes.forEach((mesh, index) => {
      if (mesh.userData.dying) return;

      const dist = mesh.position.distanceTo(camera.position);
      if (dist < 3.5) {
        // Check if in front (dot product)
        const dirToEnemy = new THREE.Vector3().subVectors(mesh.position, camera.position).normalize();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const dot = dirToEnemy.dot(forward);

        if (dot > 0.3) {
          // Hit!
          sounds.play('hit', 0.4);
          
          // Knockback (only on X and Z axis)
          const knockback = dirToEnemy.clone();
          knockback.y = 0;
          knockback.normalize().multiplyScalar(0.5);
          mesh.position.add(knockback);
          
          // Flash enemy
          const mat = mesh.userData.bodyMat as THREE.MeshStandardMaterial;
          if (mat) {
            const originalColor = mat.color.clone();
            mat.color.set(0xff0000);
            setTimeout(() => {
              if (mat) {
                mat.color.copy(originalColor);
              }
            }, 100);
          }

          // Update State
          setGameState(prev => {
            if (!prev) return null;
            
            let enemyKilled = false;
            const newEnemies = prev.enemies.map(e => {
              if (e.id === (mesh as any).enemyId) {
                // Fixed base damage 20 + weapon bonus + bonus from stats
                const weaponBonus = prev.player.equipment.weaponId === 'long_sword' ? 5 : 0;
                const damage = 20 + weaponBonus + (prev.player.stats.attack * 0.30);
                const newHealth = e.health - damage;
                if (newHealth <= 0) enemyKilled = true;
                return { ...e, health: newHealth };
              }
              return e;
            }).filter(e => e.health > 0);

            if (enemyKilled) {
              mesh.userData.dying = true;
            }

            // If enemy died, add XP and Coins
            const died = enemyKilled;
            let newXp = prev.player.xp + (died ? 25 : 0);
            let newCoins = prev.player.coins + (died ? 10 : 0);
            let newLevel = prev.player.level;
            let newStatPoints = prev.player.statPoints;
            if (newXp >= 100) {
              newXp -= 100;
              newLevel += 1;
              newStatPoints += 3; // +3 points per level
              sounds.play('levelUp', 0.6);
            }

            return {
              ...prev,
              enemies: newEnemies,
              player: { ...prev.player, xp: newXp, level: newLevel, coins: newCoins, statPoints: newStatPoints }
            };
          });
        }
      }
    });
  }, []);

  // Keyboard support
  useEffect(() => {
    const down = (e: KeyboardEvent) => { 
      keys.current[e.key.toLowerCase()] = true; 
      if (e.key.toLowerCase() === 'i' && gameStatus === 'playing') {
        toggleInventory();
      }
      if (e.key.toLowerCase() === 'e' && gameStatus === 'playing') {
        if (nearbyChestIdRef.current && !gameStateRef.current?.isInventoryOpen) {
          setActiveChestId(nearbyChestIdRef.current);
          
          // Animate chest opening visually
          if (sceneRef.current) {
            const itemMeshes = (sceneRef.current as any).itemMeshes as THREE.Group[];
            const chestMesh = itemMeshes.find(m => (m as any).itemId === nearbyChestIdRef.current);
            if (chestMesh && (chestMesh as any).lidPivot) {
              (chestMesh as any).lidPivot.rotation.x = -Math.PI / 3;
            }
          }
          
          sounds.play('pickup', 0.8); // Chest open sound
        }
      }
      if (e.key === '1' && gameStatus === 'playing') {
        useAbility('fireball');
      }
      if (e.key === '2' && gameStatus === 'playing') {
        useAbility('lightning');
      }
    };
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [gameStatus, toggleInventory]);

  // Mouse support for looking and attacking
  useEffect(() => {
    if (gameStatus !== 'playing' || controlMode !== 'keyboard' || !isReady) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (gameStateRef.current?.isInventoryOpen) return;
      handleLook({ x: e.movementX, y: e.movementY });
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (gameStateRef.current?.isInventoryOpen || activeChestIdRef.current) return;
      
      if (showExitConfirm) {
        if (e.button === 0) { // Left click to go down
          nextLevel();
        } else if (e.button === 2) { // Right click to cancel
          setShowExitConfirm(false);
        }
        return;
      }

      if (e.button === 0) {
        handleAttack();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (showExitConfirm) {
        e.preventDefault();
      }
    };

    const lockPointer = () => {
      if (!gameStateRef.current?.isInventoryOpen && !activeChestIdRef.current) {
        containerRef.current?.requestPointerLock();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('click', lockPointer);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('click', lockPointer);
      document.exitPointerLock();
    };
  }, [gameStatus, controlMode, isReady, showExitConfirm]);

  const startGame = (levelParam: any = 1, preservedPlayer?: any) => {
    sounds.init();
    setGameStatus('loading');
    setIsReady(false); // Ensure isReady is false during loading
    setGameState(null); // Clear previous state to avoid UI flashes
    
    // Ensure level is a valid number
    const level = typeof levelParam === 'number' ? levelParam : 1;
    
    // Small delay to show loading screen and ensure DOM is ready
    setTimeout(() => {
      const safeLevel = Math.max(1, Math.floor(level));
      const size = Math.min(50, 15 + safeLevel * 2);
      const generator = new DungeonGenerator(size, size);
      const { grid, startPos, rooms } = generator.generate();

      // Spawn Enemies
      const enemies: any[] = [];
      rooms.forEach((room, index) => {
        if (index === 0) return; // Don't spawn in start room
        const numEnemies = Math.floor(Math.random() * 2) + Math.floor(level / 2);
        for (let i = 0; i < numEnemies; i++) {
          // Try to find a non-overlapping position
          let x, y;
          let attempts = 0;
          let isOverlapping = false;
          
          do {
            x = (room.x + 0.3 + Math.random() * (room.w - 0.6)) * CELL_SIZE;
            y = (room.y + 0.3 + Math.random() * (room.h - 0.6)) * CELL_SIZE;
            isOverlapping = enemies.some(e => {
              const dx = e.pos.x - x;
              const dy = e.pos.y - y;
              return Math.sqrt(dx * dx + dy * dy) < 1.5;
            });
            attempts++;
          } while (isOverlapping && attempts < 10);

          const typeRoll = Math.random();
          let type: 'slime' | 'skeleton' | 'goblin' | 'skeleton_warrior' = 'slime';
          let health = 40 + level * 10;
          
          if (typeRoll > 0.8) {
            type = 'skeleton';
            health = 30 + level * 8; // Skeletons have less health
          } else if (typeRoll > 0.6) {
            type = 'skeleton_warrior';
            health = 35 + level * 9; // Melee skeleton
          } else if (typeRoll > 0.3) {
            type = 'goblin';
            health = 25 + level * 5; // Goblins have lowest health
          }

          enemies.push({
            id: Math.random().toString(36).substr(2, 9),
            pos: { x, y },
            health: health,
            maxHealth: health,
            type: type,
          });
        }
      });

      const lastRoom = rooms[rooms.length - 1];
      const exitPos = { 
        x: (lastRoom.x + Math.floor(lastRoom.w / 2)) * CELL_SIZE, 
        y: (lastRoom.y + Math.floor(lastRoom.h / 2)) * CELL_SIZE 
      };

      const initialState: GameState = {
        player: preservedPlayer ? {
          ...preservedPlayer,
          pos: { x: startPos.x * CELL_SIZE, y: startPos.y * CELL_SIZE },
        } : {
          pos: { x: startPos.x * CELL_SIZE, y: startPos.y * CELL_SIZE },
          dir: 0,
          health: 100,
          maxHealth: 100,
          mana: 50,
          maxMana: 50,
          level: 1,
          xp: 0,
          coins: 0,
          weapon: 'Daga de Madera',
          inventory: [],
          statPoints: 0,
          stats: {
            attack: 0,
            health: 0,
            mana: 0,
            speed: 0
          },
          abilities: [],
          equipment: {
            weaponId: 'wooden_dagger',
            armorId: 'none',
          },
          defense: 0
        },
        dungeon: grid,
        enemies: enemies,
        items: [],
        exitPos: exitPos,
        isInventoryOpen: false,
        isGameOver: false,
      };

      // Spawn Items
      const items: any[] = [];
      rooms.forEach((room, index) => {
        // Spawn standard items
        if (Math.random() > 0.5) {
          const rand = Math.random();
          let type = 'health';
          if (rand > 0.8) type = 'mana_gem';
          else if (rand > 0.4) type = 'xp';
          
          items.push({
            id: Math.random().toString(36).substr(2, 9),
            pos: { 
              x: (room.x + Math.random() * room.w) * CELL_SIZE, 
              y: (room.y + Math.random() * room.h) * CELL_SIZE 
            },
            type: type,
            value: 20,
          });
        }
        
        // Spawn chests
        if (Math.random() > 0.7 && index !== 0 && index !== rooms.length - 1) { // 30% chance per room, not in start room, not in exit room
          const chestInventory: any[] = [];
          
          // Always some coins
          chestInventory.push({
            id: Math.random().toString(36).substr(2, 9),
            type: 'coins',
            name: 'Oro',
            description: 'Monedas de oro',
            count: Math.floor(Math.random() * 50) + 20
          });

          // Random potions
          if (Math.random() > 0.3) {
            chestInventory.push({
              id: Math.random().toString(36).substr(2, 9),
              type: 'health_potion',
              name: 'Poción de Vida',
              description: 'Restaura 50 HP',
              count: Math.floor(Math.random() * 2) + 1
            });
          }
          if (Math.random() > 0.5) {
            chestInventory.push({
              id: Math.random().toString(36).substr(2, 9),
              type: 'mana_potion',
              name: 'Poción de Maná',
              description: 'Restaura 30 MP',
              count: Math.floor(Math.random() * 2) + 1
            });
          }

          items.push({
            id: Math.random().toString(36).substr(2, 9),
            pos: { 
              x: (room.x + Math.floor(room.w / 2)) * CELL_SIZE, 
              y: (room.y + Math.floor(room.h / 2)) * CELL_SIZE 
            },
            type: 'chest',
            value: 0,
            inventory: chestInventory,
            isOpen: false
          });
        }
      });
      initialState.items = items;

      setGameState(initialState);
      initThree(grid, enemies, items, startPos, exitPos);
      setGameStatus('playing');
    }, 1000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sceneRef.current && (sceneRef.current as any).cleanupResize) {
        (sceneRef.current as any).cleanupResize();
      }
      rendererRef.current?.dispose();
    };
  }, []);

  const initThree = (grid: number[][], enemies: any[], items: any[], startPos: { x: number, y: number }, exitPos?: Vector2) => {
    // Prevent multiple renderers
    if (rendererRef.current) {
      rendererRef.current.dispose();
      if (rendererRef.current.domElement.parentElement) {
        rendererRef.current.domElement.parentElement.removeChild(rendererRef.current.domElement);
      }
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c);
    scene.fog = new THREE.FogExp2(0x0a0a0c, 0.15);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.zIndex = '0'; // Behind UI
    
    if (containerRef.current) {
      containerRef.current.appendChild(renderer.domElement);
    }
    rendererRef.current = renderer;

    // Resize handler
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    (scene as any).cleanupResize = () => window.removeEventListener('resize', handleResize);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); // Darker ambient for torches
    scene.add(ambientLight);

    const playerLight = new THREE.PointLight(0xffaa44, 15, 20); // Dimmer player light
    playerLight.position.set(0, 2, 0);
    scene.add(playerLight);
    (camera as any).playerLight = playerLight;

    // Materials
    const wallTex = createWallTexture();
    const floorTex = createFloorTexture();
    
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 });
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 });

    const boxGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
    const planeGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);

    const torches: { light: THREE.PointLight, baseIntensity: number, timeOffset: number }[] = [];

    // Build Dungeon
    // Track torch positions to avoid clustering
    const torchPositions: THREE.Vector3[] = [];

    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const posX = x * CELL_SIZE;
        const posZ = y * CELL_SIZE;

        if (grid[y][x] === 1) {
          const wall = new THREE.Mesh(boxGeo, wallMat);
          wall.position.set(posX, WALL_HEIGHT / 2, posZ);
          scene.add(wall);

          // Chance to add a torch if adjacent to floor
          // Increased probability (25%) but enforced minimum distance (4 units)
          if (Math.random() > 0.75) {
            let torchDir = null;
            if (x > 0 && grid[y][x-1] === 0) torchDir = { x: -1, z: 0 };
            else if (x < grid[y].length - 1 && grid[y][x+1] === 0) torchDir = { x: 1, z: 0 };
            else if (y > 0 && grid[y-1][x] === 0) torchDir = { x: 0, z: -1 };
            else if (y < grid.length - 1 && grid[y+1][x] === 0) torchDir = { x: 0, z: 1 };
            
            if (torchDir) {
              const torchPos = new THREE.Vector3(
                posX + torchDir.x * (CELL_SIZE/2 + 0.15),
                WALL_HEIGHT * 0.5,
                posZ + torchDir.z * (CELL_SIZE/2 + 0.15)
              );

              // Check distance to other torches
              const tooClose = torchPositions.some(p => p.distanceTo(torchPos) < 6);

              if (!tooClose) {
                const torchGroup = new THREE.Group();
                
                // Handle
                const handleGeo = new THREE.CylinderGeometry(0.08, 0.04, 0.6);
                const handleMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
                const handle = new THREE.Mesh(handleGeo, handleMat);
                handle.rotation.x = torchDir.z !== 0 ? (torchDir.z > 0 ? -Math.PI/4 : Math.PI/4) : 0;
                handle.rotation.z = torchDir.x !== 0 ? (torchDir.x > 0 ? Math.PI/4 : -Math.PI/4) : 0;
                torchGroup.add(handle);
                
                // Fire
                const fireGeo = new THREE.ConeGeometry(0.15, 0.4);
                const fireMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
                const fire = new THREE.Mesh(fireGeo, fireMat);
                fire.position.y = 0.3;
                torchGroup.add(fire);
                
                // Light - Reduced distance to 15 for better performance
                const light = new THREE.PointLight(0xffaa00, 25, 15);
                light.position.y = 0.4;
                torchGroup.add(light);
                
                torchGroup.position.copy(torchPos);
                scene.add(torchGroup);
                torches.push({ light, baseIntensity: 25, timeOffset: Math.random() * 100 });
                torchPositions.push(torchPos);
              }
            }
          }
        } else {
          const floor = new THREE.Mesh(planeGeo, floorMat);
          floor.rotation.x = -Math.PI / 2;
          floor.position.set(posX, 0, posZ);
          scene.add(floor);

          const ceiling = new THREE.Mesh(planeGeo, ceilingMat);
          ceiling.rotation.x = Math.PI / 2;
          ceiling.position.set(posX, WALL_HEIGHT, posZ);
          scene.add(ceiling);
        }
      }
    }
    (scene as any).torches = torches;

    projectilesRef.current.forEach(p => scene.remove(p.mesh));
    projectilesRef.current = [];

    // Exit Trapdoor
    if (exitPos) {
      const trapdoorGeo = new THREE.PlaneGeometry(CELL_SIZE * 0.8, CELL_SIZE * 0.8);
      const trapdoorMat = new THREE.MeshStandardMaterial({ 
        color: 0x222222, 
        emissive: 0x111111,
        roughness: 1
      });
      const trapdoor = new THREE.Mesh(trapdoorGeo, trapdoorMat);
      trapdoor.rotation.x = -Math.PI / 2;
      trapdoor.position.set(exitPos.x, 0.01, exitPos.y);
      scene.add(trapdoor);

      // Add a faint light above the trapdoor
      const exitLight = new THREE.PointLight(0x00ffff, 5, 5);
      exitLight.position.set(exitPos.x, 1, exitPos.y);
      scene.add(exitLight);
    }

    // Spawn Enemy Meshes
    const enemyMeshes: THREE.Group[] = [];
    enemies.forEach(enemy => {
      const group = new THREE.Group();
      
      let color = 0x00ff00; // Slime
      if (enemy.type === 'goblin') color = 0xff5500;

      if (enemy.type === 'skeleton' || enemy.type === 'skeleton_warrior') {
        const skeletonGroup = new THREE.Group();
        const boneMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.7 });
        group.userData.bodyMat = boneMat;

        // Head
        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const head = new THREE.Mesh(headGeo, boneMat);
        head.position.y = 1.4;
        
        // Eyes
        const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
        eye1.position.set(0.1, 0.05, 0.21);
        const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
        eye2.position.set(-0.1, 0.05, 0.21);
        head.add(eye1);
        head.add(eye2);
        skeletonGroup.add(head);

        // Torso
        const torsoGeo = new THREE.BoxGeometry(0.4, 0.6, 0.2);
        const torso = new THREE.Mesh(torsoGeo, boneMat);
        torso.position.y = 0.9;
        skeletonGroup.add(torso);

        // Arm helper
        const createLimb = (w: number, h: number, d: number) => {
          const pivot = new THREE.Group();
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boneMat);
          mesh.position.y = -h / 2;
          pivot.add(mesh);
          return pivot;
        };

        // Arms
        const leftArm = createLimb(0.15, 0.6, 0.15);
        leftArm.position.set(-0.3, 1.1, 0);
        skeletonGroup.add(leftArm);

        const rightArm = createLimb(0.15, 0.6, 0.15);
        rightArm.position.set(0.3, 1.1, 0);
        skeletonGroup.add(rightArm);

        // Legs
        const leftLeg = createLimb(0.15, 0.6, 0.15);
        leftLeg.position.set(-0.15, 0.6, 0);
        skeletonGroup.add(leftLeg);

        const rightLeg = createLimb(0.15, 0.6, 0.15);
        rightLeg.position.set(0.15, 0.6, 0);
        skeletonGroup.add(rightLeg);

        if (enemy.type === 'skeleton_warrior') {
          const swordGroup = new THREE.Group();
          const swordGeo = new THREE.BoxGeometry(0.05, 0.6, 0.15);
          const swordMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
          const sword = new THREE.Mesh(swordGeo, swordMat);
          sword.position.y = 0.3;
          swordGroup.add(sword);
          
          const handleGeo = new THREE.BoxGeometry(0.1, 0.15, 0.2);
          const handleMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
          const handle = new THREE.Mesh(handleGeo, handleMat);
          swordGroup.add(handle);

          // Attach to right arm
          swordGroup.position.set(0, -0.5, 0.1);
          swordGroup.rotation.x = Math.PI / 2;
          rightArm.add(swordGroup);
        }

        group.add(skeletonGroup);
        
        // Save references for animation
        group.userData.leftArm = leftArm;
        group.userData.rightArm = rightArm;
        group.userData.leftLeg = leftLeg;
        group.userData.rightLeg = rightLeg;
        group.userData.skeletonRoot = skeletonGroup;
      } else {
        const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
        const bodyMat = new THREE.MeshStandardMaterial({ color });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.5;
        group.add(body);
        group.userData.bodyMat = bodyMat;

        const eyeGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
        eye1.position.set(0.2, 0.7, 0.4);
        group.add(eye1);
        const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
        eye2.position.set(-0.2, 0.7, 0.4);
        group.add(eye2);
      }

      group.position.set(enemy.pos.x, 0, enemy.pos.y);
      (group as any).enemyId = enemy.id;
      group.userData.enemyType = enemy.type;
      (group as any).enemyType = enemy.type; // Keep for backwards compatibility in this file
      
      // Add emissive color to make them visible in the dark instead of a PointLight
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          child.material.emissive = new THREE.Color(color);
          child.material.emissiveIntensity = 0.2;
        }
      });

      scene.add(group);
      enemyMeshes.push(group);
    });
    (scene as any).enemyMeshes = enemyMeshes;

    // Spawn Item Meshes
    const itemMeshes: THREE.Group[] = [];
    items.forEach(item => {
      const group = new THREE.Group();
      group.position.set(item.pos.x, 0.5, item.pos.y);
      (group as any).itemId = item.id;
      (group as any).itemType = item.type;

      if (item.type === 'chest') {
        // Chest Base
        const baseGeo = new THREE.BoxGeometry(0.8, 0.4, 0.6);
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.9 }); // Dark wood
        const baseMesh = new THREE.Mesh(baseGeo, woodMat);
        baseMesh.position.y = -0.3;
        
        // Base Bands
        const bandGeo = new THREE.BoxGeometry(0.82, 0.42, 0.1);
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.8, roughness: 0.2 });
        const band1 = new THREE.Mesh(bandGeo, goldMat);
        band1.position.y = -0.3;
        band1.position.x = -0.25;
        const band2 = new THREE.Mesh(bandGeo, goldMat);
        band2.position.y = -0.3;
        band2.position.x = 0.25;
        
        // Chest Lid (pivot)
        const lidPivot = new THREE.Group();
        lidPivot.position.set(0, -0.1, -0.3); // Hinge at the back

        const lidGeo = new THREE.BoxGeometry(0.8, 0.2, 0.6);
        const lidMesh = new THREE.Mesh(lidGeo, woodMat);
        lidMesh.position.set(0, 0.1, 0.3); // Offset from hinge
        
        // Lid Bands
        const lidBandGeo = new THREE.BoxGeometry(0.82, 0.22, 0.1);
        const lidBand1 = new THREE.Mesh(lidBandGeo, goldMat);
        lidBand1.position.set(-0.25, 0.1, 0.3);
        const lidBand2 = new THREE.Mesh(lidBandGeo, goldMat);
        lidBand2.position.set(0.25, 0.1, 0.3);

        // Lock
        const lockGeo = new THREE.BoxGeometry(0.1, 0.15, 0.05);
        const lockMesh = new THREE.Mesh(lockGeo, goldMat);
        lockMesh.position.set(0, 0.05, 0.6);

        lidPivot.add(lidMesh);
        lidPivot.add(lidBand1);
        lidPivot.add(lidBand2);
        lidPivot.add(lockMesh);

        if (item.isOpen) {
          lidPivot.rotation.x = -Math.PI / 3; // Open lid
        }

        (group as any).lidPivot = lidPivot; // Store reference to animate later if needed

        group.add(baseMesh);
        group.add(band1);
        group.add(band2);
        group.add(lidPivot);
        
      } else if (item.type === 'health_potion' || item.type === 'mana_potion') {
        // Potion model
        const color = item.type === 'health_potion' ? 0xff0000 : 0x0000ff;
        const flaskGeo = new THREE.SphereGeometry(0.2, 8, 8);
        const flaskMat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.8, roughness: 0.2 });
        const flask = new THREE.Mesh(flaskGeo, flaskMat);
        
        const neckGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.2);
        const neckMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
        const neck = new THREE.Mesh(neckGeo, neckMat);
        neck.position.y = 0.2;
        
        group.add(flask);
        group.add(neck);
      } else {
        // Gems (health, xp, mana_gem)
        const geo = new THREE.OctahedronGeometry(0.3);
        let color = 0x00aaff; // xp
        let emissive = 0x003366;
        if (item.type === 'health') {
          color = 0xff0000;
          emissive = 0x330000;
        } else if (item.type === 'mana_gem') {
          color = 0x0000ff;
          emissive = 0x000033;
        }
        
        const mat = new THREE.MeshStandardMaterial({ color, emissive });
        const mesh = new THREE.Mesh(geo, mat);
        group.add(mesh);
      }

      scene.add(group);
      itemMeshes.push(group);
    });
    (scene as any).itemMeshes = itemMeshes;

    // Weapon Mesh (Dagger)
    const weaponContainer = new THREE.Group();
    weaponContainer.position.set(0.3, -0.3, -0.5);
    
    const weaponPivot = new THREE.Group();
    weaponPivot.rotation.x = -Math.PI / 4;
    weaponPivot.rotation.z = -Math.PI / 8;

    // Handle
    const handleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.9 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(0, -0.075, 0);
    weaponPivot.add(handle);

    // Guard
    const guardGeo = new THREE.BoxGeometry(0.15, 0.02, 0.04);
    const guardMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.set(0, 0, 0);
    weaponPivot.add(guard);

    // Blade
    const bladeGeo = new THREE.ConeGeometry(0.04, 0.4, 4);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0, 0.2, 0);
    blade.rotation.y = Math.PI / 4;
    weaponPivot.add(blade);
    (weaponPivot as any).blade = blade;

    weaponContainer.add(weaponPivot);
    camera.add(weaponContainer);
    scene.add(camera);
    (camera as any).weapon = weaponPivot;
    
    camera.position.set(startPos.x * CELL_SIZE, 1.6, startPos.y * CELL_SIZE);

    setIsReady(true);
  };

  const checkCollision = (x: number, z: number, grid: number[][], radius = 0.4) => {
    if (!grid || grid.length === 0) return true;
    const points = [
      { x: x - radius, z: z - radius },
      { x: x + radius, z: z - radius },
      { x: x - radius, z: z + radius },
      { x: x + radius, z: z + radius },
    ];

    for (const p of points) {
      const gridX = Math.round(p.x / CELL_SIZE);
      const gridZ = Math.round(p.z / CELL_SIZE);
      
      if (gridZ < 0 || gridZ >= grid.length || gridX < 0 || (grid[0] && gridX >= grid[0].length)) return true;
      if (!grid[gridZ] || grid[gridZ][gridX] === 1) return true;
    }
    return false;
  };

  const animate = (time: number) => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    // Calculate Delta Time
    if (!lastTime.current) lastTime.current = time;
    let dt = (time - lastTime.current) / 1000;
    lastTime.current = time;
    
    // Clamp dt to prevent huge jumps when tab is inactive or game is paused
    if (dt > 0.1) dt = 0.1;

    const camera = cameraRef.current;
    const scene = sceneRef.current;
    const playerLight = (camera as any).playerLight;
    const enemyMeshes = (scene as any).enemyMeshes as THREE.Group[];
    const itemMeshes = (scene as any).itemMeshes as THREE.Mesh[];

    const currentGameState = gameStateRef.current;

    // Only update logic if game is playing and state exists and no UI is open
    const isPaused = currentGameState?.isInventoryOpen || activeChestIdRef.current !== null;

    if (currentGameState && !currentGameState.isGameOver && !isPaused) {
      // Movement Logic
      let moveX = moveVector.current.x;
      let moveY = moveVector.current.y;
      
      // Keyboard fallback
      if (keys.current['w'] || keys.current['arrowup']) moveY = 1;
      if (keys.current['s'] || keys.current['arrowdown']) moveY = -1;
      if (keys.current['a'] || keys.current['arrowleft']) moveX = -1;
      if (keys.current['d'] || keys.current['arrowright']) moveX = 1;

      if (moveX !== 0 || moveY !== 0) {
        const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
        const baseSpeed = 5.0;
        const playerSpeed = baseSpeed + (currentGameState.player.stats.speed * 0.02);
        const speed = playerSpeed * Math.min(1, magnitude); // Units per second
        
        // Create a movement vector in local space
        const localMove = new THREE.Vector3(moveX, 0, -moveY).normalize().multiplyScalar(speed * dt);
        
        // Rotate local move to world space based on camera rotation (yaw only)
        const worldMove = localMove.applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
        
        const nextX = camera.position.x + worldMove.x;
        const nextZ = camera.position.z + worldMove.z;

        if (!checkCollision(nextX, camera.position.z, currentGameState.dungeon)) {
          camera.position.x = nextX;
        }
        if (!checkCollision(camera.position.x, nextZ, currentGameState.dungeon)) {
          camera.position.z = nextZ;
        }

        // Play walk sound
        walkSoundTimer.current += dt;
        if (walkSoundTimer.current > 0.5) {
          sounds.play('walk', 0.15);
          walkSoundTimer.current = 0;
        }
      }

      // Enemy AI
      if (enemyMeshes) {
        for (let i = enemyMeshes.length - 1; i >= 0; i--) {
          const mesh = enemyMeshes[i];
          
          if (mesh.userData.dying) {
            if (mesh.userData.fallAngle === undefined) mesh.userData.fallAngle = 0;
            
            // Fall backwards (rotate around local X axis)
            if (mesh.userData.fallAngle < Math.PI / 2) {
              const step = 5 * dt;
              mesh.rotateX(step); // Positive angle falls backward
              mesh.userData.fallAngle += step;
            } else {
              // Once flat on the ground, sink
              mesh.position.y -= 1.5 * dt;
            }
            
            if (mesh.position.y < -1.5) {
              scene.remove(mesh);
              enemyMeshes.splice(i, 1);
            }
            continue;
          }

          const dist = mesh.position.distanceTo(camera.position);
          const enemyType = (mesh as any).enemyType;
          
          // Movement & Behavior
          if (dist < 15 && dist > 0.8) {
            const dir = new THREE.Vector3().subVectors(camera.position, mesh.position).normalize();
            
            let enemyBaseSpeed = 2.2;
            if (enemyType === 'goblin') enemyBaseSpeed = 4.0; // Fast
            if (enemyType === 'skeleton') enemyBaseSpeed = 1.5; // Slow
            if (enemyType === 'skeleton_warrior') enemyBaseSpeed = 2.0; // Medium
            
            const enemySpeed = (enemyBaseSpeed + (currentGameState.player.level * 0.25)) * dt;
            
            // Skeletons stop moving if they are close enough to shoot
            let shouldMove = true;
            if (enemyType === 'skeleton' && dist < 6.0) {
              shouldMove = false;
            }

            if (shouldMove) {
              // Separation from other enemies
              const separation = new THREE.Vector3();
              const diff = new THREE.Vector3();
              
              for (let j = 0; j < enemyMeshes.length; j++) {
                if (i !== j) {
                  const other = enemyMeshes[j];
                  if (!other.userData.dying) {
                    const d = mesh.position.distanceToSquared(other.position);
                    if (d < 1.96) { // 1.4 * 1.4
                      diff.subVectors(mesh.position, other.position);
                      if (diff.lengthSq() < 0.0001) {
                        diff.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(0.1);
                      }
                      separation.add(diff.normalize().multiplyScalar(2.0 * dt));
                    }
                  }
                }
              }
              
              const finalDir = dir.add(separation).normalize();
              const nextX = mesh.position.x + finalDir.x * enemySpeed;
              const nextZ = mesh.position.z + finalDir.z * enemySpeed;
              
              // Sliding collision
              if (!checkCollision(nextX, mesh.position.z, currentGameState.dungeon, 0.3)) {
                mesh.position.x = nextX;
              }
              if (!checkCollision(mesh.position.x, nextZ, currentGameState.dungeon, 0.3)) {
                mesh.position.z = nextZ;
              }
              
              // Walking animation
              const time = Date.now() * 0.01;
              if (enemyType === 'skeleton' || enemyType === 'skeleton_warrior') {
                mesh.userData.leftLeg.rotation.x = Math.sin(time) * 0.5;
                mesh.userData.rightLeg.rotation.x = Math.sin(time + Math.PI) * 0.5;
                mesh.userData.leftArm.rotation.x = Math.sin(time + Math.PI) * 0.5;
                if (!mesh.userData.isAttacking) {
                  mesh.userData.rightArm.rotation.x = Math.sin(time) * 0.5;
                }
                mesh.userData.skeletonRoot.position.y = Math.abs(Math.sin(time * 2)) * 0.1;
              } else {
                mesh.position.y = Math.abs(Math.sin(time)) * 0.2;
              }
            } else {
              if (enemyType === 'skeleton' || enemyType === 'skeleton_warrior') {
                mesh.userData.leftLeg.rotation.x = 0;
                mesh.userData.rightLeg.rotation.x = 0;
                mesh.userData.leftArm.rotation.x = 0;
                if (!mesh.userData.isAttacking) {
                  mesh.userData.rightArm.rotation.x = 0;
                }
                mesh.userData.skeletonRoot.position.y = 0;
              } else {
                mesh.position.y = 0;
              }
            }
            
            mesh.lookAt(camera.position.x, 0, camera.position.z);
          }

          // Attack Logic
          if (mesh.userData.lastAttack === undefined) mesh.userData.lastAttack = 0;
          const now = Date.now();
          
          let attackRange = 2.0;
          let attackCooldown = 1000;
          if (enemyType === 'goblin') attackCooldown = 600; // Attacks faster
          if (enemyType === 'skeleton') {
            attackRange = 6.0;
            attackCooldown = 2000; // Shoots slower
          }
          if (enemyType === 'skeleton_warrior') {
            attackRange = 2.5;
            attackCooldown = 1200;
          }

          // Attack Animation Update
          if (enemyType === 'skeleton_warrior' && mesh.userData.isAttacking) {
            const elapsed = now - mesh.userData.attackStartTime;
            if (elapsed < 200) {
              mesh.userData.rightArm.rotation.x = -Math.PI * (elapsed / 200); // Raise arm high
            } else if (elapsed < 500) {
              mesh.userData.rightArm.rotation.x = -Math.PI + (Math.PI * 1.5) * ((elapsed - 200) / 300); // Swing down
            } else {
              mesh.userData.isAttacking = false;
              mesh.userData.rightArm.rotation.x = 0;
            }
          }

          if (dist < attackRange) {
            if (now - (mesh.userData.lastAttack as number) > attackCooldown) {
              mesh.userData.lastAttack = now;
              
              // Play enemy sound
              if (enemyType === 'slime') sounds.play('slime', 0.3);
              else if (enemyType === 'goblin') sounds.play('hit', 0.2); // Placeholder
              else if (enemyType === 'skeleton') sounds.play('swing', 0.4); // Shoot sound
              else if (enemyType === 'skeleton_warrior') sounds.play('swing', 0.4);

              if (enemyType === 'skeleton_warrior') {
                mesh.userData.isAttacking = true;
                mesh.userData.attackStartTime = now;
              }

              if (enemyType === 'skeleton') {
                // Shoot projectile
                const projGeo = new THREE.SphereGeometry(0.15, 8, 8);
                const projMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
                const projMesh = new THREE.Mesh(projGeo, projMat);
                projMesh.position.copy(mesh.position);
                projMesh.position.y = 1.0;
                
                const dir = new THREE.Vector3().subVectors(camera.position, projMesh.position).normalize();
                scene.add(projMesh);
                
                projectilesRef.current.push({
                  mesh: projMesh,
                  dir: dir,
                  speed: 8.0,
                  damage: 10 + currentGameState.player.level * 2
                });
              } else {
                // Melee attack
                setGameState(prev => {
                  if (!prev) return null;
                  let baseDamage = 12;
                  if (enemyType === 'goblin') baseDamage = 8; // Less damage per hit, but faster
                  if (enemyType === 'skeleton_warrior') baseDamage = 15; // More damage
                  
                  const totalEnemyAttack = baseDamage + (prev.player.level * 2);
                  const finalPlayerDamage = Math.max(1, totalEnemyAttack - prev.player.defense);
                  const newHealth = Math.max(0, prev.player.health - finalPlayerDamage);
                  
                  // Play hurt sound
                  sounds.play('hurt', 0.5);

                  // Visual feedback for taking damage
                  if (containerRef.current) {
                    containerRef.current.classList.add('damage-flash');
                    setTimeout(() => {
                      if (containerRef.current) containerRef.current.classList.remove('damage-flash');
                    }, 150);
                  }

                  if (newHealth === 0) {
                    sounds.play('death', 0.8);
                    return { ...prev, player: { ...prev.player, health: 0 }, isGameOver: true };
                  }
                  return { ...prev, player: { ...prev.player, health: newHealth } };
                });
              }
            }
          }
        }
      }

      // Update Projectiles
      for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
        const p = projectilesRef.current[i];
        p.mesh.position.add(p.dir.clone().multiplyScalar(p.speed * dt));
        
        // Check collision with walls
        if (checkCollision(p.mesh.position.x, p.mesh.position.z, currentGameState.dungeon, 0.1)) {
          scene.remove(p.mesh);
          projectilesRef.current.splice(i, 1);
          continue;
        }

        // Check collision with player
        if (p.mesh.position.distanceTo(camera.position) < 0.8) {
          // Hit player
          sounds.play('hurt', 0.5);
          if (containerRef.current) {
            containerRef.current.classList.add('damage-flash');
            setTimeout(() => {
              if (containerRef.current) containerRef.current.classList.remove('damage-flash');
            }, 150);
          }
          setGameState(prev => {
            if (!prev) return null;
            const finalProjDamage = Math.max(1, p.damage - prev.player.defense);
            const newHealth = Math.max(0, prev.player.health - finalProjDamage);
            if (newHealth === 0) {
              sounds.play('death', 0.8);
              return { ...prev, player: { ...prev.player, health: 0 }, isGameOver: true };
            }
            return { ...prev, player: { ...prev.player, health: newHealth } };
          });
          
          scene.remove(p.mesh);
          projectilesRef.current.splice(i, 1);
        }
      }

      // Update Fireballs
      for (let i = fireballsRef.current.length - 1; i >= 0; i--) {
        const fb = fireballsRef.current[i];
        fb.lifetime -= dt;
        
        if (fb.lifetime <= 0) {
          scene.remove(fb.mesh);
          fireballsRef.current.splice(i, 1);
          continue;
        }

        if (fb.targetId) {
          const targetMesh = enemyMeshes.find(m => (m as any).enemyId === fb.targetId && !m.userData.dying);
          if (targetMesh) {
            const targetDir = new THREE.Vector3().subVectors(targetMesh.position, fb.mesh.position).normalize();
            fb.dir.lerp(targetDir, 5 * dt).normalize();
          }
        }

        fb.mesh.position.add(fb.dir.clone().multiplyScalar(fb.speed * dt));
        fb.light.intensity = 5 + Math.random() * 5;

        if (checkCollision(fb.mesh.position.x, fb.mesh.position.z, currentGameState.dungeon, 0.2)) {
          scene.remove(fb.mesh);
          fireballsRef.current.splice(i, 1);
          continue;
        }

        for (let j = 0; j < enemyMeshes.length; j++) {
          const enemy = enemyMeshes[j];
          if (enemy.userData.dying) continue;
          if (fb.mesh.position.distanceTo(enemy.position) < 1.0) {
            sounds.play('hit', 0.5);
            
            setGameState(prev => {
              if (!prev) return null;
              let enemyKilled = false;
              const newEnemies = prev.enemies.map(e => {
                if (e.id === (enemy as any).enemyId) {
                  const newHealth = e.health - fb.damage;
                  if (newHealth <= 0) enemyKilled = true;
                  return { ...e, health: newHealth };
                }
                return e;
              }).filter(e => e.health > 0);

              if (enemyKilled) {
                enemy.userData.dying = true;
              }

              const died = enemyKilled;
              let newXp = prev.player.xp + (died ? 25 : 0);
              let newCoins = prev.player.coins + (died ? 10 : 0);
              let newLevel = prev.player.level;
              let newStatPoints = prev.player.statPoints;
              if (newXp >= 100) {
                newXp -= 100;
                newLevel += 1;
                newStatPoints += 3;
                sounds.play('levelUp', 0.6);
              }

              return {
                ...prev,
                enemies: newEnemies,
                player: { ...prev.player, xp: newXp, level: newLevel, coins: newCoins, statPoints: newStatPoints }
              };
            });

            scene.remove(fb.mesh);
            fireballsRef.current.splice(i, 1);
            break;
          }
        }
      }

      // Update Lightnings
      for (let i = lightningsRef.current.length - 1; i >= 0; i--) {
        const l = lightningsRef.current[i];
        l.lifetime -= dt;
        if (l.lifetime <= 0) {
          scene.remove(l.mesh);
          scene.remove(l.light);
          lightningsRef.current.splice(i, 1);
        } else {
          // Visual flicker
          l.mesh.material.opacity = l.lifetime / 0.2;
          l.light.intensity = (l.lifetime / 0.2) * 20;
        }
      }

      // Item Pickup
      let foundNearbyChest: string | null = null;
      if (itemMeshes) {
        for (let i = itemMeshes.length - 1; i >= 0; i--) {
          const mesh = itemMeshes[i];
          const itemType = (mesh as any).itemType;
          const itemId = (mesh as any).itemId;
          
          if (itemType !== 'chest') {
            mesh.rotation.y += 0.05;
            mesh.position.y = 0.5 + Math.sin(Date.now() * 0.005) * 0.1;
          }

          const dist = mesh.position.distanceTo(camera.position);
          
          if (itemType === 'chest') {
            if (dist < 2.0) {
              const item = currentGameState.items.find(it => it.id === itemId);
              if (item && !item.isOpen) {
                foundNearbyChest = itemId;
              }
            }
            continue; // Skip auto-pickup for chests
          }

          if (dist < 1.5) {
            const itemId = (mesh as any).itemId;
            
            // Remove from scene and array immediately to prevent double pickups or bugs
            scene.remove(mesh);
            itemMeshes.splice(i, 1);
            
            setGameState(prev => {
              if (!prev) return null;
              const item = prev.items.find(it => it.id === itemId);
              if (!item) return prev;

              let newHealth = prev.player.health;
              let newMana = prev.player.mana;
              let newXp = prev.player.xp;
              let newLevel = prev.player.level;
              let newStatPoints = prev.player.statPoints;
              let newCoins = prev.player.coins;
              let newInventory = [...prev.player.inventory];

              if (item.type === 'health') {
                newHealth = Math.min(prev.player.maxHealth, prev.player.health + 20);
                sounds.play('pickup', 0.5);
              } else if (item.type === 'mana_gem') {
                newMana = Math.min(prev.player.maxMana, prev.player.mana + 15);
                sounds.play('pickup', 0.5);
              } else if (item.type === 'xp') {
                newXp += 50;
                if (newXp >= 100) {
                  newXp -= 100;
                  newLevel += 1;
                  newStatPoints += 3;
                  sounds.play('levelUp', 0.6);
                }
                sounds.play('pickup', 0.5);
              } else if (item.type === 'health_potion' || item.type === 'mana_potion') {
                const existing = newInventory.find(invItem => invItem.type === item.type);
                if (existing) {
                  existing.count += 1;
                } else {
                  newInventory.push({
                    id: Math.random().toString(36).substr(2, 9),
                    type: item.type,
                    name: item.type === 'health_potion' ? 'Poción de Vida' : 'Poción de Maná',
                    description: item.type === 'health_potion' ? 'Restaura 50 HP' : 'Restaura 30 MP',
                    count: 1
                  });
                }
                sounds.play('pickup', 0.5);
              }

              return {
                ...prev,
                items: prev.items.filter(it => it.id !== itemId),
                player: { 
                  ...prev.player, 
                  health: newHealth, 
                  mana: newMana,
                  xp: newXp, 
                  level: newLevel,
                  statPoints: newStatPoints,
                  coins: newCoins,
                  inventory: newInventory
                }
              };
            });
          }
        }
      }

      if (nearbyChestIdRef.current !== foundNearbyChest) {
        setNearbyChestId(foundNearbyChest);
        nearbyChestIdRef.current = foundNearbyChest;
      }

      // Exit Check
      if (currentGameState.exitPos) {
        const distToExit = new THREE.Vector2(camera.position.x, camera.position.z).distanceTo(
          new THREE.Vector2(currentGameState.exitPos.x, currentGameState.exitPos.y)
        );
        if (distToExit < 1.5 && !showExitConfirm) {
          setShowExitConfirm(true);
        } else if (distToExit >= 1.5 && showExitConfirm) {
          setShowExitConfirm(false);
        }
      }
    }

    // Look Logic (Touch rotation) - always active for smoothness
    // (Handled by handleLook now)

    if (playerLight) {
      playerLight.position.copy(camera.position);
    }

    // Weapon Animation
    const weapon = (camera as any).weapon;
    if (weapon) {
      // Visual update for long sword
      if (currentGameState.player.equipment.weaponId === 'long_sword' && weapon.blade) {
        if (!weapon.blade.isLongSword) {
          weapon.blade.scale.set(1.5, 2.0, 1.5);
          weapon.blade.position.y = 0.4; // Adjust since it's longer
          weapon.blade.isLongSword = true;
        }
      }

      if (attackAnim.current > 0) {
        attackAnim.current -= dt * 4; // Takes 0.25 seconds
        if (attackAnim.current < 0) attackAnim.current = 0;
        
        const t = 1 - attackAnim.current; // 0 to 1
        const swing = Math.sin(t * Math.PI); // 0 -> 1 -> 0
        
        weapon.rotation.x = -Math.PI / 4 - swing * 1.2; // Chop down
        weapon.rotation.y = swing * 0.5; // Slight twist
        weapon.position.z = -swing * 0.3; // Thrust forward
      } else {
        weapon.rotation.x = -Math.PI / 4;
        weapon.rotation.y = 0;
        weapon.position.z = 0;
      }
    }

    // Animate Torches
    const torches = (scene as any).torches;
    if (torches) {
      const time = Date.now() * 0.005;
      torches.forEach((t: any) => {
        t.light.intensity = t.baseIntensity + Math.sin(time + t.timeOffset) * 2 + Math.random() * 1.5;
      });
    }

    rendererRef.current.render(scene, camera);
  };

  // Update animateRef on every render
  useEffect(() => {
    animateRef.current = animate;
  });

  // Start animation loop when ready
  useEffect(() => {
    if (isReady) {
      let frameId: number;
      const loop = (time: number) => {
        if (animateRef.current) animateRef.current(time);
        frameId = requestAnimationFrame(loop);
      };
      frameId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(frameId);
    }
  }, [isReady]);

  const handleMove = React.useCallback((data: { vector: { x: number; y: number }; distance: number }) => {
    if (!data || !data.vector || gameStateRef.current?.isInventoryOpen || activeChestIdRef.current) {
      moveVector.current = { x: 0, y: 0 };
      return;
    }
    const x = Number(data.vector.x) || 0;
    const y = Number(data.vector.y) || 0;
    const dist = Number(data.distance) || 0;
    moveVector.current = { x: x * dist, y: y * dist };
  }, []);

  const nextLevel = () => {
    const currentLevel = gameStateRef.current?.player.level || 1;
    setShowExitConfirm(false);
    startGame(currentLevel + 1, gameStateRef.current?.player);
  };

  // Look Logic (Touch rotation)
  const handleLook = React.useCallback((delta: { x: number; y: number }) => {
    if (!cameraRef.current || gameStateRef.current?.isInventoryOpen || activeChestIdRef.current) return;
    cameraRef.current.rotation.y -= delta.x * 0.005;
  }, []);

  const restartGame = () => {
    setShowExitConfirm(false);
    // Cleanup previous game
    if (sceneRef.current && (sceneRef.current as any).cleanupResize) {
      (sceneRef.current as any).cleanupResize();
    }
    if (rendererRef.current) {
      rendererRef.current.dispose();
      if (rendererRef.current.domElement.parentElement) {
        rendererRef.current.domElement.parentElement.removeChild(rendererRef.current.domElement);
      }
    }
    
    setGameState(null);
    setIsReady(false);
    setGameStatus('menu');
  };

  return (
    <div 
      ref={containerRef} 
      className="w-full h-screen overflow-hidden bg-bg touch-none relative"
    >
      <div className="vignette" />
      <div className="crosshair" />
      
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md border border-white/20 p-6 rounded-xl text-center"
          >
            <p className="text-white font-mono mb-4 uppercase tracking-widest text-sm">¿Descender al siguiente nivel?</p>
            <div className="flex gap-4">
              <button 
                onClick={nextLevel}
                className="px-6 py-2 bg-accent text-white font-mono text-xs uppercase tracking-widest rounded hover:bg-accent/80 transition-all"
              >
                Sí, bajar {controlMode === 'keyboard' && '(Clic Izq)'}
              </button>
              <button 
                onClick={() => setShowExitConfirm(false)}
                className="px-6 py-2 bg-white/10 text-white font-mono text-xs uppercase tracking-widest rounded hover:bg-white/20 transition-all"
              >
                No aún {controlMode === 'keyboard' && '(Clic Der)'}
              </button>
            </div>
          </motion.div>
        )}

        {gameStatus === 'menu' && (
          <motion.div 
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50 p-8 text-center"
          >
            <h1 className="text-accent text-6xl font-mono mb-2 tracking-tighter font-black italic drop-shadow-[0_0_15px_rgba(230,57,70,0.5)]">DUNGEON CRAWLER</h1>
            <p className="text-white/40 font-mono mb-12 uppercase tracking-[0.3em] text-sm">Explora • Sobrevive • Evoluciona</p>
            
            <div className="space-y-4 w-full max-w-xs">
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setControlMode('keyboard')}
                  className={`flex-1 py-3 rounded-lg font-mono text-xs uppercase tracking-widest border transition-all ${controlMode === 'keyboard' ? 'bg-accent border-accent text-white shadow-[0_0_15px_rgba(230,57,70,0.3)]' : 'bg-white/5 border-white/10 text-white/40'}`}
                >
                  ⌨️ Teclado
                </button>
                <button
                  onClick={() => setControlMode('touch')}
                  className={`flex-1 py-3 rounded-lg font-mono text-xs uppercase tracking-widest border transition-all ${controlMode === 'touch' ? 'bg-accent border-accent text-white shadow-[0_0_15px_rgba(230,57,70,0.3)]' : 'bg-white/5 border-white/10 text-white/40'}`}
                >
                  📱 Táctil
                </button>
              </div>

              <button
                onClick={() => startGame()}
                className="w-full py-5 bg-accent text-white font-mono font-bold uppercase tracking-[0.2em] hover:bg-accent/80 active:scale-95 transition-all border-b-4 border-red-900 rounded-lg"
              >
                Empezar Partida
              </button>
              
              <div className="pt-4 grid grid-cols-2 gap-2 opacity-50">
                <div className="text-[9px] text-white uppercase tracking-widest border border-white/20 p-2 rounded">
                  <div className="mb-1 text-accent">{controlMode === 'keyboard' ? 'WASD' : 'Joystick'}</div>
                  Moverse
                </div>
                <div className="text-[9px] text-white uppercase tracking-widest border border-white/20 p-2 rounded">
                  <div className="mb-1 text-accent">{controlMode === 'keyboard' ? 'Mouse / I' : 'Táctil / Mochila'}</div>
                  Mirar / Inv
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {gameStatus === 'loading' && (
          <motion.div 
            key="loading"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50"
          >
            <h1 className="text-white text-4xl font-mono mb-4 tracking-widest animate-pulse text-center px-4 uppercase">Generando Mazmorra...</h1>
            <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 1 }}
              />
            </div>
          </motion.div>
        )}

        {gameState?.isGameOver && (
          <motion.div 
            key="gameover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50 p-8 text-center"
          >
            <h2 className="text-red-600 text-6xl font-mono mb-2 tracking-tighter font-black italic">HAS MUERTO</h2>
            <p className="text-white/60 font-mono mb-8 uppercase tracking-widest">Tu alma se desvanece en la oscuridad...</p>
            
            <div className="grid grid-cols-2 gap-4 mb-12 w-full max-w-xs">
              <div className="bg-white/5 p-4 rounded border border-white/10">
                <div className="text-[10px] text-white/40 uppercase">Nivel</div>
                <div className="text-2xl text-white font-mono">{gameState.player.level}</div>
              </div>
              <div className="bg-white/5 p-4 rounded border border-white/10">
                <div className="text-[10px] text-white/40 uppercase">XP Total</div>
                <div className="text-2xl text-white font-mono">{gameState.player.xp}</div>
              </div>
            </div>

            <button
              onClick={restartGame}
              className="px-12 py-4 bg-red-600 text-white font-mono font-bold uppercase tracking-[0.2em] hover:bg-red-700 active:scale-95 transition-all border-b-4 border-red-900"
            >
              Intentar de nuevo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {isReady && gameState && (
        <>
          <HUD state={gameState} />
          <Controls 
            onMove={handleMove} 
            onAttack={handleAttack} 
            onLook={handleLook} 
            onToggleInventory={toggleInventory}
            onAbility={useAbility}
            mode={controlMode}
          />
          
          <AnimatePresence>
            {nearbyChestId && !activeChestId && !gameState.isInventoryOpen && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed bottom-40 left-1/2 -translate-x-1/2 z-40 bg-black/80 backdrop-blur-md border border-white/20 px-6 py-3 rounded-full text-center pointer-events-none"
              >
                <p className="text-white font-mono text-sm uppercase tracking-widest">
                  Pulsa <span className="text-yellow-400 font-bold">E</span> para abrir el cofre
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {activeChestId && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              >
                <div className="bg-ui-bg border border-white/20 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col md:flex-row relative">
                  
                  <button 
                    onClick={() => setActiveChestId(null)}
                    className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors z-10"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>

                  {/* Chest Inventory */}
                  <div className="w-full md:w-1/2 bg-black/40 p-8 flex flex-col border-b md:border-b-0 md:border-r border-white/10">
                    <h2 className="text-yellow-400 font-mono text-lg uppercase tracking-widest mb-6 flex items-center gap-2">
                      <span>📦</span> Cofre
                    </h2>
                    
                    <div className="grid grid-cols-4 gap-2">
                      {gameState.items.find(i => i.id === activeChestId)?.inventory?.map((item, i) => (
                        <div 
                          key={i} 
                          onClick={() => transferItem(item.id, 'chest')}
                          className="aspect-square bg-white/10 border border-white/20 rounded-lg flex flex-col items-center justify-center text-2xl hover:bg-white/20 hover:scale-105 transition-all cursor-pointer relative group"
                          title={item.description}
                        >
                          {item.type === 'health_potion' ? '❤️' : item.type === 'mana_potion' ? '💧' : '🪙'}
                          <div className="absolute bottom-1 right-1 text-[10px] font-mono font-bold bg-black/50 px-1 rounded">
                            x{item.count}
                          </div>
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap border border-white/10 transition-opacity z-50">
                            {item.name}
                          </div>
                        </div>
                      ))}
                      {/* Empty slots */}
                      {[...Array(16 - (gameState.items.find(i => i.id === activeChestId)?.inventory?.length || 0))].map((_, i) => (
                        <div key={`empty-${i}`} className="aspect-square bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-xl opacity-10"></div>
                      ))}
                    </div>
                  </div>

                  {/* Player Inventory */}
                  <div className="w-full md:w-1/2 p-8">
                    <h2 className="text-white font-mono text-lg uppercase tracking-widest mb-6 flex items-center gap-2">
                      <span>🎒</span> Tu Inventario
                    </h2>
                    
                    <div className="grid grid-cols-4 gap-2">
                      {gameState.player.inventory.map((item, i) => (
                        <div 
                          key={i} 
                          onClick={() => transferItem(item.id, 'player')}
                          className="aspect-square bg-white/10 border border-white/20 rounded-lg flex flex-col items-center justify-center text-2xl hover:bg-white/20 hover:scale-105 transition-all cursor-pointer relative group"
                          title={item.description}
                        >
                          {item.type === 'health_potion' ? '❤️' : item.type === 'mana_potion' ? '💧' : '🪙'}
                          <div className="absolute bottom-1 right-1 text-[10px] font-mono font-bold bg-black/50 px-1 rounded">
                            x{item.count}
                          </div>
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap border border-white/10 transition-opacity z-50">
                            {item.name}
                          </div>
                        </div>
                      ))}
                      {/* Empty slots */}
                      {[...Array(16 - gameState.player.inventory.length)].map((_, i) => (
                        <div key={`empty-${i}`} className="aspect-square bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-xl opacity-10"></div>
                      ))}
                    </div>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {gameState.isInventoryOpen && !activeChestId && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              >
                <div className="bg-ui-bg border border-white/20 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
                  {/* Player Preview / Stats Panel */}
                  <div className="w-full md:w-1/2 bg-black/40 p-6 flex flex-col items-center border-b md:border-b-0 md:border-r border-white/10">
                    <div className="w-32 h-32 mb-6 relative">
                      <div className="w-full h-full bg-gradient-to-b from-accent/20 to-transparent rounded-full border border-accent/40 flex items-center justify-center backdrop-blur-sm">
                        <span className="text-6xl filter drop-shadow-lg">👤</span>
                      </div>
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-accent text-white px-4 py-1.5 rounded-full text-xs font-mono font-black uppercase tracking-[0.2em] z-20 shadow-[0_4px_20px_rgba(0,0,0,0.5)] border-2 border-white/20 whitespace-nowrap">
                        Nivel {gameState.player.level}
                      </div>
                    </div>
                    
                    <div className="w-full space-y-3">
                      <div className="flex flex-col items-center mb-4">
                        <h3 className="text-white font-mono text-lg uppercase tracking-tighter italic font-black leading-none">Aventurero</h3>
                        <div className="mt-2 text-white font-mono text-[10px] uppercase tracking-widest flex items-center gap-2">
                          <span>✨</span> Puntos: <span className="text-accent font-bold">{gameState.player.statPoints}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 w-full">
                        {/* Protection */}
                        <div className="flex justify-between items-center bg-white/5 p-2 rounded border border-white/10 hover:bg-white/10 transition-colors group/stat">
                          <div className="flex flex-col">
                            <span className="text-yellow-400 font-mono text-[10px] uppercase group-hover/stat:text-yellow-300 transition-colors">Protección</span>
                            <span className="text-white/40 text-[9px] font-mono">Reducción de daño fijo</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-white font-mono text-sm font-bold">{gameState.player.defense}</span>
                            <span className="text-[10px] text-yellow-500/50">🛡️</span>
                          </div>
                        </div>

                        {/* Damage */}
                        <div className="flex justify-between items-center bg-white/5 p-2 rounded border border-white/10 hover:bg-white/10 transition-colors group/stat">
                          <div className="flex flex-col">
                            <span className="text-white font-mono text-[10px] uppercase group-hover/stat:text-accent transition-colors">Daño</span>
                            <span className="text-white/40 text-[9px] font-mono">{(20 + gameState.player.stats.attack * 0.30).toFixed(2)} Base</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-white font-mono text-xs font-bold">{gameState.player.stats.attack}</span>
                            {gameState.player.statPoints > 0 && (
                              <button 
                                onClick={() => upgradeStat('attack')}
                                className="w-5 h-5 bg-accent hover:bg-white hover:text-accent text-white rounded flex items-center justify-center text-xs font-bold transition-all transform active:scale-95"
                              >+</button>
                            )}
                          </div>
                        </div>
                        
                        {/* Health */}
                        <div className="flex justify-between items-center bg-white/5 p-2 rounded border border-white/10 hover:bg-white/10 transition-colors group/stat">
                          <div className="flex flex-col">
                            <span className="text-red-400 font-mono text-[10px] uppercase group-hover/stat:text-red-300 transition-colors">Vida</span>
                            <span className="text-white/40 text-[9px] font-mono">{gameState.player.maxHealth} Máx HP</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-white font-mono text-xs font-bold">{gameState.player.stats.health}</span>
                            {gameState.player.statPoints > 0 && (
                              <button 
                                onClick={() => upgradeStat('health')}
                                className="w-5 h-5 bg-accent hover:bg-white hover:text-accent text-white rounded flex items-center justify-center text-xs font-bold transition-all transform active:scale-95"
                              >+</button>
                            )}
                          </div>
                        </div>

                        {/* Mana */}
                        <div className="flex justify-between items-center bg-white/5 p-2 rounded border border-white/10 hover:bg-white/10 transition-colors group/stat">
                          <div className="flex flex-col">
                            <span className="text-blue-400 font-mono text-[10px] uppercase group-hover/stat:text-blue-300 transition-colors">Maná</span>
                            <span className="text-white/40 text-[9px] font-mono">{gameState.player.maxMana} Máx MP</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-white font-mono text-xs font-bold">{gameState.player.stats.mana}</span>
                            {gameState.player.statPoints > 0 && (
                              <button 
                                onClick={() => upgradeStat('mana')}
                                className="w-5 h-5 bg-accent hover:bg-white hover:text-accent text-white rounded flex items-center justify-center text-xs font-bold transition-all transform active:scale-95"
                              >+</button>
                            )}
                          </div>
                        </div>

                        {/* Speed */}
                        <div className="flex justify-between items-center bg-white/5 p-2 rounded border border-white/10 hover:bg-white/10 transition-colors group/stat">
                          <div className="flex flex-col">
                            <span className="text-green-400 font-mono text-[10px] uppercase group-hover/stat:text-green-300 transition-colors">Velocidad</span>
                            <span className="text-white/40 text-[9px] font-mono">{(5.0 + gameState.player.stats.speed * 0.02).toFixed(2)} m/s</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-white font-mono text-xs font-bold">{gameState.player.stats.speed}</span>
                            {gameState.player.statPoints > 0 && (
                              <button 
                                onClick={() => upgradeStat('speed')}
                                className="w-5 h-5 bg-accent hover:bg-white hover:text-accent text-white rounded flex items-center justify-center text-xs font-bold transition-all transform active:scale-95"
                              >+</button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Equipment & Items */}
                  <div className="w-full md:w-1/2 p-8 overflow-y-auto max-h-[80vh]">
                    <div className="flex justify-between items-center mb-6">
                      <div className="flex gap-4">
                        <button 
                          onClick={() => setInventoryTab('items')}
                          className={`text-sm font-mono uppercase tracking-widest transition-colors ${inventoryTab === 'items' ? 'text-accent' : 'text-white/40 hover:text-white'}`}
                        >
                          Ítems
                        </button>
                        <button 
                          onClick={() => setInventoryTab('shop')}
                          className={`text-sm font-mono uppercase tracking-widest transition-colors ${inventoryTab === 'shop' ? 'text-accent' : 'text-white/40 hover:text-white'}`}
                        >
                          Tienda
                        </button>
                      </div>
                      <button 
                        onClick={toggleInventory}
                        className="text-white/40 hover:text-white transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>

                    {inventoryTab === 'items' ? (
                      <>
                        {/* Weapon Slot */}
                        <div className="mb-8">
                          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Arma Equipada</div>
                          <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center gap-4">
                            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center text-2xl border border-accent/20">
                              {gameState.player.equipment.weaponId === 'long_sword' ? '⚔️' : '🗡️'}
                            </div>
                            <div>
                              <div className="text-white font-mono text-sm">{gameState.player.weapon}</div>
                              <div className="text-accent text-[10px] uppercase tracking-widest">Daño: {(20 + (gameState.player.equipment.weaponId === 'long_sword' ? 5 : 0) + gameState.player.stats.attack * 0.30).toFixed(1)}</div>
                            </div>
                          </div>
                        </div>

                        {/* Abilities */}
                        {gameState.player.abilities.length > 0 && (
                          <div className="mb-8">
                            <div className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Habilidades (Tecla 1-3)</div>
                            <div className="grid grid-cols-4 gap-2">
                              {gameState.player.abilities.map((ability, i) => (
                                <div key={ability.id} className="aspect-square bg-blue-500/10 border border-blue-500/20 rounded-lg flex flex-col items-center justify-center text-2xl relative group">
                                  <span>{ability.id === 'fireball' ? '🔥' : '⚡'}</span>
                                  <div className="absolute top-1 left-1 text-[8px] font-mono text-blue-300">{i + 1}</div>
                                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap border border-white/10 transition-opacity z-50">
                                    {ability.name} ({ability.manaCost} MP)
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Item Grid */}
                        <div>
                          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Objetos (Click para usar)</div>
                          <div className="grid grid-cols-4 gap-2">
                            {[...Array(8)].map((_, i) => {
                              const item = gameState.player.inventory[i];
                              if (item) {
                                return (
                                  <div 
                                    key={i} 
                                    onClick={() => useItem(item.type)}
                                    className="aspect-square bg-white/10 border border-white/20 rounded-lg flex flex-col items-center justify-center text-2xl hover:bg-white/20 hover:scale-105 transition-all cursor-pointer relative group"
                                    title={item.description}
                                  >
                                    {item.type === 'health_potion' ? '❤️' : '💧'}
                                    <div className="absolute bottom-1 right-1 text-[10px] font-mono font-bold bg-black/50 px-1 rounded">
                                      x{item.count}
                                    </div>
                                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap border border-white/10 transition-opacity z-50">
                                      {item.name}
                                    </div>
                                  </div>
                                );
                              } else {
                                return (
                                  <div key={i} className="aspect-square bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-xl opacity-10">
                                  </div>
                                );
                              }
                            })}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20 mb-4">
                          <span className="text-yellow-400 font-mono text-sm uppercase">Tus Monedas</span>
                          <span className="text-yellow-400 font-mono font-bold">🪙 {gameState.player.coins}</span>
                        </div>

                        {/* Shop Items */}
                        <div className="space-y-4">
                          <div className="text-[10px] text-white/30 uppercase tracking-widest">Equipamiento</div>
                          {SHOP_EQUIPMENT.map(item => {
                            const isOwned = item.type === 'weapon' 
                              ? gameState.player.equipment.weaponId === item.id 
                              : gameState.player.equipment.armorId === item.id;
                            
                            return (
                              <div key={item.id} className="bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-between group hover:border-white/20 transition-all">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center text-xl">
                                    {item.type === 'weapon' ? '⚔️' : '🛡️'}
                                  </div>
                                  <div>
                                    <div className="text-white font-mono text-xs">{item.name}</div>
                                    <div className="text-white/40 text-[9px] max-w-[150px]">{item.description}</div>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => buyEquipment(item)}
                                  disabled={isOwned || gameState.player.coins < item.cost}
                                  className={`px-3 py-1.5 rounded font-mono text-[10px] uppercase transition-all ${isOwned ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-accent text-white hover:bg-white hover:text-accent disabled:opacity-30 disabled:grayscale'}`}
                                >
                                  {isOwned ? 'Equipado' : `${item.cost} 🪙`}
                                </button>
                              </div>
                            );
                          })}

                          <div className="text-[10px] text-white/30 uppercase tracking-widest pt-2">Habilidades</div>
                          {SHOP_ABILITIES.map(ability => {
                            const isOwned = gameState.player.abilities.some(a => a.id === ability.id);
                            return (
                              <div key={ability.id} className="bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-between group hover:border-white/20 transition-all">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center text-xl">
                                    {ability.id === 'fireball' ? '🔥' : '⚡'}
                                  </div>
                                  <div>
                                    <div className="text-white font-mono text-xs">{ability.name}</div>
                                    <div className="text-white/40 text-[9px] max-w-[150px]">{ability.description}</div>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => buyAbility(ability)}
                                  disabled={isOwned || gameState.player.coins < ability.cost}
                                  className={`px-3 py-1.5 rounded font-mono text-[10px] uppercase transition-all ${isOwned ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-accent text-white hover:bg-white hover:text-accent disabled:opacity-30 disabled:grayscale'}`}
                                >
                                  {isOwned ? 'Comprado' : `${ability.cost} 🪙`}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Quit Button */}
          <button 
            onClick={restartGame}
            className="fixed top-4 right-4 z-40 bg-black/40 hover:bg-black/60 text-white/60 hover:text-white p-2 rounded-full backdrop-blur-md border border-white/10 transition-all active:scale-95"
            title="Salir al menú"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </>
      )}
    </div>
  );
};
