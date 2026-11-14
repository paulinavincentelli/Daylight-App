const STORAGE_KEY = "daylight-todos";
const MAX_VOICE_RECORDING_MS = 60_000;
const MAX_VOICE_AUDIO_BYTES = 8 * 1024 * 1024;
const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const list = document.querySelector("#todo-list");
const emptyState = document.querySelector("#empty-state");
const emptyMessage = document.querySelector("#empty-message");
const taskCount = document.querySelector("#task-count");
const listTitle = document.querySelector("#list-title");
const clearCompletedButton = document.querySelector("#clear-completed");
const filters = [...document.querySelectorAll(".filter")];
const homeButton = document.querySelector("#home-button");
const calendarToggle = document.querySelector("#calendar-toggle");
const calendarPanel = document.querySelector("#calendar-panel");
const calendarMonth = document.querySelector("#calendar-month");
const calendarGrid = document.querySelector("#calendar-grid");
const taskScreen = document.querySelector("#task-screen");
const reminderScreen = document.querySelector("#reminder-screen");
const notificationToggle = document.querySelector("#notification-toggle");
const settingsToggle = document.querySelector("#settings-toggle");
const reminderBadge = document.querySelector("#reminder-badge");
const backToListButton = document.querySelector("#back-to-list");
const reminderScreenTitle = document.querySelector("#reminder-title");
const reminderDate = document.querySelector("#reminder-date");
const notificationsPanel = document.querySelector("#notifications-panel");
const reminderSettingsPanel = document.querySelector("#reminder-settings-panel");
const reminderSettingsTitle = document.querySelector("#reminder-settings-title");
const reminderList = document.querySelector("#reminder-list");
const reminderEmpty = document.querySelector("#reminder-empty");
const reminderTimeForm = document.querySelector("#reminder-time-form");
const reminderTimeInput = document.querySelector("#reminder-time");
const reminderTimeList = document.querySelector("#reminder-times");
const enableRemindersButton = document.querySelector("#enable-reminders");
const reminderStatus = document.querySelector("#reminder-status");
const chatLauncher = document.querySelector("#chat-launcher");
const chatLauncherInput = document.querySelector("#chat-launcher-input");
const chatDialog = document.querySelector("#chat-dialog");
const chatExitButton = document.querySelector("#chat-exit");
const chatMessages = document.querySelector("#chat-messages");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatSubmitButton = document.querySelector("#chat-submit");
const chatLauncherMicButton = document.querySelector("#chat-launcher-mic");
const chatMicButton = document.querySelector("#chat-mic");
const voiceStatus = document.querySelector("#chat-voice-status");
const clockLabel = document.querySelector("#clock");
const authScreen = document.querySelector("#auth-screen");
const authTitle = document.querySelector("#auth-title");
const authDescription = document.querySelector(".auth-description");
const authForm = document.querySelector("#auth-form");
const authEmailInput = document.querySelector("#auth-email");
const authPasswordInput = document.querySelector("#auth-password");
const authPasswordConfirm = document.querySelector("#auth-password-confirm");
const authConfirmField = document.querySelector("#auth-confirm-field");
const authSubmitButton = document.querySelector("#auth-submit");
const authStatus = document.querySelector("#auth-status");
const googleSignIn = document.querySelector("#google-signin");
const googleSignInButton = document.querySelector("#google-signin-button");
const googleSignInStatus = document.querySelector("#google-signin-status");
const accountLoadPanel = document.querySelector("#account-load-panel");
const accountLoadStatus = document.querySelector("#account-load-status");
const retryAccountLoadButton = document.querySelector("#retry-account-load");
const passwordResetForm = document.querySelector("#password-reset-form");
const resetPasswordInput = document.querySelector("#reset-password");
const resetPasswordConfirm = document.querySelector("#reset-password-confirm");
const forgotPasswordButton = document.querySelector("#forgot-password");
const resendVerificationButton = document.querySelector("#resend-verification");
const showSignInButton = document.querySelector("#show-sign-in");
const showSignUpButton = document.querySelector("#show-sign-up");
const accountControls = document.querySelector("#account-controls");
const accountEmail = document.querySelector("#account-email");
const signOutButton = document.querySelector("#sign-out");
const saveNoteText = document.querySelector("#save-note-text");
const syncReloadButton = document.querySelector("#sync-reload");
const localImportNotice = document.querySelector("#local-import-notice");
const localImportMessage = document.querySelector("#local-import-message");
const importLocalTasksButton = document.querySelector("#import-local-tasks");
const skipLocalImportButton = document.querySelector("#skip-local-import");
const saveNote = document.querySelector(".save-note");

let activeFilter = "all";
let editingTodoId = null;
let chatLockedScrollY = 0;
const todayKey = toDateKey(new Date());
let selectedDate = todayKey;
let calendarOpen = false;
let serviceWorkerRegistration = null;
let remindersEnabled = false;
let authRequired = false;
let signedInUser = null;
let scheduleSyncTimer = null;
let reminderReturnFocus = notificationToggle;
let reminderTimes = loadReminderTimes();
let todos = loadTodos();
let assistantHistory = [];
let assistantBusy = false;
let mediaRecorder = null;
let microphoneStream = null;
let voiceChunks = [];
let voiceChunkBytes = 0;
let voiceRecordingTimeout = null;
let voiceListening = false;
let voiceStarting = false;
let voiceTranscribing = false;
let voiceCancelRequested = false;
let voiceDiscardOnStop = false;
let voiceTooLarge = false;
let voiceDraft = "";
let authMode = "login";
let passwordResetToken = "";
let taskRevision = 0;
let taskSyncQueue = Promise.resolve();
let taskSyncPending = 0;
let taskSyncConflict = false;
let localTasksToImport = [];
let googleSignInConfigured = false;
const googleRedirectFailed = (() => {
  const url = new URL(window.location.href);
  if (url.searchParams.get("google_signin") !== "failed") return false;
  url.searchParams.delete("google_signin");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
})();

document.querySelector("#today").textContent = formatDate(todayKey, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function updateClock() {
  clockLabel.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

updateClock();
window.setInterval(updateClock, 30_000);

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(key, options) {
  return new Intl.DateTimeFormat(undefined, options).format(dateFromKey(key));
}

function isValidTime(value) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
  return true;
}

function loadReminderTimes() {
  try {
    const savedTimes = JSON.parse(
      localStorage.getItem(reminderStorageKey()) ?? '["08:00"]'
    );
    if (!Array.isArray(savedTimes)) return ["08:00"];
    return [...new Set(savedTimes.filter(isValidTime))].sort().slice(0, 8);
  } catch (error) {
    console.error("Could not load reminder times.", error);
    return ["08:00"];
  }
}

function reminderStorageKey() {
  return authRequired && signedInUser
    ? `daylight-reminder-times:${signedInUser.id}`
    : "daylight-reminder-times";
}

function formatTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes));
}

function setReminderStatus(message) {
  reminderStatus.textContent = message;
}

