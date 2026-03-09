/**
 * Chess Square Control Overlay — content.js
 * Reads piece positions from chess.com's DOM, computes attacked squares,
 * and renders a color overlay showing which color controls each square.
 */

console.log('[Chess Control] Extension loaded');

// ── Piece attack computation ─────────────────────────────────────────

const FILE_NAMES = 'abcdefgh';

function sqToCoords(sq) {
    // sq = "e4" → {f:4, r:3} (0-indexed)
    return { f: FILE_NAMES.indexOf(sq[0]), r: parseInt(sq[1]) - 1 };
}

function coordsToSq(f, r) {
    if (f < 0 || f > 7 || r < 0 || r > 7) return null;
    return FILE_NAMES[f] + (r + 1);
}

/**
 * Given a board map {square: {color, type}}, compute all squares attacked
 * by each color. Returns { white: Set, black: Set }.
 */
function computeControl(boardMap) {
    const white = new Set();
    const black = new Set();
    const occupied = new Set(Object.keys(boardMap));

    for (const [sq, piece] of Object.entries(boardMap)) {
        const { f, r } = sqToCoords(sq);
        const attacks = getAttacks(piece.type, piece.color, f, r, occupied, boardMap);
        const targetSet = piece.color === 'w' ? white : black;
        for (const atk of attacks) targetSet.add(atk);
    }

    return { white, black };
}

function getAttacks(type, color, f, r, occupied, boardMap) {
    const attacks = [];

    switch (type) {
        case 'p': {
            const dir = color === 'w' ? 1 : -1;
            // Pawns attack diagonally
            for (const df of [-1, 1]) {
                const sq = coordsToSq(f + df, r + dir);
                if (sq) attacks.push(sq);
            }
            break;
        }
        case 'n': {
            const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
            for (const [df, dr] of jumps) {
                const sq = coordsToSq(f + df, r + dr);
                if (sq) attacks.push(sq);
            }
            break;
        }
        case 'k': {
            for (let df = -1; df <= 1; df++) {
                for (let dr = -1; dr <= 1; dr++) {
                    if (df === 0 && dr === 0) continue;
                    const sq = coordsToSq(f + df, r + dr);
                    if (sq) attacks.push(sq);
                }
            }
            break;
        }
        case 'b':
            attacks.push(...slidingAttacks(f, r, [[1,1],[1,-1],[-1,1],[-1,-1]], occupied));
            break;
        case 'r':
            attacks.push(...slidingAttacks(f, r, [[1,0],[-1,0],[0,1],[0,-1]], occupied));
            break;
        case 'q':
            attacks.push(...slidingAttacks(f, r, [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]], occupied));
            break;
    }

    return attacks;
}

function slidingAttacks(f, r, directions, occupied) {
    const attacks = [];
    for (const [df, dr] of directions) {
        let cf = f + df, cr = r + dr;
        while (cf >= 0 && cf <= 7 && cr >= 0 && cr <= 7) {
            const sq = coordsToSq(cf, cr);
            attacks.push(sq);
            if (occupied.has(sq)) break; // blocked — but the blocking square IS attacked
            cf += df;
            cr += dr;
        }
    }
    return attacks;
}


// ── Chess.com DOM parsing ────────────────────────────────────────────

/**
 * Read piece positions from chess.com's DOM.
 * Chess.com pieces have classes like: "piece wp square-14" (white pawn on a4)
 * where square-XY: X = file (1-8), Y = rank (1-8)
 */
function readBoardFromDOM(boardEl) {
    const boardMap = {};
    const pieces = boardEl.querySelectorAll('.piece');

    for (const el of pieces) {
        const classes = el.className.split(/\s+/);
        let color = null, type = null, file = null, rank = null;

        for (const cls of classes) {
            // Piece type class: "wp", "bk", "wq", etc. (2 chars, first is color)
            if (/^[wb][kqrbnp]$/.test(cls)) {
                color = cls[0];
                type = cls[1];
            }
            // Square class: "square-XY" where X=file(1-8) Y=rank(1-8)
            if (/^square-\d{2,}$/.test(cls)) {
                const digits = cls.replace('square-', '');
                file = parseInt(digits.charAt(digits.length - 2)) - 1; // 0-indexed
                rank = parseInt(digits.charAt(digits.length - 1)) - 1; // 0-indexed
            }
        }

        if (color && type && file !== null && rank !== null) {
            const sq = coordsToSq(file, rank);
            if (sq) boardMap[sq] = { color, type };
        }
    }

    return boardMap;
}

