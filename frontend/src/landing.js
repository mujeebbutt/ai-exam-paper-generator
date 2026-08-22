// Landing Page Interactivity Controller — scroll-reveal, count-up numbers, SVG chart draw-in,
// hero mouse-parallax, and the hero's simulated exam-taking demo loop. Scoped entirely to the
// Landing page; everything here is purely presentational (no real data, no backend calls) and
// every animation respects prefers-reduced-motion by skipping straight to its end state.

document.addEventListener('DOMContentLoaded', () => {

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------------------------------------------------------------------
    // Scroll reveal — fade/slide any .reveal element in once it enters view.
    // ---------------------------------------------------------------------
    function initScrollReveal() {
        const els = document.querySelectorAll('.reveal');
        if (els.length === 0) return;
        if (reduceMotion) { els.forEach(el => el.classList.add('reveal-in')); return; }
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('reveal-in');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
        els.forEach(el => io.observe(el));
    }

    // ---------------------------------------------------------------------
    // Count-up numbers — any element with data-count-to="92" (+ optional
    // data-count-suffix="%") counts up from 0 once it scrolls into view.
    // ---------------------------------------------------------------------
    function initCountUp() {
        const els = document.querySelectorAll('[data-count-to]');
        if (els.length === 0) return;

        function animate(el) {
            const to = parseFloat(el.dataset.countTo);
            const suffix = el.dataset.countSuffix || '';
            if (reduceMotion || isNaN(to)) { el.textContent = to + suffix; return; }
            const duration = 1400;
            const start = performance.now();
            function tick(now) {
                const p = Math.min(1, (now - start) / duration);
                const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
                el.textContent = Math.round(to * eased) + suffix;
                if (p < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        }

        if (reduceMotion) { els.forEach(animate); return; }
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) { animate(entry.target); io.unobserve(entry.target); }
            });
        }, { threshold: 0.5 });
        els.forEach(el => io.observe(el));
    }

    // ---------------------------------------------------------------------
    // SVG chart draw-in — any <path class="chart-draw-path"> animates its
    // stroke in once visible (see .chart-draw-path / .chart-draw-in in CSS).
    // ---------------------------------------------------------------------
    function initChartDraw() {
        const paths = document.querySelectorAll('.chart-draw-path');
        if (paths.length === 0) return;
        if (reduceMotion) { paths.forEach(p => p.classList.add('chart-draw-in')); return; }
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) { entry.target.classList.add('chart-draw-in'); io.unobserve(entry.target); }
            });
        }, { threshold: 0.4 });
        paths.forEach(p => io.observe(p));
    }

    // ---------------------------------------------------------------------
    // Hero mouse parallax — sets --mx/--my custom properties on #landing-hero
    // (roughly -0.5..0.5); the actual transforms live in CSS, gated by
    // :hover, so movement always eases back to rest on mouse-leave for free.
    // ---------------------------------------------------------------------
    function initHeroParallax() {
        if (reduceMotion) return;
        const hero = document.getElementById('landing-hero');
        if (!hero) return;
        let raf = null;
        hero.addEventListener('mousemove', (e) => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                const rect = hero.getBoundingClientRect();
                const mx = (e.clientX - rect.left) / rect.width - 0.5;
                const my = (e.clientY - rect.top) / rect.height - 0.5;
                hero.style.setProperty('--mx', mx.toFixed(3));
                hero.style.setProperty('--my', my.toFixed(3));
                raf = null;
            });
        });
    }

    // ---------------------------------------------------------------------
    // Hero simulated exam demo — cycles the mockup through a few canned
    // questions so the product preview looks like it's actually running,
    // not a static screenshot. Purely cosmetic; no real grading involved.
    // ---------------------------------------------------------------------
    const HERO_DEMO = [
        { subject: 'Biology — Chapter 4', num: 'Question 07/20', progress: 35, score: 92,
          q: 'Which process is primarily responsible for producing ATP in the cell?',
          options: ['Photosynthesis', 'Cellular respiration', 'Transcription', 'Translation'], correct: 1 },
        { subject: 'Biology — Chapter 4', num: 'Question 08/20', progress: 40, score: 88,
          q: 'Which organelle is known as the powerhouse of the cell?',
          options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi apparatus'], correct: 2 },
        { subject: 'Biology — Chapter 4', num: 'Question 09/20', progress: 45, score: 95,
          q: 'DNA replication occurs during which phase of the cell cycle?',
          options: ['G1 phase', 'S phase', 'Prophase', 'Telophase'], correct: 1 },
        { subject: 'Biology — Chapter 4', num: 'Question 10/20', progress: 50, score: 90,
          q: 'What type of bond holds the two strands of a DNA double helix together?',
          options: ['Ionic bond', 'Covalent bond', 'Hydrogen bond', 'Metallic bond'], correct: 2 },
    ];
    let heroCycleIndex = 0;
    let heroTimer = null;
    let heroGenTimer = null;

    function renderHeroOptions(root, data) {
        const optWrap = root.querySelector('#hero-mock-options');
        if (!optWrap) return;
        optWrap.querySelectorAll('.hero-mockup-option').forEach((optEl, i) => {
            const label = optEl.querySelector('.hero-mock-opt-label');
            if (label) label.textContent = data.options[i];
            const isSelected = i === data.correct;
            optEl.classList.toggle('hero-mockup-option--selected', isSelected);
            optEl.classList.toggle('bg-white/5', !isSelected);
            optEl.classList.toggle('border', !isSelected);
            optEl.classList.toggle('border-white/10', !isSelected);
            optEl.classList.toggle('text-white/50', !isSelected);
            optEl.classList.toggle('text-white', isSelected);
            const dot = optEl.querySelector('span');
            if (!dot) return;
            if (isSelected) {
                dot.className = 'w-[18px] h-[18px] rounded-full border-2 border-primary bg-primary shrink-0 flex items-center justify-center';
                dot.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-white"></span>';
            } else {
                dot.className = 'w-[18px] h-[18px] rounded-full border-2 border-white/20 shrink-0';
                dot.innerHTML = '';
            }
        });
    }

    function animateScoreTo(target) {
        const valueEl = document.getElementById('hero-score-value');
        const labelEl = document.getElementById('hero-score-label');
        if (!valueEl) return;
        const label = target >= 90 ? 'Excellent' : target >= 75 ? 'Good' : 'Needs Review';
        if (labelEl) labelEl.textContent = label;
        if (reduceMotion) { valueEl.textContent = target + '%'; return; }
        const start = performance.now();
        const duration = 900;
        const from = parseInt(valueEl.textContent, 10) || 0;
        function tick(now) {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            valueEl.textContent = Math.round(from + (target - from) * eased) + '%';
            if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    // Brief "Generating..." pulse on the AI-generation card each cycle, then back to Ready —
    // communicates the generation step without a second, separate persistent card.
    function runGenPulse() {
        const icon = document.getElementById('hero-gen-icon');
        const label = document.getElementById('hero-gen-label');
        const value = document.getElementById('hero-gen-value');
        const fill = document.getElementById('hero-gen-fill');
        if (!label || !value || !fill) return;
        clearTimeout(heroGenTimer);

        if (reduceMotion) { label.textContent = 'AI Generated'; value.textContent = '20 Questions'; fill.style.width = '100%'; return; }

        label.textContent = 'AI Generating';
        value.textContent = 'New question...';
        fill.style.transition = 'none';
        fill.style.width = '0%';
        icon?.classList.add('animate-pulse');
        // Force reflow so the width:0% actually takes before animating to 100%.
        void fill.offsetWidth;
        fill.style.transition = 'width 1.1s cubic-bezier(0.2,0.8,0.2,1)';
        fill.style.width = '100%';

        heroGenTimer = setTimeout(() => {
            label.textContent = 'AI Generated';
            value.textContent = '20 Questions';
            icon?.classList.remove('animate-pulse');
        }, 1200);
    }

    function showCorrectBadge() {
        const badge = document.getElementById('hero-mock-correct');
        if (!badge) return;
        badge.classList.add('is-visible');
        setTimeout(() => badge.classList.remove('is-visible'), 1600);
    }

    function renderHeroDemo(data) {
        const root = document.getElementById('hero-mockup-root');
        if (!root) return;
        const subjectEl = root.querySelector('#hero-mock-subject');
        const numEl = root.querySelector('#hero-mock-num');
        const progressEl = root.querySelector('#hero-mock-progress');
        const questionEl = root.querySelector('#hero-mock-question');
        const optionsEl = root.querySelector('#hero-mock-options');

        if (subjectEl) subjectEl.textContent = data.subject;
        if (numEl) numEl.textContent = data.num;
        if (progressEl) progressEl.style.width = data.progress + '%';
        if (questionEl) questionEl.textContent = data.q;
        renderHeroOptions(root, data);
        animateScoreTo(data.score);

        if (!reduceMotion) {
            [questionEl, optionsEl].forEach(el => el?.classList.remove('hero-mock-fade--out'));
            showCorrectBadge();
        }
    }

    function advanceHeroDemo() {
        const root = document.getElementById('hero-mockup-root');
        if (!root) return;
        const questionEl = root.querySelector('#hero-mock-question');
        const optionsEl = root.querySelector('#hero-mock-options');

        heroCycleIndex = (heroCycleIndex + 1) % HERO_DEMO.length;
        const data = HERO_DEMO[heroCycleIndex];

        if (reduceMotion) { renderHeroDemo(data); return; }

        // Fade the question + options out, swap content, fade back in — a soft crossfade
        // rather than an abrupt content swap.
        questionEl?.classList.add('hero-mock-fade--out');
        optionsEl?.classList.add('hero-mock-fade--out');
        runGenPulse();
        setTimeout(() => renderHeroDemo(data), 350);
    }

    function startHeroCycle() {
        if (heroTimer || reduceMotion) return;
        heroTimer = setInterval(advanceHeroDemo, 5500);
    }
    function stopHeroCycle() {
        clearInterval(heroTimer);
        clearTimeout(heroGenTimer);
        heroTimer = null;
    }
    // Exposed so generate.js's switchPage() can start/stop the loop as the visitor navigates to and
    // away from Landing, rather than letting an interval run forever in the background.
    window.startLandingHero = startHeroCycle;
    window.stopLandingHero = stopHeroCycle;

    // ---------------------------------------------------------------------
    // FAQ accordion — same chevron-rotate idiom as attempt.js's toggleWhyScore,
    // but the panel itself animates open/closed via a CSS grid-rows trick
    // (`.faq-answer-wrap` / `is-open`, see style.css) instead of an abrupt
    // `hidden` toggle, so expand/collapse is a smooth ~280ms height tween.
    // Multiple items can be open at once (faq-1 starts pre-opened in the HTML);
    // opening/closing one never affects the others.
    // ---------------------------------------------------------------------
    window.toggleFaq = (id) => {
        const wrap = document.getElementById(id + '-wrap');
        const chevron = document.getElementById(id + '-chevron');
        const item = wrap ? wrap.closest('.faq-item') : null;
        if (!wrap) return;
        const opening = !wrap.classList.contains('is-open');
        wrap.classList.toggle('is-open', opening);
        if (item) item.classList.toggle('faq-item--open', opening);
        if (chevron) chevron.classList.toggle('faq-chevron--open', opening);
    };

    // ---------------------------------------------------------------------
    // Scroll-spy — highlights the nav link for whichever landing section is
    // currently most in view, so the persistent header hints at where you
    // are on the page as you scroll.
    // ---------------------------------------------------------------------
    function initScrollSpy() {
        const scroller = document.querySelector('#page-landing .overflow-y-auto');
        const navLinks = document.querySelectorAll('#landing-nav [data-section-link]');
        if (!scroller || navLinks.length === 0) return;
        const sections = Array.from(navLinks)
            .map(link => document.getElementById(link.dataset.sectionLink))
            .filter(Boolean);
        if (sections.length === 0) return;

        function setActive(id) {
            navLinks.forEach(link => {
                link.classList.toggle('text-white', link.dataset.sectionLink === id);
                link.classList.toggle('text-white/50', link.dataset.sectionLink !== id);
            });
        }

        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) setActive(entry.target.id);
            });
        }, { root: scroller, threshold: 0, rootMargin: '-45% 0px -50% 0px' });
        sections.forEach(el => io.observe(el));
    }

    // ---------------------------------------------------------------------
    // Why-UstadExam transformation line — plays once when the section enters
    // view: "Retype → Format → Check → Track" (dim) swaps word-by-word,
    // staggered, into "Upload → Generate → Grade → Track" (bright).
    // ---------------------------------------------------------------------
    function initTransformLine() {
        const line = document.getElementById('transform-line');
        if (!line) return;
        const words = line.querySelectorAll('.transform-word');
        if (words.length === 0) return;

        function play() {
            words.forEach((word, i) => {
                setTimeout(() => {
                    word.textContent = word.dataset.new;
                    word.classList.add('is-transformed');
                }, reduceMotion ? 0 : i * 350);
            });
        }

        if (reduceMotion) { play(); return; }
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) { play(); io.unobserve(entry.target); }
            });
        }, { threshold: 0.6 });
        io.observe(line);
    }

    // ---------------------------------------------------------------------
    // Features section connector — a smooth pink glowing path threading
    // through the 4 alternating feature icons, scroll-scrubbed (not a
    // one-shot reveal): undrawn at the top of the section, fully drawn by
    // the bottom, and reverses cleanly on scroll-up since it's driven by a
    // continuous scroll-position calculation rather than an IntersectionObserver
    // trigger. Desktop only (lg:) — the icons stack in a single column below
    // that breakpoint, so a connecting path doesn't add anything there.
    // No animation library added — plain SVG path math + rAF-throttled scroll.
    // ---------------------------------------------------------------------
    function initFeaturesConnector() {
        const section = document.getElementById('features');
        const svg = document.getElementById('features-connector-svg');
        const glowPath = document.getElementById('features-connector-glow-path');
        const path = document.getElementById('features-connector-path');
        const pulse = document.getElementById('features-connector-pulse');
        const icons = [1, 2, 3, 4].map(n => document.getElementById(`feature-icon-${n}`));
        const scroller = document.querySelector('#page-landing .overflow-y-auto');
        if (!section || !svg || !path || !icons.every(Boolean) || !scroller) return;
        if (window.innerWidth < 1024) return; // matches the SVG's own lg:block gating

        let pathLength = 0;
        let enterScrollTop = 0;
        let exitScrollTop = 0;
        let ticking = false;

        // Catmull-Rom -> cubic Bezier conversion, so a path threaded through many points (the
        // icon anchors plus the wave points inserted between them) flows smoothly instead of
        // kinking at every point — this is what makes the organic, hand-drawn "circuit trace"
        // look possible instead of a rigid one-arc-per-hop connector.
        function catmullRomPath(pts) {
            if (pts.length < 2) return '';
            let d = `M ${pts[0].x} ${pts[0].y}`;
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[i - 1] || pts[i];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[i + 2] || p2;
                const c1x = p1.x + (p2.x - p0.x) / 6;
                const c1y = p1.y + (p2.y - p0.y) / 6;
                const c2x = p2.x - (p3.x - p1.x) / 6;
                const c2y = p2.y - (p3.y - p1.y) / 6;
                d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
            }
            return d;
        }

        // Inserts a handful of points between two anchors, offset side-to-side along a sine
        // wave perpendicular to the A->B direction — the source of the organic wiggle. Amplitude
        // tapers to 0 at both ends so the path still lands exactly on each icon center.
        function wavyPointsBetween(a, b, waveCount = 2, amplitude = 46) {
            const dx = b.x - a.x, dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len, ny = dx / len; // unit perpendicular
            const steps = 8;
            const pts = [];
            for (let s = 1; s < steps; s++) {
                const t = s / steps;
                const taper = Math.sin(Math.PI * t); // 0 at t=0/1, 1 at t=0.5 — keeps endpoints clean
                const wave = Math.sin(t * Math.PI * 2 * waveCount) * amplitude * taper;
                pts.push({ x: a.x + dx * t + nx * wave, y: a.y + dy * t + ny * wave });
            }
            return pts;
        }

        function buildPath() {
            const sectionRect = section.getBoundingClientRect();
            const scrollerRect = scroller.getBoundingClientRect();
            // Anchor everything to the current scroll position so section-relative
            // coordinates stay correct regardless of where the page has scrolled to.
            const originY = sectionRect.top;
            const anchors = icons.map(icon => {
                const r = icon.getBoundingClientRect();
                return { x: r.left + r.width / 2 - sectionRect.left, y: r.top + r.height / 2 - originY };
            });

            svg.setAttribute('width', sectionRect.width);
            svg.setAttribute('height', sectionRect.height);
            svg.setAttribute('viewBox', `0 0 ${sectionRect.width} ${sectionRect.height}`);

            // Build the full point sequence: icon -> wave points -> icon -> wave points -> ...
            // Wave amplitude is capped relative to how far apart the icons actually are so it
            // never overshoots the section on narrower viewports.
            const points = [anchors[0]];
            for (let i = 0; i < anchors.length - 1; i++) {
                const a = anchors[i], b = anchors[i + 1];
                const amplitude = Math.min(46, Math.hypot(b.x - a.x, b.y - a.y) * 0.16);
                points.push(...wavyPointsBetween(a, b, 2, amplitude));
                points.push(b);
            }

            const d = catmullRomPath(points);
            path.setAttribute('d', d);
            glowPath.setAttribute('d', d);
            pathLength = path.getTotalLength();
            path.setAttribute('stroke-dasharray', pathLength);
            glowPath.setAttribute('stroke-dasharray', pathLength);

            // Progress starts as soon as the section itself begins entering the viewport (not
            // "icon 1 is visible" — icon 1 sits well below the section's own heading/intro
            // text, so gating on it meant clicking "Features" in the nav landed you on the
            // heading with nothing drawn yet and no feedback until you scrolled further) and
            // finishes once the last icon reaches the top of the viewport — not "scrolled the
            // entire, much-taller-than-one-screen section," which was the original bug: that
            // denominator meant the line stayed at 0% for a long stretch after arriving.
            const scrollerHeight = scroller.clientHeight;
            const sectionAbsTop = scroller.scrollTop + (sectionRect.top - scrollerRect.top);
            const iconLastAbsY = scroller.scrollTop + (icons[icons.length - 1].getBoundingClientRect().top - scrollerRect.top);
            enterScrollTop = sectionAbsTop - scrollerHeight;
            exitScrollTop = iconLastAbsY;
        }

        function applyProgress(progress) {
            const drawn = pathLength * progress;
            const offset = pathLength - drawn;
            path.setAttribute('stroke-dashoffset', offset);
            glowPath.setAttribute('stroke-dashoffset', offset);
            if (drawn > 0 && pulse) {
                const pt = path.getPointAtLength(drawn);
                pulse.setAttribute('cx', pt.x);
                pulse.setAttribute('cy', pt.y);
                pulse.style.opacity = progress > 0.02 && progress < 0.99 ? '1' : '0';
            } else if (pulse) {
                pulse.style.opacity = '0';
            }
        }

        function update() {
            ticking = false;
            const raw = (scroller.scrollTop - enterScrollTop) / Math.max(1, exitScrollTop - enterScrollTop);
            const progress = Math.max(0, Math.min(1, raw));
            applyProgress(progress);
        }

        function onScroll() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(update);
        }

        function rebuild() {
            buildPath();
            update();
        }

        if (reduceMotion) {
            buildPath();
            applyProgress(1); // fully drawn, static — no scroll-tied motion, no traveling pulse
            if (pulse) pulse.style.opacity = '0';
            return;
        }

        rebuild();
        scroller.addEventListener('scroll', onScroll, { passive: true });
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(rebuild, 200);
        });
    }

    initScrollReveal();
    initCountUp();
    initChartDraw();
    initHeroParallax();
    initScrollSpy();
    initTransformLine();
    initFeaturesConnector();
    if (document.getElementById('page-landing')?.classList.contains('active')) startHeroCycle();

    console.log('✅ Landing controller initialized.');
});
