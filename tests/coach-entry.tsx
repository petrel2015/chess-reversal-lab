// jsdom 测试专用挂载入口：由 tests/coach.test.mjs 经 esbuild 打包后注入 jsdom
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../app/lib/i18n";
import { AiCoach, AiCoachEntry } from "../app/components/ai-coach";
import type { CoachSnapshot } from "../app/lib/coach-prompt";

declare global {
  interface Window {
    // 测试钩子：模拟对局推进（引擎走棋后快照更新），供自动简评用例调用
    __advanceCoachSnapshot?: (override?: Partial<CoachSnapshot>) => void;
  }
}

function makeSnapshot(): CoachSnapshot {
  const locale = window.localStorage.getItem("locale") === "en" ? "en" : "zh";
  return {
    phase: "playing",
    locale,
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPPPPP1/RNBQKBNR w - - 0 1",
    reviewing: false,
    viewedPly: 3,
    totalPlies: 3,
    sanHistory: ["e4", "e5", "Nf3"],
    firstMoveColor: "w",
    lastMoveSan: "Nf3",
    lastMoveBy: "engine",
    turnToMove: "b",
    engineSide: "w",
    humanSide: "b",
    engineScoreWhite: { cp: 30 },
    endingText: null,
  };
}

const container = document.getElementById("root");
if (container) {
  let snapshot = makeSnapshot();
  const root = createRoot(container);
  const render = () => {
    root.render(<Harness current={snapshot} />);
  };

  // 与 page.tsx 相同的挂载结构：顶栏入口 + 工作区面板（jsdom 宽度 < 1240px，抽屉形态）
  function Harness({ current }: { current: CoachSnapshot }) {
    const [open, setOpen] = useState(false);
    return (
      <I18nProvider>
        <AiCoachEntry open={open} docked={false} onToggle={() => setOpen((v) => !v)} />
        <AiCoach
          snapshot={current}
          open={open}
          docked={false}
          onClose={() => setOpen(false)}
        />
      </I18nProvider>
    );
  }

  render();
  window.__advanceCoachSnapshot = (override) => {
    // 引擎走 Bb5：两半步推进，最后一手归引擎
    snapshot = {
      ...snapshot,
      viewedPly: snapshot.viewedPly + 2,
      totalPlies: snapshot.totalPlies + 2,
      sanHistory: [...snapshot.sanHistory, "Nc6", "Bb5"],
      lastMoveSan: "Bb5",
      fen: "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/8/PPPPPPP1/RNBQK1NR w - - 0 1",
      ...override,
    };
    render();
  };
}
