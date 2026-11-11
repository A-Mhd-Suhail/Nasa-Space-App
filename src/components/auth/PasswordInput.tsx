"use client";
import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { inputCls } from "../ui";

export function PasswordInput(p: ComponentProps<"input">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...p} type={show ? "text" : "password"} className={`${inputCls} pr-10`} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-text">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
