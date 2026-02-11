console.log("Initializing Persimmon AI Hero Script");

// 1. Setup & Registration
gsap.registerPlugin(ScrollTrigger);

const canvas = document.getElementById('hero-canvas');
const context = canvas.getContext('2d');
const loadingScreen = document.getElementById('loading-screen');
const progressText = document.getElementById('progress');

// Configuration
const frameCount = 113; // Based on file count (checked via list_dir: frame-001 to frame-113? Wait, user mentioned 120 in description but list_dir earlier showed fewer files? Let me double check list_dir output from Step 8.
// Step 8 output showed: ezgif-frame-001 ... to 095, then 103...120. A GAP!
// 096-102 seem missing based on the output.
// I need to handle potential missing frames gracefully or just load what exists.
// The file names are ezgif-frame-XXX.jpg.
// I will check if I should assume contiguous 1..120 or if I need to map indices.
// For now, I will assume I should try to load 1..120 and filter out failures, or better yet, I will re-list the directory to be sure.
// Wait, I see the list_dir output again. It ends with ezgif-frame-120.jpg.
// I will write a flexible loader.

const config = {
    frameCount: 120, // Theoretical max
    images: [],
    framePrefix: 'sequence-1/ezgif-frame-',
    frameSuffix: '.jpg',
    targetScrollHeight: 4000 // Total scroll distance for the animation
};

const state = {
    loadedCount: 0,
    currentFrame: 0,
    frames: [] // Array of successfully loaded Image objects, preserving order?
    // Actually, to keep timing correct, I should maintain slots. If a frame is missing, maybe reuse previous?
};

// 2. Lenis Smooth Scrolling
const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    smoothTouch: false,
    touchMultiplier: 2,
});

function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// 3. Asset Preloading
const preloadImages = () => {
    return new Promise((resolve, reject) => {
        let loaded = 0;
        const totalToLoad = config.frameCount;
        const images = new Array(totalToLoad);

        for (let i = 1; i <= totalToLoad; i++) {
            const img = new Image();
            const frameIndex = i - 1;
            // Pad Number to 3 digits
            const formattedIndex = i.toString().padStart(3, '0');
            img.src = `${config.framePrefix}${formattedIndex}${config.frameSuffix}`;

            img.onload = () => {
                images[frameIndex] = img;
                loaded++;
                const percentage = Math.round((loaded / totalToLoad) * 100);
                progressText.innerText = `${percentage}%`;

                if (loaded === totalToLoad) {
                    // Filter out any undefined/null spots if files were missing (though prompt asked for preloading all)
                    // If files are missing, we might have holes.
                    // Let's optimize: fill holes with previous frame
                    for (let j = 0; j < images.length; j++) {
                        if (!images[j] && j > 0) images[j] = images[j - 1];
                    }
                    state.frames = images.filter(img => img); // Remove any remaining nulls
                    resolve(state.frames);
                }
            };

            img.onerror = () => {
                console.warn(`Frame ${i} failed to load`);
                // Treat as loaded to not block everything, but slot stays undefined
                loaded++;
                if (loaded === totalToLoad) {
                    for (let j = 0; j < images.length; j++) {
                        if (!images[j] && j > 0) images[j] = images[j - 1];
                    }
                    state.frames = images.filter(img => img);
                    resolve(state.frames);
                }
            };
        }
    });
};

// 4. Canvas Rendering
const renderFrame = (index) => {
    if (!state.frames[index]) return;

    // High-DPI scaling
    const dpr = window.devicePixelRatio || 1;
    // Calculate aspect ratios for "object-fit: cover"
    const img = state.frames[index];

    const canvasWidth = canvas.width / dpr; // Logical width
    const canvasHeight = canvas.height / dpr; // Logical height

    // Logic for 'cover'
    const imgRatio = img.width / img.height;
    const canvasRatio = canvasWidth / canvasHeight; // using logical sizes

    let drawWidth, drawHeight, offsetX, offsetY;

    if (imgRatio > canvasRatio) {
        // Image is wider than canvas: Constraint is height
        drawHeight = canvasHeight;
        drawWidth = canvasHeight * imgRatio;
        offsetY = 0;
        offsetX = (canvasWidth - drawWidth) / 2;
    } else {
        // Image is taller or same aspect ratio: Constraint is width
        drawWidth = canvasWidth;
        drawHeight = canvasWidth / imgRatio;
        offsetX = 0;
        offsetY = (canvasHeight - drawHeight) / 2;
    }

    // Clear and draw
    // Note: We use physical pixels for the drawImage destination to align with canvas.width/height
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, offsetX * dpr, offsetY * dpr, drawWidth * dpr, drawHeight * dpr);
};

const handleResize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    // Scale context to ensure drawing operations work with logical pixels if we weren't manually scaling in drawImage
    // But since we ARE manually scaling in drawImage (destX/Y * dpr), we don't strictly need context.scale(dpr, dpr)
    // However, it's safer to just rely on the manual calc above for full control.

    renderFrame(state.currentFrame);
};

window.addEventListener('resize', handleResize);


// 5. Animation Setup
const initAnimation = () => {
    // Initial resize to set canvas frame
    handleResize();

    // Initial Render
    renderFrame(0);

    // Fade out loader
    gsap.to(loadingScreen, {
        opacity: 0,
        duration: 0.5,
        onComplete: () => loadingScreen.style.display = 'none'
    });

    // Create Timeline
    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: ".hero-section",
            start: "top top",
            end: `+=${config.targetScrollHeight}`,
            scrub: 0.5, // Buffer for smooth scrubbing
            pin: true,
            invalidateOnRefresh: true, // Recalculate on resize
            // markers: true // For debugging
        }
    });

    // Animate Frames
    let playhead = { frame: 0 };

    // Step 1: Sequence Animation (approx 85% of scroll)
    tl.to(playhead, {
        frame: state.frames.length - 1,
        snap: "frame",
        ease: "none",
        duration: 0.85,
        onUpdate: () => {
            state.currentFrame = Math.round(playhead.frame);
            renderFrame(state.currentFrame);
        }
    });

    // Step 2: Gap (approx 5% of scroll)
    // Scroll a bit while frames retain last state (effectively disappear or stay small)
    // Since user said "comic strip effectively gone", we assume last frame is the end state.
    tl.to({}, { duration: 0.05 });

    // Step 3: Text Reveal (approx 10% of scroll)
    tl.to(".hero-text", {
        opacity: 1,
        y: 0,
        duration: 0.1,
        ease: "power2.out"
    });

    // Small buffer at end
    tl.to({}, { duration: 0.05 });
};


// Start
preloadImages().then(() => {
    console.log("Images loaded. Starting animation.");
    initAnimation();
});