function renderReminderTimes() {
  reminderTimeList.replaceChildren();
  reminderTimes.forEach((time) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = formatTime(time);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-time-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${formatTime(time)} reminder`);
    remove.addEventListener("click", () => {
      reminderTimes = reminderTimes.filter((itemTime) => itemTime !== time);
      saveReminderTimes();
      renderReminderTimes();
    });

    item.append(label, remove);
    reminderTimeList.append(item);
  });
}

function renderReminders() {
  const dueToday = todos.filter(
    (todo) => todo.date === todayKey && !todo.completed
  );
  reminderList.replaceChildren(
    ...dueToday.map((todo) => {
      const item = document.createElement("li");
      item.className = "reminder-item";

      const text = document.createElement("span");
      text.className = "todo-text";
      text.textContent = todo.text;

      const done = document.createElement("button");
      done.type = "button";
      done.className = "reminder-done-button";
      done.textContent = "Done";
      done.setAttribute("aria-label", `Mark as done: ${todo.text}`);
      done.addEventListener("click", () => {
        todos = todos.map((itemTodo) =>
          itemTodo.id === todo.id
            ? { ...itemTodo, completed: true }
            : itemTodo
        );
        saveTodos();
        render();
      });

      item.append(text, done);
      return item;
    })
  );
  reminderList.hidden = dueToday.length === 0;
  reminderEmpty.hidden = dueToday.length > 0;
  reminderBadge.hidden = dueToday.length === 0;
  reminderBadge.textContent = dueToday.length > 99 ? "99+" : String(dueToday.length);
  notificationToggle.setAttribute(
    "aria-label",
    `Open notifications${dueToday.length ? ` (${dueToday.length})` : ""}`
  );
  reminderDate.textContent = formatDate(todayKey, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function saveReminderTimes() {
  try {
    localStorage.setItem(
      reminderStorageKey(),
      JSON.stringify(reminderTimes)
    );
    queueScheduleSync();
  } catch (error) {
    console.error("Could not save reminder times.", error);
    setReminderStatus("Could not save reminder times on this device.");
  }
}

function loadTodos() {
  try {
    const savedTodos = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(savedTodos)) return [];

    return savedTodos.filter(
      (todo) =>
        todo &&
        typeof todo.id === "string" &&
        typeof todo.text === "string" &&
        typeof todo.completed === "boolean"
    ).map((todo) => ({
      ...todo,
      date: /^\d{4}-\d{2}-\d{2}$/.test(todo.date ?? "") ? todo.date : todayKey,
    }));
  } catch (error) {
    console.error("Could not load saved tasks.", error);
    return [];
  }
}

function saveTodos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    queueScheduleSync();
    queueTaskSync();
    return true;
  } catch (error) {
    console.error("Could not save tasks to local storage.", error);
    return false;
  }
}

function setSaveStatus(message, needsReload = false) {
  saveNoteText.textContent = message;
  syncReloadButton.hidden = !needsReload;
}

function taskBackupKey(userId) {
  return `daylight-unsynced-tasks:${userId}`;
}

function taskImportKey(userId) {
  return `daylight-import-tasks:${userId}`;
}

function queueTaskSync() {
  if (!authRequired || !signedInUser) return;
  const snapshot = todos.map(({ id, text, completed, date }) => ({
    id,
    text,
    completed,
    date,
  }));
  localStorage.setItem(
    taskBackupKey(signedInUser.id),
    JSON.stringify(snapshot)
  );
  taskSyncPending += 1;
  setSaveStatus("Saving to your account…");
  taskSyncQueue = taskSyncQueue.then(async () => {
    try {
      if (taskSyncConflict) return;
      const result = await apiRequest("/api/tasks", "PUT", {
        revision: taskRevision,
        tasks: snapshot,
      });
      taskRevision = result.revision;
      if (taskSyncPending === 1) {
        localStorage.removeItem(taskBackupKey(signedInUser.id));
        localStorage.removeItem(taskImportKey(signedInUser.id));
      }
    } catch (error) {
      taskSyncConflict = true;
      console.error("Could not sync tasks to the account.", error);
      setSaveStatus(
        "Your latest changes are saved on this device but could not sync.",
        true
      );
    } finally {
      taskSyncPending = Math.max(0, taskSyncPending - 1);
      if (!taskSyncPending && !taskSyncConflict) {
        setSaveStatus("Your tasks are synced to your account.");
      }
    }
  });
}

async function apiRequest(path, method = "GET", body) {
  const isFormData = body instanceof FormData;
  const response = await fetch(path, {
    method,
    headers: body && !isFormData ? { "Content-Type": "application/json" } : undefined,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error(`Daylight returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(result.error || `Daylight returned ${response.status}.`);
  }
  return result;
}

async function reminderApi(path, method = "GET", body) {
  return apiRequest(path, method, body);
}

async function reloadAccountTasks() {
  if (
    taskSyncConflict &&
    !window.confirm("Reloading will replace this device’s unsynced task changes. Continue?")
  ) {
    return;
  }
  try {
    await taskSyncQueue;
    const result = await apiRequest("/api/tasks");
    taskRevision = result.revision;
    taskSyncConflict = false;
    taskSyncPending = 0;
    todos = result.tasks;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    if (signedInUser) {
      localStorage.removeItem(taskBackupKey(signedInUser.id));
      localStorage.removeItem(taskImportKey(signedInUser.id));
    }
    setSaveStatus("Your tasks are synced to your account.");
    render();
  } catch (error) {
    console.error("Could not reload account tasks.", error);
    setSaveStatus(`Could not reload tasks: ${error.message}`, true);
  }
}

async function refreshAccountTasks() {
  if (
    !authRequired ||
    !signedInUser ||
    taskSyncPending ||
    taskSyncConflict
  ) {
    return;
  }
  try {
    const result = await apiRequest("/api/tasks");
    if (result.revision !== taskRevision) {
      taskRevision = result.revision;
      todos = result.tasks;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
      setSaveStatus("Your tasks are synced to your account.");
      render();
    }
  } catch (error) {
    console.error("Could not refresh account tasks.", error);
    setSaveStatus("Could not refresh your account tasks. Check your connection.");
  }
}

function showAuthMessage(message, canResend = false) {
  authStatus.textContent = message;
  resendVerificationButton.hidden = !canResend;
}

function setAccountLoadView(visible, message = "") {
  const signInElements = [
    document.querySelector(".auth-eyebrow"),
    authTitle,
    authDescription,
    document.querySelector(".auth-tabs"),
    authForm,
    forgotPasswordButton,
    resendVerificationButton,
    passwordResetForm,
    authStatus,
  ];
  signInElements.forEach((element) => {
    element.hidden = visible;
  });
  googleSignIn.hidden = visible || !googleSignInConfigured;
  accountLoadPanel.hidden = !visible;
  accountLoadStatus.textContent = message;
}

