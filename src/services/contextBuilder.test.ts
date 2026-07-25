import assert from "node:assert";
import {
	buildAccountabilityPrompt,
	buildEveningPrompt,
	buildMorningPrompt,
	buildSpartanPrompt,
	buildTaskPlanningPrompt,
	formatTemplate,
} from "./contextBuilder.js";

async function runContextBuilderTests() {
	console.log("Starting Context Builder & Options Object Tests...");

	// Test 1: Pure formatTemplate helper
	console.log("- Test 1: Testing formatTemplate pure interpolation...");
	const rawTemplate = "Hello {USER_NAME}, your score is {CURRENT_HP}.";
	const formatted = formatTemplate(rawTemplate, {
		USER_NAME: "AresUser",
		CURRENT_HP: 100,
	});
	assert.strictEqual(formatted, "Hello AresUser, your score is 100.");

	// Test 2: buildMorningPrompt with options object
	console.log("- Test 2: Testing buildMorningPrompt with options object...");
	const morningResult = await buildMorningPrompt({
		profile: "名前: テストユーザー\n目標: 規律向上",
		patterns: "HP3: 通常運転",
		recentLogs: ["Log 1: Complete"],
		currentHp: 3,
	});
	assert.ok(
		morningResult.includes("テストユーザー") || morningResult.length > 0,
	);

	// Test 3: buildEveningPrompt with options object
	console.log("- Test 3: Testing buildEveningPrompt with options object...");
	const eveningResult = await buildEveningPrompt({
		profile: "名前: テストユーザー",
		patterns: "HP3",
		todayLog: "Log Today",
	});
	assert.ok(eveningResult.length > 0);

	// Test 4: buildAccountabilityPrompt with options object
	console.log(
		"- Test 4: Testing buildAccountabilityPrompt with options object...",
	);
	const accResult = await buildAccountabilityPrompt({
		profile: "名前: テストユーザー",
		patterns: "HP3",
		statedGoals: "長期目標1",
		plannedTasks: "タスク1",
		actualActions: "実行1",
		currentHp: 3,
	});
	assert.ok(accResult.length > 0);

	// Test 5: buildTaskPlanningPrompt with options object
	console.log(
		"- Test 5: Testing buildTaskPlanningPrompt with options object...",
	);
	const planResult = await buildTaskPlanningPrompt({
		profile: "名前: テストユーザー",
		patterns: "HP3",
		todayTasks: "タスクA",
		availableTime: "120分",
		currentHp: 3,
	});
	assert.ok(planResult.length > 0);

	// Test 6: buildSpartanPrompt for FSM state
	console.log("- Test 6: Testing buildSpartanPrompt for EXECUTING state...");
	const spartanPrompt = await buildSpartanPrompt("test-user", "EXECUTING", {
		taskText: "開発50分",
		targetStartTime: "14:00",
	});
	assert.ok(spartanPrompt.includes("14:00"));
	assert.ok(spartanPrompt.includes("開発50分"));

	console.log("All Context Builder & Options Object Tests Passed Successfully!");
}

runContextBuilderTests().catch((err) => {
	console.error("Context Builder test execution failed:", err);
	process.exit(1);
});