/**
 * Detect whether the board is flipped (playing as black).
 * Chess.com adds a "flipped" class on the board element.
 */
function isBoardFlipped(boardEl) {
    return boardEl.classList.contains('flipped');
}


// ── Overlay rendering ────────────────────────────────────────────────

function createOverlay(boardEl) {
    // Remove old overlay if present
    boardEl.querySelector('.chess-control-overlay')?.remove();

    const grid = document.createElement('div');
    grid.className = 'chess-control-overlay';
    boardEl.appendChild(grid);
    return grid;
}

function paintOverlay(grid, controlData, boardMap, flipped) {
    grid.innerHTML = '';

    const occupiedSquares = new Set(Object.keys(boardMap));

    // Chess.com grid: if NOT flipped, rank 8 is at top, file a is at left
    // If flipped, rank 1 is at top, file h is at left
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const file = flipped ? (7 - col) : col;
            const rank = flipped ? row : (7 - row);
            const sq = coordsToSq(file, rank);

            const cell = document.createElement('div');
            cell.className = 'control-cell';

            // Don't color squares that have pieces — keeps pieces readable
            if (!occupiedSquares.has(sq)) {
                const w = controlData.white.has(sq);
                const b = controlData.black.has(sq);

                if (w && b) cell.classList.add('contested');
                else if (w) cell.classList.add('white-control');
                else if (b) cell.classList.add('black-control');
            }

            grid.appendChild(cell);
        }
    }
}


// ── Main loop ────────────────────────────────────────────────────────

let overlayGrid = null;
let overlayVisible = true;
let toggleBtn = null;
let lastBoardHash = '';

function findBoard() {
    // chess.com uses <wc-chess-board> or a div with id="board-vs-personalities" etc.
    return document.querySelector('wc-chess-board')
        || document.querySelector('chess-board')
        || document.querySelector('#board-layout-chessboard chess-board')
        || document.querySelector('.board');
}

function getBoardHash(boardMap) {
    return Object.entries(boardMap).map(([sq, p]) => sq + p.color + p.type).sort().join('');
}

function tick() {
    const boardEl = findBoard();
    if (!boardEl) return;

    const boardMap = readBoardFromDOM(boardEl);
    if (Object.keys(boardMap).length === 0) return;

    const hash = getBoardHash(boardMap);
    if (hash === lastBoardHash) return; // nothing changed
    lastBoardHash = hash;

    if (!overlayGrid || !boardEl.contains(overlayGrid)) {
        overlayGrid = createOverlay(boardEl);
    }

    if (!overlayVisible) return;

    const controlData = computeControl(boardMap);
    const flipped = isBoardFlipped(boardEl);
    paintOverlay(overlayGrid, controlData, boardMap, flipped);
}

function initToggleButton() {
    if (toggleBtn) return;

    toggleBtn = document.createElement('button');
    toggleBtn.className = 'chess-control-toggle';
    toggleBtn.textContent = '🔲 Control: ON';
    document.body.appendChild(toggleBtn);

    toggleBtn.onclick = () => {
        overlayVisible = !overlayVisible;
        toggleBtn.textContent = overlayVisible ? '🔲 Control: ON' : '🔲 Control: OFF';
        if (overlayGrid) {
            overlayGrid.style.display = overlayVisible ? 'grid' : 'none';
        }
        if (overlayVisible) {
            lastBoardHash = ''; // force repaint
            tick();
        }
    };
}

// Poll every 500ms for board changes
function start() {
    initToggleButton();
    setInterval(tick, 500);
    console.log('[Chess Control] Watching for board changes...');
}

// Wait for DOM to be ready, then start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
