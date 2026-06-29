export interface LessonStep {
  stepNumber: number;
  title: string;
  explanation: string;
  math: string;
}

export interface Lesson {
  topic: string;
  problem: string;
  conceptualBreakdown: string;
  steps: LessonStep[];
  commonPitfalls: string;
  followUpQuestion: string;
}

export interface AnswerFeedback {
  isCorrect: boolean;
  feedback: string;
  hint: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  webViewLink?: string;
}
