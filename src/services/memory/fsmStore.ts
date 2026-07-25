import { getRedisClient } from "./redisClient.js";

export type FsmState =
	| "IDLE"
	| "PENDING"
	| "SCHEDULED"
	| "EXECUTING"
	| "REPORTING"
	| "ESCAPED";

export interface FsmStateData {
	state: FsmState;
	metadata?: {
		taskText?: string;
		targetStartTime?: string; // format: "20:00"
		targetDuration?: number; // in minutes
		proofDefinition?: string;
		targetDateStr?: string;
		warningSent?: boolean;
		reportingDeadline?: string; // ISO String
		silentEscapedReason?: string;
		slicedTask?: boolean;
		physicalPostponeCount?: number;
		googleTaskId?: string;
	};
}

const localStateCache = new Map<string, FsmStateData>();

export async function getUserState(userId: string): Promise<FsmStateData> {
	const redis = getRedisClient();
	if (redis) {
		try {
			const data = await redis.get<FsmStateData>(`user:${userId}:state`);
			if (data) return data;
		} catch (err) {
			console.error("[Redis Get State Error]:", err);
		}
	}

	return localStateCache.get(userId) || { state: "IDLE" };
}

export async function setUserState(
	userId: string,
	state: FsmState,
	metadata?: FsmStateData["metadata"],
): Promise<void> {
	const data: FsmStateData = { state, metadata };
	localStateCache.set(userId, data);

	const redis = getRedisClient();
	if (redis) {
		try {
			await redis.set(`user:${userId}:state`, JSON.stringify(data));
		} catch (err) {
			console.error("[Redis Set State Error]:", err);
		}
	}
}

const DEFAULT_DISCIPLINE_SCORE = 100;
const localScoreCache = new Map<string, number>();

export async function getDisciplineScore(userId: string): Promise<number> {
	const redis = getRedisClient();
	if (redis) {
		try {
			const val = await redis.get<number>(`user:${userId}:score`);
			if (val !== null && val !== undefined) return val;
		} catch (err) {
			console.error("[Redis Get Score Error]:", err);
		}
	}

	return localScoreCache.get(userId) ?? DEFAULT_DISCIPLINE_SCORE;
}

export async function updateDisciplineScore(
	userId: string,
	delta: number,
): Promise<number> {
	const current = await getDisciplineScore(userId);
	const updated = Math.max(0, Math.min(100, current + delta));
	localScoreCache.set(userId, updated);

	const redis = getRedisClient();
	if (redis) {
		try {
			await redis.set(`user:${userId}:score`, updated);
		} catch (err) {
			console.error("[Redis Update Score Error]:", err);
		}
	}

	return updated;
}
