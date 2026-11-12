/** 青穗集 · 积分价格配置：服务入口与管理命令复用同一份官方环境配置。 */
import type { PointsConfig } from "./relay-points.js";
export function pointsConfigFromEnv(env: NodeJS.ProcessEnv): PointsConfig {
  return {
    pointsEnabled: env.RELAY_POINTS_ENABLED === "true",
    dailyPoints: Number(env.RELAY_DAILY_POINTS ?? 2300),
    pointsVersion: env.RELAY_POINTS_VERSION?.trim() || "2026-10-v1",
    pointsInputRate: Number(env.RELAY_POINTS_INPUT_MICROS_PER_TOKEN ?? 10000),
    pointsCachedRate: Number(env.RELAY_POINTS_CACHED_MICROS_PER_TOKEN ?? 2500),
    pointsOutputRate: Number(env.RELAY_POINTS_OUTPUT_MICROS_PER_TOKEN ?? 40000),
    pointsImageRate: Number(env.RELAY_POINTS_IMAGE_MICROS ?? 200000000),
  };
}
