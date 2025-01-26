import tgpu, { type TgpuFn } from "typegpu";
import {
	vec2f,
	vec3f,
	f32,
	type Vec3f,
	type F32,
	type Vec2f,
} from "typegpu/data";
import { sin, cos, dot, mul } from "typegpu/std";
import { randomGeneratorSlot } from "./generator.js";

/**
 * @typedef {import('typegpu/data').Vec3f} Vec3f
 */

const TWO_PI = Math.PI * 2;

// TODO: Contribute back to typegpu/std
const sqrt = tgpu["~unstable"].fn([f32], f32).does(`(value: f32) -> f32 {
  return sqrt(value);
}`);

// TODO: Contribute back to typegpu/std
const sign = tgpu["~unstable"].fn([f32], f32).does(`(value: f32) -> f32 {
  return sign(value);
}`);

export const randFloat01: TgpuFn<[], F32> = tgpu["~unstable"]
	.fn([], f32)
	.does(() => {
		return randomGeneratorSlot.value();
	});

export const randInUnitCube: TgpuFn<[], Vec3f> = tgpu["~unstable"]
	.fn([], vec3f)
	.does(() => {
		return vec3f(
			randomGeneratorSlot.value() * 2 - 1,
			randomGeneratorSlot.value() * 2 - 1,
			randomGeneratorSlot.value() * 2 - 1,
		);
	});

export const randInUnitCircle: TgpuFn<[], Vec2f> = tgpu["~unstable"]
	.fn([], vec2f)
	.does(() => {
		const radius = sqrt(randomGeneratorSlot.value());
		const angle = randomGeneratorSlot.value() * TWO_PI;

		return vec2f(cos(angle) * radius, sin(angle) * radius);
	});

export const randOnUnitSphere: TgpuFn<[], Vec3f> = tgpu["~unstable"]
	.fn([], vec3f)
	.does(() => {
		const z = 2 * randomGeneratorSlot.value() - 1;
		const oneMinusZSq = sqrt(1 - z * z);
		// TODO: Work out if the -Math.PI offset is necessary
		const theta = TWO_PI * randomGeneratorSlot.value() - Math.PI;
		const x = sin(theta) * oneMinusZSq;
		const y = cos(theta) * oneMinusZSq;
		return vec3f(x, y, z);
	});

export const randOnUnitHemisphere: TgpuFn<[normal: Vec3f], Vec3f> = tgpu[
	"~unstable"
]
	.fn([vec3f], vec3f)
	.does((normal) => {
		const value = randOnUnitSphere();
		const alignment = dot(normal, value);

		return mul(sign(alignment), value);
	});
