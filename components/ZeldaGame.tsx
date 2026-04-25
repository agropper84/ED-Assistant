'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

// =============================================================================
// Types & Constants
// =============================================================================

const TILE_SIZE = 32;
const PLAYER_SPEED = 120; // px/sec

const W = 0, F = 1, D = 2, B = 3, T = 4, S = 5, K = 6, R = 7, A = 8, P = 9;

type TileType = 0|1|2|3|4|5|6|7|8|9;

interface Room {
  id: string;
  width: number;
  height: number;
  tiles: TileType[][];
  enemies: { type: string; x: number; y: number; hp: number; maxHp: number; vx: number; vy: number; state: 'idle'|'chase'|'hurt'|'dead'; hurtTimer: number }[];
  interactables: { type: string; x: number; y: number; used: boolean; npcType?: string; questionCategory?: string }[];
  doors: { x: number; y: number; targetRoomID: string }[];
  spawnPoint?: { x: number; y: number };
}

interface Question {
  id: string;
  category: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

type Phase = 'intro' | 'exploring' | 'dialog' | 'question' | 'gameOver';

// =============================================================================
// Room Data — Level 1
// =============================================================================

function buildRoom(id: string, width: number, height: number, tiles: number[][],
  enemies: { type: string; x: number; y: number }[] = [],
  interactables: { type: string; x: number; y: number; npcType?: string; questionCategory?: string }[] = [],
  doors: { x: number; y: number; targetRoomID: string }[] = [],
  spawnPoint?: { x: number; y: number }
): Room {
  return {
    id, width, height,
    tiles: tiles as TileType[][],
    enemies: enemies.map(e => ({ ...e, hp: 1, maxHp: 1, vx: 0, vy: 0, state: 'idle' as const, hurtTimer: 0 })),
    interactables: interactables.map(i => ({ ...i, used: false })),
    doors, spawnPoint,
  };
}

const ROOMS: Room[] = [
  // Room 1-1: Doctor's apartment
  buildRoom("1-1", 12, 10, [
    [W,W,W,W,W,W,W,W,W,W,W,W],
    [W,K,F,F,F,F,F,T,T,A,K,W],
    [W,B,B,F,R,R,F,F,F,F,S,W],
    [W,B,B,F,R,R,F,T,F,F,S,W],
    [W,F,T,F,R,R,F,F,F,F,F,W],
    [W,F,F,F,F,F,F,F,F,F,F,W],
    [W,F,F,F,T,T,T,F,F,F,F,W],
    [W,P,F,F,T,F,F,F,F,K,F,W],
    [W,F,F,R,R,R,F,F,F,F,F,W],
    [W,W,W,W,D,D,W,W,W,W,W,W],
  ],
  [],
  [
    { type: 'npc', x: 2, y: 4, npcType: 'alarmClock' },
    { type: 'cabinet', x: 1, y: 1, questionCategory: 'EM' },
    { type: 'npc', x: 5, y: 7, npcType: 'coffeeMachine' },
    { type: 'npc', x: 8, y: 8, npcType: 'coatRack' },
  ],
  [{ x: 4, y: 9, targetRoomID: '1-2' }],
  { x: 3, y: 3 }),

  // Room 1-2: Front stoop
  buildRoom("1-2", 14, 12, [
    [W,W,W,W,W,D,D,W,W,W,W,W,W,W],
    [W,F,R,R,R,R,R,R,R,R,R,F,F,W],
    [W,F,W,F,F,F,F,F,F,F,F,W,F,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,P,F,F,F,F,F,F,F,F,F,F,P,W],
    [W,F,F,T,F,F,F,F,F,T,F,F,F,W],
    [W,P,F,F,F,R,R,R,F,F,F,F,P,W],
    [W,F,F,F,F,R,R,R,F,F,F,F,F,W],
    [W,F,F,F,F,R,R,R,F,F,F,F,F,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,F,P,F,F,F,F,F,F,F,F,P,F,W],
    [W,W,W,W,W,W,D,D,W,W,W,W,W,W],
  ],
  [{ type: 'cough', x: 10, y: 6 }],
  [
    { type: 'npc', x: 1, y: 2, npcType: 'mailbox' },
    { type: 'npc', x: 4, y: 9, npcType: 'neighbor' },
  ],
  [
    { x: 5, y: 0, targetRoomID: '1-1' },
    { x: 6, y: 11, targetRoomID: '2-1' },
  ]),

  // Room 2-1: Street
  buildRoom("2-1", 16, 12, [
    [W,W,W,W,W,W,W,D,D,W,W,W,W,W,W,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,F,F,W,W,F,F,F,F,F,F,W,W,F,F,W],
    [W,F,F,W,W,F,F,F,F,F,F,W,W,F,F,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,F,F,F,F,W,W,F,F,W,W,F,F,F,F,W],
    [W,F,F,F,F,W,W,F,F,W,W,F,F,F,F,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  ],
  [
    { type: 'cough', x: 4, y: 5 },
    { type: 'cough', x: 11, y: 4 },
  ],
  [{ type: 'npc', x: 2, y: 9, npcType: 'neighbor' }],
  [{ x: 7, y: 0, targetRoomID: '1-2' }]),
];

// =============================================================================
// Question Bank (subset)
// =============================================================================

const QUESTIONS: Question[] = [
  { id: 'EM-001', category: 'Emergency Medicine', question: 'tPA window for ischemic stroke?', options: ['1.5hrs', '3hrs', '4.5hrs', '6hrs'], correctIndex: 2, explanation: 'IV alteplase within 4.5 hours of symptom onset.' },
  { id: 'EM-002', category: 'Emergency Medicine', question: 'First-line for anaphylaxis?', options: ['Benadryl', 'Steroids', 'IM Epinephrine', 'Albuterol'], correctIndex: 2, explanation: 'IM epinephrine in the anterolateral thigh.' },
  { id: 'ACLS-001', category: 'ACLS', question: 'First-line drug for pulseless VT/VF?', options: ['Amiodarone', 'Epinephrine', 'Lidocaine', 'Atropine'], correctIndex: 1, explanation: 'Epinephrine 1mg IV/IO every 3-5 min.' },
  { id: 'ACLS-002', category: 'ACLS', question: 'CPR compression rate for adults?', options: ['60-80/min', '80-100/min', '100-120/min', '120-140/min'], correctIndex: 2, explanation: 'AHA recommends 100-120 compressions per minute.' },
  { id: 'ATLS-001', category: 'ATLS', question: 'First step in ATLS primary survey?', options: ['Breathing', 'Airway with C-spine', 'Circulation', 'Disability'], correctIndex: 1, explanation: 'ABCDE: Airway with cervical spine protection first.' },
  { id: 'RAD-001', category: 'Radiology', question: 'Sail sign on lateral elbow X-ray indicates?', options: ['Normal finding', 'Joint effusion / occult fracture', 'Dislocation', 'Tendon rupture'], correctIndex: 1, explanation: 'Elevated fat pads suggest occult fracture.' },
];

// =============================================================================
// NPC Dialog
// =============================================================================

function getNPCDialog(npcType?: string): { text: string; speaker: string | null } {
  switch (npcType) {
    case 'alarmClock': return { text: '6:00 AM... Time for your shift, Doctor. Use arrow keys to move, Space to interact. 🩺', speaker: 'Alarm' };
    case 'coffeeMachine': return { text: 'Grab a coffee for the road! ☕', speaker: 'Coffee Machine' };
    case 'coatRack': return { text: 'You grab your white coat and stethoscope. Time to save some lives. 🩺', speaker: null };
    case 'mailbox': return { text: 'Bills... student loans... more bills. Maybe one day you\'ll pay these off. 💸', speaker: 'Mailbox' };
    case 'neighbor': return { text: 'Heading to the hospital? Be careful — there\'s something going around... 😷', speaker: 'Neighbor' };
    default: return { text: 'Stay alert, Doctor!', speaker: null };
  }
}

// =============================================================================
// Tile Colors
// =============================================================================

const HOME_COLORS: Record<number, string> = {
  [W]: '#8B7355',  // wall (wood)
  [F]: '#C49A6C',  // floor (hardwood)
  [D]: '#6B4226',  // door
  [B]: '#4A6FA5',  // bed (blue blanket)
  [T]: '#7A5B3A',  // table/counter
  [S]: '#6B5B8A',  // sofa (purple)
  [K]: '#5C4033',  // shelf (dark wood)
  [R]: '#8B3A3A',  // rug (burgundy)
  [A]: '#B0B4B8',  // appliance (steel)
  [P]: '#4A8B4A',  // plant (green)
};

const OUTDOOR_COLORS: Record<number, string> = {
  [W]: '#2B5E2B',  // hedge
  [F]: '#5A8A45',  // grass
  [D]: '#6B8B5A',  // gate
  [B]: '#5A8A45', [T]: '#7A6B4A', [S]: '#5A8A45',
  [K]: '#5A8A45', [R]: '#9A9080', [A]: '#B0B4B8',
  [P]: '#2D6B2D',  // bush/tree
};

function getTileColor(tile: TileType, roomId: string): string {
  const isOutdoor = roomId.startsWith('1-2') || roomId.startsWith('2-');
  return (isOutdoor ? OUTDOOR_COLORS : HOME_COLORS)[tile] || '#333';
}

function tileBlocks(tile: TileType): boolean {
  return tile !== F && tile !== D && tile !== R;
}

// =============================================================================
// Game Component
// =============================================================================

interface ZeldaGameProps {
  onClose?: () => void;
}

export function ZeldaGame({ onClose }: ZeldaGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    phase: 'intro' as Phase,
    introTimer: 2.5,
    room: ROOMS[0],
    px: 0, py: 0,  // player pixel position
    facing: { dx: 0, dy: 1 }, // facing down
    hearts: 6,
    maxHearts: 6,
    score: 0,
    keys: {} as Record<string, boolean>,
    dialogText: '',
    dialogSpeaker: null as string | null,
    currentQuestion: null as Question | null,
    selectedAnswer: null as number | null,
    answerTimer: 0,
    attackCooldown: 0,
    attackActive: false,
    attackX: 0, attackY: 0,
    invulnTimer: 0,
    usedQuestions: new Set<string>(),
    lastTime: 0,
  });
  const [, forceRender] = useState(0);

