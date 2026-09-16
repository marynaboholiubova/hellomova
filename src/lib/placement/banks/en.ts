import type { PlacementQuestion } from "../questions";

/**
 * English placement bank: one vocabulary + one grammar + one reading item
 * per CEFR level (A1–C2), 18 items total. Each item is written to actually
 * require that level's ability — see scoring.ts for how a level is only
 * credited when its own items are answered correctly, not inferred from
 * easier ones.
 */
export const EN_PLACEMENT_BANK: PlacementQuestion[] = [
  // A1
  {
    id: "en-a1-vocab",
    level: "A1",
    category: "vocabulary",
    prompt: "Choose the word that means \"a place where you buy food\".",
    options: [
      { id: "a", label: "Library" },
      { id: "b", label: "Supermarket" },
      { id: "c", label: "Hospital" },
      { id: "d", label: "Airport" },
    ],
    correctOptionId: "b",
  },
  {
    id: "en-a1-grammar",
    level: "A1",
    category: "grammar",
    prompt: "Choose the correct sentence.",
    options: [
      { id: "a", label: "She go to work every day." },
      { id: "b", label: "She goes to work every day." },
      { id: "c", label: "She going to work every day." },
      { id: "d", label: "She gone to work every day." },
    ],
    correctOptionId: "b",
  },
  {
    id: "en-a1-reading",
    level: "A1",
    category: "reading",
    prompt: "Read: \"Tom has a dog. The dog is small and brown.\" What color is the dog?",
    options: [
      { id: "a", label: "Black" },
      { id: "b", label: "White" },
      { id: "c", label: "Brown" },
      { id: "d", label: "Grey" },
    ],
    correctOptionId: "c",
  },
  // A2
  {
    id: "en-a2-vocab",
    level: "A2",
    category: "vocabulary",
    prompt: "Which word is the opposite of \"expensive\"?",
    options: [
      { id: "a", label: "Cheap" },
      { id: "b", label: "Heavy" },
      { id: "c", label: "Fast" },
      { id: "d", label: "Bright" },
    ],
    correctOptionId: "a",
  },
  {
    id: "en-a2-grammar",
    level: "A2",
    category: "grammar",
    prompt: "Choose the correct past tense of \"go\".",
    options: [
      { id: "a", label: "goed" },
      { id: "b", label: "went" },
      { id: "c", label: "gone" },
      { id: "d", label: "going" },
    ],
    correctOptionId: "b",
  },
  {
    id: "en-a2-reading",
    level: "A2",
    category: "reading",
    prompt:
      "Read: \"Maria works at a small bakery. She starts early in the morning and finishes before lunch.\" What time does Maria most likely start work?",
    options: [
      { id: "a", label: "Very early in the morning" },
      { id: "b", label: "Late at night" },
      { id: "c", label: "In the afternoon" },
      { id: "d", label: "After dinner" },
    ],
    correctOptionId: "a",
  },
  // B1
  {
    id: "en-b1-vocab",
    level: "B1",
    category: "vocabulary",
    prompt: "Choose the word closest in meaning to \"huge\".",
    options: [
      { id: "a", label: "Tiny" },
      { id: "b", label: "Enormous" },
      { id: "c", label: "Quiet" },
      { id: "d", label: "Narrow" },
    ],
    correctOptionId: "b",
  },
  {
    id: "en-b1-grammar",
    level: "B1",
    category: "grammar",
    prompt: "Complete: \"If it rains tomorrow, we ___ at home.\"",
    options: [
      { id: "a", label: "stay" },
      { id: "b", label: "stayed" },
      { id: "c", label: "will stay" },
      { id: "d", label: "staying" },
    ],
    correctOptionId: "c",
  },
  {
    id: "en-b1-reading",
    level: "B1",
    category: "reading",
    prompt:
      "Read: \"Although he was tired after a long day at work, James decided to go for a run because he wanted to clear his mind before the weekend.\" Why did James go for a run?",
    options: [
      { id: "a", label: "He wasn't tired at all" },
      { id: "b", label: "To clear his mind" },
      { id: "c", label: "Because it was the weekend" },
      { id: "d", label: "His boss told him to" },
    ],
    correctOptionId: "b",
  },
  // B2
  {
    id: "en-b2-vocab",
    level: "B2",
    category: "vocabulary",
    prompt: "Which word is closest in meaning to \"reluctant\"?",
    options: [
      { id: "a", label: "Unwilling" },
      { id: "b", label: "Excited" },
      { id: "c", label: "Confident" },
      { id: "d", label: "Curious" },
    ],
    correctOptionId: "a",
  },
  {
    id: "en-b2-grammar",
    level: "B2",
    category: "grammar",
    prompt: "Choose the correct sentence.",
    options: [
      { id: "a", label: "The report was finished by the team before the deadline." },
      { id: "b", label: "The report finished by the team before the deadline." },
      { id: "c", label: "The report was finish by the team before the deadline." },
      { id: "d", label: "The team was finished the report before the deadline." },
    ],
    correctOptionId: "a",
  },
  {
    id: "en-b2-reading",
    level: "B2",
    category: "reading",
    prompt:
      "Read: \"The company had promised a decision by Friday, but as the week wore on, employees noticed a distinct silence from management — a silence that, in itself, said more than any announcement could have.\" What does the passage suggest?",
    options: [
      { id: "a", label: "Management made a positive announcement on Friday" },
      { id: "b", label: "The lack of communication hinted at bad news" },
      { id: "c", label: "Employees were told the decision on time" },
      { id: "d", label: "The company had no decision to make" },
    ],
    correctOptionId: "b",
  },
  // C1
  {
    id: "en-c1-vocab",
    level: "C1",
    category: "vocabulary",
    prompt: "Complete: \"Despite the setback, she remained ___ about the project's success.\"",
    options: [
      { id: "a", label: "optimistic" },
      { id: "b", label: "indifferent" },
      { id: "c", label: "oblivious" },
      { id: "d", label: "resentful" },
    ],
    correctOptionId: "a",
  },
  {
    id: "en-c1-grammar",
    level: "C1",
    category: "grammar",
    prompt: "Choose the correct sentence.",
    options: [
      { id: "a", label: "Had she known about the meeting, she would have attended." },
      { id: "b", label: "If she had known about the meeting, she will attend." },
      { id: "c", label: "Had she know about the meeting, she would attend." },
      { id: "d", label: "If she has known about the meeting, she would have attended." },
    ],
    correctOptionId: "a",
  },
  {
    id: "en-c1-reading",
    level: "C1",
    category: "reading",
    prompt:
      "Read: \"It is not that he lacked ambition; rather, he had come to distrust the very notion of striving, having watched it hollow out everyone he admired.\" What is the author suggesting about the person?",
    options: [
      { id: "a", label: "He never wanted to succeed" },
      { id: "b", label: "He avoided ambition because of what he'd seen it do to others" },
      { id: "c", label: "He admired people who worked hard" },
      { id: "d", label: "He was unaware that ambition existed" },
    ],
    correctOptionId: "b",
  },
  // C2
  {
    id: "en-c2-vocab",
    level: "C2",
    category: "vocabulary",
    prompt:
      "Which word best captures a criticism delivered so subtly it could almost pass as a compliment?",
    options: [
      { id: "a", label: "Backhanded" },
      { id: "b", label: "Blunt" },
      { id: "c", label: "Candid" },
      { id: "d", label: "Earnest" },
    ],
    correctOptionId: "a",
  },
  {
    id: "en-c2-grammar",
    level: "C2",
    category: "grammar",
    prompt: "Choose the sentence that best expresses regret about a missed opportunity.",
    options: [
      { id: "a", label: "Only now did I realize what I had let slip through my fingers." },
      { id: "b", label: "Only now I realize what I let slip through my fingers." },
      { id: "c", label: "Only now did I realize what I have let slip through my fingers." },
      { id: "d", label: "Only now I did realize what I had let slip through my fingers." },
    ],
    correctOptionId: "a",
  },
  {
    id: "en-c2-reading",
    level: "C2",
    category: "reading",
    prompt:
      "Read: \"That the negotiations succeeded was, in the end, less a triumph of diplomacy than a testament to how little either side had left to lose.\" What is the author implying about the negotiations?",
    options: [
      { id: "a", label: "Skilled diplomacy was the main reason they succeeded" },
      { id: "b", label: "They succeeded partly because both sides had little left to risk" },
      { id: "c", label: "One side clearly had far more to lose than the other" },
      { id: "d", label: "The negotiations ultimately failed" },
    ],
    correctOptionId: "b",
  },
];
