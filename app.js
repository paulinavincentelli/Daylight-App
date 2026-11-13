const STORAGE_KEY = "daylight-todos";
const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const list = document.querySelector("#todo-list");
const emptyState = document.querySelector("#empty-state");
const emptyMessage = document.querySelector("#empty-message");
const taskCount = document.querySelector("#task-count");
const listTitle = document.querySelector("#list-title");
const clearCompletedButton = document.querySelector("#clear-completed");
const filters = [...document.querySelectorAll(".filter")];
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

let activeFilter = "all";
let editingTodoId = null;
const todayKey = toDateKey(new Date());
let selectedDate = todayKey;
let calendarOpen = false;
let serviceWorkerRegistration = null;
let remindersEnabled = false;
let scheduleSyncTimer = null;
let reminderReturnFocus = notificationToggle;
let reminderTimes = loadReminderTimes();
let todos = loadTodos();
let assistantHistory = [];
let assistantBusy = false;
let speechRecognition = null;
let voiceListening = false;
let voiceHadResult = false;
let voiceErrorOccurred = false;
let voiceStopRequested = false;
let voiceDraft = "";

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
      localStorage.getItem("daylight-reminder-times") ?? '["08:00"]'
    );
    if (!Array.isArray(savedTimes)) return ["08:00"];
    return [...new Set(savedTimes.filter(isValidTime))].sort().slice(0, 8);
  } catch (error) {
    console.error("Could not load reminder times.", error);
    return ["08:00"];
  }
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
    `Open today’s reminders${dueToday.length ? ` (${dueToday.length})` : ""}`
  );
  document.querySelector("#reminder-date").textContent = formatDate(todayKey, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function saveReminderTimes() {
  try {
    localStorage.setItem(
      "daylight-reminder-times",
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
    return true;
  } catch (error) {
    console.error("Could not save tasks to local storage.", error);
    return false;
  }
}

async function reminderApi(path, method = "GET", body) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error(`Reminder service returned an invalid response: ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(result.error || `Reminder service returned ${response.status}.`);
  }
  return result;
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
  if (!chatDialog.open) chatDialog.showModal();
  if (draft) {
    chatInput.value = draft;
    chatLauncherInput.value = "";
  }
  window.requestAnimationFrame(() => chatInput.focus());
}

function updateVoiceButtons(listening) {
  [chatLauncherMicButton, chatMicButton].forEach((button) => {
    button.classList.toggle("is-listening", listening);
    button.setAttribute("aria-pressed", String(listening));
    button.setAttribute("aria-label", listening ? "Stop voice input" : "Start voice input");
    button.title = listening ? "Stop voice input" : "Start voice input";
  });
}

function startVoiceInput() {
  if (voiceListening && speechRecognition) {
    voiceStopRequested = true;
    voiceStatus.textContent = "Stopping voice input…";
    speechRecognition.stop();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceStatus.textContent = "Voice input isn’t supported by this browser. You can type your message instead.";
    return;
  }

  const recognition = new SpeechRecognition();
  speechRecognition = recognition;
  recognition.lang = navigator.language || "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  voiceDraft = chatInput.value.trim();
  voiceHadResult = false;
  voiceErrorOccurred = false;
  voiceStopRequested = false;

  recognition.onstart = () => {
    voiceListening = true;
    chatInput.readOnly = true;
    updateVoiceButtons(true);
    voiceStatus.textContent = "Listening… Speak your message.";
  };

  recognition.onresult = (event) => {
    const transcript = [...event.results]
      .map((result) => result[0].transcript)
      .join("")
      .trim();
    if (!transcript) return;
    voiceHadResult = true;
    chatInput.value = [voiceDraft, transcript].filter(Boolean).join(" ");
  };

  recognition.onerror = (event) => {
    voiceErrorOccurred = true;
    const messages = {
      "not-allowed": "Microphone access was denied. Allow it in your browser settings and try again.",
      "service-not-allowed": "The browser’s speech service is unavailable or not allowed.",
      "audio-capture": "No microphone was found. Check your microphone and try again.",
      "no-speech": "No speech was detected. Try again.",
      network: "The browser’s speech service could not be reached. Check your connection and try again.",
      aborted: "Voice input stopped.",
    };
    voiceStatus.textContent = messages[event.error] || "Voice input failed. You can type your message instead.";
  };

  recognition.onend = () => {
    voiceListening = false;
    chatInput.readOnly = false;
    updateVoiceButtons(false);
    speechRecognition = null;
    if (voiceErrorOccurred) return;
    voiceStatus.textContent = voiceHadResult
      ? "Voice input captured. Review it, then send when ready."
      : voiceStopRequested
        ? "Voice input stopped."
        : "No speech was detected. Try again.";
  };

  try {
    recognition.start();
  } catch (error) {
    speechRecognition = null;
    voiceErrorOccurred = true;
    console.error("Could not start voice input.", error);
    voiceStatus.textContent = "Could not start voice input. Check your microphone permission and try again.";
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

function applyAssistantChange(change) {
  const previousTodos = todos;
  const currentTask = change.taskId
    ? todos.find((todo) => todo.id === change.taskId)
    : null;
  if (change.taskId && !currentTask) {
    throw new Error("This task no longer exists. Ask the assistant to try again.");
  }
  if (
    currentTask &&
    (currentTask.text !== change.expectedText ||
      currentTask.date !== change.expectedDate ||
      currentTask.completed !== change.expectedCompleted)
  ) {
    throw new Error("This task changed since the proposal. Ask the assistant to try again.");
  }

  if (change.action === "add") {
    todos = [{
      id: crypto.randomUUID(),
      text: change.text,
      completed: false,
      date: change.date,
    }, ...todos];
  } else if (change.action === "edit") {
    todos = todos.map((todo) =>
      todo.id === change.taskId ? { ...todo, text: change.text } : todo
    );
  } else if (change.action === "complete") {
    todos = todos.map((todo) =>
      todo.id === change.taskId ? { ...todo, completed: true } : todo
    );
  } else if (change.action === "schedule") {
    todos = todos.map((todo) =>
      todo.id === change.taskId ? { ...todo, date: change.date } : todo
    );
  } else {
    throw new Error("The assistant proposed an unsupported task change.");
  }
  if (!saveTodos()) {
    todos = previousTodos;
    render();
    throw new Error("Could not save this task change on the device.");
  }
  render();
}

function appendAssistantProposals(changes) {
  const list = document.createElement("div");
  list.className = "chat-proposals";
  changes.forEach((change) => {
    const proposal = document.createElement("section");
    proposal.className = "chat-proposal";
    const summary = document.createElement("p");
    summary.className = "chat-proposal-summary";
    summary.textContent = describeAssistantChange(change);

    const status = document.createElement("p");
    status.className = "chat-proposal-status";
    status.setAttribute("role", "status");
    status.textContent = "Waiting for your approval";

    const actions = document.createElement("div");
    actions.className = "chat-proposal-actions";
    const approve = document.createElement("button");
    approve.type = "button";
    approve.className = "chat-approve-button";
    approve.textContent = "Approve";
    approve.addEventListener("click", () => {
      try {
        applyAssistantChange(change);
        status.textContent = "Applied";
        proposal.classList.add("is-resolved");
        approve.disabled = true;
        dismiss.disabled = true;
      } catch (error) {
        console.error("Could not apply the proposed task change.", error);
        status.textContent = error.message;
      }
    });

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "chat-dismiss-button";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => {
      status.textContent = "Dismissed";
      proposal.classList.add("is-resolved");
      approve.disabled = true;
      dismiss.disabled = true;
    });

    actions.append(approve, dismiss);
    proposal.append(summary, status, actions);
    list.append(proposal);
  });
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
        tasks: [
          ...todos.filter((todo) => todo.date === selectedDate),
          ...todos.filter((todo) => todo.date !== selectedDate),
        ].slice(0, 100).map(({ id, text, completed, date }) => ({
          id,
          text,
          completed,
          date,
        })),
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

chatLauncherInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    const message = chatLauncherInput.value;
    openChat(message);
    if (message.trim()) sendChatMessage(message);
  }
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
    voiceStopRequested = true;
    voiceStatus.textContent = "Stopping voice input. Review the transcript, then send it.";
    speechRecognition.stop();
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
  if (voiceListening) speechRecognition?.abort();
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
  renderReminders();
  if (focusSettings) reminderSettingsTitle.focus();
}

if (new URLSearchParams(location.search).get("screen") === "reminders") {
  showReminderScreen();
}

initializeReminderService();
render();
