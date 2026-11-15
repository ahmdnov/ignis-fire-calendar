import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, RotateCcw, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { BurnIntro } from '../components/BurnIntro';
import { PaperBurnIntro } from './PaperBurnIntro';
import { BURN_TIMELINE, getBurnTimelineState } from './burnTimeline';
import { fireSoundEngine } from './fireSoundEngine';

interface IntroControllerProps {
  /** Called after "Launch Fire Calendar" (the landing has dissolved). */
  onLaunch: () => void;
  rangeLabel?: string;
}

interface IntroFlags {
  isOverlayMounted: boolean;
  isParticleCanvasMounted: boolean;
  isInteractive: boolean;
  isNavVisible: boolean;
}

/**
 * checking: asking the browser whether sound may play (a fraction of a second, burn held at t=0)
 * gate:     sound is blocked until a user gesture, so the fire waits for "click to ignite"
 * run:      the burn clock is running (or the burn was skipped)
 */
type Phase = 'checking' | 'gate' | 'run';

const END_SEC = BURN_TIMELINE.PARTICLE_UNMOUNT_SEC;
const SETTLED: IntroFlags = {
  isOverlayMounted: false,
  isParticleCanvasMounted: false,
  isInteractive: true,
  isNavVisible: true,
};

function flagsAt(t: number): IntroFlags {
  const s = getBurnTimelineState(t);
  return {
    isOverlayMounted: s.isOverlayMounted,
    isParticleCanvasMounted: s.isParticleCanvasMounted,
    isInteractive: s.isInteractive,
    isNavVisible: s.isNavVisible,
  };
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const SOUND_KEY = 'ignis-intro-sound';

/** The visitor's own choice wins: sound stays off only if they turned it off before. */
function readSoundOff(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === 'off';
  } catch {
    return false;
  }
}

function writeSoundOff(off: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, off ? 'off' : 'on');
  } catch {
    // storage blocked: the choice just isn't remembered
  }
}

/**
 * Opening sequence of the landing page: a WebGL fire burns open from the centre and uncovers the
 * IGNIS landing underneath. The clock lives here in a ref, so nothing else re-renders per frame;
 * React state changes only when a discrete phase flips (a handful of times per run).
 *
 * Sound is on by default. Browsers only allow audio after a user gesture, and the burn lasts about
 * five seconds, so when sound is blocked the fire waits on a "click to ignite" screen and the burn
 * and sound start together on that click. Turning sound off is remembered and skips the wait.
 * Reduced motion or missing WebGL skips the burn.
 */
