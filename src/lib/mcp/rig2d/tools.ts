import { extra } from '../tools/extraTool'

const id = (description: string) => ({ type: 'string', minLength: 1, description })
const layerId = id('ID of the layer that follows the driver pivot.')
const upperLayerId = id('ID of the upper segment that owns the two-bone IK constraint.')
const autoKey = { type: 'boolean', description: 'Key changed channels at the displayed frame. Defaults to the editor Auto Key setting. Existing keyed channels are updated in either mode.' }
const jointLimit = {
  description: 'Joint bounds in clockwise local degrees. Pass null to reset this joint.',
  anyOf: [{ type: 'null' }, {
    type: 'object', additionalProperties: false, required: ['enabled', 'minDeg', 'maxDeg'],
    properties: {
      enabled: { type: 'boolean', description: 'Enforce this range when solving.' },
      minDeg: { type: 'number', description: 'Inclusive lower bound in degrees.' },
      maxDeg: { type: 'number', description: 'Inclusive upper bound, at least minDeg.' },
      lockedDeg: { type: 'number', description: 'Optional fixed angle inside the bounds.' },
    },
  }],
}

export const RIG_WRITES = [
  extra('set_ik2d_weight', 'Blend a two-bone chain between its authored FK pose and solved IK pose at the displayed frame. One Undo.', {
    upperLayerId, weight: { type: 'number', minimum: 0, maximum: 1, description: '0 is full FK, 1 is full IK.' }, autoKey,
  }, ['upperLayerId', 'weight']),
  extra('match_ik2d_pose', 'Switch to full FK or IK while preserving the displayed shoulder, elbow and tip. Refuses incompatible limits or driven channels atomically.', {
    upperLayerId, to: { type: 'string', enum: ['fk', 'ik'], description: 'Desired pose controller after matching.' }, autoKey,
  }, ['upperLayerId', 'to']),
  extra('link_layer_pivots_2d', 'Bind a follower to a sibling driver at the displayed pose. Both keep their current placement. One Undo.', {
    layerId, driverLayerId: id('ID of a different eligible layer under the same parent.'),
  }, ['layerId', 'driverLayerId']),
  extra('unlink_layer_pivots_2d', 'Remove a pivot link and any IK dependent on that link in one Undo. Pause at the desired frame before keepPose.', {
    layerId, mode: { type: 'string', enum: ['restoreSource', 'keepPose'], description: 'restoreSource reveals the underlying animation. keepPose preserves the displayed position and angle, keying already animated channels on the active timeline.' },
  }, ['layerId', 'mode']),
  extra('bind_two_bone_ik_2d', 'Bind a two-segment IK chain from the displayed pivots. First link the lower segment to the upper and place the separate target at its tip.', {
    upperLayerId, lowerLayerId: id('ID of the lower segment already following the upper.'),
    targetLayerId: id('ID of the sibling layer whose pivot drives the chain tip.'),
  }, ['upperLayerId', 'lowerLayerId', 'targetLayerId']),
  extra('remove_two_bone_ik_2d', 'Remove the IK constraint from the upper segment. The lower segment keeps its pivot link.', { upperLayerId }, ['upperLayerId']),
  extra('set_ik2d_joint_limits', 'Set, lock, disable or reset one joint of an existing chain. Shoulder is relative to the upper reference and elbow to the upper segment.', {
    upperLayerId, joint: { type: 'string', enum: ['shoulder', 'elbow'], description: 'Joint to update.' }, limit: jointLimit,
  }, ['upperLayerId', 'joint', 'limit']),
  extra('set_ik2d_bend', 'Change the bend side or preferred shoulder direction of an existing chain at the displayed frame.', {
    upperLayerId, action: { type: 'string', enum: ['flip', 'preferPose', 'clearPreference'], description: 'Flip bend side, capture the current solved shoulder direction, or clear that preference.' },
  }, ['upperLayerId', 'action']),
]
export const RIG_DIAGNOSTICS = extra('get_ik2d_diagnostics', 'Inspect solved chain IDs, tip, target, reach error and active limits. local is shared-parent pixels, composition is composition pixels, angles are clockwise degrees. Inactive chains report their reason.', {
  upperLayerId, timeMs: { type: 'number', minimum: 0, description: 'Optional composition time in milliseconds. Omit both sampling fields for the displayed live frame.' },
  timelineId: id('Optional timeline to isolate for deterministic sampling. At timeMs this timeline uses its local authoring clock. Required for explicit sampling of state-machine scenes.'),
}, [], true)

export const RIG_WRITE_NAMES = new Set(RIG_WRITES.map(tool => tool.name))
