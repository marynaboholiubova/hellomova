import styles from "./SelectableCard.module.css";

export interface GoalCardProps {
  code: string;
  label: string;
  name: string;
  defaultChecked?: boolean;
}

export function GoalCard({ code, label, name, defaultChecked }: GoalCardProps) {
  const id = `${name}-${code}`;

  return (
    <label htmlFor={id} className={styles.card}>
      <input
        id={id}
        type="radio"
        name={name}
        value={code}
        defaultChecked={defaultChecked}
        className={styles.radio}
      />
      <span className={styles.title}>{label}</span>
    </label>
  );
}
