// User-action bus — Fase 4B.
//
// When the user manually edits the canvas (delete a piece, drag a wall,
// rotate furniture, change material from the context menu, etc.) the chat
// needs to learn about it. We don't tightly couple the canvas hooks to the
// chat history setter; instead, every mutation emits a `ca:user-action`
// window event with a ChatBlock payload. The ChatPanel listens and appends
// the action as a synthetic assistant entry in the conversation.
//
// Reasons for this indirection:
//   - The drag engine, the floating ContextMenu, and toolbar handlers all
//     need to log actions, but they live in different component trees.
//   - Loose coupling means the chat can be silenced (e.g., during a
//     scripted demo) without ripping wiring out of the canvas.

import type { ChatBlock } from "@/lib/mock-data";

export type UserActionPayload = Extract<ChatBlock, { type: "user-action" }>;

export const USER_ACTION_EVENT = "ca:user-action";

export function logUserAction(action: Omit<UserActionPayload, "type">): void {
  if (typeof window === "undefined") return;
  const payload: UserActionPayload = { type: "user-action", ...action };
  window.dispatchEvent(new CustomEvent<UserActionPayload>(USER_ACTION_EVENT, { detail: payload }));
}

/** Convenience helpers — common shapes. */
export function logRemove(label: string, detail?: string): void {
  logUserAction({ kind: "remove", label: `Removeu ${label}`, detail });
}
export function logRename(from: string, to: string): void {
  logUserAction({ kind: "rename", label: `Renomeou "${from}" → "${to}"` });
}
export function logRotate(label: string): void {
  logUserAction({ kind: "rotate", label: `Girou ${label}` });
}
export function logMaterial(label: string, material: string): void {
  logUserAction({ kind: "material", label: `Trocou piso de ${label} para ${material}` });
}
export function logEditWall(detail: string): void {
  logUserAction({ kind: "edit-wall", label: "Editou parede", detail });
}
export function logEditOpening(label: string, detail: string): void {
  logUserAction({ kind: "edit-opening", label: `Editou ${label}`, detail });
}
export function logMove(label: string, detail: string): void {
  logUserAction({ kind: "move", label: `Moveu ${label}`, detail });
}
