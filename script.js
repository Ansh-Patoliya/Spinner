(() => {
    "use strict";

    const STORAGE_KEY = "rollSpinnerData";
    const SEGMENT_COLORS = [
        "#d76c3d",
        "#efb556",
        "#5f9a8d",
        "#9b5b73",
        "#507dbc",
        "#76a64f",
        "#ca7b32",
        "#7c6ab0",
    ];
    const CANVAS_SIZE = 420;
    const SPIN_DURATION = 5200;
    const MIN_FULL_SPINS = 6;
    const MAX_EXTRA_SPINS = 2;
    const POINTER_ANGLE = -Math.PI / 2;

    let rollMin = 1;
    let rollMax = 35;
    let numbers = [];
    let usedNumbers = [];
    let currentRotation = 0;
    let spinning = false;
    let winningNumber = null;
    let audioCtx = null;
    let lastTickSegment = -1;

    const canvas = document.getElementById("wheel");
    const ctx = canvas.getContext("2d");
    const minInput = document.getElementById("minRoll");
    const maxInput = document.getElementById("maxRoll");
    const setRangeBtn = document.getElementById("setRangeBtn");
    const spinBtn = document.getElementById("spinBtn");
    const resetBtn = document.getElementById("resetBtn");
    const rangeLabel = document.getElementById("rangeLabel");
    const remainingLabel = document.getElementById("remainingLabel");
    const historyList = document.getElementById("historyList");
    const allUsedMsg = document.getElementById("allUsedMsg");
    const wheelGlow = document.getElementById("wheelGlow");
    const pointer = document.getElementById("pointer");
    const centerHub = document.getElementById("centerHub");
    const centerLabel = document.getElementById("centerLabel");
    const centerNumber = document.getElementById("centerNumber");
    const confettiCanvas = document.getElementById("confettiCanvas");
    const confettiCtx = confettiCanvas.getContext("2d");

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    let confettiPieces = [];
    let confettiRunning = false;

    function getTodayKey() {
        const now = new Date();
        return [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0"),
        ].join("-");
    }

    function loadStoredData() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        } catch {
            return {};
        }
    }

    function persistState() {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                date: getTodayKey(),
                min: rollMin,
                max: rollMax,
                selections: usedNumbers,
            })
        );
    }

    function loadState() {
        const stored = loadStoredData();
        if (stored.date === getTodayKey()) {
            if (Number.isInteger(stored.min) && Number.isInteger(stored.max) && stored.min <= stored.max) {
                rollMin = stored.min;
                rollMax = stored.max;
            }
            if (Array.isArray(stored.selections)) {
                usedNumbers = stored.selections.filter((value) => Number.isInteger(value));
            }
        }

        minInput.value = rollMin;
        maxInput.value = rollMax;
    }

    function clearState() {
        usedNumbers = [];
        localStorage.removeItem(STORAGE_KEY);
    }

    function buildNumbers() {
        numbers = [];
        for (let value = rollMin; value <= rollMax; value += 1) {
            numbers.push(value);
        }
        usedNumbers = usedNumbers.filter((value) => value >= rollMin && value <= rollMax);
    }

    function getAvailableNumbers() {
        return numbers.filter((value) => !usedNumbers.includes(value));
    }

    function getSegmentAngle() {
        return (Math.PI * 2) / Math.max(numbers.length, 1);
    }

    function normalizeAngle(angle) {
        const fullTurn = Math.PI * 2;
        return ((angle % fullTurn) + fullTurn) % fullTurn;
    }

    function getPointerSegmentIndex(rotation = currentRotation) {
        if (!numbers.length) {
            return -1;
        }

        const segmentAngle = getSegmentAngle();
        const pointerRelative = normalizeAngle(POINTER_ANGLE - rotation + Math.PI / 2);
        return Math.floor(pointerRelative / segmentAngle) % numbers.length;
    }

    function getSegmentBounds(index, rotation = currentRotation) {
        const segmentAngle = getSegmentAngle();
        const start = rotation - Math.PI / 2 + index * segmentAngle;
        return {
            start,
            end: start + segmentAngle,
            center: start + segmentAngle / 2,
        };
    }

    function ensureAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
    }

    function playTick() {
        if (!audioCtx) {
            return;
        }

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = "square";
        oscillator.frequency.value = 720 + Math.random() * 120;
        gainNode.gain.setValueAtTime(0.025, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.03);
    }

    function playWinSound() {
        if (!audioCtx) {
            return;
        }

        [440, 554.37, 659.25].forEach((frequency, index) => {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            const startTime = audioCtx.currentTime + index * 0.08;
            oscillator.type = "triangle";
            oscillator.frequency.value = frequency;
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            gainNode.gain.setValueAtTime(0.06, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.24);
            oscillator.start(startTime);
            oscillator.stop(startTime + 0.24);
        });
    }

    function resizeConfetti() {
        confettiCanvas.width = window.innerWidth;
        confettiCanvas.height = window.innerHeight;
    }

    function launchConfetti() {
        resizeConfetti();
        confettiPieces = Array.from({ length: 90 }, () => ({
            x: confettiCanvas.width / 2 + (Math.random() - 0.5) * 160,
            y: confettiCanvas.height / 2 - 60,
            vx: (Math.random() - 0.5) * 10,
            vy: -5 - Math.random() * 8,
            size: 5 + Math.random() * 7,
            color: SEGMENT_COLORS[Math.floor(Math.random() * SEGMENT_COLORS.length)],
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.3,
            gravity: 0.16 + Math.random() * 0.08,
            opacity: 1,
        }));

        if (!confettiRunning) {
            confettiRunning = true;
            requestAnimationFrame(animateConfetti);
        }
    }

    function animateConfetti() {
        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        let hasVisiblePieces = false;

        confettiPieces.forEach((piece) => {
            if (piece.opacity <= 0) {
                return;
            }

            hasVisiblePieces = true;
            piece.x += piece.vx;
            piece.y += piece.vy;
            piece.vy += piece.gravity;
            piece.rotation += piece.rotationSpeed;
            piece.opacity -= 0.012;

            confettiCtx.save();
            confettiCtx.translate(piece.x, piece.y);
            confettiCtx.rotate(piece.rotation);
            confettiCtx.globalAlpha = Math.max(piece.opacity, 0);
            confettiCtx.fillStyle = piece.color;
            confettiCtx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.7);
            confettiCtx.restore();
        });

        if (hasVisiblePieces) {
            requestAnimationFrame(animateConfetti);
        } else {
            confettiRunning = false;
            confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        }
    }

    function drawWheel() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!numbers.length) {
            return;
        }

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const outerRadius = canvas.width / 2 - 18;
        const textRadius = outerRadius * 0.78;
        const segmentAngle = getSegmentAngle();
        const pointerIndex = getPointerSegmentIndex();
        const winningIndex = winningNumber == null ? -1 : numbers.indexOf(winningNumber);
        const fontSize = Math.max(10, Math.min(24, 280 / numbers.length));

        const ringGradient = ctx.createRadialGradient(centerX, centerY, outerRadius * 0.1, centerX, centerY, outerRadius);
        ringGradient.addColorStop(0, "rgba(255,255,255,0.96)");
        ringGradient.addColorStop(0.65, "rgba(244,236,220,0.95)");
        ringGradient.addColorStop(1, "rgba(217,201,172,0.98)");

        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius + 10, 0, Math.PI * 2);
        ctx.fillStyle = ringGradient;
        ctx.fill();

        numbers.forEach((number, index) => {
            const { start, end, center } = getSegmentBounds(index);
            const isUsed = usedNumbers.includes(number);
            const isWinner = index === winningIndex;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, outerRadius, start, end);
            ctx.closePath();

            const baseColor = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
            ctx.fillStyle = isUsed ? "rgba(140, 121, 91, 0.22)" : baseColor;
            ctx.fill();

            if (isWinner) {
                ctx.save();
                ctx.shadowColor = "rgba(255, 209, 102, 0.8)";
                ctx.shadowBlur = 24;
                ctx.fillStyle = "rgba(255, 209, 102, 0.34)";
                ctx.fill();
                ctx.restore();
            }

            ctx.strokeStyle = "rgba(255,255,255,0.55)";
            ctx.lineWidth = isWinner ? 3 : 1.4;
            ctx.stroke();

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(center);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = isUsed ? "rgba(45,36,23,0.45)" : "#fffdf8";
            ctx.font = `700 ${fontSize}px "Space Grotesk", sans-serif`;
            ctx.fillText(String(number), textRadius, 0);
            ctx.restore();
        });

        ctx.save();
        ctx.translate(centerX, centerY);
        for (let index = 0; index < numbers.length; index += 1) {
            const angle = currentRotation + index * segmentAngle - Math.PI / 2;
            ctx.save();
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(outerRadius - 8, 0);
            ctx.lineTo(outerRadius + 8, 0);
            ctx.lineWidth = index === pointerIndex ? 3 : 1;
            ctx.strokeStyle = index === pointerIndex ? "rgba(45,36,23,0.9)" : "rgba(45,36,23,0.25)";
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();

        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius * 0.29, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(247, 241, 229, 0.92)";
        ctx.fill();
    }

    function animatePointerTick() {
        pointer.classList.remove("bounce");
        void pointer.offsetWidth;
        pointer.classList.add("bounce");
    }

    function setCenterDisplay(label, numberText, showResult) {
        centerLabel.textContent = label;
        centerNumber.textContent = numberText;
        centerHub.classList.remove("show-result");
        if (showResult) {
            void centerHub.offsetWidth;
            centerHub.classList.add("show-result");
        }
    }

    function updateHistory() {
        historyList.innerHTML = "";

        if (!usedNumbers.length) {
            const empty = document.createElement("span");
            empty.className = "empty-msg";
            empty.textContent = "None yet";
            historyList.appendChild(empty);
            return;
        }

        usedNumbers.forEach((number, index) => {
            const chip = document.createElement("span");
            chip.className = "history-chip";
            chip.innerHTML = `<span class="chip-idx">#${index + 1}</span>${number}`;
            historyList.appendChild(chip);
        });
    }

    function updateStatus() {
        const remaining = getAvailableNumbers().length;
        rangeLabel.textContent = `Roll ${rollMin}-${rollMax}`;
        remainingLabel.textContent = `${remaining} remaining today`;
        remainingLabel.style.color = remaining === 0 ? "#bf4c4c" : remaining <= 5 ? "#bb7a16" : "#2e8b57";
    }

    function updateAvailabilityState() {
        const empty = getAvailableNumbers().length === 0;
        allUsedMsg.classList.toggle("hidden", !empty);
        spinBtn.disabled = empty || spinning;
    }

    function refreshUI() {
        drawWheel();
        updateHistory();
        updateStatus();
        updateAvailabilityState();
    }

    function handleSpinComplete() {
        const selectedIndex = getPointerSegmentIndex();
        winningNumber = numbers[selectedIndex];
        usedNumbers.push(winningNumber);
        persistState();
        wheelGlow.classList.remove("active");
        wheelGlow.classList.add("win");
        setCenterDisplay("Selected", String(winningNumber), true);
        playWinSound();
        launchConfetti();
        spinning = false;
        spinBtn.classList.remove("is-spinning");
        refreshUI();
    }

    function spin() {
        if (spinning) {
            return;
        }

        const available = getAvailableNumbers();
        if (!available.length) {
            updateAvailabilityState();
            return;
        }

        ensureAudio();
        spinning = true;
        winningNumber = null;
        wheelGlow.classList.remove("win");
        wheelGlow.classList.add("active");
        spinBtn.disabled = true;
        spinBtn.classList.add("is-spinning");
        setCenterDisplay("Spinning", "?", false);

        const winner = available[Math.floor(Math.random() * available.length)];
        const winnerIndex = numbers.indexOf(winner);
        const segmentAngle = getSegmentAngle();
        const segmentCenter = (winnerIndex + 0.5) * segmentAngle;
        const targetNormalized = normalizeAngle(POINTER_ANGLE - (segmentCenter - Math.PI / 2));
        const startRotation = currentRotation;
        const fullTurns = MIN_FULL_SPINS + Math.floor(Math.random() * (MAX_EXTRA_SPINS + 1));
        let targetRotation = targetNormalized + fullTurns * Math.PI * 2;

        while (targetRotation <= startRotation + Math.PI * 2) {
            targetRotation += Math.PI * 2;
        }

        const rotationDelta = targetRotation - startRotation;
        const startTime = performance.now();
        lastTickSegment = getPointerSegmentIndex(startRotation);

        const animate = (timestamp) => {
            const progress = Math.min((timestamp - startTime) / SPIN_DURATION, 1);
            const eased = 1 - Math.pow(1 - progress, 4);
            currentRotation = startRotation + rotationDelta * eased;

            const currentSegment = getPointerSegmentIndex();
            if (currentSegment !== lastTickSegment) {
                lastTickSegment = currentSegment;
                playTick();
                animatePointerTick();
            }

            drawWheel();

            if (progress < 1) {
                requestAnimationFrame(animate);
                return;
            }

            currentRotation = targetRotation;
            drawWheel();
            handleSpinComplete();
        };

        requestAnimationFrame(animate);
    }

    function setRange() {
        const nextMin = Number.parseInt(minInput.value, 10);
        const nextMax = Number.parseInt(maxInput.value, 10);

        if (!Number.isInteger(nextMin) || !Number.isInteger(nextMax) || nextMin < 1 || nextMin > nextMax) {
            window.alert("Enter a valid range where the starting roll number is not greater than the ending roll number.");
            return;
        }

        rollMin = nextMin;
        rollMax = nextMax;
        winningNumber = null;
        currentRotation = 0;
        clearState();
        buildNumbers();
        persistState();
        wheelGlow.classList.remove("active", "win");
        setCenterDisplay("Ready", "-", false);
        refreshUI();
    }

    function resetSelections() {
        winningNumber = null;
        currentRotation = 0;
        clearState();
        buildNumbers();
        persistState();
        wheelGlow.classList.remove("active", "win");
        setCenterDisplay("Ready", "-", false);
        refreshUI();
    }

    spinBtn.addEventListener("click", spin);
    setRangeBtn.addEventListener("click", setRange);
    resetBtn.addEventListener("click", resetSelections);
    window.addEventListener("resize", resizeConfetti);

    loadState();
    buildNumbers();
    resizeConfetti();
    setCenterDisplay("Ready", "-", false);
    refreshUI();
})();