  // Initialize player position
  useEffect(() => {
    const s = stateRef.current;
    const sp = s.room.spawnPoint || { x: 2, y: 2 };
    s.px = (sp.x + 0.5) * TILE_SIZE;
    s.py = (sp.y + 0.5) * TILE_SIZE;
  }, []);

  // Key handlers
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key] = true;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleAction();
      }
    };
    const onUp = (e: KeyboardEvent) => { stateRef.current.keys[e.key] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);

  const handleAction = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === 'dialog') {
      s.phase = 'exploring';
      s.dialogText = '';
      forceRender(n => n + 1);
      return;
    }
    if (s.phase === 'question' && s.selectedAnswer !== null) return;
    if (s.phase === 'exploring') {
      // Check for nearby interactable
      for (const inter of s.room.interactables) {
        if (inter.used) continue;
        const ix = (inter.x + 0.5) * TILE_SIZE;
        const iy = (inter.y + 0.5) * TILE_SIZE;
        const dist = Math.hypot(s.px - ix, s.py - iy);
        if (dist < TILE_SIZE * 1.5) {
          inter.used = true;
          if (inter.type === 'npc') {
            const { text, speaker } = getNPCDialog(inter.npcType);
            s.dialogText = text;
            s.dialogSpeaker = speaker;
            s.phase = 'dialog';
          } else if (inter.type === 'cabinet') {
            const available = QUESTIONS.filter(q => !s.usedQuestions.has(q.id));
            const q = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : QUESTIONS[0];
            s.usedQuestions.add(q.id);
            s.currentQuestion = q;
            s.selectedAnswer = null;
            s.phase = 'question';
          }
          forceRender(n => n + 1);
          return;
        }
      }
      // Attack
      if (s.attackCooldown <= 0) {
        s.attackCooldown = 0.4;
        s.attackActive = true;
        s.attackX = s.px + s.facing.dx * TILE_SIZE;
        s.attackY = s.py + s.facing.dy * TILE_SIZE;
        setTimeout(() => { s.attackActive = false; }, 200);
      }
    }
  }, []);

  const answerQuestion = useCallback((index: number) => {
    const s = stateRef.current;
    if (!s.currentQuestion || s.selectedAnswer !== null) return;
    s.selectedAnswer = index;
    s.answerTimer = 1.5;
    if (index === s.currentQuestion.correctIndex) {
      s.score += 100;
      if (s.hearts < s.maxHearts) s.hearts = Math.min(s.hearts + 2, s.maxHearts);
      else { s.maxHearts += 2; s.hearts += 2; }
    }
    forceRender(n => n + 1);
  }, []);

  // Game loop
  useEffect(() => {
    let animId: number;
    const loop = (time: number) => {
      const s = stateRef.current;
      const dt = s.lastTime ? (time - s.lastTime) / 1000 : 0;
      s.lastTime = time;
      const canvas = canvasRef.current;
      if (!canvas) { animId = requestAnimationFrame(loop); return; }
      const ctx = canvas.getContext('2d')!;

      // Intro
      if (s.phase === 'intro') {
        s.introTimer -= dt;
        if (s.introTimer <= 0) { s.phase = 'exploring'; forceRender(n => n + 1); }
      }

      // Update
      if (s.phase === 'exploring') {
        let dx = 0, dy = 0;
        if (s.keys['ArrowUp'] || s.keys['w']) dy = -1;
        if (s.keys['ArrowDown'] || s.keys['s']) dy = 1;
        if (s.keys['ArrowLeft'] || s.keys['a']) dx = -1;
        if (s.keys['ArrowRight'] || s.keys['d']) dx = 1;

        if (dx || dy) {
          s.facing = { dx, dy };
          const len = Math.sqrt(dx * dx + dy * dy);
          const nx = s.px + (dx / len) * PLAYER_SPEED * dt;
          const ny = s.py + (dy / len) * PLAYER_SPEED * dt;

          // Collision check
          const col = Math.floor(nx / TILE_SIZE);
          const row = Math.floor(ny / TILE_SIZE);
          const margin = 6;
          const checkPoints = [
            { r: Math.floor((ny - margin) / TILE_SIZE), c: Math.floor((nx - margin) / TILE_SIZE) },
            { r: Math.floor((ny - margin) / TILE_SIZE), c: Math.floor((nx + margin) / TILE_SIZE) },
            { r: Math.floor((ny + margin) / TILE_SIZE), c: Math.floor((nx - margin) / TILE_SIZE) },
            { r: Math.floor((ny + margin) / TILE_SIZE), c: Math.floor((nx + margin) / TILE_SIZE) },
          ];
          let blocked = false;
          for (const p of checkPoints) {
            if (p.r < 0 || p.r >= s.room.height || p.c < 0 || p.c >= s.room.width) { blocked = true; break; }
            if (tileBlocks(s.room.tiles[p.r][p.c])) { blocked = true; break; }
          }
          if (!blocked) { s.px = nx; s.py = ny; }
        }

        // Door check
        for (const door of s.room.doors) {
          const doorPx = (door.x + 0.5) * TILE_SIZE;
          const doorPy = (door.y + 0.5) * TILE_SIZE;
          if (Math.hypot(s.px - doorPx, s.py - doorPy) < 16) {
            const nextRoom = ROOMS.find(r => r.id === door.targetRoomID);
            if (nextRoom) {
              // Find entry door in new room
              const entryDoor = nextRoom.doors.find(d => d.targetRoomID === s.room.id);
              // Reset enemies/interactables
              const fresh = JSON.parse(JSON.stringify(ROOMS.find(r => r.id === nextRoom.id)!)) as Room;
              s.room = fresh;
              if (entryDoor) {
                s.px = (entryDoor.x + 0.5) * TILE_SIZE;
                s.py = (entryDoor.y + 0.5) * TILE_SIZE - (entryDoor.y === 0 ? -30 : entryDoor.y >= fresh.height - 1 ? 30 : 0);
              } else if (fresh.spawnPoint) {
                s.px = (fresh.spawnPoint.x + 0.5) * TILE_SIZE;
                s.py = (fresh.spawnPoint.y + 0.5) * TILE_SIZE;
              }
              forceRender(n => n + 1);
              break;
            }
          }
        }

        // Enemy AI
        for (const enemy of s.room.enemies) {
          if (enemy.state === 'dead') continue;
          if (enemy.state === 'hurt') {
            enemy.hurtTimer -= dt;
            if (enemy.hurtTimer <= 0) enemy.state = 'chase';
            continue;
          }
          const ex = (enemy.x + 0.5) * TILE_SIZE + enemy.vx;
          const ey = (enemy.y + 0.5) * TILE_SIZE + enemy.vy;
          const dist = Math.hypot(s.px - ex, s.py - ey);
          if (dist < 120) {
            enemy.state = 'chase';
            const ndx = (s.px - ex) / dist;
            const ndy = (s.py - ey) / dist;
            enemy.vx += ndx * 40 * dt;
            enemy.vy += ndy * 40 * dt;
          }
          // Player damage
          if (dist < 14 && s.invulnTimer <= 0) {
            s.hearts -= 1;
            s.invulnTimer = 1.5;
            if (s.hearts <= 0) { s.phase = 'gameOver'; forceRender(n => n + 1); }
          }
          // Attack hit
          if (s.attackActive && Math.hypot(s.attackX - ex, s.attackY - ey) < 20) {
            enemy.hp--;
            if (enemy.hp <= 0) { enemy.state = 'dead'; s.score += 50; }
            else { enemy.state = 'hurt'; enemy.hurtTimer = 0.3; }
          }
        }

        s.attackCooldown = Math.max(0, s.attackCooldown - dt);
        s.invulnTimer = Math.max(0, s.invulnTimer - dt);
      }

      // Question timer
      if (s.phase === 'question' && s.selectedAnswer !== null) {
        s.answerTimer -= dt;
        if (s.answerTimer <= 0) {
          s.currentQuestion = null;
          s.selectedAnswer = null;
          s.phase = 'exploring';
          forceRender(n => n + 1);
        }
      }

      // =========================
      // RENDER
      // =========================
      const roomW = s.room.width * TILE_SIZE;
      const roomH = s.room.height * TILE_SIZE;

      // Scale to fit canvas
      const scaleX = canvas.width / roomW;
      const scaleY = canvas.height / roomH;
      const scale = Math.min(scaleX, scaleY);
      const offsetX = (canvas.width - roomW * scale) / 2;
      const offsetY = (canvas.height - roomH * scale) / 2;

      ctx.fillStyle = '#0C1018';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // Draw tiles
      for (let row = 0; row < s.room.height; row++) {
        for (let col = 0; col < s.room.width; col++) {
          const tile = s.room.tiles[row][col];
          ctx.fillStyle = getTileColor(tile, s.room.id);
          ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);

          // Grid lines
          if (tile === F || tile === R || tile === D) {
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }

      // Draw interactables
      for (const inter of s.room.interactables) {
        if (inter.used) continue;
        const ix = (inter.x + 0.5) * TILE_SIZE;
        const iy = (inter.y + 0.5) * TILE_SIZE;
        ctx.save();
        ctx.font = `${TILE_SIZE * 0.7}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const emoji = inter.npcType === 'alarmClock' ? '⏰' : inter.npcType === 'coffeeMachine' ? '☕' :
          inter.npcType === 'coatRack' ? '🧥' : inter.npcType === 'mailbox' ? '📬' :
          inter.npcType === 'neighbor' ? '🧑' : inter.type === 'cabinet' ? '📚' : '❓';
        ctx.fillText(emoji, ix, iy);
        ctx.restore();
      }

      // Draw enemies
      for (const enemy of s.room.enemies) {
        if (enemy.state === 'dead') continue;
        const ex = (enemy.x + 0.5) * TILE_SIZE + enemy.vx;
        const ey = (enemy.y + 0.5) * TILE_SIZE + enemy.vy;
        ctx.save();
        ctx.font = `${TILE_SIZE * 0.7}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = enemy.state === 'hurt' ? 0.5 : 1;
        ctx.fillText('😷', ex, ey);
        ctx.restore();
      }

      // Draw player
      if (s.invulnTimer <= 0 || Math.floor(s.invulnTimer * 10) % 2 === 0) {
        ctx.save();
        ctx.font = `${TILE_SIZE * 0.8}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🧑‍⚕️', s.px, s.py);
        ctx.restore();
      }

      // Attack indicator
      if (s.attackActive) {
        ctx.save();
        ctx.font = `${TILE_SIZE * 0.6}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🩺', s.attackX, s.attackY);
        ctx.restore();
      }

      ctx.restore();

      // HUD
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, canvas.width, 36);
      ctx.font = '14px monospace';
      ctx.textBaseline = 'middle';
      // Hearts
      ctx.fillStyle = '#fff';
      let hx = 8;
      const fullHearts = Math.floor(s.hearts / 2);
      const halfHeart = s.hearts % 2;
      const emptyHearts = Math.floor(s.maxHearts / 2) - fullHearts - halfHeart;
      for (let i = 0; i < fullHearts; i++) { ctx.fillText('❤️', hx, 18); hx += 20; }
      if (halfHeart) { ctx.fillText('💔', hx, 18); hx += 20; }
      for (let i = 0; i < emptyHearts; i++) { ctx.fillText('🖤', hx, 18); hx += 20; }
      // Score
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'right';
      ctx.fillText(`⭐ ${s.score}`, canvas.width - 8, 18);
      ctx.textAlign = 'left';

      // Intro overlay
      if (s.phase === 'intro') {
        const alpha = Math.min(1, s.introTimer / 1.5);
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (2.5 - s.introTimer) / 0.8)})`;
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('THE MORNING SHIFT', canvas.width / 2, canvas.height / 2 - 12);
        ctx.font = '12px sans-serif';
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, (2.5 - s.introTimer) / 1)})`;
        ctx.fillText('You wake to the sound of your alarm...', canvas.width / 2, canvas.height / 2 + 12);
        ctx.textAlign = 'left';
      }

      // Game over
      if (s.phase === 'gameOver') {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = '#fff';
        ctx.font = '14px monospace';
        ctx.fillText(`Score: ${s.score}`, canvas.width / 2, canvas.height / 2 + 12);
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('Press Space to restart', canvas.width / 2, canvas.height / 2 + 40);
        ctx.textAlign = 'left';
      }

      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const s = stateRef.current;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center">
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <span className="text-white/70 text-lg">✕</span>
        </button>
      )}

      <canvas
        ref={canvasRef}
        width={480}
        height={384}
        className="rounded-lg"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Dialog overlay */}
      {s.phase === 'dialog' && s.dialogText && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 max-w-md mx-4 px-5 py-3 rounded-xl text-white text-sm"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
          onClick={handleAction}
        >
          {s.dialogSpeaker && <div className="text-cyan-400 text-xs font-bold mb-1 uppercase tracking-wider">{s.dialogSpeaker}</div>}
          <div>{s.dialogText}</div>
          <div className="text-white/30 text-xs mt-1 text-right">Press Space</div>
        </div>
      )}

      {/* Question overlay */}
      {s.phase === 'question' && s.currentQuestion && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="max-w-sm mx-4 p-5 rounded-2xl" style={{ background: 'rgba(15,20,30,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-orange-400 text-[10px] font-bold uppercase tracking-widest mb-2">{s.currentQuestion.category}</div>
            <div className="text-white text-sm mb-4">{s.currentQuestion.question}</div>
            <div className="space-y-2">
              {s.currentQuestion.options.map((opt, i) => {
                const selected = s.selectedAnswer;
                const isCorrect = i === s.currentQuestion!.correctIndex;
                const bg = selected === null ? 'rgba(255,255,255,0.08)'
                  : isCorrect ? 'rgba(34,197,94,0.25)'
                  : i === selected ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.04)';
                return (
                  <button
                    key={i}
                    onClick={() => answerQuestion(i)}
                    disabled={selected !== null}
                    className="w-full text-left px-3 py-2 rounded-lg text-white text-xs transition-colors"
                    style={{ background: bg }}
                  >
                    {opt}
                    {selected !== null && isCorrect && ' ✓'}
                    {selected === i && !isCorrect && ' ✗'}
                  </button>
                );
              })}
            </div>
            {s.selectedAnswer !== null && (
              <div className="text-white/60 text-xs mt-3">{s.currentQuestion.explanation}</div>
            )}
          </div>
        </div>
      )}

      {/* Mobile controls */}
      <div className="mt-3 flex items-center gap-8">
        <div className="grid grid-cols-3 gap-1">
          <div />
          <button onPointerDown={() => { stateRef.current.keys['ArrowUp'] = true; }} onPointerUp={() => { stateRef.current.keys['ArrowUp'] = false; }}
            className="w-10 h-10 rounded bg-white/10 text-white/60 flex items-center justify-center text-lg active:bg-white/20">▲</button>
          <div />
          <button onPointerDown={() => { stateRef.current.keys['ArrowLeft'] = true; }} onPointerUp={() => { stateRef.current.keys['ArrowLeft'] = false; }}
            className="w-10 h-10 rounded bg-white/10 text-white/60 flex items-center justify-center text-lg active:bg-white/20">◀</button>
          <div className="w-10 h-10" />
          <button onPointerDown={() => { stateRef.current.keys['ArrowRight'] = true; }} onPointerUp={() => { stateRef.current.keys['ArrowRight'] = false; }}
            className="w-10 h-10 rounded bg-white/10 text-white/60 flex items-center justify-center text-lg active:bg-white/20">▶</button>
          <div />
          <button onPointerDown={() => { stateRef.current.keys['ArrowDown'] = true; }} onPointerUp={() => { stateRef.current.keys['ArrowDown'] = false; }}
            className="w-10 h-10 rounded bg-white/10 text-white/60 flex items-center justify-center text-lg active:bg-white/20">▼</button>
        </div>
        <button onClick={handleAction}
          className="w-14 h-14 rounded-full bg-white/10 text-white/70 text-sm font-bold active:bg-white/20 transition-colors">
          A
        </button>
      </div>
    </div>
  );
}
