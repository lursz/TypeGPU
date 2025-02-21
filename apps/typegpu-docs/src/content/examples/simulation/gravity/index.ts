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

const vertex = d.struct({
  position: d.location(0, d.vec3f),
  normal: d.location(1, d.vec3f),
  uv: d.location(2, d.vec2f),
});


const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(vertex, n));
const vertexBuffer = root.createBuffer(
  vertexLayout.schemaForCount(cubeModel.attributes['POSITION'].size / 3)
)
.$usage('vertex')
.$name('vertex');

// Shaders - vertex shader to build cube and fragment shader to color it


// Render pipeline