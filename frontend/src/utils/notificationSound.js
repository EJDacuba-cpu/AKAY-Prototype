export const NOTIFICATION_SOUND_STORAGE_KEY = "akay_notification_sound_enabled";

const ALERT_COOLDOWN_MS = 10_000;
const AKAY_URGENT_ALERT_SOUND_PATH = "/sounds/akay-urgent-alert.mp3";
const AKAY_URGENT_ALERT_VOLUME = 0.65;
let audioContext = null;
let urgentAlertAudio = null;
let lastPlayedAt = 0;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!audioContext) audioContext = new AudioContextConstructor();
  return audioContext;
}

function normalizeText(value = "") {
  return String(value || "").toLowerCase();
}

function getUrgentAlertAudio() {
  if (typeof window === "undefined") return null;
  if (!urgentAlertAudio) {
    urgentAlertAudio = new Audio(AKAY_URGENT_ALERT_SOUND_PATH);
    urgentAlertAudio.preload = "auto";
    urgentAlertAudio.loop = false;
    urgentAlertAudio.volume = AKAY_URGENT_ALERT_VOLUME;
  }
  return urgentAlertAudio;
}

export function getNotificationSoundEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY) === "true";
}

export function setNotificationSoundEnabled(enabled) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    NOTIFICATION_SOUND_STORAGE_KEY,
    enabled ? "true" : "false",
  );
}

export function isUrgentNotification(notification = {}) {
  const source = [
    notification.type,
    notification.category,
    notification.entityType,
    notification.title,
    notification.message,
    notification.description,
    notification.status,
    notification.priority,
    notification.priorityLevel,
    notification.urgencyLevel,
  ]
    .map(normalizeText)
    .join(" ");

  const urgentSignals = [
    "follow_up_due_today",
    "follow-up due today",
    "follow up due today",
    "due today",
    "no_show",
    "no show",
    "missed",
    "referral_received",
    "incoming_referral",
    "new referral",
    "urgent referral",
    "urgent update",
    "medicine expired",
    "expired medicine",
    "critical low stock",
    "critically low",
  ];

  return urgentSignals.some((signal) => source.includes(signal));
}

export async function unlockAkayUrgentAlertSound() {
  try {
    const audio = getUrgentAlertAudio();
    if (!audio) return false;

    audio.load();
    audio.muted = true;
    audio.volume = 0;
    audio.currentTime = 0;

    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audio.volume = AKAY_URGENT_ALERT_VOLUME;
    return true;
  } catch {
    return false;
  }
}

async function playFallbackChime() {
  try {
    const context = getAudioContext();
    if (!context) return false;
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") return false;

    const start = context.currentTime;
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0001, start);
    masterGain.gain.exponentialRampToValueAtTime(0.045, start + 0.04);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.72);
    masterGain.connect(context.destination);

    [659.25, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const noteGain = context.createGain();
      const noteStart = start + index * 0.16;
      const noteEnd = noteStart + 0.38;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      noteGain.gain.setValueAtTime(0.0001, noteStart);
      noteGain.gain.exponentialRampToValueAtTime(0.75, noteStart + 0.03);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(noteGain);
      noteGain.connect(masterGain);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
    });

    window.setTimeout(() => masterGain.disconnect(), 850);
    return true;
  } catch {
    return false;
  }
}

export async function playAkayUrgentAlertSound({ ignoreCooldown = false } = {}) {
  const now = Date.now();
  if (!ignoreCooldown && now - lastPlayedAt < ALERT_COOLDOWN_MS) return false;

  try {
    const audio = getUrgentAlertAudio();
    if (!audio) return false;

    audio.pause();
    audio.loop = false;
    audio.volume = AKAY_URGENT_ALERT_VOLUME;
    audio.currentTime = 0;
    await audio.play();
    lastPlayedAt = now;
    return true;
  } catch {
    const playedFallback = await playFallbackChime();
    if (playedFallback) lastPlayedAt = now;
    return playedFallback;
  }
}
