import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { Lesson, GoogleDriveFile, AnswerFeedback } from "../types";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request the Google Drive scope for file access
provider.addScope("https://www.googleapis.com/auth/drive.file");

// Cache the access token in memory (never localStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // If logged in but no token in cache, let's clear or wait for fresh login
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign-in with Google popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to retrieve Google Drive access token.");
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Sign out
export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

// Google Drive API helper functions
const getHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

// Helper: Get or Create "AI Math Tutor Lessons" folder
async function getOrCreateFolder(token: string): Promise<string> {
  try {
    // 1. Search for existing folder
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='AI Math Tutor Lessons' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`;
    const searchRes = await fetch(searchUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const searchData = await searchRes.json();

    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }

    // 2. Create folder if not found
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({
        name: "AI Math Tutor Lessons",
        mimeType: "application/vnd.google-apps.folder",
      }),
    });
    const folder = await createRes.json();
    return folder.id;
  } catch (err) {
    console.error("Error creating folder in Google Drive:", err);
    throw new Error("Could not access or create folder in Google Drive.");
  }
}

// Save a Lesson to Google Drive as Markdown
export async function saveLessonToDrive(
  token: string,
  lesson: Lesson,
  filename: string,
  studentAnswer?: string,
  feedback?: AnswerFeedback
): Promise<GoogleDriveFile> {
  const folderId = await getOrCreateFolder(token);

  // Format markdown content
  let markdown = `# AI Math Tutor Lesson: ${lesson.topic}\n\n`;
  markdown += `**Original Problem**: ${lesson.problem}\n`;
  markdown += `**Date**: ${new Date().toLocaleDateString()}\n\n`;

  markdown += `## 💡 Conceptual Breakdown (The "Why")\n`;
  markdown += `${lesson.conceptualBreakdown}\n\n`;

  markdown += `## 🚀 Step-by-Step Scaffolding (The "How")\n`;
  lesson.steps.forEach((step) => {
    markdown += `### Step ${step.stepNumber}: ${step.title}\n`;
    markdown += `${step.explanation}\n`;
    if (step.math) {
      markdown += `\n$$\n${step.math}\n$$\n`;
    }
    markdown += `\n`;
  });

  markdown += `## ⚠️ Error Prevention & Pitfalls\n`;
  markdown += `${lesson.commonPitfalls}\n\n`;

  markdown += `## 🧠 Interactive Check for Understanding\n`;
  markdown += `**Question**: ${lesson.followUpQuestion}\n\n`;

  if (studentAnswer) {
    markdown += `**Your Answer**: ${studentAnswer}\n\n`;
  }
  if (feedback) {
    markdown += `### Tutor Feedback:\n`;
    markdown += `*Result*: ${feedback.isCorrect ? "✅ Correct!" : "❌ Let's review."}\n\n`;
    markdown += `${feedback.feedback}\n\n`;
    markdown += `*Next Tip*: ${feedback.hint}\n`;
  }

  // Use multipart upload to upload metadata and content together
  const metadata = {
    name: filename.endsWith(".md") ? filename : `${filename}.md`,
    mimeType: "text/markdown",
    parents: [folderId],
  };

  const boundary = "314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const body =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: text/markdown; charset=UTF-8\r\n\r\n" +
    markdown +
    closeDelimiter;

  const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink";
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: body,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Upload failed:", errText);
    throw new Error("Failed to save lesson file to Google Drive.");
  }

  const file = await res.json();
  return file as GoogleDriveFile;
}

// List all saved lessons inside the "AI Math Tutor Lessons" folder
export async function listSavedLessons(token: string): Promise<GoogleDriveFile[]> {
  try {
    const folderId = await getOrCreateFolder(token);
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,createdTime,webViewLink)&orderBy=createdTime+desc`;
    
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error("Failed to list Google Drive files.");
    }

    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.error("Error listing files from Drive:", err);
    return [];
  }
}

// Helper: Delete a saved file (Mutating operation - Requires user confirmation in UI)
export async function deleteLessonFromDrive(token: string, fileId: string): Promise<boolean> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}
