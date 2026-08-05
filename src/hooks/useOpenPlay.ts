"use client";
import { OpenPlayState } from "@/lib/openPlay/types";
import { useSyncedState } from "./useSyncedState";

export function useOpenPlay() {
  return useSyncedState<OpenPlayState>("/api/open-play/state");
}
