import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Shared Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API Routes
app.post("/api/generate-podcast", async (req, res) => {
  try {
    const { sources } = req.body;
    
    if (!sources || sources.length === 0) {
      return res.status(400).json({ error: "No sources provided" });
    }

    const contextText = sources.join("\n\n");

    // 1. Generate Podcast Script
    const scriptResponse = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `You are an expert podcast scriptwriter. Create a conversation between two hosts, Joe (knowledgeable, inquisitive) and Jane (expert, engaging), discussing the following context:

${contextText}

The conversation should be natural, engaging, and sound like a real "Deep Dive" podcast session. 
Format the output EXACTLY as:
Joe: [text]
Jane: [text]
Joe: [text]
...
Limit the conversation to about 6-8 exchanges each to keep it concise for a demo.`,
      config: {
        systemInstruction: "You only output the podcast script in the specified format.",
      }
    });

    const script = scriptResponse.text;
    if (!script) throw new Error("Failed to generate script");

    // 2. Generate Audio (Multi-speaker TTS)
    const ttsResponse = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Generate audio for the following podcast conversation:
${script}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: 'Joe',
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' } // Male-ish
                }
              },
              {
                speaker: 'Jane',
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Puck' } // Female-ish
                }
              }
            ]
          }
        }
      }
    });

    const audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    res.json({ script, audioBase64 });
  } catch (error: any) {
    console.error("Error generating podcast:", error);
    res.status(500).json({ error: error.message });
  }
});

// Vite middleware for development
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupVite();
