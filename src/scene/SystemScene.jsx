/* WebGL-слой «живой системы» на React Three Fiber.
   Рисуем в clip-space теми же шейдерами, что и рукописная версия, — камера
   не участвует, поэтому картина попиксельно повторяет оригинал; сверху —
   единственный EffectComposer с деликатным Bloom на янтарных пакетах. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { attachInput } from './sim.js';

const POINT_VERT = /* glsl */`
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
    gl_PointSize = aSize;
    vColor = aColor;
  }
`;
const POINT_FRAG = /* glsl */`
  precision mediump float;
  varying vec4 vColor;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c) * 2.0;
    float a = vColor.a * smoothstep(1.0, 0.55, d);
    gl_FragColor = vec4(vColor.rgb, a);
  }
`;
const LINE_VERT = /* glsl */`
  attribute vec4 aColor;
  varying vec4 vColor;
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
    vColor = aColor;
  }
`;
const LINE_FRAG = /* glsl */`
  precision mediump float;
  varying vec4 vColor;
  void main() { gl_FragColor = vColor; }
`;

const MAT_FLAGS = { transparent: true, depthTest: false, depthWrite: false };

/* Bloom, дышащий вместе с системой: во время failover-каскада свечение
   янтарных маршрутов плавно нарастает — отказ пути видно, как требует
   («событие, которое видно»), без глоу на UI-элементах */
function BreathingBloom({ sim }) {
  const ref = useRef();
  useFrame((_, delta) => {
    const b = ref.current;
    if (!b) return;
    /* дышит и на естественный failover, и на ручной отказ посетителя */
    const target = 0.4 + 0.45 * Math.max(sim.fail.active ? 0.9 : 0, sim.manualPulse);
    b.intensity += (target - b.intensity) * Math.min(delta * 2.2, 1);
  });
  return <Bloom ref={ref} mipmapBlur intensity={0.4} luminanceThreshold={0.55} luminanceSmoothing={0.25} />;
}

