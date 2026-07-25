import assert from "node:assert";
import webhookApp from "./webhook.js";

async function runWebhookTests() {
	console.log("Starting Webhook Endpoint & FP Handler Tests...");

	// Test 1: Guard Clause - Missing Signature Header returns 401
	console.log("- Test 1: Testing missing x-line-signature header (401)...");
	const resMissingSig = await webhookApp.request("/", {
		method: "POST",
		body: JSON.stringify({ events: [] }),
	});
	assert.strictEqual(resMissingSig.status, 401);
	const textMissingSig = await resMissingSig.text();
	assert.strictEqual(textMissingSig, "Missing signature");

	// Test 2: Invalid JSON body with signature returns 400
	console.log("- Test 2: Testing invalid JSON body (400)...");
	const resInvalidJson = await webhookApp.request("/", {
		method: "POST",
		headers: {
			"x-line-signature": "dummy_sig",
		},
		body: "{ invalid json",
	});
	assert.strictEqual(resInvalidJson.status, 400);

	// Test 3: Empty events array with signature returns 200 OK
	console.log("- Test 3: Testing empty events array (200 OK)...");
	const resEmptyEvents = await webhookApp.request("/", {
		method: "POST",
		headers: {
			"x-line-signature": "dummy_sig",
		},
		body: JSON.stringify({ events: [] }),
	});
	assert.strictEqual(resEmptyEvents.status, 200);
	const textEmpty = await resEmptyEvents.text();
	assert.strictEqual(textEmpty, "OK");

	console.log("All Webhook Endpoint & FP Handler Tests Passed Successfully!");
}

runWebhookTests().catch((err) => {
	console.error("Webhook test execution failed:", err);
	process.exit(1);
});
