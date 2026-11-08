export type AudioClipSelectionInteraction = 'header' | 'clip' | 'gainKey'

/** Clip selection replaces stale gain-key selection; native key interactions
 * retain it so a multi-key drag keeps its complete selection group. */
export function activateAudioClipSelection(
  interaction: AudioClipSelectionInteraction,
  shiftHeld: boolean,
  onSelectLayer: (shiftHeld: boolean) => void,
  clearKeySelection?: () => void,
): void {
  if (interaction !== 'gainKey' && !shiftHeld) clearKeySelection?.()
  onSelectLayer(shiftHeld)
}