function setAuthMode(mode) {
  authMode = mode;
  authTitle.textContent = mode === "login" ? "Welcome back." : "Create your account.";
  authDescription.textContent =
    mode === "login"
      ? "Sign in to keep your tasks in sync across devices."
      : "Create an account to securely sync your tasks across devices.";
  authSubmitButton.textContent =
    mode === "login" ? "Sign in" : "Create account";
  authPasswordInput.autocomplete =
    mode === "login" ? "current-password" : "new-password";
  authConfirmField.hidden = mode !== "register";
  authPasswordConfirm.required = mode === "register";
  forgotPasswordButton.hidden = mode !== "login";
  showSignInButton.classList.toggle("is-active", mode === "login");
  showSignUpButton.classList.toggle("is-active", mode === "register");
  showSignInButton.setAttribute("aria-pressed", String(mode === "login"));
  showSignUpButton.setAttribute("aria-pressed", String(mode === "register"));
  authStatus.textContent = "";
  googleSignInStatus.textContent = "";
  resendVerificationButton.hidden = true;
}

async function submitGoogleCredential(response) {
  if (typeof response?.credential !== "string" || !response.credential) {
    googleSignInStatus.textContent = "Google did not return a sign-in credential.";
    return;
  }
  googleSignInStatus.textContent = "Signing in with Google…";
  try {
    const result = await apiRequest("/api/auth/google", "POST", {
      credential: response.credential,
    });
    googleSignInStatus.textContent = "";
    await showSignedInApp(result.user, todos);
  } catch (error) {
    console.error("Could not sign in with Google.", error);
    googleSignInStatus.textContent = error.message;
  }
}

function shouldUseGoogleRedirect() {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone =
    navigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  return isIOS || isStandalone;
}

function showGoogleRedirectError() {
  if (googleRedirectFailed) {
    googleSignInStatus.textContent =
      "Google sign-in could not be completed. Please try again.";
  }
}

async function initializeGoogleSignIn() {
  let googleClientId = "";
  try {
    const config = await apiRequest("/api/auth/config");
    googleClientId = config.googleClientId;
    if (typeof googleClientId !== "string" || !googleClientId) return;
    googleSignInConfigured = true;

    if (!window.google?.accounts?.id) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () =>
          reject(new Error("Google sign-in could not be loaded."));
        document.head.append(script);
      });
    }
    if (!window.google?.accounts?.id) {
      throw new Error("Google sign-in is unavailable in this browser.");
    }

    const useRedirect = shouldUseGoogleRedirect();
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      ux_mode: useRedirect ? "redirect" : "popup",
      ...(useRedirect
        ? { login_uri: new URL("/api/auth/google/redirect", location.origin).href }
        : {
            callback: (response) => {
              void submitGoogleCredential(response);
            },
          }),
    });
    window.google.accounts.id.renderButton(googleSignInButton, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
      width: Math.min(380, Math.max(240, window.innerWidth - 80)),
    });
    googleSignIn.hidden = authScreen.hidden;
    showGoogleRedirectError();
  } catch (error) {
    console.error("Could not initialize Google sign-in.", error);
    if (googleClientId) {
      googleSignInConfigured = true;
      googleSignIn.hidden = authScreen.hidden;
      googleSignInStatus.textContent = error.message;
    }
  }
}

function showResetForm(token) {
  passwordResetToken = token;
  authTitle.textContent = "Choose a new password.";
  authDescription.textContent = "Use at least 12 characters for your new password.";
  document.querySelector(".auth-tabs").hidden = true;
  authForm.hidden = true;
  googleSignIn.hidden = true;
  forgotPasswordButton.hidden = true;
  resendVerificationButton.hidden = true;
  passwordResetForm.hidden = false;
  resetPasswordInput.focus();
}

async function showSignedInApp(user, localTasks = []) {
  document.body.classList.remove("is-auth");
  signedInUser = user;
  taskSyncConflict = false;
  taskSyncPending = 0;
  taskSyncQueue = Promise.resolve();
  reminderTimes = loadReminderTimes();
  renderReminderTimes();
  authScreen.hidden = !authRequired;
  taskScreen.hidden = authRequired;
  reminderScreen.hidden = true;
  accountControls.hidden = !authRequired;
  saveNote.hidden = false;
  syncReloadButton.hidden = true;
  localImportNotice.hidden = true;
  if (authRequired) {
    setAccountLoadView(true, "Loading your account tasks…");
    accountEmail.textContent = user.email;
    todos = [];
    render();
    setSaveStatus("Loading your account tasks…");
    try {
      const result = await apiRequest("/api/tasks");
      taskRevision = result.revision;
      todos = result.tasks;
      let pendingTasks = [];
      let pendingBackupAvailable = false;
      let savedLocalTasks = localTasks;
      try {
        const pendingRaw = localStorage.getItem(taskBackupKey(user.id));
        if (pendingRaw !== null) {
          const savedPending = JSON.parse(pendingRaw);
          if (Array.isArray(savedPending)) {
            pendingBackupAvailable = true;
            pendingTasks = savedPending.filter(
              (task) =>
                task &&
                typeof task.id === "string" &&
                typeof task.text === "string" &&
                typeof task.completed === "boolean" &&
                /^\d{4}-\d{2}-\d{2}$/.test(task.date ?? "")
            );
          }
        }
        if (!savedLocalTasks.length) {
          const savedImport = JSON.parse(
            localStorage.getItem(taskImportKey(user.id)) ?? "[]"
          );
          if (Array.isArray(savedImport)) {
            savedLocalTasks = savedImport.filter(
              (task) =>
                task &&
                typeof task.id === "string" &&
                typeof task.text === "string" &&
                typeof task.completed === "boolean" &&
                /^\d{4}-\d{2}-\d{2}$/.test(task.date ?? "")
            );
          }
        }
      } catch (error) {
        console.error("Could not read the unsynced task backup.", error);
      }
      if (pendingBackupAvailable) {
        localTasksToImport = pendingTasks;
        importLocalTasksButton.textContent = "Use saved task list";
        skipLocalImportButton.textContent = "Keep account list";
        localImportMessage.textContent =
          `This device has unsynced changes${pendingTasks.length ? ` for ${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"}` : ""}. Replace the account list with the saved copy?`;
        localImportNotice.hidden = false;
      } else if (!todos.length && savedLocalTasks.length) {
        localTasksToImport = savedLocalTasks;
        localStorage.setItem(
          taskImportKey(user.id),
          JSON.stringify(savedLocalTasks)
        );
        importLocalTasksButton.textContent = "Import tasks";
        skipLocalImportButton.textContent = "Start fresh";
        localImportMessage.textContent =
          `This browser has ${savedLocalTasks.length} saved task${savedLocalTasks.length === 1 ? "" : "s"}. Import them into this account?`;
        localImportNotice.hidden = false;
      } else if (todos.length) {
        localStorage.removeItem(taskImportKey(user.id));
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
      setSaveStatus("Your tasks are synced to your account.");
      accountLoadPanel.hidden = true;
      authScreen.hidden = true;
      taskScreen.hidden = false;
    } catch (error) {
      console.error("Could not load account tasks.", error);
      setAccountLoadView(
        true,
        `Could not load your account tasks: ${error.message}`
      );
      authScreen.hidden = false;
      taskScreen.hidden = true;
      saveNote.hidden = true;
    }
  } else {
    setAccountLoadView(false);
    authScreen.hidden = true;
    taskScreen.hidden = false;
    setSaveStatus("Your list is saved on this device");
  }
  render();
  await initializeReminderService();
  if (new URLSearchParams(location.search).get("screen") === "reminders") {
    showReminderScreen();
  }
}

function showSignInScreen(message = "") {
  document.body.classList.add("is-auth");
  authScreen.hidden = false;
  taskScreen.hidden = true;
  reminderScreen.hidden = true;
  accountControls.hidden = true;
  saveNote.hidden = true;
  syncReloadButton.hidden = true;
  signedInUser = null;
  setAccountLoadView(false);
  setAuthMode("login");
  authForm.hidden = false;
  passwordResetForm.hidden = true;
  document.querySelector(".auth-tabs").hidden = false;
  forgotPasswordButton.hidden = false;
  showAuthMessage(message);
  authEmailInput.focus();
}

authForm.addEventListener("submit", submitAuthForm);
passwordResetForm.addEventListener("submit", submitPasswordReset);
showSignInButton.addEventListener("click", () => setAuthMode("login"));
showSignUpButton.addEventListener("click", () => setAuthMode("register"));
forgotPasswordButton.addEventListener("click", requestPasswordReset);
resendVerificationButton.addEventListener("click", resendVerificationEmail);
signOutButton.addEventListener("click", signOut);
syncReloadButton.addEventListener("click", reloadAccountTasks);
retryAccountLoadButton.addEventListener("click", () => {
  if (signedInUser) showSignedInApp(signedInUser);
});
importLocalTasksButton.addEventListener("click", () => {
  if (signedInUser) {
    localStorage.removeItem(taskBackupKey(signedInUser.id));
    localStorage.removeItem(taskImportKey(signedInUser.id));
  }
  todos = localTasksToImport;
  localTasksToImport = [];
  localImportNotice.hidden = true;
  saveTodos();
  render();
});
skipLocalImportButton.addEventListener("click", () => {
  if (signedInUser) {
    localStorage.removeItem(taskBackupKey(signedInUser.id));
    localStorage.removeItem(taskImportKey(signedInUser.id));
  }
  localTasksToImport = [];
  localImportNotice.hidden = true;
  render();
});
window.addEventListener("focus", refreshAccountTasks);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshAccountTasks();
});

