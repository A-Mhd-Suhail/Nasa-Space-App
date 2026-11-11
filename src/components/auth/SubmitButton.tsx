"use client";
import { type ComponentProps, useSyncExternalStore } from "react";
import { Button } from "../ui";

const noop = () => () => {};
/** False during server render and hydration, true once React event handlers are attached. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/**
 * Submit button that stays disabled until the page is interactive. Without this, a click made while
 * a dev-mode page is still loading performs a native form submit: nothing happens for the user and the
 * field values (including the password) end up in the URL.
 */
export function SubmitButton({ disabled, children, ...p }: ComponentProps<typeof Button>) {
  const ready = useHydrated();
  return (
    <Button type="submit" variant="primary" className="w-full" {...p} disabled={!ready || disabled} aria-busy={!ready || undefined} data-ready={ready ? "1" : "0"}>
      {ready ? children : "Loading…"}
    </Button>
  );
}
