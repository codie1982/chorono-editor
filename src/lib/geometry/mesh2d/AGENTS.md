# Mesh2D technical reference

Before changing Mesh2D topology, component selection, attributes, modeling or
simulation, read `docs/tr/mesh2d-topology-reference.md` from the repository root
and the relevant sections of `docs/tr/references/mesh2d-topology-v1.pdf`.
The user supplied this document as a recurring mathematical/design reference.
Use `docs/tr/plans/mesh2d-edit-modes-plan.md` to distinguish implemented tools
from requested future work. Record the relevant invariants and validation in
the change description.

The PDF is a design reference, not a description of already shipped code.
Preserve the existing x-right/y-down, local-pixel, composition-ms and positive
signed-area contracts through explicit adapters. Keep the current constrained
Delaunay and Grid strategies; its midpoint/Loop examples do not supersede the
user's algorithm choice. Extend the existing general modifier registry/stack.

Reuse canonical connectivity, validation, planar predicates and interpolation.
Topology-changing operators require stable IDs, explicit attribute/remap policy,
atomic commit/rollback, Undo/Redo, boundary/hole and portable/render acceptance.
Do not claim half-edge/n-gon, per-corner UV, scoped modifiers or physics support
merely because they appear in the reference or roadmap.
