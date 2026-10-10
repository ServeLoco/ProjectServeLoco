import { createScrollMotionController } from '../src/utils/homeScrollMotion';

const animation = () => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });

describe('Home reserves drawing work for vertical scrolling', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('pauses once per gesture and resumes only after the last scroll event', () => {
    const motion = createScrollMotionController();
    const fire = animation();
    const stop = motion.register(fire);
    expect(fire.start).toHaveBeenCalledTimes(1);
    motion.touch();
    expect(fire.stop).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(100);
    motion.touch();
    jest.advanceTimersByTime(100);
    expect(motion.isScrolling()).toBe(true);
    expect(fire.stop).toHaveBeenCalledTimes(1);
    expect(fire.start).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(80);
    expect(motion.isScrolling()).toBe(false);
    expect(fire.reset).toHaveBeenCalledTimes(1);
    expect(fire.start).toHaveBeenCalledTimes(2);
    stop();
  });

  it('keeps newly revealed rows still until scrolling ends', () => {
    const motion = createScrollMotionController();
    motion.touch();
    const stars = animation();
    const stop = motion.register(stars);
    expect(stars.start).not.toHaveBeenCalled();
    motion.finish();
    expect(stars.start).toHaveBeenCalledTimes(1);
    jest.runOnlyPendingTimers();
    expect(stars.start).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not restart decorations while a slow drag is still held', () => {
    const motion = createScrollMotionController();
    const sky = animation();
    const stop = motion.register(sky);
    motion.beginDrag();
    jest.advanceTimersByTime(1000);
    motion.touch();
    jest.advanceTimersByTime(1000);
    expect(motion.isScrolling()).toBe(true);
    expect(sky.start).toHaveBeenCalledTimes(1);
    expect(sky.stop).toHaveBeenCalledTimes(1);
    motion.endDrag();
    jest.advanceTimersByTime(179);
    expect(sky.start).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(sky.start).toHaveBeenCalledTimes(2);
    stop();
  });

  it('keeps momentum quiet and resumes when no momentum-end arrives', () => {
    const motion = createScrollMotionController();
    const sky = animation();
    const stop = motion.register(sky);
    motion.beginDrag();
    motion.endDrag();
    for (let frame = 0; frame < 10; frame += 1) {
      jest.advanceTimersByTime(100);
      motion.touch();
      expect(sky.start).toHaveBeenCalledTimes(1);
    }
    jest.advanceTimersByTime(180);
    expect(sky.start).toHaveBeenCalledTimes(2);
    stop();
  });

  it('clears a held gesture on navigation cleanup so the next visit can animate', () => {
    const motion = createScrollMotionController();
    const sky = animation();
    const stop = motion.register(sky);
    motion.beginDrag();
    motion.finish();
    expect(motion.isScrolling()).toBe(false);
    motion.touch();
    jest.advanceTimersByTime(180);
    expect(motion.isScrolling()).toBe(false);
    expect(sky.start).toHaveBeenCalledTimes(3);
    stop();
  });

  it('never restarts an animation belonging to an unmounted card', () => {
    const motion = createScrollMotionController();
    const fire = animation();
    const stop = motion.register(fire);
    motion.touch();
    stop();
    jest.runOnlyPendingTimers();
    expect(fire.start).toHaveBeenCalledTimes(1);
  });
});
