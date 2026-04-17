export type Vector2 = { x: number; y: number };

export interface InventoryItem {
  id: string;
  type: 'health_potion' | 'mana_potion';
  name: string;
  description: string;
  count: number;
}

export interface PlayerStats {
  attack: number;
  health: number;
  mana: number;
  speed: number;
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  manaCost: number;
  cooldown: number; // in ms
  lastUsed: number; // timestamp
}

export interface Equipment {
  id: string;
  name: string;
  type: 'weapon' | 'armor';
  description: string;
  cost: number;
  bonusAttack?: number;
  bonusDefense?: number;
}

export interface GameState {
  player: {
    pos: Vector2;
    dir: number; // angle in radians
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
    level: number;
    xp: number;
    coins: number;
    weapon: string;
    inventory: InventoryItem[];
    statPoints: number;
    stats: PlayerStats;
    abilities: Ability[];
    equipment: {
      weaponId: string;
      armorId: string;
    };
    defense: number;
  };
  dungeon: number[][];
  enemies: Enemy[];
  items: Item[];
  exitPos?: Vector2;
  isInventoryOpen: boolean;
  isGameOver: boolean;
}

export interface Enemy {
  id: string;
  pos: Vector2;
  health: number;
  maxHealth: number;
  type: 'slime' | 'skeleton' | 'goblin' | 'skeleton_warrior' | 'boss';
}

export interface Item {
  id: string;
  pos: Vector2;
  type: 'health' | 'weapon' | 'xp' | 'chest' | 'mana_gem' | 'health_potion' | 'mana_potion';
  value: any;
  inventory?: InventoryItem[];
  isOpen?: boolean;
}
