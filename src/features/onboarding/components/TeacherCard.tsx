import { TeacherAvatar } from "./TeacherAvatar";
import styles from "./TeacherCard.module.css";

export interface TeacherCardProps {
  id: string;
  name: string;
  title: string;
  description: string;
  fieldName: string;
  checked: boolean;
  onSelect: (id: string) => void;
}

export function TeacherCard({
  id,
  name,
  title,
  description,
  fieldName,
  checked,
  onSelect,
}: TeacherCardProps) {
  const inputId = `${fieldName}-${id}`;

  return (
    <label htmlFor={inputId} className={styles.card}>
      <input
        id={inputId}
        type="radio"
        name={fieldName}
        value={id}
        checked={checked}
        onChange={() => onSelect(id)}
        className={styles.radio}
      />
      <div className={styles.avatar}>
        <TeacherAvatar teacherId={id} />
      </div>
      <span className={styles.text}>
        <span className={styles.name}>
          {name} — {title}
        </span>
        <span className={styles.description}>{description}</span>
      </span>
    </label>
  );
}
