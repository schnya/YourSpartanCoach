import { getRedisClient } from "./redisClient.js";

// 新モデル: 2状態FSM
//  ACTIVE: 60分おきの進捗確認ループが稼働中（ユーザーが応答中 / タスク増減あり）
//  IDLE:   日の始まり / LINE未確認ステータス（push停止中）
type FsmState = "IDLE" | "ACTIVE";

interface FsmStateData {
	state: FsmState;
	metadata?: {
		// 朝スナップショット: 当日のGoogle Tasks ID群（差分検知用）
		taskSnapshot?: string[];
		// 日中のタスク増減（新規追加＋完了）があったか
		tasksChangedToday?: boolean;
		// 日中にユーザーからLINE返信があったか
		repliedToday?: boolean;
		// 最後に進捗確認メッセージをpushした時刻（ISO文字列）
		lastProgressPushAt?: string;
		// 最後にユーザーからLINE返信があった時刻（ISO文字列）
		lastUserReplyAt?: string;
		// 最後に無応答ガード付き nudge を送った時刻
		lastNudgeAt?: string;
		// 物理的延期累計（SOS②用、互換維持）
		physicalPostponeCount?: number;
		// 直近のGoogle Tasks一覧キャッシュ（進捗メッセージ用）
		currentTaskSnapshot?: string[];
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

export async function getMomentumScore(userId: string): Promise<number> {
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
	const current = await getMomentumScore(userId);
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
