import assert from "node:assert";
import { buildSpartanPrompt } from "./contextBuilder.js";
import {
	MASTER_SYSTEM_PROMPT,
	SUB_PROMPT_MORNING,
	SUB_PROMPT_PENALTY,
	SUB_PROMPT_PROOF,
	SUB_PROMPT_SCHEDULED,
} from "./spartanPrompts.js";

async function runPromptTests() {
	console.log("Starting Spartan Prompts & Non-Chase Policy Tests...");

	// Test 1: MASTER_SYSTEM_PROMPT includes Rule 6 Non-Chase Policy
	console.log("- Test 1: Master prompt contains Rule 6 Non-Chase Policy...");
	assert.ok(
		MASTER_SYSTEM_PROMPT.includes("6. Non-Chase Policy"),
		"MASTER_SYSTEM_PROMPT must include Rule 6 Non-Chase Policy",
	);

	// Test 2: SUB_PROMPT_MORNING includes 50-minute block unit & Non-chase rule
	console.log("- Test 2: Morning sub-prompt contains 50-minute block unit & Non-chase rule...");
	assert.ok(
		SUB_PROMPT_MORNING.includes("50-minute block unit"),
		"SUB_PROMPT_MORNING must mention 50-minute block unit",
	);
	assert.ok(
		SUB_PROMPT_MORNING.includes("Non-chase rule"),
		"SUB_PROMPT_MORNING must include Non-chase rule",
	);

	// Test 3: SUB_PROMPT_SCHEDULED contains Non-chase policy and start check
	console.log("- Test 3: Scheduled sub-prompt contains Non-chase policy...");
	assert.ok(
		SUB_PROMPT_SCHEDULED.includes("Non-chase Policy"),
		"SUB_PROMPT_SCHEDULED must mention Non-chase Policy",
	);
	assert.ok(
		SUB_PROMPT_SCHEDULED.includes("Silent Logging"),
		"SUB_PROMPT_SCHEDULED must include Silent Logging directive",
	);

	// Test 4: SUB_PROMPT_PROOF includes Non-chase policy
	console.log("- Test 4: Proof sub-prompt contains Non-chase policy...");
	assert.ok(
		SUB_PROMPT_PROOF.includes("Non-chase Policy"),
		"SUB_PROMPT_PROOF must include Non-chase Policy",
	);

	// Test 5: SUB_PROMPT_PENALTY matches ESCAPED state context
	console.log("- Test 5: Penalty sub-prompt contains failure execution directives...");
	assert.ok(
		SUB_PROMPT_PENALTY.includes("Task Failure / Commitment Breach"),
		"SUB_PROMPT_PENALTY must match Task Failure context",
	);

	// Test 6: buildSpartanPrompt correctly injects SUB_PROMPT_SCHEDULED for SCHEDULED state
	console.log("- Test 6: buildSpartanPrompt generates prompt for SCHEDULED state...");
	const prompt = await buildSpartanPrompt("test_user_prompt", "SCHEDULED", {
		taskText: "50分読書",
		targetStartTime: "08:00",
	});
	assert.ok(prompt.includes("50分読書"), "Prompt should contain task text");
	assert.ok(prompt.includes("08:00"), "Prompt should contain start time");
	assert.ok(
		prompt.includes("Non-chase Policy"),
		"Prompt should include SCHEDULED sub-prompt content",
	);

	console.log("All Spartan Prompts & Non-Chase Policy Tests Passed Successfully!");
}

runPromptTests().catch((err) => {
	console.error("Test execution failed:", err);
	process.exit(1);
});