function SystemLayer({ sim }) {
  const advance = useThree((s) => s.advance);
  const linesRef = useRef();
  const nodesRef = useRef();
  const packetsRef = useRef();

  const buffers = useMemo(() => {
    /* N + 1: слот узла-фокуса; P: пакеты с хвостами + бюджет осколков */
    const E = sim.edges.length, N = sim.N + 1, P = sim.PMAX * 4 + 48;
    return {
      linePos: new Float32Array(E * 2 * 3), lineCol: new Float32Array(E * 2 * 4),
      nodePos: new Float32Array(N * 3), nodeSize: new Float32Array(N), nodeCol: new Float32Array(N * 4),
      pktPos: new Float32Array(P * 3), pktSize: new Float32Array(P), pktCol: new Float32Array(P * 4),
    };
  }, [sim]);

  /* reduced-motion: прогреваем систему (кадры рисует StaticFrame ниже);
     смена темы дёргает redraw */
  useEffect(() => {
    const redraw = sim.reduceMotion ? () => advance(performance.now()) : null;
    if (sim.reduceMotion) {
      for (let w = 0; w < 40; w++) sim.step(33);
    }
    return attachInput(sim, redraw);
  }, [sim, advance]);

  useFrame((state, delta) => {
    const dt = Math.min(delta * 1000 || 16, 50);
    sim.aspect = state.size.width / state.size.height;
    sim.onScrollState();
    if (!sim.reduceMotion) sim.step(dt);

    /* зонд: ближайший живой узел под курсором + курсор-перекрестие */
    const prevHover = sim.hoverIdx;
    sim.hoverIdx = sim.probe.active && !sim.reduceMotion
      ? sim.nearestNode(sim.probe.x, sim.probe.y, 0.09)
      : -1;
    if ((sim.hoverIdx >= 0) !== (prevHover >= 0)) {
      document.documentElement.classList.toggle('sys-probe', sim.hoverIdx >= 0);
    }

    const dpr = state.gl.getPixelRatio();
    const th = sim.theme, b = buffers;
    const pa = [0, 0, 0], pb = [0, 0, 0];
    const E = sim.edges.length, N = sim.N;
    let i, e, o3, o4;

    /* рёбра: базовая ткань + светящиеся активные маршруты (heat) */
    const la = th.lineA * (0.35 + 0.65 * sim.intensity);
    for (i = 0; i < E; i++) {
      e = sim.edges[i];
      const h = Math.min(sim.nodes[e.a].health, sim.nodes[e.b].health);
      const hp = sim.heat[i];
      sim.nodePos(sim.nodes[e.a], pa);
      sim.nodePos(sim.nodes[e.b], pb);
      const depthA = 1 - (pa[2] + pb[2]) * 0.35;
      const al = la * (0.25 + h * 0.75) * depthA + hp * 0.38 * h;
      const mr = th.line[0] + (th.packet[0] - th.line[0]) * hp * 0.9;
      const mg = th.line[1] + (th.packet[1] - th.line[1]) * hp * 0.9;
      const mb = th.line[2] + (th.packet[2] - th.line[2]) * hp * 0.9;
      o3 = i * 6; o4 = i * 8;
      b.linePos[o3] = pa[0]; b.linePos[o3 + 1] = pa[1]; b.linePos[o3 + 2] = 0;
      b.linePos[o3 + 3] = pb[0]; b.linePos[o3 + 4] = pb[1]; b.linePos[o3 + 5] = 0;
      b.lineCol[o4] = mr; b.lineCol[o4 + 1] = mg; b.lineCol[o4 + 2] = mb; b.lineCol[o4 + 3] = al;
      b.lineCol[o4 + 4] = mr; b.lineCol[o4 + 5] = mg; b.lineCol[o4 + 6] = mb; b.lineCol[o4 + 7] = al;
    }

    /* узлы; узел под зондом — крупнее и янтарный: «этот можно испытать» */
    const na = th.nodeA * (0.4 + 0.6 * sim.intensity);
    for (i = 0; i < N; i++) {
      const n = sim.nodes[i];
      sim.nodePos(n, pa);
      o3 = i * 3; o4 = i * 4;
      const hov = i === sim.hoverIdx;
      b.nodePos[o3] = pa[0]; b.nodePos[o3 + 1] = pa[1]; b.nodePos[o3 + 2] = 0;
      b.nodeSize[i] = (2.6 + (1 - n.z) * 4.2) * dpr * (hov ? 1.9 : 1);
      const col = hov ? th.packet : th.node;
      b.nodeCol[o4] = col[0]; b.nodeCol[o4 + 1] = col[1]; b.nodeCol[o4 + 2] = col[2];
      b.nodeCol[o4 + 3] = hov ? 0.95 : na * (0.25 + n.health * 0.75) * (1 - n.z * 0.55);
    }
    /* узел-фокус: система сходится к единственной яркой точке за CTA */
    let nv = N;
    if (sim.converge > 0.01) {
      const ax = sim.aspect < 1 ? sim.aspect : Math.min(sim.aspect, 1.25);
      o3 = N * 3; o4 = N * 4;
      b.nodePos[o3] = sim.focal.x / ax; b.nodePos[o3 + 1] = sim.focal.y; b.nodePos[o3 + 2] = 0;
      b.nodeSize[N] = (5.2 + Math.sin(sim.time * 0.0035) * 1.1) * dpr * sim.converge;
      b.nodeCol[o4] = th.packet[0]; b.nodeCol[o4 + 1] = th.packet[1]; b.nodeCol[o4 + 2] = th.packet[2];
      b.nodeCol[o4 + 3] = 0.95 * sim.converge;
      nv = N + 1;
    }

    /* пакеты с коротким хвостом */
    let pv = 0;
    for (i = 0; i < sim.packets.length; i++) {
      const p = sim.packets[i];
      e = sim.edges[p.e];
      sim.nodePos(sim.nodes[e.a], pa);
      sim.nodePos(sim.nodes[e.b], pb);
      for (let s = 3; s >= 0; s--) {
        const t = Math.min(1, Math.max(0, p.t - p.dir * s * 0.045));
        o3 = pv * 3; o4 = pv * 4;
        b.pktPos[o3] = pa[0] + (pb[0] - pa[0]) * t;
        b.pktPos[o3 + 1] = pa[1] + (pb[1] - pa[1]) * t;
        b.pktPos[o3 + 2] = 0;
        b.pktSize[pv] = (s === 0 ? 4.4 : 2.9) * dpr;
        b.pktCol[o4] = th.packet[0]; b.pktCol[o4 + 1] = th.packet[1]; b.pktCol[o4 + 2] = th.packet[2];
        b.pktCol[o4 + 3] = (s === 0 ? 0.95 : 0.4 - s * 0.09) * (0.45 + 0.55 * sim.intensity);
        pv++;
      }
    }
    /* осколки убитых узлов */
    for (i = 0; i < sim.debris.length && pv < sim.PMAX * 4 + 48; i++) {
      const db = sim.debris[i];
      o3 = pv * 3; o4 = pv * 4;
      const col = db.spark ? th.packet : th.node;
      b.pktPos[o3] = db.x; b.pktPos[o3 + 1] = db.y; b.pktPos[o3 + 2] = 0;
      b.pktSize[pv] = db.size * 1.6 * dpr;
      b.pktCol[o4] = col[0]; b.pktCol[o4 + 1] = col[1]; b.pktCol[o4 + 2] = col[2];
      b.pktCol[o4 + 3] = (db.life / 900) * 0.85;
      pv++;
    }

    for (const ref of [linesRef, nodesRef, packetsRef]) {
      const g = ref.current && ref.current.geometry;
      if (!g) continue;
      for (const name of Object.keys(g.attributes)) g.attributes[name].needsUpdate = true;
    }
    if (nodesRef.current) nodesRef.current.geometry.setDrawRange(0, nv);
    if (packetsRef.current) packetsRef.current.geometry.setDrawRange(0, pv);
  });

  return (
    <>
      <lineSegments ref={linesRef} frustumCulled={false} renderOrder={0}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[buffers.linePos, 3]} usage={35048} />
          <bufferAttribute attach="attributes-aColor" args={[buffers.lineCol, 4]} usage={35048} />
        </bufferGeometry>
        <shaderMaterial vertexShader={LINE_VERT} fragmentShader={LINE_FRAG} {...MAT_FLAGS} />
      </lineSegments>
      <points ref={nodesRef} frustumCulled={false} renderOrder={1}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[buffers.nodePos, 3]} usage={35048} />
          <bufferAttribute attach="attributes-aSize" args={[buffers.nodeSize, 1]} usage={35048} />
          <bufferAttribute attach="attributes-aColor" args={[buffers.nodeCol, 4]} usage={35048} />
        </bufferGeometry>
        <shaderMaterial vertexShader={POINT_VERT} fragmentShader={POINT_FRAG} {...MAT_FLAGS} />
      </points>
      <points ref={packetsRef} frustumCulled={false} renderOrder={2}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[buffers.pktPos, 3]} usage={35048} />
          <bufferAttribute attach="attributes-aSize" args={[buffers.pktSize, 1]} usage={35048} />
          <bufferAttribute attach="attributes-aColor" args={[buffers.pktCol, 4]} usage={35048} />
        </bufferGeometry>
        <shaderMaterial vertexShader={POINT_VERT} fragmentShader={POINT_FRAG} {...MAT_FLAGS} />
      </points>
    </>
  );
}

