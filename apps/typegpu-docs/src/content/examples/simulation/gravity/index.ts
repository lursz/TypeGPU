import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { add, dot, max, mul, normalize, pow, sub } from 'typegpu/std';
import * as m from 'wgpu-matrix';

const Vertex = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  uv: d.vec2f,
});
const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(Vertex, n));

const Camera = d.struct({
  position: d.vec3f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});
const bindGroupLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  texture: { texture: 'float' },
  sampler: { sampler: 'filtering' },
});
const EXT = bindGroupLayout.bound;

// Shaders
const sampleTexture = tgpu['~unstable']
  .fn([d.vec2f], d.vec4f)
  .does(/*wgsl*/ `(uv: vec2<f32>) -> vec4<f32> {
    return textureSample(EXT.texture, EXT.sampler, uv);
  }`)
  .$uses({ EXT })
  .$name('sampleShader');

const VertexOutput = {
    position: d.builtin.position,
    uv: d.vec2f,
    normals: d.vec3f,
    worldPosition: d.vec3f,
}
  
const mainVertex = tgpu['~unstable']
  .vertexFn({
    in: { position: d.vec4f, normal: d.vec3f, uv: d.vec2f },
    out: VertexOutput,
  })
  .does((input) => {
    const camera = EXT.camera.value;
    const worldPosition = input.position;
    const relativeToCamera = mul(camera.view, worldPosition);

    return {
      position: mul(camera.projection, relativeToCamera),
      uv: input.uv,
      normals: input.normal,
      worldPosition: worldPosition.xyz,
    };
  })
  .$name('mainVertex');