async function startApp() {
  try {
    const result = await apiRequest("/api/auth/me");
    authRequired = result.authRequired;
    if (!authRequired) {
      await showSignedInApp(null);
      return;
    }
    const hash = new URLSearchParams(location.hash.slice(1));
    const verifyToken = hash.get("verify");
    const resetToken = hash.get("reset");
    if (resetToken) {
      showSignInScreen();
      showResetForm(resetToken);
      return;
    }
    if (verifyToken) {
      try {
        const verification = await apiRequest("/api/auth/verify-email", "POST", {
          token: verifyToken,
        });
        history.replaceState(null, "", `${location.pathname}${location.search}`);
        await showSignedInApp(verification.user, todos);
      } catch (error) {
        showSignInScreen();
        showAuthMessage(error.message);
      }
      return;
    }
    if (result.user) {
      await showSignedInApp(result.user, todos);
      return;
    }
    showSignInScreen();
    showGoogleRedirectError();
  } catch (error) {
    if (location.protocol === "file:") {
      authRequired = false;
      await showSignedInApp(null);
      return;
    }
    console.error("Could not check the account session.", error);
    showSignInScreen(`Could not connect to Daylight: ${error.message}`);
    showGoogleRedirectError();
  }
}

async function submitAuthForm(event) {
  event.preventDefault();
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (authMode === "register" && password !== authPasswordConfirm.value) {
    showAuthMessage("The passwords do not match.");
    authPasswordConfirm.focus();
    return;
  }
  try {
    const endpoint =
      authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    const result = await apiRequest(endpoint, "POST", { email, password });
    if (authMode === "register") {
      authStatus.textContent = result.message;
      resendVerificationButton.hidden = false;
      return;
    }
    await showSignedInApp(result.user, todos);
  } catch (error) {
    const canResend = error.message.toLowerCase().includes("verify your email");
    showAuthMessage(error.message, canResend);
  }
}

async function submitPasswordReset(event) {
  event.preventDefault();
  if (resetPasswordInput.value !== resetPasswordConfirm.value) {
    showAuthMessage("The passwords do not match.");
    resetPasswordConfirm.focus();
    return;
  }
  try {
    const result = await apiRequest("/api/auth/reset-password", "POST", {
      token: passwordResetToken,
      password: resetPasswordInput.value,
    });
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    await showSignedInApp(result.user, todos);
  } catch (error) {
    showAuthMessage(error.message);
  }
}

async function requestPasswordReset() {
  const email = authEmailInput.value.trim();
  if (!email) {
    showAuthMessage("Enter your email address first.");
    authEmailInput.focus();
    return;
  }
  try {
    const result = await apiRequest("/api/auth/forgot-password", "POST", { email });
    showAuthMessage(result.message);
  } catch (error) {
    showAuthMessage(error.message);
  }
}

async function resendVerificationEmail() {
  const email = authEmailInput.value.trim();
  if (!email) {
    showAuthMessage("Enter your email address first.");
    authEmailInput.focus();
    return;
  }
  try {
    const result = await apiRequest(
      "/api/auth/resend-verification",
      "POST",
      { email }
    );
    showAuthMessage(result.message);
  } catch (error) {
    showAuthMessage(error.message);
  }
}

async function signOut() {
  try {
    await taskSyncQueue;
    const subscription =
      await serviceWorkerRegistration?.pushManager.getSubscription();
    if (subscription) {
      try {
        await reminderApi("/api/subscribe", "DELETE", {
          endpoint: subscription.endpoint,
        });
      } catch (error) {
        console.error("Could not remove the account reminder subscription.", error);
      }
      try {
        await subscription.unsubscribe();
      } catch (error) {
        console.error("Could not unsubscribe this browser from reminders.", error);
      }
    }
    await apiRequest("/api/auth/logout", "POST", {});
    remindersEnabled = false;
    taskSyncConflict = false;
    taskSyncPending = 0;
    taskSyncQueue = Promise.resolve();
    enableRemindersButton.textContent = "Enable notifications";
    accountControls.hidden = true;
    localImportNotice.hidden = true;
    showSignInScreen("You have signed out.");
  } catch (error) {
    console.error("Could not sign out.", error);
    setSaveStatus(`Could not sign out: ${error.message}`);
  }
}

function queueScheduleSync() {
  if (!serviceWorkerRegistration || !remindersEnabled) return;
  window.clearTimeout(scheduleSyncTimer);
  scheduleSyncTimer = window.setTimeout(() => {
    syncReminderSchedule().catch((error) => {
      console.error("Could not sync the reminder schedule.", error);
      setReminderStatus("Reminder schedule could not sync. Keep the local server running.");
    });
  }, 250);
}

