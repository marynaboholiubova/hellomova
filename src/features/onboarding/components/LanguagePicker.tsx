"use client";

import { useId, useMemo, useState } from "react";
import type { LanguageOption } from "@/constants/languages";
import styles from "./LanguagePicker.module.css";

export interface LanguagePickerProps {
  name: string;
  languages: LanguageOption[];
  defaultValue?: string | null;
}

const DEFAULT_VISIBLE_COUNT = 5;

export function LanguagePicker({ name, languages, defaultValue }: LanguagePickerProps) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(defaultValue ?? "");
  const searchId = useId();

  const normalizedQuery = query.trim().toLowerCase();

  const visibleLanguages = useMemo(() => {
    if (normalizedQuery) {
      return languages.filter(
        (language) =>
          language.name.toLowerCase().includes(normalizedQuery) ||
          language.nativeName?.toLowerCase().includes(normalizedQuery),
      );
    }

    if (showAll) {
      return languages;
    }

    const selectedLanguage = languages.find((language) => language.code === selected);
    const defaults = languages.filter((language) => language.code !== selected);
    const shortList = selectedLanguage
      ? [selectedLanguage, ...defaults.slice(0, DEFAULT_VISIBLE_COUNT - 1)]
      : defaults.slice(0, DEFAULT_VISIBLE_COUNT);

    return shortList;
  }, [languages, normalizedQuery, showAll, selected]);

  const showSeeAllRow = !normalizedQuery && !showAll && languages.length > visibleLanguages.length;

  return (
    <div className={styles.wrapper}>
      <label htmlFor={searchId} className={styles.searchLabel}>
        Search languages
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search…"
        className={styles.search}
      />
      <div className={styles.list} role="radiogroup" aria-label="Language">
        {visibleLanguages.map((language) => {
          const optionId = `${name}-${language.code}`;
          return (
            <label key={language.code} htmlFor={optionId} className={styles.option}>
              <input
                id={optionId}
                type="radio"
                name={name}
                value={language.code}
                checked={selected === language.code}
                onChange={() => setSelected(language.code)}
                className={styles.radio}
              />
              <span dir={language.rtl ? "rtl" : undefined}>
                {language.name}
                {language.nativeName ? ` (${language.nativeName})` : ""}
              </span>
            </label>
          );
        })}
        {visibleLanguages.length === 0 && (
          <p className={styles.empty}>No languages match your search.</p>
        )}
        {showSeeAllRow && (
          <button
            type="button"
            className={styles.seeAll}
            onClick={() => setShowAll(true)}
          >
            See all {languages.length} languages
          </button>
        )}
      </div>
    </div>
  );
}
