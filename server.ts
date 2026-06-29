import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini client with proper telemetry headers
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

// Endpoint 1: Generate Tutor Explanation
app.post("/api/tutor/explain", async (req, res) => {
  if (!ai) {
    return res.status(500).json({
      error: "Gemini API Key is missing. Please set GEMINI_API_KEY in Settings > Secrets.",
    });
  }

  const { problem, topic } = req.body;
  if (!problem) {
    return res.status(400).json({ error: "No math problem or question provided." });
  }

  try {
    const prompt = `
You are an expert, highly intuitive, and empathetic AI Mathematics Tutor. 
Your goal is to guide the student to deep understanding.

Given this math problem/question: "${problem}" ${topic ? `(Topic: ${topic})` : ""}

Follow this strict pedagogical framework:
1. Conceptual Breakdown (The "Why"): Explain the concept in simple, relatable terms. Use a real-world analogy. DO NOT show the final answer. Focus on intuition.
2. Step-by-Step Scaffolding (The "How"): Break the calculation down into sequential numbered steps. For each step, explain what action is taken and why. Bold key math terms (e.g., **isolate the variable**, **common denominator**).
3. Error Prevention & Pitfalls: Identify 1-2 common mistakes students make with this type of problem, and how to avoid them.
4. Interactive Check for Understanding: End with a single, slightly modified follow-up question or a conceptual question to test if they grasped the logic. Keep the tone encouraging and growth-mindset focused.

You MUST respond strictly in the following JSON structure. All mathematical expressions and standalone equations MUST be written in LaTeX format (using $ for inline and $$ for block expressions) to ensure perfect readability.

JSON Schema:
{
  "topic": "The general math topic name",
  "problem": "The original problem cleaned up",
  "conceptualBreakdown": "Intuitive breakdown with real-world analogy (No final answer shown)",
  "steps": [
    {
      "stepNumber": 1,
      "title": "Short action title for the step",
      "explanation": "Detailed explanation of what and why, with bold mathematical terms",
      "math": "LaTeX equation or expression representing this step"
    }
  ],
  "commonPitfalls": "Explanation of common mistakes and how to avoid them",
  "followUpQuestion": "A supportive, empathetic prompt ending with a single follow-up question or problem for the student to solve"
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            problem: { type: Type.STRING },
            conceptualBreakdown: { type: Type.STRING },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  stepNumber: { type: Type.INTEGER },
                  title: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  math: { type: Type.STRING },
                },
                required: ["stepNumber", "title", "explanation", "math"],
              },
            },
            commonPitfalls: { type: Type.STRING },
            followUpQuestion: { type: Type.STRING },
          },
          required: ["topic", "problem", "conceptualBreakdown", "steps", "commonPitfalls", "followUpQuestion"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini.");
    }

    const parsed = JSON.parse(resultText);
    res.json(parsed);
  } catch (error: any) {
    console.error("Tutor explanation error:", error);
    res.status(500).json({ error: error.message || "Failed to generate tutor explanation." });
  }
});

// Endpoint 2: Evaluate Student's Answer
app.post("/api/tutor/check-answer", async (req, res) => {
  if (!ai) {
    return res.status(500).json({
      error: "Gemini API Key is missing. Please set GEMINI_API_KEY in Settings > Secrets.",
    });
  }

  const { problem, followUpQuestion, studentAnswer, steps } = req.body;
  if (!studentAnswer) {
    return res.status(400).json({ error: "Please provide your answer." });
  }

  try {
    const prompt = `
You are an expert, supportive AI Mathematics Tutor.
The student was solving the problem: "${problem}"
You asked them this check-for-understanding question: "${followUpQuestion}"
The student responded with this answer: "${studentAnswer}"

Reference Steps of original solution:
${JSON.stringify(steps)}

Analyze their answer. Check if they are correct, or if they made a conceptual/calculation mistake.
Be incredibly encouraging, warm, and highlight that mistakes are opportunities to learn (growth mindset). 
Provide direct feedback, guide them to the right path if incorrect without just giving away the solution immediately if they are close (give a supportive hint instead).

You MUST respond strictly in the following JSON structure. Use LaTeX for math.

JSON Schema:
{
  "isCorrect": true or false,
  "feedback": "Your empathetic, detailed feedback. Praise effort, explain any error or confirm correct thinking.",
  "hint": "A helpful hint if they were incorrect, or an encouraging concluding remark if they were correct."
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCorrect: { type: Type.BOOLEAN },
            feedback: { type: Type.STRING },
            hint: { type: Type.STRING },
          },
          required: ["isCorrect", "feedback", "hint"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini.");
    }

    const parsed = JSON.parse(resultText);
    res.json(parsed);
  } catch (error: any) {
    console.error("Tutor check-answer error:", error);
    res.status(500).json({ error: error.message || "Failed to check answer." });
  }
});

// Vite Middleware & Static Serving Setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