async function syncReminderSchedule() {
  const subscription =
    await serviceWorkerRegistration?.pushManager.getSubscription();
  if (!subscription) {
    remindersEnabled = false;
    enableRemindersButton.textContent = "Enable notifications";
    return;
  }

  await reminderApi("/api/schedule", "PUT", {
    endpoint: subscription.endpoint,
    times: reminderTimes,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tasksDate: todayKey,
    hasTasks: todos.some(
      (todo) => todo.date === todayKey && !todo.completed
    ),
  });
}

function decodeApplicationServerKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function initializeReminderService() {
  renderReminderTimes();
  renderReminders();

  if (location.protocol === "file:") {
    enableRemindersButton.disabled = true;
    setReminderStatus("Run the app with npm start to enable reminders.");
    return;
  }

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    enableRemindersButton.disabled = true;
    setReminderStatus("This browser does not support push notifications.");
    return;
  }

  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register("/sw.js");
    const subscription =
      await serviceWorkerRegistration.pushManager.getSubscription();

    if (subscription && Notification.permission === "granted") {
      remindersEnabled = true;
      enableRemindersButton.textContent = "Disable notifications";
      setReminderStatus("Browser reminders are enabled.");
      await syncReminderSchedule();
    } else if (Notification.permission === "denied") {
      setReminderStatus("Notifications are blocked in browser settings.");
    } else {
      setReminderStatus("Enable notifications to receive scheduled reminders.");
    }
  } catch (error) {
    console.error("Could not initialize browser reminders.", error);
    setReminderStatus("Reminder service unavailable. Start it with npm start.");
  }
}

async function enableOrDisableReminders() {
  if (remindersEnabled) {
    try {
      const subscription =
        await serviceWorkerRegistration.pushManager.getSubscription();
      if (subscription) {
        await reminderApi("/api/subscribe", "DELETE", {
          endpoint: subscription.endpoint,
        });
        await subscription.unsubscribe();
      }
      remindersEnabled = false;
      enableRemindersButton.textContent = "Enable notifications";
      setReminderStatus("Browser reminders are disabled.");
    } catch (error) {
      console.error("Could not disable browser reminders.", error);
      setReminderStatus("Could not disable reminders. Keep the local server running.");
    }
    return;
  }

  if (location.protocol === "file:") {
    setReminderStatus("Run the app with npm start to enable reminders.");
    return;
  }

  try {
    const permissionRequest =
      Notification.permission === "default"
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission);
    const permission = await permissionRequest;
    if (permission !== "granted") {
      setReminderStatus("Allow notifications in your browser to enable reminders.");
      return;
    }

    const registration =
      serviceWorkerRegistration || (await navigator.serviceWorker.ready);
    serviceWorkerRegistration = registration;
    const { publicKey } = await reminderApi("/api/config");
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(publicKey),
      });
    }

    await reminderApi("/api/subscribe", "POST", {
      subscription: subscription.toJSON(),
      times: reminderTimes,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      tasksDate: todayKey,
      hasTasks: todos.some(
        (todo) => todo.date === todayKey && !todo.completed
      ),
    });
    remindersEnabled = true;
    enableRemindersButton.textContent = "Disable notifications";
    setReminderStatus("Browser reminders are enabled.");
  } catch (error) {
    console.error("Could not enable browser reminders.", error);
    setReminderStatus(`Could not enable reminders: ${error.message}`);
  }
}

function renderCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstWeekday }, () => {
    const spacer = document.createElement("span");
    spacer.className = "calendar-day-spacer";
    spacer.setAttribute("aria-hidden", "true");
    return spacer;
  });

  calendarMonth.textContent = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(now);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const dateKey = toDateKey(date);
    const dateTodos = todos.filter((todo) => todo.date === dateKey);
    const dateButton = document.createElement("button");
    dateButton.className = "calendar-day";
    dateButton.type = "button";
    dateButton.dataset.date = dateKey;
    dateButton.textContent = String(day);
    dateButton.disabled = dateKey < todayKey;
    dateButton.classList.toggle("is-today", dateKey === todayKey);
    dateButton.classList.toggle("is-selected", dateKey === selectedDate);
    dateButton.classList.toggle("has-tasks", dateTodos.length > 0);
    dateButton.setAttribute("aria-pressed", String(dateKey === selectedDate));

    const taskSummary = dateTodos.length
      ? `, ${dateTodos.length} ${dateTodos.length === 1 ? "task" : "tasks"}`
      : ", no tasks";
    dateButton.setAttribute(
      "aria-label",
      `${formatDate(dateKey, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}${taskSummary}`
    );
    dateButton.addEventListener("click", () => {
      selectedDate = dateKey;
      editingTodoId = null;
      render();
      calendarGrid.querySelector(".is-selected")?.focus();
    });
    cells.push(dateButton);
  }

  calendarGrid.replaceChildren(...cells);
}

function createTodoElement(todo) {
  const item = document.createElement("li");
  item.className = `todo-item${todo.completed ? " is-complete" : ""}`;

  const toggle = document.createElement("button");
  toggle.className = "todo-toggle";
  toggle.type = "button";
  toggle.setAttribute(
    "aria-label",
    `${todo.completed ? "Mark as to do" : "Mark as done"}: ${todo.text}`
  );
  toggle.setAttribute("aria-pressed", String(todo.completed));
  if (todo.completed) {
    toggle.innerHTML =
      '<svg viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m2 6 2.5 2.5L10 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  const actions = document.createElement("div");
  actions.className = "todo-actions";

  if (todo.id === editingTodoId) {
    const editor = document.createElement("input");
    editor.className = "todo-edit-input";
    editor.type = "text";
    editor.maxLength = 160;
    editor.value = todo.text;
    editor.setAttribute("aria-label", `Edit task: ${todo.text}`);

    const save = document.createElement("button");
    save.className = "edit-action";
    save.type = "button";
    save.textContent = "✓";
    save.setAttribute("aria-label", "Save changes");

    const cancel = document.createElement("button");
    cancel.className = "edit-action";
    cancel.type = "button";
    cancel.textContent = "×";
    cancel.setAttribute("aria-label", "Cancel editing");

    const finishEditing = (shouldSave) => {
      const text = editor.value.trim();
      if (shouldSave && !text) {
        editor.focus();
        return;
      }

      if (shouldSave) {
        todos = todos.map((itemTodo) =>
          itemTodo.id === todo.id ? { ...itemTodo, text } : itemTodo
        );
        saveTodos();
      }
      editingTodoId = null;
      render();
    };

    save.addEventListener("click", () => finishEditing(true));
    cancel.addEventListener("click", () => finishEditing(false));
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finishEditing(true);
      } else if (event.key === "Escape") {
        finishEditing(false);
      }
    });

    actions.append(save, cancel);
    item.append(toggle, editor, actions);
    return item;
  }

  const text = document.createElement("span");
  text.className = "todo-text";
  text.textContent = todo.text;

  const edit = document.createElement("button");
  edit.className = "edit-button";
  edit.type = "button";
  edit.textContent = "✎";
  edit.setAttribute("aria-label", `Edit task: ${todo.text}`);

  const remove = document.createElement("button");
  remove.className = "delete-button";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `Delete task: ${todo.text}`);

  edit.addEventListener("click", () => {
    editingTodoId = todo.id;
    render();
  });

  toggle.addEventListener("click", () => {
    todos = todos.map((itemTodo) =>
      itemTodo.id === todo.id
        ? { ...itemTodo, completed: !itemTodo.completed }
        : itemTodo
    );
    saveTodos();
    render();
  });

  remove.addEventListener("click", () => {
    todos = todos.filter((itemTodo) => itemTodo.id !== todo.id);
    if (editingTodoId === todo.id) editingTodoId = null;
    saveTodos();
    render();
  });

  actions.append(edit, remove);
  item.append(toggle, text, actions);
  return item;
}

