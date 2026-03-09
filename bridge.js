(function() {
  function findFEN(obj, depth = 0, seen = new WeakSet()) {
    if (!obj || typeof obj !== "object" || depth > 12 || seen.has(obj)) return null;
    seen.add(obj);

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string" && /^[rnbqkpRNBQKP1-8\\/]+ [wb] .+$/.test(value)) {
        return value;
      }
      if (typeof value === "object") {
        const nested = findFEN(value, depth + 1, seen);
        if (nested) return nested;
      }
    }
    return null;
  }

  function scanAll() {
    // Check known global places first
    const globals = [
      window.chess,
      window.game,
      window.LiveChess,
      window.Chessboard,
      window.store,
      window.pageData,
    ];

    for (const g of globals) {
      const fen = findFEN(g);
      if (fen) {
        console.log("[Bridge] Found FEN via global:", fen);
        window.postMessage({ type: "CHESS_OVERLAY_FEN", fen });
        return true;
      }
    }

    // Fallback: search React fiber props
    const board = document.querySelector("#board");
    if (board) {
      for (const key in board) {
        if (key.startsWith("__reactFiber$") || key.startsWith("__reactProps$")) {
          const fen = findFEN(board[key]);
          if (fen) {
            console.log("[Bridge] Found FEN via fiber:", fen);
            window.postMessage({ type: "CHESS_OVERLAY_FEN", fen });
            return true;
          }
        }
      }
    }

    return false;
  }

  // Keep polling until something is found
  setInterval(() => {
    if (scanAll()) {
      console.log("[Bridge] Sent FEN to overlay.");
    } else {
      console.log("[Bridge] Still searching for FEN...");
    }
  }, 1500);
})();