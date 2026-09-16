export interface TeacherOption {
  id: string;
  name: string;
  title: string;
  description: string;
}

/** Exactly the planned teacher roster — do not rename or add entries. */
export const TEACHERS: TeacherOption[] = [
  {
    id: "anna",
    name: "Anna",
    title: "Friendly Teacher",
    description: "Calm and gentle correction.",
  },
  {
    id: "james",
    name: "James",
    title: "Business English",
    description: "Work, meetings, professional communication.",
  },
  {
    id: "sofia",
    name: "Sofia",
    title: "Conversation Coach",
    description: "Maximum speaking and natural conversation.",
  },
  {
    id: "alex",
    name: "Alex",
    title: "Strict Teacher",
    description: "Corrects mistakes more aggressively.",
  },
  {
    id: "mary",
    name: "Mary",
    title: "Pronunciation & Phonetics Coach",
    description: "Pronunciation, phonetics, stress, intonation.",
  },
];

export function getTeacherById(id: string): TeacherOption | undefined {
  return TEACHERS.find((teacher) => teacher.id === id);
}

export const TEACHER_IDS: string[] = TEACHERS.map((teacher) => teacher.id);
