# Building a Living System: An Interactive Multipath-Failover Simulation as a Portfolio Substrate

*by Aminjon Azizov (Aminyx)*

> **Note (September 2026):** this article describes v2 of the site. In v3 the full-page substrate became an interactive globe in the hero, every project got its own 3D scene, and React Three Fiber was replaced by a plain three.js engine that renders all scenes through one WebGL context — see `docs/decisions.md`. The simulation mechanics described below are unchanged.

I spend my days building [Aminyx Link](https://aminyx.top), a Rust networking platform: a transport-independent session layer with multipath routing, failover, Reed-Solomon FEC, and pluggable congestion control (Reno, CUBIC, BBR). When I redesigned my portfolio, [aminyx.top](https://aminyx.top), I kept running into the same problem every engineer's site has: the work is invisible. You can write "731 automated tests" in a stat block, but a paragraph about failover reads the same whether you built the thing or copied the words.

So I made the background prove it. The entire page sits on top of one fixed, full-viewport WebGL canvas running a live simulation of the platform's core mechanic: nodes, routes, packets that hop between them, regional failures, and traffic that reroutes around the damage. Visitors can break it. Clicking the background kills a node; the routes rebuild themselves while you watch.

This article walks through how it's built: a renderer-agnostic simulation, clip-space shaders in React Three Fiber, a canvas2d fallback, hit-testing without a raycaster, one carefully budgeted EffectComposer, and the fallback chain that keeps Lighthouse happy.

## The idea: simulate the product, don't decorate the page

The rule I set for myself in the design doc: the scene must be a domain simulation, with the mechanics of the actual product. A generic particle field would have been faster to build and would have said nothing.

The simulation is small but honest to the domain:

- **176 nodes** on desktop (84 on mobile), 55% scattered, 45% clustered so the system has a visual center of gravity.
- Edges via **k-nearest neighbors** (k = 3), deduplicated, with an adjacency list per node.
- Up to **64 packets** travel the edges. When a packet reaches a node, it hops to a random adjacent edge, exactly like traffic crossing a mesh:

```js
p.t += p.speed * dt * 0.001 * p.dir;
if (p.t > 1 || p.t < 0) {
  /* hop: continue from the reached node along a random living edge */
  var at = p.t > 1 ? ed.b : ed.a;
  var options = sim.adj[at];
  var next = options[(Math.random() * options.length) | 0];
  var ne = sim.edges[next];
  if (sim.nodes[ne.a].health < 0.5 || sim.nodes[ne.b].health < 0.5 || Math.random() < 0.18) {
    sim.packets.splice(i, 1);
    continue;
  }
  p.e = next;
  p.dir = ne.a === at ? 1 : -1;
  p.t = p.dir === 1 ? 0 : 1;
}
```

- Every few seconds a **failover cascade** fires: a random region of the graph goes dark for ~2.6 seconds, packets on dead routes die, and traffic pools onto the surviving edges. Each edge carries a `heat` value that a passing packet sets to 1 and that cools with a 650 ms half-life, so active routes glow amber and fade.

Scroll acts as a camera pass. Intensity follows the page: 1.0 at the hero, 0.42 through the reading sections, back up to 0.85 at the contact block, with a slow zoom (1 → 1.14) and a ~4° rotation across the full scroll. In the last 20% of the page the whole system converges, via smoothstep, toward a single bright node sitting behind the call-to-action.

## Architecture: one simulation, two renderers

The simulation lives in `sim.js`, a plain JavaScript module with no rendering imports. It knows nothing about three.js. It exposes state (`nodes`, `edges`, `heat`, `packets`, `debris`) and methods (`step`, `nodePos`, `killAt`, `stormNow`), and two renderers read from it: a React Three Fiber layer and a canvas2d fallback of about 3 KB.

The trick that makes the two renderers pixel-compatible is that everything already lives in clip-space. Node positions are computed in [-1, 1] coordinates, and the WebGL vertex shader does no projection at all:

```glsl
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
  gl_PointSize = aSize;
  vColor = aColor;
}
```

No camera, no matrices. The R3F `<Canvas>` is there for its render loop, buffer management, and postprocessing pipeline, while geometry is three `bufferGeometry` objects (lines, nodes, packets) with preallocated `Float32Array`s, updated every frame and drawn with `setDrawRange`. The canvas2d fallback runs the same `nodePos()` math and maps clip coordinates to pixels. Parallax, the scroll camera, the convergence, and the cursor probe all live inside `nodePos()` in the simulation, so both renderers inherit them for free.

## Interaction: the visitor is a chaos engineer

A live failover simulation invites one obvious interaction: let people cause the failures. On aminyx.top:

- **Click** kills the nearest living node. It shatters into ten ballistic debris particles (a quarter of them amber sparks), routes around it reheat, and the bloom pulses.
- **Long-press** (600 ms) triggers a storm: a burst of random kills every 160–380 ms for ~3 seconds.
- The **cursor is a probe**: nodes within a radius softly push aside, and the closest living node grows and turns amber, signaling "this one is testable."
- A hidden **terminal** (backtick key) drives the same simulation: `status · kill [n] · heal · storm · chaos on|off · sfx on|off · theme · lang`. The Konami code switches on CHAOS MODE, continuous random failures with a HUD. Sound is synthesized with Web Audio (no files, so the `default-src 'self'` CSP stays clean) and stays off until you opt in.

Hit-testing needs no raycaster because the simulation is already in clip-space. Converting a pointer event costs two multiplications, and finding the target is a linear scan over at most 176 nodes:

```js
function toClip(ev) {
  return {
    x: (ev.clientX / window.innerWidth) * 2 - 1,
    y: 1 - (ev.clientY / window.innerHeight) * 2,
  };
}
```

`nearestNode(cx, cy, maxDist)` compares squared distances against living nodes and returns the closest within a threshold. The same function serves clicks, the hover probe, and the terminal.

The hard part of this interactivity was restraint. A full-page pointer target collides with everything else a page does. The guards that survived four review rounds: only `button === 0` and `isPrimary` (right-click killed nodes in the first version), a drag threshold that cancels the storm timer (slow text selection used to summon storms), a `getSelection()` check before killing, and an `isInteractive()` ancestor test so links and buttons stay boring.

## Postprocessing: one composer, breathing on failure

There is exactly one `EffectComposer` with one effect: Bloom, thresholded at luminance 0.55 so only the amber packets and sparks bloom while the grey substrate stays flat. Instead of a constant glow, the bloom breathes with the system state, rising during a failover cascade or after a manual kill and settling back:

```jsx
function BreathingBloom({ sim }) {
  const ref = useRef();
  useFrame((_, delta) => {
    const b = ref.current;
    if (!b) return;
    const target = 0.4 + 0.45 * Math.max(sim.fail.active ? 0.9 : 0, sim.manualPulse);
    b.intensity += (target - b.intensity) * Math.min(delta * 2.2, 1);
  });
  return <Bloom ref={ref} mipmapBlur intensity={0.4} luminanceThreshold={0.55} luminanceSmoothing={0.25} />;
}
```

The failure event becomes visible at the postprocessing level, which is the whole point of the scene.

## Performance: a background scene must cost nothing up front

The content page is plain HTML/CSS/JS and does not wait for the scene. The three.js + React chunk (~319 KB gzip) loads through `requestIdleCallback` after first paint, and devices that shouldn't pay for it never do:

```js
whenIdle(() => {
  const to2d = () => import('./scene2d.js').then((m) => m.mount2d(root));
  if (hasWebGL2() && !liteConnection()) {
    import('./mount.jsx').then((m) => m.mount(root)).catch(to2d);
  } else {
    to2d();
  }
});
```

`liteConnection()` checks `Save-Data` and 2G via the Network Information API; those users get the canvas2d renderer. `hasWebGL2()` exists because three 0.185 only creates WebGL2 contexts, so WebGL1-only devices route to canvas2d instead of a blank layer.

At runtime, the budget is enforced by a DPR cap of 1.75, MSAA of 2 on mobile and 4 on desktop, and Drei's `PerformanceMonitor`, which drops DPR to 1 and unmounts the composer on weak GPUs. One detail cost me a debugging session: the monitor's `flipflops`/`onFallback` API counts every incline and decline, and on 90/120/144 Hz displays the refresh-rate mismatch produced enough oscillation that the scene degraded within ten seconds, permanently. I switched to the `factor` signal with hysteresis, entering degraded mode below 0.35 and leaving above 0.65:

```jsx
<PerformanceMonitor
  onChange={({ factor }) => setDegraded((d) => (d ? factor < 0.65 : factor < 0.35))}
/>
```

On the CSS side, `content-visibility: auto` on the five below-fold sections keeps layout work away from the frame loop. Measured results on production: Lighthouse 100 in all four audited categories (Accessibility, Best Practices, SEO, Agentic Browsing), and the performance trace shows an LCP of 586 ms with CLS 0.00. The scene never appears in the critical path.

## Accessibility: the static frame is a feature

`prefers-reduced-motion` gets a real treatment, a static frame of the system rather than an empty background. The canvas runs with `frameloop="never"`, the simulation is warmed with 40 pre-steps so routes and packets exist, and a `StaticFrame` component calls R3F's `advance()` to draw single frames on demand: at mount, after font load settles, on resize (debounced, because resizing the drawing buffer clears it), and on `webglcontextrestored`. Mount order matters here: `StaticFrame` must mount after the `EffectComposer`, because the composer's buffer allocation erases whatever frame was drawn before it took over the render loop. Convergence is also forced to 0 under reduced motion, since a single frame captured near the footer would freeze the collapsed system for the whole session.

All interactive chaos is disabled under reduced motion, `forced-colors` mode hides the decorative layers entirely, and the no-canvas case falls through to a plain themed background. The companion `/craft` page, five canvas2d vignettes of the same mechanics (multipath failover, Reed-Solomon FEC, congestion control, a kill switch with a "leaked: 0" counter, and a variable-font axis toy), follows the same contract: static layouts under reduced motion, both themes, three languages.

## Lessons

1. **Keep the simulation renderer-agnostic.** The `sim.js` split paid for itself three times: the canvas2d fallback, the reduced-motion static frame, and the terminal all consume the same module.
2. **Clip-space is a superpower for background scenes.** Skipping the camera made the two renderers pixel-identical and reduced hit-testing to arithmetic. My canvas2d projection once multiplied X by aspect a second time; every click missed until both renderers spoke pure clip-space.
3. **Full-page interactivity is an edge-case generator.** Right-click, middle-click, second fingers, slow text selection, pointer leave, `pointercancel`: each one produced a real bug that a review round caught.
4. **Trust signals over guesses in degradation logic.** The `flipflops` counter looked like the intended API and was wrong for high-refresh displays; the `factor` + hysteresis approach behaves.
5. **A background scene earns its place only if the page works without it.** Lazy chunk, idle mount, connection checks, and fallbacks meant the WebGL layer never taxed the metrics the site is judged by.

The scene is now the first thing people mention when they write to me. It works because there is nothing to explain: the system fails, reroutes, and recovers in front of you, and that is the product.
