import type { z } from "zod";
import * as S from "./schemas.js";

export * from "./schemas.js";
export * from "./interfaces.js";
export * from "./summarize.js";
export { newId, isoString } from "./ids.js";

export type Session = z.infer<typeof S.sessionSchema>;
export type SessionPublic = z.infer<typeof S.sessionPublicSchema>;
export type SessionStatus = z.infer<typeof S.sessionStatusSchema>;
export type Event = z.infer<typeof S.eventSchema>;
export type EventType = Event["type"];
export type SessionSummary = z.infer<typeof S.sessionSummarySchema>;
export type SummaryStats = z.infer<typeof S.summaryStatsSchema>;
export type Insight = z.infer<typeof S.insightSchema>;
export type ApiKey = z.infer<typeof S.apiKeySchema>;
export type ApiKeyPublic = z.infer<typeof S.apiKeyPublicSchema>;
export type ApiKeyScope = z.infer<typeof S.apiKeyScopeSchema>;
export type Lesson = z.infer<typeof S.lessonSchema>;
export type Overview = z.infer<typeof S.overviewSchema>;
export type CreateSessionRequest = z.infer<typeof S.createSessionRequestSchema>;
export type CreateKeyRequest = z.infer<typeof S.createKeyRequestSchema>;
export type SummarizeRequest = z.infer<typeof S.summarizeRequestSchema>;
export type StoreSummaryRequest = z.infer<typeof S.storeSummaryRequestSchema>;
