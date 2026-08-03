import assert from "node:assert";
import { buildSpartanPrompt } from "./contextBuilder.js";
import { MASTER_SYSTEM_PROMPT, SAFETY_GUARDRAILS, SUB_PROMPT_HABIT_LOOP, SUB_PROMPT_MORNING } from "./spartanPrompts.js";

async function runPromptTests() {
	console.log("Starting Spartan Prompts Tests...");

	// Test 1: MASTER_SYSTEM_PROMPT includes Rule 5 Non-Chase Policy
	console.log("- Test 1: Master prompt contains Rule 5 Non-Chase Policy...");
	assert.ok(
		MASTER_SYSTEM_PROMPT.includes("5. Non-Chase Policy"),
		"MASTER_SYSTEM_PROMPT must include Rule 5 Non-Chase Policy",
	);

	// Test 2: habit-formation baseline and safety rules are present.
	console.log("- Test 2: Master prompt contains compassionate habit rules...");
	assert.ok(MASTER_SYSTEM_PROMPT.includes("Momentum"));
	assert.ok(MASTER_SYSTEM_PROMPT.includes("{{MOMENTUM_SCORE}}"));
	assert.ok(!MASTER_SYSTEM_PROMPT.includes("鬼軍曹"));
	assert.ok(SUB_PROMPT_HABIT_LOOP.includes("4-Step Loop"));
	assert.ok(SAFETY_GUARDRAILS.includes("診断"));

	// Test 3: SUB_PROMPT_MORNING contains Non-chase rule
	console.log("- Test 3: Morning sub-prompt contains Non-chase rule...");
	assert.ok(
		SUB_PROMPT_MORNING.includes("Non-chase rule"),
		"SUB_PROMPT_MORNING must include Non-chase rule",
	);

	// Test 6: buildSpartanPrompt generates prompt for MORNING state
	console.log(
		"- Test 6: buildSpartanPrompt generates prompt for MORNING state...",
	);
	const prompt = await buildSpartanPrompt("test_user_prompt", "MORNING", [
		{ id: "1", title: "タスクA" },
	]);
	assert.ok(prompt.includes("タスクA"), "Prompt should contain task text");

	console.log("All Spartan Prompts Tests Passed Successfully!");
}

runPromptTests().catch((err) => {
	console.error("Test execution failed:", err);
	process.exit(1);
});