export function IntroController({ onLaunch, rangeLabel }: IntroControllerProps) {
  const [skipBurn, setSkipBurn] = useState<boolean>(prefersReducedMotion);
  const [runKey, setRunKey] = useState(0);
  const [flags, setFlags] = useState<IntroFlags>(() => (prefersReducedMotion() ? SETTLED : flagsAt(0)));
  const [muted, setMuted] = useState<boolean>(readSoundOff);
  const [phase, setPhase] = useState<Phase>(() => (prefersReducedMotion() || readSoundOff() ? 'run' : 'checking'));

  const elapsedRef = useRef<number>(skipBurn ? END_SEC : 0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gateRef = useRef<HTMLButtonElement | null>(null);

  // Ask the browser once whether sound may play now. If yes, burn and sound start together at once.
  useEffect(() => {
    fireSoundEngine.setMuted(readSoundOff());
    let cancelled = false;
    if (phase === 'checking') {
      void fireSoundEngine.canPlayNow().then((ok) => {
        if (cancelled) return;
        if (ok) {
          void fireSoundEngine.playSynced(0);
          setPhase('run');
        } else {
          setPhase('gate');
        }
      });
    }
    return () => {
      cancelled = true;
      fireSoundEngine.stopAll();
    };
    // Runs once on mount; `phase` is only read for its initial value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Burn clock. Held at t=0 until the phase is 'run'.
  useEffect(() => {
    const root = rootRef.current;
    if (skipBurn) {
      elapsedRef.current = END_SEC;
      root?.style.setProperty('--ember-heat', '0');
      setFlags(SETTLED);
      return;
    }
    if (phase !== 'run') return;
    const startTs = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(END_SEC, (now - startTs) / 1000);
      elapsedRef.current = t;
      rootRef.current?.style.setProperty('--ember-heat', getBurnTimelineState(t).emberHeat.toFixed(3));
      const next = t >= END_SEC ? SETTLED : flagsAt(t);
      setFlags((prev) =>
        prev.isOverlayMounted === next.isOverlayMounted &&
        prev.isParticleCanvasMounted === next.isParticleCanvasMounted &&
        prev.isInteractive === next.isInteractive &&
        prev.isNavVisible === next.isNavVisible
          ? prev
          : next
      );
      if (t < END_SEC) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [skipBurn, runKey, phase]);

  /** The gesture that unlocks audio: start the sound inside it, then let the fire go. */
  const ignite = useCallback(() => {
    if (!fireSoundEngine.isMuted()) void fireSoundEngine.playSynced(0);
    setPhase('run');
  }, []);

  const handleSkip = useCallback(() => {
    elapsedRef.current = END_SEC;
    fireSoundEngine.stopAll();
    setSkipBurn(true);
    setPhase('run');
  }, []);

  const enterSilently = useCallback(() => {
    fireSoundEngine.setMuted(true);
    setMuted(true);
    writeSoundOff(true);
    setPhase('run');
  }, []);

  // On the ignite screen any key ignites, except Esc, which skips the intro (handled by BurnIntro).
  useEffect(() => {
    if (phase !== 'gate') return;
    gateRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('.intro-controls, .intro-gate__silent')) return;
      e.preventDefault();
      ignite();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, ignite]);

  const handleReplay = useCallback(() => {
    if (prefersReducedMotion()) return;
    elapsedRef.current = 0;
    setFlags(flagsAt(0));
    setSkipBurn(false);
    setPhase('run');
    setRunKey((k) => k + 1);
    // Replay is a click, so audio is allowed here.
    if (!fireSoundEngine.isMuted()) void fireSoundEngine.playSynced(0);
  }, []);

  const handleToggleSound = useCallback(() => {
    if (phase === 'gate') {
      // Turning sound off on the ignite screen means: just show the fire, no waiting.
      enterSilently();
      return;
    }
    const next = fireSoundEngine.toggleMute(elapsedRef.current);
    setMuted(next);
    writeSoundOff(next);
  }, [phase, enterSilently]);

  const handleLaunch = useCallback(() => {
    fireSoundEngine.stopAll();
    onLaunch();
  }, [onLaunch]);

  const burning = !flags.isInteractive;
  const canReplay = useMemo(() => !prefersReducedMotion(), []);

  return (
    <>
      <BurnIntro
        onDismiss={handleLaunch}
        revealed={flags.isNavVisible}
        burning={burning}
        onSkipBurn={handleSkip}
        rootRef={rootRef}
        rangeLabel={rangeLabel}
      />

      {!skipBurn && (
        <PaperBurnIntro
          key={runKey}
          elapsedRef={elapsedRef}
          isOverlayMounted={flags.isOverlayMounted}
          isParticleCanvasMounted={flags.isParticleCanvasMounted}
          isInteractive={flags.isInteractive}
          onUnsupported={handleSkip}
        />
      )}

      {!skipBurn && phase !== 'run' && (
        <div className={`intro-gate ${phase === 'gate' ? 'intro-gate--ready' : ''}`}>
          {phase === 'gate' && (
            <>
              <button ref={gateRef} type="button" className="intro-gate__hit" onClick={ignite}>
                <span className="intro-gate__flame" aria-hidden="true">
                  <Flame size={30} strokeWidth={1.6} />
                </span>
                <span className="intro-gate__title">
                  <span className="intro-gate__mouse">Click to ignite</span>
                  <span className="intro-gate__touch">Tap to ignite</span>
                </span>
                <span className="intro-gate__sub">
                  <span className="intro-gate__mouse">or press any key · </span>sound on
                </span>
              </button>
              <button type="button" className="intro-gate__silent" onClick={enterSilently}>
                Enter without sound
              </button>
            </>
          )}
        </div>
      )}

      <div className="intro-controls">
        {burning && (
          <button type="button" className="intro-ctl" onClick={handleSkip}>
            <SkipForward size={14} aria-hidden="true" />
            Skip intro
          </button>
        )}
        {!burning && canReplay && (
          <button type="button" className="intro-ctl" onClick={handleReplay}>
            <RotateCcw size={14} aria-hidden="true" />
            Replay intro
          </button>
        )}
        {canReplay && (
          <button
            type="button"
            className="intro-ctl intro-ctl--icon"
            onClick={handleToggleSound}
            aria-pressed={!muted}
            aria-label={muted ? 'Turn fire sound on' : 'Turn fire sound off'}
            title={muted ? 'Sound is off. Turn it on, then replay the intro.' : 'Sound is on. Click to mute.'}
          >
            {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
          </button>
        )}
      </div>
    </>
  );
}
