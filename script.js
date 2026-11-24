"use strict";

const API_URL = "https://mental-health-score-khox.onrender.com";

const form = document.getElementById("predictForm");
const stage = document.getElementById("stage");
const stageCard = document.getElementById("stageCard");
const submitBtn = document.getElementById("submitBtn");
const btnText = submitBtn.querySelector(".btn-text");
const formAlert = document.getElementById("formAlert");
const result = document.getElementById("result");
const gaugeBar = document.getElementById("gaugeBar");
const CIRCUMFERENCE = 339.3;

/* ---------- Live slider values ---------- */
form.querySelectorAll("input[type=range]").forEach((slider) => {
  const out = slider.closest(".field").querySelector("output");
  const update = () => (out.textContent = `${slider.value} h`);
  slider.addEventListener("input", update);
});

/* ---------- 3D tilt on the stage ---------- */
const canTilt = matchMedia("(hover: hover)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
if (canTilt) {
  stageCard.addEventListener("mousemove", (e) => {
    const r = stageCard.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    stageCard.style.setProperty("--ry", `${x * 8}deg`);
    stageCard.style.setProperty("--rx", `${-y * 8}deg`);
  });
  stageCard.addEventListener("mouseleave", () => {
    stageCard.style.setProperty("--ry", "0deg");
    stageCard.style.setProperty("--rx", "0deg");
  });
}

/* ---------- Helpers ---------- */
const fieldBox = (name) => form.querySelector(`.field[data-field="${name}"]`);

function setFieldError(name, message) {
  const box = fieldBox(name);
  if (!box) return false;
  box.classList.add("has-error");
  box.querySelector(".error").textContent = message;
  return true;
}

function clearErrors() {
  form.querySelectorAll(".field").forEach((f) => {
    f.classList.remove("has-error");
    f.querySelector(".error").textContent = "";
  });
  formAlert.hidden = true;
}

function showAlert(message) {
  formAlert.textContent = message;
  formAlert.hidden = false;
}

function setBusy(busy) {
  submitBtn.disabled = busy;
  submitBtn.classList.toggle("busy", busy);
  btnText.textContent = busy ? "Predicting…" : "Predict score";
  stage.dataset.state = busy ? "loading" : stage.dataset.state;
}

/* ---------- Build + validate payload (mirrors the Pydantic model) ---------- */
function buildPayload() {
  const v = (n) => form.elements[n].value;
  return {
    age: v("age") === "" ? null : Number(v("age")),
    gender: v("gender") || null,
    country: v("country").trim(),
    academic_level: v("academic_level"),
    most_used_platform: v("most_used_platform"),
    purpose_of_use: v("purpose_of_use"),
    avg_daily_usage_hours: Number(v("avg_daily_usage_hours")),
    daily_unlocks: v("daily_unlocks") === "" ? null : Number(v("daily_unlocks")),
    study_hours: Number(v("study_hours")),
    physical_activity_hours: Number(v("physical_activity_hours")),
    sleep_hours_per_night: Number(v("sleep_hours_per_night")),
    stress_level: v("stress_level") || null,
  };
}

function validate(p) {
  const errors = {};
  if (p.age === null || !Number.isInteger(p.age) || p.age < 10 || p.age > 100) errors.age = "Enter a whole number between 10 and 100.";
  if (!p.gender) errors.gender = "Choose a gender.";
  if (!p.country) errors.country = "Enter your country.";
  if (!p.academic_level) errors.academic_level = "Select an academic level.";
  if (!p.most_used_platform) errors.most_used_platform = "Select a platform.";
  if (!p.purpose_of_use) errors.purpose_of_use = "Select a purpose.";
  if (p.daily_unlocks === null || !Number.isInteger(p.daily_unlocks) || p.daily_unlocks < 0) errors.daily_unlocks = "Enter a whole number, 0 or more.";
  if (!p.stress_level) errors.stress_level = "Choose a stress level.";
  return errors;
}

/* ---------- Submit ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();

  const payload = buildPayload();
  const errors = validate(payload);
  const names = Object.keys(errors);
  if (names.length) {
    names.forEach((n) => setFieldError(n, errors[n]));
    showAlert("Please fix the highlighted fields and try again.");
    fieldBox(names[0]).scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  setBusy(true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(`${API_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (res.status === 422) {
      const body = await res.json();
      const general = [];
      (body.detail || []).forEach((d) => {
        const name = d.loc[d.loc.length - 1];
        if (!setFieldError(name, d.msg)) general.push(d.msg);
      });
      showAlert(general.length ? general.join(" ") : "The server rejected some values. Check the highlighted fields.");
      stage.dataset.state = "idle";
      return;
    }
    if (!res.ok) {
      throw new Error(res.status >= 500
        ? "The model could not process this input (server error). Check the uvicorn terminal for details. An unfamiliar country name is a common cause."
        : `Unexpected response from the server (${res.status}).`);
    }

    const data = await res.json();
    showResult(Number(data.Predicted_mental_health_score));
  } catch (err) {
    stage.dataset.state = result.dataset.ready ? "result" : "idle";
    if (err.name === "AbortError") showAlert("The request timed out. Make sure the API is running and try again.");
    else if (err instanceof TypeError) showAlert(`Can't reach the API at ${API_URL}. Start it with: python -m uvicorn main:app --port 8000 --reload`);
    else showAlert(err.message);
  } finally {
    clearTimeout(timer);
    setBusy(false);
  }
});

/* ---------- Result card ---------- */
function showResult(score) {
  if (!Number.isFinite(score)) throw new Error("The API returned an unexpected value.");

  const band = score >= 7 ? ["good", "Healthy range", "Habits and routine point to good mental well-being."]
    : score >= 5 ? ["mid", "Moderate range", "Some habits may be worth adjusting, such as sleep, activity or screen time."]
    : ["low", "Needs attention", "Several inputs point to lower well-being. Talking to someone you trust can help."];

  result.dataset.band = band[0];
  result.dataset.ready = "1";
  document.getElementById("bandLabel").textContent = band[1];
  document.getElementById("bandText").textContent = band[2];

  stage.dataset.state = "result";
  gaugeBar.style.strokeDashoffset = CIRCUMFERENCE;
  requestAnimationFrame(() => {
    gaugeBar.style.strokeDashoffset = CIRCUMFERENCE * (1 - Math.min(Math.max(score / 10, 0), 1));
  });
  countUp(document.getElementById("scoreValue"), score);
  stage.scrollIntoView({ behavior: "smooth", block: "start" });
}

function countUp(el, target) {
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / 1000, 1);
    el.textContent = (target * (1 - Math.pow(1 - t, 3))).toFixed(2);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Result actions ---------- */
document.getElementById("editBtn").addEventListener("click", () => {
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.age.focus({ preventScroll: true });
});
document.getElementById("resetBtn").addEventListener("click", () => {
  form.reset();
  form.querySelectorAll("input[type=range]").forEach((s) => s.dispatchEvent(new Event("input")));
  clearErrors();
  delete result.dataset.ready;
  stage.dataset.state = "idle";
  window.scrollTo({ top: 0, behavior: "smooth" });
});
