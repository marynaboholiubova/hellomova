/**
 * Instruction/chrome text for the placement test, keyed by the learner's
 * NATIVE language — never the target language. Only `en` and `uk` are
 * authored for now; every other native language code falls back to `en`.
 * This is independent of which target-language question bank is shown —
 * native language controls instructions, target language controls what's
 * being tested, and the two must never be conflated.
 */
export interface PlacementUiStrings {
  heading: string;
  description: string;
  questionCounter: (current: number, total: number) => string;
  nextButton: string;
  seeMyLevelButton: string;
  scoringButton: string;
  /** Shown when this target language has no CEFR-aligned placement bank yet. */
  notAvailableHeading: string;
  notAvailableMessage: (languageName: string) => string;
  continueButton: string;
}

const EN: PlacementUiStrings = {
  heading: "Let's find your level",
  description:
    "A short CEFR-aligned check across vocabulary, grammar, and reading — an estimate, not a full language evaluation.",
  questionCounter: (current, total) => `Question ${current} of ${total}`,
  nextButton: "Next question",
  seeMyLevelButton: "See my level",
  scoringButton: "Scoring…",
  notAvailableHeading: "This test isn't ready yet",
  notAvailableMessage: (languageName) =>
    `We don't have a CEFR-aligned placement bank for ${languageName} yet. You can continue without a level for now — your level will show as "not assessed" until a real test is available.`,
  continueButton: "Continue",
};

const UK: PlacementUiStrings = {
  heading: "Визначимо ваш рівень",
  description:
    "Короткий CEFR-орієнтований тест з лексики, граматики та читання — це оцінка, а не повна мовна перевірка.",
  questionCounter: (current, total) => `Питання ${current} з ${total}`,
  nextButton: "Наступне питання",
  seeMyLevelButton: "Дізнатися мій рівень",
  scoringButton: "Обчислення…",
  notAvailableHeading: "Цей тест ще не готовий",
  notAvailableMessage: (languageName) =>
    `У нас ще немає CEFR-орієнтованого тесту для мови «${languageName}». Ви можете продовжити без рівня — він показуватиметься як «ще не оцінено», доки не з'явиться справжній тест.`,
  continueButton: "Продовжити",
};

const PLACEMENT_UI_STRINGS: Record<string, PlacementUiStrings> = {
  en: EN,
  uk: UK,
};

export function getPlacementUiStrings(nativeLanguageCode: string | null): PlacementUiStrings {
  if (nativeLanguageCode && PLACEMENT_UI_STRINGS[nativeLanguageCode]) {
    return PLACEMENT_UI_STRINGS[nativeLanguageCode];
  }
  return EN;
}
