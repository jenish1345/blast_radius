/**
 * BLAST RADIUS — 3D Particle Stage (three.js)
 * 
 * GPU-accelerated particle system with custom ShaderMaterial.
 * Features noise displacement in vertex shader, pointer repulsion,
 * shockwave simulation, and theme-adaptive rendering (Additive vs Normal blending).
 */

import * as THREE from 'three';

const VERTEX_SHADER = `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uDrift;
  uniform float uCluster;
  uniform float uShockwave;
  uniform float uParticleSize;
  uniform vec2 uPointer;
  uniform float uRepulsion;

  attribute float aSize;
  attribute vec3 aInitialPos;
  attribute float aPhase;

  varying float vPhase;
  varying vec3 vPosition;

  // Simplex-inspired pseudo noise for GPU
  vec3 curl(vec3 p) {
    float x = sin(p.y * 1.8 + uTime * uSpeed + aPhase) * cos(p.z * 1.5 + uTime * 0.4);
    float y = sin(p.z * 1.8 + uTime * uSpeed + aPhase * 1.3) * cos(p.x * 1.5 + uTime * 0.4);
    float z = sin(p.x * 1.8 + uTime * uSpeed + aPhase * 0.7) * cos(p.y * 1.5 + uTime * 0.4);
    return vec3(x, y, z);
  }

  void main() {
    vPhase = aPhase;
    vec3 pos = aInitialPos;

    // Ordered cluster compression during 'analyzing'
    pos = mix(pos, pos * 0.55 + vec3(0.0, 0.0, 0.0), uCluster);

    // Dynamic turbulent curl noise weighted by drift and speed
    vec3 noise = curl(pos * 0.8) * (0.35 + uDrift * 0.85);
    pos += noise;

    // Pointer repulsion in screen space (X/Y)
    vec2 dir = pos.xy - uPointer;
    float dist = length(dir);
    if (dist < 1.4 && dist > 0.001) {
      float repulse = (1.4 - dist) / 1.4;
      pos.xy += (dir / dist) * repulse * uRepulsion * 0.5;
    }

    // Shockwave expansion on RED verdict
    if (uShockwave > 0.001) {
      float r = length(pos.xy);
      float waveDist = abs(r - uShockwave * 3.5);
      if (waveDist < 0.6) {
        float waveStrength = (0.6 - waveDist) / 0.6;
        pos += normalize(pos + vec3(0.001)) * waveStrength * 0.8;
      }
    }

    vPosition = pos;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (aSize * uParticleSize) * (260.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uThemeMode; // 0.0 = dark (glow), 1.0 = light (sharp)

  varying float vPhase;
  varying vec3 vPosition;

  void main() {
    // Soft circle sprite
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;

    float alpha = smoothstep(0.5, 0.08, dist) * uOpacity;
    
    // Light mode: clean, darker edges; Dark mode: glowing core
    if (uThemeMode > 0.5) {
      alpha = smoothstep(0.48, 0.15, dist) * uOpacity * 0.9;
    } else {
      alpha *= (0.75 + 0.25 * sin(vPhase * 6.28));
    }

    gl_FragColor = vec4(uColor, alpha);
  }
`;

export class ParticleStage {
  constructor(containerElement) {
    this.container = containerElement;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.points = null;
    this.material = null;
    this.animationFrameId = null;
    this.resizeObserver = null;
    this.isPaused = false;
    this.clock = new THREE.Clock();

    this.state = {
      phase: 'idle',
      tier: 'GREEN',
      drift: 0.1,
      theme: 'dark'
    };

    // Target values for lerping
    this.targets = {
      speed: 0.4,
      drift: 0.1,
      cluster: 0.0,
      shockwave: 0.0,
      color: new THREE.Color(0x7C9CFF),
      opacity: 0.75,
      size: 1.0,
      themeMode: 0.0
    };

    this.pointer = { x: 999.0, y: 999.0, targetX: 999.0, targetY: 999.0 };

    this.init();
  }

