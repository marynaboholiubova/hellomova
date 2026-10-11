import { describe, expect, it } from "vitest";
import { buildPhraseGenerationMessages, buildEvaluationMessages } from "./prompt";

describe("buildEvaluationMessages — evidence-honesty guardrails", () => {
  const context = { targetLanguageName: "French", targetText: "Je voudrais un café.", transcript: "Je voudrais un café." };

  it("always presents the persona as Mary, regardless of any teacher context — there is no teacher parameter at all, structurally proving teacher can never influence this", () => {
    const messages = buildEvaluationMessages(context);
    const systemMessage = messages.find((message) => message.role === "system");

    expect(systemMessage?.content).toContain("You are Mary");
  });

  it("explicitly forbids sound-level/acoustic claims the provider has no evidence for", () => {
    const messages = buildEvaluationMessages(context);
    const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";

    expect(systemMessage).toMatch(/\/r\/ sound/);
    expect(systemMessage).toMatch(/stress the second syllable/i);
    expect(systemMessage).toMatch(/intonation/i);
    expect(systemMessage).toMatch(/vowel/i);
    expect(systemMessage).toMatch(/rhythm/i);
    expect(systemMessage).toMatch(/numeric pronunciation accuracy/i);
    expect(systemMessage).toMatch(/accent/i);
  });

  it("tells the model what it CAN honestly assess (transcript-based evidence only)", () => {
    const messages = buildEvaluationMessages(context);
    const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";

    expect(systemMessage).toMatch(/what the ASR system recognized/i);
    expect(systemMessage).toMatch(/word-level differences/i);
  });

  it("never asks the model to produce a 'limitations' field — that is server-owned (see evaluate.ts)", () => {
    const messages = buildEvaluationMessages(context);
    const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";

    expect(systemMessage).toMatch(/limitations.*will be added by the system/i);
    expect(systemMessage).not.toContain('"limitations":');
  });

  it("requires the response format to use recognitionQuality/contentMatch/differences/practiceSuggestion — never an accuracy field", () => {
    const messages = buildEvaluationMessages(context);
    const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";

    expect(systemMessage).toContain('"recognitionQuality"');
    expect(systemMessage).toContain('"contentMatch"');
    expect(systemMessage).toContain('"differences"');
    expect(systemMessage).toContain('"practiceSuggestion"');
    expect(systemMessage).not.toMatch(/accuracy["\s:]/i);
  });

  it("treats transcript content as untrusted, never as instructions", () => {
    const messages = buildEvaluationMessages(context);
    const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";

    expect(systemMessage).toMatch(/untrusted text/i);
  });

  it("passes an empty-transcript case through honestly rather than hiding it", () => {
    const messages = buildEvaluationMessages({ ...context, transcript: "" });
    const userMessage = messages.find((message) => message.role === "user");

    expect(userMessage?.content).toMatch(/no speech was detected/i);
  });
});

describe("buildPhraseGenerationMessages — server-owned, no learner content to inject", () => {
  it("never includes any learner-supplied content, and instructs the model to ignore embedded instructions", () => {
    const messages = buildPhraseGenerationMessages({ targetLanguageName: "French", cefrLevel: "B1" });
    const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";

    expect(systemMessage).toMatch(/no learner-supplied content/i);
  });

  it("falls back to honest unassessed guidance when cefrLevel is null, never inventing a level", () => {
    const messages = buildPhraseGenerationMessages({ targetLanguageName: "French", cefrLevel: null });
    const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";

    expect(systemMessage).toMatch(/NOT been formally assessed/i);
  });
});
