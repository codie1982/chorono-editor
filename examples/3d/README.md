# Boxed 3D demo

`chorono-robot.glb` is an original static sample for Chorono's first 3D slice.
No external textures, companion files, cameras, rig or animation clips are needed.
Named head, body, arms and legs demonstrate imported parent/child hierarchy,
shared geometry, normals, PBR colors and binary buffer loading. Source axis is
Y-up; the face points toward +Z. The model is approximately 3.7 units tall;
Chorono adds its ordinary normalized presentation wrapper at import time.

1. Layers → Add → **3D Objects** → **Import GLB / glTF**.
2. Select this file. The imported box has independent 2D Width / Height.
3. With **3D camera** off in the viewport control strip, use the box's eight handles in Select mode, or
   edit Properties → **2D Model Box · px**. This changes framing/aspect, not mesh
   topology or the saved internal model pose. Undo restores the previous box.
4. Turn **3D camera** on for Orbit / Pan / Dolly. This edits the saved output
   camera; authored camera keys/bindings are protected from direct mouse edits.

Regenerate from the repository root with
`node scripts/model3d/create-demo-robot.mjs`. It uses the installed Three.js
primitive builders and GLTFExporter, with no network or third-party asset.
The sample and generator follow this repository's MIT license.
