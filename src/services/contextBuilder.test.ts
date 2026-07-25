import assert from "node:assert";
import {
	buildSpartanPrompt,
	formatTemplate,
} from "./contextBuilder.js";

async function runContextBuilderTests() {
	console.log("Starting Context Builder Tests...");

	// Test 1: Pure formatTemplate helper
	console.log("- Test 1: Testing formatTemplate pure interpolation...");
	const rawTemplate = "Hello {USER_NAME}, your score is {CURRENT_HP}.";
	const formatted = formatTemplate(rawTemplate, {
		USER_NAME: "AresUser",
		CURRENT_HP: 100,
	});
	assert.strictEqual(formatted, "Hello AresUser, your score is 100.");

	// Test 2: buildSpartanPrompt for MORNING state with Google Tasks injection
	console.log("- Test 2: Testing buildSpartanPrompt for MORNING state...");
	const spartanPrompt = await buildSpartanPrompt("test-user", "MORNING", [
		{ id: "t1", title: "開発50分" },
	]);
	assert.ok(spartanPrompt.includes("開発50分"));
	assert.ok(spartanPrompt.includes("Current Google Tasks"));

	// Test 3: buildSpartanPrompt for PROGRESS state
	console.log("- Test 3: Testing buildSpartanPrompt for PROGRESS state...");
	const progressPrompt = await buildSpartanPrompt("test-user", "PROGRESS", [
		{ id: "t2", title: "読書30分" },
	]);
	assert.ok(progressPrompt.includes("読書30分"));
	assert.ok(progressPrompt.includes("50-Minute Progress Check-in"));

	// Test 4: buildSpartanPrompt for EVENING state
	console.log("- Test 4: Testing buildSpartanPrompt for EVENING state...");
	const eveningPrompt = await buildSpartanPrompt("test-user", "EVENING");
	assert.ok(eveningPrompt.includes("Evening Review"));

	console.log("All Context Builder Tests Passed Successfully!");
}

runContextBuilderTests().catch((err) => {
	console.error("Context Builder test execution failed:", err);
	process.exit(1);
});
