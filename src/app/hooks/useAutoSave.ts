"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ChronoScene } from "@/lib/types/core";

export type AutoSaveState = "idle" | "saving" | "saved" | "error" | "offline";

interface UseAutoSaveOptions {
  projectId: string;
  sceneId: string;
  interval_ms?: number; // Debounce interval (default 500ms)
  fallback_ms?: number; // Fallback save interval (default 10s)
  onStatusChange?: (state: AutoSaveState) => void;
  onError?: (error: Error) => void;
}

/**
 * useAutoSave Hook
 *
 * Manages auto-saving of scene data to MongoDB with:
 * - 500ms debounce on scene changes
 * - 10s max fallback save timer
 * - Conflict detection (CAS) via server_version
 * - Retry logic on failure
 * - Status feedback for UI
 *
 * Usage:
 * ```
 * const { state, saveNow } = useAutoSave(scene, {
 *   projectId,
 *   sceneId,
 * })
 *
 * // Show status in UI
 * {state === "saving" && <span>Saving...</span>}
 * {state === "saved" && <span>Saved</span>}
 * ```
 */
export function useAutoSave(scene: ChronoScene | null, options: UseAutoSaveOptions) {
  const [state, setState] = useState<AutoSaveState>("idle");
  const [lastSavedVersion, setLastSavedVersion] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  const debounceRef = useRef<NodeJS.Timeout>();
  const fallbackRef = useRef<NodeJS.Timeout>();
  const lastSavedRef = useRef<ChronoScene | null>(null);

  const {
    projectId,
    sceneId,
    interval_ms = 500,
    fallback_ms = 10000,
    onStatusChange,
    onError,
  } = options;

  /**
   * Save scene to server
   */
  const saveToServer = useCallback(
    async (sceneToSave: ChronoScene) => {
      if (!navigator.onLine) {
        setState("offline");
        onStatusChange?.("offline");
        return;
      }

      setState("saving");
      onStatusChange?.("saving");

      try {
        const response = await fetch(
          `/api/projects/${projectId}/scenes/${sceneId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              // TODO: Add Keycloak JWT token from auth context
              // "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              scene_data: sceneToSave,
              server_version: lastSavedVersion,
            }),
          }
        );

        if (response.status === 409) {
          // Conflict: server has newer version
          console.warn("⚠ Scene conflict: server has newer version");
          setState("error");
          onStatusChange?.("error");
          const error = new Error("Scene changed on server. Please refresh to sync.");
          onError?.(error);
          // TODO: Show merge UI or reload scene from server
          return;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Success: update tracked version
        setLastSavedVersion(data.server_version);
        lastSavedRef.current = sceneToSave;
        setRetryCount(0);

        setState("saved");
        onStatusChange?.("saved");

        // Auto-hide "Saved" indicator after 2s
        setTimeout(() => {
          setState("idle");
          onStatusChange?.("idle");
        }, 2000);
      } catch (err) {
        console.error("✗ Auto-save error:", err);
        setState("error");
        onStatusChange?.("error");

        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);

        // Retry logic: exponential backoff (2s, 4s, 8s)
        const retryDelay = Math.min(2000 * Math.pow(2, retryCount), 16000);
        setRetryCount((prev) => prev + 1);

        setTimeout(() => {
          if (navigator.onLine) {
            saveToServer(sceneToSave);
          }
        }, retryDelay);
      }
    },
    [projectId, sceneId, lastSavedVersion, onStatusChange, onError, retryCount]
  );

  /**
   * Main effect: debounce + fallback logic
   */
  useEffect(() => {
    if (!scene) return;

    // Clear previous timers
    clearTimeout(debounceRef.current);
    clearTimeout(fallbackRef.current);

    // Skip save if scene hasn't actually changed
    if (lastSavedRef.current === scene) {
      return;
    }

    // Debounce timer: wait before saving
    debounceRef.current = setTimeout(() => {
      saveToServer(scene);
    }, interval_ms);

    // Fallback timer: force save after max interval even if no new changes
    fallbackRef.current = setTimeout(() => {
      if (state === "saving" || state === "idle" || state === "saved") {
        saveToServer(scene);
      }
    }, fallback_ms);

    return () => {
      clearTimeout(debounceRef.current);
      clearTimeout(fallbackRef.current);
    };
  }, [scene, saveToServer, interval_ms, fallback_ms, state]);

  /**
   * Manual save trigger (user presses Ctrl+S or clicks "Save" button)
   */
  const saveNow = useCallback(() => {
    if (scene) {
      clearTimeout(debounceRef.current);
      clearTimeout(fallbackRef.current);
      saveToServer(scene);
    }
  }, [scene, saveToServer]);

  return {
    state,
    lastSavedVersion,
    retryCount,
    saveNow,
  };
}
