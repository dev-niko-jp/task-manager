"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";

/* ===== Types ===== */
type Recurrence = "none" | "daily" | "weekly" | "monthly";

type Task = {
  id: string;
  title: string;
  completed: boolean;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  recurrence?: Recurrence;
  createdAt?: string;
};

type CountdownState = {
  title: string;
  time: string;
  color: string;
};

/* ===== Helpers ===== */
const genId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const toDateTime = (d?: string, t?: string, fallbackTime = "00:00") =>
  d ? new Date(`${d}T${t || fallbackTime}`) : null;

const pad2 = (n: number) => n.toString().padStart(2, "0");

const addToYMD = (ymd: string, { days = 0, months = 0 }: { days?: number; months?: number }) => {
  const dt = new Date(`${ymd}T00:00`);
  if (months) dt.setMonth(dt.getMonth() + months);
  if (days) dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
};

const nextByRecurrence = (date: string | undefined, rule: Recurrence): string | undefined => {
  if (!date) return undefined;
  switch (rule) {
    case "daily": return addToYMD(date, { days: 1 });
    case "weekly": return addToYMD(date, { days: 7 });
    case "monthly": return addToYMD(date, { months: 1 });
    default: return undefined;
  }
};

/* ===== 固定クラス（ツリーシェイク対策） ===== */
const COLOR = {
  blue: "bg-blue-600",
  yellow: "bg-yellow-400",
  red: "bg-red-600",
  redPulse: "bg-red-600 animate-pulse",
} as const;

const ui = {
  shell: "min-h-screen bg-gray-50 dark:bg-gray-900",
  container: "mx-auto max-w-4xl p-6 text-gray-900 dark:text-gray-100",

  topbar:
    "mb-6 rounded-2xl border border-gray-200/70 dark:border-gray-700/60 " +
    "bg-white/80 dark:bg-gray-800/70 backdrop-blur px-4 py-3 shadow-md " +
    "flex flex-wrap gap-3 justify-between items-center",

  badge: "text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700",

  bannerBase: "mb-6 p-6 rounded-2xl text-white text-center shadow-xl ring-1 ring-white/10 transition-colors",

  input:
    "border rounded-xl px-3 py-2 bg-white dark:bg-gray-800 " +
    "border-gray-300 dark:border-gray-700 focus:outline-none " +
    "focus:ring-2 focus:ring-indigo-500 transition",
  select:
    "border rounded-xl px-3 py-2 bg-white dark:bg-gray-800 " +
    "border-gray-300 dark:border-gray-700 focus:outline-none " +
    "focus:ring-2 focus:ring-indigo-500 transition",

  btnPrimary:
    "px-4 py-2 rounded-xl bg-indigo-600 text-white shadow hover:bg-indigo-700 active:scale-[0.99] transition",
  btnSecondary:
    "px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 shadow-sm hover:bg-white dark:hover:bg-gray-800 active:scale-[0.99] transition",
  btnLinkBlue: "text-sm text-blue-600 hover:underline",
  btnLinkGreen: "text-sm text-green-600 hover:underline",
  btnLinkRed: "text-sm text-red-600 hover:underline",

  card: "border rounded-2xl p-4 shadow-md bg-white dark:bg-gray-800 dark:border-gray-700 hover:shadow-lg transition",
};

