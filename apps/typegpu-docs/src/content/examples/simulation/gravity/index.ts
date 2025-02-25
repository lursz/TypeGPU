import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import { mul } from 'typegpu/std';
import * as m from 'wgpu-matrix';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const root = await tgpu.init();
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const cubeModel = await load('assets/gravity/cube.obj', OBJLoader);
console.log(cubeModel.attributes);

// Camera
const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});
const target = d.vec3f(0, 0, 0);
const cameraInitialPos = d.vec4f(5, 2, 5, 1);
const cameraInitial = {
  view: m.mat4.lookAt(cameraInitialPos, target, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(Math.PI / 4, canvas.clientWidth / canvas.clientHeight, 0.1, 1000, d.mat4x4f()),
};
const cameraBuffer = root.createBuffer(Camera, cameraInitial).$usage('uniform');

const bindGroupLayout = tgpu.bindGroupLayout({ camera: { uniform: Camera } });
const { camera } = bindGroupLayout.bound;

const bindGroup = root.createBindGroup(bindGroupLayout, { camera: cameraBuffer });

// Vertex struct
const Vertex = d.struct({
  position: d.location(0, d.vec3f),
  normal: d.location(1, d.vec3f),
  uv: d.location(2, d.vec2f),
});

const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(Vertex, n));
const vertexBuffer = root.createBuffer(
  vertexLayout.schemaForCount(cubeModel.attributes['POSITION'].value.length / 3)
)
  .$usage('vertex')
  .$name('vertex');

const positions = cubeModel.attributes['POSITION'].value;
const normals = cubeModel.attributes['NORMAL'] ? cubeModel.attributes['NORMAL'].value : new Float32Array(positions.length);
const uvs = cubeModel.attributes['TEXCOORD'] ? cubeModel.attributes['TEXCOORD'].value : new Float32Array((positions.length / 3) * 2);

const vertices = [];
for (let i = 0; i < positions.length / 3; i++) {
  vertices.push({
    position: d.vec3f(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]),
    normal: d.vec3f(normals[3 * i], normals[3 * i + 1], normals[3 * i + 2]),
    uv: d.vec2f(uvs[2 * i], uvs[2 * i + 1]),
  });
}

vertexBuffer.write(vertices);

// Shaders
const mainVertex = tgpu['~unstable']
  .vertexFn({
    in: { position: d.vec4f, normal: d.vec3f, uv: d.vec2f },
    out: { position: d.builtin.position },
  })
  .does((input) => {
    const pos = mul(
      camera.value.projection,
      mul(camera.value.view, input.position),
    );

    return {
      position: pos,
    };
  })
  .$name('mainVertex');

const mainFragment = tgpu['~unstable']
  .fragmentFn({
    out: d.location(0, d.vec4f),
  })
  .does(() => d.vec4f(1, 0, 0, 1))
  .$name('mainFragment');

// Render pipeline
const renderPipeline = root['~unstable']
  .withVertex(mainVertex, vertexLayout.attrib)
  .withFragment(mainFragment, { format: presentationFormat })
  .withPrimitive({ topology: 'triangle-list' })
  .createPipeline();

function render() {
  renderPipeline
    .withColorAttachment({ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] })
    .with(vertexLayout, vertexBuffer)
    .with(bindGroupLayout, bindGroup)
    .draw(36);

  root['~unstable'].flush();
}
console.log('Cube position:', await vertexBuffer.read())

let destoyed = false;
function frame() {
  if (destoyed) {
    return;
  }
  requestAnimationFrame(frame);
  render();
}



let isDragging = false;
let prevX = 0;
let prevY = 0;
let rotation = m.mat4.identity(d.mat4x4f());

canvas.addEventListener('mousedown', (event) => {
  isDragging = true;
  prevX = event.clientX;
  prevY = event.clientY;
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
});

canvas.addEventListener('mousemove', (event) => {
  if (!isDragging) {
    return;
  }

  const dx = event.clientX - prevX;
  const dy = event.clientY - prevY;
  prevX = event.clientX;
  prevY = event.clientY;
  const sensitivity = 0.003;
  const yaw = -dx * sensitivity;
  const pitch = -dy * sensitivity;

  const yawMatrix = m.mat4.rotateY(
    m.mat4.identity(d.mat4x4f()),
    yaw,
    d.mat4x4f(),
  );
  const pitchMatrix = m.mat4.rotateX(
    m.mat4.identity(d.mat4x4f()),
    pitch,
    d.mat4x4f(),
  );

  const deltaRotation = m.mat4.mul(yawMatrix, pitchMatrix, d.mat4x4f());
  rotation = m.mat4.mul(deltaRotation, rotation, d.mat4x4f());

  const rotatedCamPos = m.mat4.mul(rotation, cameraInitialPos, d.vec4f());
  const newView = m.mat4.lookAt(
    rotatedCamPos,
    target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );

  cameraBuffer.writePartial({
    view: newView,
  });
});

frame();

export function onCleanup() {
  destoyed = true;
  root.destroy();
}
