import { Static, Type } from "@sinclair/typebox";

export const HealthCheckItemSchema = Type.Object({
  name: Type.String(),
  status: Type.Union([Type.Literal("ok"), Type.Literal("failed")]),
});

export const HealthResponseSchema = Type.Object({
  status: Type.Union([Type.Literal("ok"), Type.Literal("degraded")]),
  checks: Type.Array(HealthCheckItemSchema),
});

export type HealthResponseSchemaDTO = Static<typeof HealthResponseSchema>;