function render() {
  const dateTodos = todos.filter((todo) => todo.date === selectedDate);
  const remaining = dateTodos.filter((todo) => !todo.completed).length;
  const visibleTodos = dateTodos.filter((todo) => {
    if (activeFilter === "active") return !todo.completed;
    if (activeFilter === "completed") return todo.completed;
    return true;
  });

  listTitle.textContent =
    selectedDate === todayKey
      ? "Today’s list"
      : `Tasks for ${formatDate(selectedDate, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}`;
  list.replaceChildren(...visibleTodos.map(createTodoElement));
  if (editingTodoId) {
    const editor = list.querySelector(".todo-edit-input");
    editor?.focus();
    editor?.select();
  }
  taskCount.textContent = `${remaining} ${remaining === 1 ? "task" : "tasks"} left`;
  emptyState.classList.toggle("is-visible", visibleTodos.length === 0);
  emptyMessage.textContent = dateTodos.length === 0
    ? selectedDate === todayKey && todos.length === 0
      ? "A fresh start. Add your first task above."
      : `No tasks planned for ${formatDate(selectedDate, {
          month: "short",
          day: "numeric",
        })}. Add one above.`
    : activeFilter === "active"
      ? "All caught up. Nothing left to do."
      : activeFilter === "completed"
        ? "No completed tasks yet."
        : "";
  clearCompletedButton.disabled = !dateTodos.some((todo) => todo.completed);
  clearCompletedButton.style.opacity = clearCompletedButton.disabled ? "0.5" : "";
  clearCompletedButton.style.cursor = clearCompletedButton.disabled
    ? "default"
    : "";
  if (calendarOpen) renderCalendar();
  renderReminders();
}

function openChat(draft = "") {
  if (!chatDialog.open) {
    chatLockedScrollY = window.scrollY;
    document.body.classList.add("chat-open");
    document.body.style.top = `-${chatLockedScrollY}px`;
    chatDialog.showModal();
  }
  if (draft) {
    chatInput.value = draft;
    chatLauncherInput.value = "";
  }
  window.requestAnimationFrame(() => chatInput.focus());
}

function updateVoiceButtons(listening, transcribing = false) {
  [chatLauncherMicButton, chatMicButton].forEach((button) => {
    button.classList.toggle("is-listening", listening);
    button.setAttribute("aria-pressed", String(listening));
    button.setAttribute("aria-label", listening ? "Stop voice recording" : "Start voice recording");
    button.title = listening ? "Stop voice recording" : "Start voice recording";
    button.disabled = transcribing || assistantBusy;
  });
}

function stopMicrophoneStream() {
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
}

function stopVoiceInput({ discard = false, status = "" } = {}) {
  voiceDiscardOnStop ||= discard;
  if (status) voiceStatus.textContent = status;
  clearTimeout(voiceRecordingTimeout);
  voiceRecordingTimeout = null;
  if (voiceStarting) {
    voiceCancelRequested = true;
    return;
  }
  if (mediaRecorder?.state === "recording") {
    try {
      mediaRecorder.stop();
    } catch (error) {
      console.error("Could not stop voice recording.", error);
      stopMicrophoneStream();
      mediaRecorder = null;
      voiceListening = false;
      chatInput.readOnly = false;
      updateVoiceButtons(false);
      voiceStatus.textContent = "Could not stop voice recording. Please try again.";
    }
  }
}

async function finishVoiceRecording(recorder) {
  clearTimeout(voiceRecordingTimeout);
  voiceRecordingTimeout = null;
  const chunks = voiceChunks;
  const wasTooLarge = voiceTooLarge;
  const shouldDiscard = voiceDiscardOnStop;
  const draft = voiceDraft;
  const audio = new Blob(chunks, {
    type: recorder.mimeType || chunks[0]?.type || "",
  });
  voiceChunks = [];
  voiceChunkBytes = 0;
  voiceTooLarge = false;
  voiceDiscardOnStop = false;
  voiceDraft = "";
  stopMicrophoneStream();
  if (mediaRecorder === recorder) mediaRecorder = null;
  voiceListening = false;
  chatInput.readOnly = false;
  updateVoiceButtons(false);

  if (wasTooLarge || audio.size > MAX_VOICE_AUDIO_BYTES) {
    voiceStatus.textContent = "That recording was too large. Please record a shorter message.";
    return;
  }
  if (shouldDiscard) {
    voiceStatus.textContent = "Voice recording discarded.";
    return;
  }
  if (!audio.size || !audio.type) {
    voiceStatus.textContent = "No audio was captured. Check your microphone and try again.";
    return;
  }

  voiceTranscribing = true;
  chatInput.readOnly = true;
  chatSubmitButton.disabled = true;
  updateVoiceButtons(false, true);
  voiceStatus.textContent = "Transcribing your recording…";
  try {
    const formData = new FormData();
    formData.append("audio", audio, voiceRecordingFilename(audio.type));
    const result = await apiRequest("/api/transcribe", "POST", formData);
    if (typeof result.transcript !== "string") {
      throw new Error("The transcription service returned an invalid response.");
    }
    const transcript = result.transcript.trim();
    if (!transcript) {
      voiceStatus.textContent = "No speech was detected. Try recording again.";
      return;
    }
    chatInput.value = [draft, transcript].filter(Boolean).join(" ").slice(0, chatInput.maxLength);
    chatInput.focus();
    voiceStatus.textContent = "Voice input captured. Review it, then send when ready.";
  } catch (error) {
    console.error("Could not transcribe voice input.", error);
    voiceStatus.textContent = `Could not transcribe the recording: ${error.message}`;
  } finally {
    voiceTranscribing = false;
    chatInput.readOnly = false;
    chatSubmitButton.disabled = assistantBusy;
    updateVoiceButtons(false);
  }
}

function voiceRecordingFilename(mimeType) {
  const extensions = {
    "audio/mp4": "m4a",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/aac": "aac",
    "audio/flac": "flac",
  };
  const baseMimeType = mimeType.split(";")[0].trim().toLowerCase();
  const extension = extensions[baseMimeType];
  if (!extension) throw new Error("The recorded audio format is not supported.");
  return `recording.${extension}`;
}

