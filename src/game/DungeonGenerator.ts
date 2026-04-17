export class DungeonGenerator {
  private width: number;
  private height: number;
  private grid: number[][];

  constructor(width: number, height: number) {
    const safeWidth = typeof width === 'number' && !isNaN(width) ? width : 20;
    const safeHeight = typeof height === 'number' && !isNaN(height) ? height : 20;
    
    this.width = Math.max(10, Math.floor(safeWidth));
    this.height = Math.max(10, Math.floor(safeHeight));
    this.grid = Array(this.height).fill(0).map(() => Array(this.width).fill(1));
  }

  generate() {
    const rooms: { x: number; y: number; w: number; h: number }[] = [];
    const maxRooms = 10;
    const minRoomSize = 4;
    const maxRoomSize = 8;

    for (let i = 0; i < maxRooms; i++) {
      const w = Math.floor(Math.random() * (maxRoomSize - minRoomSize)) + minRoomSize;
      const h = Math.floor(Math.random() * (maxRoomSize - minRoomSize)) + minRoomSize;
      
      const rangeX = this.width - w - 2;
      const rangeY = this.height - h - 2;
      
      if (rangeX <= 0 || rangeY <= 0) continue;

      const x = Math.floor(Math.random() * rangeX) + 1;
      const y = Math.floor(Math.random() * rangeY) + 1;

      const newRoom = { x, y, w, h };
      let intersects = false;
      for (const room of rooms) {
        if (
          newRoom.x < room.x + room.w &&
          newRoom.x + newRoom.w > room.x &&
          newRoom.y < room.y + room.h &&
          newRoom.y + newRoom.h > room.y
        ) {
          intersects = true;
          break;
        }
      }

      if (!intersects) {
        this.fillRoom(newRoom);
        if (rooms.length > 0) {
          const prevRoom = rooms[rooms.length - 1];
          this.connectRooms(prevRoom, newRoom);
        }
        rooms.push(newRoom);
      }
    }

    if (rooms.length === 0) {
      // Fallback if no rooms were generated
      const fallbackRoom = { x: 1, y: 1, w: 5, h: 5 };
      this.fillRoom(fallbackRoom);
      rooms.push(fallbackRoom);
    }

    return {
      grid: this.grid,
      startPos: {
        x: rooms[0].x + Math.floor(rooms[0].w / 2),
        y: rooms[0].y + Math.floor(rooms[0].h / 2),
      },
      rooms: rooms,
    };
  }

  private fillRoom(room: { x: number; y: number; w: number; h: number }) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (this.grid[y] && this.grid[y][x] !== undefined) {
          this.grid[y][x] = 0;
        }
      }
    }
  }

  private connectRooms(r1: any, r2: any) {
    let x = Math.floor(r1.x + r1.w / 2);
    let y = Math.floor(r1.y + r1.h / 2);
    const targetX = Math.floor(r2.x + r2.w / 2);
    const targetY = Math.floor(r2.y + r2.h / 2);

    while (x !== targetX) {
      if (this.grid[y] && this.grid[y][x] !== undefined) {
        this.grid[y][x] = 0;
      }
      x += x < targetX ? 1 : -1;
    }
    while (y !== targetY) {
      if (this.grid[y] && this.grid[y][x] !== undefined) {
        this.grid[y][x] = 0;
      }
      y += y < targetY ? 1 : -1;
    }
  }
}
