import React, { useState, useEffect } from "react";
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  saveLessonToDrive,
  listSavedLessons,
  deleteLessonFromDrive,
} from "./lib/firebase";
import { Lesson, LessonStep, AnswerFeedback, GoogleDriveFile } from "./types";
import { MathRenderer } from "./components/MathRenderer";
import { User } from "firebase/auth";
import {
  GraduationCap,
  Lightbulb,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  XCircle,
  Save,
  Trash2,
  ExternalLink,
  LogOut,
  Sparkles,
  ChevronRight,
  Plus,
  RefreshCw,
  Clock,
  Heart,
  Brain,
  ChevronDown,
} from "lucide-react";

// Initial list of math problem presets to help students get started instantly
const PRESETS = [
  {
    topic: "Algebra",
    problem: "Isolate x: 3x + 5 = 17",
    label: "Simple Equation",
  },
  {
    topic: "Fractions",
    problem: "Add the fractions: 1/2 + 2/3",
    label: "Adding Fractions",
  },
  {
    topic: "Calculus",
    problem: "Find the derivative of f(x) = x^2 + 4x + 3",
    label: "Basic Derivative",
  },
  {
    topic: "Geometry",
    problem: "Find the hypotenuse of a right triangle with legs of length 6 and 8.",
    label: "Pythagorean Theorem",
  },
  {
    topic: "Word Problems",
    problem: "A rectangular garden is twice as long as it is wide. If its perimeter is 60 meters, find its dimensions.",
    label: "Garden Perimeter",
  },
];

// List of supportive, empathetic growth mindset quotes
const GROWTH_MINDSET_QUOTES = [
  "Mistakes are just proof that you are trying!",
  "Your brain grows stronger every time you stretch it to solve a hard problem.",
  "There's no such thing as a 'math person'. Math is a skill built with practice and patience.",
  "Understanding why an answer is wrong is often more valuable than getting it right the first time.",
  "Every expert was once a beginner who refused to give up.",
];

