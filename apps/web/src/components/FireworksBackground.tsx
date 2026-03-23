import { useEffect, useRef } from 'react';
import { COLOR_HEX } from '../lib/colors.js';
import type { Color } from '@hanabi/engine';

const COLORS_ARRAY = Object.values(COLOR_HEX);

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  trail: { x: number; y: number; alpha: number }[];
}

interface Rocket {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  color: string;
  trail: { x: number; y: number; alpha: number }[];
  exploded: boolean;
}

interface FireworksBackgroundProps {
  /** 'lobby' = frequent large bursts, 'game' = subtle ambient, 'celebration' = intense finale */
  intensity?: 'lobby' | 'game' | 'celebration';
  /** Specific color for single-color burst (e.g., after a successful play) */
  burstColor?: Color | null;
  /** Trigger a single burst */
  triggerBurst?: number;
}

export function FireworksBackground({ intensity = 'lobby', burstColor, triggerBurst }: FireworksBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rocketsRef = useRef<Rocket[]>([]);
  const frameRef = useRef<number>(0);
  const lastBurstRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    const spawnRocket = (color?: string) => {
      const c = color || COLORS_ARRAY[Math.floor(Math.random() * COLORS_ARRAY.length)];
      rocketsRef.current.push({
        x: W() * (0.15 + Math.random() * 0.7),
        y: H(),
        vy: -(3 + Math.random() * 2),
        targetY: H() * (0.15 + Math.random() * 0.35),
        color: c,
        trail: [],
        exploded: false,
      });
    };

    const explode = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
        const speed = 1.5 + Math.random() * 2.5;
        particlesRef.current.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          maxLife: 60 + Math.random() * 40,
          color,
          size: 1.5 + Math.random() * 1.5,
          trail: [],
        });
      }
      // Inner sparkle burst
      for (let i = 0; i < count / 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 1;
        particlesRef.current.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          maxLife: 30 + Math.random() * 20,
          color: '#fff',
          size: 1 + Math.random(),
          trail: [],
        });
      }
    };

    // Spawn interval based on intensity
    const intervals = { lobby: 2500, game: 6000, celebration: 400 };
    const particleCounts = { lobby: 50, game: 25, celebration: 80 };

    let lastSpawn = 0;
    let running = true;

    const animate = (time: number) => {
      if (!running) return;
      const w = W();
      const h = H();

      ctx.clearRect(0, 0, w, h);

      // Auto-spawn rockets
      if (time - lastSpawn > intervals[intensity]) {
        spawnRocket();
        if (intensity === 'celebration') {
          spawnRocket();
          spawnRocket();
        }
        lastSpawn = time;
      }

      // Update rockets
      for (let i = rocketsRef.current.length - 1; i >= 0; i--) {
        const r = rocketsRef.current[i];
        r.trail.push({ x: r.x, y: r.y, alpha: 0.6 });
        if (r.trail.length > 8) r.trail.shift();

        r.y += r.vy;
        r.x += (Math.random() - 0.5) * 0.3;

        // Draw rocket trail
        for (const t of r.trail) {
          ctx.beginPath();
          ctx.arc(t.x, t.y, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${t.alpha})`;
          ctx.fill();
          t.alpha *= 0.85;
        }

        // Draw rocket head
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = r.color;
        ctx.fill();

        // Explode when reaching target
        if (r.y <= r.targetY && !r.exploded) {
          r.exploded = true;
          explode(r.x, r.y, r.color, particleCounts[intensity]);
          rocketsRef.current.splice(i, 1);
        }
      }

      // Update particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.trail.push({ x: p.x, y: p.y, alpha: p.life * 0.4 });
        if (p.trail.length > 5) p.trail.shift();

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03; // gravity
        p.vx *= 0.98; // drag
        p.life -= 1 / p.maxLife;

        if (p.life <= 0) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        // Draw trail
        for (const t of p.trail) {
          ctx.beginPath();
          ctx.arc(t.x, t.y, p.size * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${t.alpha * 0.3})`;
          ctx.fill();
          t.alpha *= 0.8;
        }

        // Draw particle with glow
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life * 0.15;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [intensity]);

  // Handle triggered bursts (e.g., successful play)
  useEffect(() => {
    if (!triggerBurst || triggerBurst === lastBurstRef.current) return;
    lastBurstRef.current = triggerBurst;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const color = burstColor ? COLOR_HEX[burstColor] : COLORS_ARRAY[Math.floor(Math.random() * COLORS_ARRAY.length)];
    rocketsRef.current.push({
      x: w * (0.3 + Math.random() * 0.4),
      y: h,
      vy: -(3 + Math.random() * 2),
      targetY: h * (0.2 + Math.random() * 0.3),
      color,
      trail: [],
      exploded: false,
    });
  }, [triggerBurst, burstColor]);

  return (
    <canvas
      ref={canvasRef}
      className="fireworks-canvas"
    />
  );
}
