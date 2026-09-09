'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Fades + slides content in when it enters the viewport. IntersectionObserver-
 * based (no animation library) — fires once, then disconnects. Above-the-fold
 * content (already intersecting on load) reveals immediately, so this doubles
 * as a load-in animation for the hero, not just a scroll effect further down.
 */
export function RevealOnScroll({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'} ${className}`}
    >
      {children}
    </div>
  );
}
