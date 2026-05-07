import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import yellowWall from "@/assets/yellow-wall.jpg";

// ---------- Types ----------
type TeamId = "red" | "green" | "white";
interface Player {
  id: string;
  order: number;
  name: string;
  note: string;
  isGk: boolean;
  isReserve: boolean;
}
interface TeamState {
  players: string[];
  gk: string | null;
  positions: Record<string, { x: number; y: number }>;
}
type Tool = "attack" | "defense" | "area" | "note" | "erase";
interface Annotation {
  id: string;
  type: Tool;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  text: string;
}
interface Board {
  label: string;
  annotations: Annotation[];
}
type StepId = "import" | "setup" | "draft" | "lineup";

const teamMeta: Record<TeamId, { name: string; cls: string }> = {
  red: { name: "红队", cls: "team-red" },
  green: { name: "绿队", cls: "team-green" },
  white: { name: "白队", cls: "team-white" },
};

const TEAMS: TeamId[] = ["red", "green", "white"];

const sampleRelay = `周五 ——19点一21点
场地：洋湖一号场（包含门将限制二十四人）
报名（实名认证）接龙

1: 大王
2: 门将张亮
3: 门将小王
4: 阳
5: 周 宇
6: 老游
7: 王龙
8: 老鱼
9: 红犀牛
10: 库库雷利平
11: 俊锟·㉿
12: 番十三
13: 果之林
14: 康饼
15: zengQ
16: Michael
17: 尚涛
18: 石三Nathan
19: 啊比比
20: 柳旭
21: 小何
22: 欧巴
23: 小庄
24: snow
25: 摩托萨克
26: 蒲蒲
27: 雷洲 先报上`;

const formationSlots: Record<string, [number, number][]> = {
  "3-3-1": [[50, 88],[24, 68],[50, 68],[76, 68],[24, 43],[50, 43],[76, 43],[50, 18]],
  "2-3-2": [[50, 88],[36, 68],[64, 68],[24, 45],[50, 45],[76, 45],[38, 20],[62, 20]],
  "3-2-2": [[50, 88],[24, 68],[50, 68],[76, 68],[38, 44],[62, 44],[38, 20],[62, 20]],
};

const emptyTeams = (): Record<TeamId, TeamState> => ({
  red: { players: [], gk: null, positions: {} },
  green: { players: [], gk: null, positions: {} },
  white: { players: [], gk: null, positions: {} },
});
const emptyBoard = (): Board => ({ label: "", annotations: [] });

