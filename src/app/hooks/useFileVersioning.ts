"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ChronoScene } from "@/lib/types/core";

export type FileVersioningState =
  | "no-directory" // No directory selected yet
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "unsupported"; // File System Access API not available

interface UseFileVersioningOptions {
  /** Debounce interval for the "current" file write (ms). Default 500. */
  interval_ms?: number;
  /** Fallback save interval (ms) — force write even without new changes. Default 10000. */
  fallback_ms?: number;
  /** Auto-snapshot interval (ms). A timestamped version file. Default 600000 (10 min). */
  snapshot_ms?: number;
  /** Base name used for files. Default derived from scene.composition.id. */
  baseName?: string;
}

/**
 * Format a Date as a filesystem-safe timestamp: 2026-05-21_14-30-45
 */
function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

/**
 * Check whether the File System Access API is available (Chrome / Edge).
 */
function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * useFileVersioning Hook
 *
 * Browser-based scene persistence using the File System Access API.
 * NO server, NO MongoDB, NO Git — pure file output to a user-chosen folder.
 *
 * Two kinds of writes:
 * 1. "current" file ({baseName}.json) — overwritten on every change (500ms debounce + 10s fallback)
 * 2. timestamped snapshots ({baseName}_2026-05-21_14-30-45.json) — every 10 min + manual save
 *
 * Usage:
 * ```
 * const fv = useFileVersioning(scene, { baseName: scene.composition.id })
 *
 * <button onClick={fv.pickDirectory}>Choose Folder</button>
 * <button onClick={fv.saveSnapshotNow}>Save Version</button>
 * {fv.state === "saving" && <span>Saving...</span>}
 * ```
 */
export function useFileVersioning(
  scene: ChronoScene | null,
  options: UseFileVersioningOptions = {}
) {
  const {
    interval_ms = 500,
    fallback_ms = 10000,
    snapshot_ms = 600000, // 10 minutes
    baseName = "scene",
  } = options;

  // SSR-safe: start with a neutral state. `mounted` stays false on the server
  // and during the first client render so server/client HTML match (avoids
  // React hydration errors). Capability detection happens after mount.
  const [mounted, setMounted] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [state, setState] = useState<FileVersioningState>("no-directory");
  const [directoryName, setDirectoryName] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastSnapshotAt, setLastSnapshotAt] = useState<Date | null>(null);
  const [snapshotCount, setSnapshotCount] = useState(0);

  // FileSystemDirectoryHandle — kept in ref (not serializable)
  const dirHandleRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const fallbackRef = useRef<ReturnType<typeof setTimeout>>();
  const snapshotTimerRef = useRef<ReturnType<typeof setInterval>>();
  const lastWrittenRef = useRef<ChronoScene | null>(null);
  const sceneRef = useRef<ChronoScene | null>(scene);

  // Detect File System Access API support after mount (client only).
  useEffect(() => {
    setMounted(true);
    const supported = isFileSystemAccessSupported();
    setIsSupported(supported);
    if (!supported) {
      setState("unsupported");
    }
  }, []);

  // Keep latest scene in a ref for timers
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  /**
   * Write a JSON file into the chosen directory.
   */
  const writeFile = useCallback(
    async (filename: string, data: ChronoScene): Promise<void> => {
      const dirHandle = dirHandleRef.current;
      if (!dirHandle) throw new Error("No directory selected");

      const fileHandle = await dirHandle.getFileHandle(filename, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
    },
    []
  );

  /**
   * Save the "current" file (overwrite). Called by debounce + fallback.
   */
  const saveCurrent = useCallback(
    async (sceneToSave: ChronoScene) => {
      if (!dirHandleRef.current) {
        setState("no-directory");
        return;
      }

      setState("saving");
      try {
        await writeFile(`${baseName}.json`, sceneToSave);
        lastWrittenRef.current = sceneToSave;
        setLastSavedAt(new Date());
        setState("saved");
        // Auto-hide "saved" indicator
        setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 2000);
      } catch (err) {
        console.error("File save error:", err);
        setState("error");
      }
    },
    [baseName, writeFile]
  );

  /**
   * Save a timestamped snapshot (new file). Called by interval + manual.
   */
  const saveSnapshotNow = useCallback(async () => {
    const currentScene = sceneRef.current;
    if (!currentScene) return;
    if (!dirHandleRef.current) {
      setState("no-directory");
      return;
    }

    setState("saving");
    try {
      const ts = formatTimestamp(new Date());
      await writeFile(`${baseName}_${ts}.json`, currentScene);
      setLastSnapshotAt(new Date());
      setSnapshotCount((c) => c + 1);
      setState("saved");
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch (err) {
      console.error("Snapshot save error:", err);
      setState("error");
    }
  }, [baseName, writeFile]);

  /**
   * Prompt user to choose a directory (File System Access API).
   */
  const pickDirectory = useCallback(async () => {
    if (!isFileSystemAccessSupported()) {
      setState("unsupported");
      return;
    }

    try {
      // @ts-expect-error - showDirectoryPicker not in older TS DOM types
      const handle = await window.showDirectoryPicker({
        mode: "readwrite",
        id: "chorono-scenes",
      });
      dirHandleRef.current = handle;
      setDirectoryName(handle.name);
      setState("idle");

      // Write initial snapshot + current immediately
      if (sceneRef.current) {
        await saveCurrent(sceneRef.current);
        await saveSnapshotNow();
      }
    } catch (err) {
      // User cancelled the picker → not an error
      if ((err as Error).name === "AbortError") {
        return;
      }
      console.error("Directory pick error:", err);
      setState("error");
    }
  }, [saveCurrent, saveSnapshotNow]);

  /**
   * Debounce + fallback: write "current" file on scene changes.
   */
  useEffect(() => {
    if (!scene || !dirHandleRef.current) return;
    if (lastWrittenRef.current === scene) return;

    clearTimeout(debounceRef.current);
    clearTimeout(fallbackRef.current);

    debounceRef.current = setTimeout(() => {
      saveCurrent(scene);
    }, interval_ms);

    fallbackRef.current = setTimeout(() => {
      saveCurrent(scene);
    }, fallback_ms);

    return () => {
      clearTimeout(debounceRef.current);
      clearTimeout(fallbackRef.current);
    };
  }, [scene, saveCurrent, interval_ms, fallback_ms]);

  /**
   * Auto-snapshot interval (10 min).
   */
  useEffect(() => {
    if (state === "no-directory" || state === "unsupported") return;

    snapshotTimerRef.current = setInterval(() => {
      if (dirHandleRef.current && sceneRef.current) {
        saveSnapshotNow();
      }
    }, snapshot_ms);

    return () => {
      clearInterval(snapshotTimerRef.current);
    };
  }, [state, snapshot_ms, saveSnapshotNow]);

  return {
    mounted,
    state,
    directoryName,
    lastSavedAt,
    lastSnapshotAt,
    snapshotCount,
    isSupported,
    pickDirectory,
    saveSnapshotNow,
  };
}
