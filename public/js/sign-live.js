/**
 * Client-side MediaPipe Hands — feeds landmarks into the existing Sign → Voice UI.
 */
const SignLive = (() => {
    let landmarker = null;
    let raf = 0;
    let running = false;
    let videoEl = null;
    let lastHand = [];
    let handsDetected = 0;
    let lastError = "";

    async function ensureModel() {
        if (landmarker) return landmarker;
        const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm");
        const fileset = await vision.FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const opts = {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
        };
        try {
            landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts);
        } catch (err) {
            opts.baseOptions.delegate = "CPU";
            landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts);
        }
        return landmarker;
    }

    function loop() {
        if (!running) return;
        try {
            if (landmarker && videoEl && videoEl.readyState >= 2 && videoEl.videoWidth) {
                const res = landmarker.detectForVideo(videoEl, performance.now());
                const marks = res?.landmarks || [];
                handsDetected = marks.length;
                if (marks[0] && marks[0].length >= 21) {
                    lastHand = marks[0].map((p) => ({
                        x: p.x,
                        y: p.y,
                        z: p.z || 0,
                    }));
                } else {
                    lastHand = [];
                }
            }
        } catch (err) {
            lastError = err?.message || String(err);
        }
        raf = requestAnimationFrame(loop);
    }

    async function start(video) {
        videoEl = video;
        running = true;
        lastError = "";
        try {
            await ensureModel();
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(loop);
            return true;
        } catch (err) {
            lastError = err?.message || String(err);
            console.warn("SignLive MediaPipe:", lastError);
            return false;
        }
    }

    function stop() {
        running = false;
        cancelAnimationFrame(raf);
        raf = 0;
        lastHand = [];
        handsDetected = 0;
    }

    function snapshot() {
        return {
            landmarks: lastHand.length >= 21 ? lastHand : null,
            handsDetected,
            error: lastError,
            ready: !!landmarker,
        };
    }

    return { start, stop, snapshot };
})();