function parseRelay(text: string): Player[] {
  return text
    .split(/\r?\n/)
    .map((x) => x.trim().match(/^(\d+)\s*[:：.、]\s*(.+)$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => {
      let content = m[2].trim();
      const isGk = /^(门将|GK|守门员)\s*/i.test(content);
      content = content.replace(/^(门将|GK|守门员)\s*/i, "").trim();
      const noteMatch = content.match(/\s+(先报上|晚到|待定|临时|蹭球|\+1|带人.*)$/);
      const name = noteMatch ? content.slice(0, noteMatch.index!).trim() : content;
      return {
        id: `p-${m[1]}-${name}`,
        order: Number(m[1]),
        name,
        note: noteMatch ? noteMatch[1].trim() : "",
        isGk,
        isReserve: Number(m[1]) > 24,
      };
    });
}

// ---------- Components ----------
function StepperNav({
  step, setStep, completed,
}: { step: StepId; setStep: (s: StepId) => void; completed: Set<StepId> }) {
  const steps: { id: StepId; label: string }[] = [
    { id: "import", label: "导入名单" },
    { id: "setup", label: "队长门将" },
    { id: "draft", label: "在线选人" },
    { id: "lineup", label: "阵容战术" },
  ];
  return (
    <nav className="stepper" aria-label="流程">
      {steps.map((s, i) => (
        <button
          key={s.id}
          className={`step-pill ${step === s.id ? "is-active" : ""} ${completed.has(s.id) && step !== s.id ? "is-done" : ""}`}
          onClick={() => setStep(s.id)}
        >
          <span className="num">{i + 1}</span>
          <span>{s.label}</span>
        </button>
      ))}
    </nav>
  );
}

function PlayerCard({
  p, action,
}: { p: Player; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={`player-card ${p.isGk ? "is-gk" : ""}`}>
      <span className="num">{p.order}</span>
      <div className="name">
        {p.name}
        <small style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {p.isGk && <span className="badge gk">GK</span>}
          {p.isReserve && <span className="badge reserve">候补</span>}
          {p.note && <span className="badge">{p.note}</span>}
        </small>
      </div>
      {action && (
        <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function PitchLines() {
  return (
    <div className="pitch-lines">
      <svg viewBox="0 0 160 90" preserveAspectRatio="none">
        <g fill="none" stroke="oklch(0.97 0.01 180 / 0.55)" strokeWidth="0.4">
          <rect x="2" y="2" width="156" height="86" rx="0.6" />
          <line x1="80" y1="2" x2="80" y2="88" />
          <circle cx="80" cy="45" r="9" />
          <circle cx="80" cy="45" r="0.6" fill="oklch(0.97 0.01 180 / 0.55)" />
          {/* penalty boxes */}
          <rect x="2" y="22" width="22" height="46" />
          <rect x="2" y="32" width="10" height="26" />
          <rect x="136" y="22" width="22" height="46" />
          <rect x="148" y="32" width="10" height="26" />
          {/* goal */}
          <rect x="0" y="38" width="2" height="14" />
          <rect x="158" y="38" width="2" height="14" />
        </g>
      </svg>
    </div>
  );
}

// ============= Main App =============
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/")({ component: App });

function App() {
  const [step, setStep] = useState<StepId>("import");
  const [completed, setCompleted] = useState<Set<StepId>>(new Set());

  const [relayText, setRelayText] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);

  const [captains, setCaptains] = useState<Record<TeamId, string | null>>({ red: null, green: null, white: null });
  const [draftOrder, setDraftOrder] = useState<TeamId[]>(["red", "green", "white"]);
  const [gkOrder, setGkOrder] = useState<TeamId[]>(["red", "green", "white"]);
  const [draftOrderText, setDraftOrderText] = useState("red,green,white");
  const [gkOrderText, setGkOrderText] = useState("red,green,white");

  const [teams, setTeams] = useState(emptyTeams);
  const [draftQueue, setDraftQueue] = useState<{ team: TeamId; type: "player" | "gk" }[]>([]);
  const [pickIdx, setPickIdx] = useState(-1);
  const [seconds, setSeconds] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [currentTeam, setCurrentTeam] = useState<TeamId>("red");
  const [tactics, setTactics] = useState<Record<TeamId, Board>>({
    red: emptyBoard(), green: emptyBoard(), white: emptyBoard(),
  });
  const [tool, setTool] = useState<Tool>("attack");
  const [annotationText, setAnnotationText] = useState("");

  const findPlayer = useCallback((id: string | null) => players.find((p) => p.id === id) || null, [players]);

  const markDone = (s: StepId) => setCompleted((prev) => new Set(prev).add(s));

  // --- Import ---
  const doParse = () => {
    const parsed = parseRelay(relayText);
    if (!parsed.length) { alert("没有识别到任何报名。"); return; }
    setPlayers(parsed);
    markDone("import");
    setStep("setup");
  };

  const confirmed = useMemo(() => players.filter((p) => !p.isReserve), [players]);
  const reserves = useMemo(() => players.filter((p) => p.isReserve), [players]);

  // --- Setup actions ---
  const toggleGk = (id: string) => setPlayers((ps) => ps.map((p) => p.id === id ? { ...p, isGk: !p.isGk } : p));

  const parseOrder = (v: string): TeamId[] => {
    const valid = new Set(TEAMS);
    const arr = v.split(",").map((x) => x.trim()).filter((x): x is TeamId => valid.has(x as TeamId));
    return arr.length ? arr : ["red", "green", "white"];
  };

  // --- Draft ---
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const buildQueue = useCallback((capIds: Set<string>): { team: TeamId; type: "player" | "gk" }[] => {
    const order = parseOrder(draftOrderText);
    const gOrder = parseOrder(gkOrderText);
    const normal = players.filter((p) => !p.isReserve && !p.isGk && !capIds.has(p.id));
    const q: { team: TeamId; type: "player" | "gk" }[] = [];
    for (let i = 0; i < Math.min(normal.length, 18); i++) q.push({ team: order[i % order.length], type: "player" });
    for (let i = 0; i < 3; i++) q.push({ team: gOrder[i % gOrder.length], type: "gk" });
    return q;
  }, [players, draftOrderText, gkOrderText]);

  const resetDraft = useCallback(() => {
    stopTimer();
    const t = emptyTeams();
    TEAMS.forEach((tm) => {
      const c = findPlayer(captains[tm]);
      if (c) t[tm].players.push(c.id);
    });
    setTeams(t);
    setDraftOrder(parseOrder(draftOrderText));
    setGkOrder(parseOrder(gkOrderText));
    const capIds = new Set(Object.values(captains).filter(Boolean) as string[]);
    setDraftQueue(buildQueue(capIds));
    setPickIdx(-1);
    setSeconds(60);
  }, [captains, draftOrderText, gkOrderText, buildQueue, findPlayer, stopTimer]);

  const applySetup = () => {
    const ids = Object.values(captains).filter(Boolean) as string[];
    if (new Set(ids).size !== ids.length) { alert("三个队长不能选择同一个人。"); return; }
    if (ids.length < 3) { alert("请先指定红、绿、白三个队长。"); return; }
    resetDraft();
    markDone("setup");
    setStep("draft");
  };

  const assignedIds = useMemo(() => {
    const s = new Set<string>();
    Object.values(teams).forEach((t) => { t.players.forEach((id) => s.add(id)); if (t.gk) s.add(t.gk); });
    return s;
  }, [teams]);

  const cur = pickIdx >= 0 && pickIdx < draftQueue.length ? draftQueue[pickIdx] : null;

  const availableForPick = useMemo(() => {
    const type = cur?.type || "player";
    return players.filter((p) => !p.isReserve && !assignedIds.has(p.id) && (type === "gk" ? p.isGk : !p.isGk));
  }, [players, assignedIds, cur]);

  const startTimer = useCallback(() => {
    stopTimer();
    setSeconds(60);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) { return 0; }
        return s - 1;
      });
    }, 1000);
  }, [stopTimer]);

  const applyFormationLocal = useCallback((name: string, team: TeamId, prev: Record<TeamId, TeamState>) => {
    const slots = formationSlots[name];
    if (!slots) return prev;
    const t = prev[team];
    const ids = [t.gk, ...t.players].filter(Boolean) as string[];
    const positions: Record<string, { x: number; y: number }> = {};
    ids.slice(0, 8).forEach((id, i) => { positions[id] = { x: slots[i][0], y: slots[i][1] }; });
    return { ...prev, [team]: { ...t, positions } };
  }, []);

  const pickPlayer = useCallback((id: string) => {
    if (!cur) return;
    setTeams((prev) => {
      const t = { ...prev[cur.team] };
      if (cur.type === "gk") t.gk = id;
      else t.players = [...t.players, id];
      return { ...prev, [cur.team]: t };
    });
    const next = pickIdx + 1;
    setPickIdx(next);
    if (next >= draftQueue.length) {
      stopTimer();
      // apply default formation to all teams
      setTeams((prev) => {
        let p = prev;
        TEAMS.forEach((tm) => { p = applyFormationLocal("3-3-1", tm, p); });
        return p;
      });
      markDone("draft");
      setStep("lineup");
    } else {
      startTimer();
    }
  }, [cur, pickIdx, draftQueue.length, stopTimer, startTimer, applyFormationLocal]);

  const autoPick = useCallback(() => {
    if (!cur) return;
    if (!availableForPick.length) {
      const next = pickIdx + 1;
      setPickIdx(next);
      if (next >= draftQueue.length) { stopTimer(); markDone("draft"); setStep("lineup"); }
      else startTimer();
      return;
    }
    const r = availableForPick[Math.floor(Math.random() * availableForPick.length)];
    pickPlayer(r.id);
  }, [cur, availableForPick, pickIdx, draftQueue.length, stopTimer, startTimer, pickPlayer]);

  // timer auto-pick when reaches 0
  useEffect(() => {
    if (seconds === 0 && cur) autoPick();
  }, [seconds, cur, autoPick]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const startDraft = () => {
    if (pickIdx === -1) setPickIdx(0);
    startTimer();
  };

  // --- Lineup / pitch ---
  const pitchRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<Annotation | null>(null);

  const team = teams[currentTeam];
  const board = tactics[currentTeam];

  // Ensure positions exist
  useEffect(() => {
    setTeams((prev) => {
      const t = prev[currentTeam];
      const ids = [t.gk, ...t.players].filter(Boolean) as string[];
      const slots = formationSlots["3-3-1"];
      const positions = { ...t.positions };
      let changed = false;
      ids.forEach((id, i) => {
        if (!positions[id]) { positions[id] = { x: slots[i % 8][0], y: slots[i % 8][1] }; changed = true; }
      });
      return changed ? { ...prev, [currentTeam]: { ...t, positions } } : prev;
    });
  }, [currentTeam, teams[currentTeam].players, teams[currentTeam].gk]); // eslint-disable-line

  const applyFormation = (name: string) => setTeams((prev) => applyFormationLocal(name, currentTeam, prev));

  const resetPositions = () => setTeams((prev) => ({ ...prev, [currentTeam]: { ...prev[currentTeam], positions: {} } }));

  const point = (e: React.PointerEvent | PointerEvent) => {
    const r = pitchRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    };
  };

  const updatePosition = (id: string, x: number, y: number) => {
    setTeams((prev) => ({
      ...prev,
      [currentTeam]: { ...prev[currentTeam], positions: { ...prev[currentTeam].positions, [id]: { x, y } } },
    }));
  };

  const onTokenPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = pitchRef.current!.getBoundingClientRect();
      const x = Math.max(6, Math.min(94, ((ev.clientX - r.left) / r.width) * 100));
      const y = Math.max(6, Math.min(94, ((ev.clientY - r.top) / r.height) * 100));
      updatePosition(id, x, y);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const labelText = (fallback: string) => annotationText.trim() || fallback;

  const addAnnotation = (a: Omit<Annotation, "id">) => {
    setTactics((prev) => ({
      ...prev,
      [currentTeam]: {
        ...prev[currentTeam],
        annotations: [...prev[currentTeam].annotations, { ...a, id: `a-${Date.now()}-${Math.random().toString(16).slice(2)}` }],
      },
    }));
  };
  const removeAnnotation = (id: string) => {
    setTactics((prev) => ({
      ...prev,
      [currentTeam]: { ...prev[currentTeam], annotations: prev[currentTeam].annotations.filter((a) => a.id !== id) },
    }));
  };

  const onPitchPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".player-token")) return;
    const mark = target.closest<HTMLElement>(".board-mark");
    if (tool === "erase") { if (mark) removeAnnotation(mark.dataset.id!); return; }
    if (mark) return;
    const p = point(e);
    if (tool === "note") { addAnnotation({ type: "note", x: p.x, y: p.y, text: labelText("提醒") }); return; }
    if (!["attack", "defense", "area"].includes(tool)) return;
    setDrawing({
      id: "_d", type: tool, x: p.x, y: p.y, x2: p.x, y2: p.y,
      text: labelText(tool === "area" ? "控制区域" : "跑位"),
    });
    pitchRef.current!.setPointerCapture(e.pointerId);
  };
  const onPitchPointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const p = point(e);
    setDrawing({ ...drawing, x2: p.x, y2: p.y });
  };
  const onPitchPointerUp = () => {
    if (!drawing) return;
    const d = drawing;
    setDrawing(null);
    if (Math.hypot((d.x2! - d.x), (d.y2! - d.y)) < 3) return;
    addAnnotation({ type: d.type, x: d.x, y: d.y, x2: d.x2, y2: d.y2, text: d.text });
  };

  const renderAnnotation = (a: Annotation) => {
    if (a.type === "area") {
      const l = Math.min(a.x, a.x2!), t = Math.min(a.y, a.y2!);
      const w = Math.abs(a.x2! - a.x), h = Math.abs(a.y2! - a.y);
      return (
        <div key={a.id} data-id={a.id} className="board-area board-mark"
          style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` }}>
          {a.text}
        </div>
      );
    }
    if (a.type === "note") {
      return (
        <div key={a.id} data-id={a.id} className="board-note board-mark"
          style={{ left: `${a.x}%`, top: `${a.y}%` }}>{a.text}</div>
      );
    }
    const dx = a.x2! - a.x, dy = a.y2! - a.y;
    const w = Math.max(4, Math.hypot(dx, dy));
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    return (
      <div key={a.id} data-id={a.id} className={`board-arrow ${a.type} board-mark`}
        style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${w}%`, transform: `rotate(${ang}deg)` }}>
        <span>{a.text}</span>
      </div>
    );
  };

  const exportBoard = async () => {
    const payload = JSON.stringify({ ...board, label: annotationText.trim() || board.label }, null, 2);
    try { await navigator.clipboard.writeText(payload); alert("当前队战术已复制为 JSON。"); }
    catch { prompt("复制当前队战术 JSON：", payload); }
  };
  const importBoard = () => {
    const raw = prompt("粘贴战术 JSON：");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.annotations)) throw new Error();
      setTactics((prev) => ({ ...prev, [currentTeam]: { label: parsed.label || "", annotations: parsed.annotations } }));
    } catch { alert("导入失败，请确认 JSON 来自本战术板。"); }
  };

  // Sync annotation text to board on team change
  useEffect(() => { setAnnotationText(tactics[currentTeam].label); }, [currentTeam]); // eslint-disable-line

  const tokens = useMemo(() => {
    const ids = [team.gk, ...team.players].filter(Boolean) as string[];
    return ids.map((id) => {
      const p = findPlayer(id);
      if (!p) return null;
      const pos = team.positions[id] || { x: 50, y: 50 };
      const isGk = id === team.gk;
      return { p, pos, isGk, id };
    }).filter(Boolean) as { p: Player; pos: { x: number; y: number }; isGk: boolean; id: string }[];
  }, [team, findPlayer]);

  const currentTeamCls = teamMeta[currentTeam].cls;

  // Inject stadium hero image as body background variable
  useEffect(() => {
    document.body.style.setProperty("--bg-stadium", `url(${yellowWall})`);
    return () => { document.body.style.removeProperty("--bg-stadium"); };
  }, []);

  return (
    <div className="min-h-screen">
      {/* Sponsor / club banner */}
      <div className="sponsor-bar">
        <div className="sponsor-bar-inner">
          <span className="sponsor-label">官方赞助 · OFFICIAL SPONSOR</span>
          <a href="http://www.gzjiy.com/" target="_blank" rel="noreferrer" className="sponsor-link">
            <span className="sponsor-mark">JIY</span>
            <span className="sponsor-name">济援专汽 · GUANGZHOU J.Y. SPECIAL AUTOMOBILE</span>
          </a>
          <span className="sponsor-meta">广州 · 消防车研发制造</span>
        </div>
      </div>

      {/* Header */}
      <header className="header-hero">
        <div className="header-row">
          <div className="club-id">
            <div className="club-crest" aria-hidden>
              <svg viewBox="0 0 64 64" width="48" height="48">
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="oklch(0.95 0.16 95)" />
                    <stop offset="1" stopColor="oklch(0.78 0.18 95)" />
                  </linearGradient>
                </defs>
                <path d="M32 4 L58 14 V34 C58 48 47 57 32 60 C17 57 6 48 6 34 V14 Z"
                  fill="url(#cg)" stroke="oklch(0.1 0 0)" strokeWidth="2.5" strokeLinejoin="round"/>
                <text x="32" y="40" textAnchor="middle"
                  fontFamily="Bebas Neue, sans-serif" fontSize="22"
                  fill="oklch(0.1 0 0)" letterSpacing="1">JIY</text>
                <rect x="14" y="44" width="36" height="3" fill="oklch(0.1 0 0)" />
              </svg>
            </div>
            <div className="club-text">
              <p className="eyebrow club-eyebrow">JIYUAN FC · 8 v 8 · WEEKLY CARNIVAL</p>
              <h1 className="club-title">
                济援<span>专汽</span> · 周五嘉年华
              </h1>
              <p className="club-sub">FRIDAY NIGHT FOOTBALL CARNIVAL — Yellow Wall Edition</p>
            </div>
          </div>
          <div className="header-meta">
            <div className="match-pill">
              <span className="dot" />
              <div>
                <small>下一场</small>
                <strong>周五 19:00 · 洋湖一号场</strong>
              </div>
            </div>
            <div className="status-pill">
              {confirmed.length ? `${confirmed.length} 人已导入` : "等待导入名单"}
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 md:px-8 pt-[36vh] md:pt-[44vh] pb-12 max-w-[1400px] mx-auto w-full flex flex-col gap-6">
        <StepperNav step={step} setStep={setStep} completed={completed} />

        {/* IMPORT */}
        {step === "import" && (
          <section className="glass p-5 md:p-7">
            <div className="section-head">
              <div>
                <h2>微信接龙导入</h2>
                <p>粘贴整段接龙文本，系统会自动识别报名顺序、门将以及第 24 人之后的候补。</p>
              </div>
              <button className="btn btn-ghost" onClick={() => setRelayText(sampleRelay)}>填入示例</button>
            </div>
            <textarea
              className="textarea"
              spellCheck={false}
              placeholder="粘贴微信接龙文本…"
              value={relayText}
              onChange={(e) => setRelayText(e.target.value)}
            />
            <div className="flex gap-2 mt-3 flex-wrap">
              <button className="btn btn-primary" onClick={doParse}>解析名单 →</button>
              <button className="btn btn-ghost" onClick={() => setRelayText("")}>清空</button>
            </div>
            {players.length > 0 && (
              <div className="grid md:grid-cols-2 gap-5 mt-6">
                <div>
                  <h3 className="eyebrow mb-2">正式报名 · {confirmed.length}</h3>
                  <div className="flex flex-col gap-2">
                    {confirmed.length ? confirmed.map((p) => <PlayerCard key={p.id} p={p} />) : <div className="empty">暂无正式报名</div>}
                  </div>
                </div>
                <div>
                  <h3 className="eyebrow mb-2">候补 / 蹭球 · {reserves.length}</h3>
                  <div className="flex flex-col gap-2">
                    {reserves.length ? reserves.map((p) => <PlayerCard key={p.id} p={p} />) : <div className="empty">暂无候补</div>}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* SETUP */}
        {step === "setup" && (
          <section className="glass p-5 md:p-7">
            <div className="section-head">
              <div>
                <h2>队长 · 门将 · 顺序</h2>
                <p>组织者指定三位队长与门将池。GK 仅在最终阶段选择。</p>
              </div>
              <button className="btn btn-primary" onClick={applySetup}>保存并开始选人 →</button>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="glass p-4" style={{ background: "oklch(0.97 0.01 180 / 0.025)" }}>
                <h3 className="eyebrow mb-3">队长指定</h3>
                {TEAMS.map((t) => (
                  <label key={t} className="block mb-3">
                    <span className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-2">
                      <span style={{
                        width: 8, height: 8, borderRadius: 2,
                        background: `var(--color-team-${t})`,
                        display: "inline-block",
                        boxShadow: `0 0 6px var(--color-team-${t})`,
                      }} />
                      {teamMeta[t].name}队长
                    </span>
                    <select
                      className="select"
                      value={captains[t] ?? ""}
                      onChange={(e) => setCaptains((c) => ({ ...c, [t]: e.target.value || null }))}
                    >
                      <option value="">请选择</option>
                      {confirmed.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className="glass p-4" style={{ background: "oklch(0.97 0.01 180 / 0.025)" }}>
                <h3 className="eyebrow mb-3">选人顺序</h3>
                <label className="block mb-3">
                  <span className="text-xs text-muted-foreground mb-1.5 block">普通球员顺序</span>
                  <input className="input" value={draftOrderText} onChange={(e) => setDraftOrderText(e.target.value)} />
                </label>
                <label className="block mb-2">
                  <span className="text-xs text-muted-foreground mb-1.5 block">门将顺序</span>
                  <input className="input" value={gkOrderText} onChange={(e) => setGkOrderText(e.target.value)} />
                </label>
                <p className="text-xs text-muted-foreground">填 red,green,white 自定义循环顺序。</p>
              </div>
              <div className="glass p-4" style={{ background: "oklch(0.97 0.01 180 / 0.025)" }}>
                <h3 className="eyebrow mb-3">门将池</h3>
                <div className="flex flex-col gap-2 max-h-[280px] overflow-auto">
                  {confirmed.filter((p) => p.isGk).length
                    ? confirmed.filter((p) => p.isGk).map((p) => <PlayerCard key={p.id} p={p} />)
                    : <div className="empty">还没有 GK，下方可手动标记。</div>}
                </div>
              </div>
            </div>
            <div className="mt-5">
              <h3 className="eyebrow mb-3">名单确认 · 点击切换 GK 状态</h3>
              <div className="grid md:grid-cols-2 gap-2">
                {confirmed.map((p) => (
                  <PlayerCard key={p.id} p={p} action={{ label: p.isGk ? "取消GK" : "标记GK", onClick: () => toggleGk(p.id) }} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* DRAFT */}
        {step === "draft" && (
          <section className="glass p-5 md:p-7">
            <div className="section-head">
              <div>
                <h2>在线选人</h2>
                <p>每轮 60 秒，超时自动随机。普通球员选完后才进入 GK 选择。</p>
              </div>
              <div className="draft-clock">
                <div className="flex flex-col gap-1">
                  <span className="label">当前轮次</span>
                  <span className="pick">
                    {cur ? `${teamMeta[cur.team].name} 选 ${cur.type === "gk" ? "GK" : "球员"}` :
                      pickIdx >= draftQueue.length && draftQueue.length ? "选人完成" : "等待开始"}
                  </span>
                </div>
                <div className={`timer ${seconds <= 10 ? "warn" : ""}`}>{seconds}</div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap mb-5">
              <button className="btn btn-primary" onClick={startDraft} disabled={!!timerRef.current}>开始选人</button>
              <button className="btn btn-ghost" onClick={autoPick} disabled={!cur}>随机当前轮</button>
              <button className="btn btn-ghost" onClick={resetDraft}>重置选人</button>
            </div>
            <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
              <div>
                <h3 className="eyebrow mb-3">可选球员 · {availableForPick.length}</h3>
                <div className="flex flex-col gap-2 max-h-[60vh] overflow-auto pr-1">
                  {availableForPick.length ? availableForPick.map((p) => (
                    <PlayerCard key={p.id} p={p} action={cur ? { label: "选择", onClick: () => pickPlayer(p.id) } : undefined} />
                  )) : <div className="empty">暂无可选球员</div>}
                </div>
              </div>
              <div className="grid gap-3">
                {TEAMS.map((t) => {
                  const tm = teams[t];
                  const roster = tm.players.map(findPlayer).filter(Boolean) as Player[];
                  const gk = findPlayer(tm.gk);
                  return (
                    <article key={t} className={`team-card ${teamMeta[t].cls}`}>
                      <div className="head">
                        <h3><span className="crest" />{teamMeta[t].name}</h3>
                        <span className="count">{roster.length}{gk ? " + GK" : ""} / 8</span>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {[...roster, ...(gk ? [{ ...gk, isGk: true }] : [])].length
                          ? [...roster, ...(gk ? [{ ...gk, isGk: true } as Player] : [])].map((p) => <PlayerCard key={p.id} p={p} />)
                          : <div className="empty col-span-2">等待选人</div>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* LINEUP */}
        {step === "lineup" && (
          <section className="glass p-5 md:p-7">
            <div className="section-head">
              <div>
                <h2>横屏阵容 · 战术板</h2>
                <p>选择阵型一键排布或自由拖拽。手机请横屏使用以获得最佳体验。</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {Object.keys(formationSlots).map((f) => (
                  <button key={f} className="btn btn-ghost" onClick={() => applyFormation(f)}>{f}</button>
                ))}
                <button className="btn btn-ghost" onClick={resetPositions}>自由重排</button>
              </div>
            </div>

            <div className="flex gap-2 mb-4 flex-wrap">
              {TEAMS.map((t) => (
                <button
                  key={t}
                  className={`team-tab ${teamMeta[t].cls} ${currentTeam === t ? "is-active" : ""}`}
                  onClick={() => setCurrentTeam(t)}
                >
                  {teamMeta[t].name}
                </button>
              ))}
            </div>

            <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5">
              {/* Pitch */}
              <div className={`pitch-wrap ${currentTeamCls}`}>
                <div
                  ref={pitchRef}
                  className="pitch"
                  onPointerDown={onPitchPointerDown}
                  onPointerMove={onPitchPointerMove}
                  onPointerUp={onPitchPointerUp}
                >
                  <PitchLines />
                  {board.annotations.map(renderAnnotation)}
                  {drawing && renderAnnotation({ ...drawing, id: "_d" })}
                  {tokens.map(({ p, pos, isGk, id }) => (
                    <div
                      key={id}
                      className={`player-token ${currentTeamCls} ${isGk ? "is-gk" : ""}`}
                      style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)" }}
                      onPointerDown={(e) => onTokenPointerDown(e, id)}
                    >
                      <div className="disc">{isGk ? "GK" : p.name.slice(0, 2)}</div>
                      <div className="label">{p.name}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tactics panel */}
              <aside className="flex flex-col gap-4">
                <div className="glass p-4" style={{ background: "oklch(0.97 0.01 180 / 0.025)" }}>
                  <h3 className="eyebrow mb-3">战术工具 · {teamMeta[currentTeam].name}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ["attack", "进攻箭头"],
                      ["defense", "防守回收"],
                      ["area", "区域框"],
                      ["note", "文字标注"],
                      ["erase", "橡皮擦"],
                    ] as [Tool, string][]).map(([id, label]) => (
                      <button key={id}
                        className={`tool-btn ${tool === id ? "is-active" : ""}`}
                        onClick={() => setTool(id)}>{label}</button>
                    ))}
                  </div>
                  <label className="block mt-3">
                    <span className="text-xs text-muted-foreground mb-1.5 block">标注文字</span>
                    <input
                      className="input"
                      placeholder="例：边路推进、弱侧包抄、回收保护"
                      value={annotationText}
                      onChange={(e) => setAnnotationText(e.target.value)}
                      onBlur={() => setTactics((prev) => ({ ...prev, [currentTeam]: { ...prev[currentTeam], label: annotationText } }))}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button className="btn btn-ghost" onClick={() => {
                      setTactics((prev) => ({
                        ...prev, [currentTeam]: { ...prev[currentTeam], annotations: prev[currentTeam].annotations.slice(0, -1) },
                      }));
                    }}>撤销</button>
                    <button className="btn btn-ghost" onClick={exportBoard}>复制战术</button>
                    <button className="btn btn-ghost" onClick={importBoard}>导入战术</button>
                    <button className="btn btn-ghost" onClick={() => setTactics((p) => ({ ...p, [currentTeam]: { ...p[currentTeam], annotations: [] } }))}>清空标注</button>
                  </div>
                </div>

                <div className="glass p-4" style={{ background: "oklch(0.97 0.01 180 / 0.025)" }}>
                  <h3 className="eyebrow mb-2">教练说明</h3>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                    <li>箭头工具：在球场上拖动表示跑位/传球方向。</li>
                    <li>区域框：拖出需要重点控制或保护的区域。</li>
                    <li>文字标注：点击放置；橡皮擦点击标注删除。</li>
                    <li>球员可自由拖拽，战术与阵容按队伍分别保存。</li>
                  </ul>
                </div>

                <div className="glass p-4" style={{ background: "oklch(0.97 0.01 180 / 0.025)" }}>
                  <h3 className="eyebrow mb-2">替补 / 未上场</h3>
                  <div>
                    {reserves.length ? reserves.map((p) => <span key={p.id} className="bench-chip">{p.name}</span>)
                      : <span className="bench-chip">暂无候补</span>}
                  </div>
                </div>
              </aside>
            </div>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <span>济援专汽 · 周五嘉年华</span>
          <span className="dot-sep">·</span>
          <a href="http://www.gzjiy.com/" target="_blank" rel="noreferrer">www.gzjiy.com</a>
          <span className="dot-sep">·</span>
          <span>Echte Liebe · 真爱足球</span>
        </div>
      </footer>
    </div>
  );
}