export default function App() {
  // Authentication & Session State
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Math Solver State
  const [inputProblem, setInputProblem] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("General Math");
  const [isSolving, setIsSolving] = useState(false);
  const [solveError, setSolveError] = useState<string | null>(null);

  // Active Lesson State
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [revealedStepsCount, setRevealedStepsCount] = useState<number>(0);

  // Check for Understanding State
  const [studentAnswer, setStudentAnswer] = useState("");
  const [isCheckingAnswer, setIsCheckingAnswer] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState<AnswerFeedback | null>(null);

  // Google Drive Files State
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [isFileListLoading, setIsFileListLoading] = useState(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [driveSaveSuccess, setDriveSaveSuccess] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [customFilename, setCustomFilename] = useState("");

  // Inspirational Quote state
  const [quoteIdx, setQuoteIdx] = useState(0);

  // Initialize Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setNeedsAuth(false);
        // Load user's saved lessons once logged in
        fetchDriveFiles(accessToken);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Cycle inspirational quote occasionally
  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % GROWTH_MINDSET_QUOTES.length);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Login handler
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setSolveError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setNeedsAuth(false);
        fetchDriveFiles(result.accessToken);
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setSolveError("Authentication failed. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setNeedsAuth(true);
    setActiveLesson(null);
    setDriveFiles([]);
  };

  // Fetch saved lessons from Google Drive
  const fetchDriveFiles = async (accessToken: string) => {
    if (!accessToken) return;
    setIsFileListLoading(true);
    try {
      const files = await listSavedLessons(accessToken);
      setDriveFiles(files);
    } catch (err) {
      console.error("Error loading drive files:", err);
    } finally {
      setIsFileListLoading(false);
    }
  };

  // Submit math problem to the backend Express server
  const handleSolve = async (problemToSolve?: string, topicToSet?: string) => {
    const targetProblem = problemToSolve || inputProblem;
    const targetTopic = topicToSet || selectedTopic;

    if (!targetProblem.trim()) {
      setSolveError("Please enter a math question or choose a preset.");
      return;
    }

    setIsSolving(true);
    setSolveError(null);
    setActiveLesson(null);
    setRevealedStepsCount(0);
    setStudentAnswer("");
    setAnswerFeedback(null);
    setDriveSaveSuccess(null);

    try {
      const res = await fetch("/api/tutor/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: targetProblem,
          topic: targetTopic,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to generate tutor lesson.");
      }

      const data = await res.json();
      setActiveLesson(data);
      // Pre-fill filename with a clean title
      const sanitizedTopic = data.topic.replace(/[^a-zA-Z0-9]/g, "_");
      setCustomFilename(`Lesson_${sanitizedTopic}`);
    } catch (err: any) {
      console.error("Solver error:", err);
      setSolveError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsSolving(false);
    }
  };

  // Check the student's answer using backend Express check-answer
  const handleCheckAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLesson || !studentAnswer.trim()) return;

    setIsCheckingAnswer(true);
    setAnswerFeedback(null);

    try {
      const res = await fetch("/api/tutor/check-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: activeLesson.problem,
          followUpQuestion: activeLesson.followUpQuestion,
          studentAnswer,
          steps: activeLesson.steps,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to check your answer.");
      }

      const feedback = await res.json();
      setAnswerFeedback(feedback);
    } catch (err: any) {
      console.error("Feedback error:", err);
    } finally {
      setIsCheckingAnswer(false);
    }
  };

  // Save lesson to Google Drive
  const handleSaveToDrive = async () => {
    if (!token || !activeLesson || !customFilename.trim()) return;
    setIsSavingToDrive(true);
    setDriveSaveSuccess(null);

    try {
      const savedFile = await saveLessonToDrive(
        token,
        activeLesson,
        customFilename,
        studentAnswer,
        answerFeedback || undefined
      );

      setDriveSaveSuccess(savedFile.webViewLink || "Saved successfully!");
      setShowSaveModal(false);
      // Refresh list to show newly saved file
      fetchDriveFiles(token);
    } catch (err: any) {
      console.error("Save error:", err);
      alert("Failed to save to Google Drive. Please verify connection and try again.");
    } finally {
      setIsSavingToDrive(false);
    }
  };

  // Delete lesson from Google Drive (Mandatory user confirmation per Workspace Skill)
  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!token) return;
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete the saved lesson "${fileName}" from your Google Drive? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const success = await deleteLessonFromDrive(token, fileId);
      if (success) {
        fetchDriveFiles(token);
      } else {
        alert("Failed to delete the file.");
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("An error occurred while deleting the file.");
    }
  };

  // Pre-fill input from preset click
  const handlePresetClick = (preset: typeof PRESETS[0]) => {
    setInputProblem(preset.problem);
    setSelectedTopic(preset.topic);
    handleSolve(preset.problem, preset.topic);
  };

  return (
    <div id="ai-math-tutor-container" className="min-h-screen bg-[#FDFBF7] text-[#3D3A35] flex flex-col font-sans">
      {/* HEADER BAR */}
      <header id="tutor-header" className="bg-[#FDFBF7] border-b border-[#E8E2D9] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="bg-[#7C8B74] text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-sm">
              <span className="text-xl font-serif font-bold italic">Σ</span>
            </div>
            <div>
              <h1 className="font-serif font-bold text-2xl text-[#2D2A26] tracking-tight flex items-center gap-1.5">
                MathFlow AI
                <span className="bg-[#E0E7DF] text-[#7C8B74] text-xs font-semibold px-2.5 py-0.5 rounded-full border border-[#7C8B74]/20 flex items-center gap-1 font-sans">
                  <Sparkles className="h-3 w-3" /> Intuitive Tutor
                </span>
              </h1>
              <p className="text-xs text-[#8C8479] hidden sm:block font-sans mt-0.5">Empathetic learning, step-by-step guidance</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden lg:flex items-center gap-2 text-sm text-[#8C8479] mr-2">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
              Tutor Live: Active Learning
            </div>
            <div className="h-6 w-px bg-[#E8E2D9] hidden lg:block"></div>

            {user ? (
              <div className="flex items-center space-x-3">
                <div className="text-right hidden md:block">
                  <p className="text-xs font-medium text-[#2D2A26]">{user.displayName || "Student"}</p>
                  <p className="text-[10px] text-[#8C8479] font-mono leading-none">{user.email}</p>
                </div>
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    referrerPolicy="no-referrer"
                    alt="User profile"
                    className="h-8 w-8 rounded-full border border-[#E8E2D9]"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-[#E0E7DF] text-[#7C8B74] font-bold flex items-center justify-center text-sm">
                    {(user.displayName || "S").charAt(0)}
                  </div>
                )}
                <button
                  id="btn-logout"
                  onClick={handleLogout}
                  className="p-2 text-[#8C8479] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                id="btn-gsi-login"
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="gsi-material-button inline-flex items-center cursor-pointer transition-all hover:shadow-md"
                style={{
                  backgroundColor: "white",
                  border: "1px solid #E8E2D9",
                  borderRadius: "20px",
                  boxSizing: "border-box",
                  color: "#2D2A26",
                  fontFamily: '"Roboto", arial, sans-serif',
                  fontSize: "13px",
                  fontWeight: "500",
                  height: "38px",
                  letterSpacing: "0.25px",
                  outline: "none",
                  overflow: "hidden",
                  padding: "0 12px",
                  position: "relative",
                  textAlign: "center",
                  verticalAlign: "middle",
                  whiteSpace: "nowrap",
                  width: "auto",
                }}
              >
                <div className="flex items-center justify-center space-x-2.5">
                  <div className="w-[18px] h-[18px] flex items-center justify-center">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: "block" }}>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  </div>
                  <span>{isLoggingIn ? "Connecting..." : "Connect Google Drive"}</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* LOWER HERO / INSPIRATION QUOTE */}
      <div className="bg-[#7C8B74] text-white py-3 px-4 text-center border-y border-[#687661]">
        <p className="text-xs sm:text-sm font-medium flex items-center justify-center gap-2">
          <Brain className="h-4 w-4 text-[#E0E7DF] animate-pulse" />
          <span className="italic">"{GROWTH_MINDSET_QUOTES[quoteIdx]}"</span>
        </p>
      </div>

      {/* MAIN TWO-COLUMN WORKSPACE */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* LEFT COLUMN: HISTORY, PRESETS, AND EDUCATION STATS */}
        <div className="space-y-6 lg:col-span-1">
          
          {/* MATH PRESETS */}
          <div id="presets-panel" className="bg-[#F9F7F3] p-5 rounded-2xl border border-[#E8E2D9] shadow-xs">
            <h2 className="font-serif font-bold text-[#2D2A26] text-sm mb-3 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-[#7C8B74]" /> Math Topic Presets
            </h2>
            <p className="text-xs text-[#6B655C] mb-4">Click a topic preset to pre-fill and launch a guided lesson instantly:</p>
            <div className="space-y-2">
              {PRESETS.map((preset, idx) => (
                <button
                  key={`preset-${idx}`}
                  onClick={() => handlePresetClick(preset)}
                  className="w-full text-left p-3 rounded-xl border border-[#E8E2D9] bg-white hover:border-[#7C8B74] hover:bg-[#E0E7DF]/20 text-xs transition-all group flex items-start gap-2.5 cursor-pointer"
                >
                  <span className="bg-[#E0E7DF] text-[#7C8B74] px-2 py-0.5 rounded font-semibold group-hover:bg-[#7C8B74] group-hover:text-white transition-colors">
                    {preset.topic}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-[#2D2A26] leading-tight group-hover:text-[#7C8B74]">{preset.label}</p>
                    <p className="text-[10px] text-[#8C8479] font-mono truncate max-w-[150px] sm:max-w-none mt-0.5">{preset.problem}</p>
                  </div>
                  <ChevronRight className="h-3 w-3 text-[#8C8479] group-hover:text-[#7C8B74] self-center" />
                </button>
              ))}
            </div>
          </div>

          {/* SAVED LESSONS IN GOOGLE DRIVE */}
          <div id="drive-saved-lessons" className="bg-[#F9F7F3] p-5 rounded-2xl border border-[#E8E2D9] shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif font-bold text-[#2D2A26] text-sm flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[#7C8B74]" /> Lessons in Drive
              </h2>
              {user && (
                <button
                  onClick={() => fetchDriveFiles(token!)}
                  disabled={isFileListLoading}
                  className="text-[#8C8479] hover:text-[#7C8B74] disabled:opacity-40"
                  title="Reload Files"
                >
                  <RefreshCw className={`h-3 w-3 ${isFileListLoading ? "animate-spin" : ""}`} />
                </button>
              )}
            </div>

            {!user ? (
              <div className="p-4 bg-white border border-dashed border-[#E8E2D9] rounded-xl text-center">
                <p className="text-xs text-[#6B655C] leading-normal mb-3">
                  Connect Google Drive to save and view your personal lesson folders directly.
                </p>
                <button
                  onClick={handleLogin}
                  className="text-xs bg-[#7C8B74] hover:bg-[#687661] text-white font-semibold py-1.5 px-3 rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Connect Drive
                </button>
              </div>
            ) : isFileListLoading ? (
              <div className="space-y-2 py-4">
                <div className="h-3 bg-[#E8E2D9]/40 rounded animate-pulse w-3/4"></div>
                <div className="h-3 bg-[#E8E2D9]/40 rounded animate-pulse w-5/6"></div>
                <div className="h-3 bg-[#E8E2D9]/40 rounded animate-pulse w-2/3"></div>
              </div>
            ) : driveFiles.length === 0 ? (
              <div className="p-4 bg-white/55 rounded-xl text-center text-xs text-[#8C8479] italic border border-[#E8E2D9]">
                No saved lessons yet! Solve a math problem and click "Save to Drive".
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {driveFiles.map((file) => (
                  <div
                    key={file.id}
                    className="p-2.5 bg-white border border-[#E8E2D9] rounded-xl hover:border-[#7C8B74] transition-colors flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#2D2A26] truncate" title={file.name}>
                        {file.name.replace(".md", "")}
                      </p>
                      <p className="text-[9px] text-[#8C8479]">
                        {file.createdTime ? new Date(file.createdTime).toLocaleDateString() : "Saved"}
                      </p>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-[#8C8479] hover:text-[#7C8B74] hover:bg-[#E0E7DF]/35 rounded-md transition-colors"
                          title="Open in Google Drive"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => handleDeleteFile(file.id, file.name)}
                        className="p-1 text-[#8C8479] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                        title="Delete saved lesson"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TUTOR TIP */}
          <div className="bg-[#E0E7DF] border border-[#7C8B74]/20 rounded-2xl p-4 flex items-start gap-3">
            <Heart className="h-5 w-5 text-[#7C8B74] shrink-0 mt-0.5" />
            <div className="text-xs text-[#3D3A35]">
              <h4 className="font-bold text-[#2D2A26]">Your Math Companion</h4>
              <p className="leading-relaxed mt-1 text-[#6B655C]">
                Unlike calculators, my goal is to guide your intuition. I will point out common traps so you can learn safely and deeply.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: CURRENT SOLVER AND EXPANSIVE LESSON AREA */}
        <div className="lg:col-span-3 space-y-6 flex flex-col">
          
          {/* PROBLEM INPUT CARD */}
          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D9] shadow-xs">
            <h2 className="font-serif font-bold text-[#2D2A26] text-xl mb-4 flex items-center gap-2">
              <Brain className="h-5 w-5 text-[#7C8B74]" />
              What would you like to master today?
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#8C8479] mb-1.5">Your Question or Equation</label>
                <input
                  type="text"
                  placeholder="e.g. Solve 3x + 5 = 17, Find derivative of x^2, or describe a word problem..."
                  value={inputProblem}
                  onChange={(e) => setInputProblem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSolve();
                  }}
                  className="w-full px-4 py-2.5 bg-[#FDFBF7] border border-[#E8E2D9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7C8B74] focus:border-[#7C8B74] text-[#2D2A26] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#8C8479] mb-1.5">Topic / Subdiscipline</label>
                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#FDFBF7] border border-[#E8E2D9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7C8B74] focus:border-[#7C8B74] text-[#2D2A26] text-sm"
                >
                  <option value="General Math">General Math</option>
                  <option value="Algebra">Algebra</option>
                  <option value="Fractions">Fractions / Arithmetic</option>
                  <option value="Calculus">Calculus</option>
                  <option value="Geometry">Geometry</option>
                  <option value="Word Problems">Word Problems</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4 border-t border-[#E8E2D9]/60">
              <span className="text-[11px] text-[#8C8479] leading-tight">
                You can write equations normally (e.g. <code className="bg-[#F5F2ED] px-1.5 py-0.5 rounded text-[#7C8B74]">3/4 + 1/2</code> or <code className="bg-[#F5F2ED] px-1.5 py-0.5 rounded text-[#7C8B74]">x^2 - 4 = 0</code>).
              </span>
              <button
                id="btn-solve-math"
                onClick={() => handleSolve()}
                disabled={isSolving}
                className="bg-[#7C8B74] hover:bg-[#687661] disabled:bg-[#7C8B74]/60 text-white font-bold text-sm px-6 py-2.5 rounded-xl shadow-sm transition-all flex items-center space-x-2 shrink-0 cursor-pointer"
              >
                {isSolving ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Formulating Lesson...</span>
                  </>
                ) : (
                  <>
                    <span>Begin Guided Lesson</span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

            {solveError && (
              <div className="mt-4 p-4 bg-[#F9F7F3] border-l-4 border-[#D9A38C] rounded-r-xl flex items-start gap-2.5 text-sm text-[#3D3A35]">
                <AlertTriangle className="h-4 w-4 text-[#D9A38C] shrink-0 mt-0.5" />
                <span>{solveError}</span>
              </div>
            )}
          </div>

          {/* ACTIVE GUIDED LESSON AREA */}
          {activeLesson ? (
            <div id="active-lesson-block" className="space-y-6">
              
              {/* TOPIC BANNER */}
              <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-xs relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2.5 h-full bg-[#7C8B74]"></div>
                <span className="text-[10px] uppercase font-bold text-[#7C8B74] tracking-widest font-mono">
                  ACTIVE LESSON • {activeLesson.topic}
                </span>
                <h3 className="font-serif font-bold text-[#2D2A26] text-xl mt-1">
                  Topic: {activeLesson.topic}
                </h3>
                <div className="mt-4 p-4 bg-[#F9F7F3] border border-[#E8E2D9] rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-[#8C8479] font-bold">Mastery Focus:</p>
                    <p className="text-lg font-serif italic text-[#2D2A26] mt-0.5">"{activeLesson.problem}"</p>
                  </div>
                  {user && (
                    <button
                      id="btn-trigger-save-drive"
                      onClick={() => {
                        setDriveSaveSuccess(null);
                        setShowSaveModal(true);
                      }}
                      className="bg-[#7C8B74] hover:bg-[#687661] text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    >
                      <Save className="h-3.5 w-3.5" /> Save to Drive
                    </button>
                  )}
                </div>

                {driveSaveSuccess && (
                  <div className="mt-4 p-3.5 bg-[#E0E7DF] border border-[#7C8B74]/20 rounded-xl flex items-center justify-between text-xs text-[#2D2A26]">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#7C8B74] shrink-0" />
                      Lesson summary successfully saved to folder "AI Math Tutor Lessons"!
                    </span>
                    <a
                      href={driveSaveSuccess}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white text-[#7C8B74] border border-[#7C8B74]/20 font-bold px-3 py-1 rounded-md hover:bg-[#E0E7DF] inline-flex items-center gap-1 transition-colors"
                    >
                      Open in Drive <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* STAGE 1: CONCEPTUAL BREAKDOWN */}
              <div id="conceptual-card" className="bg-[#F9F7F3] border border-[#E8E2D9] rounded-2xl p-6 shadow-xs relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <Lightbulb className="h-24 w-24 text-[#8C8479]" />
                </div>
                
                <h4 className="font-serif font-bold text-[#2D2A26] text-lg mb-3.5 flex items-center gap-2 border-b border-[#E8E2D9] pb-2">
                  <span className="p-1.5 bg-[#E0E7DF] text-[#7C8B74] rounded-lg">
                    <Lightbulb className="h-4 w-4" />
                  </span>
                  1. Conceptual Breakdown (The "Why")
                </h4>
                
                <div className="text-[#6B655C] leading-relaxed text-sm font-sans">
                  <MathRenderer text={activeLesson.conceptualBreakdown} />
                </div>
              </div>

              {/* STAGE 2: STEP-BY-STEP SCAFFOLDING */}
              <div id="scaffolding-card" className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#E8E2D9] pb-3 mb-4">
                  <h4 className="font-serif font-bold text-[#2D2A26] text-lg flex items-center gap-2">
                    <span className="p-1.5 bg-[#E0E7DF] text-[#7C8B74] rounded-lg">
                      <GraduationCap className="h-4 w-4" />
                    </span>
                    2. Step-by-Step Scaffolding (The "How")
                  </h4>
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] text-[#8C8479] font-medium">
                      Step {revealedStepsCount} of {activeLesson.steps.length} revealed
                    </span>
                    <button
                      onClick={() => setRevealedStepsCount(activeLesson.steps.length)}
                      className="text-[10px] text-[#7C8B74] font-bold hover:underline bg-transparent border-none cursor-pointer"
                    >
                      Reveal All
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {activeLesson.steps.map((step, idx) => {
                    const isRevealed = idx < revealedStepsCount;
                    return (
                      <div
                        key={`step-card-${idx}`}
                        className={`transition-all duration-300 rounded-xl border ${
                          isRevealed
                            ? "bg-[#FDFBF7] border-[#E8E2D9] p-5 shadow-xs"
                            : idx === revealedStepsCount
                            ? "bg-[#E0E7DF]/20 border-dashed border-[#7C8B74]/40 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                            : "bg-[#FDFBF7]/40 border-[#E8E2D9]/50 p-4 opacity-40 flex items-center justify-between"
                        }`}
                      >
                        {isRevealed ? (
                          <div className="space-y-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className="bg-[#7C8B74] text-white font-serif font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center">
                                {step.stepNumber}
                              </span>
                              <h5 className="font-bold text-[#2D2A26] text-sm">{step.title}</h5>
                            </div>
                            <div className="text-[#6B655C] text-xs pl-8.5">
                              <MathRenderer text={step.explanation} />
                            </div>
                            {step.math && (
                              <div className="pl-8.5 mt-2">
                                <div className="font-mono text-center p-3 bg-[#F5F2ED] border border-[#E8E2D9] rounded-xl text-[#7C8B74] text-xs overflow-x-auto font-semibold">
                                  {step.math}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : idx === revealedStepsCount ? (
                          <>
                            <div className="flex items-center space-x-2.5">
                              <span className="bg-[#E0E7DF] text-[#7C8B74] font-serif font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center animate-pulse">
                                {step.stepNumber}
                              </span>
                              <span className="text-xs font-semibold text-[#2D2A26]">Predict the next mathematical action and step forward!</span>
                            </div>
                            <button
                              onClick={() => setRevealedStepsCount((prev) => prev + 1)}
                              className="bg-[#7C8B74] hover:bg-[#687661] text-white font-bold text-[11px] px-3.5 py-2 rounded-lg shadow-xs cursor-pointer self-start sm:self-auto transition-colors"
                            >
                              Reveal Step {step.stepNumber}
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-[#8C8479] font-medium">Step {step.stepNumber} locked</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* STAGE 3: ERROR PREVENTION & COMMON PITFALLS */}
              <div id="pitfalls-card" className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-xs relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <AlertTriangle className="h-24 w-24 text-[#D9A38C]" />
                </div>
                
                <h4 className="font-serif font-bold text-[#2D2A26] text-lg mb-3.5 flex items-center gap-2 border-b border-[#E8E2D9] pb-2">
                  <span className="p-1.5 bg-amber-50 text-[#D9A38C] rounded-lg">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  3. Error Prevention & Common Pitfalls
                </h4>

                <div className="space-y-4">
                  <div className="text-[#6B655C] text-sm leading-relaxed border-l-4 border-[#D9A38C] bg-[#FDFBF7] p-4 rounded-r-xl">
                    <MathRenderer text={activeLesson.commonPitfalls} />
                  </div>
                </div>
              </div>

              {/* STAGE 4: INTERACTIVE CHECK FOR UNDERSTANDING */}
              <div id="check-understanding-card" className="bg-[#F9F7F3] border border-[#E8E2D9] rounded-2xl p-6 shadow-xs relative">
                <h4 className="font-serif font-bold text-[#2D2A26] text-lg mb-4 flex items-center gap-2 border-b border-[#E8E2D9] pb-2">
                  <span className="p-1.5 bg-[#E0E7DF] text-[#7C8B74] rounded-lg">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  4. Interactive Check for Understanding
                </h4>

                <div className="text-[#3D3A35] text-sm font-semibold mb-4 leading-relaxed bg-white p-4 rounded-xl border border-[#E8E2D9]">
                  {activeLesson.followUpQuestion}
                </div>

                <form onSubmit={handleCheckAnswer} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#8C8479] mb-1.5">Your Working & Answer</label>
                    <textarea
                      rows={3}
                      value={studentAnswer}
                      onChange={(e) => setStudentAnswer(e.target.value)}
                      placeholder="Show your logic here! Don't worry about being perfect; trial and error is part of the process."
                      className="w-full px-4 py-2.5 bg-white border border-[#E8E2D9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7C8B74] text-[#2D2A26] text-sm"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-[11px] text-[#8C8479]">
                      I'll review your math logic step-by-step and provide friendly, intuitive hints.
                    </span>
                    <button
                      type="submit"
                      disabled={isCheckingAnswer || !studentAnswer.trim()}
                      className="bg-[#7C8B74] hover:bg-[#687661] disabled:bg-[#8C8479]/40 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer self-end"
                    >
                      {isCheckingAnswer ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Reviewing Answer...</span>
                        </>
                      ) : (
                        <>
                          <span>Check My Thinking</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {/* ANSWER EVALUATION RESULTS */}
                {answerFeedback && (
                  <div
                    id="feedback-box"
                    className={`mt-6 p-5 rounded-xl border transition-all ${
                      answerFeedback.isCorrect
                        ? "bg-[#E0E7DF] border-[#7C8B74]/30 text-[#2D2A26]"
                        : "bg-[#FDFBF7] border-l-4 border-[#D9A38C] text-[#3D3A35] rounded-r-xl shadow-xs"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">
                        {answerFeedback.isCorrect ? (
                          <CheckCircle2 className="h-5 w-5 text-[#7C8B74]" />
                        ) : (
                          <XCircle className="h-5 w-5 text-[#D9A38C]" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2.5">
                        <div>
                          <p className="font-serif font-bold text-base">
                            {answerFeedback.isCorrect
                              ? "Superb Job! Brilliant Reasoning."
                              : "Beautiful Effort! Let's Analyze."}
                          </p>
                          <div className="text-xs leading-relaxed mt-1">
                            <MathRenderer text={answerFeedback.feedback} />
                          </div>
                        </div>
                        {answerFeedback.hint && (
                          <div className="p-3 bg-white border border-[#E8E2D9] rounded-lg text-xs">
                            <p className="font-bold text-[#2D2A26]">Tutor Recommendation:</p>
                            <div className="text-[#6B655C] leading-relaxed mt-1">
                              <MathRenderer text={answerFeedback.hint} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // EMPTY WELCOME CONSOLE STATE
            <div className="flex-1 flex flex-col items-center justify-center p-8 border border-[#E8E2D9] rounded-3xl bg-white text-center py-20 shadow-xs">
              <div className="bg-[#E0E7DF] p-4 rounded-full text-[#7C8B74] mb-5">
                <GraduationCap className="h-10 w-10 animate-pulse" />
              </div>
              <h3 className="font-serif font-bold text-[#2D2A26] text-2xl">Your MathFlow Active Learning Console</h3>
              <p className="text-[#6B655C] text-sm max-w-md mt-1 mb-8 leading-relaxed">
                Type an equation above or click one of our preset math topics on the left to begin your guided math lesson.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
                <div className="p-4 bg-[#F9F7F3] rounded-xl border border-[#E8E2D9] text-left text-xs">
                  <p className="font-serif font-bold text-[#2D2A26] mb-1.5 flex items-center gap-1">
                    <span className="text-[#7C8B74]">💡</span> Intuitive Analogy
                  </p>
                  <p className="text-[#6B655C] leading-normal">We explain formulas using real-world objects and physical balances first.</p>
                </div>
                <div className="p-4 bg-[#F9F7F3] rounded-xl border border-[#E8E2D9] text-left text-xs">
                  <p className="font-serif font-bold text-[#2D2A26] mb-1.5 flex items-center gap-1">
                    <span className="text-[#7C8B74]">🚀</span> Step Scaffolding
                  </p>
                  <p className="text-[#6B655C] leading-normal">Reveal logical steps sequentially to challenge and reinforce confidence.</p>
                </div>
                <div className="p-4 bg-[#F9F7F3] rounded-xl border border-[#E8E2D9] text-left text-xs">
                  <p className="font-serif font-bold text-[#2D2A26] mb-1.5 flex items-center gap-1">
                    <span className="text-[#7C8B74]">📂</span> Drive Summaries
                  </p>
                  <p className="text-[#6B655C] leading-normal">Log complete lessons and practice responses to Google Drive automatically.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SAVE TO DRIVE FILENAME SELECTION MODAL */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-[#2D2A26]/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#FDFBF7] rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E8E2D9] relative">
            <h3 className="font-serif font-bold text-[#2D2A26] text-lg mb-2">Save Lesson to Google Drive</h3>
            <p className="text-xs text-[#6B655C] mb-4 leading-relaxed">
              Name your study guide. The full guided explanation, active scaffolding steps, and tutoring answers will be formatted and logged inside your "AI Math Tutor Lessons" folder.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#8C8479] mb-1.5">Filename</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    placeholder="Lesson_Title"
                    className="flex-1 px-3 py-2 bg-white border border-[#E8E2D9] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7C8B74] text-[#2D2A26] text-xs font-medium"
                  />
                  <span className="font-mono text-xs text-[#8C8479]">.md</span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#E8E2D9]/40">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2 text-[#8C8479] hover:text-[#2D2A26] text-xs font-bold hover:bg-[#EAE6DF]/30 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveToDrive}
                  disabled={isSavingToDrive || !customFilename.trim()}
                  className="bg-[#7C8B74] hover:bg-[#687661] disabled:bg-[#7C8B74]/55 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  {isSavingToDrive ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Saving to Drive...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3 w-3" />
                      <span>Confirm Save</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="bg-white border-t border-[#E8E2D9] py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-[#8C8479]">
          <p>© 2026 AI Mathematics Tutor. Crafted for intuitive and supportive student education in Natural Tones theme.</p>
        </div>
      </footer>
    </div>
  );
}
