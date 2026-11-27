import { BufferGeometry, DoubleSide, Float32BufferAttribute, Line, LineBasicMaterial, Mesh, PlaneGeometry, ShaderMaterial, Vector2, type Group } from 'three'
import type { ModelViewCamera } from '../inspection/types'
import { DEFAULT_MODEL_MEASUREMENT, type ModelMeasurementSettings } from '../measurement/modelMeasurement'
import { visibleGridSpan, visibleGridStep } from '../measurement/gridSpacing'

/** Camera-relative XZ editor grid. A single reused plane shades world-space
 * lines analytically, so pan/zoom never allocates tiles or reveals a hard edge.
 * The material fades before its finite GPU plane/frustum boundary; it is owned
 * by one composition and is never attached to source or export data. */
export class ModelInspectionGrid {
  private readonly material = new ShaderMaterial({
    uniforms: { majorStep: { value: 1 }, minorDivisions: { value: 5 }, planeHalf: { value: 10000 }, fadeRadius: { value: 6000 },
      worldCenter: { value: new Vector2() }, gridOffset: { value: new Vector2() } },
    vertexShader: `varying vec2 relativeXZ;
      uniform float planeHalf;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        relativeXZ = vec2(position.x, -position.y) * planeHalf;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `varying vec2 relativeXZ;
      uniform float majorStep;
      uniform float minorDivisions;
      uniform float fadeRadius;
      uniform vec2 worldCenter;
      uniform vec2 gridOffset;
      float lineAt(vec2 p) {
        vec2 derivative = max(fwidth(p), vec2(0.00001));
        vec2 distanceToLine = abs(fract(p - 0.5) - 0.5) / derivative;
        float aliasFade = 1.0 - smoothstep(0.35, 1.0, max(derivative.x, derivative.y));
        return (1.0 - clamp(min(distanceToLine.x, distanceToLine.y), 0.0, 1.0)) * aliasFade;
      }
      void main() {
        // Keep line phase near zero even when the camera target is far from the
        // origin; world-space floats lose sub-unit detail around large targets.
        vec2 gridPoint = relativeXZ + gridOffset;
        vec2 axisPoint = relativeXZ + worldCenter;
        float minor = lineAt(gridPoint / (majorStep / minorDivisions));
        float major = lineAt(gridPoint / majorStep);
        float xAxis = 1.0 - clamp(abs(axisPoint.y) / max(fwidth(axisPoint.y) * 1.5, 0.00001), 0.0, 1.0);
        float zAxis = 1.0 - clamp(abs(axisPoint.x) / max(fwidth(axisPoint.x) * 1.5, 0.00001), 0.0, 1.0);
        vec3 color = vec3(0.29, 0.36, 0.47);
        color = mix(color, vec3(0.45, 0.53, 0.64), major);
        color = mix(color, vec3(0.97, 0.37, 0.40), xAxis);
        color = mix(color, vec3(0.34, 0.59, 0.98), zAxis);
        float opacity = max(max(minor * 0.12, major * 0.32), max(xAxis, zAxis) * 0.88);
        float fade = 1.0 - smoothstep(fadeRadius * 0.25, fadeRadius, length(relativeXZ));
        gl_FragColor = vec4(color, opacity * fade);
      }`,
    transparent: true, depthWrite: false, depthTest: true, side: DoubleSide,
  })
  private readonly grid = new Mesh(new PlaneGeometry(2, 2), this.material)
  private readonly yGeometry = new BufferGeometry()
  private readonly yMaterial = new LineBasicMaterial({ color: 0x4ade80, depthTest: true, depthWrite: false })
  private readonly yAxis = new Line(this.yGeometry, this.yMaterial)

  constructor(parent: Group | import('three').Scene) {
    this.grid.name = '3D inspection grid'
    this.grid.userData.choronoInspectionGrid = true
    this.grid.rotation.x = -Math.PI / 2
    this.grid.frustumCulled = false
    this.yGeometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3))
    this.yAxis.name = 'Y axis indicator'
    parent.add(this.grid, this.yAxis)
    this.setVisible(false)
  }

  /** Update reused helper uniforms in metres. Visual spacing is a 1–2–5
   * multiple of the saved base interval and never changes that source value. */
  configure(view: ModelViewCamera, width: number, height: number, visible: boolean, settings: ModelMeasurementSettings = DEFAULT_MODEL_MEASUREMENT): void {
    this.setVisible(visible)
    if (!visible) return
    const span = visibleGridSpan(view, width, height)
    const major = visibleGridStep(view, width, height, settings.gridBaseMeters)
    const planeSide = Math.max(20000, span * 8, view.distance * 20)
    this.grid.scale.set(planeSide / 2, planeSide / 2, 1)
    this.grid.position.set(view.targetX, 0, view.targetZ)
    this.material.uniforms.majorStep.value = major
    this.material.uniforms.minorDivisions.value = settings.subdivisions
    this.material.uniforms.planeHalf.value = planeSide / 2
    this.material.uniforms.fadeRadius.value = view.projection === 'perspective' ? view.distance * 8 : planeSide * 0.3
    this.material.uniforms.worldCenter.value.set(view.targetX, view.targetZ)
    this.material.uniforms.gridOffset.value.set(view.targetX % major, view.targetZ % major)
    const position = this.yGeometry.getAttribute('position')
    position.setXYZ(1, 0, major * 2, 0); position.needsUpdate = true
    this.yGeometry.computeBoundingSphere()
  }

  setVisible(visible: boolean): void { this.grid.visible = visible; this.yAxis.visible = visible }
  dispose(): void { this.grid.geometry.dispose(); this.material.dispose(); this.yGeometry.dispose(); this.yMaterial.dispose() }
}
