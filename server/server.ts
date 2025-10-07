import express, { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const MOCK_MODE = process.env.MOCK_MODE === "true";
const SORA_API_BASE_URL = process.env.SORA_API_BASE_URL ?? "https://api.openai.com/v1/videos";
const SORA_API_KEY = process.env.SORA_API_KEY ?? "";

const candidateStaticDirs = [
  path.resolve(__dirname, "../web"),
  path.resolve(__dirname, "../../web"),
];

const staticDir = candidateStaticDirs.find((dir) => existsSync(dir)) ?? candidateStaticDirs[0];

app.use(express.json());
app.use(express.static(staticDir));

interface JobOptions {
  duration?: number;
  aspect_ratio?: string;
  width?: number;
  height?: number;
  prompt: string;
}

type JobStatus = "queued" | "processing" | "succeeded" | "failed" | "canceled";

interface Job {
  id: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  result?: {
    video_url: string;
  };
  error?: string;
  options: JobOptions;
}

interface MockJob extends Job {
  timers: NodeJS.Timeout[];
}

const mockJobs = new Map<string, MockJob>();

function serializeJob(job: Job): Job {
  return {
    id: job.id,
    status: job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
    result: job.result,
    error: job.error,
    options: job.options,
  };
}

function createMockJob(options: JobOptions): Job {
  const id = randomUUID();
  const now = new Date().toISOString();
  const job: MockJob = {
    id,
    status: "queued",
    created_at: now,
    updated_at: now,
    options,
    timers: []
  };

  const queueTimer = setTimeout(() => {
    job.status = "processing";
    job.updated_at = new Date().toISOString();
  }, 1000);

  const completionTimer = setTimeout(() => {
    job.status = "succeeded";
    job.updated_at = new Date().toISOString();
    job.result = {
      video_url: `https://cdn.openai.com/sora/videos/mock-${job.id}.mp4`
    };
  }, 5000);

  job.timers.push(queueTimer, completionTimer);
  mockJobs.set(id, job);
  return serializeJob(job);
}

function cancelMockJob(id: string): Job | undefined {
  const job = mockJobs.get(id);
  if (!job) {
    return undefined;
  }

  if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled") {
    return job;
  }

  for (const timer of job.timers) {
    clearTimeout(timer);
  }

  job.status = "canceled";
  job.updated_at = new Date().toISOString();
  return serializeJob(job);
}

app.post("/api/generate", async (req: Request, res: Response) => {
  const { prompt, duration, aspectRatio, width, height } = req.body ?? {};

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const options: JobOptions = {
    prompt,
  };

  if (typeof duration === "number") {
    options.duration = duration;
  }
  if (typeof aspectRatio === "string" && aspectRatio.trim().length > 0) {
    options.aspect_ratio = aspectRatio;
  }
  if (typeof width === "number") {
    options.width = width;
  }
  if (typeof height === "number") {
    options.height = height;
  }

  if (MOCK_MODE) {
    const job = createMockJob(options);
    return res.status(202).json(job);
  }

  if (!SORA_API_KEY) {
    return res.status(500).json({ error: "SORA_API_KEY is not configured" });
  }

  try {
    const response = await fetch(SORA_API_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SORA_API_KEY}`
      },
      body: JSON.stringify({
        prompt,
        duration,
        aspect_ratio: aspectRatio,
        width,
        height
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(202).json(data);
  } catch (error) {
    console.error("Error creating job", error);
    return res.status(500).json({ error: "Failed to create video generation job" });
  }
});

app.get("/api/jobs/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  if (MOCK_MODE) {
    const job = mockJobs.get(id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    return res.json(serializeJob(job));
  }

  if (!SORA_API_KEY) {
    return res.status(500).json({ error: "SORA_API_KEY is not configured" });
  }

  try {
    const response = await fetch(`${SORA_API_BASE_URL}/${id}`, {
      headers: {
        Authorization: `Bearer ${SORA_API_KEY}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.json(data);
  } catch (error) {
    console.error("Error fetching job", error);
    return res.status(500).json({ error: "Failed to fetch video generation job" });
  }
});

app.delete("/api/jobs/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  if (MOCK_MODE) {
    const job = cancelMockJob(id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    return res.json(job);
  }

  if (!SORA_API_KEY) {
    return res.status(500).json({ error: "SORA_API_KEY is not configured" });
  }

  try {
    const response = await fetch(`${SORA_API_BASE_URL}/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${SORA_API_KEY}`
      }
    });

    if (response.status === 204) {
      return res.status(204).send();
    }

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.json(data);
  } catch (error) {
    console.error("Error canceling job", error);
    return res.status(500).json({ error: "Failed to cancel video generation job" });
  }
});

app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.resolve(staticDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