const lightPosition = d.vec3f(3.0, 3.0, 2.5);
const lightDirection = normalize(d.vec3f(2.0, 1.0, 0.5));
const mainFragment = tgpu['~unstable']
  .fragmentFn({
    in: VertexOutput,
    out: d.vec4f,
  })
  .does((input) => {
    const normal = normalize(input.normals);
    // Directional lighting
    const directionalLightIntensity = max(dot(normal, lightDirection), 0.0);
    const directionalComponent = 0.4 * directionalLightIntensity;

    // Point Lighting
    const surfaceToLight = normalize(sub(lightPosition, input.worldPosition)); 
    const pointLightIntensity = max(dot(normal, surfaceToLight), 0.0);
    const pointComponent = 0.6 * pointLightIntensity;

    const lighting = directionalComponent + pointComponent;
    const albedo = d.vec3f(1.0, 1.0, 1.0); // base color

    const cameraPos = EXT.camera.value.position;
    const surfaceToCamera = normalize(sub(EXT.camera.value.position, input.worldPosition));

    const halfVector = normalize(add(surfaceToLight, surfaceToCamera));
    const specular = pow(max(dot(normal, halfVector), 0.0), 3);
    return d.vec4f(albedo.x * lighting  * specular, albedo.y * lighting * specular, albedo.z * lighting * specular, 1);
    // return d.vec4f(specular,specular,specular, 1);

  })
  .$name('mainFragment');

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const root = await tgpu.init();
const device = root.device;
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const cubeModel = await load('assets/gravity/cube_blend.obj', OBJLoader);
const textureResponse = await fetch('assets/gravity/cube_texture.png');
const imageBitmap = await createImageBitmap(await textureResponse.blob());
const cubeTexture = root['~unstable']
  .createTexture({
    size: [imageBitmap.width, imageBitmap.height],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');

device.queue.copyExternalImageToTexture(
  { source: imageBitmap },
  { texture: root.unwrap(cubeTexture) },
  [imageBitmap.width, imageBitmap.height],
);
console.log(cubeModel.attributes);

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Cameraff
const target = d.vec3f(0, 0, 0);
const cameraInitialPos = d.vec4f(5, 2, 5, 1);
const cameraInitial = Camera({
  position: cameraInitialPos.xyz,
  view: m.mat4.lookAt(cameraInitialPos, target, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(
    Math.PI / 4,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000,
    d.mat4x4f(),
  ),
});
const cameraBuffer = root.createBuffer(Camera, cameraInitial).$usage('uniform');

const bindGroup = root.createBindGroup(bindGroupLayout, {
  camera: cameraBuffer,
  texture: cubeTexture,
  sampler,
});

// Vertex
const vertexBuffer = root
  .createBuffer(
    vertexLayout.schemaForCount(cubeModel.attributes.POSITION.value.length / 3),
  )
  .$usage('vertex')
  .$name('vertex');

const positions = cubeModel.attributes.POSITION.value;
const normals = cubeModel.attributes.NORMAL
  ? cubeModel.attributes.NORMAL.value
  : new Float32Array(positions.length);
const uvs = cubeModel.attributes.TEXCOORD_0
  ? cubeModel.attributes.TEXCOORD_0.value
  : new Float32Array((positions.length / 3) * 2);

const vertices = [];
for (let i = 0; i < positions.length / 3; i++) {
  vertices.push({
    position: d.vec3f(
      positions[3 * i],
      positions[3 * i + 1],
      positions[3 * i + 2],
    ),
    normal: d.vec3f(normals[3 * i], normals[3 * i + 1], normals[3 * i + 2]),
    uv: d.vec2f(uvs[2 * i], 1 - uvs[2 * i + 1]),
  });
}

vertexBuffer.write(vertices);

// Render pipeline
const renderPipeline = root['~unstable']
  .withVertex(mainVertex, vertexLayout.attrib)
  .withFragment(mainFragment, { format: presentationFormat })
  .withPrimitive({ topology: 'triangle-list', cullMode: 'back' })
  .createPipeline();

function render() {
  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
      clearValue: [1, 1, 1, 1],
    })
    .with(vertexLayout, vertexBuffer)
    .with(bindGroupLayout, bindGroup)
    .draw(36);

  root['~unstable'].flush();
}
console.log('Cube position:', await vertexBuffer.read());

let destroyed = false;
function frame() {
  if (destroyed) {
    return;
  }
  requestAnimationFrame(frame);
  render();
}

// #region Camera controls

// Variables for mouse interaction.
let isDragging = false;
let prevX = 0;
let prevY = 0;
let isRightDragging = false;
let rightPrevX = 0;
let rightPrevY = 0;
let orbitRadius = Math.sqrt(
  cameraInitialPos.x * cameraInitialPos.x +
    cameraInitialPos.y * cameraInitialPos.y +
    cameraInitialPos.z * cameraInitialPos.z,
);

// Yaw and pitch angles facing the origin.
let orbitYaw = Math.atan2(cameraInitialPos.x, cameraInitialPos.z);
let orbitPitch = Math.asin(cameraInitialPos.y / orbitRadius);

// Helper functions for updating transforms.
function updateCubesRotation(dx: number, dy: number) {
  const sensitivity = 0.003;
  const yaw = -dx * sensitivity;
  const pitch = -dy * sensitivity;
}

function updateCameraOrbit(dx: number, dy: number) {
  const orbitSensitivity = 0.01;
  orbitYaw += -dx * orbitSensitivity;
  orbitPitch += -dy * orbitSensitivity;
  // if we don't limit pitch, it would lead to flipping the camera which is disorienting.
  const maxPitch = Math.PI / 2 - 0.01;
  if (orbitPitch > maxPitch) orbitPitch = maxPitch;
  if (orbitPitch < -maxPitch) orbitPitch = -maxPitch;
  // basically converting spherical coordinates to cartesian.
  // like sampling points on a unit sphere and then scaling them by the radius.
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = -orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);

  const newView = m.mat4.lookAt(
    newCameraPos,
    target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.write({position:newCameraPos.xyz, view: newView, projection: cameraInitial.projection });
}

canvas.addEventListener('wheel', (event: WheelEvent) => {
  event.preventDefault();
  const zoomSensitivity = 0.05;
  orbitRadius = Math.max(1, orbitRadius + event.deltaY * zoomSensitivity);
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);
  const newView = m.mat4.lookAt(
    newCameraPos,
    target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.write({position:newCameraPos.xyz, view: newView, projection: cameraInitial.projection });
});

canvas.addEventListener('mousedown', (event) => {
  if (event.button === 0) {
    // Left Mouse Button controls Camera Orbit.
    isRightDragging = true;
    rightPrevX = event.clientX;
    rightPrevY = event.clientY;
  } else if (event.button === 2) {
    // Right Mouse Button controls Cube Rotation.
    isDragging = true;
    prevX = event.clientX;
    prevY = event.clientY;
  }
});

canvas.addEventListener('mouseup', (event) => {
  if (event.button === 0) {
    isRightDragging = false;
  } else if (event.button === 2) {
    isDragging = false;
  }
});

canvas.addEventListener('mousemove', (event) => {
  if (isDragging) {
    const dx = event.clientX - prevX;
    const dy = event.clientY - prevY;
    prevX = event.clientX;
    prevY = event.clientY;
    updateCubesRotation(dx, dy);
  }
  if (isRightDragging) {
    const dx = event.clientX - rightPrevX;
    const dy = event.clientY - rightPrevY;
    rightPrevX = event.clientX;
    rightPrevY = event.clientY;
    updateCameraOrbit(dx, dy);
  }
});

// Mobile touch support.
canvas.addEventListener('touchstart', (event: TouchEvent) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    // Single touch controls Camera Orbit.
    isRightDragging = true;
    rightPrevX = event.touches[0].clientX;
    rightPrevY = event.touches[0].clientY;
  } else if (event.touches.length === 2) {
    // Two-finger touch controls Cube Rotation.
    isDragging = true;
    // Use the first touch for rotation.
    prevX = event.touches[0].clientX;
    prevY = event.touches[0].clientY;
  }
});

canvas.addEventListener('touchmove', (event: TouchEvent) => {
  event.preventDefault();
  if (isRightDragging && event.touches.length === 1) {
    const touch = event.touches[0];
    const dx = touch.clientX - rightPrevX;
    const dy = touch.clientY - rightPrevY;
    rightPrevX = touch.clientX;
    rightPrevY = touch.clientY;
    updateCameraOrbit(dx, dy);
  }
  if (isDragging && event.touches.length === 2) {
    const touch = event.touches[0];
    const dx = touch.clientX - prevX;
    const dy = touch.clientY - prevY;
    prevX = touch.clientX;
    prevY = touch.clientY;
    updateCubesRotation(dx, dy);
  }
});

canvas.addEventListener('touchend', (event: TouchEvent) => {
  event.preventDefault();
  if (event.touches.length === 0) {
    isRightDragging = false;
    isDragging = false;
  }
});

frame();

export function onCleanup() {
  destroyed = true;
  root.destroy();
}
