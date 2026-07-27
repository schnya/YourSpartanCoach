import assert from "node:assert";
import {
	completeGoogleTask,
	createGoogleTask,
	getAccessToken,
} from "./googleTasks.js";

async function runGoogleTasksTests() {
	console.log("Starting Google Tasks Integration & Fallback Tests...");

	// Test 1: Missing credentials fallback
	console.log("- Test 1: Testing fallback when OAuth env vars are missing...");
	const savedId = process.env.GOOGLE_CLIENT_ID;
	process.env.GOOGLE_CLIENT_ID = ""; // Temporarily clear

	const token = await getAccessToken();
	assert.strictEqual(
		token,
		null,
		"getAccessToken should return null when env vars are missing",
	);

	const createdTask = await createGoogleTask({
		taskText: "テストタスク",
		targetStartTime: "14:00",
		targetDuration: 50,
		proofDefinition: "コード差分",
	});
	assert.strictEqual(
		createdTask,
		null,
		"createGoogleTask should return null gracefully when credentials missing",
	);

	const completed = await completeGoogleTask("test-task-id");
	assert.strictEqual(
		completed,
		false,
		"completeGoogleTask should return false gracefully when credentials missing",
	);

	process.env.GOOGLE_CLIENT_ID = savedId;

	// Test 2: Non-blocking error handling on API exception (mock invalid URL)
	console.log("- Test 2: Testing non-blocking error handling on API failure...");
	process.env.GOOGLE_CLIENT_ID = "invalid_id";
	process.env.GOOGLE_CLIENT_SECRET = "invalid_secret";
	process.env.GOOGLE_REFRESH_TOKEN = "invalid_token";

	const failedCreate = await createGoogleTask({
		taskText: "エラーモックタスク",
	});
	assert.strictEqual(
		failedCreate,
		null,
		"createGoogleTask should handle API errors gracefully without throwing",
	);

	const failedComplete = await completeGoogleTask("invalid-id");
	assert.strictEqual(
		failedComplete,
		false,
		"completeGoogleTask should handle API errors gracefully without throwing",
	);

	console.log("All Google Tasks Integration Tests Passed Successfully!");
}

runGoogleTasksTests().catch((err) => {
	console.error("Google Tasks test execution failed:", err);
	process.exit(1);
});