/* reduced-motion: статичный кадр. Монтируется ПОСЛЕДНИМ в Canvas — advance
   должен уйти после того, как EffectComposer перехватил рендер-цикл, иначе
   аллокация его буферов стирает единственный нарисованный кадр. Повторные
   пинки закрывают гонки первичной раскладки и загрузки шрифтов. */
function StaticFrame({ sim }) {
  const advance = useThree((s) => s.advance);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!sim.reduceMotion) return;
    const kick = () => advance(performance.now());
    kick();
    const t1 = setTimeout(kick, 80);
    const t2 = setTimeout(kick, 350);
    /* после восстановления WebGL-контекста под frameloop='never' никто
       не перерисует кадр сам; при ресайзе пинок должен уйти после того,
       как R3F пересоздаст drawing buffer (ресайз буфера очищает канвас) */
    gl.domElement.addEventListener('webglcontextrestored', kick);
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(kick, 90); };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(rt);
      gl.domElement.removeEventListener('webglcontextrestored', kick);
      window.removeEventListener('resize', onResize);
    };
  }, [sim, advance, gl]);
  return null;
}

export default function SystemApp({ sim }) {
  /* слабый GPU: PerformanceMonitor (Drei) роняет DPR до 1 и выключает
     постобработку — деградация; на восстановившемся GPU качество
     возвращается. Управление через factor (0..1, растёт при стабильном fps),
     а НЕ через flipflops/onFallback: их счётчик инкрементируется каждым
     incline/decline, из-за чего на 90/120/144 Гц дисплеях fallback
     срабатывал бы гарантированно и навсегда */
  const [degraded, setDegraded] = useState(false);
  return (
    <Canvas
      flat
      linear
      dpr={degraded ? 1 : [1, 1.75]}
      frameloop={sim.reduceMotion ? 'never' : 'always'}
      gl={{ alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: 'high-performance' }}
      style={{ pointerEvents: 'none' }}
    >
      {!sim.reduceMotion && (
        /* гистерезис: вход в деградацию ниже 0.35, выход выше 0.65 —
           без флаппинга композера на пограничном GPU */
        <PerformanceMonitor onChange={({ factor }) => setDegraded((d) => (d ? factor < 0.65 : factor < 0.35))} />
      )}
      <SystemLayer sim={sim} />
      {!degraded && (
        <EffectComposer multisampling={sim.isMobile ? 2 : 4}>
          <BreathingBloom sim={sim} />
        </EffectComposer>
      )}
      <StaticFrame sim={sim} />
    </Canvas>
  );
}