/* ===== Component ===== */
export default function Home() {
  // Core
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");

  // Add form
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editRecurrence, setEditRecurrence] = useState<Recurrence>("none");

  // UI controls
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [sort, setSort] = useState<"end" | "start" | "created" | "title">("end");
  const [isDark, setIsDark] = useState(false);

  // Countdown & audio & notification
  const [countdown, setCountdown] = useState<CountdownState | null>(null);
  const [lastColor, setLastColor] = useState<string>("");
  const [lastTaskKey, setLastTaskKey] = useState<string>("");
  const [alarmStarted, setAlarmStarted] = useState(false);

  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const notifyAudioRef = useRef<HTMLAudioElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);

  // Notifications
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | null>(null);
  const notified5minRef = useRef<Set<string>>(new Set());

  /* 初期ロード：tasks/theme 復元（layout.tsx で .dark は既に反映済み） */
  useEffect(() => {
    const stored = localStorage.getItem("tasks");
    if (stored) {
      try { setTasks(JSON.parse(stored)); } catch {}
    }
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  /* 永続化 */
  useEffect(() => {
    localStorage.setItem("tasks", JSON.stringify(tasks));
  }, [tasks]);

  /* ダーク切替（ボタン操作時） */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  /* 通知権限の同期 */
  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotifPerm(Notification.permission);
    }
  }, []);

  /* 絞り込み + ソート */
  const visibleTasks = useMemo(() => {
    let arr = tasks;
    if (filter === "active") arr = arr.filter(t => !t.completed);
    if (filter === "completed") arr = arr.filter(t => t.completed);

    const q = query.trim().toLowerCase();
    if (q) arr = arr.filter(t => t.title.toLowerCase().includes(q));

    const safeTime = (d?: string, t?: string, fallback?: string) =>
      toDateTime(d, t, fallback)?.getTime() ?? Number.POSITIVE_INFINITY;
    const getStart = (t: Task) => safeTime(t.startDate, t.startTime || "00:00");
    const getEnd = (t: Task) =>
      t.endDate
        ? safeTime(t.endDate, t.endTime || "23:59")
        : t.startDate
        ? safeTime(t.startDate, t.endTime || t.startTime || "23:59")
        : Number.POSITIVE_INFINITY;
    const getCreated = (t: Task) => (t.createdAt ? new Date(t.createdAt).getTime() : 0);

    const sorted = [...arr].sort((a, b) => {
      if (sort === "end") return getEnd(a) - getEnd(b);
      if (sort === "start") return getStart(a) - getStart(b);
      if (sort === "created") return getCreated(a) - getCreated(b);
      if (sort === "title") return a.title.localeCompare(b.title);
      return 0;
    });

    return sorted.sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1));
  }, [tasks, filter, sort, query]);

  /* 通知 */
  const requestNotifications = async () => {
    if (typeof Notification === "undefined") {
      alert("Notifications are not supported in this browser.");
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  };

  const show5minNotification = useCallback((task: Task, diffMs: number) => {
    if (typeof Notification === "undefined") return;
    if (notifPerm !== "granted") return;
    const dueIso =
      toDateTime(task.endDate || task.startDate, task.endTime || task.startTime || "23:59")?.toISOString() ?? "";
    const key = `${task.id}-${dueIso}`;
    if (notified5minRef.current.has(key)) return;
    notified5minRef.current.add(key);

    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs / 1000) % 60);
    new Notification("5 minutes left", {
      body: `${task.title} — ${mins}m ${pad2(secs)}s left`,
    });
  }, [notifPerm]);

  /* カウントダウン & アラート */
  useEffect(() => {
    const interval = setInterval(() => {
      const active = tasks.filter(t => !t.completed);
      if (!active.length) {
        if (alertAudioRef.current) {
          alertAudioRef.current.pause();
          alertAudioRef.current.currentTime = 0;
        }
        setAlarmStarted(false);
        setCountdown(null);
        setLastColor("");
        setLastTaskKey("");
        return;
      }

      const now = new Date();

      const started = active.filter(t => {
        const st = toDateTime(t.startDate, t.startTime, "00:00");
        return st ? now >= st : true;
      });

      if (!started.length) {
        if (alertAudioRef.current) {
          alertAudioRef.current.pause();
          alertAudioRef.current.currentTime = 0;
        }
        setAlarmStarted(false);
        setCountdown({ title: "No tasks started yet", time: "", color: COLOR.blue });
        return;
      }

      type Cand = { task: Task; due: Date; start: Date | null };
      const candidates: Cand[] = started
        .map(t => ({
          task: t,
          due: toDateTime(t.endDate || t.startDate, t.endTime || t.startTime || "23:59") || new Date(8640000000000000),
          start: toDateTime(t.startDate, t.startTime, "00:00"),
        }))
        .filter(c => !Number.isNaN(c.due.getTime()));

      if (!candidates.length) {
        setCountdown({ title: "Set an end date/time to enable countdown", time: "", color: COLOR.blue });
        return;
      }

      candidates.sort((a, b) => a.due.getTime() - b.due.getTime());
      const target = candidates[0];
      const targetKey = `${target.task.id}-${target.due.toISOString()}`;

      if (targetKey !== lastTaskKey) {
        if (alertAudioRef.current) {
          alertAudioRef.current.pause();
          alertAudioRef.current.currentTime = 0;
        }
        setAlarmStarted(false);
        setLastColor("");
        setLastTaskKey(targetKey);
      }

      const diffMs = target.due.getTime() - now.getTime();

      if (diffMs <= 0) {
        if (alertAudioRef.current) {
          alertAudioRef.current.pause();
          alertAudioRef.current.currentTime = 0;
        }
        setAlarmStarted(false);
        setCountdown({ title: target.task.title, time: "Done", color: COLOR.blue });
        return;
      }

      let color: string = COLOR.blue;
      if (target.start && diffMs > 5 * 60 * 1000) {
        const half = target.start.getTime() + (target.due.getTime() - target.start.getTime()) / 2;
        if (now.getTime() >= half) color = COLOR.yellow;
      } else if (diffMs <= 24 * 60 * 60 * 1000 && diffMs > 5 * 60 * 1000) {
        color = COLOR.yellow;
      }
      if (diffMs <= 5 * 60 * 1000) {
        color = COLOR.red;
        show5minNotification(target.task, diffMs);
      }

      if (diffMs <= 60 * 1000) {
        color = COLOR.redPulse;
        if (!alarmStarted) {
          alertAudioRef.current?.play().catch(() => setNeedsAudioUnlock(true));
          setAlarmStarted(true);
        }
      } else {
        if (alarmStarted && alertAudioRef.current) {
          alertAudioRef.current.pause();
          alertAudioRef.current.currentTime = 0;
        }
        if (alarmStarted) setAlarmStarted(false);
      }

      if (lastColor && color !== lastColor && diffMs > 60 * 1000) {
        notifyAudioRef.current?.play().catch(() => setNeedsAudioUnlock(true));
      }
      setLastColor(color);

      const h = Math.floor(diffMs / 3600000);
      const m = Math.floor((diffMs / 60000) % 60);
      const s = Math.floor((diffMs / 1000) % 60);
      setCountdown({
        title: target.task.title,
        time: `${h}h ${pad2(m)}m ${pad2(s)}s left`,
        color,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [tasks, lastTaskKey, lastColor, alarmStarted, show5minNotification]);

  /* CRUD */
  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const s = toDateTime(startDate, startTime, "00:00");
    const ed = toDateTime(endDate, endTime, "23:59");
    if (s && ed && ed < s) {
      alert("End date/time cannot be earlier than start date/time.");
      return;
    }

    const nowIso = new Date().toISOString();
    const newTask: Task = {
      id: genId(),
      title: input.trim(),
      completed: false,
      startDate: startDate || undefined,
      startTime: startTime || undefined,
      endDate: endDate || startDate || undefined,
      endTime: endTime || undefined,
      recurrence,
      createdAt: nowIso,
    };
    setTasks(prev => [...prev, newTask]);

    setInput("");
    setStartDate("");
    setStartTime("");
    setEndDate("");
    setEndTime("");
    setRecurrence("none");
  };

  const toggleTask = (id: string) => {
    setTasks(prev => {
      const list = prev.map(t => (t.id === id ? { ...t, completed: !t.completed } : t));
      const t = list.find(tt => tt.id === id);
      if (t?.completed && t.recurrence && t.recurrence !== "none") {
        const nextStartDate = nextByRecurrence(t.startDate, t.recurrence);
        const nextEndDate = nextByRecurrence(t.endDate || t.startDate, t.recurrence);
        if (nextStartDate || nextEndDate) {
          list.push({
            id: genId(),
            title: t.title,
            completed: false,
            startDate: nextStartDate ?? undefined,
            startTime: t.startTime,
            endDate: nextEndDate ?? undefined,
            endTime: t.endTime,
            recurrence: t.recurrence,
            createdAt: new Date().toISOString(),
          });
        }
      }
      return list;
    });
  };

  const deleteTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));

  const startEdit = (t: Task) => {
    setEditingId(t.id);
    setEditInput(t.title);
    setEditStartDate(t.startDate || "");
    setEditStartTime(t.startTime || "");
    setEditEndDate(t.endDate || "");
    setEditEndTime(t.endTime || "");
    setEditRecurrence(t.recurrence ?? "none");
  };

  const saveEdit = () => {
    if (!editingId) return;
    const s = toDateTime(editStartDate, editStartTime, "00:00");
    const ed = toDateTime(editEndDate || editStartDate, editEndTime || editStartTime || "23:59");
    if (s && ed && ed < s) {
      alert("End date/time cannot be earlier than start date/time.");
      return;
    }
    setTasks(prev =>
      prev.map(t =>
        t.id === editingId
          ? {
              ...t,
              title: editInput.trim() || t.title,
              startDate: editStartDate || undefined,
              startTime: editStartTime || undefined,
              endDate: editEndDate || editStartDate || undefined,
              endTime: editEndTime || undefined,
              recurrence: editRecurrence,
            }
          : t
      )
    );
    setEditingId(null);
    setEditInput("");
    setEditStartDate("");
    setEditStartTime("");
    setEditEndDate("");
    setEditEndTime("");
    setEditRecurrence("none");
  };

  /* Audio unlock */
  const unlockAudio = async () => {
    try {
      await notifyAudioRef.current?.play();
      notifyAudioRef.current?.pause();
      if (notifyAudioRef.current) notifyAudioRef.current.currentTime = 0;

      await alertAudioRef.current?.play();
      alertAudioRef.current?.pause();
      if (alertAudioRef.current) alertAudioRef.current.currentTime = 0;

      setNeedsAudioUnlock(false);
    } catch {
      setNeedsAudioUnlock(true);
    }
  };

  /* UI */
  return (
    <main className={ui.shell}>
      <div className={ui.container}>
        {/* Top bar */}
        <div className={ui.topbar}>
          <h1 className="text-2xl md:text-3xl font-bold">Task Manager</h1>
          <div className="flex items-center gap-2">
            <span className={ui.badge}>Dark: {isDark ? "ON" : "OFF"}</span>
            <button
              onClick={() => setIsDark(v => !v)}
              className={ui.btnSecondary}
              aria-label="Toggle dark mode"
              title="Toggle dark mode"
            >
              {isDark ? "Light mode" : "Dark mode"}
            </button>
            <button onClick={unlockAudio} className={ui.btnPrimary} aria-label="Enable sound" title="Enable sound">
              {needsAudioUnlock ? "Enable sound (tap once)" : "Enable sound"}
            </button>
            <button onClick={requestNotifications} className={ui.btnSecondary} aria-label="Enable notifications" title="Enable notifications">
              {notifPerm === null ? "Checking..." : notifPerm === "granted" ? "Notifications ON" : "Enable notifications"}
            </button>
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
                a.href = url;
                a.download = `tasks-export-${stamp}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className={ui.btnSecondary}
              aria-label="Export tasks as JSON"
              title="Export tasks as JSON"
            >
              Export
            </button>
            <button onClick={() => importInputRef.current?.click()} className={ui.btnSecondary} aria-label="Import tasks" title="Import tasks">
              Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const data = JSON.parse(reader.result as string);
                    if (!Array.isArray(data)) throw new Error("Invalid JSON");
                    const map = new Map<string, Task>();
                    [...tasks, ...data].forEach((t: Task) => map.set(t.id, t));
                    setTasks(Array.from(map.values()));
                    alert("Import successful.");
                  } catch {
                    alert("Import failed. Please select a valid JSON file.");
                  } finally {
                    if (importInputRef.current) importInputRef.current.value = "";
                  }
                };
                reader.readAsText(file);
              }}
              className="hidden"
            />
          </div>
        </div>

        {/* Hidden audio */}
        <audio ref={alertAudioRef} src="/alert.mp3" preload="auto" className="hidden" />
        <audio ref={notifyAudioRef} src="/notify.mp3" preload="auto" className="hidden" />

        {/* Countdown banner */}
        {countdown && (
          <div role="status" aria-live="polite" className={`${ui.bannerBase} ${countdown.color}`}>
            <div className="text-2xl md:text-3xl font-bold mb-1">{countdown.title}</div>
            {!!countdown.time && <div className="text-xl md:text-2xl font-semibold">{countdown.time}</div>}
          </div>
        )}

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className={ui.input} />
          <select value={filter} onChange={(e) => setFilter(e.target.value as "all" | "active" | "completed")} aria-label="Filter tasks" className={ui.select}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as "end" | "start" | "created" | "title")} aria-label="Sort tasks" className={ui.select}>
            <option value="end">End soon</option>
            <option value="start">Start soon</option>
            <option value="created">Created (oldest first)</option>
            <option value="title">Title (A→Z)</option>
          </select>
        </div>

        {/* Add Task */}
        <form onSubmit={addTask} className="grid grid-cols-1 md:grid-cols-7 gap-2 mb-8">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Task name" aria-label="Task name" className={`md:col-span-2 ${ui.input}`} />
          <input type="date" lang="en" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Start date" className={ui.input} />
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="Start time" className={ui.input} />
          <input type="date" lang="en" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="End date" className={ui.input} />
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="End time" className={ui.input} />
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)} aria-label="Recurrence" className={ui.select}>
            <option value="none">Repeat: None</option>
            <option value="daily">Repeat: Daily</option>
            <option value="weekly">Repeat: Weekly</option>
            <option value="monthly">Repeat: Monthly</option>
          </select>
          <button type="submit" className={ui.btnPrimary}>Add</button>
        </form>

        {/* Task list */}
        <ul className="space-y-3">
          {visibleTasks.map((t) => (
            <li key={t.id} className={`${ui.card} flex justify-between items-start`}>
              <div className="flex-1">
                {editingId === t.id ? (
                  <div className="flex flex-col gap-2">
                    <input type="text" value={editInput} onChange={(e) => setEditInput(e.target.value)} placeholder="Task name" aria-label="Task name (edit)" className={ui.input} />
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <input type="date" lang="en" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} aria-label="Start date (edit)" className={ui.input} />
                      <input type="time" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} aria-label="Start time (edit)" className={ui.input} />
                      <input type="date" lang="en" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} aria-label="End date (edit)" className={ui.input} />
                      <input type="time" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} aria-label="End time (edit)" className={ui.input} />
                      <select value={editRecurrence} onChange={(e) => setEditRecurrence(e.target.value as Recurrence)} aria-label="Recurrence (edit)" className={ui.select}>
                        <option value="none">Repeat: None</option>
                        <option value="daily">Repeat: Daily</option>
                        <option value="weekly">Repeat: Weekly</option>
                        <option value="monthly">Repeat: Monthly</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={t.completed} onChange={() => toggleTask(t.id)} className="h-5 w-5 accent-indigo-600" aria-label="Mark complete" />
                      <span className={t.completed ? "line-through text-gray-500 dark:text-gray-400" : ""}>{t.title}</span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 ml-7 mt-1 space-y-0.5">
                      {(t.startDate || t.startTime) && <div>Start: {t.startDate ?? "—"} {t.startTime ?? ""}</div>}
                      {(t.endDate || t.endTime) && (
                        <div>
                          End: {t.endDate ?? "—"} {t.endTime ?? ""}
                          {t.recurrence && t.recurrence !== "none" && (
                            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(Repeats: {t.recurrence})</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 ml-3">
                {editingId === t.id ? (
                  <button onClick={saveEdit} className={ui.btnLinkGreen}>Save</button>
                ) : (
                  <button onClick={() => startEdit(t)} className={ui.btnLinkBlue}>Edit</button>
                )}
                <button onClick={() => deleteTask(t.id)} className={ui.btnLinkRed}>Delete</button>
              </div>
            </li>
          ))}
        </ul>

        {/* Credit */}
        <footer className="mt-10 text-center text-xs text-gray-500 dark:text-gray-400">
          Sound effects by{" "}
          <a href="https://otologic.jp/" target="_blank" rel="noopener noreferrer" className="underline">
            OtoLogic
          </a>
        </footer>
      </div>
    </main>
  );
}
