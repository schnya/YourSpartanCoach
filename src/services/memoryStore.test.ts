import assert from "node:assert";
import { checkAndMarkEventProcessed } from "./memory/dailyLogStore.js";
import {
	getDisciplineScore,
	getUserState,
	setUserState,
	updateDisciplineScore,
} from "./memory/fsmStore.js";

// Set environment variables for testing local fallback
process.env.UPSTASH_REDIS_REST_URL = "";
process.env.UPSTASH_REDIS_REST_TOKEN = "";

async function runTests() {
	console.log("Starting Memory Store FSM Tests...");
	const testUserId = "test_user_fsm_123";

	// Test 1: Default State is IDLE
	console.log("- Test 1: Checking default state...");
	const initialState = await getUserState(testUserId);
	assert.strictEqual(initialState.state, "IDLE");

	// Test 2: Transition to ACTIVE (morning activation)
	console.log("- Test 2: Transitioning to ACTIVE with snapshot...");
	const metadata = {
		taskSnapshot: ["task-1", "task-2"],
		tasksChangedToday: false,
		repliedToday: false,
		lastProgressPushAt: new Date().toISOString(),
	};
	await setUserState(testUserId, "ACTIVE", metadata);
	const stateActive = await getUserState(testUserId);
	assert.strictEqual(stateActive.state, "ACTIVE");
	assert.deepStrictEqual(stateActive.metadata?.taskSnapshot, ["task-1", "task-2"]);
	assert.strictEqual(stateActive.metadata?.tasksChangedToday, false);

	// Test 3: Mark task change + reply for the day
	console.log("- Test 3: Marking tasksChangedToday & repliedToday...");
	await setUserState(testUserId, "ACTIVE", {
		...stateActive.metadata,
		tasksChangedToday: true,
		repliedToday: true,
	});
	const stateUpdated = await getUserState(testUserId);
	assert.strictEqual(stateUpdated.metadata?.tasksChangedToday, true);
	assert.strictEqual(stateUpdated.metadata?.repliedToday, true);

	// Test 4: Default Discipline Score is 100
	console.log("- Test 4: Checking default discipline score...");
	const initialScore = await getDisciplineScore(testUserId);
	assert.strictEqual(initialScore, 100);

	// Test 5: Score Clamping (upper limit 100)
	console.log("- Test 5: Clamping score upper limit...");
	const scoreMax = await updateDisciplineScore(testUserId, 10);
	assert.strictEqual(scoreMax, 100);

	// Test 6: Score Clamping (lower limit 0)
	console.log("- Test 6: Clamping score lower limit...");
	await updateDisciplineScore(testUserId, -150);
	const scoreMin = await getDisciplineScore(testUserId);
	assert.strictEqual(scoreMin, 0);

	// Test 7: Score normal increment/decrement
	console.log("- Test 7: Checking normal increments...");
	await updateDisciplineScore(testUserId, 50);
	const scoreMid = await getDisciplineScore(testUserId);
	assert.strictEqual(scoreMid, 50);

	// Test 8: Idempotency local fallback
	console.log("- Test 8: Idempotency fallback when Redis is absent...");
	const processed = await checkAndMarkEventProcessed("test-event-id");
	// Without Redis, it returns false (meaning not duplicate, continues normal processing)
	assert.strictEqual(processed, false);

	console.log("All Memory Store FSM Tests Passed Successfully!");
}

runTests().catch((err) => {
	console.error("Test execution failed:", err);
	process.exit(1);
});
