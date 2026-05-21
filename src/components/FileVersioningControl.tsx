"use client";

import React from "react";
import type { FileVersioningState } from "@/app/hooks/useFileVersioning";

interface FileVersioningControlProps {
  state: FileVersioningState;
  directoryName: string | null;
  lastSavedAt: Date | null;
  snapshotCount: number;
  isSupported: boolean;
  onPickDirectory: () => void;
  onSaveSnapshot: () => void;
}

function formatTime(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * File Versioning Control (TopToolbar)
 *
 * Browser-based scene persistence UI:
 * - "Choose Folder" button → File System Access API directory picker
 * - Status indicator: Saving... / Saved / Error
 * - "Save Version" button → timestamped snapshot
 * - Shows folder name + snapshot count
 */
export function FileVersioningControl({
  state,
  directoryName,
  lastSavedAt,
  snapshotCount,
  isSupported,
  onPickDirectory,
  onSaveSnapshot,
}: FileVersioningControlProps) {
  // Unsupported browser → show disabled hint
  if (!isSupported || state === "unsupported") {
    return (
      <div
        className="flex items-center gap-1 px-2 py-1.5 text-xs rounded bg-gray-800 text-gray-500"
        title="File System Access API not supported — use Chrome or Edge for auto file versioning"
      >
        <span>⚠ File versioning unavailable</span>
      </div>
    );
  }

  // No directory selected → show "Choose Folder" button
  if (state === "no-directory") {
    return (
      <button
        onClick={onPickDirectory}
        title="Choose a folder where scene files will be auto-saved with timestamped versions"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 text-white font-medium transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
        </svg>
        <span>Choose Save Folder</span>
      </button>
    );
  }

  // Directory selected → show status + controls
  return (
    <div className="flex items-center gap-2">
      {/* Status indicator */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded bg-gray-800">
        {state === "saving" && (
          <>
            <div className="animate-spin">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <span className="text-gray-400">Saving...</span>
          </>
        )}

        {(state === "saved" || state === "idle") && (
          <>
            <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
            <span className="text-gray-400" title={`Folder: ${directoryName}`}>
              {directoryName}
              {lastSavedAt && state === "idle" && (
                <span className="text-gray-600"> · {formatTime(lastSavedAt)}</span>
              )}
            </span>
          </>
        )}

        {state === "error" && (
          <>
            <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <span className="text-red-400">Save failed</span>
          </>
        )}
      </div>

      {/* Save Version (manual snapshot) button */}
      <button
        onClick={onSaveSnapshot}
        title={`Save a timestamped version snapshot${snapshotCount > 0 ? ` (${snapshotCount} saved)` : ""}`}
        className="flex items-center gap-1 px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
        </svg>
        <span>Save Version{snapshotCount > 0 ? ` (${snapshotCount})` : ""}</span>
      </button>
    </div>
  );
}
