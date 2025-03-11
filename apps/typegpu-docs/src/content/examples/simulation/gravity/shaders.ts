import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { add, dot, max, mul, normalize, pow, sub } from 'typegpu/std';
import { EXT } from '.';

const VertexOutput = {
    position: d.builtin.position,
    uv: d.vec2f,
    normals: d.vec3f,
    worldPosition: d.vec3f,
}
const lightPosition = d.vec3f(3.0, 3.0, 2.5);
const lightDirection = normalize(d.vec3f(2.0, 1.0, 0.5));


export const mainVertex = tgpu['~unstable']
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



export const mainFragment = tgpu['~unstable']
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




const sampleTexture = tgpu['~unstable']
    .fn([d.vec2f], d.vec4f)
    .does(/*wgsl*/ `(uv: vec2<f32>) -> vec4<f32> {
        return textureSample(EXT.texture, EXT.sampler, uv);
    }`)
    .$uses({ EXT })
    .$name('sampleShader');
