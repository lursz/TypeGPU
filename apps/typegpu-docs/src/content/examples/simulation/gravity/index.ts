import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';

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
vertexBuffer.write([{ position: d.vec3f(0, 1, 2), normal: d.vec3f(0, 0, 0), uv: d.vec2f(0, 0) }]);

// Shaders
const mainVertex = tgpu['~unstable']
  .vertexFn({
    in: { position: d.vec3f, normal: d.vec3f, uv: d.vec2f },
    out: { position: d.builtin.position, color: d.vec4f },
  })
  .does((input) => {
    return {
      position: d.vec4f(input.position.x, input.position.y, input.position.z - 2, 1),
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
  .createPipeline();

setTimeout(() => {
  renderPipeline
    .withColorAttachment({ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 0, 0, 1] })
    .with(vertexLayout, vertexBuffer)
    .draw(36);

  root['~unstable'].flush();
  root.destroy();
}, 200);
