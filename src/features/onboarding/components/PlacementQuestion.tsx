import type { PlacementQuestionPublic } from "@/lib/placement/questions";
import styles from "./PlacementQuestion.module.css";

export interface PlacementQuestionProps {
  question: PlacementQuestionPublic;
  selectedOptionId: string | undefined;
  onSelect: (optionId: string) => void;
}

export function PlacementQuestion({ question, selectedOptionId, onSelect }: PlacementQuestionProps) {
  const fieldName = `answer-${question.id}`;

  return (
    <div className={styles.options} role="radiogroup" aria-label={question.prompt}>
      {question.options.map((option) => {
        const optionId = `${fieldName}-${option.id}`;
        return (
          <label key={option.id} htmlFor={optionId} className={styles.option}>
            <input
              id={optionId}
              type="radio"
              name={fieldName}
              value={option.id}
              checked={selectedOptionId === option.id}
              onChange={() => onSelect(option.id)}
              required
              className={styles.radio}
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