  init() {
    // WebGL support check
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) throw new Error("No WebGL context");
    } catch (_) {
      this.container.classList.add('webgl-fallback');
      return;
    }

    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 600;

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.camera.position.z = 5.2;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.container.appendChild(this.renderer.domElement);

    // Create Particles
    this.createParticles(width < 640 ? 2500 : 7000);

    // Setup Listeners
    this.setupListeners();

    // Start Loop
    this.clock.start();
    this.animate();
  }

  createParticles(count) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const initialPos = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Spherical distribution with layered radii
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * 2.1;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi) * 0.8;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      initialPos[i * 3] = x;
      initialPos[i * 3 + 1] = y;
      initialPos[i * 3 + 2] = z;

      sizes[i] = 0.8 + Math.random() * 1.4;
      phases[i] = Math.random();
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aInitialPos', new THREE.BufferAttribute(initialPos, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 0.4 },
        uDrift: { value: 0.1 },
        uCluster: { value: 0.0 },
        uShockwave: { value: 0.0 },
        uParticleSize: { value: 1.0 },
        uPointer: { value: new THREE.Vector2(999, 999) },
        uRepulsion: { value: 1.0 },
        uColor: { value: new THREE.Color(0x7C9CFF) },
        uOpacity: { value: 0.75 },
        uThemeMode: { value: 0.0 }
      }
    });

    this.points = new THREE.Points(geometry, this.material);
    this.scene.add(this.points);
  }

  setupListeners() {
    // Confined pointer tracking within stage region only
    this.container.addEventListener('pointermove', (e) => {
      const rect = this.container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      // Map to world coordinates at z=0
      this.pointer.targetX = x * 2.8;
      this.pointer.targetY = y * 2.2;
    });

    this.container.addEventListener('pointerleave', () => {
      this.pointer.targetX = 999;
      this.pointer.targetY = 999;
    });

    // ResizeObserver on container
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.renderer || !this.camera) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w === 0 || h === 0) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
    this.resizeObserver.observe(this.container);

    // Visibility change pauses rendering
    document.addEventListener('visibilitychange', () => {
      this.isPaused = document.hidden;
      if (!this.isPaused && !this.animationFrameId) {
        this.clock.start();
        this.animate();
      }
    });
  }

  setTheme(theme) {
    this.state.theme = theme;
    if (!this.material) return;

    if (theme === 'light') {
      this.material.blending = THREE.NormalBlending;
      this.targets.themeMode = 1.0;
      this.targets.opacity = 0.55;
      this.targets.size = 0.85;
      this.applyTierColors(this.state.tier);
    } else {
      this.material.blending = THREE.AdditiveBlending;
      this.targets.themeMode = 0.0;
      this.targets.opacity = 0.75;
      this.targets.size = 1.0;
      this.applyTierColors(this.state.tier);
    }
    this.material.needsUpdate = true;
  }

  setState({ phase = 'idle', tier = 'GREEN', drift = 0.0 }) {
    this.state.phase = phase;
    this.state.tier = tier;
    this.state.drift = drift;

    this.applyTierColors(tier);

    switch (phase) {
      case 'idle':
        this.targets.speed = 0.35;
        this.targets.drift = 0.1;
        this.targets.cluster = 0.0;
        this.targets.shockwave = 0.0;
        break;

      case 'analyzing':
        this.targets.speed = 0.85;
        this.targets.cluster = 0.7; // tighten into ordered fork
        this.targets.drift = 0.15;
        this.targets.shockwave = 0.0;
        break;

      case 'refining':
        this.targets.speed = 0.7;
        this.targets.cluster = 0.45;
        this.targets.drift = Math.max(0.1, Math.min(1.0, drift)); // cloud calms as drift drops
        this.targets.shockwave = 0.0;
        break;

      case 'verdict':
        this.targets.cluster = 0.0;
        if (tier === 'RED') {
          this.triggerShockwave();
        } else if (tier === 'YELLOW') {
          this.targets.speed = 0.55;
          this.targets.drift = 0.45;
        } else {
          // GREEN
          this.targets.speed = 0.25;
          this.targets.drift = 0.08; // slow breathing
        }
        break;

      case 'halt':
      case 'refuted':
        this.targets.speed = 0.02; // halts
        this.targets.drift = 0.0;
        this.targets.color.setHex(0xFF4D5E);
        break;
    }
  }

  applyTierColors(tier) {
    const isLight = this.state.theme === 'light';
    if (tier === 'RED') {
      this.targets.color.setHex(isLight ? 0xD92D4A : 0xFF4D5E);
    } else if (tier === 'YELLOW') {
      this.targets.color.setHex(isLight ? 0xB45309 : 0xFFB020);
    } else {
      // GREEN or default
      this.targets.color.setHex(isLight ? 0x0E9F6E : 0x3DDC97);
    }
  }

  triggerShockwave() {
    this.targets.shockwave = 0.01;
    this.targets.speed = 1.4;
    this.targets.drift = 1.0;
  }

  animate() {
    if (this.isPaused) {
      this.animationFrameId = null;
      return;
    }

    const delta = this.clock.getDelta();
    const uniforms = this.material?.uniforms;

    if (uniforms) {
      // Lerp uniforms smoothly over ~400ms
      const factor = Math.min(delta * 4.0, 1.0);
      uniforms.uSpeed.value += (this.targets.speed - uniforms.uSpeed.value) * factor;
      uniforms.uDrift.value += (this.targets.drift - uniforms.uDrift.value) * factor;
      uniforms.uCluster.value += (this.targets.cluster - uniforms.uCluster.value) * factor;
      uniforms.uOpacity.value += (this.targets.opacity - uniforms.uOpacity.value) * factor;
      uniforms.uParticleSize.value += (this.targets.size - uniforms.uParticleSize.value) * factor;
      uniforms.uThemeMode.value += (this.targets.themeMode - uniforms.uThemeMode.value) * factor;
      uniforms.uColor.value.lerp(this.targets.color, factor);

      // Advance time with dynamic speed
      uniforms.uTime.value += delta * uniforms.uSpeed.value;

      // Pointer lerping
      this.pointer.x += (this.pointer.targetX - this.pointer.x) * factor;
      this.pointer.y += (this.pointer.targetY - this.pointer.y) * factor;
      uniforms.uPointer.value.set(this.pointer.x, this.pointer.y);

      // Shockwave animation lifecycle
      if (this.targets.shockwave > 0) {
        this.targets.shockwave += delta * 1.4;
        uniforms.uShockwave.value = this.targets.shockwave;
        if (this.targets.shockwave > 1.2) {
          this.targets.shockwave = 0.0;
          uniforms.uShockwave.value = 0.0;
          this.targets.speed = 0.45; // settle into steady turbulent state
        }
      }

      // Slow orbital rotation
      if (this.points) {
        this.points.rotation.y += delta * 0.12 * uniforms.uSpeed.value;
        this.points.rotation.x += delta * 0.04 * uniforms.uSpeed.value;
      }
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }

    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }

  destroy() {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.renderer) this.renderer.dispose();
  }
}
