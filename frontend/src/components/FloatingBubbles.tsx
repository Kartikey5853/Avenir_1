import { useEffect, useRef } from 'react';

/**
 * FloatingBubbles – subtle animated orbs behind page backgrounds.
 * Very low opacity by default; on hover the group brightens slightly
 * with a faint gold glow, matching the Avenir warm palette.
 *
 * Usage: drop <FloatingBubbles /> inside any `relative overflow-hidden` container.
 */

interface Bubble {
  id: number;
  size: number;
  left: number;
  top: number;
  duration: number;
  delay: number;
  opacity: number;
}

// Pre-seeded so the pattern is always the same (no flicker on re-render)
const BUBBLES: Bubble[] = [
  { id: 0,  size: 180, left:  8,  top: 12, duration: 22, delay:  0,  opacity: 0.04 },
  { id: 1,  size: 110, left: 25,  top: 55, duration: 28, delay: -4,  opacity: 0.03 },
  { id: 2,  size: 200, left: 70,  top:  8, duration: 18, delay: -8,  opacity: 0.03 },
  { id: 3,  size:  90, left: 88,  top: 72, duration: 32, delay: -2,  opacity: 0.05 },
  { id: 4,  size: 140, left: 45,  top: 80, duration: 25, delay: -12, opacity: 0.03 },
  { id: 5,  size:  75, left: 60,  top: 35, duration: 20, delay: -6,  opacity: 0.04 },
  { id: 6,  size: 160, left: 15,  top: 80, duration: 30, delay: -15, opacity: 0.025 },
  { id: 7,  size:  95, left: 78,  top: 45, duration: 24, delay: -3,  opacity: 0.035 },
  { id: 8,  size: 130, left: 92,  top: 20, duration: 35, delay: -18, opacity: 0.025 },
  { id: 9,  size:  85, left: 38,  top: 22, duration: 22, delay: -9,  opacity: 0.04 },
  { id: 10, size: 115, left:  5,  top: 45, duration: 27, delay: -7,  opacity: 0.03 },
  { id: 11, size: 170, left: 55,  top: 60, duration: 29, delay: -20, opacity: 0.025 },
];

const STYLE_ID = 'avenir-bubble-keyframes';

function injectKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes bubble-float {
      0%   { transform: translate(0, 0) scale(1); }
      33%  { transform: translate(18px, -22px) scale(1.04); }
      66%  { transform: translate(-14px, 16px) scale(0.97); }
      100% { transform: translate(0, 0) scale(1); }
    }
    .avenir-bubbles-wrap:hover .avenir-bubble {
      opacity: calc(var(--b-opacity) * 2.5) !important;
      filter: blur(38px) !important;
    }
  `;
  document.head.appendChild(style);
}

export default function FloatingBubbles({ className = '' }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    injectKeyframes();
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`avenir-bubbles-wrap pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {BUBBLES.map((b) => (
        <div
          key={b.id}
          className="avenir-bubble absolute rounded-full"
          style={{
            width:  b.size,
            height: b.size,
            left:   `${b.left}%`,
            top:    `${b.top}%`,
            background:
              'radial-gradient(circle, oklch(0.637 0.128 66.29) 0%, transparent 70%)',
            opacity: b.opacity,
            filter:  'blur(42px)',
            animation: `bubble-float ${b.duration}s ease-in-out ${b.delay}s infinite`,
            transition: 'opacity 0.8s ease, filter 0.8s ease',
            // CSS custom prop for the hover rule
            ['--b-opacity' as string]: b.opacity,
          }}
        />
      ))}
    </div>
  );
}
