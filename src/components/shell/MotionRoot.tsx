"use client";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Global motion policy: honour prefers-reduced-motion everywhere. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>{children}</MotionConfig>;
}
