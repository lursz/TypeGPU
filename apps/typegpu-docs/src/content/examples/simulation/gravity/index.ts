import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import { mul } from 'typegpu/std';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const root = await tgpu.init();
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const cubeModel = await load('cube.obj', OBJLoader);
console.log(cubeModel.attributes);

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
    in: { position: d.vec3f, normal: d.vec3f, uv: d.vec2f },
    out: { position: d.builtin.position, color: d.vec4f },
  })
  .does((input) => {
    const pos = mul(0.1, input.position);

    return {
      position: d.vec4f(pos.x, pos.y, pos.z, 1),
      color: d.vec4f(1, 0, 0, 1),
    };
  })
  .$name('mainVertex');

const mainFragment = tgpu['~unstable']
  .fragmentFn({
    in: { color: d.vec4f },
    out: d.location(0, d.vec4f),
  })
  .does((input) => {
    return input.color;
  })
  .$name('mainFragment');

// Render pipeline
const renderPipeline = root['~unstable']
  .withVertex(mainVertex, vertexLayout.attrib)
  .withFragment(mainFragment, { format: presentationFormat })
  .withPrimitive({ topology: 'triangle-list' })
  .createPipeline();


renderPipeline
  .withColorAttachment({ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 0, 1] })
  .with(vertexLayout, vertexBuffer)
  .draw(36);

// debug
console.log('Cube position:', await vertexBuffer.read())

root['~unstable'].flush();
export function onCleanup() {
  root.destroy();
}
