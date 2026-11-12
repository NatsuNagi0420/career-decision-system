/** 青穗集 · 忆迹场体积星云：低分辨率光线步进、三维暗尘与丝状云气，独立于真实记忆数据。 */
import * as THREE from "three";
import { NEBULA_FORM_GLSL, NEBULA_SCALE } from "./memory-nebula-form";

const VERTEX = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const FRAGMENT = `
  precision highp float;
  varying vec2 vUv;
  uniform mat4 uCameraWorld;
  uniform mat4 uProjectionInverse;
  uniform float uTime;
  float hash(vec3 p) {
    p = fract(p * .3183099 + vec3(.13, .71, .37));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = .53 * noise(p); p = p * 2.03 + vec3(13.1, 7.7, 5.3);
    v += .27 * noise(p); p = p * 2.07 + vec3(3.9, 11.3, 17.1);
    v += .13 * noise(p); return v;
  }
  ${NEBULA_FORM_GLSL}
  vec4 cloud(vec3 p, float branch, float broad, float detail) {
    vec2 spine = veilSpine(p.x, branch);
    float width = veilWidth(p.x, branch);
    float dy = p.y - spine.x;
    float strand = dy / width;
    float dz = p.z - spine.y - .09 * sin(strand * 2.5 + p.x * 3.1);
    float taper = exp(-pow(abs(p.x) / (branch > .5 ? 1.20 : 1.36), 8.0));
    float body = exp(-strand * strand * 1.2 - dz * dz * 28.0);
    float edge = exp(-pow((abs(strand) - .86 - .20 * sin(p.x * 7.0 + broad * 7.0)) * 6.0, 2.0) - dz * dz * 38.0);
    float grain = smoothstep(.23, .70, detail) * (.35 + broad);
    float folds = pow(max(0.0, 1.0 - abs(detail - .49) * 4.0), 4.0);
    float rift = exp(-pow((dy - .045 * sin(p.x * 7.0 + broad * 3.0)) / .037, 2.0));
    float density = (body * (.065 + grain * 1.35) * (1.0 - rift * .89) + edge * folds * .45) * taper;
    vec3 tint = mix(vec3(.19, .075, .40), vec3(.045, .29, .38), smoothstep(-.7, .9, p.x + branch * .85));
    tint = mix(tint, vec3(.35, .30, .52), edge * .30);
    return vec4(tint, density * mix(1.0, .74, branch));
  }
  void main() {
    vec4 view = uProjectionInverse * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 rd = normalize(mat3(uCameraWorld) * (view.xyz / view.w));
    vec3 ro = uCameraWorld[3].xyz / ${NEBULA_SCALE.toFixed(1)};
    float b = dot(ro, rd), c = dot(ro, ro) - 3.61, discriminant = b * b - c;
    vec3 color = vec3(.0013, .0024, .007);
    if (discriminant > 0.0) {
      float nearT = max(0.0, -b - sqrt(discriminant)), farT = -b + sqrt(discriminant);
      float stepSize = (farT - nearT) / 52.0;
      float jitter = hash(vec3(gl_FragCoord.xy, .73));
      float transmittance = 1.0;
      for (int i = 0; i < 52; i++) {
        vec3 p = veilFrame(ro + rd * (nearT + (float(i) + jitter) * stepSize));
        vec3 drift = vec3(uTime * .0008, -uTime * .0003, uTime * .0004);
        float broad = fbm(p * vec3(3.0, 6.0, 4.0) + drift + vec3(8.3, 2.1, 4.7));
        vec3 warped = p + (broad - .46) * vec3(.035, .20, .24);
        float detail = fbm(warped * vec3(6.0, 22.0, 13.0) + drift + vec3(1.2, 9.1, 4.6));
        vec4 mainVeil = cloud(warped, 0.0, broad, detail), branch = cloud(warped, 1.0, broad, detail);
        float mass = mainVeil.a + branch.a;
        float density = mass * (.20 + smoothstep(.28, .65, broad) * 1.25);
        vec3 emission = (mainVeil.rgb * mainVeil.a + branch.rgb * branch.a) / max(.001, mass);
        float alpha = 1.0 - exp(-density * stepSize * 3.8);
        color += transmittance * emission * alpha * 1.65;
        transmittance *= 1.0 - alpha * .87;
      }
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** 体积计算限制在小纹理，4K 窗口仍保留清晰的独立节点渲染。 */
export function createNebulaAtmosphere(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const geometry = new THREE.PlaneGeometry(2, 2), screenCamera = new THREE.Camera();
  const volumeMaterial = new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT,
    uniforms: { uCameraWorld: { value: camera.matrixWorld }, uProjectionInverse: { value: camera.projectionMatrixInverse }, uTime: { value: 0 } },
    depthTest: false, depthWrite: false,
  });
  const volumeScene = new THREE.Scene(), displayScene = new THREE.Scene();
  volumeScene.add(new THREE.Mesh(geometry, volumeMaterial));
  const displayMaterial = new THREE.MeshBasicMaterial({ map: target.texture, depthTest: false, depthWrite: false, toneMapped: false });
  const displayQuad = new THREE.Mesh(geometry, displayMaterial);
  // 直接使用裁剪坐标，背景跟随相机方向而不随窗口尺寸失真。
  displayMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", "gl_Position = vec4(position.xy, 0.999, 1.0);");
  };
  displayQuad.frustumCulled = false; displayScene.add(displayQuad);
  const lastCamera = new THREE.Matrix4(), lastProjection = new THREE.Matrix4();
  let dirty = true, lastTime = -1;
  return {
    resize(width: number, height: number) {
      const scale = Math.min(.65, 960 / Math.max(1, width), 640 / Math.max(1, height));
      target.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))); dirty = true;
    },
    render(time: number) {
      camera.updateMatrixWorld();
      const moved = !lastCamera.equals(camera.matrixWorld) || !lastProjection.equals(camera.projectionMatrix);
      if (dirty || moved || time - lastTime > .10) {
        volumeMaterial.uniforms.uTime.value = time;
        renderer.setRenderTarget(target); renderer.clear(); renderer.render(volumeScene, screenCamera); renderer.setRenderTarget(null);
        lastCamera.copy(camera.matrixWorld); lastProjection.copy(camera.projectionMatrix); lastTime = time; dirty = false;
      }
      renderer.clear(); renderer.render(displayScene, screenCamera);
    },
    dispose() { target.dispose(); geometry.dispose(); volumeMaterial.dispose(); displayMaterial.dispose(); },
  };
}
