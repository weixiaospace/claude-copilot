import { signal } from "@preact/signals";
import type { Scope } from "../types/Scope";

/** All scopes shown in the sidebar (User + projects). */
export const scopes = signal<Scope[]>([]);

/** The currently selected scope's id, or null before the first load. */
export const selectedScopeId = signal<string | null>(null);
