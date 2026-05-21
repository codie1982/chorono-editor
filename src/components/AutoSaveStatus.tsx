"use client";

import { type AutoSaveState } from "@/app/hooks/useAutoSave";
import React from "react";

interface AutoSaveStatusProps {
  state: AutoSaveState;
  onRetry?: () => void;
}

/**
 * Auto-Save Status Indicator
 *
 * Shows real-time feedback to user about save state:
 * - idle: nothing (don't show)
 * - saving: "Saving..." with spinner
 * - saved: "Saved" with checkmark (auto-hides after 2s)
 * - error: "Save failed" with retry button
 * - offline: "Offline" indicator
 *
 * Place in TopToolbar, right-aligned
 */
export function AutoSaveStatus({ state, onRetry }: AutoSaveStatusProps) {
  if (state === "idle") {
    return null; // Don't show
  }

  const baseClass =
    "flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-all";

  if (state === "saving") {
    return (
      <div className={`${baseClass} text-gray-600`}>
        <div className="animate-spin">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <span>Saving...</span>
      </div>
    );
  }

  if (state === "saved") {
    return (
      <div className={`${baseClass} text-green-600`}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
        <span className="text-gray-500">Saved</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className={`${baseClass} text-red-600 gap-1`}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
        <span>Save failed</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-2 px-2 py-1 text-xs bg-red-100 hover:bg-red-200 rounded font-semibold"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (state === "offline") {
    return (
      <div className={`${baseClass} text-yellow-600`}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
        </svg>
        <span>Offline</span>
      </div>
    );
  }

  return null;
}
