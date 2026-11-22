/** Ephemeral 3D detail workspaces. Switching context changes only the visible
 * editing tools; the model, camera, clip draft and undo history stay shared.
 * This UI choice is deliberately absent from portable scene data. */
export const modelWorkspaces = [
  { id: 'modeling', label: 'Modeling' },
  { id: 'animation', label: 'Animation' },
  { id: 'material', label: 'Texture / Material' },
  { id: 'render', label: 'Render' },
] as const

export type ModelWorkspace = (typeof modelWorkspaces)[number]['id']
