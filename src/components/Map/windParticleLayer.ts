import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreGLMap,
} from "maplibre-gl";
import { sampleWindField, speedToColor, type WindFieldGrid } from "../../domain/windField.ts";

export const WIND_PARTICLE_LAYER_ID = "wind-particles";

// Standard MapLibre/Mapbox tile-world constant: mercator coordinates are
// normalized 0..1 across a world that's 512 * 2^zoom pixels wide. Used to
// convert a desired on-screen pixel size (streak width/length) into
// mercator units for the current zoom, without needing per-vertex
// screen-space math in the shader - correct at pitch=0 (this app never
// exposes pitch controls), an acceptable simplification for a decorative
// flow visualization rather than a precision instrument.
const TILE_WORLD_PIXELS = 512;

// Calibrated for "usable/pleasant at strong winds" (task requirement) -
// not literal m/s-to-screen-speed. Capping the effective speed used for
// advection means a 20 m/s gale doesn't turn into an unreadable blur
// relative to a gentle 3 m/s breeze; color still communicates the real
// speed even where motion speed has flattened out.
const MAX_EFFECTIVE_SPEED_MS = 10;
const ADVECT_DEGREES_PER_SEC_PER_MS = 0.006; // tuned visually - see DECISIONS.md

const MIN_PARTICLES = 500;
const MAX_PARTICLES = 2200;
const PARTICLE_MAX_AGE_SEC = 6 + Math.random(); // jittered per-instance so respawns aren't synchronized

// Streak size is a fixed pixel size (scaled by speed), deliberately NOT
// derived from how far a particle actually moved in one frame - that
// distance is sub-pixel at typical zoom/framerate (measured via a live
// debug run: ~1px/frame at 60fps), which rendered as near-invisible
// specks rather than readable streaks. Longer streak = faster wind is a
// second, free way (besides color) to read speed at a glance.
const STREAK_HEAD_WIDTH_PX = 4.2;
const STREAK_MIN_LENGTH_PX = 10;
const STREAK_MAX_LENGTH_PX = 34;
const STREAK_LENGTH_PER_MS = 2.4;

const VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
in vec4 a_color;
uniform mat4 u_matrix;
out vec4 v_color;
void main() {
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
  v_color = a_color;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Wind particle shader compile error: ${info}`);
  }
  return shader;
}

function mercatorUnitsPerPixel(zoom: number): number {
  return 1 / (TILE_WORLD_PIXELS * Math.pow(2, zoom));
}

interface ParticleState {
  lon: Float64Array;
  lat: Float64Array;
  age: Float32Array;
  speedMs: Float32Array;
  /** Unit flow-direction components at the particle's last sampled position - drives the drawn streak's orientation. */
  dirU: Float32Array;
  dirV: Float32Array;
}

function randomPointIn(grid: WindFieldGrid): { lon: number; lat: number } {
  return {
    lon: grid.minLon + Math.random() * (grid.maxLon - grid.minLon),
    lat: grid.minLat + Math.random() * (grid.maxLat - grid.minLat),
  };
}

function allocateParticles(count: number, grid: WindFieldGrid | null): ParticleState {
  const state: ParticleState = {
    lon: new Float64Array(count),
    lat: new Float64Array(count),
    age: new Float32Array(count),
    speedMs: new Float32Array(count),
    dirU: new Float32Array(count),
    dirV: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    const p = grid ? randomPointIn(grid) : { lon: 0, lat: 0 };
    state.lon[i] = p.lon;
    state.lat[i] = p.lat;
    state.age[i] = Math.random() * PARTICLE_MAX_AGE_SEC; // stagger initial ages
    state.speedMs[i] = 0;
  }
  return state;
}

/**
 * Animated GPU wind-particle layer (MapLibre CustomLayerInterface) -
 * replaces the previous static 961-DOM-marker arrow field. See
 * docs/DECISIONS.md's "Animated wind field" entry for why this is a
 * hand-rolled custom layer rather than an existing wind library.
 *
 * Particle advection/respawn/trail-geometry runs entirely on the CPU in
 * plain JS each frame (no per-particle React components, no React state
 * updates) - cheap enough at this particle count that it doesn't need a
 * GPU transform-feedback pass, and keeps the implementation debuggable
 * and testable independent of a live WebGL context (domain/windField.ts's
 * sampleWindField/speedToColor are unit tested; this file is the thin,
 * necessarily-untested GL glue on top).
 *
 * Animation is driven by `map.triggerRepaint()` at the end of every
 * `render()` call (MapLibre's own documented mechanism for continuous
 * custom-layer animation) rather than a separate requestAnimationFrame
 * loop - one fewer timer to leak, and it naturally pauses whenever
 * MapLibre itself stops rendering (e.g. an inactive/backgrounded tab, on
 * top of this layer's own explicit visibilitychange handling below).
 */
export class WindParticleLayer implements CustomLayerInterface {
  id = WIND_PARTICLE_LAYER_ID;
  type = "custom" as const;
  renderingMode = "2d" as const;

  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private uMatrixLoc: WebGLUniformLocation | null = null;

  private map: MapLibreGLMap | null = null;
  private grid: WindFieldGrid | null = null;
  private particles: ParticleState | null = null;
  private particleCount = MIN_PARTICLES;
  private lastFrameMs: number | null = null;
  private paused = false;
  private removed = false;
  private onVisibilityChange = () => {
    this.paused = document.hidden;
    if (!this.paused) this.map?.triggerRepaint();
  };

  setGrid(grid: WindFieldGrid | null): void {
    this.grid = grid;
  }

  onAdd(map: MapLibreGLMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl;
    this.removed = false;

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create WebGL program");
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Wind particle program link error: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    this.uMatrixLoc = gl.getUniformLocation(program, "u_matrix");

    const canvasArea = gl.canvas.width * gl.canvas.height;
    this.particleCount = Math.round(Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, canvasArea / 1400)));
    this.particles = allocateParticles(this.particleCount, this.grid);

    this.vao = gl.createVertexArray();
    this.vertexBuffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    const stride = 6 * 4; // vec2 pos + vec4 color, all float32
    const aPos = gl.getAttribLocation(program, "a_pos");
    const aColor = gl.getAttribLocation(program, "a_color");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 2 * 4);
    gl.bindVertexArray(null);

    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.paused = document.hidden;
    map.triggerRepaint();
  }

  onRemove(): void {
    this.removed = true;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    const gl = this.gl;
    if (gl) {
      if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.program) gl.deleteProgram(this.program);
    }
    this.gl = null;
    this.program = null;
    this.vao = null;
    this.vertexBuffer = null;
    this.map = null;
  }

  private step(dtSec: number): Float32Array | null {
    const { grid, particles } = this;
    if (!grid || !particles) return null;

    const count = this.particleCount;
    // 6 vertices (2 triangles) per particle: vec2 pos + vec4 rgba each.
    const floatsPerVertex = 6;
    const vertexData = new Float32Array(count * 6 * floatsPerVertex);
    const scale = mercatorUnitsPerPixel(this.map?.getZoom() ?? 8);

    for (let i = 0; i < count; i++) {
      const sample = sampleWindField(grid, particles.lat[i], particles.lon[i]);
      particles.age[i] += dtSec;

      if (!sample || particles.age[i] > PARTICLE_MAX_AGE_SEC) {
        const respawn = randomPointIn(grid);
        particles.lon[i] = respawn.lon;
        particles.lat[i] = respawn.lat;
        particles.age[i] = 0;
        particles.speedMs[i] = 0;
        particles.dirU[i] = 0;
        particles.dirV[i] = 0;
        // Skip drawing a streak for a particle the instant it respawns -
        // it has no direction/history yet this frame, and next frame's
        // sample will give it a real one. Zero-area triangle, cheap.
        this.writeDegenerateQuad(vertexData, i, floatsPerVertex);
        continue;
      }

      // Simulation motion (drives the particle's actual position/age
      // over many frames) is intentionally decoupled from the drawn
      // streak's length below - one frame's real advection distance is
      // sub-pixel at typical zoom levels (found by instrumenting a live
      // run: ~1px per frame at 60fps), which read as near-invisible
      // specks rather than streaks. The streak length communicates
      // speed visually instead; the underlying simulation still genuinely
      // advects/respawns particles along the real wind field.
      const effectiveSpeed = Math.min(sample.speedMs, MAX_EFFECTIVE_SPEED_MS);
      const moveStep = effectiveSpeed * ADVECT_DEGREES_PER_SEC_PER_MS * dtSec;
      const latRad = (particles.lat[i] * Math.PI) / 180;
      particles.lat[i] += sample.v * moveStep;
      particles.lon[i] += (sample.u * moveStep) / Math.max(0.15, Math.cos(latRad));
      particles.speedMs[i] = sample.speedMs;
      particles.dirU[i] = sample.u;
      particles.dirV[i] = sample.v;

      this.writeStreakQuad(vertexData, i, floatsPerVertex, scale);
    }

    return vertexData;
  }

  private writeDegenerateQuad(vertexData: Float32Array, i: number, floatsPerVertex: number): void {
    // All 6 vertices at the same point, zero alpha - contributes nothing
    // to the frame, no branch needed in the draw call itself.
    const base = i * 6 * floatsPerVertex;
    vertexData.fill(0, base, base + 6 * floatsPerVertex);
  }

  /**
   * Streak length/width are fixed pixel sizes (scaled by speed, not by
   * how far the particle actually moved this frame) so the flow field
   * reads clearly regardless of framerate or zoom - see the comment in
   * step() for why this had to be decoupled from real per-frame motion.
   */
  private writeStreakQuad(vertexData: Float32Array, i: number, floatsPerVertex: number, scale: number): void {
    const particles = this.particles!;
    const head = MercatorCoordinate.fromLngLat({ lng: particles.lon[i], lat: particles.lat[i] });
    const ux = particles.dirU[i];
    const uy = -particles.dirV[i]; // mercator Y increases southward, opposite of lat/v's northward-positive convention
    const len = Math.max(STREAK_MIN_LENGTH_PX, Math.min(STREAK_MAX_LENGTH_PX, STREAK_MIN_LENGTH_PX + particles.speedMs[i] * STREAK_LENGTH_PER_MS)) * scale;
    const halfWidth = (STREAK_HEAD_WIDTH_PX * scale) / 2;

    const tailX = head.x - ux * len;
    const tailY = head.y - uy * len;
    const perpX = -uy;
    const perpY = ux;

    const [r, g, b] = speedToColor(particles.speedMs[i]);
    const tailAlpha = 0.05;
    const headAlpha = 0.9;

    const headLeftX = head.x + perpX * halfWidth;
    const headLeftY = head.y + perpY * halfWidth;
    const headRightX = head.x - perpX * halfWidth;
    const headRightY = head.y - perpY * halfWidth;

    const base = i * 6 * floatsPerVertex;
    const put = (offset: number, x: number, y: number, alpha: number) => {
      const o = base + offset * floatsPerVertex;
      vertexData[o] = x;
      vertexData[o + 1] = y;
      vertexData[o + 2] = r * alpha;
      vertexData[o + 3] = g * alpha;
      vertexData[o + 4] = b * alpha;
      vertexData[o + 5] = alpha;
    };
    // Tapered quad: tail is a near-zero-width, near-transparent point,
    // head is full width/opacity - the "swimming tail" shape from a
    // single triangle pair, no multi-frame trail buffer needed.
    put(0, tailX, tailY, tailAlpha);
    put(1, headLeftX, headLeftY, headAlpha);
    put(2, headRightX, headRightY, headAlpha);
    put(3, tailX, tailY, tailAlpha);
    put(4, headRightX, headRightY, headAlpha);
    put(5, headLeftX, headLeftY, headAlpha);
  }

  render(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    if (this.removed || this.paused || !this.program || !this.vao) return;

    const now = performance.now();
    const dtSec = this.lastFrameMs === null ? 0 : Math.min(0.1, (now - this.lastFrameMs) / 1000);
    this.lastFrameMs = now;

    const vertexData = this.step(dtSec);
    if (vertexData) {
      // A flat 2D decorative layer at a single implicit z - triangle
      // winding varies per particle depending on its current flow
      // direction, so face culling (which MapLibre may leave enabled
      // from whatever it rendered previously) would silently drop
      // roughly half of all streaks depending on orientation.
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.program);
      // `options.modelViewProjectionMatrix` does NOT map raw
      // MercatorCoordinate.fromLngLat() output to clip space in this
      // MapLibre version (confirmed empirically - a triangle built from
      // it never rendered, anywhere, even hugely oversized). The
      // correct matrix for plain world-space mercator coordinates is
      // `defaultProjectionData.mainMatrix`, per MapLibre's own "add a
      // 3D model" example, which uses exactly this field with
      // MercatorCoordinate-space geometry and no extra tile/EXTENT
      // rescaling. `options.modelViewProjectionMatrix` is apparently
      // for a different (camera-only / tile-relative) use case not
      // documented clearly enough to guess correctly without this
      // cross-check.
      gl.uniformMatrix4fv(this.uMatrixLoc, false, options.defaultProjectionData.mainMatrix as unknown as Float32Array);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, this.particleCount * 6);
      gl.bindVertexArray(null);
    }

    this.map?.triggerRepaint();
  }
}

/**
 * `map.getLayer()` doesn't return the CustomLayerInterface instance
 * passed to `addLayer()` directly - MapLibre wraps it in an internal
 * `CustomStyleLayer` and exposes the original at `.implementation`
 * (confirmed against maplibre-gl's own .d.ts, not documented in the
 * public custom-layer guide). A plain cast to `WindParticleLayer`
 * compiles but is wrong at runtime (`.setGrid is not a function`) -
 * caught by an actual browser run, not just the type checker, since
 * the cast satisfies TypeScript either way.
 */
function getWindParticleLayer(map: MapLibreGLMap): WindParticleLayer | undefined {
  const styleLayer = map.getLayer(WIND_PARTICLE_LAYER_ID) as unknown as { implementation?: unknown } | undefined;
  const impl = styleLayer?.implementation;
  return impl instanceof WindParticleLayer ? impl : undefined;
}

/** Idempotent - adds the layer only if not already present, matching airspaceLayer.ts/skywaysLayer.ts's pattern. */
export function addWindParticleLayer(map: MapLibreGLMap, initialGrid: WindFieldGrid | null): WindParticleLayer {
  const existing = getWindParticleLayer(map);
  if (existing) return existing;
  const layer = new WindParticleLayer();
  layer.setGrid(initialGrid);
  map.addLayer(layer);
  return layer;
}

export function updateWindParticleLayer(map: MapLibreGLMap, grid: WindFieldGrid | null): void {
  getWindParticleLayer(map)?.setGrid(grid);
}

export function removeWindParticleLayer(map: MapLibreGLMap): void {
  if (map.getLayer(WIND_PARTICLE_LAYER_ID)) map.removeLayer(WIND_PARTICLE_LAYER_ID);
}
