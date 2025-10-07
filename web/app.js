const form = document.getElementById("prompt-form");
const promptInput = document.getElementById("prompt");
const durationInput = document.getElementById("duration");
const aspectRatioInput = document.getElementById("aspectRatio");
const widthInput = document.getElementById("width");
const heightInput = document.getElementById("height");
const submitButton = document.getElementById("submit");
const statusPanel = document.getElementById("status-panel");
const statusList = document.getElementById("status-list");
const jobIdEl = document.getElementById("job-id");
const videoContainer = document.getElementById("video-container");
const videoEl = document.getElementById("result-video");
const cancelButton = document.getElementById("cancel");
const ratioOptions = document.getElementById("ratio-options");
const resolutionOptions = document.getElementById("resolution-options");
const loadJobForm = document.getElementById("load-job-form");
const loadJobInput = document.getElementById("job-id-input");

let currentJobId = null;
let pollTimer = null;

function normalizeStatus(status) {
  switch (status) {
    case "in_progress":
    case "running":
      return "processing";
    case "completed":
      return "succeeded";
    default:
      return status;
  }
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Submitting..." : "Generate Video";
}

function showStatusPanel() {
  statusPanel.classList.remove("hidden");
}

function appendStatus(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  statusList.prepend(item);
}

function resetStatus() {
  statusList.innerHTML = "";
  jobIdEl.textContent = "";
  videoContainer.classList.add("hidden");
  videoEl.removeAttribute("src");
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function updateCancelButton() {
  cancelButton.disabled = !currentJobId;
}

async function pollJob(jobId) {
  try {
    const response = await fetch(`/api/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch job (status ${response.status})`);
    }

    const job = await response.json();
    handleJobUpdate(job);

    if (job.status === "queued" || job.status === "processing") {
      pollTimer = setTimeout(() => pollJob(jobId), 2000);
    }
  } catch (error) {
    appendStatus(`Error polling job: ${error.message}`);
    pollTimer = setTimeout(() => pollJob(jobId), 4000);
  }
}

function handleJobUpdate(job) {
  const status = normalizeStatus(job.status);
  jobIdEl.textContent = `Job ID: ${job.id}`;
  appendStatus(`Status: ${status}`);

  if (status === "succeeded") {
    const videoUrl =
      job.result?.video_url || job.video_url || job.video?.download_url || job.latest_video?.url;

    if (videoUrl) {
      videoEl.src = videoUrl;
    }
    videoContainer.classList.remove("hidden");
    stopPolling();
    currentJobId = null;
    updateCancelButton();
  }

  if (status === "failed" && job.error) {
    appendStatus(`Error: ${job.error}`);
    stopPolling();
    currentJobId = null;
    updateCancelButton();
  }

  if (status === "canceled") {
    appendStatus("Job canceled");
    stopPolling();
    currentJobId = null;
    updateCancelButton();
  }
}

async function submitPrompt(event) {
  event.preventDefault();
  const prompt = promptInput.value.trim();

  if (!prompt) {
    alert("Please enter a prompt before submitting.");
    return;
  }

  setLoading(true);
  showStatusPanel();
  stopPolling();
  currentJobId = null;
  updateCancelButton();
  resetStatus();
  appendStatus("Submitting generation request...");

  const sizeMode = new FormData(form).get("sizeMode");
  const payload = { prompt };

  if (sizeMode === "ratio") {
    payload.duration = Number(durationInput.value);
    payload.aspectRatio = aspectRatioInput.value;
  } else {
    const width = Number(widthInput.value);
    const height = Number(heightInput.value);

    if (!width || !height) {
      alert("Please provide both width and height when using custom resolution.");
      setLoading(false);
      return;
    }

    payload.width = width;
    payload.height = height;
  }

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data?.error ?? "Failed to create generation job.";
      appendStatus(`Error: ${errorMessage}`);
      setLoading(false);
      return;
    }

    currentJobId = data.id;

    if (!currentJobId) {
      appendStatus("Unexpected response from server.");
      setLoading(false);
      updateCancelButton();
      return;
    }

    appendStatus("Generation job created. Polling for status...");
    updateCancelButton();
    pollJob(currentJobId);
  } catch (error) {
    appendStatus(`Error submitting prompt: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

async function cancelJob() {
  if (!currentJobId) {
    return;
  }

  appendStatus("Canceling job...");

  try {
    const response = await fetch(`/api/jobs/${currentJobId}`, {
      method: "DELETE"
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to cancel job (status ${response.status})`);
    }

    const data = response.status === 204 ? { status: "canceled" } : await response.json();
    handleJobUpdate({ ...data, id: currentJobId });
  } catch (error) {
    appendStatus(`Error canceling job: ${error.message}`);
  }
}

async function loadJob(event) {
  event.preventDefault();
  const jobId = loadJobInput.value.trim();

  showStatusPanel();
  stopPolling();
  currentJobId = null;
  updateCancelButton();
  resetStatus();

  if (!jobId) {
    appendStatus("Please provide a job ID to load.");
    return;
  }

  appendStatus(`Loading job ${jobId}...`);

  try {
    const response = await fetch(`/api/jobs/${jobId}`);

    if (response.status === 404) {
      appendStatus("Job not found.");
      return;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch job (status ${response.status})`);
    }

    const job = await response.json();
    const status = normalizeStatus(job.status);

    if (status === "queued" || status === "processing") {
      currentJobId = job.id;
      updateCancelButton();
    }

    handleJobUpdate(job);

    if (status === "queued" || status === "processing") {
      pollJob(job.id);
    } else {
      currentJobId = null;
      updateCancelButton();
    }
  } catch (error) {
    appendStatus(`Error loading job: ${error.message}`);
    currentJobId = null;
    updateCancelButton();
  }
}

form.addEventListener("submit", submitPrompt);

cancelButton.addEventListener("click", cancelJob);

if (loadJobForm) {
  loadJobForm.addEventListener("submit", loadJob);
}

for (const option of document.querySelectorAll('input[name="sizeMode"]')) {
  option.addEventListener("change", (event) => {
    const mode = event.target.value;
    if (mode === "ratio") {
      ratioOptions.classList.remove("hidden");
      resolutionOptions.classList.add("hidden");
    } else {
      resolutionOptions.classList.remove("hidden");
      ratioOptions.classList.add("hidden");
    }
  });
}

updateCancelButton();
