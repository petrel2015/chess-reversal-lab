// 效果图用棋盘渲染：data-pos 为「rank8 → rank1」每行 8 字符，
// 大写=白方 小写=黑方 .=空；data-last-from / data-last-to 高亮最近一步
const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

function renderBoard(el) {
  const pos = el.dataset.pos.replace(/\s/g, "").split("/");
  const size = el.dataset.size || "344";
  el.style.setProperty("--bsz", size + "px");
  const lastFrom = el.dataset.lastFrom;
  const lastTo = el.dataset.lastTo;
  const files = "abcdefgh";
  let html = "";
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = files[f] + (8 - r);
      const light = (f + (8 - r)) % 2 === 0;
      const c = pos[r][f];
      const piece = c === "." ? "" : GLYPH[c.toLowerCase()];
      const side = c === "." ? "" : c === c.toUpperCase() ? "w" : "b";
      const mark = sq === lastTo ? " last" : sq === lastFrom ? " from" : "";
      html += `<div class="sq ${light ? "l" : "d"}${mark}">${piece ? `<span class="pc ${side}">${piece}</span>` : ""}</div>`;
    }
  }
  el.innerHTML = html;
  const fl = el.parentElement.querySelector(".board-files");
  if (fl) {
    const shown = el.dataset.flip === "1" ? [..."abcdefgh"].reverse() : [..."abcdefgh"];
    fl.style.width = size + "px";
    fl.innerHTML = shown.map((x) => `<span>${x}</span>`).join("");
  }
}

document.querySelectorAll(".board").forEach(renderBoard);
