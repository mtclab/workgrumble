export type TickListener = (tick: number) => void;

export class SimClock {
  private tick: number;
  private paused = false;
  private speedMultiplier: number;
  private readonly tickListeners = new Set<TickListener>();

  public constructor(initialTick = 0, speed = 1) {
    if (!Number.isSafeInteger(initialTick) || initialTick < 0) {
      throw new TypeError('Initial tick must be a non-negative safe integer.');
    }

    this.tick = initialTick;
    this.speedMultiplier = this.validateSpeed(speed);
  }

  public get speed(): number {
    return this.speedMultiplier;
  }

  public set speed(value: number) {
    this.speedMultiplier = this.validateSpeed(value);
  }

  public advance(ticks: number): void {
    if (!Number.isSafeInteger(ticks) || ticks < 0) {
      throw new TypeError('Clock advance must be a non-negative safe integer.');
    }

    for (let elapsed = 0; elapsed < ticks && !this.paused; elapsed += 1) {
      this.tick += 1;

      for (const listener of [...this.tickListeners]) {
        listener(this.tick);
      }
    }
  }

  public now(): number {
    return this.tick;
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
  }

  public onTick(listener: TickListener): () => void {
    this.tickListeners.add(listener);
    let subscribed = true;

    return () => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      this.tickListeners.delete(listener);
    };
  }

  private validateSpeed(speed: number): number {
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new TypeError('Clock speed must be a positive finite number.');
    }

    return speed;
  }
}