function voiceStartErrorMessage(error) {
  if (error?.name === "NotSupportedError") {
    return "This browser doesn't support a compatible audio format. You can type your message instead.";
  }
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Microphone access was denied. Allow it in your browser settings and try again.";
  }
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "No microphone was found. Connect a microphone and try again.";
  }
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return "The microphone is busy in another app. Close that app and try again.";
  }
  return "Could not start voice recording. Check your microphone permission and try again.";
}

function createVoiceRecorder(stream) {
  const mimeType =
    typeof MediaRecorder.isTypeSupported === "function"
      ? ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) =>
          MediaRecorder.isTypeSupported(type)
        )
      : null;

  if (mimeType) {
    try {
      return new MediaRecorder(stream, { mimeType });
    } catch (error) {
      if (error?.name !== "NotSupportedError") throw error;
    }
  }
  return new MediaRecorder(stream);
}

async function startVoiceInput() {
  if (voiceListening && mediaRecorder) {
    stopVoiceInput({ status: "Transcribing your recording…" });
    return;
  }
  if (voiceStarting) {
    voiceCancelRequested = true;
    return;
  }
  if (voiceTranscribing || assistantBusy) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    voiceStatus.textContent = "Voice recording isn’t supported by this browser. You can type your message instead.";
    return;
  }

  voiceStarting = true;
  voiceCancelRequested = false;
  voiceStatus.textContent = "Waiting for microphone access…";
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (voiceCancelRequested || !chatDialog.open) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const recorder = createVoiceRecorder(stream);
    voiceDraft = chatInput.value.trim();
    voiceChunks = [];
    voiceChunkBytes = 0;
    voiceDiscardOnStop = false;
    voiceTooLarge = false;
    microphoneStream = stream;
    mediaRecorder = recorder;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      voiceChunkBytes += event.data.size;
      if (voiceChunkBytes > MAX_VOICE_AUDIO_BYTES) {
        voiceTooLarge = true;
        stopVoiceInput({
          discard: true,
          status: "Recording exceeded the audio limit. Please record a shorter message.",
        });
        return;
      }
      voiceChunks.push(event.data);
    };
    recorder.onerror = (event) => {
      console.error("Voice recording failed.", event.error);
      stopVoiceInput({
        discard: true,
        status: "Voice recording failed. Check your microphone and try again.",
      });
    };
    recorder.onstop = () => {
      void finishVoiceRecording(recorder);
    };
    recorder.start(250);
    voiceListening = true;
    chatInput.readOnly = true;
    updateVoiceButtons(true);
    voiceStatus.textContent = "Recording… Tap the microphone to stop. Stops automatically after 60 seconds.";
    voiceRecordingTimeout = setTimeout(() => {
      stopVoiceInput({ status: "60-second limit reached. Transcribing your recording…" });
    }, MAX_VOICE_RECORDING_MS);
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
    mediaRecorder = null;
    voiceListening = false;
    chatInput.readOnly = false;
    updateVoiceButtons(false);
    console.error("Could not start voice recording.", error);
    voiceStatus.textContent = voiceStartErrorMessage(error);
  } finally {
    voiceStarting = false;
  }
}

function appendChatMessage(role, content) {
  chatMessages.querySelector(".chat-welcome")?.remove();
  const message = document.createElement("article");
  message.className = `chat-message chat-message-${role}`;
  const label = document.createElement("span");
  label.className = "chat-message-label";
  label.textContent = role === "user" ? "You" : "Daylight AI";
  const text = document.createElement("p");
  text.className = "chat-message-text";
  text.textContent = content;
  message.append(label, text);
  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

function describeAssistantChange(change) {
  if (change.action === "add") {
    return `Add “${change.text}” for ${formatDate(change.date, {
      month: "short",
      day: "numeric",
    })}`;
  }
  const task = todos.find((item) => item.id === change.taskId);
  if (!task) return "This task is no longer available.";
  if (change.action === "edit") return `Rename “${task.text}” to “${change.text}”`;
  if (change.action === "complete") return `Mark “${task.text}” as done`;
  return `Schedule “${task.text}” for ${formatDate(change.date, {
    month: "short",
    day: "numeric",
  })}`;
}

function applyAssistantChanges(changes) {
  const nextTodos = todos.map((todo) => ({ ...todo }));
  const changedTaskIds = new Set();
  for (const change of changes) {
    if (
      change.action === "add" &&
      typeof change.text === "string" &&
      change.text.trim() &&
      change.text.length <= 160 &&
      /^\d{4}-\d{2}-\d{2}$/.test(change.date)
    ) {
      nextTodos.unshift({
        id: crypto.randomUUID(),
        text: change.text,
        completed: false,
        date: change.date,
      });
      continue;
    }

    if (
      !["edit", "complete", "schedule"].includes(change.action) ||
      typeof change.taskId !== "string" ||
      changedTaskIds.has(change.taskId)
    ) {
      throw new Error("The assistant proposed an unsupported task change.");
    }
    const currentTask = nextTodos.find((todo) => todo.id === change.taskId);
    if (!currentTask) {
      throw new Error("This task no longer exists. Ask the assistant to try again.");
    }
    if (
      currentTask.text !== change.expectedText ||
      currentTask.date !== change.expectedDate ||
      currentTask.completed !== change.expectedCompleted
    ) {
      throw new Error("This task changed since the proposal. Ask the assistant to try again.");
    }
    changedTaskIds.add(change.taskId);

    if (change.action === "edit" && typeof change.text === "string" && change.text.trim()) {
      currentTask.text = change.text;
    } else if (change.action === "complete") {
      currentTask.completed = true;
    } else if (
      change.action === "schedule" &&
      typeof change.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(change.date)
    ) {
      currentTask.date = change.date;
    } else {
      throw new Error("The assistant proposed an invalid task change.");
    }
  }

  const previousTodos = todos;
  todos = nextTodos;
  if (!saveTodos()) {
    todos = previousTodos;
    render();
    throw new Error("Could not save the assistant’s task changes on this device.");
  }
  render();
}

function appendAssistantProposals(changes) {
  const list = document.createElement("div");
  list.className = "chat-proposals";
  const proposals = changes.map((change) => {
    const proposal = document.createElement("section");
    proposal.className = "chat-proposal";
    const summary = document.createElement("p");
    summary.className = "chat-proposal-summary";
    summary.textContent = describeAssistantChange(change);

    const status = document.createElement("p");
    status.className = "chat-proposal-status";
    status.setAttribute("role", "status");
    proposal.append(summary, status);
    list.append(proposal);
    return { proposal, status };
  });
  try {
    applyAssistantChanges(changes);
    proposals.forEach(({ proposal, status }) => {
      status.textContent = "Applied automatically";
      proposal.classList.add("is-resolved");
    });
  } catch (error) {
    console.error("Could not automatically apply assistant task changes.", error);
    proposals.forEach(({ status }) => {
      status.textContent = `Not applied: ${error.message}`;
    });
  }
  chatMessages.append(list);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChatMessage(rawMessage) {
  const message = rawMessage.trim();
  if (!message || assistantBusy) return;

  chatInput.value = "";
  appendChatMessage("user", message);
  const pendingMessage = appendChatMessage("assistant", "Thinking…");
  pendingMessage.classList.add("is-pending");
  assistantBusy = true;
  chatInput.disabled = true;
  chatSubmitButton.disabled = true;
  chatMicButton.disabled = true;

  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: assistantHistory.slice(-8),
        ...(!authRequired
          ? {
              tasks: [
                ...todos.filter((todo) => todo.date === selectedDate),
                ...todos.filter((todo) => todo.date !== selectedDate),
              ].slice(0, 100).map(({ id, text, completed, date }) => ({
                id,
                text,
                completed,
                date,
              })),
            }
          : {}),
        today: todayKey,
        selectedDate,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      if (!response.ok) {
        throw new Error(`AI service returned HTTP ${response.status} (${response.statusText}).`);
      }
      throw new Error("AI service returned an invalid JSON response.");
    }
    if (!response.ok) {
      throw new Error(result.error || `AI service returned ${response.status}.`);
    }
    if (
      typeof result.reply !== "string" ||
      !Array.isArray(result.changes) ||
      result.changes.length > 8
    ) {
      throw new Error("AI service returned an invalid task proposal.");
    }

    assistantHistory.push(
      { role: "user", content: message },
      { role: "assistant", content: result.reply }
    );
    assistantHistory = assistantHistory.slice(-8);
    pendingMessage.remove();
    appendChatMessage("assistant", result.reply);
    if (result.changes.length) appendAssistantProposals(result.changes);
  } catch (error) {
    console.error("Could not get an AI response.", error);
    pendingMessage.classList.remove("is-pending");
    pendingMessage.querySelector(".chat-message-text").textContent =
      `I couldn’t get a response: ${error.message}`;
  } finally {
    assistantBusy = false;
    chatInput.disabled = false;
    chatSubmitButton.disabled = false;
    chatMicButton.disabled = false;
    chatInput.focus();
  }
}

