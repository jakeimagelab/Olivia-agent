"use client";

// Legacy import compatibility. The old component owned a separate messages array
// and called the Claude JSON route directly; all Olivia chat surfaces now share
// the single v2 conversation store and GPT streaming endpoint.
export { default } from "@/components/OliviaChat";
