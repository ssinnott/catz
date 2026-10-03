// Ambient globals. A plain script-scoped .d.ts (no top-level import/export), so these interfaces
// merge with the DOM's rather than declaring a module of their own.

interface CatzTestHooks {
  /** True once the module graph has loaded and the first frame has drawn. */
  ready: boolean;
  /** Every error the page has thrown, captured by the inline script in index.html. */
  errors: string[];
  /** Name of the screen on top of the stack. */
  screen?: string;
  /** Run `n` fixed steps and one render (test mode only drives the loop through this). */
  step?: (n?: number) => void;
  /** Hold an action down (true) or let it go (false), as if a key were pressed. */
  hold?: (action: string, down: boolean) => void;
  /** Press and release an action on the next step. */
  tap?: (action: string) => void;
  /** Tap the screen at internal canvas coordinates. */
  tapAt?: (x: number, y: number) => void;
  /** Jump straight to a screen by name, for tests and screenshots. */
  goto?: (name: string, arg?: string) => void;
  /** A read-only peek at game state for assertions. */
  peek?: () => Record<string, unknown>;
}

interface Window {
  /** Installed by index.html before the module graph loads; filled in by src/main.ts. */
  __game?: CatzTestHooks;
  /** Safari still ships the prefixed WebAudio constructors; src/lib/audio/facade.ts falls back to them. */
  webkitAudioContext?: typeof AudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
}