chatLauncherInput.addEventListener("input", () => {
  if (chatLauncherInput.value.trim()) openChat(chatLauncherInput.value);
});

function submitOnEnter(event, targetForm) {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault();
    targetForm.requestSubmit();
  }
}

chatLauncherInput.addEventListener("keydown", (event) => {
  submitOnEnter(event, chatLauncher);
});

chatInput.addEventListener("keydown", (event) => {
  submitOnEnter(event, chatForm);
});

chatLauncher.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = chatLauncherInput.value;
  openChat(message);
  if (message.trim()) sendChatMessage(message);
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (voiceListening) {
    stopVoiceInput({ status: "Transcribing your recording…" });
    return;
  }
  if (voiceStarting || voiceTranscribing) {
    voiceStatus.textContent = "Wait for transcription to finish, then send your message.";
    return;
  }
  sendChatMessage(chatInput.value);
});

chatLauncherMicButton.addEventListener("click", () => {
  openChat(chatLauncherInput.value);
  startVoiceInput();
});

chatMicButton.addEventListener("click", startVoiceInput);
chatExitButton.addEventListener("click", () => chatDialog.close());
chatDialog.addEventListener("close", () => {
  document.body.classList.remove("chat-open");
  document.body.style.top = "";
  window.scrollTo(0, chatLockedScrollY);
  if (voiceStarting) voiceCancelRequested = true;
  if (voiceListening) stopVoiceInput({ discard: true });
  chatLauncherInput.focus();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }

  todos.unshift({
    id: crypto.randomUUID(),
    text,
    completed: false,
    date: selectedDate,
  });
  saveTodos();
  activeFilter = "all";
  filters.forEach((filter) => {
    const isActive = filter.dataset.filter === activeFilter;
    filter.classList.toggle("is-active", isActive);
    filter.setAttribute("aria-pressed", String(isActive));
  });
  form.reset();
  input.focus();
  render();
});

filters.forEach((filter) => {
  filter.addEventListener("click", () => {
    activeFilter = filter.dataset.filter;
    filters.forEach((button) => {
      const isActive = button === filter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    render();
  });
});

homeButton.addEventListener("click", () => {
  selectedDate = todayKey;
  activeFilter = "all";
  filters.forEach((filter) => {
    const isActive = filter.dataset.filter === activeFilter;
    filter.classList.toggle("is-active", isActive);
    filter.setAttribute("aria-pressed", String(isActive));
  });
  calendarOpen = false;
  calendarPanel.hidden = true;
  calendarToggle.classList.remove("is-active");
  calendarToggle.setAttribute("aria-expanded", "false");
  calendarToggle.setAttribute("aria-label", "Open calendar");
  render();
});

calendarToggle.addEventListener("click", () => {
  calendarOpen = !calendarOpen;
  calendarPanel.hidden = !calendarOpen;
  calendarToggle.classList.toggle("is-active", calendarOpen);
  calendarToggle.setAttribute("aria-expanded", String(calendarOpen));
  calendarToggle.setAttribute(
    "aria-label",
    calendarOpen ? "Close calendar" : "Open calendar"
  );
  if (calendarOpen) renderCalendar();
});

clearCompletedButton.addEventListener("click", () => {
  todos = todos.filter(
    (todo) => todo.date !== selectedDate || !todo.completed
  );
  if (!todos.some((todo) => todo.id === editingTodoId)) editingTodoId = null;
  saveTodos();
  render();
});

reminderTimeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const time = reminderTimeInput.value;
  if (!isValidTime(time)) {
    setReminderStatus("Choose a valid reminder time.");
    reminderTimeInput.focus();
    return;
  }
  if (reminderTimes.includes(time)) {
    setReminderStatus("That reminder time is already set.");
    return;
  }
  if (reminderTimes.length >= 8) {
    setReminderStatus("You can set up to 8 reminder times.");
    return;
  }

  reminderTimes = [...reminderTimes, time].sort();
  saveReminderTimes();
  renderReminderTimes();
  setReminderStatus("Reminder time added.");
});

notificationToggle.addEventListener("click", () => {
  showReminderScreen(false, notificationToggle);
});

settingsToggle.addEventListener("click", () => {
  showReminderScreen(true, settingsToggle);
});

backToListButton.addEventListener("click", () => {
  reminderScreen.hidden = true;
  taskScreen.hidden = false;
  reminderReturnFocus.focus();
});

enableRemindersButton.addEventListener("click", enableOrDisableReminders);

function showReminderScreen(focusSettings = false, returnFocus = notificationToggle) {
  taskScreen.hidden = true;
  reminderScreen.hidden = false;
  reminderReturnFocus = returnFocus;
  reminderScreenTitle.textContent = focusSettings
    ? "Reminder settings"
    : "Notifications";
  reminderDate.hidden = focusSettings;
  notificationsPanel.hidden = focusSettings;
  reminderSettingsPanel.hidden = !focusSettings;
  renderReminders();
  (focusSettings ? reminderSettingsTitle : reminderScreenTitle).focus();
}

void initializeGoogleSignIn();
startApp();
