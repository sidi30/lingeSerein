"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  speed?: number;
  className?: string;
  fade?: boolean;
};

export function Marquee({ children, speed = 40, className = "", fade = true }: Props) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={
        fade
          ? {
              maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
            }
          : undefined
      }
    >
      <div className="flex w-max animate-marquee" style={{ animationDuration: `${speed}s` }}>
        <div className="flex shrink-0 items-center gap-12 pr-12">{children}</div>
        <div aria-hidden className="flex shrink-0 items-center gap-12 pr-12">
          {children}
        </div>
      </div>
    </div>
  );
}
