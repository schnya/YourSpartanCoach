import assert from "node:assert";
import { extractUncompletedTasks } from "./dailyLogStore.js";

function runDailyLogStoreTests() {
	console.log("Starting DailyLogStore Tests...");

	// Test 1: Normal extraction
	console.log("- Test 1: extractUncompletedTasks - normal extraction...");
	const sampleLog = `# Daily Log: 2026-07-28

## Scheduled Tasks
- Read 10 pages of book
- Exercise 30 mins
- (Completed) Morning run
- (None)

## Status Updates
- Feel great
`;

	const tasks = extractUncompletedTasks(sampleLog);
	assert.deepStrictEqual(tasks, ["Read 10 pages of book", "Exercise 30 mins"]);

	// Test 2: Empty log
	console.log("- Test 2: extractUncompletedTasks - empty log...");
	const emptyTasks = extractUncompletedTasks("");
	assert.deepStrictEqual(emptyTasks, []);

	console.log("All DailyLogStore Tests Passed Successfully!");
}

runDailyLogStoreTests();
