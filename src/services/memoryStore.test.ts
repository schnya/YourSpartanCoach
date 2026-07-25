import assert from "node:assert";
import {
	checkAndMarkEventProcessed,
	getDisciplineScore,
	getUserState,
	setUserState,
	updateDisciplineScore,
} from "./memoryStore.js";

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

	// Test 2: Transition to PENDING
	console.log("- Test 2: Transitioning to PENDING...");
	await setUserState(testUserId, "PENDING");
	const statePending = await getUserState(testUserId);
	assert.strictEqual(statePending.state, "PENDING");

	// Test 3: Transition to SCHEDULED with metadata
	console.log("- Test 3: Transitioning to SCHEDULED with metadata...");
	const metadata = {
		taskText: "筋トレ30分",
		targetStartTime: "07:30",
		targetDuration: 30,
		proofDefinition: "ダンベルを持った写真",
	};
	await setUserState(testUserId, "SCHEDULED", metadata);
	const stateScheduled = await getUserState(testUserId);
	assert.strictEqual(stateScheduled.state, "SCHEDULED");
	assert.strictEqual(stateScheduled.metadata?.taskText, "筋トレ30分");
	assert.strictEqual(stateScheduled.metadata?.targetStartTime, "07:30");

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
